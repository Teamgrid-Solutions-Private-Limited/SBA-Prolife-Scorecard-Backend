const express = require('express');
const router = express.Router();
const SenatorDataController = require('../controllers/senatorDataController');
const protectedKey = require('../middlewares/protectedKey');

// POST: Create a new senator data
router.post('/admin/senator-data/', SenatorDataController.createSenatorData);
 
// GET: Retrieve all senator data with populated votesScore and activitiesScore
router.get('/admin/senator-data/', protectedKey, SenatorDataController.getAllSenatorData);
 
// GET: Retrieve senator data by ID with populated votesScore and activitiesScore
router.get('/admin/senator-data/viewID/:id', protectedKey, SenatorDataController.getSenatorDataById);
 
//GET : Retrieve senator data by senatorID
router.get('/admin/senator-data/viewbysenator/:id', protectedKey, SenatorDataController.getSenatorDataBySenatorId);
 
// PUT: Update senator data by ID
router.put('/admin/senator-data/:id', SenatorDataController.updateSenatorData);
 
// DELETE: Delete senator data by ID
router.delete('/admin/senator-data/:id', SenatorDataController.deleteSenatorData);
 
//frontend ui display
router.get(
  "/senators-past-votes/:senateId/",
  protectedKey,
  SenatorDataController.getPastVotesWithDetails
);
router.get(
  "/senator-data/:senatorId",
  protectedKey,
  SenatorDataController.SenatorDataBySenatorId
);

module.exports = router;
