const mongoose = require("mongoose");
const SenatorData = require("../models/senatorDataSchema");
const Senator = require("../models/senatorSchema");
const Vote = require("../models/voteSchema");
const Term = require("../models/termSchema");
const Activity = require("../models/activitySchema");
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
        pastVotesScore = [],
      } = req.body;
      if (
        !mongoose.Types.ObjectId.isValid(senateId) ||
        !mongoose.Types.ObjectId.isValid(termId)
      ) {
        return res.status(400).json({
          message: "Invalid senateId or termId format",
        });
      }
      const senateObjectId = new mongoose.Types.ObjectId(senateId);
      const termObjectId = new mongoose.Types.ObjectId(termId);
      const [termDetails, existingCurrentTerm, existingData] =
        await Promise.all([
          mongoose.model("terms").findById(termObjectId),
          currentTerm
            ? SenatorData.findOne({
                senateId: senateObjectId,
                currentTerm: true,
              })
            : null,
          SenatorData.findOne({
            senateId: senateObjectId,
            termId: termObjectId,
          }),
        ]);
      if (!termDetails) {
        return res.status(400).json({
          message: "Invalid term ID provided",
        });
      }
      if (existingData) {
        return res.status(409).json({
          message: "Duplicate senator data found",
          details:
            "A record already exists with the same senator and term combination",
          existingData,
        });
      }
      if (currentTerm && existingCurrentTerm) {
        return res.status(409).json({
          message: "Another term is already marked as current for this senator",
          existingCurrentTerm,
        });
      }
      const newSenatorData = new SenatorData({
        senateId: senateObjectId,
        termId: termObjectId,
        summary,
        currentTerm: currentTerm || false,
        rating,
        votesScore,
        activitiesScore,
        pastVotesScore,
      });
      const savedData = await newSenatorData.save();
      const populatedData = await SenatorData.findById(savedData._id)
        .populate("senateId", "name title")
        .populate("termId", "name startYear endYear")
        .lean();

      res.status(201).json({
        message: "Senator data created successfully",
        data: populatedData || savedData,
      });
    } catch (error) {
      console.error("Error creating senator data:", error);
      if (error.name === "ValidationError") {
        return res.status(400).json({
          message: "Validation failed",
          details: Object.values(error.errors).map((err) => err.message),
        });
      }

      if (error.code === 11000) {
        return res.status(409).json({
          message: "Duplicate entry detected",
          details:
            "A record with this senator and term combination already exists",
        });
      }
      res.status(500).json({
        message: "Error creating senator data",
        error: process.env.NODE_ENV === "production" ? {} : error.message,
      });
    }
  }
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
  static async updateSenatorData(req, res) {
    try {
      const { termId, senateId } = req.body;
      if (!termId || termId.toString().trim() === "") {
        return res.status(400).json({ message: "Term is required" });
      }
      if (!senateId || senateId.toString().trim() === "") {
        return res.status(400).json({ message: "Senate ID is required" });
      }
      const existing = await SenatorData.findById(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Senator data not found" });
      }
      Object.assign(existing, req.body);
      const updated = await existing.save();
      res.status(200).json(updated);
    } catch (error) {
      if (error.name === "ValidationError") {
        const messages = Object.values(error.errors).map((err) => err.message);
        return res.status(400).json({ message: messages.join(", ") });
      }
      res.status(500).json({
        message: error.message || "Error updating senator data",
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      });
    }
  }
  static async deleteSenatorData(req, res) {
    try {
      const senatorDataToDelete = await SenatorData.findById(req.params.id);
      if (!senatorDataToDelete) {
        return res.status(404).json({ message: "Senator data not found" });
      }
      const senatorId = senatorDataToDelete.senateId;
      const senator = await Senator.findById(senatorId);
      if (!senator) {
        return res.status(404).json({ message: "Senator not found" });
      }
      const senatorDataList = await SenatorData.find({
        senateId: senatorId,
      }).lean();
      const { _id, createdAt, updatedAt, __v, history, ...currentState } =
        senator.toObject();
      const stateWithData = {
        ...currentState,
        senatorData: senatorDataList,
      };
      let updateOps = { $set: { snapshotSource: "deleted_pending_update" } };

      if (!senator.history || senator.history.length === 0) {
        const historyEntry = {
          oldData: stateWithData,
          timestamp: new Date(),
          actionType: "delete",
          deletedDataId: req.params.id,
          deletedData: senatorDataToDelete.toObject(),
        };

        updateOps.$push = { history: historyEntry };
      }
      await Promise.all([
        Senator.findByIdAndUpdate(senatorId, updateOps),
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
        .select("-__v -createdAt -updatedAt")
        .sort({ createdAt: 1 })
        .populate("termId", "-__v -createdAt -updatedAt")
        .populate(
          "senateId",
          "name state party photo status senatorId publishStatus"
        )
        .populate({
          path: "votesScore.voteId",
          select: "title result date termId",
          populate: {
            path: "termId",
            select: "name start end",
          },
        })
        .populate({
          path: "activitiesScore.activityId",
          select: "title quorumId status date",
        })
        .populate({
          path: "pastVotesScore.voteId",
          select: "title result date termId",
          populate: {
            path: "termId",
            select: "name start end",
          },
        })
        .lean();

      if (!senatorData.length) {
        return res.status(404).json({ message: "Senator data not found" });
      }

      const orderedData = senatorData.sort((a, b) => {
        if (a.currentTerm && !b.currentTerm) return -1;
        if (!a.currentTerm && b.currentTerm) return 1;
        return 0;
      });
      res.status(200).json({
        message: "Retrieve successfully",
        info: orderedData,
      });
    } catch (error) {
      res.status(500).json({
        message: "Error retrieving senator data",
        error: error.message,
      });
    }
  }

  static async SenatorDataBySenatorId(req, res) {
    try {
      const senateId = req.params.senatorId;

      // Get senator doc
      const senatorDocument = await Senator.findById(senateId).lean();
      if (!senatorDocument) {
        return res.status(404).json({ message: "Senator data not found" });
      }

      const latestHistory = senatorDocument.history?.slice(-1)[0];
      const hasHistoricalData = latestHistory?.oldData?.senatorData?.length > 0;

      // ---- Helpers ----
      const cleanVoteOrActivity = (doc) =>
        doc && {
          _id: doc._id,
          title: doc.title || null,
          shortDesc: doc.shortDesc || null,
          longDesc: doc.longDesc || null,
          rollCall: doc.rollCall || null,
          readMore: doc.readMore || null,
        };

      const getSenatorDetails = (sourceData, isHistorical = false) => ({
        _id: senatorDocument._id,
        name: sourceData.name || senatorDocument.name,
        state: sourceData.state || senatorDocument.state,
        party: sourceData.party || senatorDocument.party,
        photo: sourceData.photo || senatorDocument.photo,
        status: sourceData.status || senatorDocument.status,
        senatorId: sourceData.senatorId || senatorDocument.senatorId,
        publishStatus: isHistorical
          ? "published"
          : senatorDocument.publishStatus,
        createdAt: senatorDocument.createdAt,
        updatedAt: isHistorical
          ? latestHistory?.timestamp
          : senatorDocument.updatedAt,
      });

      let finalCurrentTerm = null;
      let finalPastTerms = [];
      let senatorDetails = null;

      if (hasHistoricalData) {
        senatorDetails = getSenatorDetails(latestHistory.oldData, true);
        const historicalTerms = latestHistory.oldData.senatorData;
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
          SenatorData.findOne({ senateId, currentTerm: true })
            .populate("termId", "_id name startYear endYear congresses")
            .populate(
              "votesScore.voteId",
              "_id title shortDesc longDesc rollCall readMore"
            )
            .populate(
              "activitiesScore.activityId",
              "_id title shortDesc longDesc rollCall readMore"
            )
            .lean(),
          SenatorData.find({ senateId, currentTerm: { $ne: true } })
            .populate("termId", "_id name startYear endYear congresses")
            .populate(
              "votesScore.voteId",
              "_id title shortDesc longDesc rollCall readMore"
            )
            .populate(
              "activitiesScore.activityId",
              "_id title shortDesc longDesc rollCall readMore"
            )
            .sort({ "termId.startYear": -1, createdAt: -1 })
            .lean(),
        ]);

        senatorDetails = getSenatorDetails(senatorDocument, false);

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
        senator: senatorDetails,
        currentTerm: finalCurrentTerm,
        pastTerms: finalPastTerms,
        dataSource: hasHistoricalData ? "historical" : "current",
        hasHistoricalData,
      });
    } catch (error) {
      console.error("Error retrieving senator data:", error);
      res.status(500).json({
        message: "Error retrieving senator data",
        error: error.message,
      });
    }
  }
  static async getPastVotesWithDetails(req, res) {
    try {
      const { senateId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(senateId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid senate ID format",
        });
      }

      // Fetch senator's name
      const senator = await Senator.findById(senateId).select("name").lean();
      const senatorName = senator ? senator.name : null;

      const voteDetails = await SenatorData.aggregate([
        { $match: { senateId: new mongoose.Types.ObjectId(senateId) } },
        {
          $match: {
            pastVotesScore: { $exists: true, $ne: [] },
            "pastVotesScore.0": { $exists: true },
          },
        },
        { $unwind: "$pastVotesScore" },
        {
          $lookup: {
            from: "votes",
            localField: "pastVotesScore.voteId",
            foreignField: "_id",
            as: "voteDetails",
          },
        },
        { $unwind: "$voteDetails" },
        {
          $project: {
            _id: "$voteDetails._id",
            type: "$voteDetails.type",
            title: "$voteDetails.title",
            date: "$voteDetails.date",
            congress: "$voteDetails.congress",
            shortDesc: "$voteDetails.shortDesc",
            readMore: "$voteDetails.readMore",
            rollCall: "$voteDetails.rollCall",
            sbaPosition: "$voteDetails.sbaPosition",
            status: "$voteDetails.status",
            score: "$pastVotesScore.score",
            voteScoreId: "$pastVotesScore._id",
          },
        },
        { $sort: { date: -1 } },
      ]);

      if (!voteDetails.length) {
        return res.status(404).json({
          success: false,
          message: "No past votes found for this senator",
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          senateId,
          name: senatorName,
          pastVotes: voteDetails,
          count: voteDetails.length,
        },
      });
    } catch (error) {
      console.error("Error fetching past votes:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
}

module.exports = senatorDataController;
