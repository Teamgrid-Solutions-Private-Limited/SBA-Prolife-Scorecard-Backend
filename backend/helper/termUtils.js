function validateTermYears(startYear, endYear) {
  if (startYear == null || endYear == null) {
    return { isValid: false, message: "Start year and End year are required" };
  }

  if (startYear >= endYear) {
    return {
      isValid: false,
      message: "End year must be greater than start year",
    };
  }

  return { isValid: true, message: "" };
}


function generateTermName(startYear, endYear) {
  return `${startYear}-${endYear}`;
}


function getCongresses(startYear, endYear) {
  if (startYear < 1789 || endYear < 1789) return [];

  const congressSet = new Set();
  const startCongress = Math.floor((startYear - 1789) / 2) + 1;
  const endCongress = Math.floor((endYear - 1 - 1789) / 2) + 1;
  
  for (let congress = startCongress; congress <= endCongress; congress++) {
    congressSet.add(congress);
  }

  const congresses = Array.from(congressSet);
  
  // If range is exactly 2 years → keep only the first congress
  if (endYear - startYear === 2 && congresses.length > 1) {
    congresses.splice(1);
  }

  return congresses;
}


function isValidTerm(term) {
  if (!term || term.startYear == null || term.endYear == null) return false;

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
  validateTermYears,
  generateTermName,
};