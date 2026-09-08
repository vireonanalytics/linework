import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/server/db";

/** postgres.js opens a TCP socket, which the edge runtime cannot do. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The enforcement point the task asked for explicitly: "Unverified datasets
 * never reach the public game - enforce this the same way
 * validate-datasets.ts already does, not just in the UI."
 *
 * validate-datasets.ts enforces it at BUILD time, over the TypeScript
 * modules. This route is the equivalent enforcement at WRITE time, over the
 * database - and there is a second, independent enforcement point below
 * that: the datasets_active_requires_verified CHECK constraint
 * (supabase/migrations/20260826142236_core_schema.sql) makes it impossible
 * to set is_active true without verified also true, at the database level,
 * regardless of what this route does or does not check. Even a bug in this
 * route's own logic could not produce an active-but-unverified row.
 *
 * "Verify" and "activate" happen together, in one action: the constraint
 * requires it, and the human's own framing ("Unverified datasets never
 * reach the public game") reads as verify being the publish action, not a
 * separate step.
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

  const verify = (body as { verify?: unknown } | null)?.verify;
  if (typeof verify !== "boolean") {
    return NextResponse.json({ error: "'verify' must be a boolean" }, { status: 400 });
  }

  /*
   * Activating a retired dataset is refused HERE, with a reason, rather than
   * being left to the datasets_retired_not_active constraint.
   *
   * The constraint would catch it either way - that is what it is for - but
   * the catch surfaces as a bare 409 "update rejected", which tells an admin
   * pressing a button nothing about why it did not work. A retired chart is
   * a normal thing to encounter in the list (they are still shown, because
   * they still hold guesses worth analysing), so bumping into one should
   * read as an explanation, not as a failure.
   *
   * Costs one extra read on an action taken a handful of times a day.
   */
  if (verify) {
    const existing = await sql()<{ retired_at: string | null }[]>`
      select retired_at from datasets where slug = ${slug}
    `;
    if (existing.length === 0) {
      return NextResponse.json({ error: "unknown dataset" }, { status: 404 });
    }
    if (existing[0].retired_at) {
      return NextResponse.json(
        {
          error:
            "This chart was retired - the import catalogue no longer produces it, " +
            "so it cannot be activated. Add its indicator back to " +
            "scripts/wb-catalogue.ts and re-run the import to bring it back.",
        },
        { status: 409 },
      );
    }
  }

  try {
    const rows = await sql()`
      update datasets set
        verified = ${verify},
        verified_on = ${verify ? new Date().toISOString().slice(0, 10) : null},
        is_active = ${verify}
      where slug = ${slug}
      returning slug, verified, verified_on, is_active
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: "unknown dataset" }, { status: 404 });
    }

    return NextResponse.json({ dataset: rows[0] });
  } catch (error) {
    // The CHECK constraint is the backstop if this route's own logic is ever
    // wrong - a rejected write here means that backstop just did its job.
    console.error("[api/admin/verify] update failed", error);
    return NextResponse.json({ error: "update rejected" }, { status: 409 });
  }
}
