import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { allDatasetsForAdmin, retiredDatasetCount, rotationCounts } from "@/lib/server/db";
import { AdminDatasetList } from "@/components/AdminDatasetList";
import { AdminRotation } from "@/components/AdminRotation";

export const dynamic = "force-dynamic";

/**
 * Gated on session.user.role, read from the database at sign-in - never a
 * hardcoded email check. See lib/auth.ts and scripts/seed-admin.ts.
 */
export default async function AdminPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/signin?callbackUrl=/admin");
  }
  if (session.user.role !== "admin") {
    redirect("/");
  }

  /*
   * Only the working list. Retired charts live at /admin/datasets/retired -
   * fetching all 585 rows here, each carrying a full series for its
   * sparkline, to render fewer than half of them was waste that grew with
   * every import.
   */
  const [datasets, retiredCount, rotation] = await Promise.all([
    allDatasetsForAdmin(),
    retiredDatasetCount(),
    rotationCounts(),
  ]);

  return (
    <main className="page">
      <div className="frame stack-5">
        <header className="stack-2">
          <p className="eyebrow">Admin</p>
          <h1 className="title">Dataset verification</h1>
          <p className="note">
            Unverified datasets never reach the public game - enforced by a
            database constraint, not just this page.
          </p>
          <p className="controls">
            <Link className="button button--primary" href="/admin/play">
              Play any chart
            </Link>
            <Link className="button" href="/admin/users">
              Accounts &amp; moderation
            </Link>
            <Link className="button" href="/admin/datasets/retired">
              Retired charts ({retiredCount})
            </Link>
          </p>
        </header>

        <AdminRotation
          inRotation={rotation.inRotation}
          heldBack={rotation.heldBack}
        />

        <AdminDatasetList datasets={datasets} />
      </div>
    </main>
  );
}
