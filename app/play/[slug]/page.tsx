import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DrawTheLine } from "@/components/DrawTheLine";
import { allDatasets } from "@/lib/datasets/index";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ score?: string }>;
};

/**
 * Per-dataset OG image, optionally carrying a score so a shared result link
 * ("I got 82 on this one") previews with that score visible - never the
 * chart shape itself, which stays undrawn behind the actual game. See
 * app/api/og/route.tsx.
 */
export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { score } = await searchParams;
  const dataset = allDatasets.find((d) => d.slug === slug);
  if (!dataset) return {};

  const ogParams = new URLSearchParams({ title: dataset.title });
  if (score) ogParams.set("score", score);
  const ogUrl = `/api/og?${ogParams.toString()}`;

  return {
    title: dataset.title,
    description: dataset.question,
    openGraph: {
      title: dataset.title,
      description: dataset.question,
      images: [{ url: ogUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: dataset.title,
      description: dataset.question,
      images: [ogUrl],
    },
  };
}

/**
 * One dataset, by slug, looked up from the same allDatasets list
 * validate-datasets.ts checks - not the `activeDatasets` filter. Deliberate:
 * this route is reachable during development and by the two first-time-user
 * free datasets (see app/page.tsx) before they are formally active, the same
 * way app/page.tsx originally imported teenBirthRate directly in Phase 1.
 *
 * The write path (POST /api/guess) is the actual enforcement point - it
 * checks isActive independently and rejects unverified datasets in
 * production regardless of what this page renders. A page rendering an
 * unverified chart is not the sensitive operation; recording it as servable
 * content would be.
 */
export default async function PlayPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const dataset = allDatasets.find((d) => d.slug === slug);

  if (!dataset) notFound();

  return (
    <main className="page">
      <DrawTheLine dataset={dataset} />
    </main>
  );
}
