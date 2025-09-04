const applyCommonFilters = (req, filter) => {
  // Published / Draft filter
  if (req.query.frontend === "true") {
    filter.status = "published";
  } else {
    if (req.query.published === "true") {
      filter.status = "published";
    } else if (req.query.published === "false") {
      filter.status = { $ne: "published" };
    }
  }
  return filter;
};

const applyTermFilter = (req, filter) => {
  // For Votes (has termId)
  if (req.query.term) {
    const termQuery = req.query.term.trim();

    // Extract congress number (e.g. "118")
    const congressMatch = termQuery.match(/^(\d+)(st|nd|rd|th)/i);
    if (congressMatch) {
      filter.congress = congressMatch[1];
    }

    // Extract year range (e.g. "2023-2024")
    const yearMatch = termQuery.match(/\((\d{4}-\d{4})\)/);
    if (yearMatch) {
      filter.termId = yearMatch[1];
    }

    // If no pattern matched, fallback to regex on termId
    if (!filter.congress && !filter.termId) {
      filter.termId = { $regex: termQuery, $options: "i" };
    }
  }
  return filter;
};

const applyActivityTermFilter = (req, filter) => {
  // For Activities (only uses congress, no termId)
  if (req.query.term) {
    const termQuery = req.query.term.trim();

    const congressMatch = termQuery.match(/^(\d+)(st|nd|rd|th)/i);
    if (congressMatch) {
      filter.congress = congressMatch[1];
    }
  }
  return filter;
};

const applyCongressFilter = (req, filter) => {
  if (req.query.congress) {
    filter.congress = req.query.congress.toString();
  }
  return filter;
};

const applyChamberFilter = (req, filter, isVote = false) => {
  if (req.query.chamber) {
    const chamber = req.query.chamber.toLowerCase();

    if (isVote) {
      // Votes (senate_bill, house_resolution, etc.)
      if (chamber === "senate") {
        filter.type = { $regex: "^senate_", $options: "i" };
      } else if (chamber === "house") {
        filter.type = { $regex: "^house_", $options: "i" };
      }
    } else {
      // Activities (just "senate" or "house")
      if (chamber === "senate" || chamber === "house") {
        filter.type = { $regex: `^${chamber}$`, $options: "i" };
      }
    }
  }
  return filter;
};


module.exports = {
  applyCommonFilters,
  applyTermFilter, // for votes
  applyActivityTermFilter, // for activities
  applyCongressFilter,
  applyChamberFilter,
};
