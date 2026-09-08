"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { DrawTheLine } from "@/components/DrawTheLine";
import { ChartTransition } from "@/components/ChartTransition";
import type { Dataset } from "@/lib/types/dataset";

/**
 * The signed-in play loop: one unanswered active chart at a time, server
 * -chosen, every guess saved. "next" and "remainingAfter" come from
 * lib/server/db.ts's nextChartForUser() in the parent server component
 * (app/page.tsx) - the database, not client state, is what decides which
 * chart a signed-in player sees, because it is also what enforces "a user
 * gets a certain question only once" (2026-08-26).
 *
 * "Next chart" only appears once the just-drawn guess's write has actually
 * resolved (DrawTheLine's onSubmitSettled, not onRevealed) and it works by
 * asking the SERVER what's next via router.refresh() - re-running app/page.tsx
 * with fresh data - rather than picking the next chart client-side. A failed
 * write simply re-serves the same chart on refresh, since the database still
 * shows it as unanswered; no special-casing needed.
 *
 * NOT keyed by slug from the parent any more. It used to be, which meant
 * every chart change remounted this component - and that destroyed the
 * AnimatePresence inside ChartTransition along with it, so the page-turn
 * animation never had a previous child to animate away and silently did
 * nothing on this path. The per-chart state it needs is reset below instead.
 */
/**
 * Slugs this browser has already answered, kept in sessionStorage.
 *
 * WHY THIS IS NEEDED - the dead end reported 2026-08-27: "I can redraw that
 * question and after that I don't have a button for next chart."
 *
 * Reproduced exactly. Answer a chart, navigate to Your answers, then press
 * the browser's BACK button. Back navigation always restores from Next's
 * client Router Cache, regardless of the page being force-dynamic - so the
 * home page comes back as the RSC payload from BEFORE the guess: the same
 * chart, presented as unanswered, with a stale "273 charts left" and no
 * "Next chart" button, because that button lives in component state which
 * the remount cleared.
 *
 * The player is then stuck. Worse, redrawing and revealing again would post a
 * second guess for a chart they already answered - a duplicate row, flagged
 * suspect, in a dataset whose whole value is one honest answer per person.
 *
 * The server cannot fix this: it never sees the request, because the cache
 * answers it. So the client has to notice that what it has been handed is
 * stale. sessionStorage rather than component state precisely because the
 * remount is the problem - anything held in React state is already gone by
 * the time we need it. Session-scoped, so it cannot leak into a later visit
 * or another tab's history.
 */
const ANSWERED_KEY = "dtl_answered_slugs";

function readAnswered(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(ANSWERED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    // Private-browsing modes can throw on sessionStorage. Degrading to "we
    // remember nothing" restores the old behaviour rather than breaking play.
    return new Set();
  }
}

/*
 * Nothing outside this module writes the key, and the only writer is
 * rememberAnswered - which is always followed by a setState in the same
 * handler, so React re-reads the snapshot anyway. The subscription therefore
 * has nothing to listen to and is a no-op, present because
 * useSyncExternalStore requires one.
 */
function subscribeToAnswered() {
  return () => {};
}

function rememberAnswered(slug: string) {
  try {
    const set = readAnswered();
    set.add(slug);
    window.sessionStorage.setItem(ANSWERED_KEY, JSON.stringify([...set]));
  } catch {
    /* see readAnswered */
  }
}

export function SignedInPlay({
  next,
  remainingAfter,
}: {
  next: Dataset | null;
  remainingAfter: number;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  /*
   * Was the chart we have been handed already answered by this browser?
   *
   * Read through useSyncExternalStore rather than as state set from an
   * effect: the React compiler lint rejects setState inside an effect (it
   * causes cascading renders), and this is genuinely a read of an external
   * store, which is exactly what that hook is for. The server snapshot is
   * `false` so SSR renders the chart normally and hydration cannot mismatch.
   *
   * `justAnswered` excludes the chart the player answered IN THIS MOUNT -
   * that one is mid-reveal and must keep rendering. It is state rather than a
   * ref because the compiler forbids reading a ref during render, and it is
   * set in the submit handler alongside setReady, so React batches both into
   * the single re-render that reveals the score: that render sees the slug
   * excluded and computes stale = false.
   */
  const [justAnswered, setJustAnswered] = useState<string | null>(null);
  const alreadyAnswered = useSyncExternalStore(
    subscribeToAnswered,
    () => (next?.slug ? readAnswered().has(next.slug) : false),
    () => false,
  );
  const stale = alreadyAnswered && justAnswered !== next?.slug;

  /*
   * Ask the server again, once per slug. A genuine re-serve after a FAILED
   * write is never recorded as answered, so that case renders normally and
   * there is no refresh loop.
   */
  const refreshedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!stale || !next?.slug) return;
    if (refreshedFor.current === next.slug) return;
    refreshedFor.current = next.slug;
    router.refresh();
  }, [stale, next?.slug, router]);

  /*
   * Clear the "you may continue" state whenever the chart changes. This is
   * what the parent's `key` used to do by remounting; doing it here keeps
   * the component - and therefore the transition - alive across the change.
   *
   * Compared against a ref rather than listed as an effect dependency so it
   * fires only on an actual slug change, not on every re-render that happens
   * to pass the same slug.
   */
  const shownSlug = useRef(next?.slug ?? null);
  useEffect(() => {
    const slug = next?.slug ?? null;
    if (shownSlug.current !== slug) {
      shownSlug.current = slug;
      setReady(false);
    }
  }, [next?.slug]);

  if (!next) {
    return (
      <div className="card card--offset-violet stack-4">
        <section className="stack-4" aria-label="Nothing left to play">
          <p className="eyebrow">You&apos;re caught up</p>
          <h2 className="title">No new charts right now</h2>
          <p className="question">
            You&apos;ve answered every verified chart available. New ones
            show up here as they&apos;re verified - check back soon.
          </p>
        </section>
      </div>
    );
  }

  /*
   * Show a placeholder rather than the stale chart while the refresh lands.
   * Rendering the old chart here would be handing the player the exact dead
   * end this is fixing - and letting them draw on a chart they have already
   * answered, which would post a duplicate.
   */
  if (stale) {
    return (
      <div className="card card--offset-violet stack-4">
        <section className="stack-3" aria-label="Loading your next chart">
          <p className="eyebrow">Already answered</p>
          <h2 className="title">Getting your next chart</h2>
          <p className="question">
            You&apos;ve already drawn this one. Fetching the next one now.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="stack-5">
      <ChartTransition transitionKey={next.slug}>
        <DrawTheLine
          dataset={next}
          onSubmitSettled={(persisted) => {
            // Only a guess that actually landed counts as answered - see
            // rememberAnswered's note on why a failed write must not.
            if (persisted) {
              // Written to storage first, then flagged in state: the next
              // render reads both, and without the flag it would compute
              // stale = true and replace the reveal the player is looking at.
              rememberAnswered(next.slug);
              setJustAnswered(next.slug);
            }
            setReady(true);
          }}
        />
      </ChartTransition>
      {ready ? (
        <div className="controls" aria-label="Continue">
          <button
            type="button"
            className="button button--accent"
            onClick={() => router.refresh()}
          >
            {remainingAfter > 0 ? "Next chart" : "See what's next"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
