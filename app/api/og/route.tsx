import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

/*
 * nodejs, not edge - edge is deprecated in this Next.js version and every
 * other route in this app already runs nodejs for the same reason
 * (postgres.js needs a real TCP socket). This route does not touch Postgres,
 * but there is no upside to being the one route on a different runtime.
 */
export const runtime = "nodejs";

/**
 * Dynamic share images. "Score pattern visible, chart shapes not spoiled" -
 * this draws an ABSTRACT pattern of dashes whose height encodes the score,
 * never the real chart curve. Someone sharing a link should not be able to
 * hand a friend the answer to a chart that friend hasn't drawn yet.
 *
 * Hardcoded hex values below are a deliberate, documented exception to
 * "every colour through a tokens.css custom property" - docs/DESIGN.md's design
 * system section names "OG images, static exports" as exactly the contexts
 * where that rule cannot apply, because this route renders via Satori
 * (next/og), a separate server-side rendering engine with no CSS cascade to
 * inherit tokens.css from. scripts/check-design.sh allowlists this one file
 * for exactly that reason - see the comment there.
 */
const PAPER = "#d9dfe4";
const INK_CROWD = "#3d5588";
const INK_TRUTH = "#ff48b0";
const INK_BLACK = "#1c1e22";
const INK_HIGHLIGHT = "#ffe800";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const title = (params.get("title") ?? "Linework").slice(0, 80);
  const scoreRaw = Number(params.get("score"));
  const score = Number.isFinite(scoreRaw) ? clamp(Math.round(scoreRaw), 0, 100) : null;

  // A deterministic, meaningless-shaped pattern seeded by the score itself -
  // NOT the dataset's real curve. Same score always produces the same
  // pattern, so a repost looks consistent, but it carries zero information
  // about the actual chart.
  const bars = Array.from({ length: 24 }, (_, i) => {
    const seed = ((score ?? 50) * 7 + i * 31) % 97;
    return 20 + (seed / 96) * 60;
  });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          background: PAPER,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            style={{
              display: "flex",
              fontSize: 22,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: INK_CROWD,
            }}
          >
            Linework
          </div>
          <div style={{ display: "flex", fontSize: 40, color: INK_BLACK, maxWidth: 900 }}>
            {title}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 140 }}>
          {bars.map((height, i) => (
            <div
              key={i}
              style={{
                width: 24,
                height: `${height}%`,
                background: i % 5 === 2 ? INK_TRUTH : INK_CROWD,
                opacity: i % 5 === 2 ? 1 : 0.55,
              }}
            />
          ))}
        </div>

        {score !== null ? (
          <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
            <div
              style={{
                display: "flex",
                fontSize: 96,
                fontWeight: 700,
                color: INK_BLACK,
                background: INK_HIGHLIGHT,
                padding: "0 20px",
              }}
            >
              {score}
            </div>
            <div style={{ display: "flex", fontSize: 24, color: INK_CROWD }}>
              out of 100
            </div>
          </div>
        ) : null}
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
