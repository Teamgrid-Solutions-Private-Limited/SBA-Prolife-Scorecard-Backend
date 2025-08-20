const express = require('express');
const router = express.Router();
const AC = require('../controllers/activityController');
const protectedKey = require('../middlewares/protectedKey');
 
/* ---------- GET ROUTES ---------- */
// All activities
router.get('/activities/', protectedKey, AC.getAllActivity);
// Single activity by ID (last in GET group)
router.get('/activities/:id', protectedKey, AC.getActivityById);
 
/* ---------- POST ROUTES ---------- */
// Create new activity
router.post('/admin/activities/', AC.createActivity);
// Discard changes
router.post('/admin/activities/discard/:id', AC.discardActivityChanges);
 
/* ---------- PUT ROUTES ---------- */
// Bulk update tracked activities
router.put('/admin/activities/update-track-activities', AC.bulkUpdateTrackActivities);
// Update publish status
router.put('/admin/activities/status/:id', AC.updateActivityStatus);
// Update activity by ID
router.put('/admin/activities/:id', AC.updateActivity);
 
/* ---------- DELETE ROUTES ---------- */
// Delete activity by ID
router.delete('/admin/activities/:id', AC.deleteActivity);
 
module.exports = router;
 