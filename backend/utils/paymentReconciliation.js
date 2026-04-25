const PAYMENT_MODES = ["upi", "bank_transfer", "cash", "cheque", "card", "other"];
const RECONCILIATION_STATUSES = ["pending", "matched", "manual_review"];

function normalizePaymentMode(value) {
  return PAYMENT_MODES.includes(value) ? value : "upi";
}

function normalizeTransactionReference(value) {
  return (value || "").trim().slice(0, 120);
}

function getInitialReconciliationStatus({ paymentMode, transactionReference }) {
  if (paymentMode === "cash") {
    return "manual_review";
  }

  return transactionReference ? "matched" : "pending";
}

function normalizeReconciliationStatus(value, fallback = "pending") {
  return RECONCILIATION_STATUSES.includes(value) ? value : fallback;
}

module.exports = {
  PAYMENT_MODES,
  RECONCILIATION_STATUSES,
  getInitialReconciliationStatus,
  normalizePaymentMode,
  normalizeReconciliationStatus,
  normalizeTransactionReference,
};
