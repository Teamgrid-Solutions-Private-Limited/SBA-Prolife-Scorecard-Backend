const express = require('express');
const router = express.Router();
const VoteController = require('../controllers/voteController');
const protectedKey = require('../middlewares/protectedKey');
const { auth, authorizeRoles } = require('../middlewares/authentication');

// POST: Create a new vote with file upload for readMore
router.post('/votes/create/', VoteController.createVote);

// GET: Retrieve all votes
router.get('/votes/viewAll/', protectedKey, VoteController.getAllVotes);

// GET: Retrieve a vote by ID
router.get('/votes/viewId/:id', protectedKey, VoteController.getVoteById);

// PUT: Update a vote by ID
router.put('/votes/update/:id', VoteController.updateVote);

// DELETE: Delete a vote by ID
router.delete('/votes/delete/:id',auth,authorizeRoles("admin"),VoteController.deleteVote);

module.exports = router;
