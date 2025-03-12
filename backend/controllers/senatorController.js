const Senator = require('../models/senatorSchema');  
const upload = require('../middlewares/fileUploads'); 

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
        status
      });

      await newSenator.save();
      

      res.status(201).json(newSenator);
    } catch (error) {
      res.status(500).json({ message: 'Error creating senator', error:error.message });
    }
  };

  // Get all senators
  static async getAllSenators(req, res) {
    try {
      const senators = await Senator.find();
      res.status(200).json({message:"Retrive successfully",info:senators});
    } catch (error) {
      res.status(500).json({ message: 'Error retrieving senators', error:error.message });
    }
  }

  // Get a senator by ID
  static async getSenatorById(req, res) {
    try {
      const senator = await Senator.findById(req.params.id);
      if (!senator) {
        return res.status(404).json({ message: 'Senator not found' });
      }
      res.status(200).json(senator);
    } catch (error) {
      res.status(500).json({ message: 'Error retrieving senator', error });
    }
  }

  // Update a senator by ID
  static async updateSenator(req, res) {
    try {

      const senatorId= req.params.id;
      const updateData= {...req.body};

        // If a new photo is uploaded, update the photo field
        if (req.file) {
          updateData.photo = req.file ? req.file.filename : null;
        }
      const updatedSenator = await Senator.findByIdAndUpdate(
        senatorId,
        updateData,
        { new: true }
      );
      if (!updatedSenator) {
        return res.status(404).json({ message: 'Senator not found' });
      }
      res.status(200).json({message:"senator data updated successfully",info:updatedSenator});
    } catch (error) {
      res.status(500).json({ message: 'Error updating senator', error });
    }
  }

  // Delete a senator by ID
  static async deleteSenator(req, res) {
    try {
      const deletedSenator = await Senator.findByIdAndDelete(req.params.id);
      if (!deletedSenator) {
        return res.status(404).json({ message: 'Senator not found' });
      }
      res.status(200).json({ message: 'Senator deleted successfully' });
    } catch (error) {
      res.status(500).json({ message: 'Error deleting senator', error });
    }
  }
}

module.exports = senatorController;
