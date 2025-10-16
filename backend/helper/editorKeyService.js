function makeEditorKey(title, fieldType = "votesScore") {
  if (title.includes("H.R.")) {
    return (
      fieldType +
      "_" +
      title
        .replace(/H\.R\.\s*(\d+):/g, "H_R_$1_")
        .replace(/'/g, "")
        .replace(/\s+/g, "_")
        .replace(/[^a-zA-Z0-9_]/g, "")
    );
  } else if (title.includes("S.")) {
    return (
      fieldType +
      "_" +
      title
        .replace(/S\.\s*(\d+):/g, "S_$1_")
        .replace(/'/g, "")
        .replace(/\s+/g, "_")
        .replace(/[^a-zA-Z0-9_]/g, "")
    );
  } else {
    return (
      fieldType +
      "_" +
      title
        .replace(/\./g, "")
        .replace(/:/g, "")
        .replace(/'/g, "")
        .replace(/\s+/g, "_")
        .replace(/[^a-zA-Z0-9_]/g, "")
    );
  }
}

function deleteFieldEditor(fieldEditorsPlain, actualKeys, targetKey) {
  if (fieldEditorsPlain[targetKey]) {
    delete fieldEditorsPlain[targetKey];
    return true;
  } else {
    const foundKey = actualKeys.find(
      (key) => key.toLowerCase() === targetKey.toLowerCase()
    );
    if (foundKey) {
      delete fieldEditorsPlain[foundKey];
      return true;
    } else {
      const normalizedTargetKey = targetKey.replace(/_/g, "");
      const foundPatternKey = actualKeys.find((key) => {
        const normalizedKey = key.replace(/_/g, "");
        return normalizedKey === normalizedTargetKey;
      });

      if (foundPatternKey) {
        delete fieldEditorsPlain[foundPatternKey];
        return true;
      } else {
        const partialMatch = actualKeys.find((key) => {
          const cleanKey = key.replace(/[^a-zA-Z0-9]/g, "");
          const cleanTargetKey = targetKey.replace(/[^a-zA-Z0-9]/g, "");
          return cleanKey === cleanTargetKey;
        });

        if (partialMatch) {
          delete fieldEditorsPlain[partialMatch];
          return true;
        } else {
          return false;
        }
      }
    }
  }
}
async function cleanupPersonAfterDelete({
  person,
  title,
  fieldType,
  model,
  removedFields = [],
  historyCleared = false,
}) {
   const hasMatch = (person.editedFields || []).some(
    (f) => f.name === title && f.field && f.field.includes(fieldType)
  );
  if (!hasMatch) {
    return; // skip — prevents duplicate cleanup and logs
  }
  // Remove editedFields for this title/fieldType
  const beforeCount = person.editedFields?.length || 0;
  person.editedFields = (person.editedFields || []).filter(
    (f) => !(f.name === title && f.field && f.field.includes(fieldType))
  );
  const removedCount = beforeCount - person.editedFields.length;

  // Remove fieldEditor key
  const editorKey = makeEditorKey(title, fieldType);
  let fieldEditorsPlain = {};
  if (person.fieldEditors) {
    try {
      fieldEditorsPlain = JSON.parse(JSON.stringify(person.fieldEditors));
    } catch (error) {
      fieldEditorsPlain = {};
      for (const key in person.fieldEditors) {
        if (!key.startsWith("$__") && key !== "_id" && key !== "__v") {
          fieldEditorsPlain[key] = person.fieldEditors[key];
        }
      }
    }
  }
  const actualKeys = Object.keys(fieldEditorsPlain);
  const fieldEditorDeleted = deleteFieldEditor(fieldEditorsPlain, actualKeys, editorKey);
  if (fieldEditorDeleted) {
    person.fieldEditors = fieldEditorsPlain;
  }

  // Restore publishStatus and history if needed
  if (person.editedFields.length === 0) {
    if (Array.isArray(person.history) && person.history.length > 0) {
      const lastHistory = person.history[person.history.length - 1];
      const restoredStatus =
        lastHistory.oldData?.publishStatus || lastHistory.publishStatus;
         if (restoredStatus === "published") {
  }

      if (restoredStatus) {
        person.publishStatus = restoredStatus;
        if (
          person.history.length === 1 &&
          (lastHistory.oldData?.publishStatus === "published" ||
            lastHistory.publishStatus === "published")
        ) {
          person.history = [];
          historyCleared = true;
        }
      }
    } else {
      person.publishStatus = "draft";
    }
  }

  // Prepare updateData
  const updateData = {};
  if (removedCount > 0) updateData.editedFields = person.editedFields;
  if (fieldEditorDeleted) updateData.fieldEditors = person.fieldEditors;
  if (person.publishStatus !== undefined) updateData.publishStatus = person.publishStatus;
  if (historyCleared) updateData.history = [];

  // Update in DB if needed
  if (Object.keys(updateData).length > 0) {
      if (updateData.publishStatus === "published") {
  }


    await model.updateOne({ _id: person._id }, { $set: updateData });
  }
}

module.exports = { makeEditorKey, deleteFieldEditor, cleanupPersonAfterDelete };
