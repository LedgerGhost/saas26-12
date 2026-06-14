import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Icon } from '../lib/Icon';
import { DateSeg, KPI, LineChart, Sparkline } from '../lib/charts';

type Totals = {
  CLICK: number; SEARCH: number;
  RESERVATION_CONFIRMED: number; RESERVATION_REJECTED: number;
  INVOICE_ISSUED?: number; PAYMENT_COMPLETED?: number;
};
type TimePoint = { day: string; buckets: { eventType: string; count: number }[] };
type AnalyticsResp = {
  scope: 'own';
  providerId: string;
  totals: Totals;
  timeSeries: TimePoint[];
};
type Invoice = {
  _id: string;
  totalAmount: number;
  currency: string;
  issuedAt: string;
  status: 'ISSUED' | 'PAID' | 'VOID';
};
type Provider = { _id: string; companyName: string };

const RANGES: Record<string, number> = { '7d': 7, '30d': 30, 'MTD': 24, 'Custom': 30 };

export default function ProviderAnalyticsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [provider, setProvider] = useState<Provider | null>(null);
  const [range, setRange] = useState('30d');
  const [data, setData] = useState<AnalyticsResp | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [metric, setMetric] = useState<'RESERVATION_CONFIRMED' | 'SEARCH' | 'CLICK'>('RESERVATION_CONFIRMED');

  // Resolve the calling user's provider for the header
  useEffect(() => {
    if (!user) return;
    api.get(`/providers/by-user/${encodeURIComponent(user._id)}`)
      .then(r => setProvider(r.data))
      .catch(() => setProvider(null));
  }, [user]);

  async function load() {
    setLoading(true); setErr(null);
    try {
      const days = RANGES[range] || 30;
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

      // 'to' is right now
      const to = new Date().toISOString();

      // 'from' must be aligned to the start of the local day (midnight)
      const fromDate = new Date();
      // Go back `days - 1` to include today as part of the total count
      fromDate.setDate(fromDate.getDate() - (days - 1));
      fromDate.setHours(0, 0, 0, 0); 
      const from = fromDate.toISOString(); // Safely converts that local midnight to UTC for the API

      const [a, inv] = await Promise.all([
        api.get('/analytics', { params: { from, to, tz } }),
        api.get('/invoices').catch(() => ({ data: { invoices: [] } }))
      ]);
      setData(a.data);
      setInvoices(inv.data?.invoices || []);
    } catch (e: any) {
      setErr(e.response?.data?.message || e.message);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [range]);

  // Build a per-day series for the selected metric, padded with zeros for missing days.
  const series = useMemo(() => {
    if (!data) return [];
    const days = RANGES[range] || 30;
    const byDay = new Map<string, number>();

    for (const pt of data.timeSeries) {
      const bucket = pt.buckets.find(b => b.eventType === metric);
      byDay.set(pt.day, bucket?.count || 0);
    }

    const out: { date: Date; value: number }[] = [];
    
    // Anchor to today at local midnight
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = days - 1; i >= 0; i--) {
      // Safely calculate each day relative to today's midnight
      const d = new Date(today.getTime());
      d.setDate(today.getDate() - i);
      
      const key = getLocalISODate(d);
      out.push({ date: d, value: byDay.get(key) || 0 });
    }

    return out;
  }, [data, metric, range]);

  // Provider error state — no provider linked yet
  if (data === null && err && /PROVIDER_NOT_FOUND/i.test(err)) {
    return (
      <div style={{ padding: '60px 32px', maxWidth: 520, margin: '0 auto', textAlign: 'center' }}>
        <div className="t-display">No provider account</div>
        <div className="t-small muted" style={{ marginTop: 6, marginBottom: 18 }}>
          Register your company to see analytics for your stations.
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/provider/setup')}>
          <Icon name="arrow-right" size={14} /> Set up provider account
        </button>
      </div>
    );
  }

  const totals = data?.totals;
  const lastValue = series.slice(-1)[0]?.value || 0;
  const prevValue = series.slice(-2, -1)[0]?.value || 0;
  const delta = prevValue > 0 ? ((lastValue - prevValue) / prevValue) * 100 : 0;

  // Estimated revenue from confirmed reservations × provider rate (we don't track per-invoice rev here)
  const reservations = totals?.RESERVATION_CONFIRMED || 0;

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 1280, margin: '0 auto' }}>
        {/* Header */}
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 14 }}>
          <div>
            <div className="row" style={{ gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--accent)' }} />
              <span className="t-small muted">{provider?.companyName || 'Your account'}</span>
            </div>
            <div className="t-display" style={{ marginTop: 2 }}>Overview</div>
            <div className="t-small muted" style={{ marginTop: 4 }}>
              How your stations performed across saasPlug.
            </div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <DateSeg value={range} onChange={setRange} options={['7d', '30d', 'MTD']} />
            <button className="btn btn-secondary" onClick={() => navigate('/provider/logs')}>
              <Icon name="download" size={14} /> Export
            </button>
          </div>
        </div>

        {err && !/PROVIDER_NOT_FOUND/i.test(err) && (
          <div className="card" style={{ padding: 14, color: 'var(--offline)', borderColor: 'var(--offline-soft)' }}>
            {err}
          </div>
        )}

        {/* KPI strip */}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          <KPI
            label="Searches"
            value={(totals?.SEARCH || 0).toLocaleString()}
            spark={<Sparkline data={pad(data, 'SEARCH', range)} w={180} h={28} color="var(--accent)" />}
          />
          <KPI
            label="Station clicks"
            value={(totals?.CLICK || 0).toLocaleString()}
            spark={<Sparkline data={pad(data, 'CLICK', range)} w={180} h={28} color="var(--accent)" />}
          />
          <KPI
            label="Reservations"
            value={reservations.toLocaleString()}
            delta={delta ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%` : undefined}
            deltaDir={delta >= 0 ? 'up' : 'down'}
            spark={<Sparkline data={pad(data, 'RESERVATION_CONFIRMED', range)} w={180} h={28} color="var(--accent)" />}
          />
          <KPI
            label="Rejected"
            value={(totals?.RESERVATION_REJECTED || 0).toLocaleString()}
            spark={<Sparkline data={pad(data, 'RESERVATION_REJECTED', range)} w={180} h={28} color="var(--offline)" />}
          />
        </div>

        {/* Main chart */}
        <div className="card">
          <div className="card-hd">
            <div>
              <h3>{metricLabel(metric)} · daily</h3>
              <div className="t-small muted" style={{ marginTop: 2 }}>
                {series[0]?.date.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
                {series.length > 1 && ' – '}
                {series.slice(-1)[0]?.date.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            </div>
            <div className="seg">
              <button aria-pressed={metric === 'RESERVATION_CONFIRMED'} onClick={() => setMetric('RESERVATION_CONFIRMED')}>Reservations</button>
              <button aria-pressed={metric === 'SEARCH'} onClick={() => setMetric('SEARCH')}>Searches</button>
              <button aria-pressed={metric === 'CLICK'} onClick={() => setMetric('CLICK')}>Clicks</button>
            </div>
          </div>
          <div className="card-bd">
            {loading ? (
              <div style={{ height: 260, display: 'grid', placeItems: 'center', color: 'var(--text-3)' }}>Loading…</div>
            ) : (
              <LineChart series={{ data: series, color: 'var(--accent)' }} height={260} formatY={v => v.toLocaleString()} />
            )}
          </div>
        </div>

        {/* Recent invoices */}
        <div className="grid" style={{ gridTemplateColumns: '1fr', gap: 16 }}>
          <div className="card">
            <div className="card-hd">
              <h3>Recent invoices</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/provider/invoices')}>
                See all <Icon name="chevron-right" size={12} />
              </button>
            </div>
            <div className="card-bd" style={{ display: invoices.length ? 'grid' : 'block', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {invoices.length === 0 ? (
                <div className="t-small muted" style={{ textAlign: 'center', padding: '12px 0' }}>
                  No invoices yet. Issue one from the Invoices page after some reservations have been billed.
                </div>
              ) : (
                invoices.slice(0, 4).map(inv => (
                  <div
                    key={inv._id}
                    onClick={() => navigate('/provider/invoices')}
                    style={{
                      padding: '12px 14px', borderRadius: 'var(--r-2)',
                      display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, cursor: 'pointer',
                      background: 'var(--bg-sunk)', border: '1px solid transparent',
                      transition: 'border-color 80ms'
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
                  >
                    <div className="row" style={{ gap: 10 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 'var(--r-2)', background: 'var(--bg-elev)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
                        <Icon name="doc" size={14} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 13.5 }} className="t-mono">{inv._id.slice(-8).toUpperCase()}</div>
                        <div className="t-small muted">{new Date(inv.issuedAt).toLocaleDateString('en', { month: 'long', year: 'numeric' })}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="t-num" style={{ fontWeight: 500 }}>€{inv.totalAmount.toFixed(2)}</div>
                      <span className={`badge ${inv.status === 'PAID' ? 'badge-paid' : 'badge-unpaid'}`} style={{ marginTop: 2 }}>
                        {inv.status === 'PAID' ? 'Paid' : inv.status === 'VOID' ? 'Void' : 'Unpaid'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
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

function pad(data: AnalyticsResp | null, metric: string, range: string): { date: Date; value: number }[] {
  if (!data) return [];
  const days = RANGES[range] || 30;
  const byDay = new Map<string, number>();
  
  for (const pt of data.timeSeries) {
    const b = pt.buckets.find(x => x.eventType === metric);
    byDay.set(pt.day, b?.count || 0);
  }
  
  const out = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = days - 1; i >= 0; i--) {
    // Safely calculate each day relative to today's midnight
    const d = new Date(today.getTime());
    d.setDate(today.getDate() - i);
    
    out.push({ date: d, value: byDay.get(getLocalISODate(d)) || 0 });
  }
  return out;
}

function getLocalISODate(d: Date): string {
  const year = d.getFullYear(); // Local year
  const month = String(d.getMonth() + 1).padStart(2, '0'); // Local month (0-11)
  const day = String(d.getDate()).padStart(2, '0'); // Local day of month
  return `${year}-${month}-${day}`;
}
