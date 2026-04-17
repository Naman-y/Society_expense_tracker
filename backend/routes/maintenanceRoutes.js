const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const requireAuth = require("../middleware/requireAuth");
const authorizeRoles = require("../middleware/authorizeRoles");
const User = require("../models/User");
const MaintenanceReceipt = require("../models/MaintenanceReceipt");
const {
  getInitialReconciliationStatus,
  normalizePaymentMode,
  normalizeReconciliationStatus,
  normalizeTransactionReference,
} = require("../utils/paymentReconciliation");

const router = express.Router();

const uploadsDir = path.join(__dirname, "..", "uploads", "maintenance");
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".png";
    const safeExt = [".png", ".jpg", ".jpeg", ".webp", ".pdf"].includes(ext)
      ? ext
      : ".png";
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
});

function normalizeReceiptUrl(filename) {
  return `/uploads/maintenance/${filename}`;
}

router.post(
  "/upload",
  requireAuth,
  authorizeRoles("member", "admin", "secretary", "cashier"),
  upload.single("receipt"),
    async (req, res, next) => {
    try {
      const { month, amount, paymentDate, paymentMode, transactionReference, notes } = req.body;

      if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
        return res.status(400).json({ message: "Month must be in YYYY-MM format" });
      }

      if (!amount || Number.isNaN(Number(amount))) {
        return res.status(400).json({ message: "Valid amount is required" });
      }

      if (!paymentDate) {
        return res.status(400).json({ message: "Payment date is required" });
      }

      const resolvedPaymentMode = normalizePaymentMode(paymentMode);
      const resolvedReference = normalizeTransactionReference(transactionReference);

      if (resolvedPaymentMode !== "cash" && !resolvedReference) {
        return res.status(400).json({ message: "Transaction reference is required for non-cash payments" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "Receipt file is required" });
      }

      const user = req.currentUser;

      const receipt = await MaintenanceReceipt.create({
        uploadedByClerkId: user.clerkId,
        uploadedByName: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
        flatNumber: user.flatNumber || "",
        month,
        amount: Number(amount),
        paymentDate: new Date(paymentDate),
        paymentMode: resolvedPaymentMode,
        transactionReference: resolvedReference,
        notes: (notes || "").trim(),
        receiptUrl: normalizeReceiptUrl(req.file.filename),
        reconciliationStatus: getInitialReconciliationStatus({
          paymentMode: resolvedPaymentMode,
          transactionReference: resolvedReference,
        }),
      });

      return res.status(201).json(receipt);
    } catch (error) {
      return next(error);
    }
  }
);

router.get("/history", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findOne({ clerkId: req.auth.userId }).lean();

    if (!user) {
      return res.status(404).json({ message: "User profile not found" });
    }

    const isManagement = ["admin", "secretary", "cashier"].includes(user.role);

    const filter = isManagement
      ? {}
      : {
          uploadedByClerkId: user.clerkId,
        };

    const receipts = await MaintenanceReceipt.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return res.json({
      role: user.role,
      receipts,
    });
  } catch (error) {
    return next(error);
  }
});

router.patch(
  "/:id/verify",
  requireAuth,
  authorizeRoles("admin", "cashier"),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { verificationStatus, verificationRemark, reconciliationStatus, reconciliationRemark } = req.body;

      if (!["verified", "rejected"].includes(verificationStatus)) {
        return res.status(400).json({
          message: "verificationStatus must be verified or rejected",
        });
      }

      const receipt = await MaintenanceReceipt.findById(id).lean();

      if (!receipt) {
        return res.status(404).json({ message: "Receipt not found" });
      }

      const resolvedReconciliationStatus =
        verificationStatus === "rejected"
          ? "pending"
          : normalizeReconciliationStatus(
              reconciliationStatus,
              receipt.paymentMode === "cash" ? "manual_review" : getInitialReconciliationStatus(receipt)
            );

      const updatedReceipt = await MaintenanceReceipt.findByIdAndUpdate(
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

      return res.json(updatedReceipt);
    } catch (error) {
      return next(error);
    }
  }
);

module.exports = router;
