const Activity = require("../models/activitySchema");
const upload = require("../middlewares/fileUploads");
const Senator = require("../models/senatorSchema");
const Representative = require("../models/representativeSchema");
const SenatorData = require("../models/senatorDataSchema");
const RepresentativeData = require("../models/representativeDataSchema");
const mongoose = require("mongoose");

const axios = require("axios");
  const BASE = process.env.QUORUM_BASE_URL || "https://www.quorum.us";
  const API_KEY = process.env.QUORUM_API_KEY;
const USERNAME = process.env.QUORUM_USERNAME;

async function saveCosponsorshipToLegislator({ personId, activityId, score = "yes" }) {
  personId = String(personId); // Force string match

  let localPerson = await Senator.findOne({ senatorId: personId });
  let dataModel = SenatorData;
  let personField = "senateId";
  let roleLabel = "Senator";

  if (!localPerson) {
    localPerson = await Representative.findOne({ repId: personId });
    if (!localPerson) {
      console.warn(`❌ No local legislator found for Quorum personId ${personId}`);
      return false;
    }
    dataModel = RepresentativeData;
    personField = "houseId";
    roleLabel = "Representative";
  }

  const filter = { [personField]: localPerson._id };
  const existing = await dataModel.findOne(filter);

  const alreadyLinked = existing?.activitiesScore?.some(
    (entry) => String(entry.activityId) === String(activityId)
  );

  if (alreadyLinked) {
    console.log(`⚠️ Already linked activity ${activityId} to ${roleLabel}: ${localPerson.name || localPerson._id}`);
    return false;
  }

  await dataModel.findOneAndUpdate(
    filter,
    {
      $push: { activitiesScore: { activityId, score } }
    },
    { upsert: true, new: true }
  );

  console.log(`✅ Linked activity ${activityId} to ${roleLabel}: ${localPerson.fullName || localPerson._id}`);
  return true;
}


class activityController {
  // Create a new activity with file upload for readMore
  static async createActivity(req, res) {
    upload.single("readMore")(req, res, async (err) => {
      if (err) return res.status(400).json({ message: err.message });

      try {
        const {
          type,
          title,
          shortDesc,
          longDesc,
          rollCall,
          date,
          congress,
          termId,
          trackActivities,
        } = req.body;

        const readMore = req.file
          ? `/uploads/documents/${req.file.filename}`
          : null;

        const editedFields = req.body.editedFields || [];

        const newActivity = new Activity({
          type,
          title,
          shortDesc,
          longDesc,
          rollCall,
          readMore,
          date,
          congress,
          termId,
          trackActivities,
          status: "draft",
          editedFields,
        });

        await newActivity.save();

        res.status(201).json({
          message: "Activity created successfully",
          info: newActivity,
        });
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error creating Activity", error: error.message });
      }
    });
  }

  // Get all activities
  static async getAllActivity(req, res) {
    try {
      const activity = await Activity.find().populate("termId");
      res.status(200).json(activity);
    } catch (error) {
      res.status(500).json({ message: "Error retrieving activity", error });
    }
  }

  // Get a specific activity by ID
  static async getActivityById(req, res) {
    try {
      const activity = await Activity.findById(req.params.id).populate(
        "termId"
      );
      if (!activity)
        return res.status(404).json({ message: "Activity not found" });

      res.status(200).json(activity);
    } catch (error) {
      res.status(500).json({ message: "Error retrieving activity", error });
    }
  }

  // Update activity with file and optional discard logic
  static async updateActivity(req, res) {
  upload.single("readMore")(req, res, async (err) => {
    if (err) return res.status(400).json({ message: err.message });
 
    try {
      const activityID = req.params.id;
      let updateData = { ...req.body };
 
      // Safe check for req.user
      const userId = req.user?._id || null;
      updateData.modifiedBy = userId;
      updateData.modifiedAt = new Date();
 
      if (req.file) {
        updateData.readMore = `/uploads/${req.file.filename}`;
      }
 
      // Handle discard logic
      if (req.body.discardChanges === "true") {
        return ActivityController.discardActivityChanges(req, res);
      }
 
      const existingActivity = await Activity.findById(activityID);
      if (!existingActivity) {
        return res.status(404).json({ message: 'Activity not found' });
      }
 
      // Parse fields if needed
      if (typeof updateData.editedFields === 'string') {
        updateData.editedFields = JSON.parse(updateData.editedFields);
      }
      if (typeof updateData.fieldEditors === 'string') {
        updateData.fieldEditors = JSON.parse(updateData.fieldEditors);
      }
 
      // Initialize update operations
      const updateOperations = {
        $set: {
          ...updateData,
          modifiedBy: userId,
          modifiedAt: new Date()
        }
      };
 
      // Clear fields if publishing
      if (updateData.status === "published") {
        updateOperations.$set.editedFields = [];
        updateOperations.$set.fieldEditors = {};
        updateOperations.$set.history = [];
      }
 
      // Determine if we should take a snapshot (only if not publishing)
      if (updateData.status !== "published") {
        const canTakeSnapshot =
          !existingActivity.history ||
          existingActivity.history.length === 0 ||
          existingActivity.snapshotSource === "edited";
 
        if (canTakeSnapshot) {
          const currentState = existingActivity.toObject();
         
          // Clean up the current state object
          delete currentState._id;
          delete currentState.createdAt;
          delete currentState.updatedAt;
          delete currentState.__v;
          delete currentState.history;
 
          // Create history entry
          const historyEntry = {
            oldData: currentState,
            timestamp: new Date(),
            actionType: 'update'
          };
 
          // Add to update operations
          updateOperations.$push = { history: historyEntry };
          updateOperations.$set.snapshotSource = "edited";
        } else if (existingActivity.snapshotSource === "deleted_pending_update") {
          updateOperations.$set.snapshotSource = "edited";
        }
      }
 
      const updatedActivity = await Activity.findByIdAndUpdate(
        activityID,
        updateOperations, // Use the structured operations
        { new: true }
      ).populate("termId");
 
      if (!updatedActivity) {
        return res.status(404).json({ message: "Activity not found" });
      }
 
      res.status(200).json({
        message: "Activity updated successfully",
        info: updatedActivity,
      });
    } catch (error) {
      res.status(500).json({
        message: "Error updating Activity",
        error: error.message,
      });
    }
  });
}
  // static async updateActivity(req, res) {
  //   upload.single("readMore")(req, res, async (err) => {
  //     if (err) return res.status(400).json({ message: err.message });

  //     try {
  //       const activityID = req.params.id;
  //       let updateData = { ...req.body };

  //       //  Safe check for req.user
  //       const userId = req.user?._id || null;
  //       updateData.modifiedBy = userId;
  //       updateData.modifiedAt = new Date();

  //       if (req.file) {
  //         updateData.readMore = `/uploads/${req.file.filename}`;
  //       }

  //       // Handle discard logic
  //       if (req.body.discardChanges === "true") {
  //         const activity = await Activity.findById(activityID);
  //         if (!activity?.previousState) {
  //           return res
  //             .status(400)
  //             .json({ message: "No previous state available to discard to" });
  //         }

  //         const { _id, createdAt, updatedAt, ...previousData } =
  //           activity.previousState;

  //         const revertedActivity = await Activity.findByIdAndUpdate(
  //           activityID,
  //           {
  //             ...previousData,
  //             modifiedBy: userId,
  //             modifiedAt: new Date(),
  //             previousState: null,
  //           },
  //           { new: true }
  //         ).populate("termId");

  //         return res.status(200).json({
  //           message: "Changes discarded successfully",
  //           info: revertedActivity,
  //         });
  //       }

  //       // Save current state to `previousState`
  //       const currentActivity = await Activity.findById(activityID);
  //       if (currentActivity) {
  //         const currentState = currentActivity.toObject();
  //         delete currentState._id;
  //         delete currentState.createdAt;
  //         delete currentState.updatedAt;
  //         delete currentState.__v;
  //         updateData.previousState = currentState;
  //       }

  //       // Optional: editedFields
  //       if (req.body.editedFields) {
  //         updateData.editedFields = req.body.editedFields;
  //       }

  //       // Clear fields if publishing
  //       if (updateData.status === "published") {
  //         updateData.editedFields = [];
  //         updateData.fieldEditors = {};
  //       }

  //       const updatedActivity = await Activity.findByIdAndUpdate(
  //         activityID,
  //         updateData,
  //         { new: true }
  //       ).populate("termId");

  //       if (!updatedActivity)
  //         return res.status(404).json({ message: "Activity not found" });

  //       res.status(200).json({
  //         message: "Activity updated successfully",
  //         info: updatedActivity,
  //       });
  //     } catch (error) {
  //       res
  //         .status(500)
  //         .json({ message: "Error updating Activity", error: error.message });
  //     }
  //   });
  // }

  // Discard changes (dedicated endpoint)
  // In activityController.js
  static async discardActivityChanges(req, res) {
  try {
    const activity = await Activity.findById(req.params.id);
    if (!activity) {
      return res.status(404).json({ message: "Activity not found" });
    }
 
    // Check if there's any history available
    if (!activity.history || activity.history.length === 0) {
      return res.status(400).json({ message: "No history available to restore" });
    }
 
    // Get the original state (index 0)
    const originalState = activity.history[0].oldData;
 
    // Restore the activity to its original state and empty the history
    const restoredActivity = await Activity.findByIdAndUpdate(
      req.params.id,
      {
        ...originalState,
        history: [], // Empty the history array
        snapshotSource: "edited", // Reset snapshot source
        modifiedAt: new Date(), // Update modification timestamp
        modifiedBy: req.user?._id // Track who performed the discard
      },
      { new: true }
    ).populate("termId");
 
    res.status(200).json({
      message: "Restored to original state and history cleared",
      info: restoredActivity
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to discard changes",
      error: error.message,
    });
  }
}

  // Delete an activity
  // Delete activity and clean references
  static async deleteActivity(req, res) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { id } = req.params;

      // 1️⃣ Find activity
      const activity = await Activity.findById(id).session(session);
      if (!activity) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: "Activity not found" });
      }

      // 2️⃣ Delete activity
      await Activity.findByIdAndDelete(id).session(session);

      // 3️⃣ Remove references depending on type
      if (activity.type === "senate") {
        await SenatorData.updateMany(
          { "activitiesScore.activityId": id },
          { $pull: { activitiesScore: { activityId: id } } }
        ).session(session);
      } else if (activity.type === "house") {
        await RepresentativeData.updateMany(
          { "activitiesScore.activityId": id },
          { $pull: { activitiesScore: { activityId: id } } }
        ).session(session);
      }

      // ✅ Commit transaction
      await session.commitTransaction();
      session.endSession();

      res.json({ message: "Activity deleted and related references removed" });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      console.error("Error deleting activity:", err);
      res.status(500).json({ message: "Server error" });
    }
  }

  // Update activity status
  static async updateActivityStatus(req, res) {
    try {
      const { status } = req.body;
      const { id } = req.params;

      if (!["draft", "published", "under review"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const updateObj = { status };
      if (status === "published") {
        updateObj.editedFields = [];
      }

      const updatedActivity = await Activity.findByIdAndUpdate(id, updateObj, {
        new: true,
        runValidators: true,
      });

      if (!updatedActivity)
        return res.status(404).json({ message: "Activity not found" });

      return res.status(200).json({
        message: "Status updated successfully",
        activity: updatedActivity,
      });
    } catch (error) {
      return res.status(500).json({
        message: "Error updating activity status",
        error: error.message,
      });
    }
  }

  // Bulk update trackActivities
  static async bulkUpdateTrackActivities(req, res) {
    try {
      const { ids, trackActivities } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "No activity IDs provided" });
      }

      const validStatuses = ["pending", "completed", "failed"];
      if (!validStatuses.includes(trackActivities)) {
        return res
          .status(400)
          .json({ message: "Invalid trackActivities value" });
      }

      const result = await Activity.updateMany(
        { _id: { $in: ids } },
        { $set: { trackActivities } }
      );

      if (result.modifiedCount === 0) {
        return res.status(404).json({ message: "No activities were updated" });
      }

      const updatedActivities = await Activity.find({ _id: { $in: ids } });

      res.status(200).json({
        message: `${result.modifiedCount} activities updated successfully`,
        updatedActivities,
      });
    } catch (error) {
      res.status(500).json({
        message: "Error bulk updating activities",
        error: error.message,
      });
    }
  }
  static async fetchAndCreateFromCosponsorships(
    billId,
    title,
    introduced,
    congress
  ) {
    console.log(`Starting cosponsorship fetch for billId: ${billId}`);
    console.log("🚧 Cosponsorship input check:", {
      billId,
      title,
      introduced,
      congress,
    });

    if (!billId || !title || !introduced || !congress) {
      console.warn("❌ Missing required bill data");
      return 0;
    }

    const queryParams = {
      api_key: API_KEY,
      username: USERNAME,
      dehydrate_extra: "sponsors",
    };

    const billUrl = `${BASE}/api/newbill/${billId}`;

    try {
      const billRes = await axios.get(billUrl, { params: queryParams });
      const bill = billRes.data;

      // ✅ Step 1: Determine activity type
      let activityType = bill.type || null;

      // ✅ Step 2: Fallback to bill_type if type not found
      if (!activityType && bill.bill_type) {
        const fallbackType = bill.bill_type.toLowerCase();
        if (fallbackType.includes("senate")) activityType = "senate";
        else if (fallbackType.includes("house")) activityType = "house";
      }

      if (!activityType) {
        console.warn(`❌ Unable to determine activity type for bill ${billId}`);
        return 0;
      }

      if (!bill.sponsors || bill.sponsors.length === 0) {
        console.log(`ℹ️ No cosponsors found for bill ${billId}`);
        return 0;
      }

      // ✅ Only create activity once outside the loop
      let activity = await Activity.findOne({
        activityquorumId: billId,
        date: introduced,
        congress,
        type: activityType,
      });

      if (!activity) {
        activity = new Activity({
          type: activityType,
          title,
          shortDesc: "",
          longDesc: "",
          rollCall: null,
          readMore: null,
          date: introduced,
          congress,
          termId: null,
          trackActivities: "pending",
          status: "draft",
          editedFields: [],
          activityquorumId: billId,
        });
        await activity.save();
        console.log(`✅ Created new cosponsorship activity for bill ${billId}`);
      }

      let savedCount = 0;

      for (const sponsorUri of bill.sponsors) {
        const sponsorId = sponsorUri.split("/").filter(Boolean).pop();

        try {
          const sponsorRes = await axios.get(
            `${BASE}/api/newsponsor/${sponsorId}/`,
            { params: { api_key: API_KEY, username: USERNAME } }
          );
          const sponsor = sponsorRes.data;

          const personId = sponsor.person?.split("/").filter(Boolean).pop();

          if (!personId) {
            console.warn(
              `❌ Skipping sponsor ${sponsorId} due to missing personId`
            );
            continue;
          }

          // ✅ Lookup both Senator and Rep in parallel
          const [senator, rep] = await Promise.all([
            Senator.findOne({ senatorId: personId }),
            Representative.findOne({ repId: personId }),
          ]);

          if (!senator && !rep) {
            console.warn(
              `⚠️ No matching local legislator found for personId ${personId}`
            );
            continue;
          }

          const linked = await saveCosponsorshipToLegislator({
            personId,
            activityId: activity._id,
            score: "yes",
          });

          if (linked) savedCount++;
        } catch (err) {
          console.warn(
            `❗ Error processing sponsor ${sponsorId}:`,
            err.message
          );
        }
      }

      console.log(`🎉 Finished processing cosponsors. Linked: ${savedCount}`);
      return savedCount;
    } catch (err) {
      console.error(
        `❌ Failed to fetch cosponsorships for bill ${billId}:`,
        err.message
      );
      return 0;
    }
  }
  // Cleanup function to remove orphaned activity references
}

module.exports = activityController;
