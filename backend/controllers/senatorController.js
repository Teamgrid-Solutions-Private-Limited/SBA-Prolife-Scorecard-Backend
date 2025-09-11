const Senator = require("../models/senatorSchema");
const SenatorData = require("../models/senatorDataSchema");
const upload = require("../middlewares/fileUploads");
const mongoose = require("mongoose");

class senatorController {
  // Create a new senator with photo upload
  static createSenator = async (req, res) => {
    try {
      const { name, state, party, status } = req.body;

      const photo = req.file ? req.file.filename : null; // If a file is uploaded, use its path, otherwise null

      const newSenator = new Senator({
        name,
        state,
        party,
        photo, // Store the photo path in the database
        status,
        publishStatus: "draft", // Default publish status
      });

      await newSenator.save();

      res.status(201).json(newSenator);
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error creating senator", error: error.message });
    }
  };

  static async getAllSenators(req, res) {
    try {
      const filter = {};
      if (req.query.published === "true") {
        filter.publishStatus = "published";
      } else if (req.query.published === "false") {
        filter.publishStatus = { $ne: "published" };
      }

      const senators = await Senator.find(filter)
        .select("name state party photo status senatorId publishStatus")
        .lean();

      res.status(200).json(senators);
    } catch (error) {
      res.status(500).json({ message: "Error fetching senators", error });
    }
  }

  // Get a senator by ID for admin dashboard
  static async getSenatorById(req, res) {
    try {
      const senator = await Senator.findById(req.params.id);
      if (!senator) {
        return res.status(404).json({ message: "Senator not found" });
      }
      res.status(200).json(senator);
    } catch (error) {
      res.status(500).json({ message: "Error retrieving senator", error });
    }
  }

  // Get all senators for frontend display with filters, pagination, and ratings
  // GET /api/senators?state=&party=&name=&publishedOnly=true&page=1&limit=10

  static async Senators(req, res) {
    try {
      const { state, party, name, publishedOnly, page, limit } = req.query;
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 0;
      const skip = (pageNum - 1) * limitNum;

      // Build filter object dynamically
      const filter = {};
      if (state) filter.state = new RegExp(`^${state}$`, "i");
      if (party) filter.party = new RegExp(`^${party}$`, "i");
      if (name) filter.name = new RegExp(name, "i");

      // Only filter by published if explicitly requested
      if (publishedOnly && publishedOnly.toLowerCase() === "true") {
        filter.publishStatus = "published";
      }

      // Use Promise.all to execute count and find in parallel
      const [totalCount, senators] = await Promise.all([
        Senator.countDocuments(filter),
        Senator.find(filter)
          .lean()
          .select("_id senatorId name state party photo status publishStatus")
          .skip(skip)
          .limit(limitNum > 0 ? limitNum : null),
      ]);

      const fetchedCount = senators.length;
      const totalPages = limitNum > 0 ? Math.ceil(totalCount / limitNum) : 1;

      if (fetchedCount === 0) {
        return res.status(200).json({
          message: "No senators found",
          info: [],
          totalCount,
          fetchedCount: 0,
          page: pageNum,
          totalPages,
          hasNextPage: false,
          hasPrevPage: false,
        });
      }

      const senatorIds = senators.map((s) => s._id);

      // Fetch all ratings in one go with optimized aggregation
      const ratings = await SenatorData.aggregate([
        {
          $match: {
            senateId: { $in: senatorIds },
            $or: [{ currentTerm: true }, { termId: { $exists: true } }],
          },
        },
        {
          $sort: {
            currentTerm: -1,
            termId: -1,
          },
        },
        {
          $group: {
            _id: "$senateId",
            rating: { $first: "$rating" },
            currentTerm: { $first: "$currentTerm" },
          },
        },
      ]);

      // Create rating map for faster lookup
      const ratingMap = new Map();
      ratings.forEach((r) => {
        ratingMap.set(r._id.toString(), {
          rating: r.rating,
          currentTerm: r.currentTerm,
        });
      });

      // Process senators data efficiently
      const senatorsWithRatings = senators.map((senator) => {
        const ratingData = ratingMap.get(senator._id.toString());

        return {
          id: senator._id,
          senatorId: senator.senatorId,
          name: senator.name.replace(/^Sen\.?\s+/i, ""),
          state: senator.state,
          party: senator.party,
          photo: senator.photo,
          status: senator.status,
          publishStatus: senator.publishStatus, // Include publish status in response
          rating: ratingData?.rating || "N/A",
          isCurrentTerm: ratingData?.currentTerm || false,
        };
      });

      res.status(200).json({
        message: "Retrieved successfully",
        info: senatorsWithRatings,
        totalCount, // Total documents matching the filter
        fetchedCount, // Number of documents actually returned in this request
        page: pageNum,
        totalPages,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
        pagination: {
          current: pageNum,
          limit: limitNum > 0 ? limitNum : totalCount,
          total: totalCount,
          pages: totalPages,
        },
      });
    } catch (error) {
      console.error("Error retrieving senators:", error);
      res.status(500).json({
        message: "Error retrieving senators",
        error:
          process.env.NODE_ENV === "production"
            ? "Internal server error"
            : error.message,
      });
    }
  }

  // Get a senator by ID for frontend display
  static async SenatorById(req, res) {
    try {
      const senatorId = req.params.id;

      // Fetch senator and current term data in parallel using Promise.all
      const [senator, currentTermData] = await Promise.all([
        Senator.findById(senatorId),
        SenatorData.findOne({
          senateId: senatorId,
          currentTerm: true,
        }).select("rating currentTerm"),
      ]);

      if (!senator) {
        return res.status(404).json({ message: "Senator not found" });
      }

      let ratingData = currentTermData;

      // If current term not found, fetch latest by termId
      if (!ratingData) {
        ratingData = await SenatorData.findOne({
          senateId: senatorId,
        })
          .sort({ termId: -1 })
          .select("rating currentTerm");
      }

      // Combine result
      const result = {
        ...senator.toObject(),
        rating: ratingData?.rating ?? null,
        isCurrentTerm: ratingData?.currentTerm ?? false,
      };

      res.status(200).json(result);
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error retrieving senator", error: error.message });
    }
  }

  //   // Update a senator by ID
  static async updateSenator(req, res) {
    try {
      const senatorId = req.params.id;
      const existingSenator = await Senator.findById(senatorId);

      if (!existingSenator) {
        return res.status(404).json({ message: "Senator not found" });
      }

      // Safe check for req.user
      const userId = req.user?._id || null;

      // Base update structure
      const updateData = {
        $set: {
          ...req.body,
          modifiedBy: userId,
          modifiedAt: new Date(),
        },
      };

      // Handle file upload
      if (req.file) {
        updateData.$set.photo = req.file.filename;
      }

      // Parse fields if needed
      if (typeof updateData.$set.editedFields === "string") {
        updateData.$set.editedFields = JSON.parse(updateData.$set.editedFields);
      }
      if (typeof updateData.$set.fieldEditors === "string") {
        updateData.$set.fieldEditors = JSON.parse(updateData.$set.fieldEditors);
      }

      // Clear fields if publishing
      if (updateData.$set.publishStatus === "published") {
        updateData.$set.editedFields = [];
        updateData.$set.fieldEditors = {};
        updateData.$set.history = []; // clear history completely on publish
      }

      // Determine if we should take a snapshot
      const canTakeSnapshot =
        !existingSenator.history ||
        existingSenator.history.length === 0 ||
        existingSenator.snapshotSource === "edited";

      if (
        canTakeSnapshot &&
        updateData.$set.publishStatus !== "published" &&
        (!existingSenator.history || existingSenator.history.length === 0)
      ) {
        const senatorDataList = await SenatorData.find({
          senateId: senatorId,
        }).lean();
        const currentState = existingSenator.toObject();

        // Clean up state
        delete currentState._id;
        delete currentState.createdAt;
        delete currentState.updatedAt;
        delete currentState.__v;
        delete currentState.history;
        currentState.senatorData = senatorDataList;

        const historyEntry = {
          oldData: currentState,
          timestamp: new Date(),
          actionType: "update",
        };

        updateData.$push = {
          history: historyEntry,
        };

        updateData.$set.snapshotSource = "edited";
      } else if (existingSenator.snapshotSource === "deleted_pending_update") {
        updateData.$set.snapshotSource = "edited";
      }

      const updatedSenator = await Senator.findByIdAndUpdate(
        senatorId,
        updateData,
        { new: true }
      );

      if (!updatedSenator) {
        return res.status(404).json({ message: "Senator not found" });
      }

      res.status(200).json({
        message: "Senator updated successfully",
        senator: updatedSenator,
      });
    } catch (error) {
      res.status(500).json({
        message: "Error updating senator",
        error: error.message,
      });
    }
  }

  static async discardSenatorChanges(req, res) {
    try {
      const { discardChanges } = require("../helper/discardHelper");

      // Custom restore logic for senator data
      const additionalRestoreLogic = async (originalState, senatorId) => {
        if (originalState.senatorData) {
          // Delete all current senator data
          await SenatorData.deleteMany({ senateId: senatorId });

          // Recreate from original state
          const recreatePromises = originalState.senatorData.map((data) => {
            const { _id, __v, updatedAt, ...cleanData } = data;
            return SenatorData.create({
              ...cleanData,
              createdAt: data.createdAt,
            });
          });

          await Promise.all(recreatePromises);
        }
      };

      const restoredSenator = await discardChanges({
        model: Senator,
        documentId: req.params.id,
        userId: req.user?._id,
        options: { new: true },
        additionalRestoreLogic,
      });

      res.status(200).json({
        message: "Restored to original state and history cleared",
        senator: restoredSenator,
      });
    } catch (error) {
      res.status(500).json({
        message: "Failed to restore to original state",
        error: error.message,
      });
    }
  }

  static async deleteSenator(req, res) {
    try {
      const deletedSenator = await Senator.findByIdAndDelete(req.params.id);
      if (!deletedSenator) {
        return res.status(404).json({ message: "Senator not found" });
      }
      res.status(200).json({ message: "Senator deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Error deleting senator", error });
    }
  }
  static async toggleSenatorPublishStatus(req, res) {
    try {
      const { id } = req.params;
      const { published } = req.body;

      if (typeof published !== "boolean") {
        return res.status(400).json({ message: "Published must be a boolean" });
      }

      const updated = await Senator.findByIdAndUpdate(
        id,
        { published },
        { new: true }
      );

      if (!updated) {
        return res.status(404).json({ message: "Senator not found" });
      }

      res.status(200).json({
        message: `Senator ${published ? "published" : "set to draft"}`,
        data: updated,
      });
    } catch (error) {
      res.status(500).json({ message: "Error updating publish status", error });
    }
  }
  //bulk update senators' publish status
  // PATCH /api/senators/publish-all
  static async bulkTogglePublishStatus(req, res) {
    try {
      const { published } = req.body;

      if (typeof published !== "boolean") {
        return res
          .status(400)
          .json({ message: "published must be true or false" });
      }

      const result = await Senator.updateMany({}, { published });

      res.status(200).json({
        message: `All senators ${published ? "published" : "set to draft"}`,
        modifiedCount: result.modifiedCount,
      });
    } catch (error) {
      res.status(500).json({ message: "Error updating all senators", error });
    }
  }

  //update published status of senator

  static async updateSenatorStatus(req, res) {
    try {
      const { publishStatus } = req.body;
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ message: "Missing senator ID" });
      }

      if (!["draft", "published", "under review"].includes(publishStatus)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const updatedSenator = await Senator.findByIdAndUpdate(
        id,
        { publishStatus },
        { new: true, runValidators: true }
      );

      if (!updatedSenator) {
        return res.status(404).json({ message: "Senator not found" });
      }

      return res.status(200).json({
        message: "Status updated successfully",
        senator: updatedSenator,
      });
    } catch (error) {
      return res.status(500).json({
        message: "Error updating senator status",
        error: error.message,
      });
    }
  }
}

module.exports = senatorController;
