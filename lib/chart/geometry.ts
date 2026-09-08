import type { Dataset } from "../types/dataset.ts";

export type ChartSize = { width: number; height: number };
export type ChartMargins = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

/**
 * Everything needed to convert between data space and pixel space, derived
 * fresh from a measured size. Never cache one of these across a resize or an
 * orientation change - build a new one.
 *
 * The SVG is rendered at its measured CSS size with no viewBox scaling, so one
 * unit here is one CSS pixel.
 */
export type Geometry = {
  size: ChartSize;
  margins: ChartMargins;
  plotLeft: number;
  plotRight: number;
  plotTop: number;
  plotBottom: number;
  plotWidth: number;
  plotHeight: number;
  /** x pixel of the first drawable point (the boundary). */
  drawStartX: number;
  /** x pixel of the last point in the series. */
  drawEndX: number;
  drawWidth: number;
  xForIndex: (index: number) => number;
  indexForX: (px: number) => number;
  yForValue: (value: number) => number;
  valueForY: (px: number) => number;
  /** value -> 0..1 across yDomain, 0 at the domain minimum. */
  normalize: (value: number) => number;
  /** 0..1 across yDomain -> value. */
  denormalize: (unit: number) => number;
  /** 0..1 across yDomain -> y pixel. */
  yForUnit: (unit: number) => number;
  /** y pixel -> 0..1 across yDomain, clamped. */
  unitForY: (px: number) => number;
};

export const DEFAULT_MARGINS: ChartMargins = {
  top: 16,
  right: 16,
  bottom: 32,
  left: 44,
};

/**
 * Axis ticks a person would have chosen: multiples of 1, 2 or 5 times a power
 * of ten, landing near `target` of them.
 *
 * Dividing the domain into equal parts is what produces axes labelled
 * 0/18/35/53/70, which reads as machine output because it is. The last tick may
 * fall short of the domain maximum; that is correct and intentional.
 */
export function niceTicks(
  domain: [number, number],
  target: number = 5,
): number[] {
  const [min, max] = domain;
  const span = max - min;
  if (!(span > 0) || !Number.isFinite(span)) return [min];

  const rawStep = span / Math.max(1, target - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;

  // Round to the nearest of 1, 2, 5, 10 on a log scale, so a raw step of 1.75
  // becomes 2 rather than being forced down to 1.
  const unit =
    normalized < Math.SQRT2
      ? 1
      : normalized < Math.sqrt(10)
        ? 2
        : normalized < Math.sqrt(50)
          ? 5
          : 10;

  const step = unit * magnitude;
  const first = Math.ceil(min / step - 1e-9) * step;
  const count = Math.floor((max - first) / step + 1e-9) + 1;

  // Steps below 1 accumulate float error fast (0.2 * 3 is not 0.6), so each
  // tick is rounded to the precision the step itself implies.
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));

  return Array.from({ length: Math.max(0, count) }, (_, i) =>
    Number((first + step * i).toFixed(decimals)),
  );
}

export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function createGeometry(
  dataset: Dataset,
  size: ChartSize,
  margins: ChartMargins = DEFAULT_MARGINS,
): Geometry {
  const plotLeft = margins.left;
  const plotTop = margins.top;
  const plotWidth = Math.max(1, size.width - margins.left - margins.right);
  const plotHeight = Math.max(1, size.height - margins.top - margins.bottom);
  const plotRight = plotLeft + plotWidth;
  const plotBottom = plotTop + plotHeight;

  const lastIndex = dataset.xValues.length - 1;
  const [domainMin, domainMax] = dataset.yDomain;
  const domainSpan = domainMax - domainMin || 1;

  const xForIndex = (index: number) =>
    plotLeft + (index / lastIndex) * plotWidth;

  const indexForX = (px: number) =>
    ((clamp(px, plotLeft, plotRight) - plotLeft) / plotWidth) * lastIndex;

  const normalize = (value: number) => (value - domainMin) / domainSpan;
  const denormalize = (unit: number) => domainMin + unit * domainSpan;

  // y is inverted: the domain maximum sits at the top of the plot.
  const yForUnit = (unit: number) => plotBottom - unit * plotHeight;
  const unitForY = (px: number) =>
    clamp((plotBottom - px) / plotHeight, 0, 1);

  return {
    size,
    margins,
    plotLeft,
    plotRight,
    plotTop,
    plotBottom,
    plotWidth,
    plotHeight,
    drawStartX: xForIndex(dataset.revealFromIndex),
    drawEndX: xForIndex(lastIndex),
    drawWidth: xForIndex(lastIndex) - xForIndex(dataset.revealFromIndex),
    xForIndex,
    indexForX,
    yForValue: (value) => yForUnit(normalize(value)),
    valueForY: (px) => denormalize(unitForY(px)),
    normalize,
    denormalize,
    yForUnit,
    unitForY,
  };
}
