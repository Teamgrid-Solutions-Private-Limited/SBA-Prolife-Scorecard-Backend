const express = require('express');
const sendInvite = require('../controllers/sendInviteController');
const validateInvite = require('../validate/validate-invite');
const userController = require('../controllers/userController');
const router = express.Router();

router.post('/invite', sendInvite); // Admin only
router.get('/validate-invite', validateInvite); // Check invite validity
//router.post('/signup', userController.signupWithInvite); // Signup with invite

module.exports = router;
