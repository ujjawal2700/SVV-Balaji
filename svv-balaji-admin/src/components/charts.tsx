/**
 * Small SVG chart kit for the report screens - stacked bars over time, a line
 * chart with a crosshair, horizontal share bars and a cohort heat table. No
 * chart library: these four forms are all the reports need.
 *
 * Colours are the validated reference palette (dataviz skill), in its fixed
 * order: slot 1 blue, slot 2 orange, slot 3 aqua. Series keep their slot
 * whatever is filtered, so B2B is always blue. Aqua is below 3:1 on white, so
 * every chart carries a legend, a tooltip and a table view alongside.
 */
import { Empty, Typography } from 'antd';
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export const SERIES = {
  blue: '#2a78d6',
  orange: '#eb6834',
  aqua: '#1baf7a',
} as const;

const INK = { primary: '#0b0b0b', secondary: '#52514e', muted: '#8a8984', grid: '#ebeae6', surface: '#ffffff' };

export interface Series<K extends string> {
  key: K;
  label: string;
  color: string;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(600);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** 1234567 -> "12.3L"; Indian grouping for axis ticks. */
export function compactInr(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e7) return `${(n / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr`;
  if (a >= 1e5) return `${(n / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L`;
  if (a >= 1e3) return `${+(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}

/** ₹1,234 for whole rupees, ₹1,234.50 otherwise - never ₹1,234.5. */
export const inr = (n: number) => {
  const whole = Math.round(n * 100) % 100 === 0;
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
};

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

/** Gridlines at round values: 25k -> 0/5k/10k/15k/20k/25k, 20k -> 0/5k/10k/15k/20k. */
function ticksFor(max: number): number[] {
  const lead = max / 10 ** Math.floor(Math.log10(max));
  const steps = lead === 2.5 || lead === 5 || lead === 10 ? 5 : 4;
  return Array.from({ length: steps + 1 }, (_, i) => (max * i) / steps);
}

export function Legend<K extends string>({ series }: { series: Series<K>[] }) {
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: INK.secondary }}>
      {series.map((s) => (
        <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, display: 'inline-block' }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const left = Math.min(Math.max(x + 12, 0), width - 200);
  return (
    <div
      style={{
        position: 'absolute', left, top: Math.max(0, y - 8), pointerEvents: 'none', zIndex: 2, minWidth: 160,
        background: INK.surface, border: `1px solid ${INK.grid}`, borderRadius: 8, padding: '8px 10px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.08)', fontSize: 12, color: INK.primary,
      }}
    >
      {children}
    </div>
  );
}

function TipRow({ color, label, value }: { color?: string; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: INK.secondary }}>
        {color ? <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} /> : null}
        {label}
      </span>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{value}</span>
    </div>
  );
}

/** Shorten a period label for the axis: "2026-10-08" -> "8 Oct", "2026-10" -> "Oct 26". */
export function periodLabel(p: string): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, m, d] = p.split('-');
  if (!d) return `${months[Number(m) - 1]} ${y.slice(2)}`;
  return `${Number(d)} ${months[Number(m) - 1]}`;
}

const PAD = { top: 12, right: 8, bottom: 26, left: 48 };

/** Stacked vertical bars, one per period. */
export function StackedBarChart<K extends string, R extends { period: string } & Record<K, number>>({
  data, series, height = 260, format = inr, tooltipExtra,
}: {
  data: R[];
  series: Series<K>[];
  height?: number;
  format?: (n: number) => string;
  tooltipExtra?: (row: R) => ReactNode;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const totals = data.map((r) => series.reduce((s, x) => s + (r[x.key] ?? 0), 0));
  const max = niceMax(Math.max(0, ...totals));
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const step = data.length ? plotW / data.length : plotW;
  const barW = Math.max(2, Math.min(36, step * 0.68));
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const ticks = ticksFor(max);
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(plotW / 56))));
  const empty = totals.every((t) => t === 0);

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      {empty ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No sales in this range" style={{ height, paddingTop: height / 4 }} />
      ) : (
        <svg width={width} height={height} role="img" onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={INK.grid} />
              <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill={INK.muted}>{compactInr(t)}</text>
            </g>
          ))}
          {data.map((r, i) => {
            const cx = PAD.left + step * i + step / 2;
            let acc = 0;
            const segs = series.map((s) => {
              const v = r[s.key] ?? 0;
              const y0 = y(acc);
              acc += v;
              return { s, v, top: y(acc), bottom: y0 };
            }).filter((g) => g.v > 0);
            return (
              <g key={r.period} opacity={hover === null || hover === i ? 1 : 0.55}>
                {segs.map((g, j) => {
                  const isTop = j === segs.length - 1;
                  const h = Math.max(1, g.bottom - g.top - (j > 0 ? 2 : 0)); // 2px surface gap between stacked fills
                  const r4 = isTop ? Math.min(4, barW / 2, h) : 0;
                  const x0 = cx - barW / 2;
                  const yTop = g.top;
                  return (
                    <path
                      key={g.s.key}
                      fill={g.s.color}
                      d={`M${x0},${yTop + h} V${yTop + r4} Q${x0},${yTop} ${x0 + r4},${yTop} H${x0 + barW - r4} Q${x0 + barW},${yTop} ${x0 + barW},${yTop + r4} V${yTop + h} Z`}
                    />
                  );
                })}
                {i % labelEvery === 0 ? (
                  <text x={cx} y={height - 8} textAnchor="middle" fontSize={11} fill={INK.muted}>{periodLabel(r.period)}</text>
                ) : null}
                <rect x={cx - step / 2} y={PAD.top} width={step} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} />
              </g>
            );
          })}
          <line x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} stroke={INK.muted} />
        </svg>
      )}
      {hover !== null && data[hover] ? (
        <Tooltip x={PAD.left + step * hover + step / 2} y={PAD.top} width={width}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{periodLabel(data[hover].period)}</div>
          {series.map((s) => <TipRow key={s.key} color={s.color} label={s.label} value={format(data[hover][s.key] ?? 0)} />)}
          <div style={{ borderTop: `1px solid ${INK.grid}`, marginTop: 4, paddingTop: 4 }}>
            <TipRow label="Total" value={format(totals[hover])} />
            {tooltipExtra?.(data[hover])}
          </div>
        </Tooltip>
      ) : null}
    </div>
  );
}

/** Lines over time with a crosshair; each series is its own line on one shared axis. */
export function LineChart<K extends string, R extends { period: string } & Record<K, number>>({
  data, series, height = 260, format = inr,
}: { data: R[]; series: Series<K>[]; height?: number; format?: (n: number) => string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.flatMap((r) => series.map((s) => r[s.key] ?? 0))));
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (data.length <= 1 ? plotW / 2 : (plotW * i) / (data.length - 1));
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const ticks = ticksFor(max);
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(plotW / 56))));
  const empty = data.every((r) => series.every((s) => !r[s.key]));

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const box = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const rel = (e.clientX - box.left) / box.width;
    setHover(Math.max(0, Math.min(data.length - 1, Math.round(rel * (data.length - 1)))));
  };

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      {empty ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing in this range" style={{ height, paddingTop: height / 4 }} />
      ) : (
        <svg width={width} height={height} role="img" onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={INK.grid} />
              <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill={INK.muted}>{compactInr(t)}</text>
            </g>
          ))}
          {data.map((r, i) => (i % labelEvery === 0 ? (
            <text key={r.period} x={x(i)} y={height - 8} textAnchor="middle" fontSize={11} fill={INK.muted}>{periodLabel(r.period)}</text>
          ) : null))}
          {hover !== null ? <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke={INK.muted} strokeDasharray="3 3" /> : null}
          {series.map((s) => (
            <polyline
              key={s.key}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={data.map((r, i) => `${x(i)},${y(r[s.key] ?? 0)}`).join(' ')}
            />
          ))}
          {hover !== null
            ? series.map((s) => (
                <circle key={s.key} cx={x(hover)} cy={y(data[hover][s.key] ?? 0)} r={4.5} fill={s.color} stroke={INK.surface} strokeWidth={2} />
              ))
            : null}
          <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} fill="transparent" onMouseMove={onMove} />
        </svg>
      )}
      {hover !== null && data[hover] ? (
        <Tooltip x={x(hover)} y={PAD.top} width={width}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{periodLabel(data[hover].period)}</div>
          {series.map((s) => <TipRow key={s.key} color={s.color} label={s.label} value={format(data[hover][s.key] ?? 0)} />)}
        </Tooltip>
      ) : null}
    </div>
  );
}

/** Ranked horizontal bars: name, bar, value. One series, so no legend. */
export function ShareBars({
  rows, color = SERIES.blue, format = inr, emptyText = 'Nothing to show',
}: {
  rows: Array<{ key: string; label: ReactNode; value: number; hint?: string }>;
  color?: string;
  format?: (n: number) => string;
  emptyText?: string;
}) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  if (!rows.length || max === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />;
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {rows.map((r) => (
        <div key={r.key} title={r.hint} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 38%) 1fr auto', gap: 10, alignItems: 'center' }}>
          <Typography.Text ellipsis style={{ fontSize: 13 }}>{r.label}</Typography.Text>
          <div style={{ height: 10, background: '#f4f3f0', borderRadius: 4 }}>
            <div style={{ width: `${Math.max(1, (r.value / max) * 100)}%`, height: '100%', background: color, borderRadius: 4 }} />
          </div>
          <Typography.Text style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', minWidth: 72, textAlign: 'right' }}>
            {format(r.value)}
          </Typography.Text>
        </div>
      ))}
    </div>
  );
}

/** Sequential blue ramp (reference palette), light -> dark, for the cohort table. */
const RAMP = ['#f4f8fd', '#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95'];

export function CohortTable({ rows }: { rows: Array<{ cohort: string; customers: number; retention: number[] }> }) {
  const months = useMemo(() => Math.max(0, ...rows.map((r) => r.retention.length)), [rows]);
  if (!rows.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No customers yet" />;
  const cell = (v: number) => RAMP[Math.min(RAMP.length - 1, Math.floor((v / 100) * (RAMP.length - 1) + 0.0001))];
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 2, fontSize: 12, width: '100%' }}>
        <thead>
          <tr style={{ color: INK.secondary }}>
            <th style={{ textAlign: 'left', fontWeight: 500, padding: '4px 8px' }}>First order</th>
            <th style={{ textAlign: 'right', fontWeight: 500, padding: '4px 8px' }}>Customers</th>
            {Array.from({ length: months }, (_, k) => (
              <th key={k} style={{ fontWeight: 500, padding: '4px 8px' }}>{k === 0 ? 'Month 0' : `+${k}`}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.cohort}>
              <td style={{ padding: '6px 8px' }}>{periodLabel(r.cohort)}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.customers}</td>
              {Array.from({ length: months }, (_, k) => {
                const v = r.retention[k];
                if (v === undefined) return <td key={k} />;
                const bg = cell(v);
                const dark = RAMP.indexOf(bg) >= 4;
                return (
                  <td
                    key={k}
                    title={`${r.cohort}: ${v}% ordered in month ${k}`}
                    style={{ background: bg, color: dark ? '#ffffff' : INK.primary, textAlign: 'center', borderRadius: 4, padding: '6px 8px', fontVariantNumeric: 'tabular-nums' }}
                  >
                    {v}%
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
