const express = require('express');
const router = express.Router();
const { saveData, saveBills, getDataStatus } = require('../controllers/getQuorumDataController');
const protectedKey = require('../middlewares/protectedKey');
const{auth,authorizeRoles} =require ("../middlewares/authentication")

router.post('/store-data',auth,authorizeRoles("admin"),saveData); 
router.post('/votes/save', saveBills);
router.get('/status/:type', protectedKey, getDataStatus);
module.exports = router;
