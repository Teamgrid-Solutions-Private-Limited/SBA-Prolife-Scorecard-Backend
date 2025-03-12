const express = require('express');
const router = express.Router();
const TermController = require('../controllers/termController');

// POST: Create a new term
router.post('/terms/create/', TermController.createTerm);

// GET: Retrieve all terms
router.get('/terms/viewAll/', TermController.getAllTerms);

// GET: Retrieve a term by ID
router.get('/terms/viewId/:id', TermController.getTermById);

// PUT: Update a term by ID
router.put('/terms/update/:id', TermController.updateTerm);

// DELETE: Delete a term by ID
router.delete('/terms/delete/:id', TermController.deleteTerm);

module.exports = router;
