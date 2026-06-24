export const STATION_STATUSES = ['available', 'charging', 'reserved', 'malfunction', 'offline'] as const;

export type StationStatus = typeof STATION_STATUSES[number];

export const STATION_STATUS_LABEL: Record<StationStatus, string> = {
  available: 'Available',
  charging: 'Charging',
  reserved: 'Reserved',
  malfunction: 'Malfunction',
  offline: 'Offline'
};

export const STATION_STATUS_COLOR: Record<StationStatus, string> = {
  available: '#16a34a',
  charging: '#f59e0b',
  reserved: '#2563eb',
  malfunction: '#dc2626',
  offline: '#71717a'
};

const STATUS_ALIASES: Record<string, StationStatus> = {
  available: 'available',
  free: 'available',

  charging: 'charging',
  occupied: 'charging',
  busy: 'charging',
  in_use: 'charging',
  inuse: 'charging',

  reserved: 'reserved',
  held: 'reserved',
  hold: 'reserved',

  malfunction: 'malfunction',
  faulted: 'malfunction',
  faulty: 'malfunction',
  broken: 'malfunction',
  out_of_service: 'malfunction',
  outofservice: 'malfunction',

  offline: 'offline',
  unavailable: 'offline',
  unknown: 'offline'
};

function statusKey(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function normalizeStationStatus(value: unknown): StationStatus {
  if (typeof value !== 'string') return 'offline';
  return STATUS_ALIASES[statusKey(value)] || 'offline';
}
