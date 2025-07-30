const House = require("../models/representativeSchema");
const RepresentativeData = require("../models/representativeDataSchema");
const upload = require("../middlewares/fileUploads");

class representativeController {
  // Create a new House with photo upload
  static createHouse = async (req, res) => {
    try {
      const { name, district, party, status } = req.body;

      const photo = req.file ? req.file.filename : null; // If a file is uploaded, use its path, otherwise null

      const newHouse = new House({
        name,
        district,
        party,
        photo, // Store the photo path in the database
        status,
        publishStatus: "draft", // Default publish status
      });

      await newHouse.save();
      res.status(201).json(newHouse);
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error creating house", error: error.message });
    }
  };
  // Get all  House for admin dashboard
  static async getAllHouse(req, res) {
    try {
      const house = await House.find();
      res.status(200).json(house);
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error retrieving  House", error: error.message });
    }
  }

  // Get a  House by ID for admin dashboard
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

  // Get all House for frontend display
  static async AllHouse(req, res) {
    try {
      const houses = await House.find().lean(); // fast read-only fetch

      const housesWithRatings = await Promise.all(
        houses.map(async (house) => {
          // Try current term rating
          let ratingData = await RepresentativeData.findOne({
            houseId: house._id,
            currentTerm: true,
          })
            .select("rating currentTerm summary")
            .lean();

          // If not found, fallback to most recent term
          if (!ratingData) {
            ratingData = await RepresentativeData.findOne({
              houseId: house._id,
            })
              .sort({ termId: -1 })
              .select("rating currentTerm summary")
              .lean();
          }

          // Clean fast mapping
          return {
            id: house._id,
            name: house.name,
            district: house.district,
            party: house.party,
            photo: house.photo,
            status: house.status,
            rating: ratingData?.rating || "N/A", // Default to "N/A" if no rating found
            isCurrentTerm: ratingData?.currentTerm || false,
            summary: ratingData?.summary || null,
          };
        })
      );

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

  // Get a House by ID for frontend display
  static async HouseById(req, res) {
    try {
      const houseId = req.params.id;

      // Fetch house and current term data in parallel using Promise.all
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

      // If current term not found, fetch latest by termId
      if (!ratingData) {
        ratingData = await RepresentativeData.findOne({
          houseId: houseId,
        })
          .sort({ termId: -1 })
          .select("rating currentTerm summary");
      }

      // Combine result
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

  // Update a  House by ID
  static async updateHouse(req, res) {
    try {
      const houseId = req.params.id;
      const updateData = { ...req.body };

      // If a new photo is uploaded, update the photo field
      if (req.file) {
        updateData.photo = req.file ? req.file.filename : null;
      }
      const updatedHouse = await House.findByIdAndUpdate(houseId, updateData, {
        new: true,
      });
      if (!updatedHouse) {
        return res.status(404).json({ message: "House not found" });
      }
      res
        .status(200)
        .json({
          message: "house data updated successfully",
          info: updatedHouse,
        });
    } catch (error) {
      res.status(500).json({ message: "Error updating house", error });
    }
  }

  // Delete a  House by ID
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

  //update published status of representative

  static async updateRepresentativeStatus(req, res) {
    try {
      const { publishStatus } = req.body;
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ message: "Missing representative ID" });
      }

      if (!["draft", "published" , "under review"].includes(publishStatus)) {
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
