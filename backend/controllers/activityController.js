const mongoose = require("mongoose");
const axios = require("axios");
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

const { performBulkUpdate } = require("../helper/bulkUpdateHelper");
const { buildSupportData } = require("../helper/supportDataHelper");
const { discardChanges } = require("../helper/discardHelper");
const { getFileUrl } = require("../helper/filePath");
const {
  makeEditorKey,
  deleteFieldEditor,
  cleanupPersonAfterDelete,
  migrateTitleForScoreTypes,
} = require("../helper/editorKeyService");

const BASE = process.env.QUORUM_BASE_URL || "https://www.quorum.us";
const API_KEY = process.env.QUORUM_API_KEY;
const USERNAME = process.env.QUORUM_USERNAME;

async function saveCosponsorshipToLegislator({
  personId,
  activityId,
  score = "yes",
  editorInfo,
  title,
  activityType,
}) {
  personId = String(personId);
  const [senator, representative] = await Promise.all([
    Senator.findOne({ senatorId: personId }),
    Representative.findOne({ repId: personId }),
  ]);

  let localPerson, dataModel, personField, personModel, roleLabel;
  if (senator && representative) {
    if (activityType === "senate") {
      localPerson = senator;
      dataModel = SenatorData;
      personField = "senateId";
      personModel = Senator;
      roleLabel = "Senator";
    } else if (activityType === "house") {
      localPerson = representative;
      dataModel = RepresentativeData;
      personField = "houseId";
      personModel = Representative;
      roleLabel = "Representative";
    } else {
      return false;
    }
  } else if (senator) {
    if (activityType === "house") {
      return false;
    }
    localPerson = senator;
    dataModel = SenatorData;
    personField = "senateId";
    personModel = Senator;
    roleLabel = "Senator";
  } else if (representative) {
    if (activityType === "senate") {
      return false;
    }
    localPerson = representative;
    dataModel = RepresentativeData;
    personField = "houseId";
    personModel = Representative;
    roleLabel = "Representative";
  } else {
    return false;
  }
  const filter = { [personField]: localPerson._id };
  const existing = await dataModel.findOne(filter);

  const alreadyLinked = existing?.activitiesScore?.some(
    (entry) => String(entry.activityId) === String(activityId)
  );

  if (alreadyLinked) {
    return false;
  }

  if (localPerson.publishStatus === "published") {
    const currentPerson = await personModel.findById(localPerson._id);
    const currentPersonData = await dataModel.find({
      [personField]: localPerson._id,
    });

    if (
      currentPerson &&
      currentPersonData.length > 0 &&
      (!currentPerson.history || currentPerson.history.length === 0)
    ) {
      const snapshotData = {
        [personField === "senateId" ? "senatorId" : "repId"]:
          currentPerson[personField === "senateId" ? "senatorId" : "repId"],
        name: currentPerson.name,
        party: currentPerson.party,
        photo: currentPerson.photo,
        editedFields: currentPerson.editedFields || [],
        fieldEditors: currentPerson.fieldEditors || {},
        modifiedAt: currentPerson.modifiedAt,
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

class activityController {
  static async createActivity(req, res) {
    try {
      const {
        type,
        title,
        shortDesc,
        rollCall,
        date,
        congress,
        trackActivities,
      } = req.body;

      const readMore = getFileUrl(req.file);
      const newActivity = new Activity({
        type,
        title,
        shortDesc,
        rollCall,
        readMore,
        date,
        congress,
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

  static async AllActivity(req, res) {
    try {
      let filter = {};

      filter = applyCommonFilters(req, filter);

      filter = applyCongressFilter(req, filter);

      filter = applyActivityTermFilter(req, filter);

      filter = applyChamberFilter(req, filter, false);

      const { _id, ...ACTIVITY_FIELDS_NO_ID } = ACTIVITY_PUBLIC_FIELDS;

      const isFrontend =
        req.query.frontend === "true" || req.query.published === "true";

      let pipeline = [];

      if (isFrontend) {
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
        pipeline.push({ $match: { ...filter } });
      }
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
      const activity = await Activity.findById(req.params.id).lean();

      if (!activity) {
        return res.status(404).json({ message: "Activity not found" });
      }

      let supportData;

      if (activity.activityquorumId) {
        const vote = await Vote.findOne({
          quorumId: activity.activityquorumId,
        }).lean();

        if (vote) {
          supportData = await buildSupportData(vote, false);
        } else {
          supportData = await buildSupportData(activity, true);
        }
      } else {
        supportData = await buildSupportData(activity, true);
      }

      res.status(200).json({
        ...activity,
        supportData,
      });
    } catch (error) {
      res.status(500).json({
        message: "Error retrieving activity",
        error: error.message,
      });
    }
  }

  static async updateActivity(req, res) {
    upload.single("readMore")(req, res, async (err) => {
      if (err) return res.status(400).json({ message: err.message });

      try {
        const activityID = req.params.id;
        let updateData = { ...req.body };
        const userId = req.user?._id || null;
        updateData.modifiedBy = userId;
        updateData.modifiedAt = new Date();

        if (req.file) {
          updateData.readMore = `/uploads/documents/${req.file.filename}`;
        }
        if (req.body.discardChanges === "true") {
          return activityController.discardActivityChanges(req, res);
        }

        const existingActivity = await Activity.findById(activityID);
        if (!existingActivity) {
          return res.status(404).json({ message: "Activity not found" });
        }
        if (typeof updateData.editedFields === "string") {
          updateData.editedFields = JSON.parse(updateData.editedFields);
        }
        if (typeof updateData.fieldEditors === "string") {
          updateData.fieldEditors = JSON.parse(updateData.fieldEditors);
        }
        const updateOperations = {
          $set: {
            ...updateData,
            modifiedBy: userId,
            modifiedAt: new Date(),
          },
        };
        if (updateData.status === "published") {
          updateOperations.$set.editedFields = [];
          updateOperations.$set.fieldEditors = {};
          updateOperations.$set.history = [];
        }
        if (updateData.status !== "published") {
          const canTakeSnapshot =
            !existingActivity.history ||
            existingActivity.history.length === 0 ||
            existingActivity.snapshotSource === "edited";
          const noHistory =
            !existingActivity.history || existingActivity.history.length === 0;
          if (canTakeSnapshot && noHistory) {
            const currentState = existingActivity.toObject();
            delete currentState._id;
            delete currentState.createdAt;
            delete currentState.updatedAt;
            delete currentState.__v;
            delete currentState.history;
            const historyEntry = {
              oldData: currentState,
              timestamp: new Date(),
              actionType: "update",
            };
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
          updateOperations,
          { new: true }
        );

        if (!updatedActivity) {
          return res.status(404).json({ message: "Activity not found" });
        }
        // migrate editedFields & fieldEditors when activity title changes
        if (
          existingActivity.title &&
          existingActivity.title !== updatedActivity.title
        ) {
          await migrateTitleForScoreTypes({
            oldTitle: existingActivity.title,
            newTitle: updatedActivity.title,
            fieldTypes: ["activitiesScore"],
            personModels: [Senator, Representative],
          });
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
  static async discardActivityChanges(req, res) {
    try {
      const restoredActivity = await discardChanges({
        model: Activity,
        documentId: req.params.id,
        userId: req.user?._id,
        options: { new: true },
      });

      res.status(200).json({
        message: "Restored to original state and history cleared",
        info: restoredActivity,
      });
    } catch (error) {
      res.status(500).json({
        message: "No history available to restore",
        error: error.message,
      });
    }
  }

  static async deleteActivity(req, res) {
    try {
      const { id } = req.params;
      const activity = await Activity.findById(id);
      if (!activity) {
        return res.status(404).json({ message: "Activity not found" });
      }
      const senatorDataResult = await SenatorData.updateMany(
        { "activitiesScore.activityId": id },
        { $pull: { activitiesScore: { activityId: id } } }
      );

      const repDataResult = await RepresentativeData.updateMany(
        { "activitiesScore.activityId": id },
        { $pull: { activitiesScore: { activityId: id } } }
      );

      const senators = await Senator.find({
        "editedFields.name": activity.title,
        "editedFields.field": "activitiesScore",
      });

      for (const senator of senators) {
        await cleanupPersonAfterDelete({
          person: senator,
          title: activity.title,
          fieldType: "activitiesScore",
          model: Senator,
        });
      }
      const representatives = await Representative.find({
        "editedFields.name": activity.title,
        "editedFields.field": "activitiesScore",
      });
      for (const rep of representatives) {
        await cleanupPersonAfterDelete({
          person: rep,
          title: activity.title,
          fieldType: "activitiesScore",
          model: Representative,
        });
      }
      -(await Activity.findByIdAndDelete(id));

      res.status(200).json({
        message: "Activity and its references deleted successfully",
        deletedActivityId: id,
      });
    } catch (error) {
      console.error(" Error deleting activity:", error);
      res.status(500).json({
        message: "Error deleting activity and its references",
        error: error.message,
      });
    }
  }
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
  static async bulkUpdateTrackActivities(req, res) {
    try {
      const { ids, trackActivities } = req.body;
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
  static async fetchAndCreateFromCosponsorships(
    billId,
    title,
    introduced,
    congress,
    editorInfo
  ) {
    console.log(
      `\n🔵 [ACTIVITY CONTROLLER] fetchAndCreateFromCosponsorships called`
    );
    console.log(`   📥 Input Parameters:`);
    console.log(`      - billId: ${billId}`);
    console.log(`      - title: ${title}`);
    console.log(`      - introduced: ${introduced}`);
    console.log(`      - congress: ${congress}`);
    console.log(`      - editorInfo:`, editorInfo);

    if (!billId || !title || !introduced || !congress) {
      console.warn("   ⚠️ Missing required bill data");
      return 0;
    }
    const queryParams = {
      api_key: API_KEY,
      username: USERNAME,
      dehydrate_extra: "sponsors",
    };

    const billUrl = `${BASE}/api/newbill/${billId}`;
    console.log(`   🌐 Fetching bill from: ${billUrl}`);

    try {
      const billRes = await axios.get(billUrl, { params: queryParams });
      console.log(billRes);

      const bill = billRes.data;
      console.log("bill:-", bill);

      console.log(`   ✅ Bill data fetched successfully`);
      console.log(`      - Bill type from API: ${bill.type}`);
      console.log(`      - Bill title from API: ${bill.title}`);
      console.log(`      - Sponsors count: ${bill.sponsors?.length || 0}`);

      let activityType = bill.type || null;
      if (!activityType && bill.bill_type) {
        const fallbackType = bill.bill_type.toLowerCase();
        if (fallbackType.includes("senate")) activityType = "senate";
        else if (fallbackType.includes("house")) activityType = "house";
      }

      console.log(`   🏛️ Determined activity type: ${activityType}`);

      if (!activityType) {
        console.warn(
          `   ⚠️ Unable to determine activity type for bill ${billId}`
        );
        return 0;
      }

      if (!bill.sponsors || bill.sponsors.length === 0) {
        console.warn(`   ⚠️ No sponsors found for bill ${billId}`);
        return 0;
      }

      console.log(`   🔍 Checking if activity already exists...`);
      console.log(
        `      Query: { activityquorumId: ${billId}, date: ${introduced}, congress: ${congress}, type: ${activityType} }`
      );

      let activity = await Activity.findOne({
        activityquorumId: billId,
        congress,
        type: activityType,
      });

      if (!activity) {
        console.log(`   📝 Activity not found, creating new one...`);

        const activityData = {
          type: activityType,
          title: bill.title || title,
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
        };

        console.log(`   📋 Activity data to save:`, activityData);

        activity = new Activity(activityData);

        console.log(`   💾 Attempting to save activity...`);
        console.log(`      - Activity _id (pre-save): ${activity._id}`);

        try {
          await activity.save();
          console.log(`   ✅ Activity saved successfully!`);
          console.log(`      - Saved activity _id: ${activity._id}`);
          console.log(`      - Saved activity title: ${activity.title}`);
          console.log(`      - Saved activity type: ${activity.type}`);
        } catch (saveError) {
          console.error(`   ❌ CRITICAL: Activity save failed!`);
          console.error(`      - Error message: ${saveError.message}`);
          console.error(`      - Error name: ${saveError.name}`);
          if (saveError.errors) {
            console.error(`      - Validation errors:`, saveError.errors);
          }
          console.error(`      - Full error:`, saveError);
          return 0; // Exit early - don't link to legislators
        }
      } else {
        console.log(`   ♻️ Activity already exists: ${activity._id}`);
        console.log(`      - Title: ${activity.title}`);
        console.log(`      - Type: ${activity.type}`);
      }

      let savedCount = 0;
      console.log(`   👥 Processing ${bill.sponsors.length} sponsors...`);

      for (const sponsorUri of bill.sponsors) {
        const sponsorId = sponsorUri.split("/").filter(Boolean).pop();
        console.log(`      🔸 Processing sponsor ${sponsorId}...`);

        try {
          const sponsorRes = await axios.get(
            `${BASE}/api/newsponsor/${sponsorId}/`,
            { params: { api_key: API_KEY, username: USERNAME } }
          );
          const sponsor = sponsorRes.data;

          const personId = sponsor.person?.split("/").filter(Boolean).pop();

          if (!personId) {
            console.warn(
              `         ⚠️ Skipping sponsor ${sponsorId} - missing personId`
            );
            continue;
          }

          const [senator, rep] = await Promise.all([
            Senator.findOne({ senatorId: personId }),
            Representative.findOne({ repId: personId }),
          ]);

          if (!senator && !rep) {
            console.warn(
              `         ⚠️ No matching legislator for personId ${personId}`
            );
            continue;
          }

          console.log(
            `         🔗 Linking activity ${activity._id} to legislator ${personId}`
          );

          const linked = await saveCosponsorshipToLegislator({
            personId,
            activityId: activity._id,
            score: "yes",
            title: bill.title,
            editorInfo,
            activityType,
          });

          if (linked) {
            savedCount++;
            console.log(`         ✅ Successfully linked to legislator`);
          } else {
            console.log(`         ℹ️ Not linked (already exists or filtered)`);
          }
        } catch (err) {
          console.warn(
            `         ❌ Error processing sponsor ${sponsorId}: ${err.message}`
          );
        }
      }

      console.log(`   📊 Total cosponsorship links created: ${savedCount}`);
      return savedCount;
    } catch (err) {
      console.error(`   ❌ Failed to fetch cosponsorships for bill ${billId}`);
      console.error(`      - Error: ${err.message}`);
      console.error(`      - Stack:`, err.stack);
      return 0;
    }
  }

  static async saveActivityFromBill(req, res) {
    try {
      const { billId, title, introduced, congress, editorInfo } = req.body;

      // Validate required fields
      if (!billId || !title || !introduced || !congress) {
        console.log("❌ Missing required fields");
        return res.status(400).json({
          message:
            "Missing required fields: billId, title, introduced, congress",
        });
      }
      // Check if activity already exists
      let activity = await Activity.findOne({
        activityquorumId: billId,
       
        congress,
      });

      if (activity) {
        return res.status(200).json({
          exists: true,
          message: "Activity already exists",
          activityId: activity._id,
        });
      }
      // Create activity immediately and get the ID
      let activityType = null;
      const queryParams = {
        api_key: API_KEY,
        username: USERNAME,
      };

      // Quick API call to determine bill type
      try {
        const billUrl = `${BASE}/api/newbill/${billId}`;
        const billRes = await axios.get(billUrl, { params: queryParams });
        const bill = billRes.data;

        activityType = bill.type || null;
        if (!activityType && bill.bill_type) {
          const fallbackType = bill.bill_type.toLowerCase();
          if (fallbackType.includes("senate")) activityType = "senate";
          else if (fallbackType.includes("house")) activityType = "house";
        }
      } catch (err) {
        console.warn(
          `⚠️ Could not fetch bill details, using default type:`,
          err.message
        );
        activityType = "house";
      }
      // Create the activity immediately
      const newActivity = new Activity({
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

      await newActivity.save();
      // Process sponsors in background (don't await)
      activityController
        .fetchAndCreateFromCosponsorships(
          String(billId),
          String(title),
          String(introduced),
          String(congress),
          editorInfo || {}
        )
        .then((savedCount) => {
          console.log(
            `🎉 [BACKGROUND] Legislator assignment completed - Linked ${savedCount} sponsors`
          );
        })
        .catch((err) => {
          console.error("💥 Background legislator assignment failed:", err);
        });

      res.status(200).json({
        message:
          "Activity created successfully! Legislators are being assigned in the background.",
        activityId: newActivity._id,
        exists: false,
      });
    } catch (err) {
      res.status(500).json({
        message: "Internal server error",
        error: err.message,
      });
    }
  }
}

module.exports = activityController;
