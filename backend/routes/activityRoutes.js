const express = require('express');
const router = express.Router();
const AC = require('../controllers/activityController');

// POST: Create a new activity with file upload for readMore
router.post('/activity/create/', AC.createActivity);

// GET: Retrieve all  activity
router.get('/activity/viewAll/', AC.getAllActivity);

// GET: Retrieve a  activity by ID
router.get('/activity/viewId/:id', AC.getActivityById);

// PUT: Update a activity by ID
router.put('/activity/update/:id', AC.updateActivity);

// DELETE: Delete a activity by ID
router.delete('/activity/delete/:id', AC.deleteActivity);

module.exports = router;
