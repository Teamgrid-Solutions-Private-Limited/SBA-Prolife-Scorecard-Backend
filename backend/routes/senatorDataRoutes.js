const express = require('express');
const router = express.Router();
const SenatorDataController = require('../controllers/senatorDataController');
const protectedKey = require('../middlewares/protectedKey');

router.post('/admin/senator-data/', SenatorDataController.createSenatorData);
router.get('/admin/senator-data/', protectedKey, SenatorDataController.getAllSenatorData);
router.get('/admin/senator-data/viewID/:id', protectedKey, SenatorDataController.getSenatorDataById);
router.get('/admin/senator-data/viewbysenator/:id', protectedKey, SenatorDataController.getSenatorDataBySenatorId);
router.put('/admin/senator-data/:id', SenatorDataController.updateSenatorData);
router.delete('/admin/senator-data/:id', SenatorDataController.deleteSenatorData);
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
