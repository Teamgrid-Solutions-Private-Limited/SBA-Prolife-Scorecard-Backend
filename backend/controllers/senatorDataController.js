const SenatorData = require('../models/senatorDataSchema'); 

class senatorDataController {
  
  // Create a new senator data
  static async createSenatorData(req, res) {
    try {
      const { senateId, termId, currentTerm, summary, rating, votesScore, activitiesScore } = req.body;

       
      const newSenatorData = new SenatorData({
        senateId,
        termId,
        currentTerm,
        summary,
        rating,
        votesScore,
        activitiesScore
      });

      // Save the senator data to the database
      await newSenatorData.save();

      res.status(201).json(newSenatorData);
    } catch (error) {
      res.status(500).json({ message: 'Error creating senator data', error });
    }
  }

  // Get all senator data with populated votesScore and activitiesScore
  static async getAllSenatorData(req, res) {
    try {
      const senatorData = await SenatorData.find()
        .populate('votesScore.voteId')  
        .populate('activitiesScore.activityId');  

      res.status(200).json(senatorData);
    } catch (error) {
      res.status(500).json({ message: 'Error retrieving senator data', error });
    }
  }

  // Get senator data by ID with populated votesScore and activitiesScore
  static async getSenatorDataById(req, res) {
    try {
      const senatorData = await SenatorData.findById(req.params.id)
        .populate('votesScore.voteId')
        .populate('activitiesScore.activityId');

      if (!senatorData) {
        return res.status(404).json({ message: 'Senator data not found' });
      }

      res.status(200).json(senatorData);
    } catch (error) {
      res.status(500).json({ message: 'Error retrieving senator data', error });
    }
  }

  // Update senator data by ID
// controller/senatorDataController.js

static async updateSenatorData(req, res) {
  try {
    const { id } = req.params;
    const { changedBy, ...updateFields } = req.body;

    const updatedSenatorData = await SenatorData.findOneAndUpdate(
      { _id: id },
      updateFields,
      {
        new: true,
        runValidators: true,
        context: "query",
        changedBy: changedBy||null, // ✅ Pass in explicitly for logging
      }
    );

    if (!updatedSenatorData) {
      return res.status(404).json({ message: "Senator data not found" });
    }

    res.status(200).json(updatedSenatorData);
  } catch (error) {
    console.error("Update error:", error);
    res.status(500).json({ message: "Error updating senator data", error });
  }
}



  // Delete senator data by ID
  static async deleteSenatorData(req, res) {
    try {
      const deletedSenatorData = await SenatorData.findByIdAndDelete(req.params.id);

      if (!deletedSenatorData) {
        return res.status(404).json({ message: 'Senator data not found' });
      }

      res.status(200).json({ message: 'Senator data deleted successfully' });
    } catch (error) {
      res.status(500).json({ message: 'Error deleting senator data', error });
    }
  }


  // Get senator data by senator ID with populated termId and senatorId
static async getSenatorDataBySenatorId(req, res) {
  try {
    const senateId = req.params.id;
    const senatorData = await SenatorData.find({ senateId })
      .populate('termId')  
      .populate('senateId')
      .populate('votesScore.voteId')
      .populate('activitiesScore.activityId');

    if (!senatorData) {
      return res.status(404).json({ message: 'Senator data not found' });
    }

 
    res.status(200).json({message:"Retrive successfully",info:senatorData});
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving senator data', error:error.message });
  }
}

}

module.exports = senatorDataController;
