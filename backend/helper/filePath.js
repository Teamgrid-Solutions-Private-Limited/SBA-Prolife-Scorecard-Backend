const path = require("path");

function getFileUrl(file) {
  if (!file) return null;

  // Normalize path & replace backslashes with forward slashes
  let normalized = path.normalize(file.path).replace(/\\/g, "/");

  // Remove any leading "../" for safety
  normalized = normalized.replace(/^(\.\.[/\\])+/, "");

  // Ensure URL starts with "/"
  if (!normalized.startsWith("/")) normalized = "/" + normalized;

  return normalized;
}

module.exports = { getFileUrl };
