const mongoose = require('mongoose');

const STATUSES = ['APPROVED', 'DECLINED'];

const paymentSchema = new mongoose.Schema({
  invoiceId:  { type: String, required: true, index: true },
  providerId: { type: String, required: true, index: true },
  amount:     { type: Number, required: true },
  currency:   { type: String, default: 'EUR' },
  status:     { type: String, enum: STATUSES, required: true },
  gatewayRef: { type: String },
  paidAt:     { type: Date, default: Date.now }
}, {
  collection: 'payments',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('Payment', paymentSchema);
module.exports.STATUSES = STATUSES;
