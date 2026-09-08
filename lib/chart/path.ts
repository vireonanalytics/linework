import type { Geometry } from "./geometry.ts";

export type PixelPoint = { x: number; y: number };

/** An SVG path `d` string through points already in pixel space. */
export function pointsToPathD(points: PixelPoint[]): string {
  if (points.length === 0) return "";
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
}

/**
 * An SVG path `d` string for a stored path: unit values in 0..1 spread evenly
 * across the drawable region.
 *
 * This is the one conversion from stored path to screen. The player's guess,
 * a crowd of thousands, and any future replay all go through it, so they
 * cannot drift apart.
 */
export function unitsToPathD(geometry: Geometry, units: number[]): string {
  if (units.length < 2) return "";

  const step = geometry.drawWidth / (units.length - 1);

  return pointsToPathD(
    units.map((unit, i) => ({
      x: geometry.drawStartX + step * i,
      y: geometry.yForUnit(unit),
    })),
  );
}
