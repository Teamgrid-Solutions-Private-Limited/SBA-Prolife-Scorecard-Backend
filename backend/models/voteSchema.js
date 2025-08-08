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
    enum: ["draft", "published", "under review"],
    default: "draft",
  },
  editedFields: {
    type: [String],
    default: [],
  },
  fieldEditors: {
    type: Map,
    of: new mongoose.Schema(
      {
        editorId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
        editorName: String,
        editedAt: { type: Date, default: Date.now },
      },
      { _id: false }
    ),
    default: {},
  },
  // New fields for discard functionality
    // Replaced previousState with history array
  history: [
    {
      oldData: Object,
      timestamp: {
        type: Date,
        default: Date.now,
      },
      actionType: {
        type: String,
        enum: ['update', 'delete'],
        default: 'update',
      },
    },
  ],
  snapshotSource: {
    type: String, // 'deleted' | 'edited'
    enum: ['deleted_pending_update', 'edited'],
  },
      modifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" }, // Who made the changes
      modifiedAt: Date, // When changes were made
    },
  { timestamps: true }
);

module.exports = mongoose.model("votes", VoteSchema);
