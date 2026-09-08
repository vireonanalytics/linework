import { NextResponse, type NextRequest } from "next/server";
import { crowdForDataset, datasetBySlug } from "@/lib/server/db";

/** postgres.js opens a TCP socket, which the edge runtime cannot do. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Same escape hatch POST /api/guess uses, and for the same reason: this is
 * how Phase 4 gets exercised end to end - including with directly-seeded demo
 * data - before the dataset has real CDC numbers behind it. Off unless set.
 */
const allowUnverified = process.env.ALLOW_UNVERIFIED_DATASETS === "true";

/**
 * The crowd view. A plain read of what recompute_crowd_stats() already
 * computed - see lib/server/db.ts for why nothing here aggregates on request.
 *
 * Gated on isActive exactly like POST /api/guess. An earlier version of this
 * route had no such gate, on the reasoning that reading aggregated data is
 * not the sensitive path serving raw content is. That reasoning does not
 * survive contact with how this project actually got tested: dev-time and
 * demo-seeded guesses accumulate against a dataset well before it is
 * verified, and this endpoint has no synthetic-data label the way the Phase 2
 * ?preview=crowd path does. Without the gate, that data - fabricated or not -
 * would be one URL away from public the moment this route reached Production,
 * silently violating the same "unverified data must never reach production"
 * guarantee the rest of the schema enforces with database constraints.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  let dataset;
  try {
    dataset = await datasetBySlug(slug);
  } catch (error) {
    console.error("[api/crowd] dataset lookup failed", error);
    return NextResponse.json({ error: "storage unavailable" }, { status: 503 });
  }

  if (!dataset) {
    return NextResponse.json({ error: "unknown dataset" }, { status: 404 });
  }

  if (!dataset.isActive && !allowUnverified) {
    return NextResponse.json({ error: "dataset is not active" }, { status: 403 });
  }

  try {
    const crowd = await crowdForDataset(dataset.id);
    // Precomputed on a schedule; safe to let a CDN hold this briefly rather
    // than every reveal hitting Postgres directly.
    return NextResponse.json(crowd, {
      headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" },
    });
  } catch (error) {
    console.error("[api/crowd] crowd lookup failed", error);
    return NextResponse.json({ error: "storage unavailable" }, { status: 503 });
  }
}
