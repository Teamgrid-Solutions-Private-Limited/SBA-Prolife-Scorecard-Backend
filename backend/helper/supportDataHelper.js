// helpers/voteSupportHelper.js
const SenatorData = require("../models/senatorDataSchema");
const RepresentativeData = require("../models/representativeDataSchema");
const Vote = require("../models/voteSchema");

// helpers/supportData.js
async function buildSupportData(vote) {
  let supportData = { yea: [], nay: [], other: [] };

  if (!vote) return supportData;

  if (vote.type?.toLowerCase() === "senate") {
    const senatorVotes = await SenatorData.find({
      "votesScore.voteId": vote._id,
    })
      .populate("senateId", "name party state photo")
      .lean();

    senatorVotes.forEach((senData) => {
      const scoreEntry = senData.votesScore.find(
        (v) => v.voteId.toString() === vote._id.toString()
      );
      if (scoreEntry) {
        const info = {
          name: senData.senateId?.name,
          party: senData.senateId?.party,
          state: senData.senateId?.state,
          photo: senData.senateId?.photo,
        };
        if (scoreEntry.score?.toLowerCase() === "yea") {
          supportData.yea.push(info);
        } else if (scoreEntry.score?.toLowerCase() === "nay") {
          supportData.nay.push(info);
        } else {
          supportData.other.push(info);
        }
      }
    });
  } 
  else if (vote.type?.toLowerCase() === "house") {
    const repVotes = await RepresentativeData.find({
      "votesScore.voteId": vote._id,
    })
      .populate("repId", "name party state")
      .lean();

    repVotes.forEach((repData) => {
      const scoreEntry = repData.votesScore.find(
        (v) => v.voteId.toString() === vote._id.toString()
      );
      if (scoreEntry) {
        const info = {
          name: repData.repId?.name,
          party: repData.repId?.party,
          state: repData.repId?.state,
        };
        if (scoreEntry.score?.toLowerCase() === "yea") {
          supportData.yea.push(info);
        } else if (scoreEntry.score?.toLowerCase() === "nay") {
          supportData.nay.push(info);
        } else {
          supportData.other.push(info);
        }
      }
    });
  }

  return supportData;
}

module.exports = { buildSupportData };


