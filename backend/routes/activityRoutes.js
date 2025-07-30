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

router.put("/activity/status/:id", AC.updateActivityStatus);
// PATCH: Bulk update activity status
router.put(
  "/update/bulk-update-track-activities",
  AC.bulkUpdateTrackActivities
);
// POST: Fetch sponsors for activities
router.post('/fetch-sponsors', async (req, res) => {
  try {
    const { personIds, limit } = req.body;
    if (!personIds || !Array.isArray(personIds)) {
      return res.status(400).json({ message: 'personIds must be an array' });
    }
    const sponsorData = await AC.fetchSponsorsFromQuorum(personIds, limit);
    res.json({ data: sponsorData });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error fetching sponsors', 
      error: error.message 
    });
  }
});

module.exports = router;
