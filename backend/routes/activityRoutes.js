const express = require('express');
const router = express.Router();
const AC = require('../controllers/activityController');
const protectedKey = require('../middlewares/protectedKey');

router.get('/admin/activities/', protectedKey, AC.getAllActivities);
router.get('/activities/', protectedKey, AC.AllActivity);
router.get('/activities/:id', protectedKey, AC.getActivityById);
router.post('/admin/activities/', AC.createActivity);
router.post('/admin/activities/discard/:id', AC.discardActivityChanges);
router.put('/admin/activities/update-track-activities', AC.bulkUpdateTrackActivities);
router.put('/admin/activities/status/:id', AC.updateActivityStatus);
router.put('/admin/activities/:id', AC.updateActivity);
router.delete('/admin/activities/:id', AC.deleteActivity);

module.exports = router;
 