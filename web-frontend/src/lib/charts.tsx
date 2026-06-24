import { useEffect, useMemo, useRef, useState, Fragment } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';

/* ─── Wordmark ─── */
export function Wordmark() {
  return (
    <div className="wordmark">
      <span className="wm-dot" />
      <span className="wm-saas">saas</span>
      <span className="wm-plug">Plug</span>
    </div>
  );
}

/* ─── KPI ─── */
type KpiProps = {
  label: string; value: string | number;
  delta?: string; deltaDir?: 'up' | 'down';
  suffix?: string; prefix?: string;
  spark?: ReactNode;
};
export function KPI({ label, value, delta, deltaDir = 'up', suffix = '', prefix = '', spark }: KpiProps) {
  return (
    <div className="kpi">
      <div className="lbl">{label}</div>
      <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
        <div className="val">{prefix}{value}{suffix}</div>
        {delta != null && (
          <div className={`delta ${deltaDir}`}>
            <Icon name={deltaDir === 'up' ? 'arrow-up' : 'arrow-down'} size={11} stroke={2.2} />
            {delta}
          </div>
        )}
      </div>
      {spark && <div style={{ marginTop: 6 }}>{spark}</div>}
    </div>
  );
}

/* ─── StatusBadge ─── */
const STATUS_LABEL: Record<string, string> = {
  available: 'Available', occupied: 'Occupied', offline: 'Out of service', unknown: 'Unknown'
};
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge badge-${status}`}>
      <span className="dot" />
      {STATUS_LABEL[status] || status}
    </span>
  );
}

/* ─── Segmented date control ─── */
type DateSegProps = { value: string; onChange: (v: string) => void; options?: string[] };
export function DateSeg({ value, onChange, options = ['7d', '30d', 'MTD', 'Custom'] }: DateSegProps) {
  return (
    <div className="seg">
      {options.map(o => (
        <button key={o} aria-pressed={value === o} onClick={() => onChange(o)}>{o}</button>
      ))}
    </div>
  );
}

/* ─── Sparkline ─── */
type SparkProps = { data: Array<number | { value: number }>; w?: number; h?: number; color?: string; fill?: boolean };
export function Sparkline({ data, w = 110, h = 32, color = 'currentColor', fill = true }: SparkProps) {
  if (!data || data.length === 0) return null;
  const vals = data.map(d => typeof d === 'number' ? d : d.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const dx = w / (vals.length - 1);
  const pts = vals.map((v, i) => [i * dx, h - ((v - min) / range) * (h - 4) - 2]);
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${path} L${w} ${h} L0 ${h} Z`;
  return (
    <svg width={w} height={h} style={{ display: 'block', color }}>
      {fill && <path d={area} fill={color} opacity={0.12} />}
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ─── LineChart ─── */
type SeriesPoint = { date: Date; value: number };
type Series = { data: SeriesPoint[]; color?: string; name?: string };
type LineChartProps = {
  series: Series | Series[];
  height?: number; accent?: string; showGrid?: boolean; multi?: boolean;
  formatY?: (v: number) => string | number;
  formatX?: (d: Date) => string;
};
export function LineChart({
  series, height = 240, accent, showGrid = true,
  formatY = (v) => v as any,
  formatX = (d) => `${d.getMonth() + 1}/${d.getDate()}`,
  multi = false
}: LineChartProps) {
  const seriesArr = Array.isArray(series) ? series : [series];
  const allValues = seriesArr.flatMap(s => s.data.map(d => d.value)).filter(Number.isFinite);
  const maxValue = Math.max(...allValues, 0);
  const hasOnlyIntegerValues = allValues.every(v => Number.isInteger(v));

  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(entries => { for (const e of entries) setW(Math.max(280, e.contentRect.width)); });
    ro.observe(ref.current); return () => ro.disconnect();
  }, []);

  const padL = 48;
  const padR = 18;
  const padT = Math.max(22, Math.min(34, height * 0.1));
  const padB = Math.max(30, Math.min(38, height * 0.12));
  const W = w, H = height;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = seriesArr[0]?.data.length || 0;
  const dx = n > 1 ? innerW / (n - 1) : innerW;

  const yTicks = useMemo(() => {
    const target = Math.max(3, Math.min(5, Math.round(height / 72)));
    const niceStep = (raw: number) => {
      if (!Number.isFinite(raw) || raw <= 0) return 1;
      const exp = Math.pow(10, Math.floor(Math.log10(raw)));
      const f = raw / exp;
      const nice = f < 1.5 ? 1 : f < 3 ? 2 : f < 4.5 ? 2.5 : f < 7 ? 5 : 10;
      return nice * exp;
    };
    const rawStep = niceStep(Math.max(maxValue, 1) / target);
    const step = hasOnlyIntegerValues ? Math.max(1, Math.round(rawStep)) : rawStep;
    const maxWithHeadroom = maxValue <= 0 ? step : maxValue * 1.08;
    const yMax = Math.max(step, Math.ceil(maxWithHeadroom / step) * step);
    const ticks: number[] = [];
    for (let v = 0; v <= yMax + step / 2; v += step) {
      ticks.push(Number(v.toFixed(8)));
    }
    return ticks;
  }, [hasOnlyIntegerValues, height, maxValue]);
  const yMax = yTicks[yTicks.length - 1] || 1;

  const xFor = (i: number) => padL + i * dx;
  const yFor = (v: number) => padT + innerH - (v / yMax) * innerH;

  const [hover, setHover] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    setSelected(current => {
      if (!n) return null;
      if (current == null || current >= n) return n - 1;
      return current;
    });
  }, [n]);

  function indexFromClientX(clientX: number, boundsLeft: number) {
    if (n <= 0) return null;
    const x = clientX - boundsLeft;
    const i = Math.round((x - padL) / dx);
    return Math.max(0, Math.min(n - 1, i));
  }
  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(indexFromClientX(e.clientX, r.left));
  }
  function onSelect(e: React.MouseEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setSelected(indexFromClientX(e.clientX, r.left));
  }
  function onTouch(e: React.TouchEvent<SVGSVGElement>) {
    const touch = e.touches[0];
    if (!touch) return;
    const r = e.currentTarget.getBoundingClientRect();
    const i = indexFromClientX(touch.clientX, r.left);
    setHover(i);
    setSelected(i);
  }

  const activeIndex = hover ?? selected;
  const activeRows = activeIndex == null ? [] : seriesArr.map((s, si) => {
    const point = s.data[activeIndex];
    return point ? {
      key: `${s.name || si}-${activeIndex}`,
      label: s.name || (multi ? `Series ${si + 1}` : 'Value'),
      value: point.value,
      date: point.date,
      color: s.color || accent || 'var(--accent)'
    } : null;
  }).filter(Boolean) as { key: string; label: string; value: number; date: Date; color: string }[];
  const activePointDate = activeRows[0]?.date;
  const activeX = activeIndex == null ? null : xFor(activeIndex);
  const activeMinY = activeIndex == null ? null : Math.min(
    ...seriesArr
      .map(s => s.data[activeIndex]?.value)
      .filter((value): value is number => typeof value === 'number')
      .map(yFor)
  );
  const tooltipW = multi ? 196 : 168;
  const tooltipLeft = activeX == null ? 0 : Math.max(padL, Math.min(W - padR - tooltipW, activeX + 12 > W - tooltipW ? activeX - tooltipW - 12 : activeX + 12));
  const tooltipTop = activeMinY == null || !Number.isFinite(activeMinY) ? padT : Math.max(8, Math.min(H - 108, activeMinY - 42));

  if (n === 0) {
    return <div ref={ref} style={{ width: '100%', height, display: 'grid', placeItems: 'center', color: 'var(--text-3)', fontSize: 13 }}>No data for this range.</div>;
  }

  return (
    <div ref={ref} className="chart-frame" style={{ width: '100%', height }}>
      <svg
        width={W}
        height={H}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onClick={onSelect}
        onTouchStart={onTouch}
        onTouchMove={onTouch}
        style={{ display: 'block' }}
      >
        {showGrid && yTicks.map((t, i) => (
          <g key={i}>
            <line className="grid-line" x1={padL} x2={W - padR} y1={yFor(t)} y2={yFor(t)} />
            <text className="axis-tick" x={padL - 8} y={yFor(t) + 3} textAnchor="end">{formatY(t)}</text>
          </g>
        ))}
        {seriesArr[0].data.map((d, i) => {
          if (i % Math.max(1, Math.floor(n / 6)) !== 0) return null;
          return <text key={i} className="axis-tick" x={xFor(i)} y={H - 8} textAnchor="middle">{formatX(d.date)}</text>;
        })}
        {seriesArr.map((s, si) => {
          const color = s.color || accent || 'var(--accent)';
          const pts = s.data.map((d, i) => [xFor(i), yFor(d.value)]);
          const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
          const areaPath = `${path} L${xFor(n - 1)} ${yFor(0)} L${xFor(0)} ${yFor(0)} Z`;
          return (
            <g key={si}>
              {!multi && <path d={areaPath} fill={color} opacity="0.10" />}
              <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            </g>
          );
        })}
        {activeIndex != null && (
          <g>
            <line className="chart-crosshair" x1={xFor(activeIndex)} x2={xFor(activeIndex)} y1={padT} y2={H - padB} />
            {seriesArr.map((s, si) => {
              const d = s.data[activeIndex];
              if (!d) return null;
              const color = s.color || accent || 'var(--accent)';
              return <circle key={si} className="chart-active-dot" cx={xFor(activeIndex)} cy={yFor(d.value)} r="4" fill="var(--bg-elev)" stroke={color} strokeWidth="2.5" />;
            })}
          </g>
        )}
      </svg>
      {activeRows.length > 0 && activePointDate && (
        <div
          className="chart-tooltip"
          style={{ left: tooltipLeft, top: tooltipTop, width: tooltipW }}
        >
          <div className="chart-tooltip-date">
            {activePointDate.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
          {activeRows.map(row => (
            <div className="chart-tooltip-row" key={row.key}>
              <span className="chart-tooltip-series">
                <span className="chart-tooltip-dot" style={{ background: row.color }} />
                {row.label}
              </span>
              <strong>{formatY(row.value)}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── BarsH (horizontal bars) ─── */
type BarsHProps = {
  items: { label: string; value: number; color?: string }[];
  accent?: string; height?: number;
  formatX?: (v: number) => string | number;
};
export function BarsH({ items, accent, height = 220, formatX = v => v }: BarsHProps) {
  const max = Math.max(...items.map(i => i.value), 1);
  const rowH = Math.min(34, (height - 16) / Math.max(1, items.length));
  return (
    <div className="col" style={{ gap: 6 }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 64px', alignItems: 'center', gap: 12, height: rowH }}>
          <div className="t-small" style={{ color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</div>
          <div style={{ height: 10, background: 'var(--bg-sunk)', borderRadius: 3, position: 'relative', overflow: 'hidden' }}>
            <div style={{
              position: 'absolute', inset: 0, right: 'auto',
              width: `${(it.value / max) * 100}%`,
              background: it.color || accent || 'var(--accent)',
              borderRadius: 3,
              transition: 'width 400ms cubic-bezier(.2,.9,.3,1)'
            }} />
          </div>
          <div className="t-small t-num" style={{ textAlign: 'right', color: 'var(--text)' }}>{formatX(it.value)}</div>
        </div>
      ))}
    </div>
  );
}

/* ─── Donut ─── */
type DonutProps = { slices: { label: string; value: number; color: string }[]; size?: number; thickness?: number };
export function Donut({ slices, size = 140, thickness = 18 }: DonutProps) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  if (total <= 0) return null;
  const r = (size - thickness) / 2;
  const cx = size / 2, cy = size / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--bg-sunk)" strokeWidth={thickness} />
      {slices.map((s, i) => {
        const len = (s.value / total) * c;
        const el = (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={thickness}
            strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset}
            transform={`rotate(-90 ${cx} ${cy})`}
            strokeLinecap="butt"
          />
        );
        offset += len;
        return el;
      })}
    </svg>
  );
}

/* ─── Stepper ─── */
type StepperProps = { steps: { n: number; label: string }[]; current: number };
export function Stepper({ steps, current }: StepperProps) {
  return (
    <div className="stepper">
      {steps.map((s, i, all) => (
        <Fragment key={s.n}>
          <div className={`step ${current > s.n ? 'done' : current === s.n ? 'active' : ''}`}>
            <span className="n">{current > s.n ? <Icon name="check" size={12} stroke={2.5} /> : s.n}</span>
            <span>{s.label}</span>
          </div>
          {i < all.length - 1 && <div className="bar" style={{ background: current > s.n ? 'var(--accent)' : 'var(--border)' }} />}
        </Fragment>
      ))}
    </div>
  );
}
