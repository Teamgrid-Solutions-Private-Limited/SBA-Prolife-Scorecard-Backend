const mongoose = require("mongoose");
const Vote = require("../backend/models/voteSchema");
const SenatorData = require("../backend/models/senatorDataSchema");
const RepresentativeData = require("../backend/models/representativeDataSchema");

async function removeGarbageVoteRefs() {
  try {
    const validVoteIds = await Vote.find({}, { _id: 1 }).lean();
    const validIdsSet = validVoteIds.map((doc) => doc._id);
    const senatorResult = await SenatorData.updateMany(
      {},
      { $pull: { votesScore: { voteId: { $nin: validIdsSet } } } }
    );
        const repResult = await RepresentativeData.updateMany(
      {},
      { $pull: { votesScore: { voteId: { $nin: validIdsSet } } } }
    );
   

  } catch (err) {
  } finally {
    mongoose.connection.close();
  }
}
if (require.main === module) {
  mongoose
    .connect(
      process.env.MONGO_URI ||
        "mongodb+srv://sksarukali:KRet1aKFEBLDDiwU@cluster0.i4aiegf.mongodb.net/sbaProlife",
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      }
    )
    .then(() => {
      console.log(" Connected to MongoDB.");
      removeGarbageVoteRefs();
    })
    .catch((err) => {
      console.error(" MongoDB connection error:", err);
    });
}

module.exports = removeGarbageVoteRefs;
