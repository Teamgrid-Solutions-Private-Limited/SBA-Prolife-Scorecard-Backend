const SenatorData = require("../models/senatorDataSchema");
const RepresentativeData = require("../models/representativeDataSchema");

function normalizeName(name) {
  return name.replace(/^(Sen\.|Rep\.)\s*/i, "").trim();
}

async function buildSupportData(doc, isActivity = false) {
  let supportData = isActivity
    ? {
        yes: [],
        no: [],
        other: [],
        participation: {
          totalVotes: 0,
          yesVotes: 0,
          noVotes: 0,
          otherVotes: 0,
          senateCount: 0,
          houseCount: 0,
        },
      }
    : {
        yea: [],
        nay: [],
        other: [],
        participation: {
          totalVotes: 0,
          yeaVotes: 0,
          nayVotes: 0,
          otherVotes: 0,
          senateCount: 0,
          houseCount: 0,
        },
      };

  if (!doc) return supportData;

  try {
    const [senatorDocs, repDocs] = await Promise.all([
      SenatorData.find({
        [isActivity ? "activitiesScore.activityId" : "votesScore.voteId"]:
          doc._id,
      })
        .populate("senateId", "_id name party state photo")
        .lean(),

      RepresentativeData.find({
        [isActivity ? "activitiesScore.activityId" : "votesScore.voteId"]:
          doc._id,
      })
        .populate("houseId", "_id name party district state photo")
        .lean(),
    ]);

    // Senators
    senatorDocs.forEach((senData) => {
      const scoreEntry = (
        isActivity ? senData.activitiesScore : senData.votesScore
      ).find(
        (s) =>
          s[isActivity ? "activityId" : "voteId"]?.toString() ===
          doc._id.toString()
      );

      if (scoreEntry && senData.senateId) {
        const info = {
          _id: senData.senateId._id,
          name: normalizeName(senData.senateId.name),
          party: senData.senateId.party,
          state: senData.senateId.state,
          photo: senData.senateId.photo,
          chamber: "senate",
        };

        const score = scoreEntry.score?.toLowerCase();
        if (isActivity) {
          if (score === "yes") supportData.yes.push(info);
          else if (score === "no") supportData.no.push(info);
          else supportData.other.push(info);
        } else {
          if (score === "yea") supportData.yea.push(info);
          else if (score === "nay") supportData.nay.push(info);
          else supportData.other.push(info);
        }
      }
    });

    // Representatives
    repDocs.forEach((repData) => {
      const scoreEntry = (
        isActivity ? repData.activitiesScore : repData.votesScore
      ).find(
        (s) =>
          s[isActivity ? "activityId" : "voteId"]?.toString() ===
          doc._id.toString()
      );

      if (scoreEntry && repData.houseId) {
        const info = {
          _id: repData.houseId._id,
          name: normalizeName(repData.houseId.name),
          party: repData.houseId.party,
          state: repData.houseId.state,
          district: repData.houseId.district,
          photo: repData.houseId.photo,
          chamber: "house",
        };

        const score = scoreEntry.score?.toLowerCase();
        if (isActivity) {
          if (score === "yes") supportData.yes.push(info);
          else if (score === "no") supportData.no.push(info);
          else supportData.other.push(info);
        } else {
          if (score === "yea") supportData.yea.push(info);
          else if (score === "nay") supportData.nay.push(info);
          else supportData.other.push(info);
        }
      }
    });
  } catch (error) {
    console.error("Error building support data:", error);
  }

  // Calculate participation
  if (isActivity) {
    supportData.participation = {
      totalVotes:
        supportData.yes.length +
        supportData.no.length +
        supportData.other.length,
      yesVotes: supportData.yes.length,
      noVotes: supportData.no.length,
      otherVotes: supportData.other.length,
      senateCount:
        supportData.yes.filter((m) => m.chamber === "senate").length +
        supportData.no.filter((m) => m.chamber === "senate").length +
        supportData.other.filter((m) => m.chamber === "senate").length,
      houseCount:
        supportData.yes.filter((m) => m.chamber === "house").length +
        supportData.no.filter((m) => m.chamber === "house").length +
        supportData.other.filter((m) => m.chamber === "house").length,
    };
  } else {
    supportData.participation = {
      totalVotes:
        supportData.yea.length +
        supportData.nay.length +
        supportData.other.length,
      yeaVotes: supportData.yea.length,
      nayVotes: supportData.nay.length,
      otherVotes: supportData.other.length,
      senateCount:
        supportData.yea.filter((m) => m.chamber === "senate").length +
        supportData.nay.filter((m) => m.chamber === "senate").length +
        supportData.other.filter((m) => m.chamber === "senate").length,
      houseCount:
        supportData.yea.filter((m) => m.chamber === "house").length +
        supportData.nay.filter((m) => m.chamber === "house").length +
        supportData.other.filter((m) => m.chamber === "house").length,
    };
  }

  return supportData;
}

module.exports = { buildSupportData };

