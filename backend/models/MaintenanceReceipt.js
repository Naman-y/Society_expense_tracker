const mongoose = require("mongoose");

const maintenanceReceiptSchema = new mongoose.Schema(
  {
    uploadedByClerkId: {
      type: String,
      required: true,
      index: true,
    },
    uploadedByName: {
      type: String,
      default: "",
    },
    flatNumber: {
      type: String,
      default: "",
      index: true,
    },
    month: {
      type: String,
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentDate: {
      type: Date,
      required: true,
    },
    paymentMode: {
      type: String,
      enum: ["upi", "bank_transfer", "cash", "cheque", "card", "other"],
      default: "upi",
      index: true,
    },
    transactionReference: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    notes: {
      type: String,
      default: "",
    },
    receiptUrl: {
      type: String,
      required: true,
    },
    verificationStatus: {
      type: String,
      enum: ["pending", "verified", "rejected"],
      default: "pending",
      index: true,
    },
    reconciliationStatus: {
      type: String,
      enum: ["pending", "matched", "manual_review"],
      default: "pending",
      index: true,
    },
    reconciledByClerkId: {
      type: String,
      default: "",
    },
    reconciledAt: {
      type: Date,
      default: null,
    },
    reconciliationRemark: {
      type: String,
      default: "",
    },
    verifiedByClerkId: {
      type: String,
      default: "",
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    verificationRemark: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("MaintenanceReceipt", maintenanceReceiptSchema);
