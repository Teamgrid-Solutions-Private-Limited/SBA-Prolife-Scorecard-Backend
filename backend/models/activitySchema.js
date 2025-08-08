const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["senate", "house"] },
    title: { type: String, required: true },
    shortDesc: String,
    longDesc: String,
    rollCall: String,
    readMore: String,
    date: Date,
    congress: { type: String },
    termId: { type: mongoose.Schema.Types.ObjectId, ref: "terms" },
    trackActivities: {
      type: String,
      enum: ["completed", "pending", "failed"],
      default: "completed",
    },
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
     // Replace previousState with history array
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
    // New fields for discard functionality
    modifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" }, // Who made the changes
    modifiedAt: Date, // When changes were made
  },
  { timestamps: true }
);

module.exports = mongoose.model("activities", activitySchema);
