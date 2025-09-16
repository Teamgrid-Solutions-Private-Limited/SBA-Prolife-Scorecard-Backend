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
  title,
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
      [personField]: localPerson._id,
    });

    if (
      currentPerson &&
      currentPersonData.length > 0 &&
      (!currentPerson.history || currentPerson.history.length === 0) // 🆕 Extra condition
    ) {
      // Build snapshot object
      const snapshotData = {
        [personField === "senateId" ? "senatorId" : "repId"]:
          currentPerson[personField === "senateId" ? "senatorId" : "repId"],
        name: currentPerson.name,
        party: currentPerson.party,
        photo: currentPerson.photo,
        editedFields: currentPerson.editedFields || [],
        fieldEditors: currentPerson.fieldEditors || {},
        modifiedAt: currentPerson.modifiedAt,
        modifiedBy: currentPerson.modifiedBy,
        publishStatus: currentPerson.publishStatus,
        snapshotSource: currentPerson.snapshotSource,
        status: currentPerson.status,
      };

      if (roleLabel === "Representative" && currentPerson.district) {
        snapshotData.district = currentPerson.district;
      }
      if (roleLabel === "Senator" && currentPerson.state) {
        snapshotData.state = currentPerson.state;
      }

      if (roleLabel === "Representative") {
        snapshotData.representativeData = currentPersonData.map((doc) =>
          doc.toObject()
        );
      } else if (roleLabel === "Senator") {
        snapshotData.senatorData = currentPersonData.map((doc) =>
          doc.toObject()
        );
      }

      const snapshot = {
        oldData: snapshotData,
        timestamp: new Date().toISOString(),
        actionType: "update",
        _id: new mongoose.Types.ObjectId(),
      };

      // Save snapshot in history (limit to last 50)
      await personModel.findByIdAndUpdate(localPerson._id, {
        $push: {
          history: {
            $each: [snapshot],
            $slice: -50,
          },
        },
      });
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
    updatedAt: new Date().toISOString(),
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
          $slice: -20,
        },
      },
      $set: {
        updatedAt: new Date(),
        publishStatus: "under review",
        snapshotSource: "edited",
        [`fieldEditors.${fieldKey}`]: {
          editorId: editorInfo?.editorId || "system-auto",
          editorName: editorInfo?.editorName || "System Auto-Update",
          editedAt: editorInfo?.editedAt || new Date().toISOString(),
        },
      },
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
          status: "draft",
        });

        if (trackActivities) {
          newActivity.trackActivities = trackActivities;
        }

        const newActivityData = new Activity(newActivity);
        await newActivityData.save();

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
        .sort({ date: -1, createdAt: -1 })
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
        .populate("termId", "_id name startYear endYear congresses") // cleaned termId
        .lean();

      if (!activity) {
        return res.status(404).json({ message: "Activity not found" });
      }

      let supportData;

      if (activity.activityquorumId) {
        // Try to find a matching Vote
        const vote = await Vote.findOne({
          quorumId: activity.activityquorumId,
        }).lean();

        if (vote) {
          // Found a vote → build vote-style supportData
          supportData = await buildSupportData(vote, false);
        } else {
          // No vote found → build activity-style supportData
          supportData = await buildSupportData(activity, true);
        }
      } else {
        // Fallback → activity-style supportData
        supportData = await buildSupportData(activity, true);
      }

      res.status(200).json({
        ...activity,
        supportData,
      });
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error retrieving activity", error: error.message });
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
    try {
      const { id } = req.params;

      // Check if activity exists
      const activity = await Activity.findById(id);
      if (!activity) {
        return res.status(404).json({ message: "Activity not found" });
      }
      console.log("🗑️ Deleting activity:", id, "| Title:", activity.title);

      const Senator = require("../models/senatorSchema");
      const Representative = require("../models/representativeSchema");
      const SenatorData = require("../models/senatorDataSchema");
      const RepresentativeData = require("../models/representativeDataSchema");

      // Function to create editorKey for activities
      function makeActivityEditorKey(title) {
        // For patterns like "S. 4445: Right to IVF Act"
        if (title.includes("S.")) {
          return (
            "activitiesScore_" +
            title
              .replace(/S\.\s*(\d+):/g, "S_$1_") // Convert "S. 4445:" to "S_4445_"
              .replace(/'/g, "") // Remove apostrophes
              .replace(/\s+/g, "_") // Replace spaces with underscores
              .replace(/[^a-zA-Z0-9_]/g, "")
          ); // Remove any other special characters
        }
        // For patterns like "H.R. 1234: Some Act"
        else if (title.includes("H.R.")) {
          return (
            "activitiesScore_" +
            title
              .replace(/H\.R\.\s*(\d+):/g, "H_R_$1_") // Convert "H.R. 1234:" to "H_R_1234_"
              .replace(/'/g, "") // Remove apostrophes
              .replace(/\s+/g, "_") // Replace spaces with underscores
              .replace(/[^a-zA-Z0-9_]/g, "")
          ); // Remove any other special characters
        }
        // For other patterns
        else {
          return (
            "activitiesScore_" +
            title
              .replace(/\./g, "")
              .replace(/:/g, "")
              .replace(/'/g, "")
              .replace(/\s+/g, "_")
              .replace(/[^a-zA-Z0-9_]/g, "")
          );
        }
      }

      // ---------------------------------------
      // 1. Remove activity from senatorData / repData
      // ---------------------------------------
      const senatorDataResult = await SenatorData.updateMany(
        { "activitiesScore.activityId": id },
        { $pull: { activitiesScore: { activityId: id } } }
      );
      console.log("📌 SenatorData update result:", senatorDataResult);

      const repDataResult = await RepresentativeData.updateMany(
        { "activitiesScore.activityId": id },
        { $pull: { activitiesScore: { activityId: id } } }
      );
      console.log("📌 RepresentativeData update result:", repDataResult);

      const senators = await Senator.find({
        "editedFields.name": activity.title,
        "editedFields.field": "activitiesScore",
      });
      console.log(
        `👥 Found ${senators.length} senators with editedFields containing: ${activity.title} in activitiesScore`
      );

      for (const senator of senators) {
        console.log(
          `➡️ Cleaning senator: ${senator.name} (${senator.senatorId})`
        );

        // Remove matching editedFields (both name AND field must match)
        const beforeCount = senator.editedFields.length;
        senator.editedFields = senator.editedFields.filter(
          (f) =>
            !(
              f.name === activity.title &&
              f.field &&
              f.field.includes("activitiesScore")
            )
        );
        const afterCount = senator.editedFields.length;
        const removedCount = beforeCount - afterCount;
        if (removedCount > 0) {
          console.log(`   🗑️ Removed ${removedCount} editedFields entries`);
        }

        const editorKey = makeActivityEditorKey(activity.title);
        console.log(`   🔍 Looking for fieldEditor key: ${editorKey}`);

        // Convert fieldEditors to plain object
        let fieldEditorsPlain = {};
        if (senator.fieldEditors) {
          try {
            fieldEditorsPlain = JSON.parse(
              JSON.stringify(senator.fieldEditors)
            );
          } catch (error) {
            fieldEditorsPlain = {};
            for (const key in senator.fieldEditors) {
              if (!key.startsWith("$__") && key !== "_id" && key !== "__v") {
                fieldEditorsPlain[key] = senator.fieldEditors[key];
              }
            }
          }
        }

        const actualKeys = Object.keys(fieldEditorsPlain);
        console.log(
          `   📋 Available fieldEditor keys: ${actualKeys.join(", ")}`
        );

        let fieldEditorDeleted = false;

        // 1. First try exact match
        if (fieldEditorsPlain[editorKey]) {
          console.log(`   🗑️ Deleting fieldEditor key: ${editorKey}`);
          delete fieldEditorsPlain[editorKey];
          fieldEditorDeleted = true;
        }
        // 2. Try case-insensitive match
        else {
          const foundKey = actualKeys.find(
            (key) => key.toLowerCase() === editorKey.toLowerCase()
          );
          if (foundKey) {
            console.log(
              `   🔍 Found case-insensitive match: ${foundKey}, deleting it`
            );
            delete fieldEditorsPlain[foundKey];
            fieldEditorDeleted = true;
          }
          // 3. Try pattern matching for S. vs S differences
          else {
            const normalizedEditorKey = editorKey.replace(/_/g, "");
            const foundPatternKey = actualKeys.find((key) => {
              const normalizedKey = key.replace(/_/g, "");
              return normalizedKey === normalizedEditorKey;
            });

            if (foundPatternKey) {
              console.log(
                `   🔍 Found pattern match: ${foundPatternKey}, deleting it`
              );
              delete fieldEditorsPlain[foundPatternKey];
              fieldEditorDeleted = true;
            }
            // 4. Try partial match (for apostrophe differences etc)
            else {
              const partialMatch = actualKeys.find((key) => {
                // Remove all non-alphanumeric characters and compare
                const cleanKey = key.replace(/[^a-zA-Z0-9]/g, "");
                const cleanEditorKey = editorKey.replace(/[^a-zA-Z0-9]/g, "");
                return cleanKey === cleanEditorKey;
              });

              if (partialMatch) {
                console.log(
                  `   🔍 Found partial match: ${partialMatch}, deleting it`
                );
                delete fieldEditorsPlain[partialMatch];
                fieldEditorDeleted = true;
              } else {
                console.log(`   ℹ️ FieldEditor key not found: ${editorKey}`);
              }
            }
          }
        }

        if (fieldEditorDeleted) {
          senator.fieldEditors = fieldEditorsPlain;
        }

        // If no editedFields left → restore publishStatus from history
        // If no editedFields left → restore publishStatus from history
        if (senator.editedFields.length === 0) {
          if (Array.isArray(senator.history) && senator.history.length > 0) {
            const lastHistory = senator.history[senator.history.length - 1];
            const restoredStatus =
              lastHistory.oldData?.publishStatus || lastHistory.publishStatus;
            if (restoredStatus) {
              console.log(
                `   🔄 Restoring publishStatus to: ${restoredStatus}`
              );
              senator.publishStatus = restoredStatus;

              // 🆕 Clear history if it's only a published snapshot
              if (
                senator.history.length === 1 &&
                (lastHistory.oldData?.publishStatus === "published" ||
                  lastHistory.publishStatus === "published")
              ) {
                console.log(
                  "   🧹 Clearing history (only contained published snapshot)"
                );
                senator.history = [];
              }
            }
          } else {
            console.log(
              "   ⚠️ No history found, setting publishStatus to draft"
            );
            senator.publishStatus = "draft";
          }
        }

        // Use updateOne instead of save to avoid validation errors
        const updateData = {};
        if (removedCount > 0) updateData.editedFields = senator.editedFields;
        if (fieldEditorDeleted) updateData.fieldEditors = senator.fieldEditors;
        if (senator.publishStatus !== undefined)
          updateData.publishStatus = senator.publishStatus;
        if (senator.history && senator.history.length === 0)
          updateData.history = [];
        if (Object.keys(updateData).length > 0) {
          await Senator.updateOne({ _id: senator._id }, { $set: updateData });
          console.log("   ✅ Senator updated successfully");
        } else {
          console.log("   ℹ️ No changes needed for senator");
        }
      }

      // ---------------------------------------
      // 3. Clean up representative editedFields + fieldEditors
      // ---------------------------------------
      const representatives = await Representative.find({
        "editedFields.name": activity.title,
        "editedFields.field": "activitiesScore",
      });
      console.log(
        `👥 Found ${representatives.length} reps with editedFields containing: ${activity.title} in activitiesScore`
      );

      for (const rep of representatives) {
        console.log(`➡️ Cleaning representative: ${rep.name} (${rep.repId})`);

        let removedCount = 0;
        // Remove matching editedFields if they exist
        if (rep.editedFields && rep.editedFields.length > 0) {
          const beforeCount = rep.editedFields.length;
          rep.editedFields = rep.editedFields.filter(
            (f) =>
              !(
                f.name === activity.title &&
                f.field &&
                f.field.includes("activitiesScore")
              )
          );
          removedCount = beforeCount - rep.editedFields.length;
          if (removedCount > 0) {
            console.log(`   🗑️ Removed ${removedCount} editedFields entries`);
          }
        }

        const editorKey = makeActivityEditorKey(activity.title);
        console.log(`   🔍 Looking for fieldEditor key: ${editorKey}`);

        // Convert fieldEditors to plain object
        let repFieldEditorsPlain = {};
        if (rep.fieldEditors) {
          try {
            repFieldEditorsPlain = JSON.parse(JSON.stringify(rep.fieldEditors));
          } catch (error) {
            repFieldEditorsPlain = {};
            for (const key in rep.fieldEditors) {
              if (!key.startsWith("$__") && key !== "_id" && key !== "__v") {
                repFieldEditorsPlain[key] = rep.fieldEditors[key];
              }
            }
          }
        }

        const repActualKeys = Object.keys(repFieldEditorsPlain);
        console.log(
          `   📋 Available fieldEditor keys: ${repActualKeys.join(", ")}`
        );

        let fieldEditorDeleted = false;

        // 1. First try exact match
        if (repFieldEditorsPlain[editorKey]) {
          console.log(`   🗑️ Deleting fieldEditor key: ${editorKey}`);
          delete repFieldEditorsPlain[editorKey];
          fieldEditorDeleted = true;
        }
        // 2. Try case-insensitive match
        else {
          const foundKey = repActualKeys.find(
            (key) => key.toLowerCase() === editorKey.toLowerCase()
          );
          if (foundKey) {
            console.log(
              `   🔍 Found case-insensitive match: ${foundKey}, deleting it`
            );
            delete repFieldEditorsPlain[foundKey];
            fieldEditorDeleted = true;
          }
          // 3. Try pattern matching
          else {
            const normalizedEditorKey = editorKey.replace(/_/g, "");
            const foundPatternKey = repActualKeys.find((key) => {
              const normalizedKey = key.replace(/_/g, "");
              return normalizedKey === normalizedEditorKey;
            });

            if (foundPatternKey) {
              console.log(
                `   🔍 Found pattern match: ${foundPatternKey}, deleting it`
              );
              delete repFieldEditorsPlain[foundPatternKey];
              fieldEditorDeleted = true;
            }
            // 4. Try partial match
            else {
              const partialMatch = repActualKeys.find((key) => {
                const cleanKey = key.replace(/[^a-zA-Z0-9]/g, "");
                const cleanEditorKey = editorKey.replace(/[^a-zA-Z0-9]/g, "");
                return cleanKey === cleanEditorKey;
              });

              if (partialMatch) {
                console.log(
                  `   🔍 Found partial match: ${partialMatch}, deleting it`
                );
                delete repFieldEditorsPlain[partialMatch];
                fieldEditorDeleted = true;
              } else {
                console.log(`   ℹ️ FieldEditor key not found: ${editorKey}`);
              }
            }
          }
        }

        if (fieldEditorDeleted) {
          rep.fieldEditors = repFieldEditorsPlain;
        }

        // If no editedFields left → restore publishStatus
        if (rep.editedFields.length === 0) {
          if (Array.isArray(rep.history) && rep.history.length > 0) {
            const lastHistory = rep.history[rep.history.length - 1];
            const restoredStatus =
              lastHistory.oldData?.publishStatus || lastHistory.publishStatus;
            if (restoredStatus) {
              console.log(
                `   🔄 Restoring publishStatus to: ${restoredStatus}`
              );
              rep.publishStatus = restoredStatus;

              // 🆕 Clear history if it's only a published snapshot
              if (
                rep.history.length === 1 &&
                (lastHistory.oldData?.publishStatus === "published" ||
                  lastHistory.publishStatus === "published")
              ) {
                console.log(
                  "   🧹 Clearing history (only contained published snapshot)"
                );
                rep.history = [];
              }
            }
          } else {
            console.log(
              "   ⚠️ No history found, setting publishStatus to draft"
            );
            rep.publishStatus = "draft";
          }
        }

        // Only update if something changed
        const updateData = {};
        if (removedCount > 0) updateData.editedFields = rep.editedFields;
        if (fieldEditorDeleted) updateData.fieldEditors = rep.fieldEditors;
        if (rep.publishStatus !== undefined)
          updateData.publishStatus = rep.publishStatus;
        if (rep.history && rep.history.length === 0) updateData.history = [];

        if (Object.keys(updateData).length > 0) {
          await Representative.updateOne(
            { _id: rep._id },
            { $set: updateData }
          );
          console.log("   ✅ Representative updated successfully");
        } else {
          console.log("   ℹ️ No changes needed for representative");
        }
      }

      // ---------------------------------------
      // 4. Delete the activity itself
      // ---------------------------------------
      await Activity.findByIdAndDelete(id);
      console.log("🗑️ Activity deleted:", id);

      res.status(200).json({
        message: "Activity and its references deleted successfully",
        deletedActivityId: id,
      });
    } catch (error) {
      console.error("❌ Error deleting activity:", error);
      res.status(500).json({
        message: "Error deleting activity and its references",
        error: error.message,
      });
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
