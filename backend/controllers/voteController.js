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
const Senator = require("../models/senatorSchema");
const Representative = require("../models/representativeSchema");
const SenatorData = require("../models/senatorDataSchema");
const RepresentativeData = require("../models/representativeDataSchema");
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

 
  static async deleteVote(req, res) {
  try {
    const voteId = req.params.id;

    // Check if vote exists
    const vote = await Vote.findById(voteId);
    if (!vote) {
      return res.status(404).json({ message: "Vote not found" });
    }
    
    let historyCleared = false;
    
    function makeEditorKey(title, fieldType = "votesScore") {
      if (title.includes('H.R.')) {
        return fieldType + "_" +
          title
            .replace(/H\.R\.\s*(\d+):/g, 'H_R_$1_')  
            .replace(/'/g, '')                        
            .replace(/\s+/g, '_')                    
            .replace(/[^a-zA-Z0-9_]/g, '');           
      }
    
      else if (title.includes('S.')) {
        return fieldType + "_" +
          title
            .replace(/S\.\s*(\d+):/g, 'S_$1_')       
            .replace(/'/g, '')                       
            .replace(/\s+/g, '_')                     
            .replace(/[^a-zA-Z0-9_]/g, '');           
      }
      // For other patterns
      else {
        return fieldType + "_" +
          title
            .replace(/\./g, '')
            .replace(/:/g, '')
            .replace(/'/g, '')
            .replace(/\s+/g, '_')
            .replace(/[^a-zA-Z0-9_]/g, '');
      }
    }


    const senatorDataResult = await SenatorData.updateMany(
      { $or: [
        { "votesScore.voteId": voteId },
        { "pastVotesScore.voteId": voteId }
      ]},
      { $pull: { 
        votesScore: { voteId },
        pastVotesScore: { voteId }
      }}
    );

    const repDataResult = await RepresentativeData.updateMany(
      { $or: [
        { "votesScore.voteId": voteId },
        { "pastVotesScore.voteId": voteId }
      ]},
      { $pull: { 
        votesScore: { voteId },
        pastVotesScore: { voteId }
      }}
    );

    const senators = await Senator.find({
      $or: [
        { "editedFields.name": vote.title, "editedFields.field": "votesScore" },
        { "editedFields.name": vote.title, "editedFields.field": "pastVotesScore" }
      ]
    });

    for (const senator of senators) {

      // Remove matching editedFields for both votesScore and pastVotesScore
      const beforeCount = senator.editedFields.length;
      senator.editedFields = senator.editedFields.filter((f) =>
        !(f.name === vote.title && f.field && 
          (f.field.includes("votesScore") || f.field.includes("pastVotesScore")))
      );
      const afterCount = senator.editedFields.length;
      const removedCount = beforeCount - afterCount;
      if (removedCount > 0) {
      }

      // Clean up fieldEditors for both votesScore and pastVotesScore
      let fieldEditorDeleted = false;
      
      // Check for votesScore field editor
      const votesScoreEditorKey = makeEditorKey(vote.title, "votesScore");
      
      // Check for pastVotesScore field editor
      const pastVotesScoreEditorKey = makeEditorKey(vote.title, "pastVotesScore");

      // Convert fieldEditors to plain object
      let fieldEditorsPlain = {};
      if (senator.fieldEditors) {
        try {
          fieldEditorsPlain = JSON.parse(JSON.stringify(senator.fieldEditors));
        } catch (error) {
          fieldEditorsPlain = {};
          for (const key in senator.fieldEditors) {
            if (!key.startsWith('$__') && key !== '_id' && key !== '__v') {
              fieldEditorsPlain[key] = senator.fieldEditors[key];
            }
          }
        }
      }

      const actualKeys = Object.keys(fieldEditorsPlain);

      // Function to delete field editor with various matching strategies
      const deleteFieldEditor = (targetKey) => {
        // 1. First try exact match
        if (fieldEditorsPlain[targetKey]) {
          delete fieldEditorsPlain[targetKey];
          return true;
        }
        // 2. Try case-insensitive match
        else {
          const foundKey = actualKeys.find(key => key.toLowerCase() === targetKey.toLowerCase());
          if (foundKey) {
            delete fieldEditorsPlain[foundKey];
            return true;
          }
          // 3. Try pattern matching for H.R. vs HR differences
          else {
            const normalizedTargetKey = targetKey.replace(/_/g, '');
            const foundPatternKey = actualKeys.find(key => {
              const normalizedKey = key.replace(/_/g, '');
              return normalizedKey === normalizedTargetKey;
            });

            if (foundPatternKey) {
              delete fieldEditorsPlain[foundPatternKey];
              return true;
            }
            // 4. Try partial match (for apostrophe differences etc)
            else {
              const partialMatch = actualKeys.find(key => {
                // Remove all non-alphanumeric characters and compare
                const cleanKey = key.replace(/[^a-zA-Z0-9]/g, '');
                const cleanTargetKey = targetKey.replace(/[^a-zA-Z0-9]/g, '');
                return cleanKey === cleanTargetKey;
              });

              if (partialMatch) {
                delete fieldEditorsPlain[partialMatch];
                return true;
              } else {
                return false;
              }
            }
          }
        }
      };

      // Delete both types of field editors
      const votesScoreDeleted = deleteFieldEditor(votesScoreEditorKey);
      const pastVotesScoreDeleted = deleteFieldEditor(pastVotesScoreEditorKey);
      
      fieldEditorDeleted = votesScoreDeleted || pastVotesScoreDeleted;

      if (fieldEditorDeleted) {
        senator.fieldEditors = fieldEditorsPlain;
      }

      // If no editedFields left
      if (senator.editedFields.length === 0) {
        if (Array.isArray(senator.history) && senator.history.length > 0) {
          // Restore from last history
          const lastHistory = senator.history[senator.history.length - 1];
          const restoredStatus = lastHistory.oldData?.publishStatus || lastHistory.publishStatus;
          if (restoredStatus) {
            senator.publishStatus = restoredStatus;

            //  Clear history if it's only a published snapshot
            if (
              senator.history.length === 1 &&
              (lastHistory.oldData?.publishStatus === "published" ||
                lastHistory.publishStatus === "published")
            ) {
              senator.history = [];
              historyCleared = true;
            }
          }
        } else {
          // No history → mark as draft
          senator.publishStatus = "draft";
        }
      }

      // Use updateOne instead of save to avoid validation errors
      const updateData = {};
      if (removedCount > 0) updateData.editedFields = senator.editedFields;
      if (fieldEditorDeleted) updateData.fieldEditors = senator.fieldEditors;
      if (senator.publishStatus !== undefined) updateData.publishStatus = senator.publishStatus;
      if (historyCleared) updateData.history = [];
      
      if (Object.keys(updateData).length > 0) {
        await Senator.updateOne(
          { _id: senator._id },
          { $set: updateData }
        );
      } else {
      }
    }

    const representatives = await Representative.find({
      $or: [
        { "editedFields.name": vote.title, "editedFields.field": "votesScore" },
        { "editedFields.name": vote.title, "editedFields.field": "pastVotesScore" }
      ]
    });

    for (const rep of representatives) {

      let removedCount = 0;
      let historyCleared = false;   // <-- reset flag per rep

      // Remove matching editedFields for both votesScore and pastVotesScore
      if (rep.editedFields && rep.editedFields.length > 0) {
        const beforeCount = rep.editedFields.length;
        rep.editedFields = rep.editedFields.filter((f) =>
          !(f.name === vote.title && f.field && 
            (f.field.includes("votesScore") || f.field.includes("pastVotesScore")))
        );
        removedCount = beforeCount - rep.editedFields.length;
        if (removedCount > 0) {
        }
      }

      // Clean up fieldEditors for both votesScore and pastVotesScore
      let fieldEditorDeleted = false;
      
      // Check for votesScore field editor
      const votesScoreEditorKey = makeEditorKey(vote.title, "votesScore");
      
      // Check for pastVotesScore field editor
      const pastVotesScoreEditorKey = makeEditorKey(vote.title, "pastVotesScore");

      // Convert fieldEditors to plain object
      let repFieldEditorsPlain = {};
      if (rep.fieldEditors) {
        try {
          repFieldEditorsPlain = JSON.parse(JSON.stringify(rep.fieldEditors));
        } catch (error) {
          repFieldEditorsPlain = {};
          for (const key in rep.fieldEditors) {
            if (!key.startsWith('$__') && key !== '_id' && key !== '__v') {
              repFieldEditorsPlain[key] = rep.fieldEditors[key];
            }
          }
        }
      }

      const repActualKeys = Object.keys(repFieldEditorsPlain);

      // Function to delete field editor with various matching strategies
      const deleteRepFieldEditor = (targetKey) => {
        if (repFieldEditorsPlain[targetKey]) {
          delete repFieldEditorsPlain[targetKey];
          return true;
        }
        else {
          const foundKey = repActualKeys.find(key => key.toLowerCase() === targetKey.toLowerCase());
          if (foundKey) {
            delete repFieldEditorsPlain[foundKey];
            return true;
          }
          else {
            const normalizedTargetKey = targetKey.replace(/_/g, '');
            const foundPatternKey = repActualKeys.find(key => {
              const normalizedKey = key.replace(/_/g, '');
              return normalizedKey === normalizedTargetKey;
            });

            if (foundPatternKey) {
              delete repFieldEditorsPlain[foundPatternKey];
              return true;
            }
            else {
              const partialMatch = repActualKeys.find(key => {
                // Remove all non-alphanumeric characters and compare
                const cleanKey = key.replace(/[^a-zA-Z0-9]/g, '');
                const cleanTargetKey = targetKey.replace(/[^a-zA-Z0-9]/g, '');
                return cleanKey === cleanTargetKey;
              });

              if (partialMatch) {
                delete repFieldEditorsPlain[partialMatch];
                return true;
              } else {
                return false;
              }
            }
          }
        }
      };

      // Delete both types of field editors
      const votesScoreDeleted = deleteRepFieldEditor(votesScoreEditorKey);
      const pastVotesScoreDeleted = deleteRepFieldEditor(pastVotesScoreEditorKey);
      
      fieldEditorDeleted = votesScoreDeleted || pastVotesScoreDeleted;

      if (fieldEditorDeleted) {
        rep.fieldEditors = repFieldEditorsPlain;
      }

      // If no editedFields left
      if (rep.editedFields.length === 0) {
        if (Array.isArray(rep.history) && rep.history.length > 0) {
          const lastHistory = rep.history[rep.history.length - 1];
          const restoredStatus = lastHistory.oldData?.publishStatus || lastHistory.publishStatus;
          if (restoredStatus) {
            rep.publishStatus = restoredStatus;

            //  Clear history if it's only a published snapshot
            if (
              rep.history.length === 1 &&
              (lastHistory.oldData?.publishStatus === "published" ||
                lastHistory.publishStatus === "published")
            ) {
              rep.history = [];
              historyCleared = true;
            }
          }
        } else {
          rep.publishStatus = "draft";
        }
      }

      // Only update if something changed
      const updateData = {};
      if (removedCount > 0) updateData.editedFields = rep.editedFields;
      if (fieldEditorDeleted) updateData.fieldEditors = rep.fieldEditors;
      if (rep.publishStatus !== undefined) updateData.publishStatus = rep.publishStatus;
      if (historyCleared) updateData.history = [];

      if (Object.keys(updateData).length > 0) {
        await Representative.updateOne(
          { _id: rep._id },
          { $set: updateData }
        );
      } else {
      }
    }

    await Vote.findByIdAndDelete(voteId);

    res.status(200).json({
      message: "Vote and its references deleted successfully",
      deletedVoteId: voteId,
    });
  } catch (error) {
    console.error("❌ Error deleting vote:", error);
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
