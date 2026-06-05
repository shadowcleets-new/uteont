interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  className?: string;
}

/**
 * Tiny SVG polyline sparkline — no chart library, no client JS. Renders
 * a flat baseline when fewer than two points are supplied so the card
 * still has visual rhythm during the empty state.
 */
export function Sparkline({
  values,
  width = 88,
  height = 24,
  stroke = "#6a9bcc",
  className,
}: SparklineProps) {
  if (values.length < 2) {
    return (
      <svg
        aria-hidden
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={className}
      >
        <line
          x1={0}
          y1={height - 1}
          x2={width}
          y2={height - 1}
          stroke="#e8e6dc"
          strokeWidth={1}
        />
      </svg>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const points = values
    .map((v, i) => {
      const x = i * step;
      const y = height - 1 - ((v - min) / range) * (height - 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      aria-hidden
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
    >
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}
