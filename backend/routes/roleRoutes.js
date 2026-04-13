const express = require("express");

const User = require("../models/User");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

const ALLOWED_ROLES = ["admin", "secretary", "cashier", "member"];

router.post("/select", requireAuth, async (req, res, next) => {
  try {
    const { role, email, firstName, lastName, flatNumber } = req.body || {};
    const normalizedFlatNumber = (flatNumber || "").trim();

    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ message: "Invalid role selection" });
    }

    const clerkId = req.auth.userId;
    let user = await User.findOne({ clerkId });

    if (!user) {
      user = new User({
        clerkId,
        role,
        firstName: firstName || "",
        lastName: lastName || "",
        flatNumber: normalizedFlatNumber,
      });
    } else {
      user.role = role;
      if (firstName) user.firstName = firstName;
      if (lastName) user.lastName = lastName;
      if (normalizedFlatNumber) user.flatNumber = normalizedFlatNumber;
    }

    try {
      await user.save();
    } catch (saveError) {
      if (saveError?.code !== 11000) {
        throw saveError;
      }

      const existing = await User.findOne({ clerkId });
      if (!existing) {
        throw saveError;
      }
      existing.role = role;
      if (firstName) existing.firstName = firstName;
      if (lastName) existing.lastName = lastName;
      if (normalizedFlatNumber) existing.flatNumber = normalizedFlatNumber;
      await existing.save();
      user = existing;
    }

    if (email) {
      try {
        await User.updateOne({ clerkId }, { $set: { email } });
      } catch (emailError) {
        if (emailError?.code !== 11000) {
          console.error("Role email sync skipped:", emailError);
        }
      }
    }

    return res.json(user);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
