import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AdminPreviewPlay } from "@/components/AdminPreviewPlay";
import { datasetForAdminPlay } from "@/lib/server/db";

export const dynamic = "force-dynamic";

/**
 * Play any chart without recording it. Testing, and making videos of charts.
 *
 * Reads through datasetForAdminPlay, the one unfiltered chart reader in
 * lib/server/db.ts, so a retired, held-back or never-verified chart can be
 * looked at here. That is safe specifically because the preview never submits
 * a guess: rendering an unverified chart is not the sensitive operation,
 * recording a guess against one is.
 */
export default async function AdminPlayChartPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();

  if (!session?.user) {
    redirect(`/signin?callbackUrl=/admin/play/${slug}`);
  }
  if (session.user.role !== "admin") {
    redirect("/");
  }

  const dataset = await datasetForAdminPlay(slug);
  if (!dataset) notFound();

  return (
    <main className="page">
      <div className="frame stack-4">
        <p className="controls">
          <Link className="button" href="/admin/play">
            All charts
          </Link>
          <Link className="button" href={`/admin/datasets/${dataset.slug}`}>
            Analysis
          </Link>
        </p>

        <AdminPreviewPlay dataset={dataset} />
      </div>
    </main>
  );
}
