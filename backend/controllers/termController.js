const Term = require("../models/termSchema");
const { validateTermYears, generateTermName } = require("../helper/termUtils");

class termController {
  static async createTerm(req, res) {
    try {
      const { startYear, endYear } = req.body;

      const validation = validateTermYears(startYear, endYear);
      if (!validation.isValid) {
        return res.status(400).json({ message: validation.message });
      }

      const name = generateTermName(startYear, endYear);

      const newTerm = new Term({
        name,
        startYear,
        endYear,
      });

      await newTerm.save();
      res.status(201).json(newTerm);
    } catch (error) {
      if (error.code === 11000) {
        return res
          .status(400)
          .json({ message: "A term with these years already exists" });
      }
      res
        .status(500)
        .json({ message: "Error creating term", error: error.message });
    }
  }
  static async getAllTerms(req, res) {
    try {
      const terms = await Term.find();
      res.status(200).json(terms);
    } catch (error) {
      res.status(500).json({ message: "Error retrieving terms", error });
    }
  }
  static async getTermById(req, res) {
    try {
      const term = await Term.findById(req.params.id);
      if (!term) {
        return res.status(404).json({ message: "Term not found" });
      }
      res.status(200).json(term);
    } catch (error) {
      res.status(500).json({ message: "Error retrieving term", error });
    }
  }
  static async updateTerm(req, res) {
    try {
      const updatedTerm = await Term.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true }
      );

      if (!updatedTerm) {
        return res.status(404).json({ message: "Term not found" });
      }

      res.status(200).json(updatedTerm);
    } catch (error) {
      res.status(500).json({ message: "Error updating term", error });
    }
  }
  static async deleteTerm(req, res) {
    try {
      const deletedTerm = await Term.findByIdAndDelete(req.params.id);
      if (!deletedTerm) {
        return res.status(404).json({ message: "Term not found" });
      }
      res.status(200).json({ message: "Term deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Error deleting term", error });
    }
  }
}

module.exports = termController;
