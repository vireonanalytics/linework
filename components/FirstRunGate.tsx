"use client";

import { useEffect, useRef, useState } from "react";
import { DrawTheLine } from "@/components/DrawTheLine";
import { ChartTransition } from "@/components/ChartTransition";
import type { Dataset } from "@/lib/types/dataset";

/**
 * The two intro datasets, same order for everyone, playable with no account.
 * Reveal shows a "Next chart" button and the second swaps in on the same
 * page; after both, a plainly-stated signup wall.
 *
 * ---------------------------------------------------------------------------
 * THE PROGRESS IS PER VISIT, NOT PER BROWSER (fixed 2026-08-27)
 * ---------------------------------------------------------------------------
 * This used to persist a completed-count in localStorage. That made the two
 * intro charts a once-per-browser allowance: finish both, and every later
 * visit opened straight onto the signup wall with no chart on the page at
 * all. Someone who played, signed up, played properly, then signed out came
 * back to a homepage with nothing on it - which is exactly what happened.
 *
 * The rule is now what the human actually wanted: **the two intro charts are
 * always there on load.** Wanting MORE than those two is what requires an
 * account. So the state resets on every page load, and the wall is only ever
 * the end of a session's progression, never a persistent lock.
 *
 * Replaying them costs nothing: anonymous guesses on these two slugs are
 * deliberately never written to the database (see FREE_INTRO_SLUGS in
 * app/api/guess/route.ts), so there is no aggregate to skew by playing the
 * same chart twice.
 *
 * Starting at 0 rather than reading storage also removes the effect and the
 * `stage === null` blank render this component used to need: 0 is the same
 * on the server and the client, so the first chart is now in the
 * server-rendered HTML instead of appearing a beat after hydration. That
 * matters here more than most places - this chart is the hero.
 */
export function FirstRunGate({ introDatasets }: { introDatasets: Dataset[] }) {
  const [stage, setStage] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const wallRef = useRef<HTMLDivElement | null>(null);

  /*
   * Bring whatever replaced the chart into the middle of the screen.
   *
   * Pressing "Continue" swaps a tall chart card for a much shorter panel, so
   * the page gets suddenly shorter under a viewport that is scrolled well
   * down it. The browser keeps the scroll offset, which lands the reader
   * somewhere arbitrary - usually staring at the section below. Reported as
   * "I get teleported to a random place".
   *
   * Runs in an effect rather than in the click handler because the panel does
   * not exist yet at click time: React has to render it before there is
   * anything to scroll to. `block: "center"` is the actual request - the
   * panel should be centred, not merely on screen.
   */
  useEffect(() => {
    const wall = wallRef.current;
    if (!wall) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    wall.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "center",
    });
  }, [stage]);

  const advance = () => {
    setStage((current) => current + 1);
    setRevealed(false);
  };

  const restart = () => {
    setStage(0);
    setRevealed(false);
  };

  /*
    The intro charts are read live from the database now, so "none active"
    is a real state rather than an impossible one - an admin can unverify
    both. Saying so plainly beats rendering an empty section.
  */
  if (introDatasets.length === 0) {
    return (
      <div className="card card--offset-violet stack-4">
        <p className="eyebrow">Nothing live right now</p>
        <h2 className="title">No charts available yet</h2>
        <p className="question">
          Charts appear here as soon as they are verified. Check back shortly.
        </p>
      </div>
    );
  }

  if (stage >= introDatasets.length) {
    return (
      <div ref={wallRef} className="card card--offset-violet card--lift stack-4">
        <p className="eyebrow">That&apos;s both intro charts</p>
        <h2 className="title">Sign up to keep playing</h2>
        <p className="question">
          An account unlocks every other chart, keeps your streak, and adds
          your lines to the aggregate.
        </p>
        <div className="controls">
          <a className="button button--primary" href="/signup">Sign up</a>
          <a className="button" href="/signin">Sign in</a>
          {/*
            An explicit way back to the two intro charts, so the wall is
            never a dead end. Without it the only route back is a page
            reload, which is not something a visitor should have to work out.
          */}
          <button type="button" className="button" onClick={restart}>
            Play these again
          </button>
        </div>
      </div>
    );
  }

  const current = introDatasets[stage];
  const isLast = stage === introDatasets.length - 1;

  return (
    <div className="stack-5">
      <ChartTransition transitionKey={current.slug}>
        <DrawTheLine
          dataset={current}
          barLabel={`Chart ${stage + 1} of ${introDatasets.length}`}
          onRevealed={() => setRevealed(true)}
        />
      </ChartTransition>
      {revealed ? (
        <div className="controls" aria-label="Continue">
          <button type="button" className="button button--accent" onClick={advance}>
            {isLast ? "Continue" : "Next chart"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
