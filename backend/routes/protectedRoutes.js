const express = require("express");

const requireAuth = require("../middleware/requireAuth");
const authorizeRoles = require("../middleware/authorizeRoles");

const router = express.Router();

router.get(
  "/management",
  requireAuth,
  authorizeRoles("admin", "secretary", "cashier"),
  (req, res) => {
    res.json({
      message: "Management access granted",
      role: req.currentUser.role,
      userId: req.currentUser.clerkId,
    });
  }
);

router.get("/admin", requireAuth, authorizeRoles("admin"), (req, res) => {
  res.json({
    message: "Admin access granted",
    role: req.currentUser.role,
  });
});

router.get(
  "/member",
  requireAuth,
  authorizeRoles("member", "admin", "secretary", "cashier"),
  (req, res) => {
    res.json({
      message: "Member area access granted",
      role: req.currentUser.role,
    });
  }
);

module.exports = router;
