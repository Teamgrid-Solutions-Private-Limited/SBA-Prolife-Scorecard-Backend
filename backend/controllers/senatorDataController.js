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
      const senatorDataList = await SenatorData.find({ senateId: senatorId }).lean();

      // 4. Save snapshot to previousState
      const currentState = senator.toObject();
      delete currentState._id;
      delete currentState.createdAt;
      delete currentState.updatedAt;
      delete currentState.__v;
      delete currentState.previousState; // <-- Prevents nesting!
      currentState.senatorData = senatorDataList;
      await Senator.findByIdAndUpdate(senatorId, {
        previousState: currentState,
        snapshotSource: "deleted_pending_update",
      });
      console.log("Senator previousState before deletion:", currentState.senatorData); // -- Add this line

      // 5. Now delete the SenatorData
      await SenatorData.findByIdAndDelete(req.params.id);

      res.status(200).json({ message: "Senator data deleted successfully", data: senatorDataToDelete });
    } catch (error) {
      res.status(500).json({ message: "Error deleting senator data", error });
    }
  }
  // static async deleteSenatorData(req, res) {
  //   try {
  //     const deletedSenatorData = await SenatorData.findByIdAndDelete(
  //       req.params.id
  //     );

  //     if (!deletedSenatorData) {
  //       return res.status(404).json({ message: "Senator data not found" });
  //     }

  //     res.status(200).json({ message: "Senator data deleted successfully" });
  //   } catch (error) {
  //     res.status(500).json({ message: "Error deleting senator data", error });
  //   }
  // }

  // Get senator data by senator ID with populated termId and senatorId
  static async getSenatorDataBySenatorId(req, res) {
    try {
      const senateId = req.params.id;
      const senatorData = await SenatorData.find({ senateId })
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
}

module.exports = senatorDataController;
