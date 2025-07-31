// models/changeLogModel.js
const mongoose = require("mongoose");

const changeLogSchema = new mongoose.Schema({
  modelName: { type: String, required: true },
  documentId: { type: mongoose.Schema.Types.ObjectId, required: true },
  oldData: { type: Object, required: true },
  //changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
  changedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("ChangeLog", changeLogSchema);
