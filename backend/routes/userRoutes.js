const express = require('express');
const router = express.Router();
const UserController = require('../controllers/userController');
const protectedKey = require('../middlewares/protectedKey');
const { auth } = require('../middlewares/authentication');
const { authorizeRoles } = require('../middlewares/authentication');

router.post('/users/create', UserController.createUser);
router.get('/users', auth, authorizeRoles('admin'), UserController.getAllUsers); // Get all users
router.get('/users/:id', UserController.getUserById);
router.put('/assign-role', auth, authorizeRoles('admin'), UserController.assignUserRole);
router.put('/users/update/:id', UserController.updateUser);
router.delete('/users/delete/:id', UserController.deleteUser);
router.post('/login', UserController.loginUser); // Login route

module.exports = router;
