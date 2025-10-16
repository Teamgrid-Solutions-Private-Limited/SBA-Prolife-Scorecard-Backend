const Vote = require("../models/voteSchema");
const upload = require("../middlewares/fileUploads");
const { buildSupportData } = require("../helper/supportDataHelper");
const { VOTE_PUBLIC_FIELDS } = require("../constants/projection");
const {
  applyCommonFilters,
  applyTermFilter,
  applyCongressFilter,
  applyChamberFilter,
} = require("../middlewares/filter");
const Senator = require("../models/senatorSchema");
const Representative = require("../models/representativeSchema");
const SenatorData = require("../models/senatorDataSchema");
const RepresentativeData = require("../models/representativeDataSchema");
const { makeEditorKey, deleteFieldEditor,cleanupPersonAfterDelete } = require("../helper/editorKeyService");
const path = require("path");
const { getFileUrl } = require("../helper/filePath");

class voteController {
  static async createVote(req, res) {
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
        sbaPosition,
      } = req.body;


      if (!type || !title || !rollCall || !date  || !termId) {
        return res.status(400).json({ message: "Missing required fields" });
      }
   
      const readMore = getFileUrl(req.file) || req.body.readMore;
      const newVote = new Vote({
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
        ...(sbaPosition && { sbaPosition }),
      });

      await newVote.save();

      res.status(201).json({
        success: true,
        message: "Vote created successfully",
        data: newVote,
      });
    } catch (error) {
      console.error("Error creating vote:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  static async getAllVotes(req, res) {
    try {
      const votes = await Vote.find({})
        .select(VOTE_PUBLIC_FIELDS)
        .sort({ date: -1, createdAt: -1 })
        .lean();

      res.status(200).json(votes);
    } catch (error) {
      res.status(500).json({
        message: "Error retrieving admin votes",
        error: error.message,
      });
    }
  }

  static async AllVotes(req, res) {
    try {
      let filter = {};
      filter = applyTermFilter(req, filter);
      filter = applyCongressFilter(req, filter);
      filter = applyChamberFilter(req, filter, true);
      const votes = await Vote.aggregate([
        {
          $match: {
            $or: [
              { status: "published" },
              { status: "under review", "history.oldData.status": "published" },
            ],
            ...filter,
          },
        },

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
                  $mergeObjects: ["$history.oldData", { _id: "$_id" }],
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
        { $replaceRoot: { newRoot: "$effectiveDoc" } },

        { $sort: { date: -1, createdAt: -1 } },
        {
          $group: {
            _id: "$quorumId",
            latest: { $first: "$$ROOT" },
          },
        },
        { $replaceRoot: { newRoot: "$latest" } },
        { $sort: { date: -1, createdAt: -1 } },

        { $project: VOTE_PUBLIC_FIELDS },
      ]);

      res.status(200).json(votes);
    } catch (error) {
      res.status(500).json({
        message: "Error retrieving votes",
        error: error.message,
      });
    }
  }

  static async getVoteById(req, res) {
    try {
      const vote = await Vote.findById(req.params.id).populate("termId").lean();

      if (!vote) {
        return res.status(404).json({ message: "Vote not found" });
      }

      const supportData = await buildSupportData(vote);

      res.status(200).json({
        ...vote,
        supportData,
      });
    } catch (error) {
      console.error("Error retrieving vote:", error);
      res.status(500).json({ message: "Error retrieving vote", error });
    }
  }
  static async bulkUpdateSbaPosition(req, res) {
    try {
      const { ids, sbaPosition } = req.body;
      const { performBulkUpdate } = require("../helper/bulkUpdateHelper");

      const validation = (data) => {
        if (data.sbaPosition !== "Yes" && data.sbaPosition !== "No") {
          return "Invalid SBA Position value";
        }
      };

      const result = await performBulkUpdate({
        model: Vote,
        ids,
        updateData: { sbaPosition },
        options: { populate: "termId" },
        validation,
      });

      res.status(200).json({
        message: result.message,
        updatedBills: result.updatedDocs,
      });
    } catch (error) {
      res.status(error.message.includes("Invalid") ? 400 : 500).json({
        message: error.message || "Error bulk updating bills",
        error: error.message,
      });
    }
  }

  static async updateVote(req, res) {
    try {
      upload.single("readMore")(req, res, async (err) => {
        if (err) {
          return res.status(400).json({ message: err.message });
        }
        const voteID = req.params.id;
        let updateData = { ...req.body };
        const userId = req.user?._id || null;
        updateData.modifiedBy = userId;
        updateData.modifiedAt = new Date();
        if (req.file) {
          updateData.readMore = `/uploads/${req.file.filename}`;
        }
        if (req.body.discardChanges === "true") {
          return voteController.discardVoteChanges(req, res);
        }
        const existingVote = await Vote.findById(voteID);
        if (!existingVote) {
          return res.status(404).json({ message: "Vote not found" });
        }
        if (typeof updateData.editedFields === "string") {
          updateData.editedFields = JSON.parse(updateData.editedFields);
        }
        if (typeof updateData.fieldEditors === "string") {
          updateData.fieldEditors = JSON.parse(updateData.fieldEditors);
        }
        const updateOperations = {};
        if (updateData.status === "published") {
          updateOperations.$set = {
            ...updateData,
            editedFields: [],
            fieldEditors: {},
            history: [],
            status: "published",
            modifiedBy: userId,
            modifiedAt: new Date(),
          };
        } else {
          updateOperations.$set = {
            ...updateData,
            modifiedBy: userId,
            modifiedAt: new Date(),
          };
        }
        if (updateData.status !== "published") {
          const canTakeSnapshot =
            !existingVote.history ||
            existingVote.history.length === 0 ||
            existingVote.snapshotSource === "edited";
          const noHistory =
            !existingVote.history || existingVote.history.length === 0;
          if (canTakeSnapshot && noHistory) {
            const currentState = existingVote.toObject();
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
            updateOperations.$set = updateOperations.$set || {};
            updateOperations.$set.snapshotSource = "edited";
          } else if (existingVote.snapshotSource === "deleted_pending_update") {
            updateOperations.$set = updateOperations.$set || {};
            updateOperations.$set.snapshotSource = "edited";
          }
        }
        const updatedVote = await Vote.findByIdAndUpdate(
          voteID,
          updateOperations,
          { new: true }
        ).populate("termId");

        if (!updatedVote) {
          return res.status(404).json({ message: "Vote not found" });
        }

        res.status(200).json({
          message: "Vote updated successfully",
          info: updatedVote,
        });
      });
    } catch (error) {
      res.status(500).json({
        message: "Error updating vote",
        error: error.message,
      });
    }
  }

  static async discardVoteChanges(req, res) {
    try {
      const { discardChanges } = require("../helper/discardHelper");

      const restoredVote = await discardChanges({
        model: Vote,
        documentId: req.params.id,
        userId: req.user?._id,
        options: { new: true, populate: "termId" },
      });

      res.status(200).json({
        message: "Restored to original state and history cleared",
        info: restoredVote,
      });
    } catch (error) {
      res.status(500).json({
        message: "Failed to discard changes",
        error: error.message,
      });
    }
  }
  static async deleteVote(req, res) {
    try {
      const voteId = req.params.id;
      const vote = await Vote.findById(voteId);
      if (!vote) {
        return res.status(404).json({ message: "Vote not found" });
      }
      let historyCleared = false;
      const senatorDataResult = await SenatorData.updateMany(
        {
          $or: [
            { "votesScore.voteId": voteId },
            { "pastVotesScore.voteId": voteId },
          ],
        },
        {
          $pull: {
            votesScore: { voteId },
            pastVotesScore: { voteId },
          },
        }
      );
      const repDataResult = await RepresentativeData.updateMany(
        {
          $or: [
            { "votesScore.voteId": voteId },
            { "pastVotesScore.voteId": voteId },
          ],
        },
        {
          $pull: {
            votesScore: { voteId },
            pastVotesScore: { voteId },
          },
        }
      );
      const senators = await Senator.find({
        $or: [
          {
            "editedFields.name": vote.title,
            "editedFields.field": "votesScore",
          },
          {
            "editedFields.name": vote.title,
            "editedFields.field": "pastVotesScore",
          },
        ],
      });
     for (const senator of senators) {
  await cleanupPersonAfterDelete({
    person: senator,
    title: vote.title,
    fieldType: "votesScore",
    model: Senator,
  });
  await cleanupPersonAfterDelete({
    person: senator,
    title: vote.title,
    fieldType: "pastVotesScore",
    model: Senator,
  });
}
      const representatives = await Representative.find({
        $or: [
          {
            "editedFields.name": vote.title,
            "editedFields.field": "votesScore",
          },
          {
            "editedFields.name": vote.title,
            "editedFields.field": "pastVotesScore",
          },
        ],
      });
     for (const rep of representatives) {
  await cleanupPersonAfterDelete({
    person: rep,
    title: vote.title,
    fieldType: "votesScore",
    model: Representative,
  });
  await cleanupPersonAfterDelete({
    person: rep,
    title: vote.title,
    fieldType: "pastVotesScore",
    model: Representative,
  });
}
      await Vote.findByIdAndDelete(voteId);

      res.status(200).json({
        message: "Vote and its references deleted successfully",
        deletedVoteId: voteId,
      });
    } catch (error) {
      console.error(" Error deleting vote:", error);
      res.status(500).json({
        message: "Error deleting vote and its references",
        error: error.message,
      });
    }
  }
  static async updateVoteStatus(req, res) {
    try {
      const { status } = req.body;

      if (!["draft", "published", "under review"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const updatedVote = await Vote.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true }
      );

      if (!updatedVote) {
        return res.status(404).json({ message: "Vote not found" });
      }

      res
        .status(200)
        .json({ message: "Status updated successfully", vote: updatedVote });
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error updating vote status", error: error.message });
    }
  }
  static async togglePublishStatus(req, res) {
    try {
      const { id } = req.params;
      const { published } = req.body;

      if (typeof published !== "boolean") {
        return res
          .status(400)
          .json({ message: "published must be true or false" });
      }

      const updatedVote = await Vote.findByIdAndUpdate(
        id,
        { published },
        { new: true }
      ).populate("termId");

      if (!updatedVote) {
        return res.status(404).json({ message: "Vote not found" });
      }

      res.status(200).json({
        message: `Vote ${published ? "published" : "set to draft"}`,
        vote: updatedVote,
      });
    } catch (error) {
      res.status(500).json({
        message: "Error toggling publish status",
        error: error.message,
      });
    }
  }
}

module.exports = voteController;
