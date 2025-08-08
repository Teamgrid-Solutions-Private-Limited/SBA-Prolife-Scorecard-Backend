const Vote = require("../models/voteSchema");
const upload = require("../middlewares/fileUploads");
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
          ? `/uploads/documents/${req.file.filename}`
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
  static async getAllVotes(req, res) {
    try {
      const filter = {};

      // Check if query param is present and valid
      if (req.query.published === "true") {
        filter.published = true;
      } else if (req.query.published === "false") {
        filter.published = false;
      }

      const votes = await Vote.find(filter).populate("termId");
      res.status(200).json(votes);
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error retrieving votes", error: error.message });
    }
  }

  // Get a vote by ID with populated termId
  static async getVoteById(req, res) {
    try {
      const vote = await Vote.findById(req.params.id).populate("termId");
      if (!vote) {
        return res.status(404).json({ message: "Vote not found" });
      }
      res.status(200).json(vote);
    } catch (error) {
      res.status(500).json({ message: "Error retrieving vote", error });
    }
  }

  // Controller to bulk update SBA Position for multiple votes
  static async bulkUpdateSbaPosition(req, res) {
    try {
      const { ids, sbaPosition } = req.body;

      // Validate input
      if (!ids || !Array.isArray(ids)) {
        return res.status(400).json({ message: "Invalid bill IDs provided" });
      }

      if (sbaPosition !== "Yes" && sbaPosition !== "No") {
        return res.status(400).json({ message: "Invalid SBA Position value" });
      }

      // Update all matching votes
      const result = await Vote.updateMany(
        { _id: { $in: ids } },
        { $set: { sbaPosition } },
        { new: true }
      );

      if (result.modifiedCount === 0) {
        return res
          .status(404)
          .json({ message: "No matching bills found or no changes made" });
      }

      // Get the updated votes to return
      const updatedVotes = await Vote.find({ _id: { $in: ids } }).populate(
        "termId"
      ); // Populate the referenced term if needed

      res.status(200).json({
        message: `${result.modifiedCount} bills updated successfully`,
        updatedBills: updatedVotes,
      });
    } catch (error) {
      res.status(500).json({
        message: "Error bulk updating bills",
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
        return VoteController.discardVoteChanges(req, res);
      }

      const existingVote = await Vote.findById(voteID);
      if (!existingVote) {
        return res.status(404).json({ message: 'Vote not found' });
      }

      // Parse fields if needed
      if (typeof updateData.editedFields === 'string') {
        updateData.editedFields = JSON.parse(updateData.editedFields);
      }
      if (typeof updateData.fieldEditors === 'string') {
        updateData.fieldEditors = JSON.parse(updateData.fieldEditors);
      }

      // Initialize update operations object
      const updateOperations = {};

      // Handle publishing case
      if (updateData.status === "published") {
        updateOperations.$set = {
          editedFields: [],
          fieldEditors: {},
          history: [],
          status: "published",
          modifiedBy: userId,
          modifiedAt: new Date()
        };
      } else {
        // For non-publishing updates
        updateOperations.$set = {
          ...updateData,
          modifiedBy: userId,
          modifiedAt: new Date()
        };
      }

      // Handle history snapshot - only if not publishing
      if (updateData.status !== "published") {
        const canTakeSnapshot =
          !existingVote.history ||
          existingVote.history.length === 0 ||
          existingVote.snapshotSource === "edited";

        if (canTakeSnapshot) {
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
            actionType: 'update'
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
        info: updatedVote
      });
    });
  } catch (error) {
    res.status(500).json({
      message: "Error updating vote",
      error: error.message
    });
  }
}

 static async discardVoteChanges(req, res) {
  try {
    const vote = await Vote.findById(req.params.id);
    if (!vote) {
      return res.status(404).json({ message: "Vote not found" });
    }

    // Check if there's any history available
    if (!vote.history || vote.history.length === 0) {
      return res.status(400).json({ message: "No history available to restore" });
    }

    // Get the original state (index 0)
    const originalState = vote.history[0].oldData;

    // Restore the vote to its original state and empty the history
    const restoredVote = await Vote.findByIdAndUpdate(
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
      info: restoredVote
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to discard changes",
      error: error.message,
    });
  }
}

  
       
        

  // Delete a vote by ID
  static async deleteVote(req, res) {
    try {
      const deletedVote = await Vote.findByIdAndDelete(req.params.id);

      if (!deletedVote) {
        return res.status(404).json({ message: "Vote not found" });
      }

      res.status(200).json({ message: "Vote deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Error deleting vote", error });
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
