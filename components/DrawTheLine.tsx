"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Chart } from "@/components/Chart";
import { ShareResult } from "@/components/ShareResult";
import { useDrawingSurface } from "@/components/useDrawingSurface";
import { useElementSize } from "@/components/useElementSize";
import { createGeometry } from "@/lib/chart/geometry";
import {
  PATH_POINTS,
  dequantize,
  quantize,
  resampleStroke,
  strokeSpanFraction,
  type StrokePoint,
} from "@/lib/drawing/resample";
import { scoreGuess, truthPathNormalized, type ScoreResult } from "@/lib/scoring/score";
import { syntheticCrowd } from "@/lib/crowd/synthetic";
import { compareToCrowd, describeComparison } from "@/lib/crowd/compare";
import { submitGuess } from "@/lib/client/submit-guess";
import { fetchCrowd, type CrowdResult } from "@/lib/client/fetch-crowd";
import type { Dataset } from "@/lib/types/dataset";

/** The stroke must cover this much of the drawable width to count. */
const MIN_SPAN_FRACTION = 0.8;

/** How many fake paths the design preview generates. */
const PREVIEW_CROWD_SIZE = 400;

/**
 * Opt in to the ink-density design preview with ?preview=crowd.
 *
 * Read from the URL on the client rather than through searchParams, which
 * would make the whole page dynamically rendered for the sake of a flag that
 * only exists to look at.
 */
function usePreviewCrowd(): boolean {
  return useSyncExternalStore(
    // The flag cannot change without a navigation, so there is nothing to
    // subscribe to.
    () => () => {},
    () =>
      new URLSearchParams(window.location.search).get("preview") === "crowd",
    // On the server the preview is always off, so the markup never ships with
    // fabricated data in it.
    () => false,
  );
}

type Status = "idle" | "ready" | "revealed";

/** Where the guess got to on its way to the database. */
type Submission =
  | { state: "idle" }
  | { state: "stored"; guessId: number; datasetGuessNumber: number }
  /**
   * Never written, by design. Two cases reach this: an anonymous guess on a
   * no-account intro dataset, and an admin preview play (record={false}),
   * which does not even send the request.
   */
  | { state: "not-persisted" }
  | { state: "failed"; error: string };

/** Where the crowd view got to on its way from the database. */
type Crowd =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "loaded"; value: CrowdResult }
  | { state: "failed" };

function formatSigned(value: number): string {
  const rounded = value.toFixed(3);
  return value > 0 ? `+${rounded}` : rounded;
}

export function DrawTheLine({
  dataset,
  onRevealed,
  onSubmitSettled,
  barLabel,
  record = true,
}: {
  dataset: Dataset;
  /** Fires once, at the moment reveal starts - not tied to network success. */
  onRevealed?: () => void;
  /**
   * Fires once the guess-recording request has actually resolved (stored,
   * not-persisted, or failed) - unlike onRevealed, this IS tied to network
   * completion. Callers that need to know the write really landed before
   * moving on (e.g. SignedInPlay deciding it is safe to ask the server for
   * the next unanswered chart) should use this instead of onRevealed.
   */
  onSubmitSettled?: (persisted: boolean) => void;
  /**
   * Left half of the yellow strip across the top of the card - e.g.
   * "Chart 1 of 2". Defaults to a plain label when the caller
   * has nothing more specific to say about where this chart sits.
   */
  barLabel?: string;
  /**
   * When false the guess is never submitted - the request is not sent at all,
   * rather than sent and discarded. Admin preview only, and set in exactly one
   * place: components/AdminPreviewPlay.tsx.
   *
   * Not a flag on POST /api/guess on purpose. A "do not record this" field in
   * the request body would be a client-controlled opt-out of recording, which
   * is a worse thing to have in the system than the problem it solves. Not
   * sending is provably unrecordable; sending with a flag is only
   * conditionally unrecorded.
   *
   * Everything else is identical to a real play: local scoring, the reveal,
   * the crowd view. The point of a preview is to see what a player sees.
   */
  record?: boolean;
}) {
  const { ref: surfaceRef, size } = useElementSize<SVGSVGElement>();
  const previewCrowd = usePreviewCrowd();

  // Rebuilt from a freshly measured size on every resize and rotation. Nothing
  // downstream of this survives a layout change.
  const geometry = useMemo(
    () => (size ? createGeometry(dataset, size) : null),
    [dataset, size],
  );

  const [status, setStatus] = useState<Status>("idle");
  const [hint, setHint] = useState<string | null>(null);
  const [storedPath, setStoredPath] = useState<number[] | null>(null);
  const [drawMs, setDrawMs] = useState(0);
  const [redrawCount, setRedrawCount] = useState(0);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [showScore, setShowScore] = useState(false);
  const [submission, setSubmission] = useState<Submission>({ state: "idle" });
  const [crowd, setCrowd] = useState<Crowd>({ state: "idle" });
  /** Server-side judgement that this guess was deliberate junk. See low-effort.ts. */
  const [notice, setNotice] = useState<string | null>(null);

  const scoreTimer = useRef<number | null>(null);
  const hasGuessRef = useRef(false);

  useEffect(
    () => () => {
      if (scoreTimer.current !== null) window.clearTimeout(scoreTimer.current);
    },
    [],
  );

  const handleStart = useCallback(() => {
    // Starting a fresh stroke over a finished one is a redraw, the same as
    // pressing the button.
    if (hasGuessRef.current) {
      hasGuessRef.current = false;
      setRedrawCount((count) => count + 1);
    }
    setStoredPath(null);
    setStatus("idle");
    setHint(null);
  }, []);

  const handleFinish = useCallback(
    (stroke: StrokePoint[], elapsedMs: number) => {
      if (!geometry) return;

      const span = strokeSpanFraction(
        stroke,
        geometry.drawStartX,
        geometry.drawEndX,
      );

      if (span < MIN_SPAN_FRACTION) {
        setHint("Draw all the way to the end.");
        setStatus("idle");
        return;
      }

      const pixelYs = resampleStroke(
        stroke,
        geometry.drawStartX,
        geometry.drawEndX,
        PATH_POINTS,
      );

      setStoredPath(quantize(pixelYs.map(geometry.unitForY)));
      setDrawMs(elapsedMs);
      setHint(null);
      setStatus("ready");
      hasGuessRef.current = true;
    },
    [geometry],
  );

  const { stroke, handlers, reset } = useDrawingSurface({
    geometry,
    enabled: status !== "revealed",
    onStart: handleStart,
    onFinish: handleFinish,
  });

  const guessUnits = useMemo(
    () => (storedPath ? dequantize(storedPath) : null),
    [storedPath],
  );

  /*
   * FABRICATED, design preview only, behind ?preview=crowd - see
   * lib/crowd/synthetic.ts. Takes priority over real data so the preview
   * stays usable for design regression regardless of what is in the database.
   *
   * Otherwise, once the real crowd has loaded and cleared the cold-start
   * threshold, this is a live sample of real paths, dequantized from the
   * stored 0..1000 scale to the 0..1 units Chart expects - the exact same
   * ink layer Phase 2 built, now carrying real data instead of synthetic.
   */
  const crowdPaths = useMemo(() => {
    if (previewCrowd) {
      if (status !== "revealed") return [];
      return syntheticCrowd({
        truth: truthPathNormalized(dataset, PATH_POINTS),
        count: PREVIEW_CROWD_SIZE,
      });
    }
    if (crowd.state === "loaded" && !crowd.value.belowThreshold) {
      return crowd.value.sample.map((path) => dequantize(path));
    }
    return [];
  }, [crowd, dataset, previewCrowd, status]);

  /** Same comparison, computed once the real crowd is in. Never for preview data. */
  const comparison = useMemo(() => {
    if (previewCrowd || !storedPath) return null;
    if (crowd.state !== "loaded" || crowd.value.belowThreshold) return null;

    const truthQuantized = quantize(truthPathNormalized(dataset, PATH_POINTS));
    return compareToCrowd(
      storedPath,
      truthQuantized,
      crowd.value.percentiles,
      crowd.value.n,
    );
  }, [crowd, dataset, previewCrowd, storedPath]);

  const handleRedraw = useCallback(() => {
    reset();
    setStoredPath(null);
    setStatus("idle");
    setHint(null);
    setRedrawCount((count) => count + 1);
    setSubmission({ state: "idle" });
    setCrowd({ state: "idle" });
    hasGuessRef.current = false;
  }, [reset]);

  const handleReveal = useCallback(() => {
    if (!storedPath || !guessUnits) return;

    // Computed locally so the reveal never waits on the network. The server
    // recomputes from its own copy of the truth and its answer wins.
    const local = scoreGuess(guessUnits, truthPathNormalized(dataset, PATH_POINTS));

    setResult(local);
    setStatus("revealed");
    onRevealed?.();

    /*
     * Admin preview: the request is never made at all. onSubmitSettled is not
     * called either - nothing settled, because nothing was sent, and the only
     * caller that listens to it (SignedInPlay) uses it to decide a chart has
     * been genuinely answered.
     */
    if (!record) {
      setSubmission({ state: "not-persisted" });
    } else {
      void submitGuess({
        slug: dataset.slug,
        path: storedPath,
        drawMs,
        redrawCount,
        viewportWidth: window.innerWidth,
      }).then((outcome) => {
        if (!outcome.ok) {
          setSubmission({ state: "failed", error: outcome.error });
          onSubmitSettled?.(false);
          return;
        }

        setNotice(outcome.value.notice ?? null);

        setSubmission(
          outcome.value.persisted &&
            outcome.value.guessId !== null &&
            outcome.value.datasetGuessNumber !== null
            ? {
                state: "stored",
                guessId: outcome.value.guessId,
                datasetGuessNumber: outcome.value.datasetGuessNumber,
              }
            : { state: "not-persisted" },
        );
        /*
         * Report whether the guess actually LANDED, not merely that the
         * request finished. The caller uses this to remember which charts it
         * has really answered, so it can tell a stale cached page (which still
         * shows an answered chart as fresh) from a genuine re-serve after a
         * failed write. Passing `true` on a failure would make a failed write
         * look answered and hide the chart the player still needs to draw.
         */
        onSubmitSettled?.(outcome.value.persisted === true);

        // The two should agree exactly: same maths, same quantised path, same
        // series. If they ever do not, something has drifted and it matters -
        // the stored number is the one the research is built on.
        if (outcome.value.score !== local.score) {
          console.warn(
            "[draw-the-line] client and server scores disagree",
            { client: local.score, server: outcome.value.score },
          );
        }

        setResult({
          score: outcome.value.score,
          meanAbsError: outcome.value.meanAbsError,
          meanSignedError: outcome.value.meanSignedError,
        });
      });
    }

    // Independent of guess submission, and never blocking the reveal. A slow
    // or failed crowd fetch degrades to no crowd section, nothing more - the
    // score panel above never waits on it.
    if (!previewCrowd) {
      setCrowd({ state: "loading" });
      void fetchCrowd(dataset.slug).then((outcome) => {
        setCrowd(
          outcome.ok
            ? { state: "loaded", value: outcome.value }
            : { state: "failed" },
        );
      });
    }

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reduceMotion) {
      setShowScore(true);
    } else {
      scoreTimer.current = window.setTimeout(() => setShowScore(true), 900);
    }
  }, [dataset, drawMs, guessUnits, onRevealed, onSubmitSettled, previewCrowd, record, redrawCount, storedPath]);

  const lastKnownYear = dataset.xValues[dataset.revealFromIndex];
  const described = comparison ? describeComparison(comparison) : null;

  return (
    /*
     * The bordered white panel with a yellow label strip and a heavy violet
     * offset, from the design mock. `barLabel` is what the strip says on the
     * right; the left half names where this chart sits in the run.
     */
    <article className="chart-card">
      <div className="chart-card-bar">
        <span>{barLabel ?? "Draw the line"}</span>
        <span>{dataset.sourceName}</span>
      </div>

      <div className="chart-card-body">
        {/*
          Trimmed 2026-08-27: "decrease the amount of unnecessary text during
          the game, text takes too much space."
          - The source name used to lead here AND appear in the footer. It now
            appears once, in the strip above.
          - The separate "Drag from <year> to the right edge" hint duplicated
            the question's own "Draw what happened after <year>". The status
            line below only speaks when it has something new to say.
        */}
        <header className="stack-2">
          <h1 className="title">{dataset.title}</h1>
          <p className="question">{dataset.question}</p>
        </header>

        {previewCrowd ? (
          <p className="note">
            Synthetic preview. The {PREVIEW_CROWD_SIZE} faint paths shown at
            reveal are generated by an algorithm to test the ink-density
            rendering. They are not responses from real people and mean nothing.
          </p>
        ) : null}

        <div className="chart-frame">
        <Chart
          dataset={dataset}
          geometry={geometry}
          stroke={stroke}
          guessUnits={guessUnits}
          crowdPaths={crowdPaths}
          revealed={status === "revealed"}
          locked={status === "revealed"}
          handlers={handlers}
          surfaceRef={surfaceRef}
        />
      </div>

      <div className="stack-4">
        <div className="controls">
          <button
            type="button"
            className="button button--primary"
            onClick={handleReveal}
            disabled={status !== "ready"}
          >
            Reveal
          </button>
          <button
            type="button"
            className="button"
            onClick={handleRedraw}
            disabled={status === "revealed" || (!storedPath && stroke.length === 0)}
          >
            Redraw
          </button>
          {/*
            Only once there is a result to share. Rendering a disabled Share
            alongside the other two would put a dead control in the row for
            the whole time someone is drawing, and the score is the thing
            being shared - before the reveal there is nothing to send.
          */}
          {status === "revealed" && result ? (
            <ShareResult
              slug={dataset.slug}
              title={dataset.title}
              score={result.score}
            />
          ) : null}
        </div>

        {/*
          Only renders when there is something to say. Previously it always
          held a line of text - including one that just restated the
          question - so it cost a permanent row of vertical space above the
          fold to tell the player something they had already read.

          The "revealed" case is gone entirely: the truth line drawing
          itself in a colour the player did not draw in says it better than
          a caption, and naming the colour was wrong anyway now that each
          chart prints in its own pair.
        */}
        {hint || status === "ready" ? (
          <p className="note" role="status" aria-live="polite">
            {hint ?? "Reveal when you are ready."}
          </p>
        ) : (
          <p className="visually-hidden" role="status" aria-live="polite">
            {`Draw from ${lastKnownYear} to the right edge.`}
          </p>
        )}
      </div>

      {status === "revealed" && result && showScore ? (
        <section className="stack-4" aria-label="Result">
          <p className="score">
            <span className="score-mark">{result.score}</span>
          </p>
          <dl className="metrics">
            <div>
              <dt className="metric-term">Mean absolute error</dt>
              <dd className="metric-value">{result.meanAbsError.toFixed(3)}</dd>
            </div>
            <div>
              <dt className="metric-term">Mean signed error</dt>
              <dd className="metric-value">
                {formatSigned(result.meanSignedError)}
              </dd>
            </div>
            <div>
              <dt className="metric-term">Direction</dt>
              <dd className="metric-value">
                {result.meanSignedError > 0.01
                  ? "Drew too high"
                  : result.meanSignedError < -0.01
                    ? "Drew too low"
                    : "On the line"}
              </dd>
            </div>
          </dl>

          {/*
            Proof the row landed. The "not-persisted" case renders NOTHING on
            purpose (2026-08-27): it used to say "this one's a free preview",
            which told a player about an internal storage decision they have
            no stake in, and implied some charts cost money. A failure still
            speaks, because that one affects them.
          */}
          {submission.state === "stored" || submission.state === "failed" ? (
            <p className="note mono" aria-live="polite">
              {submission.state === "stored"
                ? `Recorded as guess #${submission.datasetGuessNumber} for this chart.`
                : `Not recorded: ${submission.error}. Your score still stands.`}
            </p>
          ) : null}

          {/*
            The low-effort notice. role="alert" rather than a passive status
            region: this one is asking the player to change what they are
            doing, so it should interrupt rather than wait to be noticed.
          */}
          {notice ? (
            <p className="notice-warn" role="alert">
              {notice}
            </p>
          ) : null}

          {!previewCrowd ? (
            <div aria-live="polite">
              {crowd.state === "loaded" && crowd.value.belowThreshold ? (
                /*
                  Softer pre-threshold copy (2026-08-27). This used to lead
                  with "Only 0 people have played this so far", which is the
                  first thing a brand-new visitor reads on a brand-new site -
                  technically true, and quietly discouraging. Every chart says
                  it until that chart alone reaches 50 answers.

                  The rephrasing keeps the same facts (nothing is hidden, the
                  threshold is still named) but frames the reader as early
                  rather than alone, which is also the accurate framing: their
                  line IS what makes the comparison possible later.
                */
                <p className="note">
                  {crowd.value.n === 0
                    ? `You're among the first to draw this one. Once ${crowd.value.minRequired} people have, everyone's lines appear here together.`
                    : `${crowd.value.n} ${crowd.value.n === 1 ? "person has" : "people have"} drawn this so far. At ${crowd.value.minRequired} the crowd view opens up and you'll see how yours compares.`}
                </p>
              ) : crowd.state === "loaded" && !crowd.value.belowThreshold && described ? (
                <div className="stack-2">
                  <p className="eyebrow">You vs everyone ({crowd.value.n} guesses)</p>
                  <p className="note">{described.position}</p>
                  <p className="note">{described.bias}</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

        {/*
          Only a VERIFIED plaque is ever shown to a player, never an
          "unverified" one (2026-08-27).

          The old badge leaked an internal editorial state onto the game and
          undermined the data in front of someone who has no way to act on
          it. The guarantee it was standing in for is enforced properly
          elsewhere and always has been: `is_active` gates what gets served,
          and the `datasets_active_requires_verified` database constraint
          makes an active-but-unverified row impossible for ANY writer. An
          unverified chart should not reach a player at all - which is a
          serving question, not a labelling one.
        */}
        <footer className="chart-footer">
          {dataset.verified ? <span className="verified">Verified</span> : null}
          <a href={dataset.sourceUrl} rel="noreferrer noopener" target="_blank">
            Source: {dataset.sourceName}
          </a>
        </footer>
      </div>
    </article>
  );
}
