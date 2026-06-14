import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Icon } from '../lib/Icon';
import { DateSeg, Donut, KPI, LineChart, Sparkline } from '../lib/charts';

type Totals = {
  CLICK: number; SEARCH: number;
  RESERVATION_CONFIRMED: number; RESERVATION_REJECTED: number;
  INVOICE_ISSUED?: number; PAYMENT_COMPLETED?: number;
};
type PerProvider = {
  providerId: string; total: number;
  events: { eventType: string; count: number }[];
};
type TimePoint = { day: string; buckets: { eventType: string; count: number }[] };

type AnalyticsResp = {
  scope: 'global';
  totals: Totals;
  perProvider: PerProvider[];
  timeSeries: TimePoint[];
};

const RANGES: Record<string, number> = { '7d': 7, '30d': 30, 'MTD': 24 };

// Stable color palette matched to the design's mock providers
const COLOR_POOL = ['#ef4444', '#0EA5E9', '#1d4ed8', '#a855f7', '#f59e0b', '#16a34a', '#7c3aed', '#06b6d4'];
function colorFor(id: string, i: number): string {
  return COLOR_POOL[i % COLOR_POOL.length];
}

export default function AnalyticsPage() {
  const [range, setRange] = useState('30d');
  const [data, setData] = useState<AnalyticsResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [metric, setMetric] = useState<'RESERVATION_CONFIRMED' | 'SEARCH' | 'CLICK'>('RESERVATION_CONFIRMED');
  const [activeSet, setActiveSet] = useState<Set<string> | null>(null);

  async function load() {
    setLoading(true); setErr(null);
    try {
      const days = RANGES[range] || 30;
      const from = new Date(Date.now() - days * 86_400_000).toISOString();
      const to   = new Date().toISOString();
      const r = await api.get('/analytics/global', { params: { from, to } });
      setData(r.data);
      if (!activeSet) setActiveSet(new Set((r.data.perProvider || []).map((p: PerProvider) => p.providerId)));
    } catch (e: any) {
      setErr(e.response?.data?.message || e.message);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [range]);

  const providers = useMemo(() => data?.perProvider.map(p => p.providerId) || [], [data]);

  // Build multi-series — one per active provider for the chosen metric, padded for missing days.
  const multiSeries = useMemo(() => {
    if (!data) return [];
    const days = RANGES[range] || 30;

    const byProviderDay = new Map<string, Map<string, number>>();
    for (const p of data.perProvider) byProviderDay.set(p.providerId, new Map());

    // The /api/analytics/global timeSeries is by-day-and-eventType across all providers.
    // We approximate per-provider time series by attributing the daily total of the metric
    // proportional to that provider's share of the period total.
    const periodTotals = new Map<string, number>();
    for (const p of data.perProvider) {
      const ev = p.events.find(e => e.eventType === metric);
      periodTotals.set(p.providerId, ev?.count || 0);
    }
    const periodSum = Array.from(periodTotals.values()).reduce((a, b) => a + b, 0);

    const dayTotals = new Map<string, number>();
    for (const pt of data.timeSeries) {
      const b = pt.buckets.find(x => x.eventType === metric);
      dayTotals.set(pt.day, b?.count || 0);
    }

    const out: { name: string; color: string; data: { date: Date; value: number }[] }[] = [];
    (data.perProvider || []).forEach((p, i) => {
      if (activeSet && !activeSet.has(p.providerId)) return;
      const share = periodSum > 0 ? (periodTotals.get(p.providerId) || 0) / periodSum : 0;
      const series: { date: Date; value: number }[] = [];
      for (let d = days - 1; d >= 0; d--) {
        const dt = new Date(); dt.setHours(0, 0, 0, 0); dt.setDate(dt.getDate() - d);
        const dayTotal = dayTotals.get(dt.toISOString().slice(0, 10)) || 0;
        series.push({ date: dt, value: Math.round(dayTotal * share) });
      }
      out.push({ name: p.providerId, color: colorFor(p.providerId, i), data: series });
    });
    return out;
  }, [data, metric, range, activeSet]);

  const totalSeries = useMemo(() => {
    if (!data) return [];
    const days = RANGES[range] || 30;
    const dayTotals = new Map<string, number>();
    for (const pt of data.timeSeries) {
      const b = pt.buckets.find(x => x.eventType === metric);
      dayTotals.set(pt.day, b?.count || 0);
    }
    const out: { date: Date; value: number }[] = [];
    for (let d = days - 1; d >= 0; d--) {
      const dt = new Date(); dt.setHours(0, 0, 0, 0); dt.setDate(dt.getDate() - d);
      out.push({ date: dt, value: dayTotals.get(dt.toISOString().slice(0, 10)) || 0 });
    }
    return out;
  }, [data, metric, range]);

  // Donut: share of total reservations per provider
  const donutSlices = useMemo(() => {
    if (!data) return [];
    return data.perProvider.map((p, i) => {
      const ev = p.events.find(e => e.eventType === metric);
      return { label: p.providerId, value: ev?.count || 0, color: colorFor(p.providerId, i) };
    }).filter(s => s.value > 0);
  }, [data, metric]);

  const totals = data?.totals;
  const leaderboard = useMemo(() => {
    if (!data) return [];
    return data.perProvider.map((p, i) => {
      const reservations = p.events.find(e => e.eventType === 'RESERVATION_CONFIRMED')?.count || 0;
      return { id: p.providerId, color: colorFor(p.providerId, i), total: p.total, reservations };
    }).sort((a, b) => b.reservations - a.reservations);
  }, [data]);

  function toggleProvider(id: string) {
    setActiveSet(prev => {
      const next = new Set(prev || providers);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 1360, margin: '0 auto' }}>
        {/* Header */}
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 14 }}>
          <div>
            <div className="row" style={{ gap: 8 }}>
              <span className="badge badge-accent"><Icon name="tower" size={11} /> Platform</span>
              <span className="t-small muted">All providers · All stations</span>
            </div>
            <div className="t-display" style={{ marginTop: 6 }}>Global analytics</div>
            <div className="t-small muted" style={{ marginTop: 4 }}>
              How the platform is performing across providers, stations, and time.
            </div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <DateSeg value={range} onChange={setRange} options={['7d', '30d', 'MTD']} />
          </div>
        </div>

        {err && <div className="card" style={{ padding: 14, color: 'var(--offline)' }}>{err}</div>}

        {/* KPI strip */}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
          <KPI
            label="Searches" value={(totals?.SEARCH || 0).toLocaleString()}
            spark={<Sparkline data={spark(data, 'SEARCH', range)} w={160} h={26} color="var(--accent)" />}
          />
          <KPI
            label="Reservations" value={(totals?.RESERVATION_CONFIRMED || 0).toLocaleString()}
            spark={<Sparkline data={spark(data, 'RESERVATION_CONFIRMED', range)} w={160} h={26} color="var(--accent)" />}
          />
          <KPI
            label="Rejected" value={(totals?.RESERVATION_REJECTED || 0).toLocaleString()}
            spark={<Sparkline data={spark(data, 'RESERVATION_REJECTED', range)} w={160} h={26} color="var(--offline)" />}
          />
          <KPI label="Active providers" value={providers.length.toString()} />
          <KPI label="Clicks" value={(totals?.CLICK || 0).toLocaleString()} />
        </div>

        {/* Main chart + donut */}
        <div className="grid" style={{ gridTemplateColumns: '1.7fr 1fr', gap: 16, alignItems: 'start' }}>
          <div className="card">
            <div className="card-hd">
              <div>
                <h3>{metricLabel(metric)} by provider</h3>
                <div className="t-small muted" style={{ marginTop: 2 }}>Daily — click a provider to toggle</div>
              </div>
              <div className="seg">
                <button aria-pressed={metric === 'RESERVATION_CONFIRMED'} onClick={() => setMetric('RESERVATION_CONFIRMED')}>Reservations</button>
                <button aria-pressed={metric === 'SEARCH'} onClick={() => setMetric('SEARCH')}>Searches</button>
                <button aria-pressed={metric === 'CLICK'}  onClick={() => setMetric('CLICK')}>Clicks</button>
              </div>
            </div>
            <div className="card-bd">
              {loading ? (
                <div style={{ height: 300, display: 'grid', placeItems: 'center', color: 'var(--text-3)' }}>Loading…</div>
              ) : multiSeries.length > 0 ? (
                <LineChart series={multiSeries} multi height={300} formatY={v => v.toLocaleString()} />
              ) : (
                <LineChart series={{ data: totalSeries, color: 'var(--accent)' }} height={300} formatY={v => v.toLocaleString()} />
              )}
              <div className="row" style={{ flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
                {data?.perProvider.map((p, i) => {
                  const on = !activeSet || activeSet.has(p.providerId);
                  const color = colorFor(p.providerId, i);
                  return (
                    <button key={p.providerId}
                      onClick={() => toggleProvider(p.providerId)}
                      style={{
                        appearance: 'none', cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        height: 28, padding: '0 10px',
                        borderRadius: 'var(--r-2)',
                        border: '1px solid var(--border)',
                        background: on ? 'var(--bg-elev)' : 'transparent',
                        color: on ? 'var(--text)' : 'var(--text-4)',
                        opacity: on ? 1 : 0.5
                      }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
                      <span style={{ fontSize: 12.5, fontWeight: 500 }}>{p.providerId}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-hd">
              <h3>Provider share</h3>
              <span className="t-small muted">{range}</span>
            </div>
            <div className="card-bd" style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
              {donutSlices.length > 0
                ? <Donut slices={donutSlices} size={140} thickness={16} />
                : <div style={{ width: 140, height: 140, borderRadius: '50%', border: '1px dashed var(--border)' }} />}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data?.perProvider.length === 0 && (
                  <div className="t-small muted">No data yet for this range.</div>
                )}
                {data?.perProvider.map((p, i) => {
                  const total = donutSlices.reduce((a, s) => a + s.value, 0) || 1;
                  const slice = donutSlices.find(s => s.label === p.providerId);
                  const pct = slice ? (slice.value / total) * 100 : 0;
                  return (
                    <div key={p.providerId} className="row" style={{ justifyContent: 'space-between' }}>
                      <div className="row" style={{ gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: colorFor(p.providerId, i) }} />
                        <span className="t-small">{p.providerId}</span>
                      </div>
                      <span className="t-small t-num muted">{pct.toFixed(0)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Leaderboard */}
        <div className="card">
          <div className="card-hd">
            <h3>Provider leaderboard</h3>
            <span className="t-small muted">Sorted by confirmed reservations</span>
          </div>
          <div className="card-bd flush">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>#</th>
                  <th>Provider</th>
                  <th className="num">Reservations</th>
                  <th className="num">Total events</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)' }}>No data.</td></tr>
                ) : leaderboard.map((p, i) => (
                  <tr key={p.id}>
                    <td className="muted t-num">{i + 1}</td>
                    <td>
                      <div className="row" style={{ gap: 10 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: p.color }} />
                        <strong>{p.id}</strong>
                      </div>
                    </td>
                    <td className="num">{p.reservations.toLocaleString()}</td>
                    <td className="num">{p.total.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function metricLabel(m: string): string {
  if (m === 'RESERVATION_CONFIRMED') return 'Reservations';
  if (m === 'SEARCH') return 'Searches';
  return 'Clicks';
}

function spark(data: AnalyticsResp | null, metric: string, range: string): { value: number }[] {
  if (!data) return [];
  const days = RANGES[range] || 30;
  const m = new Map<string, number>();
  for (const pt of data.timeSeries) {
    const b = pt.buckets.find(x => x.eventType === metric);
    m.set(pt.day, b?.count || 0);
  }
  const out: { value: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    out.push({ value: m.get(d.toISOString().slice(0, 10)) || 0 });
  }
  return out;
}
