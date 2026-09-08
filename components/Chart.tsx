"use client";

import type React from "react";
import { niceTicks, type Geometry } from "@/lib/chart/geometry";
import { pointsToPathD } from "@/lib/chart/path";
import type { StrokePoint } from "@/lib/drawing/resample";
import type { Dataset } from "@/lib/types/dataset";
import type { SurfaceHandlers } from "@/components/useDrawingSurface";
import { InkPaths } from "@/components/InkPaths";

type Props = {
  dataset: Dataset;
  geometry: Geometry | null;
  /** Live raw stroke, in pixels. Rendered while the finger is down. */
  stroke: StrokePoint[];
  /** Resampled guess as 0..1 unit values, one per PATH_POINTS. */
  guessUnits: number[] | null;
  /**
   * Other people's paths, same format as the guess. Empty until Phase 4.
   * In preview mode these are FABRICATED - see lib/crowd/synthetic.ts.
   */
  crowdPaths: number[][];
  /** True once the truth should be on screen. */
  revealed: boolean;
  locked: boolean;
  handlers: SurfaceHandlers;
  surfaceRef: React.Ref<SVGSVGElement>;
};

/** Minimum horizontal gap between two x-axis labels, in pixels. */
const LABEL_MIN_GAP = 54;

/**
 * Pick which x values get a label at the current width.
 *
 * The first point, the last point and the boundary year always get one - they
 * are the three the player actually needs. Everything else is filled in only
 * where there is room, so labels never collide on a narrow phone.
 */
function pickLabelIndices(
  lastIndex: number,
  revealFromIndex: number,
  xForIndex: (index: number) => number,
): number[] {
  const accepted = [0, revealFromIndex, lastIndex];

  const fits = (index: number) =>
    accepted.every(
      (other) => Math.abs(xForIndex(index) - xForIndex(other)) >= LABEL_MIN_GAP,
    );

  for (let index = 1; index < lastIndex; index += 1) {
    if (fits(index)) accepted.push(index);
  }

  return accepted.sort((a, b) => a - b);
}

/**
 * Pure rendering. Knows a Dataset and a Geometry and nothing else - no state
 * machine, no pointer logic, no idea which dataset it was handed.
 *
 * Paint order is the design. Paper, then the grid pressed into it, then the
 * crowd's ink, then the player's ink, then the truth over everything. Real
 * data prints last and prints on top.
 */
export function Chart({
  dataset,
  geometry,
  stroke,
  guessUnits,
  crowdPaths,
  revealed,
  locked,
  handlers,
  surfaceRef,
}: Props) {
  const lastIndex = dataset.xValues.length - 1;

  const knownPath = geometry
    ? pointsToPathD(
        dataset.yValues
          .slice(0, dataset.revealFromIndex + 1)
          .map((value, index) => ({
            x: geometry.xForIndex(index),
            y: geometry.yForValue(value),
          })),
      )
    : "";

  const futurePath = geometry
    ? pointsToPathD(
        dataset.yValues.slice(dataset.revealFromIndex).map((value, offset) => ({
          x: geometry.xForIndex(dataset.revealFromIndex + offset),
          y: geometry.yForValue(value),
        })),
      )
    : "";

  // The raw stroke is only on screen while drawing; once it resamples it goes
  // through the ink layer like everything else.
  const livePath = geometry && !guessUnits ? pointsToPathD(stroke) : "";

  const labelIndices = geometry
    ? pickLabelIndices(lastIndex, dataset.revealFromIndex, geometry.xForIndex)
    : [];

  return (
    <svg
      ref={surfaceRef}
      className={`chart-surface${locked ? " chart-surface--locked" : ""}`}
      role="img"
      aria-label={`${dataset.title}. ${dataset.question}`}
      {...handlers}
    >
      <title>{dataset.title}</title>
      <desc>{dataset.question}</desc>

      {geometry ? (
        <>
          {/* The part the player has to predict, marked as empty. */}
          <rect
            className="region-future"
            x={geometry.drawStartX}
            y={geometry.plotTop}
            width={Math.max(0, geometry.drawEndX - geometry.drawStartX)}
            height={geometry.plotHeight}
          />

          <g aria-hidden="true">
            {niceTicks(dataset.yDomain).map((value) => {
              const y = geometry.yForValue(value);
              return (
                <g key={value}>
                  <line
                    className="axis-rule"
                    x1={geometry.plotLeft}
                    y1={y}
                    x2={geometry.plotRight}
                    y2={y}
                  />
                  <text
                    className="axis-label"
                    x={geometry.plotLeft - 8}
                    y={y}
                    textAnchor="end"
                    dominantBaseline="middle"
                  >
                    {value}
                  </text>
                </g>
              );
            })}

            {labelIndices.map((index) => (
              <text
                key={dataset.xValues[index]}
                className="axis-label"
                x={geometry.xForIndex(index)}
                y={geometry.plotBottom + 18}
                textAnchor={
                  index === 0 ? "start" : index === lastIndex ? "end" : "middle"
                }
              >
                {dataset.xValues[index]}
              </text>
            ))}
          </g>

          <line
            className="boundary"
            x1={geometry.drawStartX}
            y1={geometry.plotTop}
            x2={geometry.drawStartX}
            y2={geometry.plotBottom}
          />

          {/* Everyone else's ink, stacking toward black where they agreed. */}
          <InkPaths geometry={geometry} paths={crowdPaths} variant="crowd" />

          {/* The player's own ink, through the same layer at full strength. */}
          {guessUnits ? (
            <InkPaths geometry={geometry} paths={[guessUnits]} variant="guess" />
          ) : null}

          {livePath ? <path className="path-live" d={livePath} /> : null}

          {/* Real data prints last. */}
          <path className="path-truth-known" d={knownPath} />

          {revealed ? (
            <path
              className="path-truth-future path-truth-future--animated"
              d={futurePath}
              pathLength={1}
            />
          ) : null}

          <circle
            className="anchor-dot"
            cx={geometry.drawStartX}
            cy={geometry.yForValue(dataset.yValues[dataset.revealFromIndex])}
            r={3.5}
          />
        </>
      ) : null}
    </svg>
  );
}
