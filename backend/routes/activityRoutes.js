const express = require('express');
const router = express.Router();
const AC = require('../controllers/activityController');
const protectedKey = require('../middlewares/protectedKey');

// POST: Create a new activity with file upload for readMore
router.post('/activity/create/', AC.createActivity);

// GET: Retrieve all  activity
router.get('/activity/viewAll/', protectedKey, AC.getAllActivity);

// GET: Retrieve a  activity by ID
router.get('/activity/viewId/:id', protectedKey, AC.getActivityById);

// PUT: Update a activity by ID
router.put('/activity/update/:id', AC.updateActivity);

// DELETE: Delete a activity by ID
router.delete('/activity/delete/:id', AC.deleteActivity);

router.patch("/activity/status/:id", AC.updateActivityStatus);
// PATCH: Bulk update activity status
router.patch(
  "/update/bulk-update-track-activities",
  AC.bulkUpdateTrackActivities
);

module.exports = router;
