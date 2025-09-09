const Vote = require("../models/voteSchema");
const upload = require("../middlewares/fileUploads");
const Term = require("../models/termSchema");
const { buildSupportData } = require("../helper/supportDataHelper");
const { VOTE_PUBLIC_FIELDS } = require("../constants/projection");
const {
  applyCommonFilters,
  applyTermFilter,
  applyCongressFilter,
  applyChamberFilter,
} = require("../middlewares/filter");
const senatorDataSchema = require("../models/senatorDataSchema");
const representativeDataSchema = require("../models/representativeDataSchema");
class voteController {
  // Create a new vote with file upload for readMore

  static async createVote(req, res) {
    // Use multer to handle the file upload
    upload.single("readMore")(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ message: err.message });
      }

      try {
        // Extract other fields from the body
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

        // Get the uploaded file path (null if no file is uploaded)
        const readMore = req.file
          ? `/${req.file.path.replace(/\\/g, "/").replace(/^\.\//, "")}` // Convert Windows path to URL format
          : null;

        // Create a new vote document
        const newVote = new Vote({
          type,
          title,
          shortDesc,
          longDesc,
          rollCall,
          readMore, // Attach the file path if a file is uploaded
          date,
          congress,
          termId,
          sbaPosition,
          status: "draft", // Default status
        });

        // Save the new vote to the database
        await newVote.save();

        // Send a successful response with the created vote data
        res
          .status(201)
          .json({ message: "Vote created successfully", info: newVote });
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error creating vote", error: error.message });
      }
    });
  }

  // Get all votes with populated termId
  // Get all votes with optional filtering by 'published' and populated termId
  // static async getAllVotes(req, res) {
  //   try {
  //     let filter = {};

  //     // Apply common filters
  //     filter = applyCommonFilters(req, filter);

  //     // Apply term-based filters
  //     filter = applyTermFilter(req, filter);

  //     // Apply congress filter
  //     filter = applyCongressFilter(req, filter);

  //     // Apply chamber filter (for votes)
  //     filter = applyChamberFilter(req, filter, true);

  //     const votes = await Vote.find(filter)
  //       .select(VOTE_PUBLIC_FIELDS)
  //       .sort({ date: -1, createdAt: -1 })
  //       .lean();

  //     res.status(200).json(votes);
  //   } catch (error) {
  //     res.status(500).json({
  //       message: "Error retrieving votes",
  //       error: error.message,
  //     });
  //   }
  // }
  static async getAllVotes(req, res) {
    try {
      const votes = await Vote.find({})
        .select(VOTE_PUBLIC_FIELDS) // projection fields
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

      // Apply other filters (congress, term, chamber, etc.)
      filter = applyTermFilter(req, filter);
      filter = applyCongressFilter(req, filter);
      filter = applyChamberFilter(req, filter, true);

      // Main aggregation
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
                  $mergeObjects: [
                    "$history.oldData", // snapshot
                    { _id: "$_id" }, // keep parent _id
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

  // Controller to bulk update SBA Position for multiple votes
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

  // Controller to update a vote
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

        // Parse fields if needed
        if (typeof updateData.editedFields === "string") {
          updateData.editedFields = JSON.parse(updateData.editedFields);
        }
        if (typeof updateData.fieldEditors === "string") {
          updateData.fieldEditors = JSON.parse(updateData.fieldEditors);
        }

        // Initialize update operations object
        const updateOperations = {};

        // Handle publishing case
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
          // For non-publishing updates
          updateOperations.$set = {
            ...updateData,
            modifiedBy: userId,
            modifiedAt: new Date(),
          };
        }

        // Handle history snapshot - only if not publishing
        if (updateData.status !== "published") {
          const canTakeSnapshot =
            !existingVote.history ||
            existingVote.history.length === 0 ||
            existingVote.snapshotSource === "edited";
          const noHistory =
            !existingVote.history || existingVote.history.length === 0;
          if (canTakeSnapshot && noHistory) {
            const currentState = existingVote.toObject();

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
              actionType: "update",
            };

            // Add to update operations
            updateOperations.$push = { history: historyEntry };
            updateOperations.$set = updateOperations.$set || {};
            updateOperations.$set.snapshotSource = "edited";
          } else if (existingVote.snapshotSource === "deleted_pending_update") {
            updateOperations.$set = updateOperations.$set || {};
            updateOperations.$set.snapshotSource = "edited";
          }
        }

        // Update the vote in the database
        const updatedVote = await Vote.findByIdAndUpdate(
          voteID,
          updateOperations, // Use the constructed operations object
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

  //Delete a vote by ID and remove its references from senator and representative data
  static async deleteVote(req, res) {
    try {
      const voteId = req.params.id;

      // First check if vote exists
      const vote = await Vote.findById(voteId);
      if (!vote) {
        return res.status(404).json({ message: "Vote not found" });
      }

      // Get the models for senator and representative data
      const SenatorData = require("../models/senatorDataSchema");
      const RepresentativeData = require("../models/representativeDataSchema");

      // Remove vote references from senator data
      await SenatorData.updateMany(
        { "votesScore.voteId": voteId },
        { $pull: { votesScore: { voteId: voteId } } }
      );

      // Remove vote references from representative data
      await RepresentativeData.updateMany(
        { "votesScore.voteId": voteId },
        { $pull: { votesScore: { voteId: voteId } } }
      );

      // Delete the vote
      await Vote.findByIdAndDelete(voteId);

      res.status(200).json({
        message: "Vote and its references deleted successfully",
        deletedVoteId: voteId,
      });
    } catch (error) {
      res.status(500).json({
        message: "Error deleting vote and its references",
        error: error.message,
      });
    }
  }

  // Update status (draft/published)
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

  //admin only toggle published status

  // Toggle publish status - Admin only
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
