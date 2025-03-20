const express = require('express');
const router = express.Router();
const { saveData,  saveBills } = require('../controllers/getQuorumDataController');

 
router.post('/store-data',saveData ); 
router.post("/votes/save", saveBills);

 
module.exports = router;
