const express = require("express");

const requireAuth = require("../middleware/requireAuth");
const User = require("../models/User");
const MaintenanceReceipt = require("../models/MaintenanceReceipt");
const Expense = require("../models/Expense");
const Notice = require("../models/Notice");
const { buildBalance } = require("../utils/dashboardFinance");

const router = express.Router();

function getMonthValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

router.get("/member", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findOne({ clerkId: req.auth.userId }).lean();

    if (!user) {
      return res.status(404).json({ message: "User profile not found" });
    }

    const today = new Date();
    const currentMonth = getMonthValue(today);
    const nextMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const nextMonth = getMonthValue(nextMonthDate);

    const receipts = await MaintenanceReceipt.find({ uploadedByClerkId: user.clerkId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const notices = await Notice.find({})
      .sort({ pinned: -1, createdAt: -1 })
      .limit(10)
      .lean();

    const currentMonthExpenses = await Expense.find({ month: currentMonth, approvalStatus: "approved" })
      .sort({ expenseDate: -1 })
      .lean();

    const categoryTotals = {
      guard: 0,
      electricity: 0,
      water: 0,
      plumber: 0,
      miscellaneous: 0,
    };

    currentMonthExpenses.forEach((expense) => {
      if (Object.prototype.hasOwnProperty.call(categoryTotals, expense.category)) {
        categoryTotals[expense.category] += expense.amount || 0;
      }
    });

    const maintenanceExpectedAmount = Number(process.env.DEFAULT_MAINTENANCE_AMOUNT || 3000);
    const latestReceipt = receipts[0] || null;
    const currentMonthVerifiedReceipts = receipts.filter(
      (item) => item.month === currentMonth && item.verificationStatus === "verified"
    );
    const paidAmount = currentMonthVerifiedReceipts.reduce((sum, item) => sum + (item.amount || 0), 0);
    const balance = buildBalance({
      verifiedReceipts: receipts.filter((item) => item.verificationStatus === "verified"),
      expensesTotal: currentMonthExpenses.reduce((sum, item) => sum + (item.amount || 0), 0),
    });

    return res.json({
      profile: {
        name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
        flatNumber: user.flatNumber || "",
        flatOwnerName: user.flatOwnerName || "",
        phoneNumber: user.phoneNumber || "",
        role: user.role,
      },
      maintenance: {
        expectedAmount: maintenanceExpectedAmount,
        paidAmount,
        outstandingAmount: Math.max(maintenanceExpectedAmount - paidAmount, 0),
        nextDueMonth: nextMonth,
        latestReceipt,
        receipts,
      },
      funds: {
        openingBalance: balance.openingBalance,
        totalAssets: balance.totalAssets,
        verifiedIncome: balance.verifiedIncome,
      },
      expenses: {
        month: currentMonth,
        total: currentMonthExpenses.reduce((sum, item) => sum + (item.amount || 0), 0),
        byCategory: categoryTotals,
        recent: currentMonthExpenses.slice(0, 10),
      },
      notices,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
