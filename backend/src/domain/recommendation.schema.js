/**
 * Provisional backend domain for an ML-generated IAM permission recommendation.
 *
 * Confirmed pipeline fields are field names only. Their final HTTP payload
 * structure, data types, and validation rules must be agreed with the ML/data
 * team before Phase 7 ingestion work begins.
 */
const CONFIRMED_PIPELINE_FIELDS = Object.freeze([
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

/**
 * These fields are intentionally provisional. They require confirmation of
 * the ML output, backend workflow, or DynamoDB persistence contract.
 */
const PENDING_BACKEND_FIELDS = Object.freeze([
  "recommendation_id",
  "risk_score",
  "recommendation",
  "status",
  "created_at",
  "reviewed_at"
]);

const RECOMMENDATION_FIELDS = Object.freeze([
  ...CONFIRMED_PIPELINE_FIELDS,
  ...PENDING_BACKEND_FIELDS
]);

/**
 * Current planned workflow vocabulary. Approval transitions and IAM effects
 * are not implemented or confirmed by this Phase 2 definition.
 */
const RECOMMENDATION_STATUS = Object.freeze({
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED"
});

module.exports = {
  CONFIRMED_PIPELINE_FIELDS,
  PENDING_BACKEND_FIELDS,
  RECOMMENDATION_FIELDS,
  RECOMMENDATION_STATUS
};
