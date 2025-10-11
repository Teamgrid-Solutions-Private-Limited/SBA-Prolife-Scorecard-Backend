const express = require('express');
const {sendInvite,verifyActivation,activateAccount} = require('../controllers/sendInviteController');
//const validateInvite = require('../validate/validate-invite');
const userController = require('../controllers/userController');
const router = express.Router();

router.post('/invite', sendInvite);
router.get("/verify-activation", verifyActivation);
router.post("/activate-account", activateAccount);

module.exports = router;
