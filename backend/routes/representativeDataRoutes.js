const express = require('express');
const router = express.Router();
const HD = require('../controllers/representativeData');
const protectedKey = require('../middlewares/protectedKey');

// POST: Create a new house data
router.post('/admin/house-data/', HD.createHouseData);
 
// GET: Retrieve all house data with populated votesScore and activitiesScore
router.get('/admin/house-data/', protectedKey, HD.getAllHouseData);
 
// GET: Retrieve house data by ID with populated votesScore and activitiesScore
router.get('/admin/house-data/viewID/:id', protectedKey, HD.getHouseDataById);
 
router.get('/admin/house-data/viewbyhouse/:id', protectedKey, HD.getHouseDataByHouseId);
 
// PUT: Update house data by ID
router.put('/admin/house-data/:id', HD.updateHouseData);
 
// DELETE: Delete house data by ID
router.delete('/admin/house-data/:id', HD.deleteHouseData);

//frontend getHouseDataByHouseId
router.get('/frontend/house-data/viewbyhouse/:id', protectedKey, HD.HouseDataByHouseId);

module.exports = router;
