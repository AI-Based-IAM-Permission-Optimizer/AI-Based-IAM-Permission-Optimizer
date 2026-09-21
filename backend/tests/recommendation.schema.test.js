const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CONFIRMED_PIPELINE_FIELDS,
  PENDING_BACKEND_FIELDS,
  RECOMMENDATION_FIELDS,
  FINAL_RECOMMENDATION_FIELDS,
  RECOMMENDATION_STATUS,
  APPROVAL_STATUS,
  RECOMMENDATION_VALUES
} = require("../src/domain/recommendation.schema");

test("the recommendation domain contains every confirmed pipeline field", () => {
  assert.deepEqual(CONFIRMED_PIPELINE_FIELDS, [
    "user_id",
    "role_id",
    "action",
    "resource",
    "resource_scope",
    "usage_count",
    "unique_days_used",
    "days_since_last_use",
    "first_used",
    "last_used",
    "success_count",
    "failure_count",
    "success_rate",
    "failure_rate",
    "permission_status",
    "operation_type",
    "risk_level",
    "risk_weight"
  ]);
});

test("unconfirmed fields remain isolated from confirmed pipeline fields", () => {
  assert.deepEqual(PENDING_BACKEND_FIELDS, [
    "recommendation_id",
    "risk_score",
    "recommendation",
    "status",
    "created_at",
    "reviewed_at"
  ]);

  assert.deepEqual(RECOMMENDATION_FIELDS, [
    ...CONFIRMED_PIPELINE_FIELDS,
    ...PENDING_BACKEND_FIELDS
  ]);
  assert.equal(
    CONFIRMED_PIPELINE_FIELDS.some((field) => PENDING_BACKEND_FIELDS.includes(field)),
    false
  );
});

test("the recommendation workflow has the planned status and approval vocabulary", () => {
  assert.deepEqual(RECOMMENDATION_STATUS, {
    PENDING: "PENDING",
    APPROVED: "APPROVED",
    REJECTED: "REJECTED"
  });
  assert.deepEqual(APPROVAL_STATUS, {
    PENDING: "PENDING",
    APPROVED: "APPROVED",
    REJECTED: "REJECTED"
  });
  assert.deepEqual(RECOMMENDATION_VALUES, {
    KEEP: "KEEP",
    REVIEW: "REVIEW",
    REMOVE: "REMOVE"
  });
});

test("FINAL_RECOMMENDATION_FIELDS contains all 21 fields from the finalized contract", () => {
  assert.deepEqual(FINAL_RECOMMENDATION_FIELDS, [
    "recommendation_id",
    "user_id",
    "role_id",
    "action",
    "resource",
    "risk_score",
    "risk_weight",
    "risk_level",
    "prediction",
    "recommendation",
    "confidence",
    "reason_codes",
    "explanation",
    "model_version",
    "generated_at",
    "approval_status",
    "approved_by",
    "approved_at",
    "rejection_reason",
    "policy_version",
    "updated_at"
  ]);
});
