/**
 * Helper function to discard changes and restore to original state
 * @param {Object} params Configuration object
 * @param {Model} params.model Mongoose model to operate on
 * @param {string} params.documentId Document ID to restore
 * @param {Object} params.userId User ID making the change
 * @param {Object} params.options Additional options
 * @param {Function} params.additionalRestoreLogic Optional function for model-specific restore logic
 * @returns {Promise<Object>} Restored document
 */
async function discardChanges({
  model,
  documentId,
  userId,
  options = {},
  additionalRestoreLogic,
}) {
  const document = await model.findById(documentId);

  if (!document) {
    throw new Error("Document not found");
  }

  if (!document.history || document.history.length === 0) {
    throw new Error("No history available to restore");
  }
  const originalState = document.history[0].oldData;
  const restoreData = {
    ...originalState,
    history: [], 
    snapshotSource: "edited", 
    modifiedAt: new Date(), 
    modifiedBy: userId,
  };
  const restoredDoc = await model.findByIdAndUpdate(documentId, restoreData, {
    new: true,
    ...options,
  });
  if (additionalRestoreLogic && typeof additionalRestoreLogic === "function") {
    await additionalRestoreLogic(originalState, documentId);
  }

  return restoredDoc;
}

module.exports = {
  discardChanges,
};
