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
    enum: ["draft", "published"],
    default: "draft",
  },
});

module.exports = mongoose.model("representatives", RepresentativeSchema);
