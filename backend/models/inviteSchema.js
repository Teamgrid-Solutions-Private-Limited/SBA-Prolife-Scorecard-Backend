const mongoose = require('mongoose');

const InviteSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  role: { type: String, enum: ['admin', 'editor', 'contributor'], default: 'contributor' },
  token: { type: String, required: true },
  password: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  status: { type: String, enum: ['pending', 'completed'], default: 'pending' }
});

module.exports = mongoose.model('Invite', InviteSchema);
