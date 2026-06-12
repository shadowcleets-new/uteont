interface Series {
  label: string;
  values: number[];
  stroke: string;
  fill: string;
}

interface AreaChartProps {
  series: Series[];
  labels: string[];
  height?: number;
}

/**
 * Pair-of-areas chart with a shared x-axis. SVG only — no chart library.
 * Designed for the impressions + clicks pair so the relationship is
 * read as "the smaller pile fits under the bigger".
 */
export function AreaChart({ series, labels, height = 240 }: AreaChartProps) {
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
  const padLeft = 36;
  const padRight = 16;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const max = Math.max(
    1,
    ...series.flatMap((s) => s.values),
  );
  const step = plotW / (labels.length - 1);

  function pathFor(values: number[]): string {
    const top = values
      .map((v, i) => {
        const x = padLeft + i * step;
        const y = padTop + plotH - (v / max) * plotH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    const start = `${padLeft},${padTop + plotH}`;
    const end = `${padLeft + plotW},${padTop + plotH}`;
    return `M${start} L${top} L${end} Z`;
  }

  function lineFor(values: number[]): string {
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
        {/* Y-axis ticks */}
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
                {Math.round(max * t).toLocaleString()}
              </text>
            </g>
          );
        })}

        {/* Areas (back-to-front: largest first) */}
        {series.map((s) => (
          <path key={`area-${s.label}`} d={pathFor(s.values)} fill={s.fill} opacity={0.6} />
        ))}
        {series.map((s) => (
          <path
            key={`line-${s.label}`}
            d={lineFor(s.values)}
            fill="none"
            stroke={s.stroke}
            strokeWidth={1.5}
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
          </span>
        ))}
      </div>
    </div>
  );
}
