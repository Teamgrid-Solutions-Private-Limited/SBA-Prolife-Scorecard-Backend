const express = require('express');
const router = express.Router();
const RC = require('../controllers/representativeController');
const upload = require('../middlewares/fileUploads');
const protectedKey = require('../middlewares/protectedKey');
const { auth, authorizeRoles } = require('../middlewares/authentication');

// =================== Admin Routes ===================
// POST request to create a house representative with photo
router.post('/admin/houses/', (req, res, next) => {
    req.query.type = 'house';
    next();
}, upload.single('photo'), RC.createHouse);
 
router.post('/admin/houses/discard/:id', RC.discardHouseChanges);
 
// GET request to retrieve all house representatives for admin
router.get('/admin/houses/', protectedKey, RC.getAllHouse);
 
// GET request to retrieve a house representative by ID for admin
router.get('/admin/houses/:id', protectedKey, RC.getHouseById);
 
// PUT request to update a house representative by ID
router.put('/admin/houses/update/:id', (req, res, next) => {
    req.query.type = 'house';
    next();
}, upload.single('photo'), RC.updateHouse);
 
router.patch("/admin/houses/status/:id", RC.updateRepresentativeStatus);
 
// DELETE request to remove a house representative by ID
router.delete('/admin/houses/:id',auth,authorizeRoles("admin"), RC.deleteHouse);

// =================== Frontend Routes ===================
// GET request to retrieve all house representatives for frontend display
router.get('/houses/', protectedKey, RC.AllHouse);

// GET request to retrieve a house representative by ID for frontend display
router.get('/houses/:id', protectedKey, RC.HouseById);

module.exports = router;
