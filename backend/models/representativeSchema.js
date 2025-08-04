const mongoose = require("mongoose");
const RepresentativeSchema = new mongoose.Schema({
  name: String,
  repId: String,
  district: String,
  party: { type: String, enum: ["democrat", "independent", "republican"] },
  photo: String,
  status: { type: String, enum: ["active", "former"] },
  publishStatus: {
    type: String,
    enum: ["draft", "published" , "under review"],
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
    previousState: { type: Object },
  modifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  modifiedAt: Date,
  snapshotSource: {
  type: String, // 'deleted' | 'edited'
  enum: ['deleted_pending_update', 'edited'],
},
},{timestamps: true});

module.exports = mongoose.model("representatives", RepresentativeSchema);
