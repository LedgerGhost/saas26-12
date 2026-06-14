import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Icon } from '../lib/Icon';
import { StatusBadge } from '../lib/charts';

type ApiStatus = 'AVAILABLE' | 'OCCUPIED' | 'OUT_OF_SERVICE' | 'UNKNOWN';
type Station = {
  stationId: string;
  providerId: string;
  name?: string;
  latitude: number;
  longitude: number;
  status: ApiStatus;
  pricePerKwh?: number;
  capacityKw?: number;
  lastUpdatedAt?: string;
};

// Map backend ALL_CAPS → design's lowercase tokens used in CSS .badge-* classes
const API_TO_TOKEN: Record<ApiStatus, 'available' | 'occupied' | 'offline' | 'unknown'> = {
  AVAILABLE: 'available', OCCUPIED: 'occupied',
  OUT_OF_SERVICE: 'offline', UNKNOWN: 'unknown'
};
const TOKEN_COLOR: Record<string, string> = {
  available: '#16a34a', occupied: '#f59e0b', offline: '#dc2626', unknown: '#71717a'
};

const ATHENS: [number, number] = [37.9838, 23.7275];

export default function MapPage() {
  const { user } = useAuth();
  const readOnly = user?.role === 'operator';

  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    available: true, occupied: true, offline: false, unknown: false
  });
  const [nameQuery, setNameQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null);
  const [reserving, setReserving] = useState<Station | null>(null);
  const [confirmation, setConfirmation] = useState<any>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  async function fetchStations() {
    setLoading(true); setErr(null);
    try {
      const params: any = {};
      if (appliedQuery) params.q = appliedQuery;
      const r = await api.get('/stations', { params });
      setStations(r.data?.stations || []);
      setLastSync(new Date());
    } catch (e: any) {
      setErr(e.response?.data?.message || e.message);
    } finally { setLoading(false); }
  }
  useEffect(() => { fetchStations(); /* eslint-disable-next-line */ }, [appliedQuery]);

  // Apply status filters client-side using the design's tokens.
  const visible = useMemo(() => stations.filter(s => filters[API_TO_TOKEN[s.status]]), [stations, filters]);

  async function reserve(station: Station, minutes: number) {
    try {
      const r = await api.post('/reservations', { stationId: station.stationId, minutes });
      setConfirmation({
        station, minutes,
        confId: r.data?.reservationId?.slice(-6).toUpperCase() || '—',
        end: r.data?.endTime ? new Date(r.data.endTime).toTimeString().slice(0, 5) : '—',
        cost: r.data?.chargeAmount ? r.data.chargeAmount.toFixed(2) : '0.00',
        currency: r.data?.currency || 'EUR'
      });
      setReserving(null);
      fetchStations();
    } catch (e: any) {
      const msg = e.response?.data?.message || e.response?.data?.error || e.message;
      setToast({ kind: 'error', msg: `Reservation failed: ${msg}` });
      
      // Ensure the modal closes even when the backend returns a 502 error
      setReserving(null); 
      
      setTimeout(() => setToast(null), 4000);
    }
  }

  return (
    <div className="map-wrap" style={{ flex: 1, position: 'relative' }}>
      <MapContainer center={ATHENS} zoom={13} zoomControl={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitToStations stations={visible} />
        {visible.map(st => {
          const token = API_TO_TOKEN[st.status];
          const color = TOKEN_COLOR[token];
          return (
            <CircleMarker
              key={st.stationId}
              center={[st.latitude, st.longitude]}
              pathOptions={{ color: 'white', weight: 3, fillColor: color, fillOpacity: 1 }}
              radius={8}
              eventHandlers={{
                click: () => { api.get(`/stations/${encodeURIComponent(st.stationId)}`).catch(() => {}); }
              }}
            >
              <Popup>
                <StationPopupContent station={st} readOnly={readOnly} onReserve={() => setReserving(st)} />
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* Floating chrome */}
      <form
        className="map-float map-search"
        onSubmit={e => { e.preventDefault(); setAppliedQuery(nameQuery.trim()); }}
        style={{ width: 'min(380px, calc(100% - 32px))' }}
      >
        <Icon name="search" size={16} style={{ color: 'var(--text-3)', marginRight: 8 }} />
        <input
          value={nameQuery}
          onChange={e => setNameQuery(e.target.value)}
          placeholder="Search by station name or id…"
        />
        {appliedQuery && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setNameQuery(''); setAppliedQuery(''); }}>
            <Icon name="x" size={12} />
          </button>
        )}
        <div className="kbd" style={{ marginLeft: 6 }}>⏎</div>
      </form>

      <div className="map-float map-filters">
        {(['available', 'occupied', 'offline', 'unknown'] as const).map(f => (
          <button
            key={f}
            className="filter-chip"
            aria-pressed={filters[f]}
            onClick={() => setFilters({ ...filters, [f]: !filters[f] })}
          >
            <span className="dot" style={{ background: TOKEN_COLOR[f] }} />
            {f === 'offline' ? 'Offline' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="map-float" style={{ left: 16, bottom: 24, padding: '12px 14px', display: 'flex', gap: 14, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span className="t-micro">Showing</span>
          <span style={{ fontSize: 15, fontWeight: 600 }} className="t-num">{visible.length} stations</span>
        </div>
        <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span className="t-micro">Athens</span>
          <span className="t-small" style={{ color: 'var(--text-2)' }}>
            {loading ? 'Loading…' : lastSync ? `Updated ${ago(lastSync)}` : '—'}
          </span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={fetchStations} disabled={loading}>
          <Icon name="history" size={13} /> Refresh
        </button>
      </div>

      {/* Modals + toasts */}
      {/* Added zIndex 9999 to the outer container of modals and toasts to overlay the map */}
      {reserving && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 9999, pointerEvents: 'none' }}>
          <ReserveModal station={reserving} onCancel={() => setReserving(null)} onConfirm={m => reserve(reserving, m)} />
        </div>
      )}
      
      {confirmation && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 9999, pointerEvents: 'none' }}>
          <ReservationToast data={confirmation} onDone={() => setConfirmation(null)} />
        </div>
      )}
      
      {err && <div className="toast error" style={{ zIndex: 9999 }}>{err}</div>}
      {toast && <div className={`toast ${toast.kind}`} style={{ zIndex: 9999 }}>{toast.msg}</div>}
    </div>
  );
}

function ago(d: Date): string {
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return d.toLocaleTimeString();
}

function FitToStations({ stations }: { stations: Station[] }) {
  const map = useMap();
  useEffect(() => {
    if (!stations.length) return;
    const bounds = L.latLngBounds(stations.map(s => [s.latitude, s.longitude] as [number, number]));
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
  }, [stations, map]);
  return null;
}

function StationPopupContent({ station, readOnly, onReserve }: {
  station: Station; readOnly: boolean; onReserve: () => void;
}) {
  const token = API_TO_TOKEN[station.status];
  return (
    <div style={{ width: 280 }}>
      <div style={{ padding: '12px 14px 8px' }}>
        <div className="t-h2" style={{ marginBottom: 2 }}>{station.name || station.stationId}</div>
        <div className="t-small muted t-mono">{station.stationId}</div>
      </div>
      <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <StatusBadge status={token} />
          <span className="t-small muted">{station.providerId}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {station.pricePerKwh != null && <Stat label="Price" value={`€${station.pricePerKwh.toFixed(2)}`} sub="/kWh" />}
          {station.capacityKw != null && <Stat label="Power" value={`${station.capacityKw}`} sub="kW" />}
        </div>
      </div>
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', background: 'var(--bg-sunk)', display: 'flex', gap: 8 }}>
        {readOnly ? (
          <div className="t-small muted" style={{ flex: 1, textAlign: 'center', padding: '8px 0' }}>
            Operators have read-only access.
          </div>
        ) : (
          <button
            className="btn btn-primary btn-sm"
            style={{ flex: 1 }}
            disabled={station.status !== 'AVAILABLE'}
            onClick={onReserve}
          >
            <Icon name="bolt" size={13} /> Reserve
          </button>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div className="t-small muted">{label}</div>
      <div className="row" style={{ gap: 4, alignItems: 'baseline' }}>
        <div style={{ fontSize: 16, fontWeight: 600 }} className="t-num">{value}</div>
        {sub && <div className="t-small muted">{sub}</div>}
      </div>
    </div>
  );
}

function ReserveModal({ station, onCancel, onConfirm }: {
  station: Station; onCancel: () => void; onConfirm: (minutes: number) => void;
}) {
  const [duration, setDuration] = useState(30);
  const end = new Date(Date.now() + duration * 60_000).toTimeString().slice(0, 5);
  const energy = ((station.capacityKw || 22) * (duration / 60) * 0.65).toFixed(1);
  const estCost = station.pricePerKwh ? (Number(energy) * station.pricePerKwh).toFixed(2) : '—';
  
  // Restored pointerEvents to 'auto' inside the modal so buttons are clickable
  return (
    <div className="modal-scrim" onClick={onCancel} style={{ pointerEvents: 'auto' }}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div style={{ padding: '20px 24px 4px' }}>
          <div className="t-h1">Reserve {station.name || station.stationId}</div>
          <div className="t-small muted t-mono" style={{ marginTop: 2 }}>{station.stationId}</div>
        </div>
        <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <div className="t-small muted" style={{ marginBottom: 8 }}>Hold for</div>
            <div className="seg" style={{ width: '100%' }}>
              {[15, 30, 45, 60].map(m => (
                <button key={m} aria-pressed={duration === m} onClick={() => setDuration(m)} style={{ flex: 1 }}>
                  {m} min
                </button>
              ))}
            </div>
          </div>
          <div style={{ background: 'var(--bg-sunk)', border: '1px solid var(--border)', borderRadius: 'var(--r-2)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Row label="Reserved until"  value={end} mono />
            <Row label="Est. energy"     value={`${energy} kWh`} />
            {station.pricePerKwh != null && <Row label="Energy rate" value={`€${station.pricePerKwh.toFixed(2)} / kWh`} />}
            <div style={{ height: 1, background: 'var(--border)' }} />
            <Row label={<strong>Estimated total</strong>} value={<strong>€{estCost}</strong>} />
          </div>
          <div className="t-small muted" style={{ display: 'flex', gap: 8 }}>
            <Icon name="info" size={14} />
            <span>The platform charges a per-reservation fee on top, set by the provider.</span>
          </div>
        </div>
        <div style={{ padding: '12px 16px 16px', display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onConfirm(duration)}>
            <Icon name="bolt" size={14} /> Confirm reservation
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: any; value: any; mono?: boolean }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <span className="t-small muted">{label}</span>
      <span className={`t-small ${mono ? 't-mono' : 't-num'}`} style={{ color: 'var(--text)' }}>{value}</span>
    </div>
  );
}

function ReservationToast({ data, onDone }: { data: any; onDone: () => void }) {
  return (
    <div className="modal-scrim" onClick={onDone} style={{ pointerEvents: 'auto' }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 380 }}>
        <div style={{ padding: '32px 28px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--available-soft)', color: 'var(--available)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check" size={28} stroke={2.4} />
          </div>
          <div className="t-h1">Reservation confirmed</div>
          <div className="t-small muted" style={{ maxWidth: 280 }}>
            <strong style={{ color: 'var(--text)' }}>{data.station.name || data.station.stationId}</strong> is held for you until{' '}
            <strong style={{ color: 'var(--text)' }} className="t-mono">{data.end}</strong>.
          </div>
        </div>
        <div style={{ margin: '0 24px 18px', padding: 14, border: '1px solid var(--border)', borderRadius: 'var(--r-2)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Row label="Confirmation"     value={<span className="t-mono">{data.confId}</span>} />
          <Row label="Hold"              value={`${data.minutes} min`} />
          <Row label="Platform fee"      value={`${data.cost} ${data.currency}`} />
        </div>
        <div style={{ padding: '0 18px 18px', display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onDone}>Done</button>
        </div>
      </div>
    </div>
  );
}