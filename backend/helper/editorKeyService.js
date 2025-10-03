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

module.exports = { makeEditorKey, deleteFieldEditor };