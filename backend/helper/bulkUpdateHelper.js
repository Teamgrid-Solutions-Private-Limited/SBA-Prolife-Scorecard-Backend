// helper/bulkUpdateHelper.js
async function performBulkUpdate({
  model,
  ids,
  updateData,
  options = {},
  validation,
}) {
  // Input validation
  if (!model || !ids || !Array.isArray(ids) || ids.length === 0) {
    throw new Error("Invalid input parameters");
  }

  // Run custom validation if provided
  if (validation && typeof validation === "function") {
    const validationError = validation(updateData);
    if (validationError) {
      throw new Error(validationError);
    }
  }

  // Perform the update
  const result = await model.updateMany(
    { _id: { $in: ids } },
    { $set: updateData },
    { new: true, ...options }
  );

  if (result.modifiedCount === 0) {
    throw new Error("No documents were updated");
  }

  // Fetch updated documents
  const updatedDocs = await model
    .find({ _id: { $in: ids } })
    .populate(options.populate || []);

  return {
    message: `${result.modifiedCount} documents updated successfully`,
    updatedDocs,
    modifiedCount: result.modifiedCount,
  };
}

module.exports = {
  performBulkUpdate,
};
