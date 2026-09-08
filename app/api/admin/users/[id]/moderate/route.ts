import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { setUserBlocked, setUserFlagged } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Block, unblock, flag or unflag one account.
 *
 * Gated on session.user.role === 'admin', read from the database at sign-in
 * and never a hardcoded email comparison - the same gate every other admin
 * route uses.
 *
 * A reason is REQUIRED to block or flag, and the database enforces that too
 * (users_block_has_reason / users_flag_has_reason). Same principle as
 * guesses.suspect_reasons: a moderation action with no recorded reason
 * cannot be reviewed, defended or reversed with any confidence later.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "not permitted" }, { status: 403 });
  }

  const { id } = await params;

  /*
   * An admin cannot block themselves. Not a security control - anyone who
   * can reach this route could unblock themselves again by other means -
   * but a locked-out administrator is a genuinely annoying self-inflicted
   * outage, and this costs one comparison to prevent.
   */
  if (id === session.user.id) {
    return NextResponse.json(
      { error: "you cannot moderate your own account" },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const action = raw.action;
  const reasonRaw = typeof raw.reason === "string" ? raw.reason.trim() : "";

  if (action !== "block" && action !== "unblock" && action !== "flag" && action !== "unflag") {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }

  const needsReason = action === "block" || action === "flag";
  if (needsReason && (reasonRaw.length === 0 || reasonRaw.length > 500)) {
    return NextResponse.json(
      { error: "a reason of 1-500 characters is required" },
      { status: 400 },
    );
  }

  try {
    const found =
      action === "block" || action === "unblock"
        ? await setUserBlocked(id, action === "block", needsReason ? reasonRaw : null)
        : await setUserFlagged(id, action === "flag", needsReason ? reasonRaw : null);

    if (!found) {
      return NextResponse.json({ error: "no such account" }, { status: 404 });
    }
  } catch (error) {
    console.error("[api/admin/users] moderation failed", error);
    return NextResponse.json({ error: "storage unavailable" }, { status: 503 });
  }

  // Worth a server-side record independent of the database row, so the
  // sequence of moderation actions survives someone later editing the row.
  console.warn("[moderation]", {
    action,
    target: id,
    by: session.user.id,
    at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, action });
}
