const mongoose = require("mongoose");

const maintenanceChargeSchema = new mongoose.Schema(
  {
    flatNumber: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    month: {
      type: String,
      required: true,
      match: /^\d{4}-(0[1-9]|1[0-2])$/,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    generatedByClerkId: {
      type: String,
      default: "",
      index: true,
    },
    notes: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

maintenanceChargeSchema.index({ flatNumber: 1, month: 1 }, { unique: true });

module.exports = mongoose.model("MaintenanceCharge", maintenanceChargeSchema);
