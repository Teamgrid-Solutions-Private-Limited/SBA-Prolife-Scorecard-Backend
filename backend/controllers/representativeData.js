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

    // First, fetch all terms
    const Term = require('../models/termSchema');
    const allTerms = await Term.find().sort({ startYear: -1 }).lean();

    // Filter and fix terms that are missing congresses
    const validTerms = allTerms.filter(term => {
      // Skip terms that don't have startYear and endYear
      if (!term.startYear || !term.endYear) {
        return false;
      }
      
      // If term has startYear and endYear but no congresses, calculate them
      if (!term.congresses || term.congresses.length === 0) {
        const getCongresses = (startYear, endYear) => {
          if (startYear < 1789 || endYear < 1789) {
            return [];
          }
          
          const congresses = [];
          for (let year = startYear; year < endYear; year++) {
            const congressNumber = Math.floor((year - 1789) / 2) + 1;
            if (!congresses.includes(congressNumber)) {
              congresses.push(congressNumber);
            }
          }
          
          // Rule: If (endYear - startYear) === 2 → should only have 1 congress
          if (endYear - startYear === 2 && congresses.length > 1) {
            congresses.splice(1); // keep only the first congress
          }
          
          return congresses;
        };
        
        term.congresses = getCongresses(term.startYear, term.endYear);
      }
      
      return true;
    });

    // Fetch all HouseData for this representative
    let houseData = await HouseData.find({ houseId })
      .sort({ createdAt: 1 })
      .populate("houseId")
      .populate({
        path: "votesScore.voteId",
        populate: { path: "termId" },
      })
      .populate("activitiesScore.activityId")
      .lean();

    if (!houseData.length) {
      return res.status(404).json({ message: "House data not found" });
    }

    // Get house details from the first record
    const houseDetails = houseData[0].houseId;

    // Collect all activities and votes from all HouseData records
    const allVotes = [];
    const allActivities = [];

    houseData.forEach((hd) => {
      if (hd.votesScore && hd.votesScore.length > 0) {
        allVotes.push(...hd.votesScore);
      }
      if (hd.activitiesScore && hd.activitiesScore.length > 0) {
        allActivities.push(...hd.activitiesScore);
      }
    });

    // Organize terms with their matching activities and votes
    const termsWithData = validTerms.map((term) => {
      const termCongresses = term.congresses || [];

      // Filter votes that match this term's congresses (single congress matching)
      const votesForThisTerm = allVotes.filter(
        (vote) => {
          const voteCongress = vote.voteId?.congress;
          const voteCongressNumber = Number(voteCongress);
          const isMatch = vote.voteId && voteCongress && termCongresses.includes(voteCongressNumber);
          
          return isMatch;
        }
      );

      // Filter activities that match this term's congresses (single congress matching)
      const activitiesForThisTerm = allActivities.filter(
        (activity) => {
          const activityCongress = activity.activityId?.congress;
          const activityCongressNumber = Number(activityCongress);
          const isMatch = activity.activityId && activityCongress && termCongresses.includes(activityCongressNumber);
          
          return isMatch;
        }
      );

      return {
        termId: term,
        votesScore: votesForThisTerm,
        activitiesScore: activitiesForThisTerm,
      };
    });

    // Create separate entries for each activity and vote
    const individualEntries = [];
    
    // Add entries for votes
    allVotes.forEach((vote) => {
      const voteCongress = Number(vote.voteId?.congress);
      // Only match with terms that have exactly one congress value
      const matchingTerm = validTerms.find(term => 
        term.congresses && 
        term.congresses.length === 1 && 
        term.congresses[0] === voteCongress
      );
      
      if (matchingTerm) {
        individualEntries.push({
          termId: matchingTerm,
          votesScore: [vote],
          activitiesScore: [],
          entryType: 'vote'
        });
      }
    });

    // Add entries for activities
    allActivities.forEach((activity) => {
      const activityCongress = Number(activity.activityId?.congress);
      // Only match with terms that have exactly one congress value
      const matchingTerm = validTerms.find(term => 
        term.congresses && 
        term.congresses.length === 1 && 
        term.congresses[0] === activityCongress
      );
      
      if (matchingTerm) {
        individualEntries.push({
          termId: matchingTerm,
          votesScore: [],
          activitiesScore: [activity],
          entryType: 'activity'
        });
      }
    });

    // Remove duplicates (same term with same data)
    const uniqueEntries = individualEntries.filter((entry, index, self) => {
      const firstIndex = self.findIndex(e => 
        e.termId._id.toString() === entry.termId._id.toString() &&
        e.entryType === entry.entryType &&
        e.votesScore.length === entry.votesScore.length &&
        e.activitiesScore.length === entry.activitiesScore.length
      );
      return firstIndex === index;
    });

    // Filter out terms that have no activities or votes
    const termsWithScores = uniqueEntries.filter(
      (term) => {
        const hasData = term.votesScore.length > 0 || term.activitiesScore.length > 0;
        return hasData;
      }
    );

    res.status(200).json({
      message: "Retrieved successfully",
      house: houseDetails,
      terms: termsWithScores,
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
