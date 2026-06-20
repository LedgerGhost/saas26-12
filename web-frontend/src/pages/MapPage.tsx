import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Icon } from '../lib/Icon';
import { StatusBadge } from '../lib/charts';
import {
  isReservationLive,
  useReservationClock,
  type ReservationStatus,
  type TimedReservation
} from '../lib/reservations';

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
type ActiveReservation = {
  reservationId: string;
  stationId: string;
  status: ReservationStatus;
  endTime?: string;
  createdAt?: string;
};
type StationFocusTarget = { station: Station; key: number };
type ReservationActionTarget = {
  stationId: string;
  label: string;
  station?: Station;
};

// Map backend ALL_CAPS → design's lowercase tokens used in CSS .badge-* classes
const API_TO_TOKEN: Record<ApiStatus, 'available' | 'occupied' | 'offline' | 'unknown'> = {
  AVAILABLE: 'available', OCCUPIED: 'occupied',
  OUT_OF_SERVICE: 'offline', UNKNOWN: 'unknown'
};
const TOKEN_COLOR: Record<string, string> = {
  available: '#16a34a', occupied: '#f59e0b', offline: '#dc2626', unknown: '#71717a'
};
const PROVIDER_OPTIONS = [
  { id: 'redPlug', label: 'RedPlug' },
  { id: 'greenPlug', label: 'GreenPlug' },
  { id: 'bluePlug', label: 'BluePlug' }
];

const ATHENS: [number, number] = [37.9838, 23.7275];
const WORLD_MIN_ZOOM_FLOOR = 2;
const WORLD_BOUNDS: L.LatLngBoundsExpression = [
  [-85.05112878, -180],
  [85.05112878, 180]
];

export default function MapPage() {
  const { user } = useAuth();
  const readOnly = user?.role === 'operator';

  const [stations, setStations] = useState<Station[]>([]);
  const [activeReservations, setActiveReservations] = useState<Record<string, ActiveReservation>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    available: true, occupied: true, offline: false, unknown: false
  });
  const [nameQuery, setNameQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [providerId, setProviderId] = useState('');
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null);
  const [reserving, setReserving] = useState<Station | null>(null);
  const [confirmation, setConfirmation] = useState<any>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [recenterKey, setRecenterKey] = useState(0);
  const [lastReservation, setLastReservation] = useState<any>(null);
  const [focusedReservationStationId, setFocusedReservationStationId] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<StationFocusTarget | null>(null);
  const markerRefs = useRef<Record<string, L.CircleMarker | null>>({});
  const reservationClockItems = useMemo<TimedReservation[]>(() => {
    const reservations = Object.values(activeReservations);
    if (lastReservation?.endTime) {
      reservations.push({ status: 'CONFIRMED', endTime: lastReservation.endTime });
    }
    return reservations;
  }, [activeReservations, lastReservation]);
  const reservationNow = useReservationClock(reservationClockItems);
  const liveActiveReservations = useMemo(() => (
    Object.values(activeReservations)
      .filter(reservation => isReservationLive(reservation, reservationNow))
      .reduce((acc: Record<string, ActiveReservation>, reservation) => {
        acc[reservation.stationId] = reservation;
        return acc;
      }, {})
  ), [activeReservations, reservationNow]);
  const hasLiveLastReservation = !!lastReservation && isReservationLive(
    { status: 'CONFIRMED', endTime: lastReservation.endTime },
    reservationNow
  );
  const reservationActionTarget = useMemo<ReservationActionTarget | null>(() => {
    if (hasLiveLastReservation && lastReservation?.station?.stationId) {
      return {
        stationId: lastReservation.station.stationId,
        station: lastReservation.station,
        label: lastReservation.station.name || lastReservation.station.stationId
      };
    }

    const reservation = Object.values(liveActiveReservations)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];
    if (!reservation) return null;

    const station = stations.find(s => s.stationId === reservation.stationId);
    return {
      stationId: reservation.stationId,
      station,
      label: station?.name || reservation.stationId
    };
  }, [hasLiveLastReservation, lastReservation, liveActiveReservations, stations]);

  async function fetchStations() {
    setLoading(true); setErr(null);
    try {
      const params: any = {};
      if (appliedQuery) params.q = appliedQuery;
      if (providerId) params.providerId = providerId;
      const r = await api.get('/stations', { params });
      setStations(r.data?.stations || []);
      setLastSync(new Date());
    } catch (e: any) {
      setErr(e.response?.data?.message || e.message);
    } finally { setLoading(false); }
  }
  useEffect(() => { fetchStations(); /* eslint-disable-next-line */ }, [appliedQuery, providerId]);

  async function fetchActiveReservations() {
    if (!user || readOnly) {
      setActiveReservations({});
      return;
    }
    try {
      const r = await api.get('/reservations');
      const active = (r.data?.reservations || [])
        .filter((reservation: ActiveReservation) => isReservationLive(reservation))
        .reduce((acc: Record<string, ActiveReservation>, reservation: ActiveReservation) => {
          acc[reservation.stationId] = reservation;
          return acc;
        }, {});
      setActiveReservations(active);
    } catch {
      setActiveReservations({});
    }
  }
  useEffect(() => { fetchActiveReservations(); /* eslint-disable-next-line */ }, [user?._id, readOnly]);

  // Apply status filters client-side using the design's tokens.
  const visible = useMemo(() => stations.filter(s => filters[API_TO_TOKEN[s.status]]), [stations, filters]);

  function clearStationFocus() {
    setFocusedReservationStationId(null);
    setFocusTarget(null);
  }

  function recenterToCurrentStations() {
    clearStationFocus();
    setRecenterKey(key => key + 1);
  }

  async function getReservationStation(target: ReservationActionTarget): Promise<Station> {
    const knownStation = target.station || stations.find(station => station.stationId === target.stationId);
    if (knownStation) return knownStation;

    const r = await api.get(`/stations/${encodeURIComponent(target.stationId)}`);
    return r.data;
  }

  async function showReservedStation() {
    if (!reservationActionTarget) return;
    let station: Station;
    try {
      station = await getReservationStation(reservationActionTarget);
    } catch (e: any) {
      const msg = e.response?.data?.message || e.response?.data?.error || e.message;
      setToast({ kind: 'error', msg: `Could not load reserved station: ${msg}` });
      setTimeout(() => setToast(null), 4000);
      return;
    }

    setFilters({ available: true, occupied: true, offline: true, unknown: true });
    setProviderId('');
    setNameQuery('');
    setAppliedQuery('');
    setStations(current => (
      current.some(existing => existing.stationId === station.stationId)
        ? current.map(existing => existing.stationId === station.stationId ? { ...existing, ...station } : existing)
        : [station, ...current]
    ));
    setFocusedReservationStationId(station.stationId);
    setFocusTarget({ station, key: Date.now() });
  }

  function toggleStatusFilter(name: keyof typeof filters) {
    clearStationFocus();
    setFilters(current => ({ ...current, [name]: !current[name] }));
  }

  async function reserve(station: Station, minutes: number) {
    try {
      const r = await api.post('/reservations', { stationId: station.stationId, minutes });
      const reservation = {
        station, minutes,
        endTime: r.data?.endTime || null,
        confId: r.data?.reservationId?.slice(-6).toUpperCase() || '—',
        end: r.data?.endTime ? new Date(r.data.endTime).toTimeString().slice(0, 5) : '—',
        cost: r.data?.chargeAmount ? r.data.chargeAmount.toFixed(2) : '0.00',
        currency: r.data?.currency || 'EUR'
      };
      setConfirmation(reservation);
      setLastReservation(reservation);
      setReserving(null);
      await Promise.all([fetchStations(), fetchActiveReservations()]);
    } catch (e: any) {
      const msg = e.response?.data?.message || e.response?.data?.error || e.message;
      setToast({ kind: 'error', msg: `Reservation failed: ${msg}` });
      
      // Ensure the modal closes even when the backend returns a 502 error
      setReserving(null); 
      
      setTimeout(() => setToast(null), 4000);
    }
  }

  async function cancelReservation(reservation: ActiveReservation) {
    try {
      await api.post(`/reservations/${encodeURIComponent(reservation.reservationId)}/cancel`);
      setToast({ kind: 'success', msg: 'Reservation cancelled.' });
      setLastReservation((current: any) => (
        current?.station?.stationId === reservation.stationId ? null : current
      ));
      clearStationFocus();
      await Promise.all([fetchStations(), fetchActiveReservations()]);
    } catch (e: any) {
      if (e.response?.data?.reservation) {
        await fetchActiveReservations();
      }
      const msg = e.response?.data?.message || e.response?.data?.error || e.message;
      setToast({ kind: 'error', msg: `Cancellation failed: ${msg}` });
    } finally {
      setTimeout(() => setToast(null), 4000);
    }
  }

  return (
    <div className={`map-wrap${reservationActionTarget && !confirmation ? ' has-reservation-action' : ''}`} style={{ flex: 1, position: 'relative' }}>
      <MapContainer
        center={ATHENS}
        zoom={13}
        minZoom={WORLD_MIN_ZOOM_FLOOR}
        maxBounds={WORLD_BOUNDS}
        maxBoundsViscosity={1}
        zoomControl={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap"
          bounds={WORLD_BOUNDS}
          noWrap
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapViewportGuards />
        <FitToStations stations={visible} recenterKey={recenterKey} />
        <FocusStation
          target={focusTarget}
          markerRefs={markerRefs}
        />
        {visible.map(st => {
          const token = API_TO_TOKEN[st.status];
          const color = TOKEN_COLOR[token];
          const activeReservation = liveActiveReservations[st.stationId];
          return (
            <CircleMarker
              key={st.stationId}
              ref={node => { markerRefs.current[st.stationId] = node; }}
              center={[st.latitude, st.longitude]}
              pathOptions={{
                color: focusedReservationStationId === st.stationId ? 'var(--accent)' : 'white',
                weight: focusedReservationStationId === st.stationId ? 5 : 3,
                fillColor: color,
                fillOpacity: 1
              }}
              radius={focusedReservationStationId === st.stationId ? 11 : 8}
              eventHandlers={{
                click: () => { api.get(`/stations/${encodeURIComponent(st.stationId)}`).catch(() => {}); }
              }}
            >
              <Popup>
                <StationPopupContent
                  station={st}
                  readOnly={readOnly}
                  activeReservation={activeReservation}
                  onReserve={() => setReserving(st)}
                  onCancelReservation={() => activeReservation && cancelReservation(activeReservation)}
                />
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* Floating chrome */}
      <div className="map-ui-layer">
        <form
          className="map-float map-search"
          onSubmit={e => { e.preventDefault(); clearStationFocus(); setAppliedQuery(nameQuery.trim()); }}
          style={{ width: 'min(380px, calc(100% - 32px))' }}
        >
          <Icon name="search" size={16} style={{ color: 'var(--text-3)', marginRight: 8 }} />
          <input
            value={nameQuery}
            onChange={e => setNameQuery(e.target.value)}
            placeholder="Search by station name or id…"
          />
          {appliedQuery && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { clearStationFocus(); setNameQuery(''); setAppliedQuery(''); }}>
              <Icon name="x" size={12} />
            </button>
          )}
          <div className="kbd" style={{ marginLeft: 6 }}>⏎</div>
        </form>

        <div className="map-float map-provider">
          <Icon name="building" size={15} style={{ color: 'var(--text-3)' }} />
          <select
            aria-label="Provider"
            value={providerId}
            onChange={e => { clearStationFocus(); setProviderId(e.target.value); }}
          >
            <option value="">All providers</option>
            {PROVIDER_OPTIONS.map(provider => (
              <option key={provider.id} value={provider.id}>{provider.label}</option>
            ))}
          </select>
          {providerId && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { clearStationFocus(); setProviderId(''); }}>
              <Icon name="x" size={12} />
            </button>
          )}
        </div>

        <div className="map-float map-filters">
          {(['available', 'occupied', 'offline', 'unknown'] as const).map(f => (
            <button
              key={f}
              className="filter-chip"
              aria-pressed={filters[f]}
              onClick={() => toggleStatusFilter(f)}
            >
              <span className="dot" style={{ background: TOKEN_COLOR[f] }} />
              {f === 'offline' ? 'Offline' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {reservationActionTarget && !confirmation && (
          <div className="map-float map-reservation-action">
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span className="t-micro">Reserved</span>
              <span className="t-small" style={{ color: 'var(--text-2)' }}>
                {reservationActionTarget.label}
              </span>
            </div>
            <button className="btn btn-primary btn-sm" onClick={showReservedStation}>
              <Icon name="map" size={13} /> Show my station reservation
            </button>
          </div>
        )}

        <div className="map-float map-status">
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
          <button className="btn btn-secondary btn-sm" onClick={recenterToCurrentStations} disabled={loading}>
            <Icon name="map" size={13} /> Re-center
          </button>
        </div>
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

function FitToStations({ stations, recenterKey }: { stations: Station[]; recenterKey: number }) {
  const map = useMap();
  useEffect(() => {
    if (!stations.length) {
      map.setView(ATHENS, 13);
      return;
    }
    const bounds = L.latLngBounds(stations.map(s => [s.latitude, s.longitude] as [number, number]));
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
  }, [stations, map, recenterKey]);
  return null;
}

function FocusStation({
  target,
  markerRefs
}: {
  target: StationFocusTarget | null;
  markerRefs: MutableRefObject<Record<string, L.CircleMarker | null>>;
}) {
  const map = useMap();

  useEffect(() => {
    if (!target) return;
    const station = target.station;

    const stationLatLng = L.latLng(station.latitude, station.longitude);
    if (map.getZoom() < 13) {
      map.setZoom(13, { animate: false });
    }
    map.panTo(stationLatLng, { animate: true, duration: 0.45 });

    const timers = [450, 900, 1400].map(delay => window.setTimeout(() => {
      markerRefs.current[station.stationId]?.openPopup();
    }, delay));

    return () => timers.forEach(window.clearTimeout);
  }, [target?.key, map, markerRefs]);

  return null;
}

function MapViewportGuards() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    const applyGuards = () => {
      map.invalidateSize({ animate: false });

      const largestSide = Math.max(container.clientWidth, container.clientHeight);
      const minZoomForViewport = Math.max(
        WORLD_MIN_ZOOM_FLOOR,
        Math.ceil(Math.log2(Math.max(largestSide, 256) / 256))
      );

      if (map.getMinZoom() !== minZoomForViewport) {
        map.setMinZoom(minZoomForViewport);
      }
      if (map.getZoom() < minZoomForViewport) {
        map.setZoom(minZoomForViewport, { animate: false });
      }
      map.panInsideBounds(L.latLngBounds(WORLD_BOUNDS), { animate: false });
    };

    const frame = window.requestAnimationFrame(applyGuards);
    const timeout = window.setTimeout(applyGuards, 150);
    const observer = new ResizeObserver(applyGuards);

    observer.observe(container);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
      observer.disconnect();
    };
  }, [map]);

  return null;
}

function StationPopupContent({ station, readOnly, activeReservation, onReserve, onCancelReservation }: {
  station: Station;
  readOnly: boolean;
  activeReservation?: ActiveReservation;
  onReserve: () => void;
  onCancelReservation: () => void;
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
        ) : activeReservation ? (
          <button
            className="btn btn-danger btn-sm"
            style={{ flex: 1 }}
            onClick={onCancelReservation}
          >
            <Icon name="x" size={13} /> Cancel reservation
          </button>
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
