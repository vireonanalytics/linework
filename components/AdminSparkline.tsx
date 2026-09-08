/**
 * "How will the graph look during the game" - a compact, honest preview of
 * the FULL series (revealed and hidden portions both), for an admin
 * deciding whether a source's curve looks legitimate before verifying it.
 *
 * This is NOT the game's own Chart component reused: the game chart is
 * pointer-interactive, paints a boundary and a drawable region, and
 * deliberately hides the future - none of which an admin preview needs or
 * wants. A small dedicated SVG polyline is simpler and cannot accidentally
 * inherit gameplay behaviour it shouldn't have.
 */
export function AdminSparkline({
  yValues,
  yDomain,
  revealFromIndex,
  width = 220,
  height = 48,
}: {
  yValues: number[];
  yDomain: [number, number];
  revealFromIndex: number;
  width?: number;
  height?: number;
}) {
  const [min, max] = yDomain;
  const span = max - min || 1;
  const lastIndex = yValues.length - 1;

  const toPoint = (index: number) => {
    const x = (index / lastIndex) * width;
    const y = height - ((yValues[index] - min) / span) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };

  const knownPoints = yValues
    .slice(0, revealFromIndex + 1)
    .map((_, i) => toPoint(i))
    .join(" ");

  const futurePoints = yValues
    .slice(revealFromIndex)
    .map((_, i) => toPoint(i + revealFromIndex))
    .join(" ");

  const boundaryX = (revealFromIndex / lastIndex) * width;

  return (
    <svg
      className="admin-sparkline"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label="Preview of the full series, revealed portion in black, hidden portion in pink"
    >
      <line
        x1={boundaryX}
        y1={0}
        x2={boundaryX}
        y2={height}
        className="admin-sparkline-boundary"
      />
      <polyline points={knownPoints} className="admin-sparkline-known" />
      <polyline points={futurePoints} className="admin-sparkline-future" />
    </svg>
  );
}
