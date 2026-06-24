const mongoose = require('mongoose');

const STATION_STATUSES = ['available', 'charging', 'reserved', 'malfunction', 'offline'];

const stationCacheSchema = new mongoose.Schema({
  stationId:         { type: String, required: true, unique: true, index: true }, // providerId:externalId
  providerId:        { type: String, required: true, index: true },
  externalStationId: { type: String, required: true },
  name:              { type: String },
  latitude:          { type: Number, required: true },
  longitude:         { type: Number, required: true },
  status:            { type: String, enum: STATION_STATUSES, default: 'offline' },
  pricePerKwh:       { type: Number },
  capacityKw:        { type: Number },
  connector:         { type: String },
  providerManaged:   { type: Boolean, default: false, index: true },
  manualStatus:      { type: Boolean, default: false },
  lastSyncedAt:      { type: Date, default: Date.now, index: true }
}, { collection: 'station_cache', timestamps: true });

// 2dsphere geo index for nearby queries
stationCacheSchema.index({ location: '2dsphere' });
stationCacheSchema.virtual('location').get(function () {
  return { type: 'Point', coordinates: [this.longitude, this.latitude] };
});

module.exports = mongoose.model('StationCache', stationCacheSchema);
