import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { activateGreenDatasets, deactivateImportedDatasets } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bulk verify+activate every green dataset, or deactivate every imported one.
 *
 * Admin-gated like every other admin route. See activateGreenDatasets() for
 * why a bulk action is the right shape here and why it is scoped to green
 * only - in short, 331 individual clicks is not review, it is theatre, but
 * approving a well-defined CLASS of data in one recorded decision is.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "not permitted" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }

  const action = (body as Record<string, unknown>).action;

  try {
    if (action === "activate-green") {
      const { activated } = await activateGreenDatasets();
      console.warn("[moderation] bulk activate green", {
        by: session.user.id,
        activated,
        at: new Date().toISOString(),
      });
      return NextResponse.json({ ok: true, activated });
    }

    if (action === "deactivate-imported") {
      const { deactivated } = await deactivateImportedDatasets();
      console.warn("[moderation] bulk deactivate imported", {
        by: session.user.id,
        deactivated,
        at: new Date().toISOString(),
      });
      return NextResponse.json({ ok: true, deactivated });
    }
  } catch (error) {
    console.error("[api/admin/datasets/activate-green] failed", error);
    return NextResponse.json({ error: "storage unavailable" }, { status: 503 });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
