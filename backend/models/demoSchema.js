const mongoose = require("mongoose");

const quorumSchema = new mongoose.Schema({
    name: String,
    email: String,
    phone: String,
    education: String,
    state: String,
    party: { type: String, enum: ['democrat', 'independent', 'republican'] },
    photo: String,
    status: { type: String, enum: ['active', 'former'] }
});

module.exports = mongoose.model('quorum', quorumSchema);
