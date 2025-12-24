const mongoose = require("mongoose");
const VoteSchema = new mongoose.Schema(
  {
    type: { type: String },
    title: { type: String },
    quorumId: String,
    shortDesc: String,
    longDesc: {
      type: String,
      default: "",
    },
    rollCall: {
      type: String,
      default: "",
    },
    readMore: {
      type: String,
      default: "",
    },
    releatedBillid: { type: String },
    relatedBillTitle: { type: String },
    date: Date,
    congress: { type: String },
    termId: { type: String },
    sbaPosition: { type: String, enum: ["Yes", "No"], default: "No" },
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
    history: [
      {
        oldData: Object,
        timestamp: {
          type: Date,
          default: Date.now,
        },
        actionType: {
          type: String,
          enum: ["update", "delete"],
          default: "update",
        },
      },
    ],
    snapshotSource: {
      type: String,
      enum: ["deleted_pending_update", "edited"],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("votes", VoteSchema);
