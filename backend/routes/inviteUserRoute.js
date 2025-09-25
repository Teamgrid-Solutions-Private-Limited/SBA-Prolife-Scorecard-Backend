const express = require('express');
const sendInvite = require('../controllers/sendInviteController');
const validateInvite = require('../validate/validate-invite');
const userController = require('../controllers/userController');
const router = express.Router();

router.post('/invite', sendInvite);
router.get('/validate-invite', validateInvite); 

module.exports = router;
