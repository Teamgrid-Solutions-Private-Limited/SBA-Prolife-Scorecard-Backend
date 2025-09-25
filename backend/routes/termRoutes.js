const express = require('express');
const router = express.Router();
const TermController = require('../controllers/termController');
const protectedKey = require('../middlewares/protectedKey');

router.post('/terms/create/', TermController.createTerm);
router.get('/terms/viewAll/', protectedKey, TermController.getAllTerms);
router.get('/terms/viewId/:id', protectedKey, TermController.getTermById);
router.put('/terms/update/:id', TermController.updateTerm);
router.delete('/terms/delete/:id', TermController.deleteTerm);

module.exports = router;
