const express = require("express");

const requireAuth = require("../middleware/requireAuth");
const authorizeRoles = require("../middleware/authorizeRoles");
const User = require("../models/User");
const Expense = require("../models/Expense");
const MaintenanceReceipt = require("../models/MaintenanceReceipt");
const Notice = require("../models/Notice");
const { buildBalance } = require("../utils/dashboardFinance");

const router = express.Router();

function getMonthValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

router.get(
  "/dashboard",
  requireAuth,
  authorizeRoles("admin"),
  async (req, res, next) => {
    try {
      const now = new Date();
      const currentMonth = getMonthValue(now);

      const [users, expenses, receipts, notices] = await Promise.all([
        User.find({}).sort({ createdAt: -1 }).lean(),
        Expense.find({ month: currentMonth }).sort({ expenseDate: -1 }).limit(50).lean(),
        MaintenanceReceipt.find({}).sort({ createdAt: -1 }).limit(50).lean(),
        Notice.find({}).sort({ pinned: -1, createdAt: -1 }).limit(20).lean(),
      ]);

      const userCounts = users.reduce(
        (acc, user) => {
          acc.total += 1;
          if (user.role && Object.prototype.hasOwnProperty.call(acc.byRole, user.role)) {
            acc.byRole[user.role] += 1;
          }
          return acc;
        },
        {
          total: 0,
          byRole: {
            admin: 0,
            secretary: 0,
            cashier: 0,
            member: 0,
          },
        }
      );

      const expensesByCategory = expenses.reduce(
        (acc, expense) => {
          if (Object.prototype.hasOwnProperty.call(acc, expense.category)) {
            acc[expense.category] += expense.amount || 0;
          }
          return acc;
        },
        {
          guard: 0,
          electricity: 0,
          water: 0,
          plumber: 0,
          diesel: 0,
          miscellaneous: 0,
        }
      );

      const pendingReceipts = receipts.filter((item) => item.verificationStatus === "pending").length;
      const verifiedReceipts = receipts.filter((item) => item.verificationStatus === "verified").length;
      const balance = buildBalance({
        verifiedReceipts: receipts,
        expensesTotal: expenses.reduce((sum, item) => sum + (item.amount || 0), 0),
      });

      return res.json({
        month: currentMonth,
        summary: {
          totalUsers: userCounts.total,
          byRole: userCounts.byRole,
          recentExpensesTotal: expenses.reduce((sum, item) => sum + (item.amount || 0), 0),
          receiptsTotal: balance.verifiedIncome,
          openingBalance: balance.openingBalance,
          totalAssets: balance.totalAssets,
          pendingReceipts,
          verifiedReceipts,
        },
        users,
        recentExpenses: expenses,
        receipts,
        notices,
        expensesByCategory,
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.patch(
  "/users/:clerkId/role",
  requireAuth,
  authorizeRoles("admin"),
  async (req, res, next) => {
    try {
      const { clerkId } = req.params;
      const { role } = req.body || {};
      const allowedRoles = ["admin", "secretary", "cashier", "member"];

      if (!allowedRoles.includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }

      const existing = await User.findOne({ clerkId });
      if (!existing) {
        return res.status(404).json({ message: "User not found" });
      }

      const user = await User.findOneAndUpdate(
        { clerkId },
        { $set: { role } },
        { new: true }
      );

      return res.json(user);
    } catch (error) {
      return next(error);
    }
  }
);

module.exports = router;
