import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Icon } from '../lib/Icon';

type R = {
  reservationId: string;
  stationId: string;
  providerId: string;
  status: 'CONFIRMED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
  endTime?: string;
  chargeAmount?: number;
  currency?: string;
  createdAt?: string;
};

const STATUS_BADGE: Record<R['status'], { cls: string; label: string }> = {
  CONFIRMED: { cls: 'badge-accent',  label: 'Active' },
  REJECTED:  { cls: 'badge-offline', label: 'Rejected' },
  EXPIRED:   { cls: 'badge',         label: 'Expired' },
  CANCELLED: { cls: 'badge',         label: 'Cancelled' }
};

// Stable color per provider — picked from the design's palette
const PROVIDER_COLORS = ['#ef4444', '#0EA5E9', '#1d4ed8', '#a855f7', '#f59e0b', '#16a34a'];
function colorFor(providerId: string): string {
  let hash = 0;
  for (let i = 0; i < providerId.length; i++) hash = (hash * 31 + providerId.charCodeAt(i)) >>> 0;
  return PROVIDER_COLORS[hash % PROVIDER_COLORS.length];
}

export default function ReservationsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<R[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/reservations')
      .then(r => setRows(r.data?.reservations || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '32px 28px', flex: 1, overflow: 'auto', width: '100%' }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div className="t-display">Reservations</div>
          <div className="t-small muted" style={{ marginTop: 4 }}>Active and recent holds across all providers.</div>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/map')}>
          <Icon name="map" size={14} /> Find a station
        </button>
      </div>

      {loading && <div className="card" style={{ padding: 18, color: 'var(--text-3)' }}>Loading…</div>}

      {!loading && rows.length === 0 && (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--bg-sunk)', color: 'var(--text-3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <Icon name="bolt" size={20} />
          </div>
          <div className="t-h2">No reservations yet</div>
          <div className="t-small muted" style={{ marginTop: 4, marginBottom: 16 }}>Pick a station from the map to get started.</div>
          <button className="btn btn-primary" onClick={() => navigate('/map')}>
            <Icon name="map" size={14} /> Open the map
          </button>
        </div>
      )}

      {rows.length > 0 && (
        <div className="res-list">
          {rows.map(r => {
            const badge = STATUS_BADGE[r.status];
            const when = r.createdAt ? friendlyDate(new Date(r.createdAt)) : '—';
            const time = r.endTime
              ? `${formatTime(new Date(new Date(r.endTime).getTime() - 30 * 60_000))}–${formatTime(new Date(r.endTime))}`
              : '';
            return (
              <div className="res-row" key={r.reservationId}>
                <div style={{ width: 36, height: 36, borderRadius: 'var(--r-2)', background: 'var(--accent-50)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="bolt" size={16} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                  <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                    <strong style={{ fontSize: 14 }}>{r.stationId}</strong>
                    <span className="t-small muted t-mono">{r.reservationId.slice(-6).toUpperCase()}</span>
                  </div>
                  <div className="row" style={{ gap: 10, color: 'var(--text-3)', fontSize: 12.5 }}>
                    <span>{when}{time && ` · ${time}`}</span>
                    <span>·</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 7, height: 7, borderRadius: 2, background: colorFor(r.providerId) }} />
                      {r.providerId}
                    </span>
                  </div>
                </div>
                <div className="t-num" style={{ fontWeight: 500 }}>
                  {r.chargeAmount != null ? `€${r.chargeAmount.toFixed(2)}` : '—'}
                </div>
                <span className={`badge ${badge.cls}`}>{badge.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function friendlyDate(d: Date): string {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that  = new Date(d); that.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - that.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7)   return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function formatTime(d: Date): string {
  return d.toTimeString().slice(0, 5);
}
