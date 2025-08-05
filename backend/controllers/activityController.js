const Activity = require("../models/activitySchema");
const upload = require("../middlewares/fileUploads");
const Senator = require("../models/senatorSchema");
const Representative = require("../models/representativeSchema");
const SenatorData = require("../models/senatorDataSchema");
const RepresentativeData = require("../models/representativeDataSchema");

const axios = require("axios");
  const BASE = process.env.QUORUM_BASE_URL || "https://www.quorum.us";
  const API_KEY = process.env.QUORUM_API_KEY;
  const USERNAME = process.env.QUORUM_USERNAME;
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

        //  Safe check for req.user
        const userId = req.user?._id || null;
        updateData.modifiedBy = userId;
        updateData.modifiedAt = new Date();

        if (req.file) {
          updateData.readMore = `/uploads/${req.file.filename}`;
        }

        // Handle discard logic
        if (req.body.discardChanges === "true") {
          const activity = await Activity.findById(activityID);
          if (!activity?.previousState) {
            return res
              .status(400)
              .json({ message: "No previous state available to discard to" });
          }

          const { _id, createdAt, updatedAt, ...previousData } =
            activity.previousState;

          const revertedActivity = await Activity.findByIdAndUpdate(
            activityID,
            {
              ...previousData,
              modifiedBy: userId,
              modifiedAt: new Date(),
              previousState: null,
            },
            { new: true }
          ).populate("termId");

          return res.status(200).json({
            message: "Changes discarded successfully",
            info: revertedActivity,
          });
        }

        // Save current state to `previousState`
        const currentActivity = await Activity.findById(activityID);
        if (currentActivity) {
          const currentState = currentActivity.toObject();
          delete currentState._id;
          delete currentState.createdAt;
          delete currentState.updatedAt;
          delete currentState.__v;
          updateData.previousState = currentState;
        }

        // Optional: editedFields
        if (req.body.editedFields) {
          updateData.editedFields = req.body.editedFields;
        }

        // Clear fields if publishing
        if (updateData.status === "published") {
          updateData.editedFields = [];
          updateData.fieldEditors = {};
        }

        const updatedActivity = await Activity.findByIdAndUpdate(
          activityID,
          updateData,
          { new: true }
        ).populate("termId");

        if (!updatedActivity)
          return res.status(404).json({ message: "Activity not found" });

        res.status(200).json({
          message: "Activity updated successfully",
          info: updatedActivity,
        });
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error updating Activity", error: error.message });
      }
    });
  }

  // Discard changes (dedicated endpoint)
  // In activityController.js
  static async discardActivityChanges(req, res) {
    try {
      const activity = await Activity.findById(req.params.id);
      if (!activity) {
        return res.status(404).json({ message: "Activity not found" });
      }

      if (!activity.previousState) {
        return res.status(400).json({ message: "No previous state available" });
      }

      // Revert to previous state while preserving certain fields
      const { _id, createdAt, updatedAt, __v, ...revertedData } =
        activity.previousState;

      const revertedActivity = await Activity.findByIdAndUpdate(
        req.params.id,
        {
          ...revertedData,
          previousState: null, // Clear after discard
        },
        { new: true }
      );

      res.status(200).json(revertedActivity);
    } catch (error) {
      res.status(500).json({
        message: "Failed to discard changes",
        error: error.message,
      });
    }
  }

  // Delete an activity
  static async deleteActivity(req, res) {
    try {
      const deletedActivity = await Activity.findByIdAndDelete(req.params.id);
      if (!deletedActivity)
        return res.status(404).json({ message: "Activity not found" });

      res.status(200).json({ message: "Activity deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Error deleting activity", error });
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

    const validStatuses = ['pending', 'completed', 'failed'];
    if (!validStatuses.includes(trackActivities)) {
      return res.status(400).json({ message: 'Invalid trackActivities value' });
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
  //activty saved when bill saved
  
//   static async fetchAndCreateFromCosponsorships(billId, title, introduced, congress) {
//   console.log(`Starting cosponsorship fetch for billId: ${billId}`);
//   console.log("🚧 Cosponsorship input check:", { billId, title, introduced, congress });

//   if (!billId || !title || !introduced || !congress) {
//     console.warn("❌ Missing required bill data");
//     return 0;
//   }

  

//   const queryParams = {
//     api_key: API_KEY,
//     username: USERNAME,
//     dehydrate_extra: "sponsors"
//   };

//   const billUrl = `${BASE}/api/newbill/${billId}`;

//   try {
//     console.log(`🔎 Fetching bill data from: ${billUrl}`);
//     const billRes = await axios.get(billUrl, { params: queryParams });
//     const bill = billRes.data;

//     if (!bill.sponsors || bill.sponsors.length === 0) {
//       console.log(`ℹ️ No cosponsors found for bill ${billId}`);
//       return 0;
//     }

//     let savedCount = 0;

//     for (const sponsorUri of bill.sponsors) {
//       const sponsorId = sponsorUri.split("/").filter(Boolean).pop();
//       //console.log(`🔁 Processing sponsor: ${sponsorId}`);

//       try {
//         const sponsorRes = await axios.get(`${BASE}/api/newsponsor/${sponsorId}/`, {
//           params: { api_key: API_KEY, username: USERNAME }
//         });
//         const sponsor = sponsorRes.data;

//         let chamber = null;
//         if (sponsor.person) {
//           const personId = sponsor.person.split("/").filter(Boolean).pop();
//           //console.log(`  ↳ Fetching person: ${personId}`);
//           try {
//             const personRes = await axios.get(`${BASE}/api/newperson/${personId}/`, {
//               params: { api_key: API_KEY, username: USERNAME }
//             });
//             chamber = personRes.data.chamber === "senate" ? "senate" : "house";
//           } catch (err) {
//             console.warn(`  ⚠️ Failed to fetch person ${sponsor.person}:`, err.message);
//           }
//         }
// if (!chamber) {
//   console.warn(`❌ Skipping sponsor ${sponsorId} due to missing chamber`);
//   continue; // Skip this sponsor entirely
// }
//         // ✅ Skip duplicate activity
//         const alreadyExists = await Activity.findOne({
//           title,
//           date: introduced,
//           congress,
//           type: chamber,
//         });

//         if (alreadyExists) {
//           //console.log(`⏭️ Activity already exists for ${title} on ${introduced} [${chamber}] — skipping sponsor ${sponsorId}`);
//           continue;
//         }

//         const activity = new Activity({
//           type: chamber,
//           title,
//           shortDesc: "",
//           longDesc: "",
//           rollCall: null,
//           readMore: null,
//           date: introduced,
//           congress,
//           termId: null,
//           trackActivities: "pending",
//           status: "draft",
//           editedFields: [],
//            quorumId: billId
//         });

//         await activity.save();
//         console.log(`✅ Saved cosponsorship activity for sponsor ${sponsorId}`);
//         savedCount++;
//       } catch (err) {
//         console.warn(`❗ Error processing sponsor ${sponsorId}:`, err.message);
//       }
//     }

//     console.log(`🎉 Finished saving ${savedCount} cosponsorship(s) for bill ${billId}`);
//     return savedCount;
//   } catch (err) {
//     console.error(`❌ Failed to fetch cosponsorships for bill ${billId}:`, err.message);
//     return 0;
//   }
  //   }
  
  static async fetchAndCreateFromCosponsorships(billId, title, introduced, congress) {
  console.log(`Starting cosponsorship fetch for billId: ${billId}`);
  console.log("🚧 Cosponsorship input check:", { billId, title, introduced, congress });

  if (!billId || !title || !introduced || !congress) {
    console.warn("❌ Missing required bill data");
    return 0;
  }

  const BASE = process.env.QUORUM_BASE_URL || "https://www.quorum.us";
  const API_KEY = process.env.QUORUM_API_KEY;
  const USERNAME = process.env.QUORUM_USERNAME;

  const queryParams = {
    api_key: API_KEY,
    username: USERNAME,
    dehydrate_extra: "sponsors"
  };

  const billUrl = `${BASE}/api/newbill/${billId}`;

  try {
    console.log(`🔎 Fetching bill data from: ${billUrl}`);
    const billRes = await axios.get(billUrl, { params: queryParams });
    const bill = billRes.data;

    if (!bill.sponsors || bill.sponsors.length === 0) {
      console.log(`ℹ️ No cosponsors found for bill ${billId}`);
      return 0;
    }

    let savedCount = 0;

    for (const sponsorUri of bill.sponsors) {
      const sponsorId = sponsorUri.split("/").filter(Boolean).pop();

      try {
        const sponsorRes = await axios.get(`${BASE}/api/newsponsor/${sponsorId}/`, {
          params: { api_key: API_KEY, username: USERNAME }
        });
        const sponsor = sponsorRes.data;

        let chamber = null;
        if (sponsor.person) {
          const personId = sponsor.person.split("/").filter(Boolean).pop();
          try {
            const personRes = await axios.get(`${BASE}/api/newperson/${personId}/`, {
              params: { api_key: API_KEY, username: USERNAME }
            });
            chamber = personRes.data.chamber === "senate" ? "senate" : "house";
          } catch (err) {
            console.warn(`  ⚠️ Failed to fetch person ${sponsor.person}:`, err.message);
          }
        }

        if (!chamber) {
          console.warn(`❌ Skipping sponsor ${sponsorId} due to missing chamber`);
          continue;
        }

        const alreadyExists = await Activity.findOne({
          title,
          date: introduced,
          congress,
          type: chamber
        });

        if (alreadyExists) {
          continue;
        }

        const activity = new Activity({
          type: chamber,
          title,
          shortDesc: "",
          longDesc: "",
          rollCall: null,
          readMore: null,
          date: introduced,
          congress,
          activityquorumId: String(billId), // ← Save the quorum ID
          termId: null,
          trackActivities: "pending",
          status: "draft",
          editedFields: []
        });

        await activity.save();
        console.log(`✅ Saved cosponsorship activity for sponsor ${sponsorId}`);
        savedCount++;
      } catch (err) {
        console.warn(`❗ Error processing sponsor ${sponsorId}:`, err.message);
      }
    }

    if (savedCount > 0) {
      console.log(`🧠 Triggering activity score update for bill ${billId}`);
      await updateActivityScoreFromCosponsorships(billId); // ⬅️ New line added
    }

    console.log(`🎉 Finished saving ${savedCount} cosponsorship(s) for bill ${billId}`);
    return savedCount;
  } catch (err) {
    console.error(`❌ Failed to fetch cosponsorships for bill ${billId}:`, err.message);
    return 0;
  }
}

static async updateActivityScoreFromCosponsorships(quorumBillId) {
  try {
    const BASE = process.env.QUORUM_BASE_URL || "https://www.quorum.us";
    const API_KEY = process.env.QUORUM_API_KEY;
    const USERNAME = process.env.QUORUM_USERNAME;

    const billUrl = `${BASE}/api/newbill/${quorumBillId}`;
    const billRes = await axios.get(billUrl, {
      params: { api_key: API_KEY, username: USERNAME, dehydrate_extra: "sponsors" }
    });

    const bill = billRes.data;
    if (!bill?.sponsors || bill.sponsors.length === 0) {
      console.log(`❗ No sponsors found for bill ${quorumBillId}`);
      return;
    }

    const activity = await Activity.findOne({ activityquorumId: quorumBillId });
    if (!activity) {
      console.log(`❗ No activity found for bill ${quorumBillId}`);
      return;
    }

    console.log(`🔄 Assigning cosponsorship activity score for bill: ${quorumBillId}`);

    const sponsorIds = bill.sponsors.map(uri =>
      uri.split("/").filter(Boolean).pop()
    ).filter(Boolean);

    for (const sponsorId of sponsorIds) {
      try {
        const sponsorRes = await axios.get(`${BASE}/api/newsponsor/${sponsorId}/`, {
          params: { api_key: API_KEY, username: USERNAME }
        });
        const sponsor = sponsorRes.data;

        const personId = sponsor.person?.split("/").filter(Boolean).pop();
        if (!personId) {
          console.log(`⚠️ Skipping sponsor ${sponsorId} - No personId`);
          continue;
        }

        const personRes = await axios.get(`${BASE}/api/newperson/${personId}/`, {
          params: { api_key: API_KEY, username: USERNAME }
        });

        const chamber = personRes.data.chamber;
        const isSenator = chamber === "senate";

        const personModel = isSenator ? Senator : Representative;
        const DataModel = isSenator ? SenatorData : RepresentativeData;
        const idField = isSenator ? "senateId" : "houseId";
        const refField = isSenator ? "senatorId" : "repId";

        const personDoc = await personModel.findOne({ [refField]: personId });

        if (!personDoc) {
          console.log(`❗ ${isSenator ? "Senator" : "Representative"} ${personId} not found in DB`);
          continue;
        }

        const dataDoc = await DataModel.findOne({ [idField]: personDoc._id });

        const alreadyScored = dataDoc?.activitiesScore?.some(
          a => a.activityId?.toString() === activity._id.toString()
        );

        if (alreadyScored) {
          console.log(`⏩ Activity score already exists for ${personId}`);
          continue;
        }

        await DataModel.updateOne(
          { [idField]: personDoc._id },
          { $push: { activitiesScore: { activityId: activity._id, score: "yea" } } },
          { upsert: true }
        );

        console.log(`📌 Updated ${isSenator ? "Senator" : "Rep"} with activity score`, {
          personId,
          activityId: activity._id,
          score: "yea"
        });
      } catch (err) {
        console.warn(`⚠️ Error processing sponsor ${sponsorId}: ${err.message}`);
      }
    }
  } catch (err) {
    console.error(`❌ updateActivityScoreFromCosponsorships failed:`, err.message);
  }
}


}

module.exports = activityController;
