function makeEditorKey(title, fieldType = "votesScore") {
  if (!title || typeof title !== "string") return fieldType;

  const normalize = (s) =>
    String(s)
      .replace(/['"]/g, "")
      .replace(/H\.R\.\s*(\d+):?/gi, "H_R_$1_")
      .replace(/S\.\s*(\d+):?/gi, "S_$1_")
      .replace(/[-–—]/g, "_")
      .replace(/[:.]/g, "_")
      .replace(/\s+/g, "_")
      .replace(/[^A-Za-z0-9_]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
  return `${fieldType}_${normalize(title)}`;
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
    return;
  }
  const beforeCount = person.editedFields?.length || 0;
  person.editedFields = (person.editedFields || []).filter(
    (f) => !(f.name === title && f.field && f.field.includes(fieldType))
  );
  const removedCount = beforeCount - person.editedFields.length;
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
  const updateData = {};
  if (removedCount > 0) updateData.editedFields = person.editedFields;
  if (fieldEditorDeleted) updateData.fieldEditors = person.fieldEditors;
  if (person.publishStatus !== undefined) updateData.publishStatus = person.publishStatus;
  if (historyCleared) updateData.history = [];

  if (Object.keys(updateData).length > 0) {
    if (updateData.publishStatus === "published") {
    }


    await model.updateOne({ _id: person._id }, { $set: updateData });
  }
}
async function migrateTitleForScoreTypes({
  oldTitle,
  newTitle,
  fieldTypes = ["votesScore"],
  personModels = [],
}) {
  if (!oldTitle || !newTitle || !personModels.length) return;

  for (const Model of personModels) {
    try {
      const persons = await Model.find({
        "editedFields.name": oldTitle,
        "editedFields.field": { $in: fieldTypes }
      });

      for (const person of persons) {
        let changed = false;
        if (Array.isArray(person.editedFields)) {
          person.editedFields = person.editedFields.map((ef) => {
            if (ef && ef.name === oldTitle) {
              const fields = Array.isArray(ef.field) ? ef.field : [ef.field];
              const hasMatchingField = fields.some(field =>
                fieldTypes.some(ft => field && field.includes(ft))
              );

              if (hasMatchingField) {
                changed = true;
                return { ...ef, name: newTitle };
              }
            }
            return ef;
          });
        }
        const plain = person.fieldEditors ?
          JSON.parse(JSON.stringify(person.fieldEditors)) : {};

        for (const fieldType of fieldTypes) {
          const oldKey = makeEditorKey(oldTitle, fieldType);
          const newKey = makeEditorKey(newTitle, fieldType);
          if (plain[oldKey]) {
            plain[newKey] = plain[oldKey];
            delete plain[oldKey];
            changed = true;
          }
          const actualKeys = Object.keys(plain);
          const caseInsensitiveMatch = actualKeys.find(
            key => key.toLowerCase() === oldKey.toLowerCase()
          );

          if (caseInsensitiveMatch && caseInsensitiveMatch !== oldKey) {
            plain[newKey] = plain[caseInsensitiveMatch];
            delete plain[caseInsensitiveMatch];
            changed = true;
          }
        }

        if (changed) {
          await Model.updateOne(
            { _id: person._id },
            {
              $set: {
                editedFields: person.editedFields,
                fieldEditors: plain
              }
            }
          );
        }
      }
    } catch (e) {
      console.warn(`migrateTitleForScoreTypes: error for model ${Model.modelName}:`, e.message);
    }
  }
}
module.exports = { makeEditorKey, deleteFieldEditor, cleanupPersonAfterDelete, migrateTitleForScoreTypes };
