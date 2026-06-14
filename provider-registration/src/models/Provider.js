const mongoose = require('mongoose');

const PRICING_PLANS = ['basic', 'pro'];
const STATUSES = ['active', 'suspended'];

const providerSchema = new mongoose.Schema({
  companyName:         { type: String, required: true, trim: true },
  contactEmail:        { type: String, required: true, unique: true, lowercase: true, trim: true,
                         match: [/\S+@\S+\.\S+/, 'Please use a valid email address'] },
  apiBaseUrl:          { type: String, required: true, trim: true },
  apiKey:              { type: String, required: true },
  // The upstream provider-system id used inside stationId (e.g. "redPlug" in "redPlug:42").
  // Used to map a reservation back to its Provider record for pricing lookup.
  providerSystemId:    { type: String, index: true, trim: true },
  pricingPlan:         { type: String, enum: PRICING_PLANS, default: 'basic' },
  ratePerReservation:  { type: Number, default: 0.50, min: 0 },
  ratePerSearch:       { type: Number, default: 0.001, min: 0 },
  clientId:            { type: String, unique: true, sparse: true, index: true },
  clientSecretHash:    { type: String },
  status:              { type: String, enum: STATUSES, default: 'active' },
  userId:              { type: String, index: true }
}, {
  collection: 'providers',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

providerSchema.methods.toJSON = function () {
  const o = this.toObject();
  delete o.__v;
  // Never leak the API key or hashed secret to clients
  delete o.apiKey;
  delete o.clientSecretHash;
  return o;
};

module.exports = mongoose.model('Provider', providerSchema);
module.exports.PRICING_PLANS = PRICING_PLANS;
module.exports.STATUSES = STATUSES;
