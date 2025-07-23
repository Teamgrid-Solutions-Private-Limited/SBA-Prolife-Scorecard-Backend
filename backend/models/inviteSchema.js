const mongoose = require('mongoose');

const InviteSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  role: { type: String, enum: ['admin', 'editor', 'contributor'], default: 'contributor' },
  token: { type: String, required: true },
  expiresAt: { type: Date, required: true }
});

module.exports = mongoose.model('Invite', InviteSchema);
