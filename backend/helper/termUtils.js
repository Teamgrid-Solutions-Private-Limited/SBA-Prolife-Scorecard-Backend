// utils/termUtils.js

/**
 * Calculate congress numbers for a given start and end year.
 * @param {number} startYear
 * @param {number} endYear
 * @returns {number[]}
 */
function getCongresses(startYear, endYear) {
  if (startYear < 1789 || endYear < 1789) return [];

  const congresses = [];
  for (let year = startYear; year < endYear; year++) {
    const congressNumber = Math.floor((year - 1789) / 2) + 1;
    if (!congresses.includes(congressNumber)) {
      congresses.push(congressNumber);
    }
  }

  // If range is exactly 2 years → keep only the first congress
  if (endYear - startYear === 2 && congresses.length > 1) {
    congresses.splice(1);
  }

  return congresses;
}

/**
 * Validate term object and ensure congresses are populated.
 * @param {object} term
 * @returns {boolean}
 */
function isValidTerm(term) {
  if (!term.startYear || !term.endYear) return false;

  const isOddEvenRange =
    term.startYear % 2 === 1 &&
    term.endYear % 2 === 0 &&
    term.endYear - term.startYear === 1;

  if (!isOddEvenRange) return false;

  if (!term.congresses || term.congresses.length === 0) {
    term.congresses = getCongresses(term.startYear, term.endYear);
  }

  return true;
}

module.exports = {
  getCongresses,
  isValidTerm,
};
