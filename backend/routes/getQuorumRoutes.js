const express = require('express');
const router = express.Router();
const { saveData, saveBills, getDataStatus } = require('../controllers/getQuorumDataController');
const protectedKey = require('../middlewares/protectedKey');

router.post('/store-data', protectedKey, saveData); 
router.post('/votes/save', protectedKey, saveBills);

// New route for checking data status
router.get('/status/:type', protectedKey, getDataStatus);

module.exports = router;
