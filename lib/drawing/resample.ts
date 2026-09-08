/**
 * Turning a raw pointer stroke into the fixed-width path that gets stored.
 *
 * Pure numbers in, pure numbers out. No React, no DOM, no Dataset.
 */

/** Every stored path is exactly this many points. Changing it breaks Phase 3. */
export const PATH_POINTS = 40;

/** Stored y values are integers in [0, PATH_MAX]. */
export const PATH_MAX = 1000;

export type StrokePoint = { x: number; y: number };

/**
 * Resample a stroke to `count` evenly spaced x positions between startX and
 * endX, by linear interpolation between the two neighbouring raw points.
 *
 * The stroke is assumed to be monotonic in x (the drawing surface enforces
 * that at capture time). If the stroke starts late its first y is held
 * backward; if it stops short its final y is held forward.
 *
 * Returns `count` y values in the same units as the input.
 */
export function resampleStroke(
  stroke: StrokePoint[],
  startX: number,
  endX: number,
  count: number = PATH_POINTS,
): number[] {
  if (stroke.length === 0) {
    throw new Error("resampleStroke: empty stroke");
  }
  if (count < 2) {
    throw new Error("resampleStroke: count must be at least 2");
  }

  const out = new Array<number>(count);
  const span = endX - startX;

  // Walks forward with the sample loop: both are sorted, so this stays O(n + count).
  let cursor = 0;

  for (let i = 0; i < count; i += 1) {
    const targetX = startX + (span * i) / (count - 1);

    while (
      cursor < stroke.length - 2 &&
      stroke[cursor + 1].x < targetX
    ) {
      cursor += 1;
    }

    const a = stroke[cursor];
    const b = stroke[cursor + 1];

    if (b === undefined) {
      // Past the end of the stroke: hold the last value forward.
      out[i] = a.y;
      continue;
    }

    if (targetX <= a.x) {
      // Before the start of the stroke: hold the first value backward.
      out[i] = a.y;
      continue;
    }

    if (targetX >= b.x) {
      out[i] = b.y;
      continue;
    }

    const segment = b.x - a.x;
    const t = segment === 0 ? 0 : (targetX - a.x) / segment;
    out[i] = a.y + t * (b.y - a.y);
  }

  return out;
}

/**
 * How much of the drawable width the stroke actually covers, 0..1.
 * Used to decide whether the player has drawn far enough to reveal.
 */
export function strokeSpanFraction(
  stroke: StrokePoint[],
  startX: number,
  endX: number,
): number {
  if (stroke.length < 2) return 0;
  const width = endX - startX;
  if (width <= 0) return 0;

  let min = stroke[0].x;
  let max = stroke[0].x;
  for (const point of stroke) {
    if (point.x < min) min = point.x;
    if (point.x > max) max = point.x;
  }

  return Math.max(0, Math.min(1, (max - min) / width));
}

/** 0..1 unit values -> integers in [0, PATH_MAX], the stored representation. */
export function quantize(units: number[]): number[] {
  return units.map((unit) => {
    const scaled = Math.round(unit * PATH_MAX);
    return scaled < 0 ? 0 : scaled > PATH_MAX ? PATH_MAX : scaled;
  });
}

/** Stored integers -> 0..1 unit values. */
export function dequantize(path: number[]): number[] {
  return path.map((value) => value / PATH_MAX);
}

/** True if every point in the path is identical - a straight horizontal drag. */
export function hasZeroVariance(path: number[]): boolean {
  if (path.length === 0) return true;
  return path.every((value) => value === path[0]);
}
