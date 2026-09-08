import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { adminUserById, historyForUser } from "@/lib/server/db";
import { HistorySparkline } from "@/components/HistorySparkline";
import { lowEffortReason } from "@/lib/server/low-effort";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account responses" };

/**
 * Every response one account has submitted, with the chart it was drawn on
 * and the line they actually drew.
 *
 * "When you flag user response, I want to be able to see the chart that you
 * flagged and how user filled it" (2026-08-27). A strike count alone is an
 * accusation with no evidence behind it - an admin deciding whether to block
 * someone needs to look at the drawing and judge for themselves, and
 * possibly conclude the detector was wrong.
 *
 * WHY each response was judged junk is RECOMPUTED here rather than stored.
 * lowEffortReason() is pure and deterministic over the stored path, so
 * running it at render time gives the same answer the guess path gave at
 * submission - with no extra column, and with the useful property that
 * tuning the thresholds re-labels the history rather than leaving stale
 * verdicts frozen in the database.
 */
export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin?callbackUrl=/admin/users");
  if (session.user.role !== "admin") redirect("/");

  const { id } = await params;
  const user = await adminUserById(id);
  if (!user) notFound();

  const entries = await historyForUser(id);

  // Judged rather than merely listed - the flagged ones lead, because they
  // are why anyone opened this page.
  const judged = entries.map((entry) => ({
    entry,
    junk: lowEffortReason(entry.path),
  }));
  const flagged = judged.filter((j) => j.junk !== null);
  const rest = judged.filter((j) => j.junk === null);

  return (
    <main className="page">
      <div className="frame frame--wide stack-5">
        <header className="stack-2">
          <p className="eyebrow">
            <Link href="/admin/users">&larr; All accounts</Link>
          </p>
          <h1 className="title">{user.displayName}</h1>
          <p className="admin-row-meta">
            {user.email}
            {user.city ? ` · ${user.city}, ${user.state}` : ""}
            {" · joined "}
            {new Date(user.createdAt).toLocaleDateString()}
            {" · email "}
            {user.emailVerifiedAt
              ? `confirmed working ${user.emailVerifiedAt.slice(0, 10)}`
              : "never confirmed working"}
          </p>
          <p className="question">
            {entries.length} response{entries.length === 1 ? "" : "s"} ·{" "}
            {flagged.length} look automated or low-effort ·{" "}
            {user.lowEffortStrikes} recorded strike
            {user.lowEffortStrikes === 1 ? "" : "s"}
            {user.blockedAt ? " · currently blocked" : ""}
          </p>
          {user.flaggedReason ? (
            <p className="admin-row-justification">Flagged: {user.flaggedReason}</p>
          ) : null}
          {user.blockedReason ? (
            <p className="admin-row-justification">Blocked: {user.blockedReason}</p>
          ) : null}
        </header>

        {flagged.length > 0 ? (
          <section className="stack-3" aria-label="Flagged responses">
            <p className="eyebrow">Flagged responses</p>
            {flagged.map(({ entry, junk }) => (
              <article className="admin-row" key={entry.guessId}>
                <div className="admin-row-chart">
                  <HistorySparkline
                    slug={entry.slug}
                    yValues={entry.yValues}
                    yDomain={entry.yDomain}
                    revealFromIndex={entry.revealFromIndex}
                    path={entry.path}
                    width={340}
                    height={120}
                  />
                </div>
                <div className="admin-row-body">
                  <p className="admin-row-title">
                    {entry.title}
                    <span className="pill pill--flagged">{junk}</span>
                  </p>
                  <p className="admin-row-meta">
                    Score {entry.score} · signed error{" "}
                    {entry.meanSignedError.toFixed(3)} ·{" "}
                    {new Date(entry.playedAt).toLocaleString()}
                  </p>
                  <p className="admin-row-justification">{entry.question}</p>
                </div>
                <div className="stack-2">
                  <Link className="button" href={`/admin/guesses/${entry.guessId}`}>
                    Open chart
                  </Link>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <p className="note">
            Nothing in this account&apos;s history trips the low-effort
            detector right now.
          </p>
        )}

        {rest.length > 0 ? (
          <section className="stack-3" aria-label="Other responses">
            <p className="eyebrow">Everything else ({rest.length})</p>
            {rest.map(({ entry }) => (
              <article className="admin-row" key={entry.guessId}>
                <div className="admin-row-chart">
                  <HistorySparkline
                    slug={entry.slug}
                    yValues={entry.yValues}
                    yDomain={entry.yDomain}
                    revealFromIndex={entry.revealFromIndex}
                    path={entry.path}
                    width={260}
                    height={80}
                  />
                </div>
                <div className="admin-row-body">
                  <p className="admin-row-title">{entry.title}</p>
                  <p className="admin-row-meta">
                    Score {entry.score} · signed error{" "}
                    {entry.meanSignedError.toFixed(3)} ·{" "}
                    {new Date(entry.playedAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="stack-2">
                  <Link className="button" href={`/admin/guesses/${entry.guessId}`}>
                    Open chart
                  </Link>
                </div>
              </article>
            ))}
          </section>
        ) : null}
      </div>
    </main>
  );
}
