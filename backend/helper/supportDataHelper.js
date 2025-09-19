// helpers/voteSupportHelper.js
// const SenatorData = require("../models/senatorDataSchema");
// const RepresentativeData = require("../models/representativeDataSchema");

// async function buildSupportData(vote) {
//   let supportData = { yea: [], nay: [], other: [] };

//   if (!vote) return supportData;

//   try {
//     // Handle both "senate" and "senate_bill" types
//     if (vote.type?.toLowerCase().includes("senate")) {
//       console.log("Processing Senate vote:", vote._id);

//       const senatorVotes = await SenatorData.find({
//         "votesScore.voteId": vote._id,
//       })
//         .populate("senateId", "name party state photo")
//         .lean();

//       console.log("Found senator votes:", senatorVotes.length);

//       senatorVotes.forEach((senData) => {
//         const scoreEntry = senData.votesScore.find(
//           (v) => v.voteId && v.voteId.toString() === vote._id.toString()
//         );

//         if (scoreEntry && senData.senateId) {
//           const info = {
//             name: senData.senateId.name,
//             party: senData.senateId.party,
//             state: senData.senateId.state,
//             photo: senData.senateId.photo,
//           };

//           const score = scoreEntry.score?.toLowerCase();
//           if (score === "yea") {
//             supportData.yea.push(info);
//           } else if (score === "nay") {
//             supportData.nay.push(info);
//           } else {
//             supportData.other.push(info);
//           }
//         }
//       });
//     }
//     // Handle both "house" and "house_bill" types
//     else if (vote.type?.toLowerCase().includes("house")) {
//       console.log("Processing House vote:", vote._id);

//       const repVotes = await RepresentativeData.find({
//         "votesScore.voteId": vote._id,
//       })
//         .populate("repId", "name party state photo")
//         .lean();

//       console.log("Found representative votes:", repVotes.length);

//       repVotes.forEach((repData) => {
//         const scoreEntry = repData.votesScore.find(
//           (v) => v.voteId && v.voteId.toString() === vote._id.toString()
//         );

//         if (scoreEntry && repData.repId) {
//           const info = {
//             name: repData.repId.name,
//             party: repData.repId.party,
//             state: repData.repId.state,
//             photo: repData.repId.photo,
//           };

//           const score = scoreEntry.score?.toLowerCase();
//           if (score === "yea") {
//             supportData.yea.push(info);
//           } else if (score === "nay") {
//             supportData.nay.push(info);
//           } else {
//             supportData.other.push(info);
//           }
//         }
//       });
//     }

//     console.log("Support data result:", {
//       yea: supportData.yea.length,
//       nay: supportData.nay.length,
//       other: supportData.other.length
//     });

//   } catch (error) {
//     console.error("Error building support data:", error);
//   }

//   return supportData;
// }

// module.exports = { buildSupportData };

// helpers/voteSupportHelper.js
// const SenatorData = require("../models/senatorDataSchema");
// const RepresentativeData = require("../models/representativeDataSchema");

// async function buildSupportData(doc, isActivity = false) {
//   // Default containers with support data and participation stats
//   let supportData = isActivity
//     ? {
//         yes: [],
//         no: [],
//         other: [],
//         senatorsData: {
//           yes: [],
//           no: [],
//           other: []
//         },
//         houseMembersData: {
//           yes: [],
//           no: [],
//           other: []
//         },
//         participation: {
//           totalVotes: 0,
//           yesVotes: 0,
//           noVotes: 0,
//           otherVotes: 0,
//           totalSenators: 0,
//           totalRepresentatives: 0
//         }
//       }
//     : {
//         yea: [],
//         nay: [],
//         other: [],
//         senatorsData: {
//           yea: [],
//           nay: [],
//           other: []
//         },
//         houseMembersData: {
//           yea: [],
//           nay: [],
//           other: []
//         },
//         participation: {
//           totalVotes: 0,
//           yeaVotes: 0,
//           nayVotes: 0,
//           otherVotes: 0,
//           totalSenators: 0,
//           totalRepresentatives: 0
//         }
//       };

//   if (!doc) return supportData;

//   try {
//     // Always fetch both Senate and House data regardless of vote type
//     const [senatorDocs, repDocs] = await Promise.all([
//       // Get Senator data
//       SenatorData.find({
//         [isActivity ? "activitiesScore.activityId" : "votesScore.voteId"]: doc._id,
//       })
//         .populate("senateId", "_id name party state photo")
//         .lean(),

//       // Get Representative data
//       RepresentativeData.find({
//         [isActivity ? "activitiesScore.activityId" : "votesScore.voteId"]: doc._id,
//       })
//         .populate("houseId", "_id name party district state photo")
//         .lean()
//     ]);

//     // Process Senator votes/activities
//     senatorDocs.forEach((senData) => {
//       const scoreEntry = (
//         isActivity ? senData.activitiesScore : senData.votesScore
//       ).find(
//         (s) =>
//           s[isActivity ? "activityId" : "voteId"] &&
//           s[isActivity ? "activityId" : "voteId"].toString() === doc._id.toString()
//       );

//       if (scoreEntry && senData.senateId) {
//         const info = {
//           _id: senData.senateId._id,
//           name: senData.senateId.name,
//           party: senData.senateId.party,
//           state: senData.senateId.state,
//           photo: senData.senateId.photo,
//           chamber: 'senate'
//         };

//         const score = scoreEntry.score?.toLowerCase();
//         if (isActivity) {
//           // Push to main arrays if it's a Senate activity
//           if (doc.type?.toLowerCase().includes("senate")) {
//             if (score === "yes") supportData.yes.push(info);
//             else if (score === "no") supportData.no.push(info);
//             else supportData.other.push(info);
//           }
//           // Always push to chamber-specific arrays
//           if (score === "yes") supportData.senatorsData.yes.push(info);
//           else if (score === "no") supportData.senatorsData.no.push(info);
//           else supportData.senatorsData.other.push(info);
//         } else {
//           // Push to main arrays if it's a Senate vote
//           if (doc.type?.toLowerCase().includes("senate")) {
//             if (score === "yea") supportData.yea.push(info);
//             else if (score === "nay") supportData.nay.push(info);
//             else supportData.other.push(info);
//           }
//           // Always push to chamber-specific arrays
//           if (score === "yea") supportData.senatorsData.yea.push(info);
//           else if (score === "nay") supportData.senatorsData.nay.push(info);
//           else supportData.senatorsData.other.push(info);
//         }
//       }
//     });

//     // Process Representative votes/activities
//     repDocs.forEach((repData) => {
//       const scoreEntry = (
//         isActivity ? repData.activitiesScore : repData.votesScore
//       ).find(
//         (s) =>
//           s[isActivity ? "activityId" : "voteId"] &&
//           s[isActivity ? "activityId" : "voteId"].toString() === doc._id.toString()
//       );

//       if (scoreEntry && repData.houseId) {
//         const info = {
//           _id: repData.houseId._id,
//           name: repData.houseId.name,
//           party: repData.houseId.party,
//           state: repData.houseId.state,
//           district: repData.houseId.district,
//           photo: repData.houseId.photo,
//           chamber: 'house'
//         };

//         const score = scoreEntry.score?.toLowerCase();
//         if (isActivity) {
//           // Push to main arrays if it's a House activity
//           if (doc.type?.toLowerCase().includes("house")) {
//             if (score === "yes") supportData.yes.push(info);
//             else if (score === "no") supportData.no.push(info);
//             else supportData.other.push(info);
//           }
//           // Always push to chamber-specific arrays
//           if (score === "yes") supportData.houseMembersData.yes.push(info);
//           else if (score === "no") supportData.houseMembersData.no.push(info);
//           else supportData.houseMembersData.other.push(info);
//         } else {
//           // Push to main arrays if it's a House vote
//           if (doc.type?.toLowerCase().includes("house")) {
//             if (score === "yea") supportData.yea.push(info);
//             else if (score === "nay") supportData.nay.push(info);
//             else supportData.other.push(info);
//           }
//           // Always push to chamber-specific arrays
//           if (score === "yea") supportData.houseMembersData.yea.push(info);
//           else if (score === "nay") supportData.houseMembersData.nay.push(info);
//           else supportData.houseMembersData.other.push(info);
//         }
//       }
//     });
//   } catch (error) {
//     console.error("Error building support data:", error);
//   }

//   // Calculate participation stats before returning
//   if (isActivity) {
//     // For activities
//     const senatorTotals = {
//       yes: supportData.senatorsData.yes.length,
//       no: supportData.senatorsData.no.length,
//       other: supportData.senatorsData.other.length
//     };

//     const houseTotals = {
//       yes: supportData.houseMembersData.yes.length,
//       no: supportData.houseMembersData.no.length,
//       other: supportData.houseMembersData.other.length
//     };

//     supportData.participation = {
//       totalVotes: supportData.yes.length + supportData.no.length + supportData.other.length,
//       yesVotes: supportData.yes.length,
//       noVotes: supportData.no.length,
//       otherVotes: supportData.other.length,
//       totalSenators: senatorTotals.yes + senatorTotals.no + senatorTotals.other,
//       totalRepresentatives: houseTotals.yes + houseTotals.no + houseTotals.other
//     };
//   } else {
//     // For votes
//     const senatorTotals = {
//       yea: supportData.senatorsData.yea.length,
//       nay: supportData.senatorsData.nay.length,
//       other: supportData.senatorsData.other.length
//     };

//     const houseTotals = {
//       yea: supportData.houseMembersData.yea.length,
//       nay: supportData.houseMembersData.nay.length,
//       other: supportData.houseMembersData.other.length
//     };

//     supportData.participation = {
//       totalVotes: supportData.yea.length + supportData.nay.length + supportData.other.length,
//       yeaVotes: supportData.yea.length,
//       nayVotes: supportData.nay.length,
//       otherVotes: supportData.other.length,
//       totalSenators: senatorTotals.yea + senatorTotals.nay + senatorTotals.other,
//       totalRepresentatives: houseTotals.yea + houseTotals.nay + houseTotals.other,
//       // Additional chamber-specific breakdowns
//       senatorVotes: senatorTotals,
//       houseVotes: houseTotals
//     };
//   }

//   return supportData;
// }

// module.exports = { buildSupportData };

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

