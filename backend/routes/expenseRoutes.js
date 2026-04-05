const express = require("express");

const requireAuth = require("../middleware/requireAuth");
const authorizeRoles = require("../middleware/authorizeRoles");
const User = require("../models/User");
const Expense = require("../models/Expense");

const router = express.Router();

function getMonthFromDate(dateValue) {
  const date = new Date(dateValue);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const { month, category, search } = req.query;

    const filter = {};

    if (month) {
      filter.month = month;
    }

    if (category && category !== "all") {
      filter.category = category;
    }

    if (search) {
      filter.title = { $regex: search, $options: "i" };
    }

    const expenses = await Expense.find(filter).sort({ expenseDate: -1, createdAt: -1 }).lean();

    const totalAmount = expenses.reduce((sum, item) => sum + (item.amount || 0), 0);

    return res.json({
      expenses,
      totalAmount,
      count: expenses.length,
    });
  } catch (error) {
    return next(error);
  }
});

router.post(
  "/",
  requireAuth,
  authorizeRoles("admin", "secretary", "cashier"),
  async (req, res, next) => {
    try {
      const { title, category, amount, expenseDate, description } = req.body;

      if (!title || !category || !amount || !expenseDate) {
        return res.status(400).json({ message: "title, category, amount and expenseDate are required" });
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
      });

      return res.status(201).json(expense);
    } catch (error) {
      return next(error);
    }
  }
);

router.patch(
  "/:id",
  requireAuth,
  authorizeRoles("admin", "secretary", "cashier"),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { title, category, amount, expenseDate, description } = req.body;

      const payload = {
        title: title?.trim(),
        category,
        amount: Number(amount),
        expenseDate: expenseDate ? new Date(expenseDate) : undefined,
        description: (description || "").trim(),
      };

      if (payload.expenseDate) {
        payload.month = getMonthFromDate(payload.expenseDate);
      }

      Object.keys(payload).forEach((key) => {
        if (payload[key] === undefined || Number.isNaN(payload[key])) {
          delete payload[key];
        }
      });

      const expense = await Expense.findByIdAndUpdate(id, { $set: payload }, { new: true });

      if (!expense) {
        return res.status(404).json({ message: "Expense not found" });
      }

      return res.json(expense);
    } catch (error) {
      return next(error);
    }
  }
);

router.delete(
  "/:id",
  requireAuth,
  authorizeRoles("admin", "secretary", "cashier"),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const expense = await Expense.findByIdAndDelete(id);

      if (!expense) {
        return res.status(404).json({ message: "Expense not found" });
      }

      return res.json({ message: "Expense deleted" });
    } catch (error) {
      return next(error);
    }
  }
);

router.get("/meta/my-role", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findOne({ clerkId: req.auth.userId }).lean();

    if (!user) {
      return res.status(404).json({ message: "User profile not found" });
    }

    return res.json({ role: user.role });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
