const mongoose = require("mongoose");
const VoteSchema = new mongoose.Schema({
  type: { type: String },
  title: { type: String },
  quorumId: String,
  shortDesc: String,
  longDesc: String,
  rollCall: String,
  readMore: String,
  date: Date,
  congress: { type: String },
  termId: { type: mongoose.Schema.Types.ObjectId, ref: "terms" },
  sbaPosition: { type: String, enum: ["yes", "no"], default: "no" },
  status: {
    type: String,
    enum: ["draft", "published"],
    default: "draft",
  },
});

module.exports = mongoose.model("votes", VoteSchema);
