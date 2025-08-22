const express = require("express");
const router = express.Router();
const { getMessage } = require("../controllers/exampleController");

router.get("/message", (req, res) => {
  res.json({ message: getMessage() });
});

module.exports = router;
