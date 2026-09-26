/**
 * Backend domain for ML-generated IAM permission recommendations.
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
 * Provisional backend fields preserved for Phase 2 test compatibility.
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
 * Finalized ML and Backend Integration Recommendation fields contract.
 */
const FINAL_RECOMMENDATION_FIELDS = Object.freeze([
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

/**
 * Finalized approval status vocabulary.
 */
const APPROVAL_STATUS = Object.freeze({
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED"
});

const RECOMMENDATION_STATUS = APPROVAL_STATUS;

/**
 * Confirmed values for recommendation decision.
 */
const RECOMMENDATION_VALUES = Object.freeze({
  KEEP: "KEEP",
  REVIEW: "REVIEW",
  REMOVE: "REMOVE"
});

/**
 * Confirmed values for ML prediction.
 */
const PREDICTION_VALUES = Object.freeze({
  INTENDED: "INTENDED",
  EXCESSIVE: "EXCESSIVE"
});

/**
 * Authoritative list of 20 V2 role IDs.
 */
const VALID_V2_ROLE_IDS = Object.freeze([
  "BackendDeveloper-Role",
  "APIDeveloper-Role",
  "FrontendDeveloper-Role",
  "DataAnalyst-Role",
  "DataEngineer-Role",
  "DataScientist-Role",
  "CloudDataArchitect-Role",
  "ResearchScientist-Role",
  "ProductAnalyst-Role",
  "DevOpsEngineer-Role",
  "CloudEngineer-Role",
  "SecurityEngineer-Role",
  "IAMAdministrator-Role",
  "DatabaseAdministrator-Role",
  "SRE-Role",
  "SecurityAnalyst-Role",
  "ApplicationSupport-Role",
  "PlatformEngineer-Role",
  "MLPlatformEngineer-Role",
  "MLEngineer-Role"
]);

module.exports = {
  CONFIRMED_PIPELINE_FIELDS,
  PENDING_BACKEND_FIELDS,
  RECOMMENDATION_FIELDS,
  FINAL_RECOMMENDATION_FIELDS,
  APPROVAL_STATUS,
  RECOMMENDATION_STATUS,
  RECOMMENDATION_VALUES,
  PREDICTION_VALUES,
  VALID_V2_ROLE_IDS
};
