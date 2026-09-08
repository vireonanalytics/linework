import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { restoreFullRotation } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Put every active chart back into the queue.
 *
 * Only ever WIDENS the pool. Narrowing it again is a curation decision - which
 * 50 charts deserve a player's first five minutes - and that lives in
 * scripts/launch-pool.ts where the list can be read and argued with, not
 * behind a button that could be pressed by accident.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "admin access required" }, { status: 403 });
  }

  try {
    return NextResponse.json(await restoreFullRotation());
  } catch (error) {
    console.error("[api/admin/rotation] restore failed", error);
    return NextResponse.json({ error: "update rejected" }, { status: 409 });
  }
}
