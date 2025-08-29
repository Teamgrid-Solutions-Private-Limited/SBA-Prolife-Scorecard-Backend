const HouseData = require("../models/representativeDataSchema");
const House = require("../models/representativeSchema");
 const { getCongresses, isValidTerm } = require("../helper/termUtils")
const mongoose = require("mongoose");
class houseDataController {
  // Create a new house data
  //  static async createHouseData(req, res) {
  //   try {
  //     const {
  //       houseId,
  //       termId,
  //       currentTerm,
  //       summary,
  //       rating,
  //       votesScore,
  //       activitiesScore,
  //     } = req.body;

  //     const newHouseData = new HouseData({
  //       houseId,
  //       termId,
  //       currentTerm,
  //       summary,
  //       rating,
  //       votesScore,
  //       activitiesScore,
  //     });

  //     // Save the house data to the database
  //     await newHouseData.save();

  //     res
  //       .status(201)
  //       .json({ message: "house data added succssfully", info: newHouseData });
  //   } catch (error) {
  //     res.status(500).json({ message: "Error creating house data", error });
  //   }
  // }

  // Create a new house data with termId uniqueness validation
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

      //  Always clean invalid records first (no termId, null, or empty)
      //  Use separate deletes to avoid Mongoose ObjectId casting on empty strings
      let totalDeleted = 0;

      // a) termId missing
      const delMissing = await HouseData.deleteMany({
        houseId,
        termId: { $exists: false },
      });
      totalDeleted += delMissing.deletedCount || 0;

      // b) termId is null
      const delNull = await HouseData.deleteMany({ houseId, termId: null });
      totalDeleted += delNull.deletedCount || 0;

      // c) termId is an empty string — use native driver to avoid cast
      try {
        const nativeDel = await HouseData.collection.deleteMany({
          houseId: new mongoose.Types.ObjectId(houseId),
          termId: "",
        });
        totalDeleted += nativeDel.deletedCount || 0;
      } catch (e) {}

      // Validate required fields
      if (!houseId || !termId || termId.toString().trim() === "") {
        return res.status(400).json({
          message: "houseId and termId are required",
        });
      }

      // Check if a HouseData already exists for this houseId and termId

      const existingHouseData = await HouseData.findOne({ houseId, termId });

      if (existingHouseData) {
        return res.status(409).json({
          message: "House data already exists for this representative and term",
          existingData: existingHouseData,
        });
      }

      // If currentTerm is being set to true, ensure no other currentTerm exists
      if (currentTerm === true) {
        const existingCurrentTerm = await HouseData.findOne({
          houseId,
          currentTerm: true,
        });

        if (existingCurrentTerm) {
          return res.status(409).json({
            message: "A current term already exists for this representative",
            existingCurrentTerm: existingCurrentTerm,
          });
        }
      }

      const newHouseData = new HouseData({
        houseId,
        termId,
        currentTerm,
        summary,
        rating,
        votesScore,
        activitiesScore,
      });

      await newHouseData.save();

      res.status(201).json({
        message: "House data added successfully",
        info: newHouseData,
      });
    } catch (error) {
      if (error.name === "ValidationError") {
        const messages = Object.values(error.errors).map((err) => err.message);
        return res.status(400).json({ message: messages.join(", ") });
      }

      res.status(500).json({
        message: "Error creating house data",
        error: error.message,
      });
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
    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      const { termId, houseId } = req.body;

      //  Validate termId - if it's null/empty, delete the document instead of updating
      if (!termId || termId.toString().trim() === "") {
        // Find and delete the document
        const documentToDelete = await HouseData.findById(
          req.params.id
        ).session(session);

        if (documentToDelete) {
        }

        if (!documentToDelete) {
          await session.abortTransaction();
          session.endSession();
          return res.status(404).json({ message: "House data not found" });
        }

        await HouseData.findByIdAndDelete(req.params.id, { session });

        await session.commitTransaction();
        session.endSession();

        return res.status(200).json({
          message: "House data deleted because termId was null/empty",
          deletedData: documentToDelete,
        });
      }

      //  Optional: Validate houseId
      if (!houseId || houseId.toString().trim() === "") {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: "houseId is required" });
      }

      //  Find the existing document

      const existing = await HouseData.findById(req.params.id).session(session);

      if (existing) {
      }

      if (!existing) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: "House data not found" });
      }

      // Check if termId is being changed to a different value
      const isTermIdChanging = existing.termId.toString() !== termId.toString();

      if (isTermIdChanging) {
        // Check if HouseData already exists for the new houseId + termId combination
        const duplicateHouseData = await HouseData.findOne({
          houseId: existing.houseId, // Use existing houseId to avoid changing it
          termId: termId,
          _id: { $ne: req.params.id }, // Exclude current document
        }).session(session);

        if (duplicateHouseData) {
          await session.abortTransaction();
          session.endSession();
          return res.status(409).json({
            message:
              "House data already exists for this representative and term",
            existingData: duplicateHouseData,
          });
        }
      }

      //  Apply the updates
      Object.assign(existing, req.body);

      //  If currentTerm is being set to true, ensure no other currentTerm exists
      if (existing.currentTerm === true) {
        const existingCurrentTerm = await HouseData.findOne({
          houseId: existing.houseId,
          currentTerm: true,
          _id: { $ne: req.params.id },
        }).session(session);

        if (existingCurrentTerm) {
          // Automatically update the existing currentTerm to false
          await HouseData.findByIdAndUpdate(
            existingCurrentTerm._id,
            { currentTerm: false },
            { session }
          );
        }
      }

      //  Save to trigger schema validation
      const updated = await existing.save({ session });

      await session.commitTransaction();
      session.endSession();

      res.status(200).json({
        message: "House data updated successfully",
        data: updated,
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();

      //  Handle schema validation errors
      if (error.name === "ValidationError") {
        const messages = Object.values(error.errors).map((err) => err.message);

        return res.status(400).json({ message: messages.join(", ") });
      }

      // Handle duplicate key error
      if (error.code === 11000) {
        return res.status(409).json({
          message: "House data already exists for this representative and term",
          error: error.message,
        });
      }

      res.status(500).json({
        message: error.message || "Error updating house data",
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      });
    }
  }

  //Update house data by ID
  // static async updateHouseData(req, res) {
  //   try {
  //     const { termId, houseId } = req.body;

  //     //  Validate termId
  //     if (!termId || termId.toString().trim() === "") {
  //       return res.status(400).json({ message: "Term is required" });
  //     }

  //     //  Optional: Validate houseId
  //     if (!houseId || houseId.toString().trim() === "") {
  //       return res.status(400).json({ message: "houseId is required" });
  //     }

  //     //  Find the existing document
  //     const existing = await HouseData.findById(req.params.id);

  //     if (!existing) {
  //       return res.status(404).json({ message: "House data not found" });
  //     }

  //     //  Apply the updates
  //     Object.assign(existing, req.body);

  //     //  Save to trigger schema validation
  //     const updated = await existing.save();

  //     res.status(200).json(updated);
  //   } catch (error) {
  //     //  Handle schema validation errors
  //     if (error.name === "ValidationError") {
  //       const messages = Object.values(error.errors).map((err) => err.message);
  //       return res.status(400).json({ message: messages.join(", ") });
  //     }

  //     res.status(500).json({
  //       message: error.message || "Error updating house data",
  //       stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
  //     });
  //   }
  // }

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
      const { _id, createdAt, updatedAt, __v, history, ...currentState } =
        house.toObject();
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

  // static async getHouseDataByHouseId(req, res) {
  //   try {
  //     const houseId = req.params.id;

  //     // First, fetch all terms
  //     const Term = require('../models/termSchema');
  //     const allTerms = await Term.find().sort({ startYear: -1 }).lean();

  //     // Filter and fix terms that are missing congresses
  //     const validTerms = allTerms.filter(term => {
  //       // Skip terms that don't have startYear and endYear
  //       if (!term.startYear || !term.endYear) {
  //         return false;
  //       }

  //       //  Only keep ranges like 2023-2024 (odd–even, difference = 1)
  //       const isOddEvenRange =
  //         term.startYear % 2 === 1 &&
  //         term.endYear % 2 === 0 &&
  //         (term.endYear - term.startYear === 1);

  //       if (!isOddEvenRange) {
  //         return false;
  //       }

  //       // If term has startYear and endYear but no congresses, calculate them
  //       if (!term.congresses || term.congresses.length === 0) {
  //         const getCongresses = (startYear, endYear) => {
  //           if (startYear < 1789 || endYear < 1789) {
  //             return [];
  //           }

  //           const congresses = [];
  //           for (let year = startYear; year < endYear; year++) {
  //             const congressNumber = Math.floor((year - 1789) / 2) + 1;
  //             if (!congresses.includes(congressNumber)) {
  //               congresses.push(congressNumber);
  //             }
  //           }

  //           // Rule: If (endYear - startYear) === 2 → should only have 1 congress
  //           if (endYear - startYear === 2 && congresses.length > 1) {
  //             congresses.splice(1); // keep only the first congress
  //           }

  //           return congresses;
  //         };

  //         term.congresses = getCongresses(term.startYear, term.endYear);
  //       }

  //       return true;
  //     });

  //     // Fetch all HouseData for this representative
  //     let houseData = await HouseData.find({ houseId })
  //       .sort({ createdAt: 1 })
  //       .populate("houseId")
  //       .populate({
  //         path: "votesScore.voteId",
  //         populate: { path: "termId" },
  //       })
  //       .populate("activitiesScore.activityId")
  //       .lean();

  //     if (!houseData.length) {
  //       return res.status(404).json({ message: "House data not found" });
  //     }

  //     // Get house details from the first record
  //     const houseDetails = houseData[0].houseId;

  //     // Map termId -> meta (houseDataId, currentTerm, rating, summary) for per-term info
  //     const termIdToMeta = new Map();
  //     houseData.forEach((hd) => {
  //       if (hd.termId) {
  //         termIdToMeta.set(hd.termId.toString(), {
  //           _id: hd._id?.toString() || null,
  //           currentTerm: Boolean(hd.currentTerm),
  //           rating: hd.rating || "",
  //           summary: hd.summary || "",
  //         });
  //       }
  //     });

  //     // Collect all activities and votes from all HouseData records
  //     const allVotes = [];
  //     const allActivities = [];

  //     houseData.forEach((hd) => {
  //       if (hd.votesScore && hd.votesScore.length > 0) {
  //         allVotes.push(...hd.votesScore);
  //       }
  //       if (hd.activitiesScore && hd.activitiesScore.length > 0) {
  //         allActivities.push(...hd.activitiesScore);
  //       }
  //     });

  //     // Group votes and activities by term - only match terms with exactly one congress
  //     const termsWithData = validTerms.map((term) => {
  //       const termCongresses = term.congresses || [];

  //       // Only process terms that have exactly one congress
  //       if (termCongresses.length !== 1) {
  //         return {
  //           termId: term,
  //           votesScore: [],
  //           activitiesScore: [],
  //         };
  //       }

  //       const singleCongress = termCongresses[0];

  //       // Filter votes that match this term's single congress
  //       const votesForThisTerm = allVotes.filter((vote) => {
  //         const voteCongress = vote.voteId?.congress;
  //         const voteCongressNumber = Number(voteCongress);
  //         const isMatch = vote.voteId && voteCongress && voteCongressNumber === singleCongress;
  //         return isMatch;
  //       });

  //       // Filter activities that match this term's single congress
  //       const activitiesForThisTerm = allActivities.filter((activity) => {
  //         const activityCongress = activity.activityId?.congress;
  //         const activityCongressNumber = Number(activityCongress);
  //         const isMatch = activity.activityId && activityCongress && activityCongressNumber === singleCongress;
  //         return isMatch;
  //       });

  //       const meta = termIdToMeta.get(term._id?.toString()) || {};
  //       return {
  //         _id: meta._id || null,
  //         termId: term,
  //         currentTerm: meta.currentTerm || false,
  //         rating: meta.rating || "",
  //         summary: meta.summary || "",
  //         votesScore: votesForThisTerm,
  //         activitiesScore: activitiesForThisTerm,
  //       };
  //     });

  //     // Filter out terms that have no activities or votes
  //     // const termsWithScores = termsWithData.filter((term) => {
  //     //   const hasData = term.votesScore.length > 0 || term.activitiesScore.length > 0;
  //     //   return hasData;
  //     // });
  //     // Filter terms - keep if they have votes/activities OR if they exist in HouseData (termId present)
  //     const termsWithScores = termsWithData.filter((term) => {
  //       const hasData = term.votesScore.length > 0 || term.activitiesScore.length > 0;
  //       const hasHouseData = Boolean(term._id); // because we mapped meta._id from HouseData
  //       return hasData || hasHouseData;
  //     });

  //     res.status(200).json({
  //       message: "Retrieved successfully",
  //       house: houseDetails,
  //       terms: termsWithScores,
  //     });
  //   } catch (error) {
  //     res.status(500).json({
  //       message: "Error retrieving house data",
  //       error: error.message,
  //     });
  //   }
  // }

  //1st optimization
  // static async getHouseDataByHouseId(req, res) {
  //   try {
  //     const houseId = req.params.id;

  //     const Term = require("../models/termSchema");

  //     // Fetch all terms and filter valid ones in one pass
  //     const allTerms = await Term.find().sort({ startYear: -1 }).lean();

  //     const getCongresses = (startYear, endYear) => {
  //       if (startYear < 1789 || endYear < 1789) return [];

  //       const congresses = [];
  //       for (let year = startYear; year < endYear; year++) {
  //         const congressNumber = Math.floor((year - 1789) / 2) + 1;
  //         if (!congresses.includes(congressNumber)) {
  //           congresses.push(congressNumber);
  //         }
  //       }
  //       // If the range is exactly 2 years, only keep the first congress
  //       if (endYear - startYear === 2 && congresses.length > 1) {
  //         congresses.splice(1);
  //       }
  //       return congresses;
  //     };

  //     const validTerms = allTerms.filter((term) => {
  //       if (!term.startYear || !term.endYear) return false;

  //       const isOddEvenRange =
  //         term.startYear % 2 === 1 &&
  //         term.endYear % 2 === 0 &&
  //         term.endYear - term.startYear === 1;

  //       if (!isOddEvenRange) return false;

  //       // Add congresses if missing
  //       if (!term.congresses || term.congresses.length === 0) {
  //         term.congresses = getCongresses(term.startYear, term.endYear);
  //       }

  //       return true;
  //     });

  //     // Fetch all HouseData for this house
  //     const houseData = await HouseData.find({ houseId })
  //       .sort({ createdAt: 1 })
  //       .populate("houseId")
  //       .populate({
  //         path: "votesScore.voteId",
  //         populate: { path: "termId" },
  //       })
  //       .populate("activitiesScore.activityId")
  //       .lean();

  //     if (!houseData.length) {
  //       return res.status(404).json({ message: "House data not found" });
  //     }

  //     const houseDetails = houseData[0].houseId;

  //     // Map termId -> metadata for quick access
  //     const termIdToMeta = new Map();
  //     for (const hd of houseData) {
  //       if (hd.termId) {
  //         termIdToMeta.set(hd.termId.toString(), {
  //           _id: hd._id?.toString() || null,
  //           currentTerm: Boolean(hd.currentTerm),
  //           rating: hd.rating || "",
  //           summary: hd.summary || "",
  //         });
  //       }
  //     }

  //     // Flatten all votes and activities for quick filtering
  //     const allVotes = houseData.flatMap((hd) => hd.votesScore || []);
  //     const allActivities = houseData.flatMap((hd) => hd.activitiesScore || []);

  //     // Prepare results in one loop
  //     const termsWithScores = validTerms
  //       .map((term) => {
  //         const termCongresses = term.congresses || [];
  //         if (termCongresses.length !== 1) {
  //           return { termId: term, votesScore: [], activitiesScore: [] };
  //         }

  //         const singleCongress = termCongresses[0];

  //         // Pre-filter by congress for efficiency
  //         const votesForThisTerm = allVotes.filter(
  //           (vote) => Number(vote.voteId?.congress) === singleCongress
  //         );
  //         const activitiesForThisTerm = allActivities.filter(
  //           (activity) =>
  //             Number(activity.activityId?.congress) === singleCongress
  //         );

  //         const meta = termIdToMeta.get(term._id?.toString()) || {};
  //         return {
  //           _id: meta._id || null,
  //           termId: term,
  //           currentTerm: meta.currentTerm || false,
  //           rating: meta.rating || "",
  //           summary: meta.summary || "",
  //           votesScore: votesForThisTerm,
  //           activitiesScore: activitiesForThisTerm,
  //         };
  //       })
  //       .filter(
  //         (term) =>
  //           term.votesScore.length > 0 ||
  //           term.activitiesScore.length > 0 ||
  //           term._id
  //       );

  //     res.status(200).json({
  //       message: "Retrieved successfully",
  //       house: houseDetails,
  //       terms: termsWithScores,
  //     });
  //   } catch (error) {
  //     res.status(500).json({
  //       message: "Error retrieving house data",
  //       error: error.message,
  //     });
  //   }
  // }

  //2nd opt
  // static async getHouseDataByHouseId(req, res) {
  //   try {
  //     const houseId = req.params.id;

  //     const Term = require("../models/termSchema");

  //     // Fetch all terms
  //     const allTerms = await Term.find().sort({ startYear: -1 }).lean();

  //     const getCongresses = (startYear, endYear) => {
  //       if (startYear < 1789 || endYear < 1789) return [];

  //       const congresses = [];
  //       for (let year = startYear; year < endYear; year++) {
  //         const congressNumber = Math.floor((year - 1789) / 2) + 1;
  //         if (!congresses.includes(congressNumber)) {
  //           congresses.push(congressNumber);
  //         }
  //       }
  //       // If range is exactly 2 years → keep only first congress
  //       if (endYear - startYear === 2 && congresses.length > 1) {
  //         congresses.splice(1);
  //       }
  //       return congresses;
  //     };

  //     const validTerms = allTerms.filter((term) => {
  //       if (!term.startYear || !term.endYear) return false;

  //       const isOddEvenRange =
  //         term.startYear % 2 === 1 &&
  //         term.endYear % 2 === 0 &&
  //         term.endYear - term.startYear === 1;

  //       if (!isOddEvenRange) return false;

  //       // Add congresses if missing
  //       if (!term.congresses || term.congresses.length === 0) {
  //         term.congresses = getCongresses(term.startYear, term.endYear);
  //       }

  //       return true;
  //     });

  //     // Fetch all HouseData for this house
  //     const houseData = await HouseData.find({ houseId })
  //       .sort({ createdAt: 1 })
  //       .populate("houseId")
  //       .populate({
  //         path: "votesScore.voteId",
  //         populate: { path: "termId" },
  //       })
  //       .populate("activitiesScore.activityId")
  //       .lean();

  //     if (!houseData.length) {
  //       return res.status(404).json({ message: "House data not found" });
  //     }

  //     const houseDetails = houseData[0].houseId;

  //     // Map termId -> metadata for quick access
  //     const termIdToMeta = new Map();
  //     for (const hd of houseData) {
  //       if (hd.termId) {
  //         termIdToMeta.set(hd.termId.toString(), {
  //           _id: hd._id?.toString() || null,
  //           currentTerm: Boolean(hd.currentTerm),
  //           rating: hd.rating || "",
  //           summary: hd.summary || "",
  //         });
  //       }
  //     }

  //     // Flatten all votes and activities
  //     const allVotes = houseData.flatMap((hd) => hd.votesScore || []);
  //     const allActivities = houseData.flatMap((hd) => hd.activitiesScore || []);

  //     // ✅ Build indexes for quick congress lookup
  //     const votesByCongress = new Map();
  //     for (const vote of allVotes) {
  //       const congress = Number(vote.voteId?.congress);
  //       if (!congress) continue;
  //       if (!votesByCongress.has(congress)) votesByCongress.set(congress, []);
  //       votesByCongress.get(congress).push(vote);
  //     }

  //     const activitiesByCongress = new Map();
  //     for (const activity of allActivities) {
  //       const congress = Number(activity.activityId?.congress);
  //       if (!congress) continue;
  //       if (!activitiesByCongress.has(congress))
  //         activitiesByCongress.set(congress, []);
  //       activitiesByCongress.get(congress).push(activity);
  //     }

  //     // ✅ Build terms with scores using indexed maps (O(1) retrieval)
  //     const termsWithScores = validTerms
  //       .map((term) => {
  //         const termCongresses = term.congresses || [];
  //         if (termCongresses.length !== 1) {
  //           return { termId: term, votesScore: [], activitiesScore: [] };
  //         }

  //         const singleCongress = termCongresses[0];

  //         const votesForThisTerm = votesByCongress.get(singleCongress) || [];
  //         const activitiesForThisTerm =
  //           activitiesByCongress.get(singleCongress) || [];

  //         const meta = termIdToMeta.get(term._id?.toString()) || {};
  //         return {
  //           _id: meta._id || null,
  //           termId: term,
  //           currentTerm: meta.currentTerm || false,
  //           rating: meta.rating || "",
  //           summary: meta.summary || "",
  //           votesScore: votesForThisTerm,
  //           activitiesScore: activitiesForThisTerm,
  //         };
  //       })
  //       .filter(
  //         (term) =>
  //           term.votesScore.length > 0 ||
  //           term.activitiesScore.length > 0 ||
  //           term._id
  //       );

  //     res.status(200).json({
  //       message: "Retrieved successfully",
  //       house: houseDetails,
  //       terms: termsWithScores,
  //     });
  //   } catch (error) {
  //     res.status(500).json({
  //       message: "Error retrieving house data",
  //       error: error.message,
  //     });
  //   }
  // }

  //3rd opt

 

static async getHouseDataByHouseId(req, res) {
  try {
    const houseId = req.params.id;

    const Term = require("../models/termSchema");

    // Fetch all terms and filter valid ones using utility
    const allTerms = await Term.find().sort({ startYear: -1 }).lean();
    const validTerms = allTerms.filter(isValidTerm);

    // Fetch all HouseData for this house
    const houseData = await HouseData.find({ houseId })
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

    const houseDetails = houseData[0].houseId;

    // Map termId -> metadata for quick access
    const termIdToMeta = new Map();
    for (const hd of houseData) {
      if (hd.termId) {
        termIdToMeta.set(hd.termId.toString(), {
          _id: hd._id?.toString() || null,
          currentTerm: Boolean(hd.currentTerm),
          rating: hd.rating || "",
          summary: hd.summary || "",
        });
      }
    }

    // Flatten all votes and activities
    const allVotes = houseData.flatMap((hd) => hd.votesScore || []);
    const allActivities = houseData.flatMap((hd) => hd.activitiesScore || []);

    // ✅ Build indexes for quick congress lookup
    const votesByCongress = new Map();
    for (const vote of allVotes) {
      const congress = Number(vote.voteId?.congress);
      if (!congress) continue;
      if (!votesByCongress.has(congress)) votesByCongress.set(congress, []);
      votesByCongress.get(congress).push(vote);
    }

    const activitiesByCongress = new Map();
    for (const activity of allActivities) {
      const congress = Number(activity.activityId?.congress);
      if (!congress) continue;
      if (!activitiesByCongress.has(congress)) activitiesByCongress.set(congress, []);
      activitiesByCongress.get(congress).push(activity);
    }

    // ✅ Build terms with scores using indexed maps
    const termsWithScores = validTerms
      .map((term) => {
        const termCongresses = term.congresses || [];
        if (termCongresses.length !== 1) {
          return { termId: term, votesScore: [], activitiesScore: [] };
        }

        const singleCongress = termCongresses[0];

        const votesForThisTerm = votesByCongress.get(singleCongress) || [];
        const activitiesForThisTerm = activitiesByCongress.get(singleCongress) || [];

        const meta = termIdToMeta.get(term._id?.toString()) || {};
        return {
          _id: meta._id || null,
          termId: term,
          currentTerm: meta.currentTerm || false,
          rating: meta.rating || "",
          summary: meta.summary || "",
          votesScore: votesForThisTerm,
          activitiesScore: activitiesForThisTerm,
        };
      })
      .filter((term) => term.votesScore.length > 0 || term.activitiesScore.length > 0 || term._id);

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
