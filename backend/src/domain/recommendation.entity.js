const crypto = require("node:crypto");
const {
  APPROVAL_STATUS,
  RECOMMENDATION_VALUES,
  PREDICTION_VALUES,
  VALID_V2_ROLE_IDS
} = require("./recommendation.schema");
const { ValidationError } = require("../utils/errors");

/**
 * Maximum allowed byte length for a recommendation_id.
 * DynamoDB primary key limit is 2048 bytes; 512 characters is a safe, generous ceiling.
 */
const RECOMMENDATION_ID_MAX_LENGTH = 512;

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

  const trimmedRoleId = role_id.trim();
  if (!VALID_V2_ROLE_IDS.includes(trimmedRoleId)) {
    throw new ValidationError(
      `Field 'role_id' must be one of the finalized V2 role IDs. Got '${role_id}'.`
    );
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

  if (prediction !== undefined && prediction !== null) {
    if (typeof prediction !== "string" || !Object.values(PREDICTION_VALUES).includes(prediction.trim())) {
      throw new ValidationError(
        `Field 'prediction' must be one of: ${Object.values(PREDICTION_VALUES).join(", ")}.`
      );
    }
  }

  if (reason_codes !== undefined && reason_codes !== null) {
    if (!Array.isArray(reason_codes)) {
      throw new ValidationError("Field 'reason_codes', if provided, must be an array.");
    }
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
  let resolvedRecommendationId;
  if (recommendation_id && typeof recommendation_id === "string" && recommendation_id.trim()) {
    const trimmedId = recommendation_id.trim();
    if (trimmedId.length > RECOMMENDATION_ID_MAX_LENGTH) {
      throw new ValidationError(
        `Field 'recommendation_id' must not exceed ${RECOMMENDATION_ID_MAX_LENGTH} characters.`
      );
    }
    resolvedRecommendationId = trimmedId;
  } else {
    resolvedRecommendationId = crypto.randomUUID();
  }

  const entity = {
    recommendation_id: resolvedRecommendationId,

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
  createRecommendationEntity,
  RECOMMENDATION_ID_MAX_LENGTH
};
