const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  googleId:   { type: String, unique: true, sparse: true, index: true },
  email:      { type: String, required: true, unique: true, lowercase: true, trim: true,
                match: [/\S+@\S+\.\S+/, 'Please use a valid email address'] },
  name:       { type: String, trim: true },
  picture:    { type: String },
  role:       { type: String, enum: ['ev_user', 'provider', 'operator'], default: 'ev_user', index: true },
  status:     { type: String, enum: ['active', 'suspended'], default: 'active' },
  lastLogin:  { type: Date }
}, {
  collection: 'users',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

userSchema.methods.toJSON = function () {
  const o = this.toObject();
  delete o.__v;
  return o;
};

module.exports = mongoose.model('User', userSchema);
