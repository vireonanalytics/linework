import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { allDatasetsForAdmin } from "@/lib/server/db";
import { AdminRetiredList } from "@/components/AdminRetiredList";

export const dynamic = "force-dynamic";

export const metadata = { title: "Retired charts" };

/**
 * The archive of withdrawn charts, and the way back from a deactivation.
 *
 * Gated on session.user.role exactly like every other admin route - read from
 * the database at sign-in, never a hardcoded email check.
 */
export default async function RetiredDatasetsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/signin?callbackUrl=/admin/datasets/retired");
  }
  if (session.user.role !== "admin") {
    redirect("/");
  }

  const datasets = await allDatasetsForAdmin({ retired: true });

  return (
    <main className="page">
      <div className="frame stack-5">
        <header className="stack-2">
          <p className="eyebrow">Admin</p>
          <h1 className="title">Retired charts</h1>
          <p className="note">
            Charts that are no longer served to players. Their data and every
            answer they collected are kept.
          </p>
          <p className="controls">
            <Link className="button" href="/admin">
              Back to datasets
            </Link>
          </p>
        </header>

        {datasets.length === 0 ? (
          <p className="note">Nothing has been retired.</p>
        ) : (
          <AdminRetiredList datasets={datasets} />
        )}
      </div>
    </main>
  );
}
