const express = require('express');
const router = express.Router();
const SenatorController = require('../controllers/senatorController');
const upload = require('../middlewares/fileUploads');
const protectedKey = require('../middlewares/protectedKey');
const { auth, authorizeRoles } = require('../middlewares/authentication');
 
// =================== Admin Routes ===================
// POST request to create a senator with a photo
router.post('/senators/create', (req, res, next) => {
    req.query.type = 'senator';
    next();
}, upload.single('photo'), SenatorController.createSenator);

// GET request to retrieve all senators for admin
router.get('/senators/view', protectedKey, SenatorController.getAllSenators);

// GET request to retrieve a senator by ID for admin
router.get('/senators/viewId/:id', protectedKey, SenatorController.getSenatorById);

// PUT request to update a senator by ID
router.put('/senators/update/:id', upload.single('photo'), SenatorController.updateSenator);


// DELETE request to remove a senator by ID
router.delete('/senators/delete/:id',auth,authorizeRoles("admin"), SenatorController.deleteSenator);

// =================== Frontend Routes ===================
// GET request to retrieve all senators for frontend display
router.get('/frontend/senators/view', protectedKey, SenatorController.Senators);

// GET request to retrieve a senator by ID for frontend display
router.get('/frontend/senators/viewId/:id', protectedKey, SenatorController.SenatorById);

router.put("/senators/status/:id", SenatorController.updateSenatorStatus);
//Undo senator update
router.put("/senator/:id/undo", SenatorController.undoSenatorUpdate);

module.exports = router;
