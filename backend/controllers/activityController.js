const Activity = require("../models/activitySchema");
const upload = require("../middlewares/fileUploads");
const Senator = require("../models/senatorSchema");
const Representative = require("../models/representativeSchema");
const RepresentativeData = require("../models/representativeDataSchema");
const SenatorData = require("../models/senatorDataSchema");
const Vote = require("../models/voteSchema");
const { ACTIVITY_PUBLIC_FIELDS } = require("../constants/projection");
const {
  applyCommonFilters,
  applyCongressFilter,
  applyChamberFilter,
  applyActivityTermFilter,
} = require("../middlewares/filter");
const { buildSupportData } = require("../helper/supportDataHelper");

const mongoose = require("mongoose");

const axios = require("axios");
const BASE = process.env.QUORUM_BASE_URL || "https://www.quorum.us";
const API_KEY = process.env.QUORUM_API_KEY;
const USERNAME = process.env.QUORUM_USERNAME;

async function saveCosponsorshipToLegislator({
  personId,
  activityId,
  score = "yes",
  editorInfo,
  title
}) {
  personId = String(personId); // Force string match

  let localPerson = await Senator.findOne({ senatorId: personId });
  let dataModel = SenatorData;
  let personField = "senateId";
  let personModel = Senator;
  let roleLabel = "Senator";

  if (!localPerson) {
    localPerson = await Representative.findOne({ repId: personId });
    if (!localPerson) {
      return false;
    }
    dataModel = RepresentativeData;
    personField = "houseId";
    personModel = Representative;
    roleLabel = "Representative";
  }

  const filter = { [personField]: localPerson._id };
  const existing = await dataModel.findOne(filter);

  const alreadyLinked = existing?.activitiesScore?.some(
    (entry) => String(entry.activityId) === String(activityId)
  );

  if (alreadyLinked) {
    return false;
  }


  // Only update person document if they are published
  if (localPerson.publishStatus === "published") {
    const currentPerson = await personModel.findById(localPerson._id);
    const currentPersonData = await dataModel.find({
      [personField]: localPerson._id
    });
    // console.log("currentPerson:", currentPerson.name);
// console.log("currentPersonData:", currentPersonData);
    if (currentPerson && currentPersonData.length > 0) {
      // Build snapshot object
      const snapshotData = {
        [personField === "senateId" ? "senatorId" : "repId"]: currentPerson[personField === "senateId" ? "senatorId" : "repId"],
        name: currentPerson.name,
        party: currentPerson.party,
        photo: currentPerson.photo,
        editedFields: currentPerson.editedFields || [],
        fieldEditors: currentPerson.fieldEditors || {},
        modifiedAt: currentPerson.modifiedAt,
        modifiedBy: currentPerson.modifiedBy,
        publishStatus: currentPerson.publishStatus,
        snapshotSource: currentPerson.snapshotSource,
        status: currentPerson.status
      };

      // Add district field only for Representatives
      if (roleLabel === "Representative" && currentPerson.district) {
        snapshotData.district = currentPerson.district;
      }

      // Add state field for Senators
      if (roleLabel === "Senator" && currentPerson.state) {
        snapshotData.state = currentPerson.state;
      }

      // Add the appropriate data reference
      if (roleLabel === "Representative") {
        snapshotData.representativeData = currentPersonData.map(doc => doc.toObject());
      } else if (roleLabel === "Senator") {
        snapshotData.senatorData = currentPersonData.map(doc => doc.toObject());
      }

      const snapshot = {
        oldData: snapshotData,
        timestamp: new Date().toISOString(),
        actionType: "update",
        _id: new mongoose.Types.ObjectId()
      };

      // Save snapshot in history (limit to last 50)
      await personModel.findByIdAndUpdate(
        localPerson._id,
        {
          $push: {
            history: {
              $each: [snapshot],
              $slice: -50
            }
          }
        }
      );
    }
  }

  await dataModel.findOneAndUpdate(
    filter,
    {
      $push: { activitiesScore: { activityId, score } },
    },
    { upsert: true, new: true }
  );
  // Proceed with normal editedFields/fieldEditors update for both Senators and Representatives
  const editedFieldEntry = {
    field: "activitiesScore",
    name: `${title}`,
    fromQuorum: true,
    updatedAt: new Date().toISOString()
  };

  const normalizedTitle = title
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const fieldKey = `activitiesScore_${normalizedTitle}`;

  await personModel.updateOne(
    { _id: localPerson._id },
    {
      $push: {
        editedFields: {
          $each: [editedFieldEntry],
          $slice: -20
        }
      },
      $set: {
        updatedAt: new Date(),
        publishStatus: "under review",
        snapshotSource: "edited",
        [`fieldEditors.${fieldKey}`]: {
          editorId: editorInfo?.editorId || "system-auto",
          editorName: editorInfo?.editorName || "System Auto-Update",
          editedAt: editorInfo?.editedAt || new Date().toISOString()
        }
      }
    }
  );

  return true;
}

// async function saveCosponsorshipToLegislator({
//   personId,
//   activityId,
//   score = "yes",
//   editorInfo,
//   title
// }) {
//   personId = String(personId); // Force string match
//   // console.log("editorInfo in save:", editorInfo);
//   // console.log("title in save:", title);

//   let localPerson = await Senator.findOne({ senatorId: personId });
//   let dataModel = SenatorData;
//   let personField = "senateId";
//   let roleLabel = "Senator";

//   if (!localPerson) {
//     localPerson = await Representative.findOne({ repId: personId });
//     if (!localPerson) {
//       // console.warn(` No local legislator found for Quorum personId ${personId}`);
//       return false;
//     }
//     dataModel = RepresentativeData;
//     personField = "houseId";
//     roleLabel = "Representative";
//   }

//   const filter = { [personField]: localPerson._id };
//   const existing = await dataModel.findOne(filter);

//   const alreadyLinked = existing?.activitiesScore?.some(
//     (entry) => String(entry.activityId) === String(activityId)
//   );

//   if (alreadyLinked) {
//     return false;
//   }

//   await dataModel.findOneAndUpdate(
//     filter,
//     {
//       $push: { activitiesScore: { activityId, score } },
//     },
//     { upsert: true, new: true }
//   );
//    // Only update Representative document
//  if (roleLabel === "Representative") {
//   //  Check if rep is published before updating
//   if (localPerson.publishStatus === "published") {
//     const currentRep = await Representative.findById(localPerson._id);
//     const currentRepData = await RepresentativeData.find({
//       houseId: localPerson._id
//     });

//     if (currentRep && currentRepData.length > 0) {
        
//       // Build snapshot object
//       const snapshot = {
//         oldData: {
//           repId: currentRep.repId,
//           district: currentRep.district,
//           name: currentRep.name,
//           party: currentRep.party,
//           photo: currentRep.photo,
//           editedFields: currentRep.editedFields || [],
//           fieldEditors: currentRep.fieldEditors || {},
//           modifiedAt: currentRep.modifiedAt,
//           modifiedBy: currentRep.modifiedBy,
//           publishStatus: currentRep.publishStatus,
//           snapshotSource: currentRep.snapshotSource,
//           status: currentRep.status,
//           representativeData: currentRepData.map(doc => doc.toObject())
//         },
//         timestamp: new Date().toISOString(),
//         actionType: "update",
//         _id: new mongoose.Types.ObjectId()
//       };

//       // Save snapshot in history (limit to last 50)
//       await Representative.findByIdAndUpdate(
//         localPerson._id,
//         {
//           $push: {
//             history: {
//               $each: [snapshot],
//               $slice: -50
//             }
//           }
//         }
//       );
//     }
//   }

//   //  Proceed with your normal editedFields/fieldEditors update
//   const editedFieldEntry = {
//     field: "activitiesScore",
//     name: `${title}`,
//     fromQuorum: true,
//     updatedAt: new Date().toISOString()
//   };

//   const normalizedTitle = title
//     .replace(/[^a-zA-Z0-9]+/g, "_")
//     .replace(/^_+|_+$/g, "");
//   const fieldKey = `activitiesScore_${normalizedTitle}`;

//   await Representative.updateOne(
//     { _id: localPerson._id },
//     {
//       $push: {
//         editedFields: {
//           $each: [editedFieldEntry],
//           $slice: -20
//         }
//       },
//       $set: {
//         updatedAt: new Date(),
//         publishStatus: "under review",
//         [`fieldEditors.${fieldKey}`]: {
//           editorName: editorInfo?.editorName || "System Auto-Update",
//           editedAt: new Date().toISOString()
//         }
//       }
//     }
//   );
// }


//   return true;
// }

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

  static async getAllActivities(req, res) {
    try {
      const activities = await Activity.find({})
        .select(ACTIVITY_PUBLIC_FIELDS)
        .lean();
      res.status(200).json(activities);
    } catch (error) {
      res.status(500).json({
        message: "Error retrieving activity",
        error: error.message,
      });
    }
  }

  // Get all activities
  // static async AllActivity(req, res) {
  //   try {
  //     let filter = {};

  //     // Apply common filters
  //     filter = applyCommonFilters(req, filter);

  //     // Apply congress filter
  //     filter = applyCongressFilter(req, filter);

  //     // Apply simplified term filter for activities
  //     if (req.query.term) {
  //       const termQuery = req.query.term.trim();
  //       const congressMatch = termQuery.match(/^(\d+)(st|nd|rd|th)/i);
  //       if (congressMatch) {
  //         filter.congress = congressMatch[1];
  //       }

  //       if (!filter.congress) {
  //         const anyNumberMatch = termQuery.match(/\d+/);
  //         if (anyNumberMatch) {
  //           filter.congress = anyNumberMatch[0];
  //         }
  //       }
  //     }

  //     // Apply chamber filter (for activities)
  //     filter = applyChamberFilter(req, filter, false);

  //     const activities = await Activity.find(filter)
  //     .select(ACTIVITY_PUBLIC_FIELDS)
  //       .sort({ date: -1, createdAt: -1 })
  //       .lean();

  //     res.status(200).json(activities);
  //   } catch (error) {
  //     console.error("Error retrieving activities:", error);
  //     res.status(500).json({
  //       message: "Error retrieving activity",
  //       error: error.message,
  //     });
  //   }
  // }

  // static async AllActivity(req, res) {
  //   try {
  //     let filter = {};

  //     // Apply congress filter
  //     filter = applyCongressFilter(req, filter);

  //     // Apply simplified term filter for activities
  //     if (req.query.term) {
  //       const termQuery = req.query.term.trim();
  //       const congressMatch = termQuery.match(/^(\d+)(st|nd|rd|th)/i);
  //       if (congressMatch) {
  //         filter.congress = congressMatch[1];
  //       }

  //       if (!filter.congress) {
  //         const anyNumberMatch = termQuery.match(/\d+/);
  //         if (anyNumberMatch) {
  //           filter.congress = anyNumberMatch[0];
  //         }
  //       }
  //     }

  //     // Apply chamber filter (for activities)
  //     filter = applyChamberFilter(req, filter, false);

  //     const { _id, ...ACTIVITY_FIELDS_NO_ID } = ACTIVITY_PUBLIC_FIELDS;

  //     const activities = await Activity.aggregate([
  //       {
  //         $match: {
  //           $or: [
  //             { status: "published" },
  //             { status: "under review", "history.oldData.status": "published" },
  //           ],
  //           ...filter,
  //         },
  //       },

  //       { $unwind: { path: "$history", preserveNullAndEmptyArrays: true } },

  //       {
  //         $addFields: {
  //           effectiveDoc: {
  //             $cond: [
  //               {
  //                 $and: [
  //                   { $eq: ["$status", "under review"] },
  //                   { $eq: ["$history.oldData.status", "published"] },
  //                 ],
  //               },
  //               {
  //                 $mergeObjects: [
  //                   {
  //                     _id: "$_id",
  //                     quorumId: "$quorumId",
  //                     createdAt: "$createdAt",
  //                   },
  //                   "$history.oldData",
  //                 ],
  //               },
  //               {
  //                 $cond: [
  //                   { $eq: ["$status", "published"] },
  //                   "$$ROOT",
  //                   "$$REMOVE",
  //                 ],
  //               },
  //             ],
  //           },
  //         },
  //       },

  //       { $match: { effectiveDoc: { $ne: null } } },
  //       { $replaceRoot: { newRoot: "$effectiveDoc" } },

  //       { $sort: { date: -1, createdAt: -1 } },

  //       {
  //         $group: {
  //           _id: "$quorumId",
  //           latest: { $first: "$$ROOT" },
  //         },
  //       },
  //       { $replaceRoot: { newRoot: "$latest" } },

  //       { $sort: { date: -1, createdAt: -1 } },

  //       {
  //         $project: {
  //           _id: 1, // ✅ always first
  //           ...ACTIVITY_FIELDS_NO_ID,
  //         },
  //       },
  //     ]);

  //     res.status(200).json(activities);
  //   } catch (error) {
  //     console.error("Error retrieving activities:", error);
  //     res.status(500).json({
  //       message: "Error retrieving activity",
  //       error: error.message,
  //     });
  //   }
  // }

  static async AllActivity(req, res) {
    try {
      let filter = {};

      // Common filters (status published / all)
      filter = applyCommonFilters(req, filter);

      // Congress filter
      filter = applyCongressFilter(req, filter);

      // Term filter
      filter = applyActivityTermFilter(req, filter);

      // Chamber filter
      filter = applyChamberFilter(req, filter, false);

      const { _id, ...ACTIVITY_FIELDS_NO_ID } = ACTIVITY_PUBLIC_FIELDS;

      const isFrontend =
        req.query.frontend === "true" || req.query.published === "true";

      let pipeline = [];

      if (isFrontend) {
        // Only published or published-in-history
        pipeline.push({
          $match: {
            $or: [
              { status: "published" },
              { status: "under review", "history.oldData.status": "published" },
            ],
            ...filter,
          },
        });

        pipeline.push(
          { $unwind: { path: "$history", preserveNullAndEmptyArrays: true } },
          {
            $addFields: {
              effectiveDoc: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$status", "under review"] },
                      { $eq: ["$history.oldData.status", "published"] },
                    ],
                  },
                  {
                    $mergeObjects: [
                      {
                        _id: "$_id",
                        activityquorumId: "$activityquorumId",
                        createdAt: "$createdAt",
                      },
                      "$history.oldData",
                    ],
                  },
                  {
                    $cond: [
                      { $eq: ["$status", "published"] },
                      "$$ROOT",
                      "$$REMOVE",
                    ],
                  },
                ],
              },
            },
          },
          { $match: { effectiveDoc: { $ne: null } } },
          { $replaceRoot: { newRoot: "$effectiveDoc" } }
        );
      } else {
        // Default / admin → all activities
        pipeline.push({ $match: { ...filter } });
      }

      // Sorting & projecting
      pipeline.push(
        { $sort: { date: -1, createdAt: -1 } },
        {
          $project: {
            _id: 1,
            ...ACTIVITY_FIELDS_NO_ID,
          },
        }
      );

      const activities = await Activity.aggregate(pipeline);
      res.status(200).json(activities);
    } catch (error) {
      console.error("Error retrieving activities:", error);
      res.status(500).json({
        message: "Error retrieving activity",
        error: error.message,
      });
    }
  }

  static async getActivityById(req, res) {
    try {
      const activity = await Activity.findById(req.params.id)
        .populate("termId")
        .lean();

      if (!activity) {
        return res.status(404).json({ message: "Activity not found" });
      }

      let supportData = { yea: [], nay: [], other: [] };

      if (activity.activityquorumId) {
        const vote = await Vote.findOne({
          quorumId: activity.activityquorumId,
        }).lean();
        supportData = await buildSupportData(vote);
      }

      res.status(200).json({
        ...activity,
        supportData,
      });
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
          return activityController.discardActivityChanges(req, res);
        }

        const existingActivity = await Activity.findById(activityID);
        if (!existingActivity) {
          return res.status(404).json({ message: "Activity not found" });
        }

        // Parse fields if needed
        if (typeof updateData.editedFields === "string") {
          updateData.editedFields = JSON.parse(updateData.editedFields);
        }
        if (typeof updateData.fieldEditors === "string") {
          updateData.fieldEditors = JSON.parse(updateData.fieldEditors);
        }

        // Initialize update operations
        const updateOperations = {
          $set: {
            ...updateData,
            modifiedBy: userId,
            modifiedAt: new Date(),
          },
        };

        // Clear fields if publishing
        if (updateData.status === "published") {
          updateOperations.$set.editedFields = [];
          updateOperations.$set.fieldEditors = {};
          updateOperations.$set.history = [];
        }

        // If not publishing, consider snapshot for history
        if (updateData.status !== "published") {
          const canTakeSnapshot =
            !existingActivity.history ||
            existingActivity.history.length === 0 ||
            existingActivity.snapshotSource === "edited";
          const noHistory =
            !existingActivity.history || existingActivity.history.length === 0;
          if (canTakeSnapshot && noHistory) {
            const currentState = existingActivity.toObject();

            // Remove unnecessary properties
            delete currentState._id;
            delete currentState.createdAt;
            delete currentState.updatedAt;
            delete currentState.__v;
            delete currentState.history;

            // Create history entry
            const historyEntry = {
              oldData: currentState,
              timestamp: new Date(),
              actionType: "update",
            };

            // Add to update operations
            updateOperations.$push = { history: historyEntry };
            updateOperations.$set.snapshotSource = "edited";
          } else if (
            existingActivity.snapshotSource === "deleted_pending_update"
          ) {
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

  // Discard changes (dedicated endpoint)
  static async discardActivityChanges(req, res) {
    try {
      const { discardChanges } = require("../helper/discardHelper");

      const restoredActivity = await discardChanges({
        model: Activity,
        documentId: req.params.id,
        userId: req.user?._id,
        options: { new: true, populate: "termId" },
      });

      res.status(200).json({
        message: "Restored to original state and history cleared",
        info: restoredActivity,
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

      // console.log("🗑 Delete request for Activity ID:", id);

      // Make sure ID is valid
      if (!mongoose.Types.ObjectId.isValid(id)) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: "Invalid activity ID" });
      }

      // 1️⃣ Find the activity
      const activity = await Activity.findById(id).session(session);
      if (!activity) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: "Activity not found" });
      }

      const activityObjectId = activity._id;
      const activityStringId = activity._id.toString();

      //console.log("📌 Found activity:", activity);

      // 2️⃣ Debug: Check SenatorData matches before delete
      const senatorMatches = await SenatorData.find({
        $or: [
          { "activitiesScore.activityId": activityObjectId },
          { "activitiesScore.activityId": activityStringId },
        ],
      }).session(session);

      // console.log(` Senator matches: ${senatorMatches.length}`);
      // 3️⃣ Debug: Check RepresentativeData matches before delete
      const repMatches = await RepresentativeData.find({
        $or: [
          { "activitiesScore.activityId": activityObjectId },
          { "activitiesScore.activityId": activityStringId },
        ],
      }).session(session);

      // console.log(` Representative matches: ${repMatches.length}`);

      // 4️⃣ Delete activity
      await Activity.findByIdAndDelete(id).session(session);

      // 5️⃣ Remove from SenatorData / RepresentativeData
      if (activity.type === "senate") {
        await SenatorData.updateMany(
          {
            $or: [
              { "activitiesScore.activityId": activityObjectId },
              { "activitiesScore.activityId": activityStringId },
            ],
          },
          {
            $pull: {
              activitiesScore: {
                activityId: { $in: [activityObjectId, activityStringId] },
              },
            },
          }
        ).session(session);
      }

      if (activity.type === "house") {
        await RepresentativeData.updateMany(
          {
            $or: [
              { "activitiesScore.activityId": activityObjectId },
              { "activitiesScore.activityId": activityStringId },
            ],
          },
          {
            $pull: {
              activitiesScore: {
                activityId: { $in: [activityObjectId, activityStringId] },
              },
            },
          }
        ).session(session);
      }

      // ✅ Commit transaction
      await session.commitTransaction();
      session.endSession();

      res.json({ message: "Activity deleted and related references removed" });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();

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
      const { performBulkUpdate } = require("../helper/bulkUpdateHelper");

      const validation = (data) => {
        const validStatuses = ["pending", "completed", "failed"];
        if (!validStatuses.includes(data.trackActivities)) {
          return "Invalid trackActivities value";
        }
      };

      const result = await performBulkUpdate({
        model: Activity,
        ids,
        updateData: { trackActivities },
        validation,
      });

      res.status(200).json({
        message: result.message,
        updatedActivities: result.updatedDocs,
      });
    } catch (error) {
      res.status(error.message.includes("Invalid") ? 400 : 500).json({
        message: error.message || "Error bulk updating activities",
        error: error.message,
      });
    }
  }
  // Fetch and create activities from cosponsorships
  static async fetchAndCreateFromCosponsorships(
    billId,
    title,
    introduced,
    congress,
    editorInfo
  ) {
    console.log(`Starting cosponsorship fetch for billId: ${billId}`);
    console.log("Editor Info in create:", editorInfo);
    console.log("🚧 Cosponsorship input check:", {
      billId,
      title,
      introduced,
      congress,
    });

    if (!billId || !title || !introduced || !congress) {
      console.warn(" Missing required bill data");
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
        console.warn(` Unable to determine activity type for bill ${billId}`);
        return 0;
      }

      if (!bill.sponsors || bill.sponsors.length === 0) {
        console.log(`ℹ️ No cosponsors found for bill ${billId}`);
        return 0;
      }

      //  Only create activity once outside the loop
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
        console.log(` Created new cosponsorship activity for bill ${billId}`);
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
              ` Skipping sponsor ${sponsorId} due to missing personId`
            );
            continue;
          }

          const [senator, rep] = await Promise.all([
            Senator.findOne({ senatorId: personId }),
            Representative.findOne({ repId: personId }),
          ]);

          if (!senator && !rep) {
            console.warn(
              ` No matching local legislator found for personId ${personId}`
            );
            continue;
          }

          const linked = await saveCosponsorshipToLegislator({
            personId,
            activityId: activity._id,
            score: "yes",
            title: bill.title,
            editorInfo,
          });

          if (linked) savedCount++;
        } catch (err) {
          console.warn(` Error processing sponsor ${sponsorId}:`, err.message);
        }
      }

      //console.log(`🎉 Finished processing cosponsors. Linked: ${savedCount}`);
      return savedCount;
    } catch (err) {
      console.error(
        ` Failed to fetch cosponsorships for bill ${billId}:`,
        err.message
      );
      return 0;
    }
  }
  // Cleanup function to remove orphaned activity references
}

module.exports = activityController;
