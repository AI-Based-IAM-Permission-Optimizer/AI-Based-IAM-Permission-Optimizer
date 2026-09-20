const crypto = require("node:crypto");
const { RECOMMENDATION_STATUS, RECOMMENDATION_VALUES } = require("./recommendation.schema");
const { ValidationError } = require("../utils/errors");

/**
 * Validates and constructs a Recommendation domain entity.
 *
 * @param {Object} input - Raw input object containing ML-owned fields and optional fields.
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

  if (typeof risk_score !== "number" || Number.isNaN(risk_score)) {
    throw new ValidationError("Field 'risk_score' is required and must be a valid number.");
  }

  if (!risk_level || typeof risk_level !== "string" || risk_level.trim() === "") {
    throw new ValidationError("Field 'risk_level' is required and must be a non-empty string.");
  }

  if (!recommendation || !Object.values(RECOMMENDATION_VALUES).includes(recommendation)) {
    throw new ValidationError(
      `Field 'recommendation' must be one of: ${Object.values(RECOMMENDATION_VALUES).join(", ")}.`
    );
  }

  // Construct core domain entity with backend-owned fields
  const entity = {
    recommendation_id: input.recommendation_id || crypto.randomUUID(),
    status: input.status || RECOMMENDATION_STATUS.PENDING,
    created_at: input.created_at || new Date().toISOString(),
    reviewed_at: input.reviewed_at || null,
    user_id: user_id.trim(),
    role_id: role_id.trim(),
    action: action.trim(),
    resource: resource.trim(),
    risk_score,
    risk_level: risk_level.trim(),
    recommendation
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
