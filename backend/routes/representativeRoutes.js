const express = require('express');
const router = express.Router();
const RC = require('../controllers/representativeController');
const upload = require('../middlewares/fileUploads');
const protectedKey = require('../middlewares/protectedKey');
const { auth, authorizeRoles } = require('../middlewares/authentication');

router.post('/admin/houses/', (req, res, next) => {
    req.query.type = 'house';
    next();
}, upload.single('photo'), RC.createHouse);

router.post('/admin/houses/discard/:id', RC.discardHouseChanges);
router.get('/admin/houses/', protectedKey, RC.getAllHouse);
router.get('/admin/houses/:id', protectedKey, RC.getHouseById);
router.put('/admin/houses/update/:id', (req, res, next) => {
    req.query.type = 'house';
    next();
}, upload.single('photo'), RC.updateHouse);
router.patch("/admin/houses/status/:id", RC.updateRepresentativeStatus);
router.delete('/admin/houses/:id', auth, authorizeRoles("admin"), RC.deleteHouse);
router.get('/houses/', protectedKey, RC.AllHouse);
router.get('/houses/:id', protectedKey, RC.HouseById);

module.exports = router;
