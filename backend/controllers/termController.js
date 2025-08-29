const Term = require('../models/termSchema');  

class termController {
  
  // Create a new term
static async createTerm(req, res) {
  try {
    const { startYear, endYear } = req.body;
 
    if (!startYear || !endYear) {
      return res.status(400).json({ message: "Start year and End year are required" });
    }
 
    if (startYear >= endYear) {
      return res.status(400).json({ message: "End year must be greater than start year" });
    }
 
    // Generate name (2021-2022)
    const name = `${startYear}-${endYear}`;
 
    // Congresses will be automatically calculated by the pre-save middleware
    const newTerm = new Term({
      name,
      startYear,
      endYear
    });
 
    await newTerm.save();
    res.status(201).json(newTerm);
 
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "A term with these years already exists" });
    }
    res.status(500).json({ message: "Error creating term", error: error.message });
  }
}

  // Get all terms
  static async getAllTerms(req, res) {
    try {
      const terms = await Term.find();
      res.status(200).json(terms); // Return all terms
    } catch (error) {
      res.status(500).json({ message: 'Error retrieving terms', error });
    }
  }

  // Get a term by ID
  static async getTermById(req, res) {
    try {
      const term = await Term.findById(req.params.id);
      if (!term) {
        return res.status(404).json({ message: 'Term not found' });
      }
      res.status(200).json(term); // Return the term
    } catch (error) {
      res.status(500).json({ message: 'Error retrieving term', error });
    }
  }

  // Update a term by ID
  static async updateTerm(req, res) {
    try {
      const updatedTerm = await Term.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true } // Return the updated document
      );

      if (!updatedTerm) {
        return res.status(404).json({ message: 'Term not found' });
      }

      res.status(200).json(updatedTerm); // Return the updated term
    } catch (error) {
      res.status(500).json({ message: 'Error updating term', error });
    }
  }

  // Delete a term by ID
  static async deleteTerm(req, res) {
    try {
      const deletedTerm = await Term.findByIdAndDelete(req.params.id);
      if (!deletedTerm) {
        return res.status(404).json({ message: 'Term not found' });
      }
      res.status(200).json({ message: 'Term deleted successfully' });
    } catch (error) {
      res.status(500).json({ message: 'Error deleting term', error });
    }
  }
}

module.exports = termController;
