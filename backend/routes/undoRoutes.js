// routes/undoRoutes.js
const express = require('express');
const router = express.Router();
const { undoLastChange } = require('../controllers/undoController');

// Generic undo route: PUT /undo/:modelName/:documentId
router.put('/:modelName/:documentId', undoLastChange);

module.exports = router;
