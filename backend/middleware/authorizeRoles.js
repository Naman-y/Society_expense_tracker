const User = require("../models/User");

function authorizeRoles(...allowedRoles) {
  return async (req, res, next) => {
    try {
      if (!req.auth?.userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const user = await User.findOne({ clerkId: req.auth.userId }).lean();

      if (!user) {
        return res.status(403).json({
          message: "User profile not found. Sync user profile first.",
        });
      }

      if (!allowedRoles.includes(user.role)) {
        return res.status(403).json({
          message: "You do not have permission to access this resource.",
        });
      }

      req.currentUser = user;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = authorizeRoles;
