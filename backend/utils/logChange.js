// utils/logChange.js
const ChangeLog = require("../models/changeLogModel");

function applyChangeLogger(schema, modelName) {
  schema.pre("findOneAndUpdate", async function (next) {
    try {
      const docId = this.getQuery()._id;
      const originalDoc = await this.model.findById(docId);

      if (originalDoc) {
        await ChangeLog.create({
          modelName,
          documentId: docId,
          changedBy: this.options.changedBy, // ✅ Get it from options
          oldData: originalDoc.toObject(),
        });
      }
    } catch (err) {
      console.error("Change logging failed:", err);
    }
    next();
  });
}

module.exports = applyChangeLogger;
