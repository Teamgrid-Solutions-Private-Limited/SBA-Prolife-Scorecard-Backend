const express = require('express');
const router = express.Router();
const VoteController = require('../controllers/voteController');
const protectedKey = require('../middlewares/protectedKey');
const { auth, authorizeRoles } = require('../middlewares/authentication');
const upload = require('../middlewares/fileUploads');

router.get('/admin/votes/', protectedKey, VoteController.getAllVotes);
router.get('/votes/', protectedKey, VoteController.AllVotes);
router.get('/votes/:id', protectedKey, VoteController.getVoteById);
router.post(
  "/admin/votes/",
  upload.single("readMore"),
  VoteController.createVote
);
router.post('/admin/votes/discard/:id', VoteController.discardVoteChanges);
router.put('/admin/votes/bulk-update', VoteController.bulkUpdateSbaPosition);
router.put('/admin/votes/:id', VoteController.updateVote);
router.patch('/admin/votes/status/:id', VoteController.updateVoteStatus);
router.delete(
  '/admin/votes/:id',
  auth,
  authorizeRoles("admin"),
  VoteController.deleteVote
);

module.exports = router;
