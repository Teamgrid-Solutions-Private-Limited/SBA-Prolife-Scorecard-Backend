const HouseData = require("../models/representativeDataSchema");
const House = require("../models/representativeSchema");
const Term = require("../models/termSchema");
const Vote = require("../models/voteSchema");
const Activity = require("../models/activitySchema");
const { getCongresses, isValidTerm } = require("../helper/termUtils");

const mongoose = require("mongoose");
class houseDataController {
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

      let totalDeleted = 0;

      const delMissing = await HouseData.deleteMany({
        houseId,
        termId: { $exists: false },
      });
      totalDeleted += delMissing.deletedCount || 0;

      const delNull = await HouseData.deleteMany({ houseId, termId: null });
      totalDeleted += delNull.deletedCount || 0;

      try {
        const nativeDel = await HouseData.collection.deleteMany({
          houseId: new mongoose.Types.ObjectId(houseId),
          termId: "",
        });
        totalDeleted += nativeDel.deletedCount || 0;
      } catch (e) {}

      if (!houseId || !termId || termId.toString().trim() === "") {
        return res.status(400).json({
          message: "houseId and termId are required",
        });
      }

      const existingHouseData = await HouseData.findOne({ houseId, termId });

      if (existingHouseData) {
        return res.status(409).json({
          message: "House data already exists for this representative and term",
          existingData: existingHouseData,
        });
      }

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

      if (!termId || termId.toString().trim() === "") {
        // Find and delete the document
        const documentToDelete = await HouseData.findById(
          req.params.id
        ).session(session);

        if (documentToDelete) {
        }

        if (!documentToDelete) {
          return res.status(404).json({ message: "House data not found" });
        }

        await HouseData.findByIdAndDelete(req.params.id);

        return res.status(200).json({
          message: "House data deleted because termId was null/empty",
          deletedData: documentToDelete,
        });
      }

      // Optional: Validate houseId
      if (!houseId || houseId.toString().trim() === "") {
        return res.status(400).json({ message: "houseId is required" });
      }

      // Find the existing document
      const existing = await HouseData.findById(req.params.id);

      if (!existing) {
        return res.status(404).json({ message: "House data not found" });
      }

      // Check if termId is being changed to a different value
      const isTermIdChanging = existing.termId.toString() !== termId.toString();

      if (isTermIdChanging) {
        // Check if HouseData already exists for the new houseId + termId combination
        const duplicateHouseData = await HouseData.findOne({
          houseId: existing.houseId, // Use existing houseId to avoid changing it
          termId: termId,
          _id: { $ne: req.params.id },
        });

        if (duplicateHouseData) {
          return res.status(409).json({
            message:
              "House data already exists for this representative and term",
            existingData: duplicateHouseData,
          });
        }
      }

      // Apply the updates
      Object.assign(existing, req.body);

      // If currentTerm is being set to true, ensure no other currentTerm exists
      if (existing.currentTerm === true) {
        const existingCurrentTerm = await HouseData.findOne({
          houseId: existing.houseId,
          currentTerm: true,
          _id: { $ne: req.params.id },
        });

        if (existingCurrentTerm) {
          // Automatically update the existing currentTerm to false
          await HouseData.findByIdAndUpdate(existingCurrentTerm._id, {
            currentTerm: false,
          });
        }
      }

      // Save to trigger schema validation
      const updated = await existing.save();

      res.status(200).json({
        message: "House data updated successfully",
        data: updated,
      });
    } catch (error) {
      // Handle schema validation errors
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

  static async getHouseDataByHouseId(req, res) {
    try {
      const houseId = req.params.id;

      // Fetch all terms and filter valid ones using utility
      const allTerms = await Term.find().sort({ startYear: -1 }).lean();
      const validTerms = allTerms.filter(isValidTerm);

      // Fetch all HouseData for this house - exclude history field from houseId population
      const houseData = await HouseData.find({ houseId })
        .sort({ createdAt: 1 })
        .populate({
          path: "houseId",
          select: "-history", // Exclude the history field
        })
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
        if (!activitiesByCongress.has(congress))
          activitiesByCongress.set(congress, []);
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

          // const votesForThisTerm = votesByCongress.get(singleCongress) || [];
          // const activitiesForThisTerm =
          //   activitiesByCongress.get(singleCongress) || [];
          // Votes sorted by date ASC, if same date → sort by _id ASC
          const votesForThisTerm = (
            votesByCongress.get(singleCongress) || []
          ).sort((a, b) => {
            const dateA = a.voteId?.date
              ? new Date(a.voteId.date)
              : new Date(0);
            const dateB = b.voteId?.date
              ? new Date(b.voteId.date)
              : new Date(0);

            if (dateA.getTime() === dateB.getTime()) {
              return (a.voteId?._id || "")
                .toString()
                .localeCompare((b.voteId?._id || "").toString());
            }

            return dateA - dateB;
          });

          // Activities sorted by date ASC, if same date → sort by _id ASC
          const activitiesForThisTerm = (
            activitiesByCongress.get(singleCongress) || []
          ).sort((a, b) => {
            const dateA = a.activityId?.date
              ? new Date(a.activityId.date)
              : new Date(0);
            const dateB = b.activityId?.date
              ? new Date(b.activityId.date)
              : new Date(0);

            if (dateA.getTime() === dateB.getTime()) {
              return (a.activityId?._id || "")
                .toString()
                .localeCompare((b.activityId?._id || "").toString());
            }

            return dateA - dateB;
          });

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
        .filter(
          (term) =>
            term.votesScore.length > 0 ||
            term.activitiesScore.length > 0 ||
            term._id
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

  static async HouseDataByHouseId(req, res) {
    try {
      const houseId = req.params.repId;

      // Get the main house document
      const houseDocument = await House.findById(houseId).lean();
      if (!houseDocument) {
        return res.status(404).json({ message: "House data not found" });
      }

      const latestHistory = houseDocument.history?.slice(-1)[0];
      const hasHistoricalData =
        latestHistory?.oldData?.representativeData?.length > 0;
      const cleanVoteOrActivity = (doc) =>
        doc && {
          _id: doc._id,
          title: doc.title || null,
          shortDesc: doc.shortDesc || null,
          longDesc: doc.longDesc || null,
          rollCall: doc.rollCall || null,
          readMore: doc.readMore || null,
          date: doc.date || null,
        };

      const getHouseDetails = (sourceData, isHistorical = false) => ({
        _id: houseDocument._id,
        name: sourceData.name || houseDocument.name,
        repId: sourceData.repId || houseDocument.repId,
        district: sourceData.district || houseDocument.district,
        party: sourceData.party || houseDocument.party,
        photo: sourceData.photo || houseDocument.photo,
        status: sourceData.status || houseDocument.status,
        publishStatus: isHistorical ? "published" : houseDocument.publishStatus,
        createdAt: houseDocument.createdAt,
        updatedAt: isHistorical
          ? latestHistory?.timestamp
          : houseDocument.updatedAt,
      });

      let finalCurrentTerm = null;
      let finalPastTerms = [];
      let houseDetails = null;

      if (hasHistoricalData) {
        houseDetails = getHouseDetails(latestHistory.oldData, true);
        const historicalTerms = latestHistory.oldData.representativeData;
        const allTermIds = historicalTerms.map((t) => t.termId);
        const allVoteIds = historicalTerms.flatMap((t) =>
          (t.votesScore || []).map((v) => v.voteId)
        );
        const allActivityIds = historicalTerms.flatMap((t) =>
          (t.activitiesScore || []).map((a) => a.activityId)
        );
        const [termDocs, voteDocs, activityDocs] = await Promise.all([
          Term.find({ _id: { $in: allTermIds } }).lean(),
          Vote.find({ _id: { $in: allVoteIds } }).lean(),
          Activity.find({ _id: { $in: allActivityIds } }).lean(),
        ]);

        const termMap = Object.fromEntries(
          termDocs.map((d) => [String(d._id), d])
        );
        const voteMap = Object.fromEntries(
          voteDocs.map((d) => [String(d._id), cleanVoteOrActivity(d)])
        );
        const activityMap = Object.fromEntries(
          activityDocs.map((d) => [String(d._id), cleanVoteOrActivity(d)])
        );

        const populatedTerms = historicalTerms.map((term) => ({
          _id: term._id,
          termId: termMap[String(term.termId)] || null,
          currentTerm: term.currentTerm,
          summary: term.summary,
          rating: term.rating,
          votesScore: (term.votesScore || []).map((v) => ({
            score: v.score,
            voteId: voteMap[String(v.voteId)] || null,
          })),
          activitiesScore: (term.activitiesScore || []).map((a) => ({
            score: a.score,
            activityId: activityMap[String(a.activityId)] || null,
          })),
        }));

        finalCurrentTerm = populatedTerms.find((t) => t.currentTerm) || null;
        finalPastTerms = populatedTerms.filter((t) => !t.currentTerm);
      } else {
        const [currentTerm, pastTerms] = await Promise.all([
          HouseData.findOne({ houseId, currentTerm: true })
            .populate("termId", "_id name startYear endYear congresses")
            .populate(
              "votesScore.voteId",
              "_id title shortDesc longDesc rollCall readMore date"
            )
            .populate(
              "activitiesScore.activityId",
              "_id title shortDesc longDesc rollCall readMore date"
            )
            .lean(),
          HouseData.find({ houseId, currentTerm: { $ne: true } })
            .populate("termId", "_id name startYear endYear congresses")
            .populate(
              "votesScore.voteId",
              "_id title shortDesc longDesc rollCall readMore date"
            )
            .populate(
              "activitiesScore.activityId",
              "_id title shortDesc longDesc rollCall readMore date"
            )
            .sort({ "termId.startYear": -1, createdAt: -1 })
            .lean(),
        ]);

        houseDetails = getHouseDetails(houseDocument, false);

        const formatTermData = (term) => ({
          _id: term._id,
          termId: term.termId,
          currentTerm: term.currentTerm,
          summary: term.summary,
          rating: term.rating,
          votesScore: (term.votesScore || []).map((v) => ({
            score: v.score,
            voteId: cleanVoteOrActivity(v.voteId),
          })),
          activitiesScore: (term.activitiesScore || []).map((a) => ({
            score: a.score,
            activityId: cleanVoteOrActivity(a.activityId),
          })),
        });

        if (currentTerm) finalCurrentTerm = formatTermData(currentTerm);
        finalPastTerms = pastTerms.map(formatTermData);
      }

      res.status(200).json({
        message: "Retrieved successfully",
        house: houseDetails,
        currentTerm: finalCurrentTerm,
        pastTerms: finalPastTerms,
        dataSource: hasHistoricalData ? "historical" : "current",
        hasHistoricalData,
      });
    } catch (error) {
      console.error("Error retrieving house data:", error);
      res.status(500).json({
        message: "Error retrieving house data",
        error: error.message,
      });
    }
  }
}

module.exports = houseDataController;
