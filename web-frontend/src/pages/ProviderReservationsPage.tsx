import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Icon } from '../lib/Icon';
import { KPI } from '../lib/charts';
import {
  getReservationEffectiveStatus,
  useReservationClock,
  type ReservationStatus
} from '../lib/reservations';

type Provider = {
  providerSystemId: string;
  companyName: string;
  ratePerReservation?: number;
};

type ReservationRow = {
  reservationId: string;
  userId: string;
  userEmail?: string | null;
  stationId: string;
  providerId: string;
  status: ReservationStatus;
  endTime?: string;
  chargeAmount?: number;
  currency?: string;
  createdAt?: string;
};

const STATUS_BADGE: Record<ReservationStatus, string> = {
  CONFIRMED: 'badge-accent',
  REJECTED: 'badge-offline',
  EXPIRED: 'badge',
  CANCELLED: 'badge'
};

export default function ProviderReservationsPage() {
  const [provider, setProvider] = useState<Provider | null>(null);
  const [rows, setRows] = useState<ReservationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [query, setQuery] = useState('');
  const now = useReservationClock(rows);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await api.get('/reservations', { params: { scope: 'provider', limit: 500 } });
      setProvider(r.data?.provider || null);
      setRows(r.data?.reservations || []);
    } catch (e: any) {
      setProvider(null);
      setRows([]);
      setErr(e.response?.data?.message || e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(row => {
      const effectiveStatus = getReservationEffectiveStatus(row, now);
      if (statusFilter && effectiveStatus !== statusFilter) return false;
      if (!q) return true;
      return [
        row.userEmail,
        row.userId,
        row.stationId,
        row.reservationId
      ].some(value => String(value || '').toLowerCase().includes(q));
    });
  }, [rows, statusFilter, query, now]);

  const counts = useMemo(() => {
    const next = { CONFIRMED: 0, REJECTED: 0, EXPIRED: 0, CANCELLED: 0 } as Record<ReservationStatus, number>;
    for (const row of rows) next[getReservationEffectiveStatus(row, now)] += 1;
    return next;
  }, [rows, now]);

  const hasFilter = !!(statusFilter || query);

  if (!loading && err && /PROVIDER_NOT_FOUND/i.test(err)) {
    return (
      <div style={{ padding: '60px 32px', maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
        <div className="t-display">No provider account</div>
        <div className="t-small muted" style={{ marginTop: 6 }}>
          Register or ask an operator to assign your user to a provider before viewing station reservations.
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1280, margin: '0 auto' }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div className="t-display">Station reservations</div>
            <div className="t-small muted" style={{ marginTop: 4 }}>
              Reservations made on {provider?.companyName || 'your provider'} stations.
            </div>
          </div>
          <button className="btn btn-ghost" onClick={load} disabled={loading}>
            <Icon name="history" size={14} /> Refresh
          </button>
        </div>

        <div className="card">
          <div className="card-bd" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '1 1 280px' }}>
              <label>User, station, or reservation</label>
              <input
                className="input"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="anna@example.com, redPlug:..."
              />
            </div>
            <div className="field">
              <label>Status</label>
              <select className="select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">Any</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="REJECTED">Rejected</option>
                <option value="EXPIRED">Expired</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
            {hasFilter && (
              <button className="btn btn-ghost" onClick={() => { setQuery(''); setStatusFilter(''); }}>
                Reset
              </button>
            )}
          </div>
        </div>

        <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          <KPI label="Total" value={rows.length.toLocaleString()} />
          <KPI label="Active" value={counts.CONFIRMED.toLocaleString()} />
          <KPI label="Expired" value={counts.EXPIRED.toLocaleString()} />
          <KPI label="Cancelled" value={counts.CANCELLED.toLocaleString()} />
        </div>

        {err && !/PROVIDER_NOT_FOUND/i.test(err) && (
          <div className="card" style={{ padding: 14, color: 'var(--offline)' }}>{err}</div>
        )}

        <div className="card">
          <div className="card-bd flush" style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>User</th>
                  <th>Station</th>
                  <th>Status</th>
                  <th>Ends</th>
                  <th className="num">Charge</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)' }}>
                      {hasFilter ? 'No reservations match the current filters.' : 'No reservations yet.'}
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)' }}>
                      Loading...
                    </td>
                  </tr>
                )}
                {filtered.map(row => {
                  const effectiveStatus = getReservationEffectiveStatus(row, now);
                  return (
                    <tr key={row.reservationId}>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span>{formatAthens(row.createdAt)}</span>
                          <span className="t-small muted t-mono">{row.reservationId.slice(-6).toUpperCase()}</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span>{row.userEmail || <span className="muted">(no email)</span>}</span>
                          <span className="t-small muted t-mono">{row.userId}</span>
                        </div>
                      </td>
                      <td className="t-mono t-small">{row.stationId}</td>
                      <td><span className={`badge ${STATUS_BADGE[effectiveStatus]}`}>{effectiveStatus}</span></td>
                      <td>{row.endTime ? formatAthens(row.endTime) : '—'}</td>
                      <td className="num">{row.chargeAmount != null ? `€${row.chargeAmount.toFixed(2)}` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatAthens(value?: string | Date | null): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Athens',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}
