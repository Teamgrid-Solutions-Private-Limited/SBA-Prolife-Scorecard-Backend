const Activity = require("../models/activitySchema");
const upload = require("../middlewares/fileUploads");

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
}

module.exports = activityController;
