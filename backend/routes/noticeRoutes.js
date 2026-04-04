const express = require("express");

const requireAuth = require("../middleware/requireAuth");
const Notice = require("../models/Notice");

const router = express.Router();

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const notices = await Notice.find({})
      .sort({ pinned: -1, createdAt: -1 })
      .limit(20)
      .lean();

    return res.json({ notices });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
