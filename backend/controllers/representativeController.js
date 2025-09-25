const House = require("../models/representativeSchema");
const RepresentativeData = require("../models/representativeDataSchema");
const upload = require("../middlewares/fileUploads");

class representativeController {
  static createHouse = async (req, res) => {
    try {
      const { name, district, party, status } = req.body;

      const photo = req.file ? req.file.filename : null; 

      const newHouse = new House({
        name,
        district,
        party,
        photo,
        status,
        publishStatus: "draft",
      });

      await newHouse.save();
      res.status(201).json(newHouse);
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error creating house", error: error.message });
    }
  };
  static async getAllHouse(req, res) {
    try {
      const house = await House.find()
        .select("name repId district party photo status publishStatus")
        .lean();

      res.status(200).json(house);
    } catch (error) {
      res.status(500).json({
        message: "Error retrieving House",
        error: error.message,
      });
    }
  }
  static async getHouseById(req, res) {
    try {
      const house = await House.findById(req.params.id);
      if (!house) {
        return res.status(404).json({ message: " House not found" });
      }
      res.status(200).json(house);
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error retrieving  House", error: error.message });
    }
  }
  static async AllHouse(req, res) {
    try {
      const { district, party, name } = req.query;
      const filter = {
        ...(district && { district: new RegExp(`^${district}$`, "i") }),
        ...(party && { party: new RegExp(`^${party}$`, "i") }),
        ...(name && { name: new RegExp(name, "i") }),
      };
      const houses = await House.find(filter)
        .select("_id name district party photo status")
        .lean();
      const houseIds = houses.map((house) => house._id);
      const allRatingData = await RepresentativeData.aggregate([
        {
          $match: {
            houseId: { $in: houseIds },
          },
        },
        {
          $sort: {
            houseId: 1,
            currentTerm: -1,
            termId: -1,
          },
        },
        {
          $group: {
            _id: "$houseId",
            ratingData: { $first: "$$ROOT" },
          },
        },
        {
          $project: {
            _id: 0,
            houseId: "$_id",
            rating: "$ratingData.rating",
            currentTerm: "$ratingData.currentTerm",
            //summary: "$ratingData.summary",
          },
        },
      ]);
      const ratingMap = new Map(
        allRatingData.map((item) => [item.houseId.toString(), item])
      );
      const housesWithRatings = houses.map((house) => {
        const ratingInfo = ratingMap.get(house._id.toString()) || {};
        const cleanName = house.name.replace(/^Rep\.?\s+/i, "");

        return {
          id: house._id,
          name: cleanName,
          district: house.district,
          party: house.party,
          photo: house.photo,
          status: house.status,
          rating: ratingInfo.rating || "N/A",
          isCurrentTerm: ratingInfo.currentTerm || false,
          //summary: ratingInfo.summary || null,
        };
      });

      res.status(200).json({
        message: "Retrieved successfully",
        info: housesWithRatings,
      });
    } catch (error) {
      console.error("Error in getAllHouse:", error);
      res.status(500).json({
        message: "Error retrieving representatives",
        error: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      });
    }
  }
  static async HouseById(req, res) {
    try {
      const houseId = req.params.id;
      const [house, currentTermData] = await Promise.all([
        House.findById(houseId),
        RepresentativeData.findOne({
          houseId: houseId,
          currentTerm: true,
        }).select("rating currentTerm summary"),
      ]);
      if (!house) {
        return res.status(404).json({ message: "Representative not found" });
      }
      let ratingData = currentTermData;
      if (!ratingData) {
        ratingData = await RepresentativeData.findOne({
          houseId: houseId,
        })
          .sort({ termId: -1 })
          .select("rating currentTerm summary");
      }
      const result = {
        ...house.toObject(),
        rating: ratingData?.rating ?? null,
        isCurrentTerm: ratingData?.currentTerm ?? false,
        summary: ratingData?.summary ?? null,
      };

      res.status(200).json({
        message: "Retrieved successfully",
        info: result,
      });
    } catch (error) {
      console.error("Error in getHouseById:", error);
      res.status(500).json({
        message: "Error retrieving representative",
        error: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      });
    }
  }
  static async updateHouse(req, res) {
    try {
      const houseId = req.params.id;
      const existingHouse = await House.findById(houseId);

      if (!existingHouse) {
        return res.status(404).json({ message: "House not found" });
      }
      const userId = req.user?._id || null;
      const updateData = {
        $set: {
          ...req.body,
          modifiedBy: userId,
          modifiedAt: new Date(),
        },
      };
      if (req.file) {
        updateData.$set.photo = req.file.filename;
      }
      if (typeof updateData.$set.editedFields === "string") {
        updateData.$set.editedFields = JSON.parse(updateData.$set.editedFields);
      }
      if (typeof updateData.$set.fieldEditors === "string") {
        updateData.$set.fieldEditors = JSON.parse(updateData.$set.fieldEditors);
      }
      if (updateData.$set.publishStatus === "published") {
        updateData.$set.editedFields = [];
        updateData.$set.fieldEditors = {};
        updateData.$set.history = []; 
      }
      const canTakeSnapshot =
        !existingHouse.history ||
        existingHouse.history.length === 0 ||
        existingHouse.snapshotSource === "edited";
      const noHistory =
        !existingHouse.history || existingHouse.history.length === 0;
      if (
        canTakeSnapshot &&
        updateData.$set.publishStatus !== "published" &&
        noHistory
      ) {
        const representativeDataList = await RepresentativeData.find({
          houseId: houseId,
        }).lean();
        const currentState = existingHouse.toObject();
        delete currentState._id;
        delete currentState.createdAt;
        delete currentState.updatedAt;
        delete currentState.__v;
        delete currentState.history;
        currentState.representativeData = representativeDataList;

        const historyEntry = {
          oldData: currentState,
          timestamp: new Date(),
          actionType: "update",
        };

        updateData.$push = {
          history: historyEntry,
        };

        updateData.$set.snapshotSource = "edited";
      } else if (existingHouse.snapshotSource === "deleted_pending_update") {
        updateData.$set.snapshotSource = "edited";
      }

      const updatedHouse = await House.findByIdAndUpdate(houseId, updateData, {
        new: true,
      });

      if (!updatedHouse) {
        return res
          .status(404)
          .json({ message: "House not found after update" });
      }

      res.status(200).json({
        message: "House updated successfully",
        house: updatedHouse,
      });
    } catch (error) {
      console.error("Error updating house:", error);
      res.status(500).json({
        message: "Error updating house",
        error: error.message,
      });
    }
  }
  static async discardHouseChanges(req, res) {
    try {
      const { discardChanges } = require("../helper/discardHelper");
      const additionalRestoreLogic = async (originalState, houseId) => {
        if (originalState.representativeData) {
          await RepresentativeData.deleteMany({ houseId: houseId });
          const recreatePromises = originalState.representativeData.map(
            (data) => {
              const { _id, __v, updatedAt, ...cleanData } = data;
              return RepresentativeData.create({
                ...cleanData,
                createdAt: data.createdAt,
              });
            }
          );
          await Promise.all(recreatePromises);
        }
      };

      const restoredHouse = await discardChanges({
        model: House,
        documentId: req.params.id,
        userId: req.user?._id,
        options: { new: true },
        additionalRestoreLogic,
      });

      res.status(200).json({
        message: "Restored to original state and history cleared",
        house: restoredHouse,
      });
    } catch (error) {
      res.status(500).json({
        message: "Failed to restore to original state",
        error: error.message,
      });
    }
  }
  static async deleteHouse(req, res) {
    try {
      const deletedHouse = await House.findByIdAndDelete(req.params.id);
      if (!deletedHouse) {
        return res.status(404).json({ message: "House not found" });
      }
      res.status(200).json({ message: "House deleted successfully" });
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error deleting House", error: error.message });
    }
  }

  static async updateRepresentativeStatus(req, res) {
    try {
      const { publishStatus } = req.body;
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ message: "Missing representative ID" });
      }

      if (!["draft", "published", "under review"].includes(publishStatus)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const updatedRepresentative = await House.findByIdAndUpdate(
        id,
        { publishStatus },
        { new: true, runValidators: true }
      );

      if (!updatedRepresentative) {
        return res.status(404).json({ message: "Representative not found" });
      }

      return res.status(200).json({
        message: "Status updated successfully",
        representative: updatedRepresentative,
      });
    } catch (error) {
      return res.status(500).json({
        message: "Error updating representative status",
        error: error.message,
      });
    }
  }
}

module.exports = representativeController;
