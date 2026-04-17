const express = require("express");

const requireAuth = require("../middleware/requireAuth");
const authorizeRoles = require("../middleware/authorizeRoles");
const User = require("../models/User");
const Expense = require("../models/Expense");
const Notice = require("../models/Notice");
const MaintenanceReceipt = require("../models/MaintenanceReceipt");
const { buildBalance } = require("../utils/dashboardFinance");
const {
  getInitialReconciliationStatus,
  normalizeReconciliationStatus,
} = require("../utils/paymentReconciliation");

const router = express.Router();

function getMonthValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

router.get(
  "/dashboard",
  requireAuth,
  authorizeRoles("cashier", "admin"),
  async (req, res, next) => {
    try {
      const today = new Date();
      const currentMonth = getMonthValue(today);

      const [pendingReceipts, verifiedReceipts, currentMonthExpenses, notices, users] =
        await Promise.all([
          MaintenanceReceipt.find({ verificationStatus: "pending" })
            .sort({ createdAt: -1 })
            .limit(25)
            .lean(),
          MaintenanceReceipt.find({ verificationStatus: "verified" })
            .sort({ verifiedAt: -1 })
            .limit(25)
            .lean(),
          Expense.find({ month: currentMonth, approvalStatus: "approved" }).sort({ expenseDate: -1 }).limit(30).lean(),
          Notice.find({}).sort({ pinned: -1, createdAt: -1 }).limit(15).lean(),
          User.find({}).sort({ createdAt: -1 }).limit(100).lean(),
        ]);

      const byCategory = currentMonthExpenses.reduce(
        (acc, item) => {
          if (Object.prototype.hasOwnProperty.call(acc, item.category)) {
            acc[item.category] += item.amount || 0;
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
      const balance = buildBalance({
        verifiedReceipts,
        expensesTotal: currentMonthExpenses.reduce((sum, item) => sum + (item.amount || 0), 0),
      });

      return res.json({
        month: currentMonth,
        summary: {
          pendingCount: pendingReceipts.length,
          verifiedCount: verifiedReceipts.length,
          matchedCount: verifiedReceipts.filter((item) => item.reconciliationStatus === "matched").length,
          manualReviewCount: verifiedReceipts.filter((item) => item.reconciliationStatus === "manual_review").length,
          expensesTotal: currentMonthExpenses.reduce((sum, item) => sum + (item.amount || 0), 0),
          receiptsTotal: balance.verifiedIncome,
          openingBalance: balance.openingBalance,
          totalAssets: balance.totalAssets,
        },
        pendingReceipts,
        verifiedReceipts,
        notices,
        expenses: currentMonthExpenses,
        expensesByCategory: byCategory,
        users,
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.patch(
  "/receipts/:id/verify",
  requireAuth,
  authorizeRoles("cashier", "admin"),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { verificationStatus, verificationRemark, reconciliationStatus, reconciliationRemark } = req.body;

      if (!["verified", "rejected"].includes(verificationStatus)) {
        return res.status(400).json({ message: "verificationStatus must be verified or rejected" });
      }

      const existingReceipt = await MaintenanceReceipt.findById(id).lean();

      if (!existingReceipt) {
        return res.status(404).json({ message: "Receipt not found" });
      }

      const resolvedReconciliationStatus =
        verificationStatus === "rejected"
          ? "pending"
          : normalizeReconciliationStatus(
              reconciliationStatus,
              existingReceipt.paymentMode === "cash"
                ? "manual_review"
                : getInitialReconciliationStatus(existingReceipt)
            );

      const receipt = await MaintenanceReceipt.findByIdAndUpdate(
        id,
        {
          $set: {
            verificationStatus,
            verificationRemark: (verificationRemark || "").trim(),
            reconciliationStatus: resolvedReconciliationStatus,
            reconciliationRemark: (reconciliationRemark || "").trim(),
            reconciledByClerkId: req.currentUser.clerkId,
            reconciledAt: new Date(),
            verifiedByClerkId: req.currentUser.clerkId,
            verifiedAt: new Date(),
          },
        },
        { new: true }
      );

      if (!receipt) {
        return res.status(404).json({ message: "Receipt not found" });
      }

      return res.json(receipt);
    } catch (error) {
      return next(error);
    }
  }
);

module.exports = router;
