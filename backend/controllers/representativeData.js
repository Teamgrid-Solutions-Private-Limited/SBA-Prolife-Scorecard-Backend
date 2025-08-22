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
      res.status(500).json({
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
    // 1. Find the HouseData to be deleted
    const houseDataToDelete = await HouseData.findById(req.params.id);
    if (!houseDataToDelete) {
      return res.status(404).json({ message: "House data not found" });
    }

    // 2. Find the parent house
    const houseId = houseDataToDelete.houseId;
    const house = await House.findById(houseId);
    if (!house) {
      return res.status(404).json({ message: "House not found" });
    }

    // 3. Fetch all current HouseData for this house (before deletion)
    const houseDataList = await HouseData.find({ houseId: houseId }).lean();

    // 4. Prepare current state for history using object destructuring
    const { _id, createdAt, updatedAt, __v, history, ...currentState } = house.toObject();
    const stateWithData = {
      ...currentState,
      representativeData: houseDataList,
    };

    // 5. Only create history entry if no history exists
    let updateOps = { $set: { snapshotSource: "deleted_pending_update" } };

    if (!house.history || house.history.length === 0) {
      const historyEntry = {
        oldData: stateWithData,
        timestamp: new Date(),
        actionType: "delete",
        deletedDataId: req.params.id,
        deletedData: houseDataToDelete.toObject(),
      };

      updateOps.$push = { history: historyEntry };
    }

    // 6. Update house (with or without history) and delete the data
    await Promise.all([
      House.findByIdAndUpdate(houseId, updateOps),
      HouseData.findByIdAndDelete(req.params.id),
    ]);

    res.status(200).json({
      message: "House data deleted successfully",
      data: houseDataToDelete,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error deleting house data",
      error: error.message,
    });
  }
}
  // static async deleteHouseData(req, res) {
  //   try {
  //     // 1. Find the HouseData to be deleted
  //     const houseDataToDelete = await HouseData.findById(req.params.id);
  //     if (!houseDataToDelete) {
  //       return res.status(404).json({ message: "House data not found" });
  //     }

  //     // 2. Find the parent house
  //     const houseId = houseDataToDelete.houseId;
  //     const house = await House.findById(houseId);
  //     if (!house) {
  //       return res.status(404).json({ message: "House not found" });
  //     }

  //     // 3. Fetch all current HouseData for this house (before deletion)
  //     const houseDataList = await HouseData.find({ houseId: houseId }).lean();

  //     // 4. Prepare current state for history
  //     const currentState = house.toObject();
  //     delete currentState._id;
  //     delete currentState.createdAt;
  //     delete currentState.updatedAt;
  //     delete currentState.__v;
  //     delete currentState.history;
  //     currentState.representativeData = houseDataList;

  //     // 5. Create history entry for the deletion
  //     const historyEntry = {
  //       oldData: currentState,
  //       timestamp: new Date(),
  //       actionType: "delete",
  //       deletedDataId: req.params.id,
  //       deletedData: houseDataToDelete.toObject(),
  //     };

  //     // 6. Update house with history and delete the data
  //     await Promise.all([
  //       House.findByIdAndUpdate(houseId, {
  //         $push: { history: historyEntry },
  //         snapshotSource: "deleted_pending_update",
  //       }),
  //       HouseData.findByIdAndDelete(req.params.id),
  //     ]);

  //     res.status(200).json({
  //       message: "House data deleted successfully",
  //       data: houseDataToDelete,
  //     });
  //   } catch (error) {
  //     res.status(500).json({
  //       message: "Error deleting house data",
  //       error: error.message,
  //     });
  //   }
  // }
  
static async getHouseDataByHouseId(req, res) {
    try {
      const houseId = req.params.id;

      let houseData = await HouseData.find({ houseId })
        .sort({ createdAt: 1 })
        .populate("termId")
        .populate("houseId")
        .populate({
          path: "votesScore.voteId",
          populate: { path: "termId" }, // Also populate vote's termId
        })
        .populate("activitiesScore.activityId")
        .lean(); // Convert to plain JS objects

      // Inject termId from votesScore if missing
      houseData = houseData.map((hd) => {
        if (!hd.termId && hd.votesScore?.length) {
          for (const vote of hd.votesScore) {
            if (vote.voteId?.termId) {
              hd.termId = vote.voteId.termId; // Set from vote
              break;
            }
          }
        }
        return hd;
      });

      if (!houseData.length) {
        return res.status(404).json({ message: "House data not found" });
      }

      res.status(200).json({
        message: "Retrieved successfully",
        info: houseData,
      });
    } catch (error) {
      res.status(500).json({
        message: "Error retrieving house data",
        error: error.message,
      });
    }
  }
  //frontend getRepresentativeDataByHouseId
  // static async HouseDataByHouseId(req, res) {
  //   try {
  //     const houseId = req.params.repId;

  //     // Fetch all terms for this house
  //     const houseData = await HouseData.find({ houseId })
  //       .populate("termId")
  //       .populate("houseId")
  //       .populate("votesScore.voteId")
  //       .populate("activitiesScore.activityId");

  //     if (!houseData.length) {
  //       return res.status(404).json({ message: "House data not found" });
  //     }

  //     // Sort: currentTerm first, then latest by createdAt
  //     let sortedData = houseData.sort((a, b) => {
  //       if (a.currentTerm && !b.currentTerm) return -1;
  //       if (!a.currentTerm && b.currentTerm) return 1;
  //       return new Date(b.createdAt) - new Date(a.createdAt);
  //     });

  //     // If multiple currentTerm entries exist, keep only the latest
  //     const currentTerms = sortedData.filter((d) => d.currentTerm);
  //     if (currentTerms.length > 1) {
  //       const latestCurrentTerm = currentTerms.sort(
  //         (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  //       )[0];
  //       sortedData = [
  //         latestCurrentTerm,
  //         ...sortedData.filter((d) => !d.currentTerm),
  //       ];
  //     }

  //     // House details from the first record
  //     const latestHouseDetails = sortedData[0].houseId;

  //     // Remove houseId from term records
  //     const termData = sortedData.map((term) => {
  //       const { houseId, ...rest } = term.toObject();
  //       return rest;
  //     });

  //     res.status(200).json({
  //       message: "Retrieved successfully",
  //       house: latestHouseDetails,
  //       terms: termData,
  //     });
  //   } catch (error) {
  //     res.status(500).json({
  //       message: "Error retrieving house data",
  //       error: error.message,
  //     });
  //   }
  // }

  //   static async HouseDataByHouseId(req, res) {
  //     try {
  //       const houseId = req.params.repId;

  //       // Fetch all terms for this house
  //       const houseData = await HouseData.find({ houseId })
  //         .populate("termId")
  //         .populate("houseId")
  //         .populate("votesScore.voteId")
  //         .populate("activitiesScore.activityId")
  //         .lean();

  //       if (!houseData.length) {
  //         return res.status(404).json({ message: "House data not found" });
  //       }

  //       // Sort: currentTerm first, then by term start year (or createdAt as fallback)
  //       let sortedData = houseData.sort((a, b) => {
  //         if (a.currentTerm && !b.currentTerm) return -1;
  //         if (!a.currentTerm && b.currentTerm) return 1;
  //         if (a.termId?.startYear && b.termId?.startYear) {
  //           return b.termId.startYear - a.termId.startYear;
  //         }
  //         return new Date(b.createdAt) - new Date(a.createdAt);
  //       });

  //       // House details from the first record
  //       const latestHouseDetails = sortedData[0].houseId;

  //       // Remove houseId field from each term
  //       const termData = sortedData.map(({ houseId, ...rest }) => rest);

  //       res.status(200).json({
  //         message: "Retrieved successfully",
  //         house: latestHouseDetails,
  //         terms: termData, // includes ALL terms, current + past
  //       });
  //     } catch (error) {
  //       res.status(500).json({
  //         message: "Error retrieving house data",
  //         error: error.message,
  //       });
  //     }
  //   }
  // static async HouseDataByHouseId(req, res) {
  //   try {
  //     const houseId = req.params.repId;

  //     // Fetch all terms for this representative (houseId)
  //     const houseData = await HouseData.find({ houseId })
  //       .populate("termId")
  //       .populate("houseId")
  //       .populate("votesScore.voteId")
  //       .populate("activitiesScore.activityId")
  //       .lean();

  //     if (!houseData.length) {
  //       return res.status(404).json({ message: "House data not found" });
  //     }

  //     // Separate currentTerm from past terms
  //     const currentTerm = houseData.find((t) => t.currentTerm);
  //     const pastTerms = houseData
  //       .filter((t) => !t.currentTerm)
  //       .sort((a, b) => {
  //         if (a.termId?.startYear && b.termId?.startYear) {
  //           return b.termId.startYear - a.termId.startYear;
  //         }
  //         return new Date(b.createdAt) - new Date(a.createdAt);
  //       });

  //     // House details come from the first record’s populated houseId
  //     const houseDetails = houseData[0].houseId;

  //     res.status(200).json({
  //       message: "Retrieved successfully",
  //       house: houseDetails,
  //       currentTerm: currentTerm
  //         ? { ...currentTerm, houseId: undefined }
  //         : null,
  //       pastTerms: pastTerms.map(({ houseId, ...rest }) => rest),
  //     });
  //   } catch (error) {
  //     res.status(500).json({
  //       message: "Error retrieving house data",
  //       error: error.message,
  //     });
  //   }
  // }
  static async HouseDataByHouseId(req, res) {
    try {
      const houseId = req.params.repId;

      // Run queries in parallel
      const [currentTerm, pastTerms] = await Promise.all([
        // ✅ Get currentTerm (only one, enforced by index)
        HouseData.findOne({ houseId, currentTerm: true })
          .populate("termId")
          .populate("houseId")
          .populate("votesScore.voteId")
          .populate("activitiesScore.activityId")
          .lean(),

        // ✅ Get past terms, sorted by startYear (or createdAt fallback)
        HouseData.find({ houseId, currentTerm: { $ne: true } })
          .populate("termId")
          .populate("votesScore.voteId")
          .populate("activitiesScore.activityId")
          .sort({ "termId.startYear": -1, createdAt: -1 })
          .lean(),
      ]);

      if (!currentTerm && !pastTerms.length) {
        return res.status(404).json({ message: "House data not found" });
      }

      // ✅ House details from either currentTerm or first pastTerm
      const houseDetails = currentTerm?.houseId || pastTerms[0]?.houseId;

      res.status(200).json({
        message: "Retrieved successfully",
        house: houseDetails,
        currentTerm: currentTerm
          ? { ...currentTerm, houseId: undefined }
          : null,
        pastTerms: pastTerms.map(({ houseId, ...rest }) => rest),
      });
    } catch (error) {
      res.status(500).json({
        message: "Error retrieving house data",
        error: error.message,
      });
    }
  }
}

module.exports = houseDataController;
