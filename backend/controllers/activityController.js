const Activity = require("../models/activitySchema");
const upload = require("../middlewares/fileUploads");
const axios = require("axios");
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
}

module.exports = activityController;
