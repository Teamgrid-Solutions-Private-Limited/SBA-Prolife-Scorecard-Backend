async function performBulkUpdate({
  model,
  ids,
  updateData,
  options = {},
  validation,
}) {
  if (!model || !ids || !Array.isArray(ids) || ids.length === 0) {
    throw new Error("Invalid input parameters");
  }
  if (validation && typeof validation === "function") {
    const validationError = validation(updateData);
    if (validationError) {
      throw new Error(validationError);
    }
  }
  const result = await model.updateMany(
    { _id: { $in: ids } },
    { $set: updateData },
    { new: true, ...options }
  );

  if (result.modifiedCount === 0) {
    throw new Error("No documents were updated");
  }
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
