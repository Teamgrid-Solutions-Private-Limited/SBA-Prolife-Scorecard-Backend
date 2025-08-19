const mongoose = require("mongoose");

const SenatorSchema = new mongoose.Schema({
  name: String,
  state: String,
  party: { type: String, enum: ["democrat", "independent", "republican"] },
  photo: String,
  status: { type: String, enum: ["active", "former"] },
  senatorId: String,
  publishStatus: {
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
        expiresAt: Date
      },
    ],
  snapshotSource: {
  type: String, // 'deleted' | 'edited'
  enum: ['deleted_pending_update', 'edited'],
},
  modifiedAt: Date,
},{timestamps: true});

module.exports = mongoose.model("senators", SenatorSchema);
