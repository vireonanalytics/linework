import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { exportGuessesForDataset } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Download every stored response for one dataset, as CSV or JSON.
 *
 * "Admins should be able to download the structured data of user replies for
 * every question" (2026-08-27). This is the research output leaving the
 * building, which makes it the single most sensitive route in the project -
 * see exportGuessesForDataset() in lib/server/db.ts for what is deliberately
 * NOT in the payload (no email, no display name, no user id, no session id).
 *
 * Gated on session.user.role === 'admin', read from the database at sign-in,
 * never a hardcoded email comparison - the same gate every other admin route
 * uses.
 *
 * ?format=json returns the rows as JSON; anything else returns CSV, because
 * CSV is what opens in the spreadsheet an analyst actually has.
 */

/**
 * RFC 4180 quoting. Every field is quoted unconditionally rather than only
 * when it contains a comma: it costs a few bytes and removes an entire class
 * of "the export looked fine until one dataset had a comma in its title" bug.
 * Embedded quotes are doubled, which is how CSV escapes them.
 */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const text = Array.isArray(value) ? value.join(" ") : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

const COLUMNS = [
  "guess_id",
  "created_at",
  "is_registered",
  "score",
  "mean_abs_error",
  "mean_signed_error",
  "draw_ms",
  "redraw_count",
  "viewport_w",
  "country",
  "device_type",
  "city",
  "state",
  "birth_year",
  "is_suspect",
  "suspect_reasons",
  "path",
] as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "not permitted" }, { status: 403 });
  }

  const { slug } = await params;

  let rows;
  try {
    rows = await exportGuessesForDataset(slug);
  } catch (error) {
    console.error("[api/admin/export] query failed", error);
    return NextResponse.json({ error: "storage unavailable" }, { status: 503 });
  }

  if (rows === null) {
    return NextResponse.json({ error: "unknown dataset" }, { status: 404 });
  }

  const format = request.nextUrl.searchParams.get("format");
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "json") {
    return new NextResponse(JSON.stringify({ slug, exportedAt: stamp, rows }, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${slug}-${stamp}.json"`,
      },
    });
  }

  const body = [
    COLUMNS.join(","),
    ...rows.map((r) =>
      [
        r.guessId,
        r.createdAt,
        r.isRegistered,
        r.score,
        r.meanAbsError,
        r.meanSignedError,
        r.drawMs,
        r.redrawCount,
        r.viewportW,
        r.country,
        r.deviceType,
        r.city,
        r.state,
        r.birthYear,
        r.isSuspect,
        // Space-separated inside one quoted cell, so a reason list never
        // splits across columns.
        r.suspectReasons,
        // The 40 stored points, space-separated. One cell, so the column
        // count stays fixed no matter what path_resolution ever becomes.
        r.path,
      ]
        .map(csvCell)
        .join(","),
    ),
  ].join("\n");

  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${slug}-${stamp}.csv"`,
    },
  });
}
