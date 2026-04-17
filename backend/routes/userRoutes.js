const express = require("express");

const User = require("../models/User");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

router.post("/sync", requireAuth, async (req, res, next) => {
  try {
    const clerkId = req.auth.userId;
    const { email, firstName, lastName, flatNumber preferredRole } = req.body;
    const allowedRoles = ["admin", "secretary", "cashier", "member"];
    const normalizedRole = allowedRoles.includes(preferredRole)
      ? preferredRole
      : null;

    let user = await User.findOne({ clerkId });

    if (!user) {
      user = new User({
        clerkId,
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        flatNumber: normalizedFlatNumber,
        role: normalizedRole || "member",
        flatNumber: normalizedFlatNumber,
      });
    } else {
      const previousFlatNumber = user.flatNumber || "";
      const nextFirstName = hasFirstName ? normalizedFirstName : user.firstName || "";
      const nextLastName = hasLastName ? normalizedLastName : user.lastName || "";
      const nextFlatNumber = hasFlatNumber ? normalizedFlatNumber : user.flatNumber || "";

      user.firstName = nextFirstName;
      user.lastName = nextLastName;
      user.flatNumber = nextFlatNumber;

      if (hasFlatNumber && previousFlatNumber && previousFlatNumber !== nextFlatNumber) {
        user.flatOwnerName = "";
        user.phoneNumber = "";
        user.secretarySince = "";
        user.roleSince = "";
        user.profileCompleted = false;
      }

      if (normalizedRole) {
        user.role = normalizedRole;
      }
      if (normalizedFlatNumber) {
        user.flatNumber = normalizedFlatNumber;
      }
    }

    // Do not write email in the same critical path. Some legacy databases
    // still have unique email indexes that can fail during login sync.
    user.email = user.email || null;

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

      const previousFlatNumber = existing.flatNumber || "";

      existing.firstName = hasFirstName ? normalizedFirstName : existing.firstName || "";
      existing.lastName = hasLastName ? normalizedLastName : existing.lastName || "";
      existing.flatNumber = hasFlatNumber ? normalizedFlatNumber : existing.flatNumber || "";

      if (hasFlatNumber && previousFlatNumber && previousFlatNumber !== existing.flatNumber) {
        existing.flatOwnerName = "";
        existing.phoneNumber = "";
        existing.secretarySince = "";
        existing.roleSince = "";
        existing.profileCompleted = false;
      }

      if (normalizedRole) {
        existing.role = normalizedRole;
      }
      if (normalizedFlatNumber) {
        existing.flatNumber = normalizedFlatNumber;
      }
      await existing.save();
      user = existing;
    }

    if (email) {
      try {
        await User.updateOne({ clerkId }, { $set: { email } });
      } catch (emailError) {
        if (emailError?.code !== 11000) {
          // Ignore email update issues during auth sync; the login should still work.
          console.error("Email sync skipped:", emailError);
        }
      }
    }

    return res.json((await User.findOne({ clerkId }).lean()) || user.toObject());
  } catch (error) {
    return next(error);
  }
});

router.patch("/me", requireAuth, async (req, res, next) => {
  try {
    const { firstName, lastName, flatNumber, flatOwnerName, phoneNumber, secretarySince, roleSince } =
      req.body;

    const existingUser = await User.findOne({ clerkId: req.auth.userId }).lean();

    if (!existingUser) {
      return res.status(404).json({ message: "User profile not found" });
    }

    const payload = {
      firstName: (firstName || "").trim(),
      lastName: (lastName || "").trim(),
      flatNumber: (flatNumber || "").trim(),
      flatOwnerName: (flatOwnerName || "").trim(),
      phoneNumber: (phoneNumber || "").trim(),
      secretarySince: (secretarySince || "").trim(),
      roleSince: (roleSince || "").trim(),
    };

    const requiredValues = [
      payload.firstName,
      payload.lastName,
      payload.flatNumber,
      payload.flatOwnerName,
      payload.phoneNumber,
    ];

    const baseCompleted = requiredValues.every(Boolean);
    payload.profileCompleted =
      existingUser.role === "member"
        ? baseCompleted
        : baseCompleted && Boolean(payload.roleSince || payload.secretarySince);

    const user = await User.findOneAndUpdate(
      { clerkId: req.auth.userId },
      { $set: payload },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User profile not found" });
    }

    return res.json(user);
  } catch (error) {
    return next(error);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findOne({ clerkId: req.auth.userId }).lean();

    if (!user) {
      return res.status(404).json({ message: "User profile not found" });
    }

    return res.json(user);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
