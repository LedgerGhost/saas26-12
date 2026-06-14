// Provider APIs use: available, charging, reserved, malfunction, offline
// Internal StationStatus enum (per SRS): AVAILABLE, OCCUPIED, OUT_OF_SERVICE, UNKNOWN

const PROVIDER_TO_INTERNAL = {
  available:   'AVAILABLE',
  charging:    'OCCUPIED',
  reserved:    'OCCUPIED',
  malfunction: 'OUT_OF_SERVICE',
  offline:     'OUT_OF_SERVICE'
};

function toInternalStatus(providerStatus) {
  if (!providerStatus) return 'UNKNOWN';
  return PROVIDER_TO_INTERNAL[String(providerStatus).toLowerCase()] || 'UNKNOWN';
}

module.exports = { toInternalStatus, PROVIDER_TO_INTERNAL };
