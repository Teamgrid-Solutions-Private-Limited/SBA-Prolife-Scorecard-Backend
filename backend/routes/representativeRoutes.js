const express = require('express');
const router = express.Router();
const RC = require('../controllers/representativeController');
const upload = require('../middlewares/fileUploads');
const protectedKey = require('../middlewares/protectedKey');
const { auth, authorizeRoles } = require('../middlewares/authentication');

// =================== Admin Routes ===================
// POST request to create a house representative with photo
router.post('/house/create', (req, res, next) => {
    req.query.type = 'house';
    next();
}, upload.single('photo'), RC.createHouse);

// GET request to retrieve all house representatives for admin
router.get('/house/view', protectedKey, RC.getAllHouse);

// GET request to retrieve a house representative by ID for admin
router.get('/house/viewId/:id', protectedKey, RC.getHouseById);

// PUT request to update a house representative by ID
router.put('/house/update/:id', (req, res, next) => {
    req.query.type = 'house';
    next();
}, upload.single('photo'), RC.updateHouse);

// DELETE request to remove a house representative by ID
router.delete('/house/delete/:id',auth,authorizeRoles("admin"), RC.deleteHouse);

// =================== Frontend Routes ===================
// GET request to retrieve all house representatives for frontend display
router.get('/frontend/house/view', protectedKey, RC.AllHouse);

// GET request to retrieve a house representative by ID for frontend display
router.get('/frontend/house/viewId/:id', protectedKey, RC.HouseById);

module.exports = router;
