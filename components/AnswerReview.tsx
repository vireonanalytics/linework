"use client";

import { useMemo } from "react";
import { Chart } from "@/components/Chart";
import { useElementSize } from "@/components/useElementSize";
import { createGeometry } from "@/lib/chart/geometry";
import { dequantize } from "@/lib/drawing/resample";
import { chartThemeClass } from "@/lib/chart/palette";
import type { Dataset } from "@/lib/types/dataset";

/**
 * One answered chart, replayed. Read only, and unplayable by construction.
 *
 * Requested 2026-08-27: "users need to be able to click on their answered
 * charts in YOUR ANSWERS ... they can not play them again, they can just see
 * their line, correct line, and the lines of other people if there are 50
 * answers already."
 *
 * Reuses the game's own <Chart> rather than drawing a second, larger
 * sparkline. That matters for honesty as much as for effort: a separate
 * renderer would eventually disagree with the game about where a line sits,
 * and this page exists precisely so someone can look again at what they drew.
 * Same component, same geometry, same paint order - only the interaction is
 * removed.
 *
 * `locked` and a no-op handler set are what make it unplayable. There is no
 * pointer state here at all, so there is nothing to draw WITH; the guess is
 * passed in already stored and already scored.
 */
const NO_HANDLERS = {
  onPointerDown: () => {},
  onPointerMove: () => {},
  onPointerUp: () => {},
  onPointerCancel: () => {},
};

export function AnswerReview({
  dataset,
  path,
  crowdPaths,
}: {
  dataset: Dataset;
  /** The player's stored guess, 0..1000 as written to the database. */
  path: number[];
  /** Other people's lines, already threshold-checked server side. */
  crowdPaths: number[][];
}) {
  const { ref: surfaceRef, size } = useElementSize<SVGSVGElement>();

  const geometry = useMemo(
    () => (size ? createGeometry(dataset, size) : null),
    [dataset, size],
  );

  // The stored 0..1000 integers are dequantized back to the 0..1 units Chart
  // expects - the same conversion the live game does, so a replayed line lands
  // exactly where it did when it was drawn.
  const guessUnits = useMemo(() => dequantize(path), [path]);
  const crowdUnits = useMemo(
    () => crowdPaths.map((p) => dequantize(p)),
    [crowdPaths],
  );

  return (
    <div className={chartThemeClass(dataset.slug)}>
      <Chart
        dataset={dataset}
        geometry={geometry}
        stroke={[]}
        guessUnits={guessUnits}
        crowdPaths={crowdUnits}
        revealed
        locked
        handlers={NO_HANDLERS}
        surfaceRef={surfaceRef}
      />
    </div>
  );
}
