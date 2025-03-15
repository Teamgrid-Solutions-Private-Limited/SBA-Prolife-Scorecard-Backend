const express = require('express');
const router = express.Router();
const { saveData, saveVotes } = require('../controllers/getQuorumDataController');

 
router.post('/store-data',saveData ); 
router.post("/votes/save", saveVotes);

 
module.exports = router;
