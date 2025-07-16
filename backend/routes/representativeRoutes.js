const express = require('express');
const router = express.Router();
const RC = require('../controllers/representativeController');
const upload = require('../middlewares/fileUploads');
const protectedKey = require('../middlewares/protectedKey');
 

 

router.post('/house/create/', (req, res, next) => {
    req.query.type = 'house'; // Ensure 'house' type is set
    next();
}, upload.single('photo'), RC.createHouse);

// GET request to retrieve all house
router.get('/house/view/',protectedKey,RC.getAllHouse);

router.get('/house/view/', protectedKey, RC.AllHouse);

// GET request to retrieve a house by ID
router.get('/house/viewId/:id',protectedKey, RC.getHouseById);

router.get('/house/viewId/:id', protectedKey, RC.HouseById);
// PUT request to update a house by ID
router.put('/house/update/:id', (req, res, next) => {
    req.query.type = 'house';  
    next();
}, upload.single('photo'), RC.updateHouse);

// DELETE request to remove a house by ID
router.delete('/house/delete/:id', RC.deleteHouse);

module.exports = router;
