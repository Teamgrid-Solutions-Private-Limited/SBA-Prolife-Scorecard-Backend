const applyCommonFilters = (req, filter) => {
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
  if (req.query.term) {
    const termQuery = req.query.term.trim();
    const congressMatch = termQuery.match(/^(\d+)(st|nd|rd|th)/i);
    if (congressMatch) {
      filter.congress = congressMatch[1];
    }
    const yearMatch = termQuery.match(/\((\d{4}-\d{4})\)/);
    if (yearMatch) {
      filter.termId = yearMatch[1];
    }
    if (!filter.congress && !filter.termId) {
      filter.termId = { $regex: termQuery, $options: "i" };
    }
  }
  return filter;
};

const applyActivityTermFilter = (req, filter) => {
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
      if (chamber === "senate") {
        filter.type = { $regex: "^senate_", $options: "i" };
      } else if (chamber === "house") {
        filter.type = { $regex: "^house_", $options: "i" };
      }
    } else {
      if (chamber === "senate" || chamber === "house") {
        filter.type = { $regex: `^${chamber}$`, $options: "i" };
      }
    }
  }
  return filter;
};


module.exports = {
  applyCommonFilters,
  applyTermFilter,
  applyActivityTermFilter,
  applyCongressFilter,
  applyChamberFilter,
};
