const mongoose = require("mongoose");
const Activity = require("../backend/models/activitySchema");
const SenatorData = require("../backend/models/senatorDataSchema");
const RepresentativeData = require("../backend/models/representativeDataSchema");

async function removeGarbageActivityRefs() {
  try {
    console.log("🧹 Starting cleanup of invalid activity references...");

    // 1. Get all valid activity IDs
    const validActivityIds = await Activity.find({}, { _id: 1 }).lean();
    const validIdsSet = validActivityIds.map((doc) => doc._id);

    console.log(`✅ Found ${validIdsSet.length} valid activities.`);

    // 2. Remove invalid references from SenatorData
    const senatorResult = await SenatorData.updateMany(
      {},
      { $pull: { activitiesScore: { activityId: { $nin: validIdsSet } } } }
    );
    console.log(
      `🗑 Removed invalid refs from SenatorData:`,
      senatorResult.modifiedCount
    );

    // 3. Remove invalid references from RepresentativeData
    const repResult = await RepresentativeData.updateMany(
      {},
      { $pull: { activitiesScore: { activityId: { $nin: validIdsSet } } } }
    );
    console.log(
      `🗑 Removed invalid refs from RepresentativeData:`,
      repResult.modifiedCount
    );

    console.log("🎯 Cleanup completed successfully.");
  } catch (err) {
    console.error("❌ Error during cleanup:", err);
  } finally {
    mongoose.connection.close();
  }
}

// Run if executed directly
if (require.main === module) {
  mongoose
    .connect(process.env.MONGO_URI || "mongodb+srv://sksarukali:KRet1aKFEBLDDiwU@cluster0.i4aiegf.mongodb.net/sbaProlife", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })
    .then(() => {
      console.log("📦 Connected to MongoDB");
      removeGarbageActivityRefs();
    })
    .catch((err) => {
      console.error("MongoDB connection error:", err);
    });
}

module.exports = removeGarbageActivityRefs;
