interface LineSeries {
  label: string;
  values: number[];
  stroke: string;
  /** Pin this series to a separate scale (e.g. revenue vs articles). */
  axis?: "left" | "right";
}

interface LineChartProps {
  series: LineSeries[];
  labels: string[];
  height?: number;
}

/**
 * Two-axis line chart pairing revenue (left) and article counts (right)
 * so the visual story is "publish more → earn more (eventually)".
 */
export function LineChart({ series, labels, height = 240 }: LineChartProps) {
  if (series.length === 0 || labels.length < 2) {
    return (
      <div
        style={{ height }}
        className="rounded-md border border-dashed border-[#e8e6dc] bg-[#faf9f5] flex items-center justify-center text-[12px] text-[#9a988e] italic"
      >
        No data to chart yet.
      </div>
    );
  }

  const width = 720;
  const padTop = 12;
  const padBottom = 28;
  const padLeft = 44;
  const padRight = 36;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const leftMax = Math.max(
    1,
    ...series.filter((s) => (s.axis ?? "left") === "left").flatMap((s) => s.values),
  );
  const rightMax = Math.max(
    1,
    ...series.filter((s) => s.axis === "right").flatMap((s) => s.values),
  );
  const step = plotW / (labels.length - 1);

  function lineFor(values: number[], axis: "left" | "right"): string {
    const max = axis === "right" ? rightMax : leftMax;
    return values
      .map((v, i) => {
        const x = padLeft + i * step;
        const y = padTop + plotH - (v / max) * plotH;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label={series.map((s) => s.label).join(" + ")}
      >
        {/* Grid + left axis ticks */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = padTop + plotH * (1 - t);
          return (
            <g key={t}>
              <line
                x1={padLeft}
                x2={padLeft + plotW}
                y1={y}
                y2={y}
                stroke="#f3f1ea"
                strokeWidth={1}
              />
              <text
                x={padLeft - 6}
                y={y + 3}
                fontSize={10}
                fill="#9a988e"
                textAnchor="end"
                fontFamily="ui-sans-serif, system-ui"
              >
                {(leftMax * t).toFixed(0)}
              </text>
              <text
                x={padLeft + plotW + 6}
                y={y + 3}
                fontSize={10}
                fill="#9a988e"
                textAnchor="start"
                fontFamily="ui-sans-serif, system-ui"
              >
                {Math.round(rightMax * t)}
              </text>
            </g>
          );
        })}

        {series.map((s) => (
          <path
            key={`line-${s.label}`}
            d={lineFor(s.values, s.axis ?? "left")}
            fill="none"
            stroke={s.stroke}
            strokeWidth={1.6}
          />
        ))}

        {/* X-axis ticks */}
        {labels.map((label, i) => {
          if (i % Math.ceil(labels.length / 7) !== 0 && i !== labels.length - 1) return null;
          const x = padLeft + i * step;
          return (
            <text
              key={`xt-${i}`}
              x={x}
              y={height - 8}
              fontSize={10}
              fill="#9a988e"
              textAnchor="middle"
              fontFamily="ui-sans-serif, system-ui"
            >
              {label.slice(5)}
            </text>
          );
        })}
      </svg>

      <div className="mt-2 flex items-center gap-4 text-[11px] text-[#6b6a64]">
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: s.stroke }}
            />
            {s.label}
            {s.axis === "right" ? " (right axis)" : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
