import { auth } from "@/lib/auth";
import { FirstRunGate } from "@/components/FirstRunGate";
import { SignedInPlay } from "@/components/SignedInPlay";
import { GraffitiField } from "@/components/GraffitiField";
import { HowItWorks } from "@/components/home/HowItWorks";
import { TheIdea } from "@/components/home/TheIdea";
import { FindingsPreview } from "@/components/home/FindingsPreview";
import { SecondCta } from "@/components/home/SecondCta";
import { FREE_INTRO_SLUGS } from "@/lib/datasets/free-intro";
import {
  activeDatasetsBySlugs,
  dailyGoalProgress,
  nextChartForUser,
} from "@/lib/server/db";

/**
 * PLACEHOLDER COPY - expected to be replaced by the human.
 *
 * Split into two lines rather than left to wrap: the mock breaks between
 * the sentences explicitly, and at this size the break is a design decision
 * (a statement, then the question) rather than something to leave to
 * whatever width the viewport happens to be.
 */
const HERO_LINES = ["You know the trend.", "Do you know the number?"];

/**
 * The homepage branches hard on sign-in state.
 *
 * - Anonymous: the poster hero, then the live game, then the scroll
 *   narrative that explains and sells the project.
 * - Signed in: the hero is replaced by their next unanswered chart and the
 *   marketing narrative is not rendered at all. They already converted;
 *   every extra section is something between them and the next chart.
 */
export default async function Home() {
  const session = await auth();

  if (session?.user) {
    const [{ next, remainingAfter }, goal] = await Promise.all([
      nextChartForUser(session.user.id),
      dailyGoalProgress(session.user.id),
    ]);
    const remainingTotal = next ? remainingAfter + 1 : 0;

    /*
     * The streak nudge is shown only while it is still actionable.
     *
     * Requested 2026-08-27: "the streak message should only appear when the
     * user has not yet completed the daily goal. When the goal is completed,
     * this message should disappear." Telling someone to finish three charts
     * after they have finished three reads as the app not having noticed.
     *
     * Counting up ("1 of 3 today") rather than repeating the rule every time
     * costs nothing and makes the line worth re-reading between charts.
     */
    const streakLine = goal.met
      ? null
      : goal.chartsToday === 0
        ? "Any 3 charts today keep your streak going."
        : `${goal.chartsToday} of ${goal.goal} today - ${goal.goal - goal.chartsToday} more keeps your streak going.`;

    return (
      /*
        The signed-in game gets the same drifting graffiti the anonymous hero
        has - previously this view was the one bare page on the site, which
        made signing in feel like leaving the product rather than entering it.
      */
      <main className="play-stage">
        <GraffitiField />
        <div className="shell stack-6 play-stage-inner">
          <header className="stack-3">
            <p className="eyebrow">Your run</p>
            <h1 className="title">
              {remainingTotal > 0 ? "Your next chart" : "You're caught up"}
            </h1>
            <p className="question">
              {remainingTotal > 0
                ? `${remainingTotal} chart${remainingTotal === 1 ? "" : "s"} left, each one only once.`
                : "You've answered every chart available right now. New ones show up here as they're verified."}
            </p>
            {streakLine ? <p className="note">{streakLine}</p> : null}
          </header>

          {/*
            Deliberately NOT keyed by slug. A key here remounts the whole
            component on every chart change, which destroys the
            AnimatePresence inside ChartTransition before it can animate -
            the page-turn simply never ran on this path. SignedInPlay resets
            its own per-chart state instead.
          */}
          <SignedInPlay next={next} remainingAfter={remainingAfter} />
        </div>
      </main>
    );
  }

  /*
   * The two no-account intro charts, read LIVE from the database rather than
   * imported from lib/datasets/*.ts.
   *
   * Those modules still carry `verified: false` for both slugs even though
   * the database has them verified and active - the admin verify flow only
   * ever writes to Postgres. Rendering from the modules meant the VERIFIED
   * plaque could never appear on the homepage, and meant the page could keep
   * serving a chart an admin had since deactivated. activeDatasetsBySlugs
   * filters to active rows, and the database constraint makes active imply
   * verified, so an unverified chart cannot reach a player through here.
   */
  const introDatasets = await activeDatasetsBySlugs(FREE_INTRO_SLUGS);

  return (
    <main>
      {/* --- hero: poster type over marker graffiti ---------------------- */}
      <section className="hero">
        <GraffitiField />
        <div className="shell hero-inner">
          <div className="hero-meta eyebrow">
            <span>Open data / public intuition</span>
            <span>A game in lines</span>
          </div>

          <h1 className="display">
            {HERO_LINES[0]}
            <br />
            {HERO_LINES[1]}
          </h1>

          <div className="hero-lower">
            <p className="hero-lead">
              You see the first half of a real chart. Draw where you think it
              goes next.
            </p>
            <a className="button button--accent scroll-cue" href="#play">
              <span>Scroll to the chart</span>
              {/*
                Drawn rather than typed. The mock uses a downward arrow
                CHARACTER, but that glyph's weight and size vary a lot
                between fonts, and the design guard reads the Unicode arrows
                block as emoji. An SVG renders identically everywhere and
                inherits currentColor, so it recolours on hover for free.
              */}
              <svg
                className="scroll-cue-arrow"
                width="20"
                height="22"
                viewBox="0 0 14 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                aria-hidden="true"
              >
                <path d="M7 1 V13 M2 8.5 L7 14 L12 8.5" />
              </svg>
            </a>
          </div>

          <p className="eyebrow hero-footnote">The real line is waiting below.</p>
        </div>
      </section>

      {/* --- the live game ----------------------------------------------- */}
      <section className="band" id="play" aria-labelledby="play-heading">
        <div className="shell">
          <div className="section-head">
            <div className="stack-3">
              <p className="eyebrow">Start here</p>
              <h2 id="play-heading" className="title">
                Draw the continuation.
              </h2>
            </div>
            <p className="section-head-aside">
              Draw the continuation. Reveal the truth. Then try the next chart.
            </p>
          </div>

          <FirstRunGate introDatasets={introDatasets} />
        </div>
      </section>

      {/* --- below the fold: the scroll narrative ------------------------ */}
      <TheIdea />
      <HowItWorks />
      <FindingsPreview />
      <SecondCta />
    </main>
  );
}
