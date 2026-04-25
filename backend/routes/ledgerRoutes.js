const express = require("express");

const requireAuth = require("../middleware/requireAuth");
const authorizeRoles = require("../middleware/authorizeRoles");
const User = require("../models/User");
const MaintenanceCharge = require("../models/MaintenanceCharge");
const MaintenanceReceipt = require("../models/MaintenanceReceipt");
const {
  buildChargeLedgerEntry,
  createDueDate,
  endOfMonth,
  getMonthValue,
  isMonthValue,
  startOfMonth,
} = require("../utils/maintenanceLedger");

const router = express.Router();

function getMaintenanceAmount(value) {
  const resolved = Number(value || process.env.DEFAULT_MAINTENANCE_AMOUNT || 3000);
  return Number.isFinite(resolved) && resolved >= 0 ? resolved : 3000;
}

function getDefaultDueDay(value) {
  const resolved = Number(value || process.env.DEFAULT_MAINTENANCE_DUE_DAY || 10);
  return Math.max(1, Math.min(resolved || 10, 28));
}

function buildFlatResidentMap(users) {
  return users.reduce((acc, user) => {
    const flatNumber = (user.flatNumber || "").trim();

    if (!flatNumber) {
      return acc;
    }

    if (!acc[flatNumber]) {
      acc[flatNumber] = {
        flatNumber,
        flatOwnerName: user.flatOwnerName || "",
        residents: [],
      };
    }

    if (!acc[flatNumber].flatOwnerName && user.flatOwnerName) {
      acc[flatNumber].flatOwnerName = user.flatOwnerName;
    }

    acc[flatNumber].residents.push({
      clerkId: user.clerkId,
      name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Resident",
      role: user.role || "member",
    });

    return acc;
  }, {});
}

router.post(
  "/generate-month",
  requireAuth,
  authorizeRoles("admin", "secretary", "cashier"),
  async (req, res, next) => {
    try {
      const month = req.body?.month || getMonthValue(new Date());
      const amount = getMaintenanceAmount(req.body?.amount);
      const dueDay = getDefaultDueDay(req.body?.dueDay);

      if (!isMonthValue(month)) {
        return res.status(400).json({ message: "Month must be in YYYY-MM format" });
      }

      const users = await User.find({ flatNumber: { $ne: "" } }).lean();
      const flatResidentMap = buildFlatResidentMap(users);
      const flats = Object.keys(flatResidentMap);

      if (flats.length === 0) {
        return res.status(400).json({ message: "No flat records found to generate maintenance charges" });
      }

      const dueDate = createDueDate(month, dueDay);
      const operations = flats.map((flatNumber) => ({
        updateOne: {
          filter: { flatNumber, month },
          update: {
            $setOnInsert: {
              flatNumber,
              month,
              amount,
              dueDate,
              generatedByClerkId: req.currentUser.clerkId,
              notes: `Auto-generated maintenance charge for ${month}`,
            },
          },
          upsert: true,
        },
      }));

      await MaintenanceCharge.bulkWrite(operations, { ordered: false });

      const charges = await MaintenanceCharge.find({ month }).sort({ flatNumber: 1 }).lean();
      return res.status(201).json({
        month,
        generatedCount: charges.length,
        amount,
        dueDate,
        charges,
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.get(
  "/overview",
  requireAuth,
  authorizeRoles("admin", "secretary", "cashier"),
  async (req, res, next) => {
    try {
      const month = req.query?.month || getMonthValue(new Date());
      const search = (req.query?.search || "").trim().toLowerCase();
      const statusFilter = (req.query?.status || "all").trim().toLowerCase();

      if (!isMonthValue(month)) {
        return res.status(400).json({ message: "Month must be in YYYY-MM format" });
      }

      const [charges, users, receipts] = await Promise.all([
        MaintenanceCharge.find({ month }).sort({ flatNumber: 1 }).lean(),
        User.find({ flatNumber: { $ne: "" } }).lean(),
        MaintenanceReceipt.find({ month }).sort({ createdAt: -1 }).lean(),
      ]);

      const flatResidentMap = buildFlatResidentMap(users);
      const receiptMap = receipts.reduce((acc, receipt) => {
        const key = (receipt.flatNumber || "").trim();
        if (!key) {
          return acc;
        }

        if (!acc[key]) {
          acc[key] = [];
        }

        acc[key].push(receipt);
        return acc;
      }, {});

      const rows = charges
        .map((charge) => {
          const flatDetails = flatResidentMap[charge.flatNumber] || {
            flatNumber: charge.flatNumber,
            flatOwnerName: "",
            residents: [],
          };
          const ledger = buildChargeLedgerEntry({
            charge,
            receipts: receiptMap[charge.flatNumber] || [],
          });

          return {
            flatNumber: charge.flatNumber,
            flatOwnerName: flatDetails.flatOwnerName,
            residents: flatDetails.residents,
            residentNames: flatDetails.residents.map((item) => item.name),
            ...ledger,
          };
        })
        .filter((row) => {
          if (statusFilter !== "all" && row.status !== statusFilter) {
            return false;
          }

          if (!search) {
            return true;
          }

          return [row.flatNumber, row.flatOwnerName, ...row.residentNames]
            .join(" ")
            .toLowerCase()
            .includes(search);
        });

      const summary = rows.reduce(
        (acc, row) => {
          acc.totalCharges += row.amount || 0;
          acc.totalPaid += row.paidAmount || 0;
          acc.totalOutstanding += row.outstandingAmount || 0;
          acc[row.status] = (acc[row.status] || 0) + 1;
          return acc;
        },
        {
          totalCharges: 0,
          totalPaid: 0,
          totalOutstanding: 0,
          paid: 0,
          pending: 0,
          partial: 0,
          late: 0,
        }
      );

      return res.json({
        month,
        summary,
        rows,
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.get("/member-summary", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findOne({ clerkId: req.auth.userId }).lean();

    if (!user) {
      return res.status(404).json({ message: "User profile not found" });
    }

    if (!user.flatNumber) {
      return res.status(400).json({ message: "Flat number is required to view maintenance ledger" });
    }

    const charges = await MaintenanceCharge.find({ flatNumber: user.flatNumber })
      .sort({ month: -1 })
      .limit(12)
      .lean();

    const months = charges.map((item) => item.month);
    const receipts = await MaintenanceReceipt.find({
      flatNumber: user.flatNumber,
      ...(months.length > 0 ? { month: { $in: months } } : {}),
    })
      .sort({ createdAt: -1 })
      .lean();

    const receiptMap = receipts.reduce((acc, receipt) => {
      if (!acc[receipt.month]) {
        acc[receipt.month] = [];
      }
      acc[receipt.month].push(receipt);
      return acc;
    }, {});

    const ledger = charges.map((charge) =>
      buildChargeLedgerEntry({
        charge,
        receipts: receiptMap[charge.month] || [],
      })
    );

    const current = ledger[0] || null;
    const totals = ledger.reduce(
      (acc, row) => {
        acc.totalCharged += row.amount || 0;
        acc.totalPaid += row.paidAmount || 0;
        acc.totalOutstanding += row.outstandingAmount || 0;
        return acc;
      },
      { totalCharged: 0, totalPaid: 0, totalOutstanding: 0 }
    );

    return res.json({
      flatNumber: user.flatNumber,
      flatOwnerName: user.flatOwnerName || "",
      current,
      totals,
      ledger,
    });
  } catch (error) {
    return next(error);
  }
});

router.get(
  "/timeline",
  requireAuth,
  authorizeRoles("admin", "secretary", "cashier"),
  async (req, res, next) => {
    try {
      const month = req.query?.month || getMonthValue(new Date());

      if (!isMonthValue(month)) {
        return res.status(400).json({ message: "Month must be in YYYY-MM format" });
      }

      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);

      const charges = await MaintenanceCharge.find({
        createdAt: {
          $gte: monthStart,
          $lt: monthEnd,
        },
      })
        .sort({ createdAt: -1 })
        .lean();

      return res.json({ month, charges });
    } catch (error) {
      return next(error);
    }
  }
);

module.exports = router;
