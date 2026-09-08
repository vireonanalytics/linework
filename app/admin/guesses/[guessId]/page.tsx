import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { guessForAdmin, crowdForDataset } from "@/lib/server/db";
import { AnswerReview } from "@/components/AnswerReview";
import { lowEffortReason } from "@/lib/server/low-effort";
import type { Dataset } from "@/lib/types/dataset";

export const dynamic = "force-dynamic";
export const metadata = { title: "Response" };

/**
 * One response, full size, for an admin.
 *
 * Requested 2026-08-28: an admin looking at a user's responses should be able
 * to open each one the way a player can open their own.
 *
 * The same <AnswerReview> the player-facing page uses, so an admin judging
 * whether a line is junk is looking at exactly what the player drew, rendered
 * by exactly the same code - not an approximation from a different renderer
 * that could disagree about where the line sits. That matters here more than
 * anywhere: this view exists to support a decision about a person.
 *
 * The low-effort verdict is recomputed at render time rather than stored, the
 * same as on the user page - so retuning the thresholds re-labels history
 * instead of leaving stale verdicts frozen in the database.
 */
export default async function AdminGuessPage({
  params,
}: {
  params: Promise<{ guessId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin?callbackUrl=/admin");
  // Role check before the query, like every other admin surface.
  if (session.user.role !== "admin") redirect("/");

  const { guessId } = await params;
  const id = Number(guessId);
  if (!Number.isInteger(id) || id < 1) notFound();

  const entry = await guessForAdmin(id);
  if (!entry) notFound();

  const crowd = await crowdForDataset(entry.datasetId);
  const junk = lowEffortReason(entry.path);

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

  return (
    <main className="page">
      <div className="frame frame--wide stack-5">
        <header className="stack-2">
          <p className="eyebrow">
            {entry.userId ? (
              <Link href={`/admin/users/${entry.userId}`}>
                &larr; Back to this account
              </Link>
            ) : (
              <Link href="/admin/users">&larr; All accounts</Link>
            )}
          </p>
          <h1 className="title">{entry.title}</h1>
          <p className="question">{entry.question}</p>
          <p className="admin-row-meta">
            {entry.userEmail ?? "anonymous"}
            {" · scored "}
            {entry.score}
            {" · signed error "}
            {entry.meanSignedError.toFixed(3)}
            {" · "}
            {new Date(entry.playedAt).toLocaleString()}
            {entry.isSuspect ? " · flagged, excluded from findings" : ""}
          </p>
          {junk ? (
            <p className="admin-row-meta">
              <span className="pill pill--flagged">{junk}</span>
            </p>
          ) : null}
        </header>

        <AnswerReview
          dataset={dataset}
          path={entry.path}
          crowdPaths={crowd.belowThreshold ? [] : crowd.sample}
        />

        <p className="note">
          {crowd.belowThreshold
            ? `${crowd.n} answer${crowd.n === 1 ? "" : "s"} on this chart so far - other people's lines appear here at ${crowd.minRequired}.`
            : `Drawn over ${crowd.n} other answers.`}
        </p>

        <p className="note">
          Source:{" "}
          <a href={entry.sourceUrl} target="_blank" rel="noreferrer noopener">
            {entry.sourceName}
          </a>
          {" · "}
          <Link href={`/admin/datasets/${entry.slug}`}>Chart analysis</Link>
        </p>
      </div>
    </main>
  );
}
