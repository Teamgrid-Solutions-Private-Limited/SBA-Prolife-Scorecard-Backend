const express = require('express');
const router = express.Router();
const VoteController = require('../controllers/voteController');
const protectedKey = require('../middlewares/protectedKey');
const { auth, authorizeRoles } = require('../middlewares/authentication');

/* ---------- GET ROUTES ---------- */
// All votes
router.get('/admin/votes/', protectedKey, VoteController.getAllVotes);
// Single vote by ID (last so it doesn't catch other GET routes)
router.get('/admin/votes/:id', protectedKey, VoteController.getVoteById);

/* ---------- POST ROUTES ---------- */
// Create new vote
router.post('/admin/votes/', VoteController.createVote);
// Discard changes
router.post('/admin/votes/discard/:id', VoteController.discardVoteChanges);

/* ---------- PUT ROUTES ---------- */
// Bulk update SBA position (static first)
router.put('/admin/votes/bulk-update', VoteController.bulkUpdateSbaPosition);
// Update a vote by ID (dynamic last)
router.put('/admin/votes/:id', VoteController.updateVote);

/* ---------- PATCH ROUTES ---------- */
// Update vote status
router.patch('/admin/votes/status/:id', VoteController.updateVoteStatus);

/* ---------- DELETE ROUTES ---------- */
// Delete vote by ID
router.delete(
  '/admin/votes/:id',
  auth,
  authorizeRoles("admin"),
  VoteController.deleteVote
);

module.exports = router;
