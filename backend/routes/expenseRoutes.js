const express = require("express");

const requireAuth = require("../middleware/requireAuth");
const authorizeRoles = require("../middleware/authorizeRoles");
const User = require("../models/User");
const Expense = require("../models/Expense");
const { createAuditLog } = require("../utils/auditLogger");

const router = express.Router();

function getMonthFromDate(dateValue) {
  const date = new Date(dateValue);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function shouldRequireApproval({ amount, role }) {
  const threshold = Number(process.env.EXPENSE_APPROVAL_THRESHOLD || 0);
  if (role === "admin") {
    return false;
  }

  return Number(amount) >= threshold;
}

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const { month, category, search, status } = req.query;
    const user = await User.findOne({ clerkId: req.auth.userId }).lean();

    if (!user) {
      return res.status(404).json({ message: "User profile not found" });
    }

    const isManagement = ["admin", "secretary", "cashier"].includes(user.role);

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

    if (status && status !== "all") {
      filter.approvalStatus = status;
    } else if (!isManagement) {
      filter.approvalStatus = "approved";
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

      const normalizedAmount = Number(amount);
      const approvalRequired = shouldRequireApproval({
        amount: normalizedAmount,
        role: req.currentUser.role,
      });
      const approvalStatus = req.currentUser.role === "admin" || !approvalRequired ? "approved" : "pending";

      const expense = await Expense.create({
        title: title.trim(),
        category,
        amount: normalizedAmount,
        expenseDate: new Date(expenseDate),
        month: getMonthFromDate(expenseDate),
        description: (description || "").trim(),
        createdByClerkId: req.currentUser.clerkId,
        createdByRole: req.currentUser.role,
        submittedByName: `${req.currentUser.firstName || ""} ${req.currentUser.lastName || ""}`.trim(),
        approvalRequired,
        approvalStatus,
        approvedByClerkId: approvalStatus === "approved" ? req.currentUser.clerkId : "",
        approvedAt: approvalStatus === "approved" ? new Date() : null,
        approvalRemark: approvalStatus === "approved" ? "Auto-approved by admin workflow" : "",
      });

      await createAuditLog({
        entityType: "expense",
        entityId: expense._id,
        action: "expense_created",
        actor: req.currentUser,
        summary: `Expense "${expense.title}" created with status ${expense.approvalStatus}`,
        metadata: {
          amount: expense.amount,
          category: expense.category,
          month: expense.month,
          approvalStatus: expense.approvalStatus,
        },
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
      const existingExpense = await Expense.findById(id);

      if (!existingExpense) {
        return res.status(404).json({ message: "Expense not found" });
      }

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

      if (payload.amount !== undefined) {
        payload.approvalRequired = shouldRequireApproval({
          amount: payload.amount,
          role: req.currentUser.role,
        });
      }

      if (req.currentUser.role !== "admin") {
        payload.approvalStatus = "pending";
        payload.approvedByClerkId = "";
        payload.approvedAt = null;
        payload.approvalRemark = "";
      }

      const expense = await Expense.findByIdAndUpdate(id, { $set: payload }, { new: true });

      await createAuditLog({
        entityType: "expense",
        entityId: expense._id,
        action: "expense_updated",
        actor: req.currentUser,
        summary: `Expense "${expense.title}" updated`,
        metadata: {
          previousStatus: existingExpense.approvalStatus,
          nextStatus: expense.approvalStatus,
        },
      });

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

      await createAuditLog({
        entityType: "expense",
        entityId: expense._id,
        action: "expense_deleted",
        actor: req.currentUser,
        summary: `Expense "${expense.title}" deleted`,
        metadata: {
          amount: expense.amount,
          category: expense.category,
          approvalStatus: expense.approvalStatus,
        },
      });

      return res.json({ message: "Expense deleted" });
    } catch (error) {
      return next(error);
    }
  }
);

router.patch(
  "/:id/approval",
  requireAuth,
  authorizeRoles("admin"),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { approvalStatus, approvalRemark } = req.body || {};

      if (!["approved", "rejected"].includes(approvalStatus)) {
        return res.status(400).json({ message: "approvalStatus must be approved or rejected" });
      }

      const expense = await Expense.findByIdAndUpdate(
        id,
        {
          $set: {
            approvalStatus,
            approvalRemark: (approvalRemark || "").trim(),
            approvedByClerkId: req.currentUser.clerkId,
            approvedAt: new Date(),
          },
        },
        { new: true }
      );

      if (!expense) {
        return res.status(404).json({ message: "Expense not found" });
      }

      await createAuditLog({
        entityType: "expense",
        entityId: expense._id,
        action: approvalStatus === "approved" ? "expense_approved" : "expense_rejected",
        actor: req.currentUser,
        summary: `Expense "${expense.title}" ${approvalStatus}`,
        metadata: {
          approvalRemark: expense.approvalRemark,
          amount: expense.amount,
          category: expense.category,
        },
      });

      return res.json(expense);
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
