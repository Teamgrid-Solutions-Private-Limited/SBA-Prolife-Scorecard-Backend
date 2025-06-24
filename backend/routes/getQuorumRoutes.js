const express = require('express');
const router = express.Router();
const { saveData, saveBills, getDataStatus } = require('../controllers/getQuorumDataController');

 
router.post('/store-data',saveData ); 
router.post("/votes/save", saveBills);

// New route for checking data status
router.get('/status/:type', getDataStatus);

 
module.exports = router;
