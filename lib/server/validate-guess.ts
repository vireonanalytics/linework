import { PATH_MAX, PATH_POINTS } from "../drawing/resample.ts";

/**
 * Strict validation of the request body.
 *
 * Everything here arrives from the open internet, so nothing is trusted and
 * nothing is coerced - a string "40" is a rejection, not a number. The
 * database has its own constraints behind this, but a 400 with a reason is a
 * better outcome than a constraint violation.
 *
 * Note what is NOT in this type: score, meanAbsError, meanSignedError. The
 * client computes those to show the player instantly, but the server
 * recomputes them from its own copy of the truth and stores only its own
 * numbers. A submitted score is ignored, not validated.
 */

export type GuessPayload = {
  slug: string;
  path: number[];
  drawMs: number;
  redrawCount: number;
  viewportWidth: number;
};

export type ParseResult =
  | { ok: true; value: GuessPayload }
  | { ok: false; error: string };

const SLUG = /^[a-z0-9-]{1,80}$/;

/** Twenty minutes. Beyond this the tab was left open, not drawn on. */
const MAX_DRAW_MS = 20 * 60 * 1000;

function isInt(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

export function parseGuessPayload(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "body must be a JSON object" };
  }

  const raw = body as Record<string, unknown>;

  if (typeof raw.slug !== "string" || !SLUG.test(raw.slug)) {
    return { ok: false, error: "slug must be a url-safe string" };
  }

  if (!Array.isArray(raw.path)) {
    return { ok: false, error: "path must be an array" };
  }

  if (raw.path.length !== PATH_POINTS) {
    return {
      ok: false,
      error: `path must hold exactly ${PATH_POINTS} points, got ${raw.path.length}`,
    };
  }

  for (const point of raw.path) {
    if (!isInt(point, 0, PATH_MAX)) {
      return {
        ok: false,
        error: `every path point must be an integer in 0..${PATH_MAX}`,
      };
    }
  }

  if (!isInt(raw.drawMs, 0, MAX_DRAW_MS)) {
    return { ok: false, error: "drawMs must be an integer in milliseconds" };
  }

  if (!isInt(raw.redrawCount, 0, 10_000)) {
    return { ok: false, error: "redrawCount must be a non-negative integer" };
  }

  if (!isInt(raw.viewportWidth, 1, 20_000)) {
    return { ok: false, error: "viewportWidth must be a plausible pixel width" };
  }

  return {
    ok: true,
    value: {
      slug: raw.slug,
      path: raw.path as number[],
      drawMs: raw.drawMs,
      redrawCount: raw.redrawCount,
      viewportWidth: raw.viewportWidth,
    },
  };
}
