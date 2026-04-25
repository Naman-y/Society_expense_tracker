const AuditLog = require("../models/AuditLog");

async function createAuditLog({
  entityType,
  entityId,
  action,
  actor,
  summary,
  metadata = {},
}) {
  return AuditLog.create({
    entityType,
    entityId: String(entityId || ""),
    action,
    actorClerkId: actor?.clerkId || "",
    actorRole: actor?.role || "",
    actorName: `${actor?.firstName || ""} ${actor?.lastName || ""}`.trim(),
    summary: summary || "",
    metadata,
  });
}

module.exports = {
  createAuditLog,
};
