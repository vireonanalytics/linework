import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AdminPlayList } from "@/components/AdminPlayList";
import { allChartsForAdminPlay } from "@/lib/server/db";

export const dynamic = "force-dynamic";

/**
 * Every chart in the database, playable without being recorded.
 *
 * Separate from /admin, which is a REVIEW surface: it splits charts by
 * verification state because the decision it supports is "should this be
 * live". The decision here is "which chart do I want to look at", which is a
 * different question and wants one flat searchable list including the retired
 * archive.
 */
export default async function AdminPlayPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/signin?callbackUrl=/admin/play");
  }
  if (session.user.role !== "admin") {
    redirect("/");
  }

  const charts = await allChartsForAdminPlay();

  return (
    <main className="page">
      <div className="frame stack-5">
        <header className="stack-2">
          <p className="eyebrow">Admin</p>
          <h1 className="title">Play any chart</h1>
          <p className="note">
            Every chart, including held back, unverified and retired ones.
            Nothing drawn here is recorded or counted into any chart&apos;s
            statistics.
          </p>
          <p className="controls">
            <Link className="button" href="/admin">
              Back to admin
            </Link>
          </p>
        </header>

        <AdminPlayList charts={charts} />
      </div>
    </main>
  );
}
