import { chartThemeClass } from "@/lib/chart/palette";
import { PATH_MAX } from "@/lib/drawing/resample";

/**
 * A past answer, redrawn small: the real series plus the line the player
 * actually drew, in that chart's own ink pair.
 *
 * Not the game's Chart component reused - that one is pointer-interactive,
 * hides the future, and owns a drawing surface, none of which a read-only
 * record wants. Same reasoning as AdminSparkline; this one differs from
 * that by also plotting the stored guess, which is the entire point of a
 * history view. A score alone is not a memory of a drawing.
 */
export function HistorySparkline({
  yValues,
  yDomain,
  revealFromIndex,
  path,
  slug,
  width = 260,
  height = 68,
}: {
  yValues: number[];
  yDomain: [number, number];
  revealFromIndex: number;
  /** The stored guess, 0..PATH_MAX, one point per resampled x position. */
  path: number[];
  slug: string;
  width?: number;
  height?: number;
}) {
  const [min, max] = yDomain;
  const span = max - min || 1;
  const lastIndex = yValues.length - 1;

  const truthPoint = (index: number) => {
    const x = (index / lastIndex) * width;
    const y = height - ((yValues[index] - min) / span) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };

  const truth = yValues.map((_, i) => truthPoint(i)).join(" ");

  /*
   * The guess covers only the drawable region - from the boundary to the
   * right edge - so its x positions are mapped across that span, not across
   * the whole chart. Getting this wrong would draw the guess over the
   * already-revealed years, which is the one place it never was.
   */
  const startX = (revealFromIndex / lastIndex) * width;
  const guess = path
    .map((value, i) => {
      const x = startX + (i / (path.length - 1)) * (width - startX);
      const y = height - (value / PATH_MAX) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      className={`history-spark ${chartThemeClass(slug)}`}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label="Your line against the real one"
    >
      <line
        x1={startX}
        y1={0}
        x2={startX}
        y2={height}
        className="admin-sparkline-boundary"
      />
      <polyline points={guess} className="history-spark-guess" />
      <polyline points={truth} className="history-spark-truth" />
    </svg>
  );
}
