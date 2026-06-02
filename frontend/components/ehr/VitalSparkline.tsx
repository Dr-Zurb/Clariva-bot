"use client";

/**
 * VitalSparkline (EHR Sub-batch D / T5.22 — D.1).
 *
 * Tiny inline SVG line chart for vitals trend at-a-glance inside
 * <VitalsSection>. No external dependency — keeps the chart panel
 * lightweight (single-digit KB).
 *
 * Renders only when `values.length >= 2` (master-batch decision §24).
 * For 0 or 1 readings the component returns null; the caller is
 * expected to surface the "(1 reading)" label or an empty state.
 *
 * Optional `normalRange` shades a horizontal band representing the
 * physiologically normal interval for this vital (Decision §27 fixed
 * V1 ranges are owned by the section). The band is purely visual —
 * the chart still scales to data extremes, so a value outside the
 * band is visibly off the band.
 *
 * The trailing dot at the latest reading is the cue most doctors
 * scan first ("where are we now vs the line?").
 */

interface VitalSparklineProps {
  /** Chronological values (oldest → newest). */
  values: number[];
  width?: number;
  height?: number;
  /** Optional [low, high] band drawn behind the line. */
  normalRange?: [number, number];
  /** Stroke colour (defaults to blue-500). */
  stroke?: string;
  /** Visually hidden label for screen readers (e.g. "Heart rate trend"). */
  ariaLabel?: string;
}

const DEFAULT_WIDTH = 80;
const DEFAULT_HEIGHT = 24;
const PAD = 2;

export default function VitalSparkline({
  values,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  normalRange,
  stroke = "#3b82f6",
  ariaLabel,
}: VitalSparklineProps) {
  if (!values || values.length < 2) return null;

  const innerW = width - PAD * 2;
  const innerH = height - PAD * 2;

  // Combine value range with the normal band so the band is always
  // visible even when all readings sit outside it.
  const candidates = normalRange ? [...values, ...normalRange] : values;
  const min = Math.min(...candidates);
  const max = Math.max(...candidates);
  const span = max - min || 1; // avoid div-by-zero on flat lines

  const xStep = innerW / (values.length - 1);
  const points = values
    .map((v, i) => {
      const x = PAD + i * xStep;
      const y = PAD + innerH - ((v - min) / span) * innerH;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const lastX = PAD + (values.length - 1) * xStep;
  const lastY =
    PAD + innerH - ((values[values.length - 1] - min) / span) * innerH;

  // Optional shaded band for the normal range.
  let bandY = 0;
  let bandH = 0;
  if (normalRange) {
    const [lo, hi] = normalRange;
    const yHi = PAD + innerH - ((hi - min) / span) * innerH;
    const yLo = PAD + innerH - ((lo - min) / span) * innerH;
    bandY = Math.min(yHi, yLo);
    bandH = Math.abs(yLo - yHi);
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel ?? "Trend"}
      className="overflow-visible"
    >
      {normalRange && bandH > 0 && (
        <rect
          x={0}
          y={bandY}
          width={width}
          height={bandH}
          fill={stroke}
          opacity={0.08}
        />
      )}
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
      <circle cx={lastX} cy={lastY} r={1.75} fill={stroke} />
    </svg>
  );
}
