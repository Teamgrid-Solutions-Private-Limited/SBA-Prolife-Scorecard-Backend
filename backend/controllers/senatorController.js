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
      const senators = await Senator.find().lean(); // fast read-only fetch

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

          // Clean fast mapping
          return {
            id: senator._id,
            senatorId: senator.senatorId,
            name: senator.name,
            state: senator.state,
            party: senator.party,
            photo: senator.photo,
            status: senator.status,
            rating: ratingData?.rating || "N/A", // Default to "N/A" if no rating found
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

  // Update a senator by ID
  // In senatorController.js

  static async updateSenator(req, res) {
    try {
      const senatorId = req.params.id;
      let updateData = req.body;

      // Handle file upload
      if (req.file) {
        updateData.photo = req.file.filename;
      }

      // Parse the editedFields and fieldEditors if they were stringified
      if (typeof updateData.editedFields === 'string') {
        updateData.editedFields = JSON.parse(updateData.editedFields);
      }

      if (typeof updateData.fieldEditors === 'string') {
        updateData.fieldEditors = JSON.parse(updateData.fieldEditors);
      }

      // Clear editedFields if publishing
      if (updateData.publishStatus === 'published') {
        updateData.editedFields = [];
      }
      const existingSenator = await Senator.findById(senatorId);
      if (!existingSenator) {
        return res.status(404).json({ message: 'Senator not found' });
      }

      // Save history BEFORE update
      // const updatedHistory = await SenatorHistory.findOneAndUpdate(
      //   { senatorId: existingSenator._id },
      //   {
      //     $push: {
      //       history: {
      //         oldData: existingSenator.toObject(),
      //         actionType: 'update'
      //       }
      //     }
      //   },
      //   { upsert: true, new: true }
      // );

      //console.log("Updated Senator History:", updatedHistory);


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
        senator: updatedSenator
      });
    } catch (error) {
      console.error("Update error:", error);
      res.status(500).json({
        message: "Error updating senator",
        error: error.message
      });
    }
  }
  // Delete a senator by ID
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

      res
        .status(200)
        .json({
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

  // Undo senator update
  static async undoSenatorUpdate(req, res) {
  try {
    const senatorId = req.params.id;

    // Find the latest oldData for this senator
    const historyDoc = await SenatorHistory.findOne({ senatorId })
      .sort({ 'history.timestamp': -1 }) // optional if timestamps inside `history`
      .lean();

    if (!historyDoc || !historyDoc.history.length) {
      return res.status(404).json({ message: "No history found for this senator." });
    }

    const lastHistoryEntry = historyDoc.history[historyDoc.history.length - 1];

    // Restore the senator with oldData
    const restoredSenator = await Senator.findByIdAndUpdate(
      senatorId,
      lastHistoryEntry.oldData,
      { new: true }
    );

    return res.status(200).json({
      message: "Undo successful. Senator restored to previous state.",
      restoredSenator
    });
  } catch (error) {
    console.error("Undo error:", error);
    return res.status(500).json({ message: "Failed to undo senator update." });
  }
}
}

module.exports = senatorController;
