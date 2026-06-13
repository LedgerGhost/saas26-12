const mongoose = require('mongoose');

// Added PENDING for the draft state
const STATUSES = ['PENDING', 'ISSUED', 'PAID', 'VOID'];

const reservationDetailSchema = new mongoose.Schema({
  reservationId: String,
  pointId:       String,
  timestamp:     Date,
  charge:        Number
}, { _id: false });

const lineItemSchema = new mongoose.Schema({
  description: String,
  quantity:    Number,
  unitPrice:   Number,
  subtotal:    Number
}, { _id: false });

const invoiceSchema = new mongoose.Schema({
  providerId:    { type: String, required: true, index: true },
  billingPeriod: { type: String }, // Format: YYYY-MM (e.g., "2026-06")
  issuedAt:      { type: Date, default: Date.now },
  dueDate:       { type: Date },
  totalAmount:   { type: Number, required: true },
  currency:      { type: String, default: 'EUR' },
  status:        { type: String, enum: STATUSES, default: 'PENDING', index: true },
  lineItems:     { type: [lineItemSchema], default: [] },
  reservations:  { type: [reservationDetailSchema], default: [] }
}, {
  collection: 'invoices',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('Invoice', invoiceSchema);
module.exports.STATUSES = STATUSES;