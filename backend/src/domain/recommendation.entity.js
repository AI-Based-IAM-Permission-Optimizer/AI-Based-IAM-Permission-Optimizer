const crypto = require("node:crypto");
const { APPROVAL_STATUS, RECOMMENDATION_VALUES } = require("./recommendation.schema");
const { ValidationError } = require("../utils/errors");

/**
 * Validates and constructs a Recommendation domain entity according to the finalized ML contract.
 *
 * @param {Object} input - Raw input object containing ML fields and optional backend fields.
 * @returns {Object} Validated recommendation domain entity ready for persistence.
 */
function createRecommendationEntity(input) {
  if (!input || typeof input !== "object") {
    throw new ValidationError("Input must be a valid object.");
  }

  const {
    user_id,
    role_id,
    action,
    resource,
    risk_score,
    risk_level,
    recommendation,
    recommendation_id,
    risk_weight,
    prediction,
    confidence,
    reason_codes,
    explanation,
    model_version,
    generated_at,
    approval_status,
    status,
    approved_by,
    approved_at,
    rejection_reason,
    policy_version,
    updated_at,
    created_at,
    reviewed_at,
    ...optionalFields
  } = input;

  if (!user_id || typeof user_id !== "string" || user_id.trim() === "") {
    throw new ValidationError("Field 'user_id' is required and must be a non-empty string.");
  }

  if (!role_id || typeof role_id !== "string" || role_id.trim() === "") {
    throw new ValidationError("Field 'role_id' is required and must be a non-empty string.");
  }

  if (!action || typeof action !== "string" || action.trim() === "") {
    throw new ValidationError("Field 'action' is required and must be a non-empty string.");
  }

  if (!resource || typeof resource !== "string" || resource.trim() === "") {
    throw new ValidationError("Field 'resource' is required and must be a non-empty string.");
  }

  if (
    typeof risk_score !== "number" ||
    Number.isNaN(risk_score) ||
    risk_score < 0.0 ||
    risk_score > 1.0
  ) {
    throw new ValidationError("Field 'risk_score' is required and must be a valid number between 0.0 and 1.0.");
  }

  if (risk_weight !== undefined && risk_weight !== null) {
    if (typeof risk_weight !== "number" || Number.isNaN(risk_weight)) {
      throw new ValidationError("Field 'risk_weight', if provided, must be a valid numeric value.");
    }
  }

  if (!risk_level || typeof risk_level !== "string" || risk_level.trim() === "") {
    throw new ValidationError("Field 'risk_level' is required and must be a non-empty string.");
  }

  if (!recommendation || !Object.values(RECOMMENDATION_VALUES).includes(recommendation)) {
    throw new ValidationError(
      `Field 'recommendation' must be one of: ${Object.values(RECOMMENDATION_VALUES).join(", ")}.`
    );
  }

  const currentApprovalStatus = approval_status || status || APPROVAL_STATUS.PENDING;
  if (!Object.values(APPROVAL_STATUS).includes(currentApprovalStatus)) {
    throw new ValidationError(
      `Field 'approval_status' must be one of: ${Object.values(APPROVAL_STATUS).join(", ")}.`
    );
  }

  const currentTimestamp = new Date().toISOString();

  // Construct entity according to finalized contract
  const entity = {
    recommendation_id: (recommendation_id && typeof recommendation_id === "string" && recommendation_id.trim())
      ? recommendation_id.trim()
      : crypto.randomUUID(),

    user_id: user_id.trim(),
    role_id: role_id.trim(),
    action: action.trim(),
    resource: resource.trim(),
    risk_score,
    risk_weight: risk_weight !== undefined ? risk_weight : null,
    risk_level: risk_level.trim(),
    prediction: prediction !== undefined ? prediction : null,
    recommendation,
    confidence: confidence !== undefined ? confidence : null,
    reason_codes: reason_codes !== undefined ? reason_codes : null,
    explanation: explanation !== undefined ? explanation : null,
    model_version: model_version !== undefined ? model_version : null,
    generated_at: generated_at !== undefined ? generated_at : null,

    // Backend-managed approval fields
    approval_status: currentApprovalStatus,
    approved_by: approved_by !== undefined ? approved_by : null,
    approved_at: approved_at !== undefined ? approved_at : null,
    rejection_reason: rejection_reason !== undefined ? rejection_reason : null,
    policy_version: policy_version !== undefined ? policy_version : null,
    updated_at: updated_at || currentTimestamp,

    // Phase 2/3 compatibility fields
    status: currentApprovalStatus,
    created_at: created_at || generated_at || currentTimestamp,
    reviewed_at: reviewed_at !== undefined ? reviewed_at : (approved_at || null)
  };

  // Preserve optional enrichment fields if provided
  for (const [key, value] of Object.entries(optionalFields)) {
    if (value !== undefined) {
      entity[key] = value;
    }
  }

  return entity;
}

module.exports = {
  createRecommendationEntity
};
