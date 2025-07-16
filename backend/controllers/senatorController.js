const Senator = require('../models/senatorSchema');  
const SenatorData = require('../models/senatorDataSchema');
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

  // Get all senators for admin dashboard
static async getAllSenators(req, res) {
    try {
      const senators = await Senator.find();
      res.status(200).json({message:"Retrive successfully",info:senators});
    } catch (error) {
      res.status(500).json({ message: 'Error retrieving senators', error:error.message });
    }
  }

  // Get a senator by ID for admin dashboard
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


  // Get all senators for  frontend display
static async Senators(req, res) {
  try {
    const senators = await Senator.find().lean(); // fast read-only fetch

    const senatorsWithRatings = await Promise.all(
      senators.map(async (senator) => {
        // Try current term rating
        let ratingData = await SenatorData.findOne({
          senateId: senator._id,
          currentTerm: true
        }).select('rating currentTerm').lean();

        // If not found, fallback to most recent term
        if (!ratingData) {
          ratingData = await SenatorData.findOne({
            senateId: senator._id
          })
          .sort({ termId: -1 })
          .select('rating currentTerm')
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
          rating: ratingData?.rating || null,
          isCurrentTerm: ratingData?.currentTerm || false
        };
      })
    );

    res.status(200).json({
      message: "Retrieved successfully",
      info: senatorsWithRatings
    });
  } catch (error) {
    res.status(500).json({
      message: "Error retrieving senators",
      error: error.message
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
        currentTerm: true
      }).select('rating currentTerm')
    ]);

    if (!senator) {
      return res.status(404).json({ message: 'Senator not found' });
    }

    let ratingData = currentTermData;

    // If current term not found, fetch latest by termId
    if (!ratingData) {
      ratingData = await SenatorData.findOne({
        senateId: senatorId
      }).sort({ termId: -1 }).select('rating currentTerm');
    }

    // Combine result
    const result = {
      ...senator.toObject(),
      rating: ratingData?.rating ?? null,
      isCurrentTerm: ratingData?.currentTerm ?? false
    };

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving senator', error: error.message });
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
