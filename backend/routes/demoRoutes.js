const express = require("express");
const router = express.Router();

const quorumController = require("../controllers/demoController");

router.get("/quorum", quorumController.getQuorum);

module.exports = router;