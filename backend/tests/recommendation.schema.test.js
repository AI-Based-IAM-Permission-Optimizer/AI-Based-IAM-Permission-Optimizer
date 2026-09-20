const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CONFIRMED_PIPELINE_FIELDS,
  PENDING_BACKEND_FIELDS,
  RECOMMENDATION_FIELDS,
  RECOMMENDATION_STATUS
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

test("the recommendation workflow has the planned status vocabulary", () => {
  assert.deepEqual(RECOMMENDATION_STATUS, {
    PENDING: "PENDING",
    APPROVED: "APPROVED",
    REJECTED: "REJECTED"
  });
});
