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
const SenatorData = require("../models/senatorDataSchema");
const RepresentativeData = require("../models/representativeDataSchema");

async function buildSupportData(doc, isActivity = false) {
  // Default containers
  let supportData = isActivity
    ? { yes: [], no: [], other: [] }
    : { yea: [], nay: [], other: [] };

  if (!doc) return supportData;

  try {
    // Handle Senate types
    if (doc.type?.toLowerCase().includes("senate")) {
      const senatorDocs = await SenatorData.find({
        [isActivity ? "activitiesScore.activityId" : "votesScore.voteId"]:
          doc._id,
      })
        .populate("senateId", "_id name party district state photo")
        .lean();

      senatorDocs.forEach((senData) => {
        const scoreEntry = (
          isActivity ? senData.activitiesScore : senData.votesScore
        ).find(
          (s) =>
            s[isActivity ? "activityId" : "voteId"] &&
            s[isActivity ? "activityId" : "voteId"].toString() ===
              doc._id.toString()
        );

        if (scoreEntry && senData.senateId) {
          const info = {
            _id: senData.senateId._id,
            name: senData.senateId.name,
            party: senData.senateId.party,
            state: senData.senateId.state,
            photo: senData.senateId.photo,
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
    }
    // Handle House types
    else if (doc.type?.toLowerCase().includes("house")) {
      const repDocs = await RepresentativeData.find({
        [isActivity ? "activitiesScore.activityId" : "votesScore.voteId"]:
          doc._id,
      })
        .populate("houseId", "_id name party district photo")
        .lean();

      repDocs.forEach((repData) => {
        const scoreEntry = (
          isActivity ? repData.activitiesScore : repData.votesScore
        ).find(
          (s) =>
            s[isActivity ? "activityId" : "voteId"] &&
            s[isActivity ? "activityId" : "voteId"].toString() ===
              doc._id.toString()
        );

        if (scoreEntry && repData.houseId) {
          const info = {
            _id: repData.houseId._id,
            name: repData.houseId.name,
            party: repData.houseId.party,
            state: repData.houseId.district,
            photo: repData.houseId.photo,
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
    }
  } catch (error) {
    console.error("Error building support data:", error);
  }

  return supportData;
}

module.exports = { buildSupportData };
