import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { historyForUser } from "@/lib/server/db";
import { HistoryList } from "@/components/HistoryList";
import { FreshOnMount } from "@/components/FreshOnMount";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your answers" };

/**
 * Every chart this player has already answered.
 *
 * Exists because of the once-only rule (see nextChartForUser in
 * lib/server/db.ts): a chart a player has answered disappears from their
 * queue forever, so without this page the line they drew and the score they
 * got would simply be gone. "A user can only play a certain graph once, but
 * they should be able to view their past answers" (2026-08-27).
 *
 * Each row redraws the actual stored path against the real series, rather
 * than listing a score - the drawing is what the player made, and it is
 * also what this project collects.
 */
export default async function HistoryPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin?callbackUrl=/history");

  const entries = await historyForUser(session.user.id);

  const scored = entries.filter((e) => !e.isSuspect);
  const average =
    scored.length > 0
      ? Math.round(scored.reduce((sum, e) => sum + e.score, 0) / scored.length)
      : null;

  return (
    <main className="page">
      {/* Always current - see FreshOnMount for why force-dynamic is not enough. */}
      <FreshOnMount />
      <div className="frame frame--wide stack-5">
        <header className="stack-2">
          <p className="eyebrow">Your answers</p>
          <h1 className="title">
            {entries.length === 0
              ? "Nothing here yet"
              : `${entries.length} chart${entries.length === 1 ? "" : "s"} answered`}
          </h1>
          {entries.length === 0 ? (
            <p className="question">
              Charts you answer show up here so you can look back at what you
              drew. <Link href="/">Start with one</Link>.
            </p>
          ) : (
            // Deliberately does NOT name a colour: each chart prints in its
            // own ink pair now (lib/chart/palette.ts), so "blue is your
            // line" is true on some rows and wrong on others. A line
            // comment, because a ternary branch must be one expression and
            // a braced JSX comment there would be a second one.
            <p className="question">
              Your line against the real one, for every chart you have
              answered.
              {average !== null ? ` Your average score is ${average}.` : ""}
            </p>
          )}
        </header>

        {entries.length > 0 ? <HistoryList entries={entries} /> : null}
      </div>
    </main>
  );
}
