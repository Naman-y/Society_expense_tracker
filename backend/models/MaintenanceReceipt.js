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
