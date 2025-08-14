const express = require('express');
const router = express.Router();
const HD = require('../controllers/representativeData');
const protectedKey = require('../middlewares/protectedKey');

// POST: Create a new house data
router.post('/house-data/create/', HD.createHouseData);

// GET: Retrieve all house data with populated votesScore and activitiesScore
router.get('/house-data/viewAll/', protectedKey, HD.getAllHouseData);

// GET: Retrieve house data by ID with populated votesScore and activitiesScore
router.get('/house-data/viewID/:id', protectedKey, HD.getHouseDataById);

// PUT: Update house data by ID
router.put('/house-data/update/:id', HD.updateHouseData);

// DELETE: Delete house data by ID
router.delete('/house-data/delete/:id', HD.deleteHouseData);

router.get('/house-data/viewbyhouse/:id', protectedKey, HD.getHouseDataByHouseId);

//frontend getHouseDataByHouseId
router.get('/frontend/house-data/viewbyhouse/:id', protectedKey, HD.HouseDataByHouseId);

module.exports = router;
