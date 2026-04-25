const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: ["guard", "electricity", "water", "plumber", "miscellaneous", "diesel"],
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    expenseDate: {
      type: Date,
      required: true,
      index: true,
    },
    month: {
      type: String,
      required: true,
      index: true,
    },
    description: {
      type: String,
      default: "",
    },
    createdByClerkId: {
      type: String,
      required: true,
      index: true,
    },
    createdByRole: {
      type: String,
      default: "",
    },
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    submittedByName: {
      type: String,
      default: "",
    },
    approvalRequired: {
      type: Boolean,
      default: true,
    },
    approvedByClerkId: {
      type: String,
      default: "",
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    approvalRemark: {
      type: String,
      default: "",
    },
    billUrl: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Expense", expenseSchema);
