import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Icon } from '../lib/Icon';
import { KPI } from '../lib/charts';

type R = {
  reservationId: string;
  userId: string;
  userEmail?: string | null;
  stationId: string;
  providerId: string;
  status: 'CONFIRMED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
  endTime?: string;
  chargeAmount?: number;
  currency?: string;
  createdAt?: string;
};

const STATUS_BADGE: Record<R['status'], string> = {
  CONFIRMED: 'badge-accent',
  REJECTED:  'badge-offline',
  EXPIRED:   'badge',
  CANCELLED: 'badge'
};

const COLOR_POOL = ['#ef4444', '#0EA5E9', '#1d4ed8', '#a855f7', '#f59e0b', '#16a34a'];
function colorFor(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return COLOR_POOL[h % COLOR_POOL.length];
}

export default function AllReservationsPage() {
  const [rows, setRows] = useState<R[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [statusFilter, setStatus] = useState('');
  const [providerFilter, setProvider] = useState('');
  const [userQuery, setUserQuery] = useState('');

  async function load() {
    setLoading(true); setErr(null);
    try {
      const r = await api.get('/reservations', { params: { scope: 'all', limit: 500 } });
      setRows(r.data?.reservations || []);
    } catch (e: any) {
      setErr(e.response?.data?.message || e.message);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const providers = useMemo(() => Array.from(new Set(rows.map(r => r.providerId))).sort(), [rows]);

  const filtered = useMemo(() => rows.filter(r => {
    if (statusFilter   && r.status !== statusFilter) return false;
    if (providerFilter && r.providerId !== providerFilter) return false;
    if (userQuery) {
      const q = userQuery.toLowerCase();
      if (!(r.userEmail || '').toLowerCase().includes(q) && !(r.userId || '').includes(q)) return false;
    }
    return true;
  }), [rows, statusFilter, providerFilter, userQuery]);

  const counts = useMemo(() => {
    const c = { CONFIRMED: 0, REJECTED: 0, EXPIRED: 0, CANCELLED: 0 } as Record<R['status'], number>;
    for (const r of filtered) c[r.status]++;
    return c;
  }, [filtered]);

  const hasFilter = !!(statusFilter || providerFilter || userQuery);

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1280, margin: '0 auto' }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div className="t-display">All reservations</div>
            <div className="t-small muted" style={{ marginTop: 4 }}>Every hold ever made through saasPlug, with user attribution.</div>
          </div>
          <button className="btn btn-ghost" onClick={load} disabled={loading}>
            <Icon name="history" size={14} /> Refresh
          </button>
        </div>

        <div className="card">
          <div className="card-bd" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '1 1 240px' }}>
              <label>User (email or id)</label>
              <input className="input" value={userQuery} onChange={e => setUserQuery(e.target.value)} placeholder="alice@…" />
            </div>
            <div className="field">
              <label>Provider</label>
              <select className="select" value={providerFilter} onChange={e => setProvider(e.target.value)}>
                <option value="">Any</option>
                {providers.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Status</label>
              <select className="select" value={statusFilter} onChange={e => setStatus(e.target.value)}>
                <option value="">Any</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="REJECTED">Rejected</option>
                <option value="EXPIRED">Expired</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
            {hasFilter && (
              <button className="btn btn-ghost" onClick={() => { setStatus(''); setProvider(''); setUserQuery(''); }}>
                Reset
              </button>
            )}
          </div>
        </div>

        <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          <KPI label="Showing"   value={filtered.length.toLocaleString()} />
          <KPI label="Confirmed" value={counts.CONFIRMED.toLocaleString()} />
          <KPI label="Rejected"  value={counts.REJECTED.toLocaleString()} />
          <KPI label="Other"     value={(counts.EXPIRED + counts.CANCELLED).toLocaleString()} />
        </div>

        {err && <div className="card" style={{ padding: 14, color: 'var(--offline)' }}>{err}</div>}

        <div className="card">
          <div className="card-bd flush" style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>When</th>
                  <th>User</th>
                  <th>Station</th>
                  <th>Provider</th>
                  <th>Status</th>
                  <th className="num">Charge</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && !loading && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)' }}>
                    {hasFilter ? 'No reservations match the current filters.' : 'No reservations yet.'}
                  </td></tr>
                )}
                {filtered.map(r => (
                  <tr key={r.reservationId}>
                    <td>{r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span>{r.userEmail || <span className="muted">(no email)</span>}</span>
                        <span className="t-small muted t-mono">{r.userId}</span>
                      </div>
                    </td>
                    <td className="t-mono t-small">{r.stationId}</td>
                    <td>
                      <span className="row" style={{ gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: colorFor(r.providerId) }} />
                        {r.providerId}
                      </span>
                    </td>
                    <td><span className={`badge ${STATUS_BADGE[r.status]}`}>{r.status}</span></td>
                    <td className="num">{r.chargeAmount != null ? `€${r.chargeAmount.toFixed(2)}` : '—'}</td>
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
