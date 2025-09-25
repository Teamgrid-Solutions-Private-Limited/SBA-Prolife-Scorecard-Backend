const mongoose = require("mongoose");
const Activity = require("../backend/models/activitySchema");
const SenatorData = require("../backend/models/senatorDataSchema");
const RepresentativeData = require("../backend/models/representativeDataSchema");

async function removeGarbageActivityRefs() {
  try {
    const validActivityIds = await Activity.find({}, { _id: 1 }).lean();
    const validIdsSet = validActivityIds.map((doc) => doc._id);
    const senatorResult = await SenatorData.updateMany(
      {},
      { $pull: { activitiesScore: { activityId: { $nin: validIdsSet } } } }
    );
        const repResult = await RepresentativeData.updateMany(
      {},
      { $pull: { activitiesScore: { activityId: { $nin: validIdsSet } } } }
    );
   
  } catch (err) {
    console.error("Error during cleanup:", err);
  } finally {
    mongoose.connection.close();
  }
}
if (require.main === module) {
  mongoose
    .connect(process.env.MONGO_URI || "mongodb+srv://sksarukali:KRet1aKFEBLDDiwU@cluster0.i4aiegf.mongodb.net/sbaProlife", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })
    .then(() => {
      console.log("Connected to MongoDB");
      removeGarbageActivityRefs();
    })
    .catch((err) => {
      console.error("MongoDB connection error:", err);
    });
}

module.exports = removeGarbageActivityRefs;
