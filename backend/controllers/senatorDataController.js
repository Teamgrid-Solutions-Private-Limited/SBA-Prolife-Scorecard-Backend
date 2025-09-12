const mongoose = require("mongoose");
const SenatorData = require("../models/senatorDataSchema");
const Senator = require("../models/senatorSchema");
const Vote = require("../models/voteSchema");
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

      // Validate ObjectId format first (cheaper operation)
      if (
        !mongoose.Types.ObjectId.isValid(senateId) ||
        !mongoose.Types.ObjectId.isValid(termId)
      ) {
        return res.status(400).json({
          message: "Invalid senateId or termId format",
        });
      }

      // Convert to ObjectId once
      const senateObjectId = new mongoose.Types.ObjectId(senateId);
      const termObjectId = new mongoose.Types.ObjectId(termId);

      // Parallelize database operations
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

      // Validate term exists
      if (!termDetails) {
        return res.status(400).json({
          message: "Invalid term ID provided",
        });
      }

      // Check for duplicates
      if (existingData) {
        return res.status(409).json({
          message: "Duplicate senator data found",
          details:
            "A record already exists with the same senator and term combination",
          existingData,
        });
      }

      // Check for existing current term
      if (currentTerm && existingCurrentTerm) {
        return res.status(409).json({
          message: "Another term is already marked as current for this senator",
          existingCurrentTerm,
        });
      }

      // Create new senator data
      const newSenatorData = new SenatorData({
        senateId: senateObjectId,
        termId: termObjectId,
        summary,
        currentTerm: currentTerm || false, // Ensure boolean value
        rating,
        votesScore,
        activitiesScore,
        pastVotesScore,
      });

      // Use lean() for better performance if you don't need full Mongoose document
      const savedData = await newSenatorData.save();

      // Populate references if needed for response
      const populatedData = await SenatorData.findById(savedData._id)
        .populate("senateId", "name title") // Only include necessary fields
        .populate("termId", "name startYear endYear")
        .lean();

      res.status(201).json({
        message: "Senator data created successfully",
        data: populatedData || savedData,
      });
    } catch (error) {
      console.error("Error creating senator data:", error);

      // Handle specific error types
      if (error.name === "ValidationError") {
        return res.status(400).json({
          message: "Validation failed",
          details: Object.values(error.errors).map((err) => err.message),
        });
      }

      if (error.code === 11000) {
        // MongoDB duplicate key error
        return res.status(409).json({
          message: "Duplicate entry detected",
          details:
            "A record with this senator and term combination already exists",
        });
      }

      // Generic server error (hide details in production)
      res.status(500).json({
        message: "Error creating senator data",
        error: process.env.NODE_ENV === "production" ? {} : error.message,
      });
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

      // 5. Only create history entry if no history exists
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

      // 6. Update senator (with or without history) and delete the data
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
        .select("-__v -createdAt -updatedAt") // Strip unnecessary fields
        .sort({ createdAt: 1 })
        .populate("termId", "-__v -createdAt -updatedAt")
        .populate(
          "senateId",
          "name state party photo status senatorId publishStatus"
        )
        .populate({
          path: "votesScore.voteId",
          select: "title result date termId", // only useful fields
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

      res.status(200).json({
        message: "Retrieve successfully",
        info: senatorData,
      });
    } catch (error) {
      res.status(500).json({
        message: "Error retrieving senator data",
        error: error.message,
      });
    }
  }

  //frontend ui display
  static async SenatorDataBySenatorId(req, res) {
    try {
      const senateId = req.params.senatorId;

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
  static async SenatorDataBySenatorId(req, res) {
    try {
      const senateId = req.params.senatorId; // Note: param is senatorId but schema uses senateId

      // Run queries in parallel
      const [currentTerm, pastTerms] = await Promise.all([
        // Get currentTerm (only one, enforced by index)
        SenatorData.findOne({ senateId, currentTerm: true })
          .populate("termId")
          .populate("senateId")
          .populate("votesScore.voteId")
          .populate("activitiesScore.activityId")
          .lean(),

        // Get past terms, sorted by startYear (or createdAt fallback)
        SenatorData.find({ senateId, currentTerm: { $ne: true } })
          .populate("termId")
          .populate("votesScore.voteId")
          .populate("activitiesScore.activityId")
          .sort({ "termId.startYear": -1, createdAt: -1 })
          .lean(),
      ]);

      if (!currentTerm && !pastTerms.length) {
        return res.status(404).json({ message: "Senator data not found" });
      }

      // Senator details from either currentTerm or first pastTerm
      const senatorDetails = currentTerm?.senateId || pastTerms[0]?.senateId;

      res.status(200).json({
        message: "Retrieved successfully",
        senator: senatorDetails,
        currentTerm: currentTerm
          ? { ...currentTerm, senateId: undefined }
          : null,
        pastTerms: pastTerms.map(({ senateId, ...rest }) => rest),
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

      // Get the main senator document - removed modifiedBy population since it doesn't exist
      const senatorDocument = await Senator.findById(senateId).lean();

      if (!senatorDocument) {
        return res.status(404).json({ message: "Senator data not found" });
      }

      // Check for historical data - get the latest history entry
      const latestHistory = senatorDocument.history?.slice(-1)[0];
      const hasHistoricalData = latestHistory?.oldData?.senatorData?.length > 0;

      // Common function to format term data
      const formatTermData = (term) => ({
        _id: term._id,
        termId: term.termId,
        currentTerm: term.currentTerm,
        summary: term.summary,
        rating: term.rating,
        votesScore: term.votesScore || [],
        activitiesScore: term.activitiesScore || [],
        createdAt: term.createdAt,
        updatedAt: term.updatedAt,
        __v: term.__v,
      });

      // Common function to get senator details - updated for your schema
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
        editedFields:
          sourceData.editedFields || senatorDocument.editedFields || [],
        fieldEditors:
          sourceData.fieldEditors || senatorDocument.fieldEditors || {},
        // modifiedBy field doesn't exist in your schema, using fieldEditors instead
        snapshotSource:
          sourceData.snapshotSource || senatorDocument.snapshotSource,
        createdAt: senatorDocument.createdAt,
        updatedAt: isHistorical
          ? latestHistory?.timestamp
          : senatorDocument.updatedAt,
      });

      let finalCurrentTerm = null;
      let finalPastTerms = [];
      let senatorDetails = null;

      if (hasHistoricalData) {
        // ✅ USE ONLY HISTORICAL DATA
        console.log(
          "Using historical data with",
          latestHistory.oldData.senatorData.length,
          "term entries"
        );

        senatorDetails = getSenatorDetails(latestHistory.oldData, true);

        // Process all senatorData from history
        const historicalTerms = latestHistory.oldData.senatorData;

        // Find current term (if exists in historical data)
        const currentHistoricalTerm = historicalTerms.find(
          (term) => term.currentTerm
        );
        if (currentHistoricalTerm) {
          finalCurrentTerm = formatTermData(currentHistoricalTerm);
        }

        // Get all past terms from historical data
        finalPastTerms = historicalTerms
          .filter((term) => !term.currentTerm)
          .map(formatTermData);
      } else {
        // ✅ USE CURRENT DATA (only if no historical data available)
        // Run queries in parallel for better performance
        const [currentTerm, pastTerms] = await Promise.all([
          // Get current term
          SenatorData.findOne({ senateId, currentTerm: true })
            .populate("termId")
            .populate("votesScore.voteId")
            .populate("activitiesScore.activityId")
            .lean(),

          // Get past terms, sorted by startYear (or createdAt fallback)
          SenatorData.find({ senateId, currentTerm: { $ne: true } })
            .populate("termId")
            .populate("votesScore.voteId")
            .populate("activitiesScore.activityId")
            .sort({ "termId.startYear": -1, createdAt: -1 })
            .lean(),
        ]);

        senatorDetails = getSenatorDetails(senatorDocument, false);

        // Use current term data
        if (currentTerm) {
          finalCurrentTerm = formatTermData(currentTerm);
        }

        // Use past terms data
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

  // Fetch all past votes with details by senate ID
  static async getPastVotesWithDetails(req, res) {
    try {
      const { senateId } = req.params;

      // Validate senateId
      if (!mongoose.Types.ObjectId.isValid(senateId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid senate ID format",
        });
      }

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
