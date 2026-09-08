import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { setDatasetRetired } from "@/lib/server/db";

/** postgres.js opens a TCP socket, which the edge runtime cannot do. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin retirement: take a chart out of circulation, or put it back.
 *
 * Requested 2026-08-27: "give admins a right to delete or as you call it
 * deactivate the charts".
 *
 * Deliberately a SEPARATE route from .../verify rather than another flag on
 * it. The two answer different questions - verify is "do I trust this data",
 * retire is "should players still see this chart" - and they have different
 * durabilities: an unverify can be undone by the next bulk activation,
 * whereas a retirement is meant to survive re-importing. Folding them
 * together would make the more permanent action reachable by accident from
 * the less permanent one.
 *
 * Retiring HIDES, it does not delete. Guesses against the chart are kept in
 * full - see setDatasetRetired for why - and the chart stays visible in the
 * admin list so its collected answers remain reachable for analysis.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }
  // Role lives in the database (users.role), read into the session at
  // sign-in - never a hardcoded email comparison anywhere in this codebase.
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "admin access required" }, { status: 403 });
  }

  const { slug } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }

  const retire = (body as { retire?: unknown } | null)?.retire;
  if (typeof retire !== "boolean") {
    return NextResponse.json({ error: "'retire' must be a boolean" }, { status: 400 });
  }

  try {
    const result = await setDatasetRetired(slug, retire);
    if (!result) {
      return NextResponse.json({ error: "unknown dataset" }, { status: 404 });
    }
    return NextResponse.json({ dataset: result });
  } catch (error) {
    /*
     * datasets_retired_not_active and datasets_retired_pair are the backstops
     * if this route's logic is ever wrong. A rejected write here means one of
     * them just did its job.
     */
    console.error("[api/admin/retire] update failed", error);
    return NextResponse.json({ error: "update rejected" }, { status: 409 });
  }
}
