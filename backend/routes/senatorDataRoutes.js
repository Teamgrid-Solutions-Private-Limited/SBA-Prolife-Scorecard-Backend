const express = require('express');
const router = express.Router();
const SenatorDataController = require('../controllers/senatorDataController');

// POST: Create a new senator data
router.post('/senator-data/create/', SenatorDataController.createSenatorData);

// GET: Retrieve all senator data with populated votesScore and activitiesScore
router.get('/senator-data/viewAll/', SenatorDataController.getAllSenatorData);

// GET: Retrieve senator data by ID with populated votesScore and activitiesScore
router.get('/senator-data/viewID/:id', SenatorDataController.getSenatorDataById);

// PUT: Update senator data by ID
router.put('/senator-data/update/:id', SenatorDataController.updateSenatorData);

// DELETE: Delete senator data by ID
router.delete('/senator-data/delete/:id', SenatorDataController.deleteSenatorData);

//GET : Retrieve senator data by senatorID
router.get('/senator-data/viewbysenator/:id', SenatorDataController.getSenatorDataBySenatorId);

module.exports = router;
