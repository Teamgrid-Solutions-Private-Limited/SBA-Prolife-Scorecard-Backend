const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["senate", "house"] },
    title: { type: String, required: true },
    activityquorumId: String,
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
    // New fields for discard functionality
    previousState: { type: Object }, // Stores the document state before editing
    modifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" }, // Who made the changes
    modifiedAt: Date, // When changes were made
  },
  { timestamps: true }
);

module.exports = mongoose.model("activities", activitySchema);
