/**
 * The Phase 5 content-authoring format: turn a handful of real, sourced
 * anchor points into a full annual series by piecewise-linear interpolation.
 *
 * This is deliberately NOT curve-fitting or smoothing. A spline between
 * sparse anchors would look more polished and be a bigger fabrication - it
 * would invent a specific shape between two real points that nobody
 * measured. A straight line between anchors claims exactly as much precision
 * as the anchors themselves carry: "the real value was roughly this at these
 * points, and I am guessing linearly in between until a human pulls the
 * exact annual series." Every dataset built this way ships `verified: false`
 * until that happens - see lib/datasets/index.ts and data/SOURCES.md.
 */

export type AnchorPoint = { year: number; value: number };

/**
 * anchors must be sorted by year and cover the full range that will be
 * queried - interpolateAnnualSeries does not extrapolate past the first or
 * last anchor.
 */
export function interpolateAnnualSeries(
  anchors: readonly AnchorPoint[],
): { xValues: string[]; yValues: number[] } {
  if (anchors.length < 2) {
    throw new Error("interpolateAnnualSeries: need at least two anchor points");
  }

  for (let i = 1; i < anchors.length; i += 1) {
    if (anchors[i].year <= anchors[i - 1].year) {
      throw new Error("interpolateAnnualSeries: anchors must be strictly increasing by year");
    }
  }

  const startYear = anchors[0].year;
  const endYear = anchors[anchors.length - 1].year;

  const xValues: string[] = [];
  const yValues: number[] = [];

  let segment = 0;

  for (let year = startYear; year <= endYear; year += 1) {
    while (year > anchors[segment + 1].year) segment += 1;

    const a = anchors[segment];
    const b = anchors[segment + 1];
    const t = (year - a.year) / (b.year - a.year);
    const value = a.value + t * (b.value - a.value);

    xValues.push(String(year));
    // One decimal place: enough to keep the interpolation from looking like
    // an obviously-fake round number, not enough to imply precision nobody
    // measured.
    yValues.push(Math.round(value * 10) / 10);
  }

  return { xValues, yValues };
}
