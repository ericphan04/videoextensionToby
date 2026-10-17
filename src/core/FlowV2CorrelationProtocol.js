var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) =>
  key in obj
    ? __defProp(obj, key, {
        enumerable: true,
        configurable: true,
        writable: true,
        value,
      })
    : (obj[key] = value);
var __publicField = (obj, key, value) =>
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
class FlowV2CorrelationProtocol {
  static canTransition(from, to) {
    return (
      Array.isArray(this.TRANSITIONS[from]) &&
      this.TRANSITIONS[from].includes(to)
    );
  }
  static validateReceipt(receipt, expected = {}) {
    if (!receipt || Number(receipt.schemaVersion) !== this.VERSION)
      return false;
    if (
      typeof receipt.attemptId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(receipt.attemptId)
    )
      return false;
    if (
      ![
        "armed",
        "input_seen",
        "request_seen",
        "response_seen",
        "poll_seen",
        "result_seen",
        "acceptance_unknown",
      ].includes(receipt.stage)
    )
      return false;
    if (
      !["image", "video"].includes(receipt.mediaType) ||
      !Number.isFinite(receipt.observedAt)
    )
      return false;
    if (expected.attemptId && receipt.attemptId !== expected.attemptId)
      return false;
    if (expected.projectId && receipt.projectId !== expected.projectId)
      return false;
    if (expected.mediaType && receipt.mediaType !== expected.mediaType)
      return false;
    if (
      Number.isFinite(expected.createdAt) &&
      receipt.observedAt < expected.createdAt
    )
      return false;
    if (
      Number.isFinite(expected.expiresAt) &&
      receipt.observedAt > expected.expiresAt
    )
      return false;
    if (
      receipt.requestIdentityFingerprint != null &&
      !/^id-[0-9a-f]{8}$/.test(receipt.requestIdentityFingerprint)
    )
      return false;
    if (
      receipt.requestIdentityTokens &&
      (!Array.isArray(receipt.requestIdentityTokens) ||
        receipt.requestIdentityTokens.some(
          (value) => !/^id-[0-9a-f]{8}$/.test(value),
        ))
    )
      return false;
    if (
      receipt.identityCandidates &&
      (!Array.isArray(receipt.identityCandidates) ||
        receipt.identityCandidates.some(
          (value) => !/^[0-9a-f-]{36}$/i.test(value),
        ))
    )
      return false;
    for (const key of ["operationIds", "mediaIds"]) {
      if (
        receipt[key] &&
        (!Array.isArray(receipt[key]) ||
          receipt[key].some((value) => !/^[0-9a-f-]{36}$/i.test(value)))
      )
        return false;
    }
    if (
      receipt.children &&
      (!Array.isArray(receipt.children) ||
        receipt.children.some(
          (child) =>
            !child ||
            !/^[0-9a-f-]{36}$/i.test(child.operationId || "") ||
            !["accepted", "processing", "completed", "failed"].includes(
              child.status || (child.mediaId ? "completed" : ""),
            ) ||
            ((child.status || (child.mediaId ? "completed" : "")) ===
              "completed" &&
              !/^[0-9a-f-]{36}$/i.test(child.mediaId || "")) ||
            (["accepted", "processing"].includes(child.status) &&
              !/^[0-9a-f-]{36}$/i.test(child.mediaId || "")) ||
            (child.mediaId != null &&
              !/^[0-9a-f-]{36}$/i.test(child.mediaId)) ||
            (child.errorCodes &&
              (!Array.isArray(child.errorCodes) ||
                child.errorCodes.some(
                  (value) => typeof value !== "string" || value.length > 96,
                ))),
        ))
    )
      return false;
    if (
      receipt.errorCodes &&
      (!Array.isArray(receipt.errorCodes) ||
        receipt.errorCodes.some(
          (value) => typeof value !== "string" || value.length > 96,
        ))
    )
      return false;
    return true;
  }
  static checkpoint(attempt) {
    return {
      schemaVersion: this.VERSION,
      attemptId: attempt.attemptId,
      projectId: attempt.projectId,
      surface: attempt.surface,
      mediaType: attempt.mediaType,
      expectedQuantity: attempt.expectedQuantity,
      state: attempt.state,
      createdAt: attempt.createdAt,
      expiresAt: attempt.expiresAt,
      operationIds: [...new Set(attempt.operationIds || [])],
      mediaIds: [...new Set(attempt.mediaIds || [])],
      children: (attempt.children || []).map((child) => ({ ...child })),
    };
  }
}
__publicField(FlowV2CorrelationProtocol, "VERSION", 1);
__publicField(FlowV2CorrelationProtocol, "OBSERVER_REVISION", 23);
__publicField(
  FlowV2CorrelationProtocol,
  "STATES",
  Object.freeze({
    ARMED: "armed",
    REQUEST_SEEN: "request_seen",
    ACCEPTED: "accepted",
    ACCEPTANCE_UNKNOWN: "acceptance_unknown",
    REJECTED: "rejected",
    MONITORING: "monitoring",
    COMPLETED: "completed",
    FAILED: "failed",
    SUPERSEDED: "superseded",
  }),
);
__publicField(
  FlowV2CorrelationProtocol,
  "TRANSITIONS",
  Object.freeze({
    armed: ["request_seen", "acceptance_unknown", "failed", "superseded"],
    request_seen: ["accepted", "acceptance_unknown", "rejected", "superseded"],
    accepted: ["monitoring", "completed", "failed", "superseded"],
    acceptance_unknown: ["monitoring", "completed", "failed", "superseded"],
    rejected: ["failed", "superseded"],
    monitoring: ["completed", "failed", "superseded"],
    completed: [],
    failed: [],
    superseded: [],
  }),
);
window.FlowV2CorrelationProtocol = FlowV2CorrelationProtocol;
