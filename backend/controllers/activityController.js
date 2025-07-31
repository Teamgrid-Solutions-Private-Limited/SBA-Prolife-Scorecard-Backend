const Activity = require("../models/activitySchema");
const upload = require("../middlewares/fileUploads");
class activityController {
  // Create a new activity with file upload for readMore
  static async createActivity(req, res) {
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
          trackActivities,
        } = req.body;

        // Get the uploaded file path (null if no file is uploaded)
        const readMore = req.file
          ? `/uploads/documents/${req.file.filename}`
          : null;

        // Accept editedFields from the request, default to [] if not provided
        const editedFields = req.body.editedFields || [];
        // Create a new vote document
        const newActivity = new Activity({
          type,
          title,
          shortDesc,
          longDesc,
          rollCall,
          readMore, // Attach the file path if a file is uploaded
          date,
          congress,
          termId,
          trackActivities, // Default status
          status: "draft",
          editedFields,
        });

        // Save the new vote to the database
        await newActivity.save();

        // Send a successful response with the created vote data
        res
          .status(201)
          .json({
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

  // Get all votes with populated termId
  static async getAllActivity(req, res) {
    try {
      const activity = await Activity.find().populate("termId");
      res.status(200).json(activity);
    } catch (error) {
      res.status(500).json({ message: "Error retrieving activity", error });
    }
  }

  // Get a vote by ID with populated termId
  static async getActivityById(req, res) {
    try {
      const activity = await Activity.findById(req.params.id).populate(
        "termId"
      );
      if (!activity) {
        return res.status(404).json({ message: "activity not found" });
      }
      // Always return editedFields in the response
      res.status(200).json(activity);
    } catch (error) {
      res.status(500).json({ message: "Error retrieving activity", error });
    }
  }

  // Update a vote by ID
  static async updateActivity(req, res) {
    try {
      // Use multer to handle file upload
      upload.single("readMore")(req, res, async (err) => {
        if (err) {
          return res.status(400).json({ message: err.message });
        }

        const activityID = req.params.id;
        let updateData = { ...req.body }; // Capture other fields from the request

        // If a new file is uploaded for 'readMore', save the file path
        if (req.file) {
          updateData.readMore = `/uploads/${req.file.filename}`;
        }

        // Accept editedFields from the request if provided
        if (req.body.editedFields) {
          updateData.editedFields = req.body.editedFields;
        }
        
         if (updateData.status === 'published') {
        updateData.editedFields = [];
        updateData.fieldEditors = {};
      }

        // Update the vote in the database
        const updatedActivity = await Activity.findByIdAndUpdate(
          activityID,
          updateData,
          { new: true }
        ).populate("termId"); // Populate the referenced term (optional)

        if (!updatedActivity) {
          return res.status(404).json({ message: "Activity not found" });
        }

        // Send the updated vote in the response
        res
          .status(200)
          .json({
            message: "Activity updated successfully",
            info: updatedActivity,
          });
      });
    } catch (error) {
      res.status(500).json({ message: "Error updating Activity", error });
    }
  }

  // Delete a vote by ID
  static async deleteActivity(req, res) {
    try {
      const deletedActivity = await Activity.findByIdAndDelete(req.params.id);

      if (!deletedActivity) {
        return res.status(404).json({ message: "activity not found" });
      }

      res.status(200).json({ message: "activity deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Error deleting activity", error });
    }
  }

  static async updateActivityStatus(req, res) {
    try {
      const { status } = req.body;
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ message: "Missing activity ID" });
      }

      if (!["draft", "published", "under review"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      // Always clear editedFields if publishing, regardless of request body
      const updateObj = { status };
      if (status === 'published') {
        updateObj.editedFields = [];
      }

      const updatedActivity = await Activity.findByIdAndUpdate(
        id,
        updateObj,
        { new: true, runValidators: true }
      );

      if (!updatedActivity) {
        return res.status(404).json({ message: "Activity not found" });
      }

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

  // Controller to bulk PATCH trackActivities
  static async bulkUpdateTrackActivities(req, res) {
    try {
      const { ids, trackActivities } = req.body;

      // Validate input
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'No activity IDs provided' });
      }

      const validStatuses = ['Pending', 'Completed', 'Failed'];
      if (!validStatuses.includes(trackActivities)) {
        return res.status(400).json({ message: 'Invalid trackActivities value' });
      }

      // Bulk update
      const result = await Activity.updateMany(
        { _id: { $in: ids } },
        { $set: { trackActivities } }
      );

      if (result.modifiedCount === 0) {
        return res.status(404).json({ message: 'No activities were updated' });
      }

      const updatedActivities = await Activity.find({ _id: { $in: ids } });

      res.status(200).json({
        message: `${result.modifiedCount} activities updated successfully`,
        updatedActivities
      });
    } catch (error) {
      res.status(500).json({
        message: 'Error bulk updating activities',
        error: error.message
      });
    }
  }

}

module.exports = activityController;
