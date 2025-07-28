const Vote = require('../models/voteSchema');
const upload = require('../middlewares/fileUploads'); 
class voteController {
  
  // Create a new vote with file upload for readMore
 

 

  static async createVote(req, res) {
    // Use multer to handle the file upload
    upload.single('readMore')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ message: err.message });
      }
  
      try {
        // Extract other fields from the body
        const { type, title, shortDesc, longDesc, rollCall, date, congress, termId , sbaPosition } = req.body;
  
        // Get the uploaded file path (null if no file is uploaded)
        const readMore = req.file ? `/uploads/documents/${req.file.filename}` : null;
  
        // Create a new vote document
        const newVote = new Vote({
          type,
          title,
          shortDesc,
          longDesc,
          rollCall,
          readMore, // Attach the file path if a file is uploaded
          date,
          congress,
          termId,
          sbaPosition,
          status: 'draft', // Default status
        });
  
        // Save the new vote to the database
        await newVote.save();
  
        // Send a successful response with the created vote data
        res.status(201).json({ message: "Vote created successfully", info: newVote });
  
      } catch (error) {
        res.status(500).json({ message: 'Error creating vote', error: error.message });
      }
    });
  }
  

  // Get all votes with populated termId
// Get all votes with optional filtering by 'published' and populated termId
static async getAllVotes(req, res) {
  try {
    const filter = {};

    // Check if query param is present and valid
    if (req.query.published === 'true') {
      filter.published = true;
    } else if (req.query.published === 'false') {
      filter.published = false;
    }

    const votes = await Vote.find(filter).populate('termId');
    res.status(200).json(votes);  
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving votes', error: error.message });
  }
}


  // Get a vote by ID with populated termId
  static async getVoteById(req, res) {
    try {
      const vote = await Vote.findById(req.params.id).populate('termId');
      if (!vote) {
        return res.status(404).json({ message: 'Vote not found' });
      }
      res.status(200).json(vote);  
    } catch (error) {
      res.status(500).json({ message: 'Error retrieving vote', error });
    }
  }

 // Controller to bulk update SBA Position for multiple votes
static async bulkUpdateSbaPosition(req, res) {
  try {
    const { ids, sbaPosition } = req.body;

    // Validate input
    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ message: 'Invalid bill IDs provided' });
    }

    if (sbaPosition !== 'Yes' && sbaPosition !== 'No') {
      return res.status(400).json({ message: 'Invalid SBA Position value' });
    }

    // Update all matching votes
    const result = await Vote.updateMany(
      { _id: { $in: ids } },
      { $set: { sbaPosition } },
      { new: true }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ message: 'No matching bills found or no changes made' });
    }

    // Get the updated votes to return
    const updatedVotes = await Vote.find({ _id: { $in: ids } })
      .populate('termId'); // Populate the referenced term if needed

    res.status(200).json({
      message: `${result.modifiedCount} bills updated successfully`,
      updatedBills: updatedVotes
    });

  } catch (error) {
    res.status(500).json({ 
      message: 'Error bulk updating bills',
      error: error.message 
    });
  }
}
 
// Controller to update a vote
static async updateVote(req, res) {
  try {
    // Use multer to handle file upload
    upload.single('readMore')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ message: err.message });
      }

      const voteID = req.params.id;
      let updateData = { ...req.body }; // Capture other fields from the request

      // If a new file is uploaded for 'readMore', save the file path
      if (req.file) {
        updateData.readMore = `/uploads/${req.file.filename}`;
      }

      // Update the vote in the database
      const updatedVote = await Vote.findByIdAndUpdate(voteID, updateData, { new: true })
        .populate('termId'); // Populate the referenced term (optional)

      if (!updatedVote) {
        return res.status(404).json({ message: 'Vote not found' });
      }

      // Send the updated vote in the response
      res.status(200).json({ message: 'Vote updated successfully', info: updatedVote });
    });
  } catch (error) {
    res.status(500).json({ message: 'Error updating vote', error });
  }
}

  
  // Delete a vote by ID
  static async deleteVote(req, res) {
    try {
      const deletedVote = await Vote.findByIdAndDelete(req.params.id);

      if (!deletedVote) {
        return res.status(404).json({ message: 'Vote not found' });
      }

      res.status(200).json({ message: 'Vote deleted successfully' });
    } catch (error) {
      res.status(500).json({ message: 'Error deleting vote', error });
    }
  }

  // Update status (draft/published)
static async updateVoteStatus(req, res) {
  try {
    const { status } = req.body;

    if (!['draft', 'published', 'under review'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const updatedVote = await Vote.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!updatedVote) {
      return res.status(404).json({ message: 'Vote not found' });
    }

    res.status(200).json({ message: 'Status updated successfully', vote: updatedVote });
  } catch (error) {
    res.status(500).json({ message: 'Error updating vote status', error: error.message });
  }
}

  //admin only toggle published status

  // Toggle publish status - Admin only
static async togglePublishStatus(req, res) {
  try {
    const { id } = req.params;
    const { published } = req.body;

    if (typeof published !== 'boolean') {
      return res.status(400).json({ message: 'published must be true or false' });
    }

    const updatedVote = await Vote.findByIdAndUpdate(
      id,
      { published },
      { new: true }
    ).populate('termId');

    if (!updatedVote) {
      return res.status(404).json({ message: 'Vote not found' });
    }

    res.status(200).json({
      message: `Vote ${published ? 'published' : 'set to draft'}`,
      vote: updatedVote
    });
  } catch (error) {
    res.status(500).json({ message: 'Error toggling publish status', error: error.message });
  }
}


}

module.exports = voteController;
