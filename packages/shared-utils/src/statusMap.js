// Canonical station statuses from the provider API specification.
const STATION_STATUSES = ['available', 'charging', 'reserved', 'malfunction', 'offline'];

const STATUS_ALIASES = {
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

const LEGACY_STATUS_VALUES = {
  available: ['AVAILABLE'],
  charging: ['OCCUPIED'],
  reserved: ['OCCUPIED'],
  malfunction: ['OUT_OF_SERVICE'],
  offline: ['UNKNOWN']
};

function normalizeStatusKey(status) {
  return String(status || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function normalizeStationStatus(providerStatus, fallback = 'offline') {
  if (providerStatus == null || providerStatus === '') return fallback;
  return STATUS_ALIASES[normalizeStatusKey(providerStatus)] || fallback;
}

function isStationStatus(status) {
  return STATION_STATUSES.includes(status);
}

function stationStatusQueryValues(status) {
  const normalized = normalizeStationStatus(status, null);
  if (!normalized) return [];
  return Array.from(new Set([normalized, ...(LEGACY_STATUS_VALUES[normalized] || [])]));
}

module.exports = {
  STATION_STATUSES,
  STATUS_ALIASES,
  LEGACY_STATUS_VALUES,
  normalizeStationStatus,
  isStationStatus,
  stationStatusQueryValues,
  // Backwards-compatible export for adapters not yet renamed.
  toInternalStatus: normalizeStationStatus,
  PROVIDER_TO_INTERNAL: STATUS_ALIASES
};
