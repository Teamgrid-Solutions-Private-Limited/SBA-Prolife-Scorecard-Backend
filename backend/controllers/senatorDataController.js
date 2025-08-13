const SenatorData = require("../models/senatorDataSchema");
const Senator = require("../models/senatorSchema");
class senatorDataController {
  // Create a new senator data
  static async createSenatorData(req, res) {
    try {
      const {
        senateId,
        termId,
        currentTerm,
        summary,
        rating,
        votesScore,
        activitiesScore,
      } = req.body;

      const newSenatorData = new SenatorData({
        senateId,
        termId,
        currentTerm,
        summary,
        rating,
        votesScore,
        activitiesScore,
      });

      // Save the senator data to the database
      await newSenatorData.save();

      res.status(201).json(newSenatorData);
    } catch (error) {
      res.status(500).json({ message: "Error creating senator data", error });
    }
  }

  // Get all senator data with populated votesScore and activitiesScore
  static async getAllSenatorData(req, res) {
    try {
      const senatorData = await SenatorData.find()
        .populate("votesScore.voteId")
        .populate("activitiesScore.activityId");

      res.status(200).json(senatorData);
    } catch (error) {
      res.status(500).json({ message: "Error retrieving senator data", error });
    }
  }

  // Get senator data by ID with populated votesScore and activitiesScore
  static async getSenatorDataById(req, res) {
    try {
      const senatorData = await SenatorData.findById(req.params.id)
        .populate("votesScore.voteId")
        .populate("activitiesScore.activityId");

      if (!senatorData) {
        return res.status(404).json({ message: "Senator data not found" });
      }

      res.status(200).json(senatorData);
    } catch (error) {
      res.status(500).json({ message: "Error retrieving senator data", error });
    }
  }

  // Update senator data by ID
  static async updateSenatorData(req, res) {
    try {
      const { termId, senateId } = req.body;

      //  Manual check: If termId is missing or an empty string
      if (!termId || termId.toString().trim() === "") {
        return res.status(400).json({ message: "Term is required" });
      }

      //  Optional manual check for senateId too
      if (!senateId || senateId.toString().trim() === "") {
        return res.status(400).json({ message: "Senate ID is required" });
      }

      //  Load the document first so we can validate on save
      const existing = await SenatorData.findById(req.params.id);

      if (!existing) {
        return res.status(404).json({ message: "Senator data not found" });
      }

      // Apply updates from the request
      Object.assign(existing, req.body);

      //  Trigger Mongoose validation
      const updated = await existing.save();

      res.status(200).json(updated);
    } catch (error) {
      //  Catch schema validation errors from Mongoose
      if (error.name === "ValidationError") {
        const messages = Object.values(error.errors).map((err) => err.message);
        return res.status(400).json({ message: messages.join(", ") });
      }

      //  Catch unexpected errors
      res.status(500).json({
        message: error.message || "Error updating senator data",
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      });
    }
  }

  // Delete senator data by ID
  static async deleteSenatorData(req, res) {
    try {
      // 1. Find the SenatorData to be deleted
      const senatorDataToDelete = await SenatorData.findById(req.params.id);
      if (!senatorDataToDelete) {
        return res.status(404).json({ message: "Senator data not found" });
      }

      // 2. Find the parent senator
      const senatorId = senatorDataToDelete.senateId;
      const senator = await Senator.findById(senatorId);
      if (!senator) {
        return res.status(404).json({ message: "Senator not found" });
      }

      // 3. Fetch all current SenatorData for this senator (before deletion)
      const senatorDataList = await SenatorData.find({
        senateId: senatorId,
      }).lean();

      // 4. Prepare current state for history
      const { _id, createdAt, updatedAt, __v, history, ...currentState } =
        senator.toObject();
      const stateWithData = {
        ...currentState,
        senatorData: senatorDataList,
      };

      // 5. Create history entry for the deletion
      const historyEntry = {
        oldData: stateWithData,
        timestamp: new Date(),
        actionType: "delete",
        deletedDataId: req.params.id, // Store the ID of the deleted data
        deletedData: senatorDataToDelete.toObject(), // Store the actual deleted data
      };

      // 6. Update senator with history and delete the data
      await Promise.all([
        Senator.findByIdAndUpdate(senatorId, {
          $push: { history: historyEntry },
          snapshotSource: "deleted_pending_update",
        }),
        SenatorData.findByIdAndDelete(req.params.id),
      ]);

      res.status(200).json({
        message: "Senator data deleted successfully",
        data: senatorDataToDelete,
      });
    } catch (error) {
      res.status(500).json({
        message: "Error deleting senator data",
        error: error.message,
      });
    }
  }

  static async getSenatorDataBySenatorId(req, res) {
    try {
      const senateId = req.params.id;
      const senatorData = await SenatorData.find({ senateId })
        .sort({ createdAt: 1 })
        .populate("termId")
        .populate("senateId")
        .populate("votesScore.voteId")
        .populate("activitiesScore.activityId");

      if (!senatorData) {
        return res.status(404).json({ message: "Senator data not found" });
      }

      res
        .status(200)
        .json({ message: "Retrive successfully", info: senatorData });
    } catch (error) {
      res.status(500).json({
        message: "Error retrieving senator data",
        error: error.message,
      });
    }
  }

  ////frontend ui display
  static async SenatorDataBySenatorId(req, res) {
    try {
      const senateId = req.params.id;

      // Fetch all terms for this senator
      const senatorData = await SenatorData.find({ senateId })
        .populate("termId")
        .populate("senateId")
        .populate("votesScore.voteId")
        .populate("activitiesScore.activityId");

      if (!senatorData.length) {
        return res.status(404).json({ message: "Senator data not found" });
      }

      // Sort: currentTerm first, then latest by createdAt
      const sortedData = senatorData.sort((a, b) => {
        if (a.currentTerm && !b.currentTerm) return -1;
        if (!a.currentTerm && b.currentTerm) return 1;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });

      // Senator details from the latest record (first after sorting)
      const latestSenatorDetails = sortedData[0].senateId;

      // Remove senateId from term records
      const termData = sortedData.map((term) => {
        const { senateId, ...rest } = term.toObject();
        return rest;
      });

      res.status(200).json({
        message: "Retrieved successfully",
        senator: latestSenatorDetails,
        terms: termData,
      });
    } catch (error) {
      res.status(500).json({
        message: "Error retrieving senator data",
        error: error.message,
      });
    }
  }
}

module.exports = senatorDataController;
