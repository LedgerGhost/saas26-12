const mongoose = require('mongoose');

const chargeSchema = new mongoose.Schema({
  providerId:    { type: String, required: true, index: true },
  reservationId: { type: String, required: true, unique: true },
  stationId:     { type: String }, // Added so Mongoose saves the Point ID
  endTime:       { type: Date },   // Added so Mongoose saves the exact end time
  amount:        { type: Number, required: true },
  currency:      { type: String, default: 'EUR' },
  invoiceId:     { type: String, default: null, index: true },
  invoicedAt:    { type: Date, default: null }
}, {
  collection: 'charges',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

chargeSchema.index({ providerId: 1, invoicedAt: 1 });

module.exports = mongoose.model('Charge', chargeSchema);