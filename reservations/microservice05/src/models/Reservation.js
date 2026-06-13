const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema({
  userId:     { type: String, required: true, index: true },
  userEmail:  { type: String, index: true },                    // denormalized for operator list
  stationId:  { type: String, required: true, index: true },    // providerId:externalId
  providerId: { type: String, required: true, index: true },
  externalStationId: { type: String, required: true },

  status:           { type: String, enum: ['CONFIRMED', 'REJECTED', 'EXPIRED', 'CANCELLED'], required: true, index: true },
  requestedMinutes: { type: Number, min: 1, max: 60, default: 30 },
  endTime:          { type: Date },

  chargeAmount: { type: Number, default: 0 },
  currency:     { type: String, default: 'EUR' },

  providerResponse: { type: mongoose.Schema.Types.Mixed }
}, { collection: 'reservations', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

reservationSchema.index({ userId: 1, status: 1 });
reservationSchema.index({ providerId: 1, status: 1 });
reservationSchema.index({ endTime: 1, status: 1 });

module.exports = mongoose.model('Reservation', reservationSchema);
