const express = require('express');
const router = express.Router();
const SenatorController = require('../controllers/senatorController');
const upload = require('../middlewares/fileUploads');
const protectedKey = require('../middlewares/protectedKey');
const { auth, authorizeRoles } = require('../middlewares/authentication');

router.post('/admin/senators/', (req, res, next) => {
    req.query.type = 'senator';
    next();
}, upload.single('photo'), SenatorController.createSenator);

router.post('/admin/senators/discard/:id', SenatorController.discardSenatorChanges);
router.get('/admin/senators/', protectedKey, SenatorController.getAllSenators);
router.get('/admin/senators/:id', protectedKey, SenatorController.getSenatorById);
router.put('/admin/senators/update/:id', upload.single('photo'), SenatorController.updateSenator);
router.put("/admin/senators/status/:id", SenatorController.updateSenatorStatus);
router.delete('/admin/senators/:id', auth, authorizeRoles("admin"), SenatorController.deleteSenator);
router.get('/senators/', protectedKey, SenatorController.Senators);
router.get('/senators/:id', protectedKey, SenatorController.SenatorById);


module.exports = router;
