const Senator = require("../models/senatorSchema");
const SenatorData = require("../models/senatorDataSchema");
const upload = require("../middlewares/fileUploads");

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

  // Get all senators for admin dashboard
  // GET /api/senators?published=true OR published=false
  static async getAllSenators(req, res) {
    try {
      const filter = {};
      if (req.query.published === "true") {
        filter.published = true;
      } else if (req.query.published === "false") {
        filter.published = false;
      }

      const senators = await Senator.find(filter);
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

  // Get all senators for  frontend display
  static async Senators(req, res) {
    try {
      const { state, party, name } = req.query;

      // Build filter object dynamically
      const filter = {};
      if (state) filter.state = new RegExp(`^${state}$`, "i"); // exact match, case-insensitive
      if (party) filter.party = new RegExp(`^${party}$`, "i"); // exact match, case-insensitive
      if (name) filter.name = new RegExp(name, "i"); // partial match in name

      const senators = await Senator.find(filter).lean(); // filtered fast read-only fetch

      const senatorsWithRatings = await Promise.all(
        senators.map(async (senator) => {
          // Try current term rating
          let ratingData = await SenatorData.findOne({
            senateId: senator._id,
            currentTerm: true,
          })
            .select("rating currentTerm")
            .lean();

          // If not found, fallback to most recent term
          if (!ratingData) {
            ratingData = await SenatorData.findOne({
              senateId: senator._id,
            })
              .sort({ termId: -1 })
              .select("rating currentTerm")
              .lean();
          }

          // Remove "Sen." or "Sen" from start of name
          const cleanName = senator.name.replace(/^Sen\.?\s+/i, "");

          return {
            id: senator._id,
            senatorId: senator.senatorId,
            name: cleanName,
            state: senator.state,
            party: senator.party,
            photo: senator.photo,
            status: senator.status,
            rating: ratingData?.rating || "N/A",
            isCurrentTerm: ratingData?.currentTerm || false,
          };
        })
      );

      res.status(200).json({
        message: "Retrieved successfully",
        info: senatorsWithRatings,
      });
    } catch (error) {
      res.status(500).json({
        message: "Error retrieving senators",
        error: error.message,
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

      if (canTakeSnapshot && updateData.$set.publishStatus !== "published" && (!existingSenator.history || existingSenator.history.length === 0)) {
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
      const senator = await Senator.findById(req.params.id);
      if (!senator) {
        return res.status(404).json({ message: "Senator not found" });
      }

      // Check if there's any history available
      if (!senator.history || senator.history.length === 0) {
        return res
          .status(400)
          .json({ message: "No history available to restore" });
      }

      // Get the original state (index 0)
      const originalState = senator.history[0].oldData;

      // Restore the senator to its original state and empty the history
      const restoredSenator = await Senator.findByIdAndUpdate(
        req.params.id,
        {
          ...originalState,
          history: [], // Empty the history array
          snapshotSource: "edited", // Reset snapshot source if needed
          modifiedAt: new Date(), // Update modification timestamp
        },
        { new: true }
      );

      // Restore senatorData if it exists in the original state
      if (originalState.senatorData) {
        // Delete all current senator data
        await SenatorData.deleteMany({ senateId: req.params.id });

        // Recreate from original state
        const recreatePromises = originalState.senatorData.map((data) => {
          const { _id, __v,updatedAt, ...cleanData } = data;
         return SenatorData.create({
          ...cleanData,
          createdAt: data.createdAt,
        });
        });

        await Promise.all(recreatePromises);
      }

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
  // static async discardSenatorChanges(req, res) {
  //   try {
  //     const senator = await Senator.findById(req.params.id);
  //     if (!senator) {
  //       return res.status(404).json({ message: "Senator not found" });
  //     }

  //     if (!senator.previousState) {
  //       return res.status(400).json({ message: "No previous state available" });
  //     }

  //     // Restore senator fields (except _id, createdAt, updatedAt, __v)
  //     const { _id, createdAt, updatedAt, __v, senatorData, ...revertedData } = senator.previousState;

  //     // Restore all related SenatorData
  //     if (Array.isArray(senatorData)) {
  //       // Remove all current SenatorData for this senator
  //       await SenatorData.deleteMany({ senateId: senator._id });

  //       // Re-create each SenatorData from the snapshot
  //       for (const data of senatorData) {
  //         // Remove _id and timestamps to avoid duplicate key errors
  //         const { _id, createdAt, updatedAt, __v, ...cleanData } = data;
  //         await SenatorData.create({ ...cleanData, senateId: senator._id });
  //       }
  //     }

  //     // Restore senator document
  //     const revertedSenator = await Senator.findByIdAndUpdate(
  //       req.params.id,
  //       {
  //         ...revertedData,
  //         previousState: null, // Clear after discard
  //       },
  //       { new: true }
  //     );

  //     res.status(200).json({
  //       message: "Changes discarded and senator data restored.",
  //       senator: revertedSenator,
  //     });
  //   } catch (error) {
  //     res.status(500).json({
  //       message: "Failed to discard changes",
  //       error: error.message,
  //     });
  //   }
  // }
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

  //   static async discardSenatorChanges(req, res) {
  //   try {
  //     const senator = await Senator.findById(req.params.id);
  //     if (!senator) {
  //       return res.status(404).json({ message: "Senator not found" });
  //     }

  //     if (!senator.previousState) {
  //       return res.status(400).json({ message: "No previous state available" });
  //     }

  //     // Restore senator fields (except _id, createdAt, updatedAt, __v)
  //     const { _id, createdAt, updatedAt, __v, senatorData, ...revertedData } = senator.previousState;

  //     // Restore all related SenatorData
  //     if (Array.isArray(senatorData)) {
  //       // Remove all current SenatorData for this senator
  //       await SenatorData.deleteMany({ senateId: senator._id });

  //       // Re-create each SenatorData from the snapshot
  //       for (const data of senatorData) {
  //         // Remove _id and timestamps to avoid duplicate key errors
  //         const { _id, createdAt, updatedAt, __v, ...cleanData } = data;
  //         await SenatorData.create({ ...cleanData, senateId: senator._id });
  //       }
  //     }

  //     // Restore senator document
  //     const revertedSenator = await Senator.findByIdAndUpdate(
  //       req.params.id,
  //       {
  //         ...revertedData,
  //         previousState: null, // Clear after discard
  //       },
  //       { new: true }
  //     );

  //     res.status(200).json({
  //       message: "Changes discarded and senator data restored.",
  //       senator: revertedSenator,
  //     });
  //   } catch (error) {
  //     res.status(500).json({
  //       message: "Failed to discard changes",
  //       error: error.message,
  //     });
  //   }
  // }
}

module.exports = senatorController;
