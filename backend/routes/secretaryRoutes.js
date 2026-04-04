const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const requireAuth = require("../middleware/requireAuth");
const authorizeRoles = require("../middleware/authorizeRoles");
const User = require("../models/User");
const Expense = require("../models/Expense");
const Notice = require("../models/Notice");
const MaintenanceReceipt = require("../models/MaintenanceReceipt");
const { buildBalance } = require("../utils/dashboardFinance");

const router = express.Router();

const uploadsDir = path.join(__dirname, "..", "uploads", "bills");
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".pdf";
    const safeExt = [".png", ".jpg", ".jpeg", ".webp", ".pdf"].includes(ext)
      ? ext
      : ".pdf";
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

function getMonthFromDate(dateValue) {
  const date = new Date(dateValue);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

router.get(
  "/dashboard",
  requireAuth,
  authorizeRoles("secretary", "admin"),
  async (req, res, next) => {
    try {
      const today = new Date();
      const currentMonth = getMonthFromDate(today);

      const [currentMonthExpenses, recentNotices, currentMonthReceipts] =
        await Promise.all([
          Expense.find({ month: currentMonth }).sort({ expenseDate: -1 }).limit(50).lean(),
          Notice.find({}).sort({ pinned: -1, createdAt: -1 }).limit(20).lean(),
          MaintenanceReceipt.find({ verificationStatus: "verified" }).lean(),
        ]);

      const expenditure = currentMonthExpenses.reduce((sum, item) => sum + (item.amount || 0), 0);
      const balance = buildBalance({
        verifiedReceipts: currentMonthReceipts,
        expensesTotal: expenditure,
      });

      const monthlyPerformance = [];
      for (let i = 3; i >= 0; i -= 1) {
        const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const monthValue = getMonthFromDate(date);
        const monthLabel = date.toLocaleString("en-IN", { month: "short" }).toUpperCase();

        const [mExpenses, mReceipts] = await Promise.all([
          Expense.find({ month: monthValue }).lean(),
          MaintenanceReceipt.find({ month: monthValue, verificationStatus: "verified" }).lean(),
        ]);

        monthlyPerformance.push({
          month: monthLabel,
          income: mReceipts.reduce((sum, item) => sum + (item.amount || 0), 0),
          expense: mExpenses.reduce((sum, item) => sum + (item.amount || 0), 0),
        });
      }

      const funds = {
        totalAssets: balance.totalAssets,
        operationalFund: Math.max(120000 + balance.verifiedIncome - Math.round(expenditure * 0.6), 0),
        reserveFund: Math.max(300000 - Math.round(expenditure * 0.4), 0),
      };

      return res.json({
        month: currentMonth,
        funds,
        monthlyPerformance,
        summary: {
          income: balance.verifiedIncome,
          expenditure,
          openingBalance: balance.openingBalance,
          totalAssets: balance.totalAssets,
        },
        recentExpenses: currentMonthExpenses,
        notices: recentNotices,
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.post(
  "/notices",
  requireAuth,
  authorizeRoles("secretary", "admin"),
  async (req, res, next) => {
    try {
      const { title, message, pinned, expiresAt } = req.body;

      if (!title || !message) {
        return res.status(400).json({ message: "title and message are required" });
      }

      const notice = await Notice.create({
        title: title.trim(),
        message: message.trim(),
        pinned: Boolean(pinned),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        createdByClerkId: req.currentUser.clerkId,
        createdByRole: req.currentUser.role,
      });

      return res.status(201).json(notice);
    } catch (error) {
      return next(error);
    }
  }
);

router.patch(
  "/notices/:id",
  requireAuth,
  authorizeRoles("secretary", "admin"),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { title, message, pinned, expiresAt } = req.body;

      const payload = {
        title: title?.trim(),
        message: message?.trim(),
        pinned,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      };

      Object.keys(payload).forEach((key) => {
        if (payload[key] === undefined) {
          delete payload[key];
        }
      });

      const notice = await Notice.findByIdAndUpdate(id, { $set: payload }, { new: true });
      if (!notice) {
        return res.status(404).json({ message: "Notice not found" });
      }

      return res.json(notice);
    } catch (error) {
      return next(error);
    }
  }
);

router.post(
  "/expenses/upload",
  requireAuth,
  authorizeRoles("secretary", "admin", "cashier"),
  upload.single("bill"),
  async (req, res, next) => {
    try {
      const { title, category, amount, expenseDate, description } = req.body;

      if (!title || !category || !amount || !expenseDate) {
        return res.status(400).json({
          message: "title, category, amount, and expenseDate are required",
        });
      }

      const allowedCategories = [
        "guard",
        "electricity",
        "water",
        "plumber",
        "miscellaneous",
        "diesel",
      ];

      if (!allowedCategories.includes(category)) {
        return res.status(400).json({ message: "Invalid expense category" });
      }

      const expense = await Expense.create({
        title: title.trim(),
        category,
        amount: Number(amount),
        expenseDate: new Date(expenseDate),
        month: getMonthFromDate(expenseDate),
        description: (description || "").trim(),
        createdByClerkId: req.currentUser.clerkId,
        createdByRole: req.currentUser.role,
        billUrl: req.file ? `/uploads/bills/${req.file.filename}` : "",
      });

      return res.status(201).json(expense);
    } catch (error) {
      return next(error);
    }
  }
);

module.exports = router;
