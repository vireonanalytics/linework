import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { answeredChartForUser, crowdForDataset } from "@/lib/server/db";
import { AnswerReview } from "@/components/AnswerReview";
import { ShareResult } from "@/components/ShareResult";
import { compareToCrowd, describeComparison } from "@/lib/crowd/compare";
import { quantize } from "@/lib/drawing/resample";
import { truthPathNormalized } from "@/lib/scoring/score";
import type { Dataset } from "@/lib/types/dataset";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ guessId: string }>;
}) {
  const { guessId } = await params;
  return { title: `Your answer #${guessId}` };
}

/**
 * One answered chart, reopened.
 *
 * Requested 2026-08-27, and the reason is the once-only rule: a chart a
 * player has answered disappears from their queue forever, so without this
 * the line they drew was reachable only as a thumbnail. It also has a second
 * job the request named explicitly - a chart that had too few answers when
 * they played it will have enough later, so this is where someone comes back
 * to see the crowd once it exists.
 *
 * NOT PLAYABLE. There is no drawing surface here at all (see AnswerReview),
 * so "can they replay it" is not a rule being enforced, it is a capability
 * that was never wired up. The stored guess is passed in already scored.
 */
export default async function AnsweredChartPage({
  params,
}: {
  params: Promise<{ guessId: string }>;
}) {
  const session = await auth();
  const { guessId } = await params;

  if (!session?.user) {
    redirect(`/signin?callbackUrl=/history/${guessId}`);
  }

  const id = Number(guessId);
  if (!Number.isInteger(id) || id < 1) notFound();

  // Scoped to the signed-in user inside the query - see answeredChartForUser.
  const entry = await answeredChartForUser(session.user.id, id);
  if (!entry) notFound();

  const crowd = await crowdForDataset(entry.datasetId);

  const dataset: Dataset = {
    slug: entry.slug,
    title: entry.title,
    question: entry.question,
    yLabel: entry.yLabel,
    yUnit: entry.yUnit,
    xValues: entry.xValues,
    yValues: entry.yValues,
    revealFromIndex: entry.revealFromIndex,
    yDomain: entry.yDomain,
    sourceName: entry.sourceName,
    sourceUrl: entry.sourceUrl,
    verified: true,
    verifiedOn: null,
    isActive: true,
    reliability: "green",
  };

  /*
   * Crowd lines only above the threshold. crowdForDataset already returns a
   * shape with no sample field at all below it, so there is nothing here that
   * could accidentally render a handful of lines as if they were a consensus.
   */
  const crowdPaths = crowd.belowThreshold ? [] : crowd.sample;

  /*
   * Same comparison the live game runs, on the same quantised scale - the
   * stored path is compared against a quantised truth so this page and the
   * reveal can never disagree about the same guess.
   */
  const comparison = crowd.belowThreshold
    ? null
    : describeComparison(
        compareToCrowd(
          entry.path,
          quantize(truthPathNormalized(dataset, entry.path.length)),
          crowd.percentiles,
          crowd.n,
        ),
      );

  return (
    <main className="page">
      <div className="frame frame--wide stack-5">
        <header className="stack-2">
          <p className="eyebrow">
            <Link href="/history">&larr; Your answers</Link>
          </p>
          <h1 className="title">{entry.title}</h1>
          <p className="question">{entry.question}</p>
          <p className="admin-row-meta">
            Answered {new Date(entry.playedAt).toLocaleDateString()}
            {" · scored "}
            {entry.score}
            {entry.isSuspect ? " · not counted in findings" : ""}
          </p>
        </header>

        <AnswerReview dataset={dataset} path={entry.path} crowdPaths={crowdPaths} />

        {/*
          Shareable from here too, not only from the reveal. A result becomes
          more worth sharing later, not less - once a chart passes the crowd
          threshold this page gains everyone else's lines, and that is exactly
          the moment someone wants to show it to a friend. Same component and
          same link as the in-game button, so a shared result looks identical
          whichever place it was sent from.
        */}
        <div className="controls">
          <ShareResult
            slug={entry.slug}
            title={entry.title}
            score={entry.score}
          />
        </div>

        <section className="card stack-3" aria-label="How this compares">
          {crowd.belowThreshold ? (
            <>
              <p className="eyebrow">The crowd, not yet</p>
              <p className="question">
                {crowd.n === 0
                  ? `You're among the first to draw this one.`
                  : `${crowd.n} ${crowd.n === 1 ? "person has" : "people have"} drawn this so far.`}{" "}
                At {crowd.minRequired} everyone&apos;s lines appear over yours
                here. Come back and this page will show them.
              </p>
            </>
          ) : (
            <>
              <p className="eyebrow">You vs everyone ({crowd.n} answers)</p>
              {comparison ? (
                <>
                  <p className="note">{comparison.position}</p>
                  <p className="note">{comparison.bias}</p>
                </>
              ) : null}
            </>
          )}
        </section>

        <p className="note">
          Source:{" "}
          <a href={entry.sourceUrl} target="_blank" rel="noreferrer noopener">
            {entry.sourceName}
          </a>
        </p>
      </div>
    </main>
  );
}
