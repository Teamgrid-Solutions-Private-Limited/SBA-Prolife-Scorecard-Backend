const express = require('express');
const router = express.Router();
const SenatorController = require('../controllers/senatorController');
const upload = require('../middlewares/fileUploads');
const protectedKey = require('../middlewares/protectedKey');
 
// POST request to create a senator with a photo
router.post('/senators/create/', (req, res, next) => {
    req.query.type = 'senator'; // Ensure 'senator' type is set
    next();
}, upload.single('photo'), SenatorController.createSenator);

// GET request to retrieve all senators
router.get('/senators/view/',protectedKey,SenatorController.getAllSenators);

// GET request to retrieve all senators for frontend display
// This is a separate endpoint to allow frontend access with protected key
// It can be used to display senators on the frontend with requiring a protected key
router.get('/Senators/view/', protectedKey, SenatorController.AllSenators);

// GET request to retrieve a senator by ID
router.get('/senators/viewId/:id',protectedKey, SenatorController.getSenatorById);

// GET request to retrieve a senator by ID for frontend display
// This is a separate endpoint to allow frontend access with protected key
router.get('/Senators/viewId/:id', protectedKey, SenatorController.SenatorById);

// PUT request to update a senator by ID
router.put('/senators/update/:id', upload.single('photo'), SenatorController.updateSenator);

// DELETE request to remove a senator by ID
router.delete('/senators/delete/:id', SenatorController.deleteSenator);

module.exports = router;
