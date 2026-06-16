const express = require("express");

const router = express.Router();

// Public endpoint to record anonymous page views
// router.post("/track", trackVisit);

// // Protected reporting endpoint
// router.get("/daily", getDailyStats);

router.post("/track", (req, res) => {
    res.status(200).json({ message: "Visit tracked successfully" });
});
router.get("/daily", (req, res) => {
    res.status(200).json({ message: "Daily stats fetched successfully" });
});

module.exports = router;
