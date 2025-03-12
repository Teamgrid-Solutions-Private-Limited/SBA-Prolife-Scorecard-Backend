const express = require('express');
const router = express.Router();
const SenatorController = require('../controllers/senatorController');
const upload = require('../middlewares/fileUploads'); 
 
// POST request to create a senator with a photo
router.post('/senators/create/', (req, res, next) => {
    req.query.type = 'senator'; // Ensure 'senator' type is set
    next();
},upload.single('photo'), SenatorController.createSenator);

// GET request to retrieve all senators
router.get('/senators/view/', SenatorController.getAllSenators);

// GET request to retrieve a senator by ID
router.get('/senators/viewId/:id', SenatorController.getSenatorById);

// PUT request to update a senator by ID
router.put('/senators/update/:id',upload.single('photo'), SenatorController.updateSenator);

// DELETE request to remove a senator by ID
router.delete('/senators/delete/:id', SenatorController.deleteSenator);

module.exports = router;
