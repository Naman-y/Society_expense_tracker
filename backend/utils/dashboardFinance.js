function getOpeningBalance() {
  return Number(process.env.OPENING_SOCIETY_BALANCE || 450000);
}

function sumVerifiedMaintenance(receipts = []) {
  return receipts
    .filter((item) => item.verificationStatus === "verified")
    .reduce((sum, item) => sum + (item.amount || 0), 0);
}

function buildBalance({ verifiedReceipts = [], expensesTotal = 0 }) {
  const openingBalance = getOpeningBalance();
  const verifiedIncome = sumVerifiedMaintenance(verifiedReceipts);

  return {
    openingBalance,
    verifiedIncome,
    totalAssets: openingBalance + verifiedIncome - (expensesTotal || 0),
  };
}

module.exports = {
  buildBalance,
  getOpeningBalance,
  sumVerifiedMaintenance,
};
