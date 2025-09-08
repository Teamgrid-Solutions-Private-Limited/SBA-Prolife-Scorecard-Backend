// helpers/voteSupportHelper.js
const SenatorData = require("../models/senatorDataSchema");
const RepresentativeData = require("../models/representativeDataSchema");

async function buildSupportData(vote) {
  let supportData = { yea: [], nay: [], other: [] };

  if (!vote) return supportData;

  try {
    // Handle both "senate" and "senate_bill" types
    if (vote.type?.toLowerCase().includes("senate")) {
      console.log("Processing Senate vote:", vote._id);
      
      const senatorVotes = await SenatorData.find({
        "votesScore.voteId": vote._id,
      })
        .populate("senateId", "name party state photo")
        .lean();

      console.log("Found senator votes:", senatorVotes.length);

      senatorVotes.forEach((senData) => {
        const scoreEntry = senData.votesScore.find(
          (v) => v.voteId && v.voteId.toString() === vote._id.toString()
        );
        
        if (scoreEntry && senData.senateId) {
          const info = {
            name: senData.senateId.name,
            party: senData.senateId.party,
            state: senData.senateId.state,
            photo: senData.senateId.photo,
          };
          
          const score = scoreEntry.score?.toLowerCase();
          if (score === "yea") {
            supportData.yea.push(info);
          } else if (score === "nay") {
            supportData.nay.push(info);
          } else {
            supportData.other.push(info);
          }
        }
      });
    } 
    // Handle both "house" and "house_bill" types
    else if (vote.type?.toLowerCase().includes("house")) {
      console.log("Processing House vote:", vote._id);
      
      const repVotes = await RepresentativeData.find({
        "votesScore.voteId": vote._id,
      })
        .populate("repId", "name party state photo")
        .lean();

      console.log("Found representative votes:", repVotes.length);

      repVotes.forEach((repData) => {
        const scoreEntry = repData.votesScore.find(
          (v) => v.voteId && v.voteId.toString() === vote._id.toString()
        );
        
        if (scoreEntry && repData.repId) {
          const info = {
            name: repData.repId.name,
            party: repData.repId.party,
            state: repData.repId.state,
            photo: repData.repId.photo,
          };
          
          const score = scoreEntry.score?.toLowerCase();
          if (score === "yea") {
            supportData.yea.push(info);
          } else if (score === "nay") {
            supportData.nay.push(info);
          } else {
            supportData.other.push(info);
          }
        }
      });
    }

    console.log("Support data result:", {
      yea: supportData.yea.length,
      nay: supportData.nay.length,
      other: supportData.other.length
    });

  } catch (error) {
    console.error("Error building support data:", error);
  }

  return supportData;
}

module.exports = { buildSupportData };