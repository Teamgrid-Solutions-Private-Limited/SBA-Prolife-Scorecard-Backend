const express = require('express');
const router = express.Router();
const TermController = require('../controllers/termController');
const protectedKey = require('../middlewares/protectedKey');

// POST: Create a new term
router.post('/terms/create/', protectedKey, TermController.createTerm);

// GET: Retrieve all terms
router.get('/terms/viewAll/', protectedKey, TermController.getAllTerms);

// GET: Retrieve a term by ID
router.get('/terms/viewId/:id', protectedKey, TermController.getTermById);

// PUT: Update a term by ID
router.put('/terms/update/:id', protectedKey, TermController.updateTerm);

// DELETE: Delete a term by ID
router.delete('/terms/delete/:id', protectedKey, TermController.deleteTerm);

module.exports = router;
