const express = require('express');
const router = express.Router();
const UserController = require('../controllers/userController');
const protectedKey = require('../middlewares/protectedKey');

router.post('/users/create', protectedKey, UserController.createUser);
router.get('/users/:id', protectedKey, UserController.getUserById);
router.put('/users/update/:id', protectedKey, UserController.updateUser);
router.delete('/users/delete/:id', protectedKey, UserController.deleteUser);
router.post('/login', UserController.loginUser); // Login route

module.exports = router;
