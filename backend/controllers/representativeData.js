const HouseData = require("../models/representativeDataSchema");
const House = require("../models/representativeSchema");

class houseDataController {
  // Create a new house data
  static async createHouseData(req, res) {
    try {
      const {
        houseId,
        termId,
        currentTerm,
        summary,
        rating,
        votesScore,
        activitiesScore,
      } = req.body;

      const newHouseData = new HouseData({
        houseId,
        termId,
        currentTerm,
        summary,
        rating,
        votesScore,
        activitiesScore,
      });

      // Save the house data to the database
      await newHouseData.save();

      res
        .status(201)
        .json({ message: "house data added succssfully", info: newHouseData });
    } catch (error) {
      res.status(500).json({ message: "Error creating house data", error });
    }
  }

  // Get all house data with populated votesScore and activitiesScore
  static async getAllHouseData(req, res) {
    try {
      const houseData = await HouseData.find()
        .populate("votesScore.voteId")
        .populate("activitiesScore.activityId");

      res.status(200).json(houseData);
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error retrieving house data", error: error.message });
    }
  }

  // Get house data by ID with populated votesScore and activitiesScore
  static async getHouseDataById(req, res) {
    try {
      const houseData = await HouseData.findById(req.params.id)
        .populate("votesScore.voteId")
        .populate("activitiesScore.activityId");

      if (!houseData) {
        return res.status(404).json({ message: "House data not found" });
      }

      res.status(200).json(houseData);
    } catch (error) {
      res
        .status(500)
        .json({
          message: "Error retrieving  house data",
          error: error.message,
        });
    }
  }

  // Update house data by ID
  static async updateHouseData(req, res) {
    try {
      const { termId, houseId } = req.body;

      //  Validate termId
      if (!termId || termId.toString().trim() === "") {
        return res.status(400).json({ message: "Term is required" });
      }

      //  Optional: Validate houseId
      if (!houseId || houseId.toString().trim() === "") {
        return res.status(400).json({ message: "houseId is required" });
      }

      //  Find the existing document
      const existing = await HouseData.findById(req.params.id);

      if (!existing) {
        return res.status(404).json({ message: "House data not found" });
      }

      //  Apply the updates
      Object.assign(existing, req.body);

      //  Save to trigger schema validation
      const updated = await existing.save();

      res.status(200).json(updated);
    } catch (error) {
      //  Handle schema validation errors
      if (error.name === "ValidationError") {
        const messages = Object.values(error.errors).map((err) => err.message);
        return res.status(400).json({ message: messages.join(", ") });
      }

      res.status(500).json({
        message: error.message || "Error updating house data",
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      });
    }
  }

  // Delete house data by ID
  static async deleteHouseData(req, res) {
    try {
      const deletedHouseData = await HouseData.findById(req.params.id);

      if (!deletedHouseData) {
        return res.status(404).json({ message: "house data not found" });
      }
          // 2. Find the parent senator
      const houseId = deletedHouseData.houseId;
      const house = await House.findById(houseId);
      if (!house) {
        return res.status(404).json({ message: "House not found" });
      }
 
      // 3. Fetch all current SenatorData for this senator (before deletion)
      const RepresentativeDataList = await HouseData.find({houseId: houseId }).lean();
 
      // 4. Save snapshot to previousState
      const currentState = house.toObject();
      delete currentState._id;
      delete currentState.createdAt;
      delete currentState.updatedAt;
      delete currentState.__v;
      delete currentState.previousState; // <-- Prevents nesting!
      currentState.representativeData= RepresentativeDataList;
      await House.findByIdAndUpdate(houseId, {
        previousState: currentState,
        snapshotSource: "deleted_pending_update",
      });
      console.log("House previousState before deletion:", currentState.houseData); // -- Add this line
 
      // 5. Now delete the HouseData
      await HouseData.findByIdAndDelete(req.params.id);

      res.status(200).json({ message: "house data deleted successfully" });
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error deleting house data", error: error.message });
    }
  }
  static async getHouseDataByHouseId(req, res) {
    try {
      const houseId = req.params.id;
      const houseData = await HouseData.find({ houseId })
        .populate("termId")
        .populate("houseId")
        .populate("votesScore.voteId")
        .populate("activitiesScore.activityId");

      if (!houseData) {
        return res.status(404).json({ message: "house data not found" });
      }

      res
        .status(200)
        .json({ message: "Retrive successfully", info: houseData });
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error retrieving house data", error: error.message });
    }
  }
}

module.exports = houseDataController;
