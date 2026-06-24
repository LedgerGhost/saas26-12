import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Icon } from '../lib/Icon';
import { DateSeg, Donut, KPI, LineChart, Sparkline } from '../lib/charts';
import { hasProviderId, providerColor } from '../lib/providers';

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
type ProviderSeries = { providerId: string; days: TimePoint[] };
type Revenue = {
  total: number;
  perProvider: Record<string, number>;
  timeSeries: Record<string, number>;
};

type AnalyticsResp = {
  scope: 'global';
  totals: Totals;
  perProvider: PerProvider[];
  timeSeries: TimePoint[];
  providerSeries: ProviderSeries[];
  revenue: Revenue;
};

type Metric = 'RESERVATION_CONFIRMED' | 'SEARCH' | 'CLICK' | 'REVENUE';

const RANGES: Record<string, number> = { '7d': 7, '30d': 30, 'MTD': 24 };

function colorFor(id: string, i: number): string {
  return providerColor(id, i);
}

export default function AnalyticsPage() {
  const [range, setRange] = useState('30d');
  const [data, setData] = useState<AnalyticsResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>('RESERVATION_CONFIRMED');
  const [activeSet, setActiveSet] = useState<Set<string> | null>(null);
  const [invoiceModal, setInvoiceModal] = useState(false);
  const [invoiceInfo, setInvoiceInfo] = useState<string | null>(null);

  async function load() {
    setLoading(true); setErr(null);
    try {
      const days = RANGES[range] || 30;
      const from = new Date(Date.now() - days * 86_400_000).toISOString();
      const to   = new Date().toISOString();
      const r = await api.get('/analytics/global', { params: { from, to } });
      setData(r.data);
      if (!activeSet) {
        setActiveSet(new Set(
          (r.data.perProvider || [])
            .filter((p: PerProvider) => hasProviderId(p.providerId))
            .map((p: PerProvider) => p.providerId)
        ));
      }
    } catch (e: any) {
      setErr(e.response?.data?.message || e.message);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [range]);

  const namedPerProvider = useMemo(() => (
    (data?.perProvider || []).filter(p => hasProviderId(p.providerId))
  ), [data]);
  const providers = useMemo(() => namedPerProvider.map(p => p.providerId), [namedPerProvider]);

  // Build multi-series — one REAL line per active provider for the chosen metric,
  // padded for missing days. Uses the backend's per-provider daily series
  // (providerSeries) rather than approximating from each provider's period share.
  const multiSeries = useMemo(() => {
    if (!data || metric === 'REVENUE') return [];
    const days = RANGES[range] || 30;

    // providerId -> (dayKey -> count) for the selected event metric
    const byProvider = new Map<string, Map<string, number>>();
    for (const ps of data.providerSeries || []) {
      if (!hasProviderId(ps.providerId)) continue;
      const m = new Map<string, number>();
      for (const pt of ps.days) {
        const b = pt.buckets.find(x => x.eventType === metric);
        m.set(pt.day, b?.count || 0);
      }
      byProvider.set(ps.providerId, m);
    }

    const out: { name: string; color: string; data: { date: Date; value: number }[] }[] = [];
    namedPerProvider.forEach((p, i) => {
      if (activeSet && !activeSet.has(p.providerId)) return;
      const dayMap = byProvider.get(p.providerId) || new Map();
      const series: { date: Date; value: number }[] = [];
      for (let d = days - 1; d >= 0; d--) {
        const dt = new Date(); dt.setHours(0, 0, 0, 0); dt.setDate(dt.getDate() - d);
        series.push({ date: dt, value: dayMap.get(dt.toISOString().slice(0, 10)) || 0 });
      }
      out.push({ name: p.providerId, color: colorFor(p.providerId, i), data: series });
    });
    return out;
  }, [data, metric, range, activeSet, namedPerProvider]);

  // Total line — daily event totals, or daily revenue when the Revenue metric is selected.
  const totalSeries = useMemo(() => {
    if (!data) return [];
    const days = RANGES[range] || 30;
    const dayTotals = new Map<string, number>();
    if (metric === 'REVENUE') {
      for (const [day, amt] of Object.entries(data.revenue?.timeSeries || {})) dayTotals.set(day, amt);
    } else {
      for (const pt of data.timeSeries) {
        const b = pt.buckets.find(x => x.eventType === metric);
        dayTotals.set(pt.day, b?.count || 0);
      }
    }
    const out: { date: Date; value: number }[] = [];
    for (let d = days - 1; d >= 0; d--) {
      const dt = new Date(); dt.setHours(0, 0, 0, 0); dt.setDate(dt.getDate() - d);
      out.push({ date: dt, value: dayTotals.get(dt.toISOString().slice(0, 10)) || 0 });
    }
    return out;
  }, [data, metric, range]);

  // Donut: share per provider for the selected metric (revenue uses € share).
  const donutSlices = useMemo(() => {
    if (!data) return [];
    if (metric === 'REVENUE') {
      return namedPerProvider.map((p, i) => ({
        label: p.providerId,
        value: +(data.revenue?.perProvider?.[p.providerId] || 0).toFixed(2),
        color: colorFor(p.providerId, i)
      })).filter(s => s.value > 0);
    }
    return namedPerProvider.map((p, i) => {
      const ev = p.events.find(e => e.eventType === metric);
      return { label: p.providerId, value: ev?.count || 0, color: colorFor(p.providerId, i) };
    }).filter(s => s.value > 0);
  }, [data, metric, namedPerProvider]);

  const totals = data?.totals;
  const fmtY = (v: number) => metric === 'REVENUE'
    ? `€${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : v.toLocaleString();
  const leaderboard = useMemo(() => {
    if (!data) return [];
    return namedPerProvider.map((p, i) => {
      const reservations = p.events.find(e => e.eventType === 'RESERVATION_CONFIRMED')?.count || 0;
      return { id: p.providerId, color: colorFor(p.providerId, i), total: p.total, reservations };
    }).sort((a, b) => b.reservations - a.reservations);
  }, [data, namedPerProvider]);

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
            <button className="btn btn-primary" onClick={() => { setInvoiceInfo(null); setInvoiceModal(true); }}>
              <Icon name="doc" size={14} /> Create invoice
            </button>
          </div>
        </div>

        {err && <div className="card" style={{ padding: 14, color: 'var(--offline)' }}>{err}</div>}
        {invoiceInfo && <div className="card" style={{ padding: 14, color: 'var(--available)' }}>{invoiceInfo}</div>}

        {/* KPI strip */}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(6, 1fr)', gap: 14 }}>
          <KPI
            label="Revenue" value={`€${(data?.revenue?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          />
          <KPI
            label="Search appearances" value={(totals?.SEARCH || 0).toLocaleString()}
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
                <button aria-pressed={metric === 'REVENUE'} onClick={() => setMetric('REVENUE')}>Revenue</button>
                <button aria-pressed={metric === 'SEARCH'} onClick={() => setMetric('SEARCH')}>Appearances</button>
                <button aria-pressed={metric === 'CLICK'}  onClick={() => setMetric('CLICK')}>Clicks</button>
              </div>
            </div>
            <div className="card-bd">
              {loading ? (
                <div style={{ height: 300, display: 'grid', placeItems: 'center', color: 'var(--text-3)' }}>Loading…</div>
              ) : multiSeries.length > 0 ? (
                <LineChart series={multiSeries} multi height={300} formatY={fmtY} />
              ) : (
                <LineChart series={{ name: metricLabel(metric), data: totalSeries, color: 'var(--accent)' }} height={300} formatY={fmtY} />
              )}
              <div className="row" style={{ flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
                {namedPerProvider.map((p, i) => {
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
                {namedPerProvider.length === 0 && (
                  <div className="t-small muted">No data yet for this range.</div>
                )}
                {namedPerProvider.map((p, i) => {
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

      {invoiceModal && (
        <CreateInvoiceModal
          onClose={() => setInvoiceModal(false)}
          onIssued={msg => { setInvoiceInfo(msg); setInvoiceModal(false); }}
        />
      )}
    </div>
  );
}

/* ─── Operator: create & assign an invoice to a provider ─── */
type BillableProvider = { providerId: string; total: number; count: number; currency: string };
type ProviderRow = { _id: string; companyName: string; providerSystemId?: string };
// A billing target merges a registered provider with its outstanding charges,
// matched case-insensitively so a casing mismatch between providerSystemId and
// the reservation providerId can't hide a balance. `id` is the actual charge
// provider id we POST to /invoices/create.
type Target = { id: string; label: string; total: number; count: number; currency: string };

function CreateInvoiceModal({ onClose, onIssued }: { onClose: () => void; onIssued: (msg: string) => void }) {
  const [targets, setTargets] = useState<Target[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [p, b] = await Promise.all([
          api.get('/providers'),
          api.get('/invoices/billable')
        ]);
        const providers: ProviderRow[] = (p.data?.providers || []).filter((x: ProviderRow) => x.providerSystemId);
        const billable = (b.data?.providers || []) as BillableProvider[];
        const byId = new Map<string, BillableProvider>();
        for (const row of billable) byId.set(row.providerId.toLowerCase(), row);

        const matched = new Set<string>();
        const list: Target[] = providers.map(pr => {
          const sys = pr.providerSystemId!;
          const hit = byId.get(sys.toLowerCase());
          if (hit) matched.add(sys.toLowerCase());
          return {
            id: hit?.providerId || sys, // bill the real charge id when known
            label: pr.companyName,
            total: hit?.total || 0,
            count: hit?.count || 0,
            currency: hit?.currency || 'EUR'
          };
        });
        // Surface outstanding balances with no registered provider so the money
        // is still reachable (labelled by the raw provider id).
        for (const row of billable) {
          if (matched.has(row.providerId.toLowerCase())) continue;
          list.push({ id: row.providerId, label: row.providerId, total: row.total, count: row.count, currency: row.currency || 'EUR' });
        }

        setTargets(list);
        // Default to the largest outstanding balance so the shown total matches.
        const ranked = [...list].sort((a, b2) => b2.total - a.total);
        setSelected(ranked[0]?.id || '');
      } catch (e: any) {
        setErr(e.response?.data?.message || e.message);
      } finally { setLoading(false); }
    })();
  }, []);

  const current = targets.find(t => t.id === selected);
  const outstanding = current?.total || 0;
  const count = current?.count || 0;
  const currency = current?.currency || 'EUR';

  async function issue() {
    if (!selected) return;
    setBusy(true); setErr(null);
    try {
      const r = await api.post('/invoices/create', { providerId: selected });
      if (r.data?.empty) {
        setErr('This provider has no outstanding reservations to invoice.');
        setBusy(false);
        return;
      }
      const amt = r.data?.invoice?.totalAmount ?? outstanding;
      onIssued(`Invoice for ${current?.label || selected} issued — €${Number(amt).toFixed(2)}. It is now visible on the provider's Invoices page.`);
    } catch (e: any) {
      setErr(e.response?.data?.message || e.message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-scrim" onClick={onClose} style={{ pointerEvents: 'auto' }}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div style={{ padding: '20px 24px 4px' }}>
          <div className="t-h1">Create invoice</div>
          <div className="t-small muted" style={{ marginTop: 2 }}>
            Bill a provider for their outstanding reservation fees.
          </div>
        </div>

        <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {err && <div className="card" style={{ padding: 12, color: 'var(--offline)' }}>{err}</div>}

          {loading ? (
            <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-3)' }}>Loading providers…</div>
          ) : (
            <>
              <div className="field">
                <label htmlFor="inv-provider">Provider</label>
                <select
                  id="inv-provider"
                  className="select"
                  value={selected}
                  onChange={e => setSelected(e.target.value)}
                >
                  {targets.length === 0 && <option value="">No providers found</option>}
                  {targets.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.label} — €{t.total.toFixed(2)} outstanding
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ background: 'var(--bg-sunk)', border: '1px solid var(--border)', borderRadius: 'var(--r-2)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="t-small muted">Reservations to bill</span>
                  <span className="t-small t-num" style={{ color: 'var(--text)' }}>{count}</span>
                </div>
                <div style={{ height: 1, background: 'var(--border)' }} />
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>Invoice total</strong>
                  <strong className="t-num" style={{ fontSize: 16 }}>€{outstanding.toFixed(2)} {currency}</strong>
                </div>
              </div>

              <div className="t-small muted" style={{ display: 'flex', gap: 8 }}>
                <Icon name="info" size={14} />
                <span>The total is the sum of every reservation fee charged to this provider that hasn't been invoiced yet.</span>
              </div>
            </>
          )}
        </div>

        <div style={{ padding: '12px 16px 16px', display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={issue} disabled={busy || loading || !selected || outstanding <= 0}>
            <Icon name="doc" size={14} /> {busy ? 'Issuing…' : `Issue invoice €${outstanding.toFixed(2)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function metricLabel(m: string): string {
  if (m === 'RESERVATION_CONFIRMED') return 'Reservations';
  if (m === 'REVENUE') return 'Revenue';
  if (m === 'SEARCH') return 'Search appearances';
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
