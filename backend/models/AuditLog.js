const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      required: true,
      index: true,
    },
    entityId: {
      type: String,
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    actorClerkId: {
      type: String,
      default: "",
      index: true,
    },
    actorRole: {
      type: String,
      default: "",
    },
    actorName: {
      type: String,
      default: "",
    },
    summary: {
      type: String,
      default: "",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AuditLog", auditLogSchema);
