import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { api } from '../lib/api';
import { Icon } from '../lib/Icon';
import { StatusBadge } from '../lib/charts';
import {
  STATION_STATUSES,
  STATION_STATUS_COLOR,
  STATION_STATUS_LABEL,
  normalizeStationStatus,
  type StationStatus
} from '../lib/stationStatus';

type Station = {
  stationId: string;
  providerId: string;
  externalStationId?: string;
  name?: string;
  latitude: number;
  longitude: number;
  status: StationStatus;
  pricePerKwh?: number;
  capacityKw?: number;
  connector?: string;
  lastUpdatedAt?: string;
};
type Provider = {
  providerSystemId: string;
  companyName: string;
  ratePerReservation?: number;
};
type StationFocusTarget = { station: Station; key: number };

const ATHENS: [number, number] = [37.9838, 23.7275];
const WORLD_MIN_ZOOM_FLOOR = 2;
const WORLD_BOUNDS: L.LatLngBoundsExpression = [
  [-85.05112878, -180],
  [85.05112878, 180]
];
const STATION_ICONS = createStationIcons(false);
const FOCUSED_STATION_ICONS = createStationIcons(true);
const DEFAULT_FILTERS: Record<StationStatus, boolean> = {
  available: true,
  charging: true,
  reserved: true,
  malfunction: true,
  offline: true
};

export default function ProviderStationsPage() {
  const [provider, setProvider] = useState<Provider | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [fitStations, setFitStations] = useState<Station[]>([]);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null);
  const [focusTarget, setFocusTarget] = useState<StationFocusTarget | null>(null);
  const [recenterKey, setRecenterKey] = useState(0);
  const markerRefs = useRef<Record<string, L.Marker | null>>({});

  async function loadStations() {
    setLoading(true); setErr(null);
    try {
      const r = await api.get('/stations/provider/mine');
      const nextProvider = r.data?.provider || null;
      const nextStations = (r.data?.stations || [])
        .map(normalizeStation)
        .filter(hasCoordinates);
      setProvider(nextProvider);
      setStations(nextStations);
      setFitStations(nextStations);
    } catch (e: any) {
      setErr(e.response?.data?.message || e.response?.data?.error || e.message);
      setProvider(null);
      setStations([]);
      setFitStations([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadStations(); }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stations.filter(station => {
      if (!filters[station.status]) return false;
      if (!q) return true;
      return [
        station.name,
        station.stationId,
        station.externalStationId,
        station.connector
      ].some(value => String(value || '').toLowerCase().includes(q));
    });
  }, [stations, filters, query]);

  const counts = useMemo(() => stations.reduce((acc, station) => {
    acc[station.status] = (acc[station.status] || 0) + 1;
    return acc;
  }, {} as Record<StationStatus, number>), [stations]);

  function toggleFilter(status: StationStatus) {
    setFilters(current => ({ ...current, [status]: !current[status] }));
  }

  function recenter() {
    setFitStations(visible);
    setRecenterKey(key => key + 1);
  }

  async function updateStatus(station: Station, status: StationStatus) {
    try {
      const r = await api.patch(`/stations/provider/${encodeURIComponent(station.stationId)}/status`, { status });
      const updated = normalizeStation(r.data);
      setStations(current => current.map(item => item.stationId === updated.stationId ? updated : item));
      setFitStations(current => current.map(item => item.stationId === updated.stationId ? updated : item));
      setFocusTarget({ station: updated, key: Date.now() });
      showToast('success', `${updated.name || updated.stationId} is now ${STATION_STATUS_LABEL[updated.status]}.`);
    } catch (e: any) {
      showToast('error', e.response?.data?.message || e.response?.data?.error || e.message);
    }
  }

  function showToast(kind: 'success' | 'error', msg: string) {
    setToast({ kind, msg });
    window.setTimeout(() => setToast(null), 3600);
  }

  if (!loading && err && /PROVIDER_NOT_FOUND/i.test(err)) {
    return (
      <div style={{ padding: '60px 32px', maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
        <div className="t-display">No provider account</div>
        <div className="t-small muted" style={{ marginTop: 6 }}>
          Register or ask an operator to assign your user to a provider before managing stations.
        </div>
      </div>
    );
  }

  return (
    <div className="map-wrap provider-stations-map" style={{ flex: 1, position: 'relative' }}>
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
        <FitToStations stations={fitStations} recenterKey={recenterKey} />
        <FocusStation target={focusTarget} markerRefs={markerRefs} />
        {visible.map(station => {
          const focused = focusTarget?.station.stationId === station.stationId;
          return (
            <Marker
              key={station.stationId}
              ref={node => { markerRefs.current[station.stationId] = node; }}
              position={[station.latitude, station.longitude]}
              icon={focused ? FOCUSED_STATION_ICONS[station.status] : STATION_ICONS[station.status]}
              title={station.stationId}
              zIndexOffset={focused ? 1000 : 0}
              riseOnHover
            >
              <Popup>
                <StationManagementPopup station={station} onStatusChange={status => updateStatus(station, status)} />
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      <div className="map-ui-layer">
        <div className="map-float provider-map-header">
          <div>
            <div className="t-micro">Provider stations</div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{provider?.companyName || 'Your provider'}</div>
            <div className="t-small muted">
              {loading ? 'Loading stations...' : `${visible.length} of ${stations.length} visible`}
            </div>
          </div>
        </div>

        <form className="map-float map-search provider-map-search" onSubmit={e => e.preventDefault()}>
          <Icon name="search" size={16} style={{ color: 'var(--text-3)', marginRight: 8 }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search your stations..."
          />
          {query && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQuery('')}>
              <Icon name="x" size={12} />
            </button>
          )}
        </form>

        <div className="map-float map-filters provider-map-filters">
          {STATION_STATUSES.map(status => (
            <button
              key={status}
              className="filter-chip"
              aria-pressed={filters[status]}
              onClick={() => toggleFilter(status)}
            >
              <span className="dot" style={{ background: STATION_STATUS_COLOR[status] }} />
              {STATION_STATUS_LABEL[status]}
              <span className="t-num muted">{counts[status] || 0}</span>
            </button>
          ))}
        </div>

        <div className="map-float map-status provider-map-status">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="t-micro">Showing</span>
            <span style={{ fontSize: 15, fontWeight: 600 }} className="t-num">{visible.length} stations</span>
          </div>
          <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
          <button className="btn btn-ghost btn-sm" onClick={loadStations} disabled={loading}>
            <Icon name="history" size={13} /> Refresh
          </button>
          <button className="btn btn-secondary btn-sm" onClick={recenter} disabled={loading}>
            <Icon name="map" size={13} /> Re-center
          </button>
        </div>
      </div>

      {err && !/PROVIDER_NOT_FOUND/i.test(err) && <div className="toast error" style={{ zIndex: 9999 }}>{err}</div>}
      {toast && <div className={`toast ${toast.kind}`} style={{ zIndex: 9999 }}>{toast.msg}</div>}
    </div>
  );
}

function StationManagementPopup({ station, onStatusChange }: {
  station: Station;
  onStatusChange: (status: StationStatus) => Promise<void>;
}) {
  const [status, setStatus] = useState<StationStatus>(station.status);
  const [saving, setSaving] = useState(false);

  useEffect(() => setStatus(station.status), [station.status]);

  async function save() {
    setSaving(true);
    try {
      await onStatusChange(status);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ width: 304 }}>
      <div style={{ padding: '12px 14px 8px' }}>
        <div className="t-h2" style={{ marginBottom: 2 }}>{station.name || station.stationId}</div>
        <div className="t-small muted t-mono">{station.stationId}</div>
      </div>
      <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <StatusBadge status={station.status} />
          <span className="t-small muted">{station.providerId}</span>
        </div>
        <div className="field">
          <label>Status</label>
          <select className="select" value={status} onChange={e => setStatus(e.target.value as StationStatus)}>
            {STATION_STATUSES.map(option => (
              <option key={option} value={option}>{STATION_STATUS_LABEL[option]}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {station.pricePerKwh != null && <Stat label="Price" value={`€${station.pricePerKwh.toFixed(2)}`} sub="/kWh" />}
          {station.capacityKw != null && <Stat label="Power" value={`${station.capacityKw}`} sub="kW" />}
          {station.connector && <Stat label="Connector" value={station.connector} />}
          <Stat label="Coordinates" value={`${station.latitude.toFixed(4)}, ${station.longitude.toFixed(4)}`} />
        </div>
      </div>
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', background: 'var(--bg-sunk)', display: 'flex', gap: 8 }}>
        <button
          className="btn btn-primary btn-sm"
          style={{ flex: 1 }}
          disabled={saving || status === station.status}
          onClick={save}
        >
          <Icon name="check" size={13} /> {saving ? 'Saving...' : 'Save status'}
        </button>
      </div>
    </div>
  );
}

function FitToStations({ stations, recenterKey }: { stations: Station[]; recenterKey: number }) {
  const map = useMap();
  useEffect(() => {
    if (!stations.length) {
      map.flyTo(ATHENS, 13, { animate: true, duration: 0.9, easeLinearity: 0.2 });
      return;
    }
    const bounds = L.latLngBounds(stations.map(s => [s.latitude, s.longitude] as [number, number]));
    if (bounds.isValid()) {
      map.flyToBounds(bounds, { padding: [80, 80], maxZoom: 14, animate: true, duration: 0.95, easeLinearity: 0.2 });
    }
  }, [stations, map, recenterKey]);
  return null;
}

function FocusStation({ target, markerRefs }: {
  target: StationFocusTarget | null;
  markerRefs: MutableRefObject<Record<string, L.Marker | null>>;
}) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    const stationLatLng = L.latLng(target.station.latitude, target.station.longitude);
    map.flyTo(stationLatLng, Math.max(map.getZoom(), 15), { animate: true, duration: 1.1, easeLinearity: 0.18 });
    const openPopup = () => markerRefs.current[target.station.stationId]?.openPopup();
    map.once('moveend', openPopup);
    const timers = [1150, 1600].map(delay => window.setTimeout(openPopup, delay));
    return () => {
      map.off('moveend', openPopup);
      timers.forEach(window.clearTimeout);
    };
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
      if (map.getMinZoom() !== minZoomForViewport) map.setMinZoom(minZoomForViewport);
      if (map.getZoom() < minZoomForViewport) map.setZoom(minZoomForViewport, { animate: false });
      map.panInsideBounds(WORLD_BOUNDS, { animate: false });
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

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div className="t-small muted">{label}</div>
      <div className="row" style={{ gap: 4, alignItems: 'baseline' }}>
        <div style={{ fontSize: 15, fontWeight: 600 }} className="t-num">{value}</div>
        {sub && <div className="t-small muted">{sub}</div>}
      </div>
    </div>
  );
}

function normalizeStation(station: any): Station {
  return { ...station, status: normalizeStationStatus(station?.status) };
}

function hasCoordinates(station: Station): boolean {
  return Number.isFinite(station.latitude) && Number.isFinite(station.longitude);
}

function createStationIcons(focused: boolean): Record<StationStatus, L.DivIcon> {
  return STATION_STATUSES.reduce((icons, token) => {
    const size = focused ? 22 : 16;
    icons[token] = L.divIcon({
      className: `station-dot-marker station-dot-marker-${token}${focused ? ' station-dot-marker-focused' : ''}`,
      html: `<span class="station-dot-marker-dot" style="background:${STATION_STATUS_COLOR[token]}"></span>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -Math.ceil(size / 2)]
    });
    return icons;
  }, {} as Record<StationStatus, L.DivIcon>);
}
