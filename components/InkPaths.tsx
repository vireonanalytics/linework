"use client";

import type { Geometry } from "@/lib/chart/geometry";
import { unitsToPathD } from "@/lib/chart/path";

type Props = {
  geometry: Geometry;
  /** Stored paths: unit values in 0..1, evenly spread across the region. */
  paths: number[][];
  /** Which ink layer this is. Drives colour, weight and opacity from CSS. */
  variant: "crowd" | "guess";
};

/**
 * The ink layer. One guess or ten thousand, this is the only thing that draws
 * a drawn path.
 *
 * The signature element of the design lives here: every path multiplies
 * against what is already on the paper, so where many people drew the same
 * line the ink piles toward black on its own. Density becomes the histogram -
 * no binning, no percentile maths, just overprinting.
 *
 * Two details are load-bearing and easy to break:
 *
 * 1. `mix-blend-mode` and `opacity` sit on each <path>, never on the <g>.
 *    Putting either on the group would give the group its own stacking
 *    context: the paths would composite with each other first and the group
 *    would blend once, as a single flat shape. The stacking effect would
 *    vanish and it would look like one translucent smear.
 *
 * 2. The <g> must not get opacity, filter or transform for the same reason.
 *
 * Phase 4 passes thousands of paths here at --crowd-path-opacity. The player's
 * own guess is the same component with one path at --guess-opacity, because
 * their answer has to be legible. Same rendering path, genuinely - not a
 * lookalike that can drift.
 */
export function InkPaths({ geometry, paths, variant }: Props) {
  if (paths.length === 0) return null;

  return (
    <g className={`ink-layer ink-layer--${variant}`} aria-hidden="true">
      {paths.map((path, index) => (
        <path key={index} d={unitsToPathD(geometry, path)} />
      ))}
    </g>
  );
}
