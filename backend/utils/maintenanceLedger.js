function getMonthValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function isMonthValue(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value || "");
}

function parseMonthValue(month) {
  if (!isMonthValue(month)) {
    return null;
  }

  const [year, monthValue] = month.split("-").map(Number);
  return new Date(year, monthValue - 1, 1);
}

function createDueDate(month, dueDay) {
  const monthDate = parseMonthValue(month);

  if (!monthDate) {
    return null;
  }

  const safeDueDay = Math.max(1, Math.min(Number(dueDay) || 10, 28));
  return new Date(monthDate.getFullYear(), monthDate.getMonth(), safeDueDay);
}

function startOfMonth(month) {
  return parseMonthValue(month);
}

function endOfMonth(month) {
  const monthDate = parseMonthValue(month);

  if (!monthDate) {
    return null;
  }

  return new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);
}

function getChargeStatus({ outstandingAmount, paidAmount, dueDate, now = new Date() }) {
  if ((outstandingAmount || 0) <= 0) {
    return "paid";
  }

  if ((paidAmount || 0) > 0) {
    return now > new Date(dueDate) ? "late" : "partial";
  }

  return now > new Date(dueDate) ? "late" : "pending";
}

function buildChargeLedgerEntry({ charge, receipts, now = new Date() }) {
  const verifiedReceipts = receipts.filter((item) => item.verificationStatus === "verified");
  const pendingReceipts = receipts.filter((item) => item.verificationStatus === "pending");
  const rejectedReceipts = receipts.filter((item) => item.verificationStatus === "rejected");
  const paidAmount = verifiedReceipts.reduce((sum, item) => sum + (item.amount || 0), 0);
  const outstandingAmount = Math.max((charge?.amount || 0) - paidAmount, 0);

  return {
    chargeId: charge?._id || null,
    month: charge?.month || "",
    amount: charge?.amount || 0,
    dueDate: charge?.dueDate || null,
    paidAmount,
    outstandingAmount,
    verifiedReceiptsCount: verifiedReceipts.length,
    pendingReceiptsCount: pendingReceipts.length,
    rejectedReceiptsCount: rejectedReceipts.length,
    latestReceipt: receipts[0] || null,
    status: getChargeStatus({
      outstandingAmount,
      paidAmount,
      dueDate: charge?.dueDate,
      now,
    }),
  };
}

module.exports = {
  buildChargeLedgerEntry,
  createDueDate,
  endOfMonth,
  getMonthValue,
  isMonthValue,
  startOfMonth,
};
