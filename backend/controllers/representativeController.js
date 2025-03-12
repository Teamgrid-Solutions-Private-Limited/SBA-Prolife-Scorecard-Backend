const House = require('../models/representativeSchema');  
const upload = require('../middlewares/fileUploads'); 

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
            status
          });
    
          await newHouse.save();
          res.status(201).json(newHouse);
        } catch (error) {
          res.status(500).json({ message: 'Error creating house', error:error.message });
        }
  };

  // Get all  House
  static async getAllHouse(req, res) {
    try {
      const house = await  House.find();
      res.status(200).json(house);
    } catch (error) {
      res.status(500).json({ message: 'Error retrieving  House', error:error.message });
    }
  }

  // Get a  House by ID
  static async getHouseById(req, res) {
    try {
      const  house = await  House.findById(req.params.id);
      if (!house) {
        return res.status(404).json({ message: ' House not found' });
      }
      res.status(200).json( house);
    } catch (error) {
      res.status(500).json({ message: 'Error retrieving  House', error:error.message });
    }
  }

  // Update a  House by ID
  static async updateHouse(req, res) {
      try {
    
          const houseId= req.params.id;
          const updateData= {...req.body};
    
            // If a new photo is uploaded, update the photo field
            if (req.file) {
              updateData.photo = req.file ? req.file.filename : null;
            }
          const updatedHouse = await House.findByIdAndUpdate(
            houseId,
            updateData,
            { new: true }
          );
          if (!updatedHouse) {
            return res.status(404).json({ message: 'House not found' });
          }
          res.status(200).json({message:"house data updated successfully",info:updatedHouse});
        } catch (error) {
          res.status(500).json({ message: 'Error updating house', error });
        }
  }

  // Delete a  House by ID
  static async deleteHouse(req, res) {
    try {
      const deletedHouse = await House.findByIdAndDelete(req.params.id);
      if (!deletedHouse) {
        return res.status(404).json({ message: 'House not found' });
      }
      res.status(200).json({ message: 'House deleted successfully' });
    } catch (error) {
      res.status(500).json({ message: 'Error deleting House', error:error.message });
    }
  }
}

module.exports = representativeController;
