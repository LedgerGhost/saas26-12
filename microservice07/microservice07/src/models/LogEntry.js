const mongoose = require('mongoose');

const EVENT_TYPES = [
  'CLICK', 'SEARCH',
  'RESERVATION_CONFIRMED', 'RESERVATION_REJECTED',
  'INVOICE_ISSUED', 'PAYMENT_COMPLETED'
];

const logSchema = new mongoose.Schema({
  eventType:  { type: String, enum: EVENT_TYPES, required: true, index: true },
  providerId: { type: String, index: true },
  stationId:  { type: String, index: true },
  userId:     { type: String, index: true },
  metadata:   { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt:  { type: Date, default: Date.now, index: true }
}, { collection: 'log_entries' });

logSchema.index({ providerId: 1, createdAt: -1 });
logSchema.index({ eventType: 1, createdAt: -1 });

module.exports = mongoose.model('LogEntry', logSchema);
module.exports.EVENT_TYPES = EVENT_TYPES;
