const express = require('express');
const router = express.Router();
const UserController = require('../controllers/userController');
const protectedKey = require('../middlewares/protectedKey');

router.post('/users/create', UserController.createUser);
router.get('/users/:id', UserController.getUserById);
router.put('/users/update/:id', UserController.updateUser);
router.delete('/users/delete/:id', UserController.deleteUser);
router.post('/login', UserController.loginUser); // Login route

module.exports = router;
