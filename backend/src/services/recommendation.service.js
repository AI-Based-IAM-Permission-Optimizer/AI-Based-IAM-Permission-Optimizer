const { createRecommendationEntity } = require("../domain/recommendation.entity");
const { APPROVAL_STATUS, RECOMMENDATION_VALUES } = require("../domain/recommendation.schema");
const { ValidationError, NotFoundError } = require("../utils/errors");

/**
 * Maximum number of recommendation items accepted per ingestion request.
 * The production sender is configured to send 100-record windows.
 */
const MAX_RECOMMENDATION_BATCH_SIZE = 100;

class RecommendationService {
  /**
   * @param {import("../repositories/recommendation.repository")} repository - Instance of RecommendationRepository.
   */
  constructor(repository) {
    if (!repository) {
      throw new Error("RecommendationService requires a valid repository instance.");
    }
    this.repository = repository;
  }

  /**
   * Validates input payload, builds domain entity, and persists it.
   *
   * @param {Object} payload - Recommendation payload from caller or ingestion pipeline.
   * @returns {Promise<Object>} Created and persisted recommendation object.
   */
  async createRecommendation(payload) {
    const entity = createRecommendationEntity(payload);
    return await this.repository.create(entity);
  }

  /**
   * Retrieves a recommendation by ID or throws NotFoundError if it does not exist.
   *
   * @param {string} recommendationId - Unique ID of the recommendation.
   * @returns {Promise<Object>} The recommendation item.
   */
  async getRecommendationById(recommendationId) {
    if (!recommendationId || typeof recommendationId !== "string" || recommendationId.trim() === "") {
      throw new ValidationError("Recommendation ID must be a non-empty string.");
    }

    const item = await this.repository.findById(recommendationId.trim());

    if (!item) {
      throw new NotFoundError(`Recommendation with ID '${recommendationId}' was not found.`);
    }

    return item;
  }

  /**
   * Lists recommendations with optional validated filter query parameters.
   *
   * @param {Object} [filters] - Supported filters: approval_status, recommendation, user_id, role_id.
   * @returns {Promise<Array<Object>>} List of recommendation entities.
   */
  async listRecommendations(filters = {}) {
    const { approval_status, recommendation, user_id, role_id, next_token } = filters;
    const validatedFilters = { paginate: true };

    if (approval_status) {
      const statusValue = String(approval_status).toUpperCase().trim();
      if (!Object.values(APPROVAL_STATUS).includes(statusValue)) {
        throw new ValidationError(
          `Filter 'approval_status' must be one of: ${Object.values(APPROVAL_STATUS).join(", ")}.`
        );
      }
      validatedFilters.approval_status = statusValue;
    }

    if (recommendation) {
      const recValue = String(recommendation).toUpperCase().trim();
      if (!Object.values(RECOMMENDATION_VALUES).includes(recValue)) {
        throw new ValidationError(
          `Filter 'recommendation' must be one of: ${Object.values(RECOMMENDATION_VALUES).join(", ")}.`
        );
      }
      validatedFilters.recommendation = recValue;
    }

    if (user_id && String(user_id).trim()) {
      validatedFilters.user_id = String(user_id).trim();
    }

    if (role_id && String(role_id).trim()) {
      validatedFilters.role_id = String(role_id).trim();
    }

    if (next_token && String(next_token).trim()) {
      validatedFilters.next_token = String(next_token).trim();
    }

    return await this.repository.findAll(validatedFilters);
  }

  /**
   * Approves a PENDING recommendation (PENDING -> APPROVED transition).
   * Updates only finalized fields: approval_status, approved_by, approved_at, rejection_reason, updated_at.
   *
   * @param {string} recommendationId - ID of recommendation to approve.
   * @param {Object} payload - Body containing approved_by.
   * @returns {Promise<Object>} Updated recommendation entity.
   */
  async approveRecommendation(recommendationId, payload = {}) {
    if (!recommendationId || typeof recommendationId !== "string" || recommendationId.trim() === "") {
      throw new ValidationError("Recommendation ID must be a non-empty string.");
    }

    const { approved_by } = payload;
    if (!approved_by || typeof approved_by !== "string" || approved_by.trim() === "") {
      throw new ValidationError("Field 'approved_by' is required and must be a non-empty string.");
    }

    const now = new Date().toISOString();
    const updateData = {
      approval_status: APPROVAL_STATUS.APPROVED,
      approved_by: approved_by.trim(),
      approved_at: now,
      rejection_reason: null,
      updated_at: now
    };

    return await this.repository.updateApproval(recommendationId.trim(), updateData);
  }

  /**
   * Rejects a PENDING recommendation (PENDING -> REJECTED transition).
   * Updates only finalized fields: approval_status, rejection_reason, updated_at.
   *
   * @param {string} recommendationId - ID of recommendation to reject.
   * @param {Object} [payload] - Optional body containing rejection_reason.
   * @returns {Promise<Object>} Updated recommendation entity.
   */
  async rejectRecommendation(recommendationId, payload = {}) {
    if (!recommendationId || typeof recommendationId !== "string" || recommendationId.trim() === "") {
      throw new ValidationError("Recommendation ID must be a non-empty string.");
    }

    let reason = null;
    if (payload.rejection_reason && typeof payload.rejection_reason === "string" && payload.rejection_reason.trim()) {
      reason = payload.rejection_reason.trim();
    }

    const now = new Date().toISOString();
    const updateData = {
      approval_status: APPROVAL_STATUS.REJECTED,
      approved_by: null,
      approved_at: null,
      rejection_reason: reason,
      updated_at: now
    };

    return await this.repository.updateApproval(recommendationId.trim(), updateData);
  }

  /**
   * Ingests a batch of ML recommendations (POST /api/v1/recommendations).
   * Supports idempotency via recommendation_id.
   *
   * @param {Object} batchPayload - Top-level batch request payload.
   * @returns {Promise<Object>} Ingestion response envelope.
   */
  async ingestRecommendationsBatch(batchPayload) {
    if (!batchPayload || typeof batchPayload !== "object") {
      throw new ValidationError("Request payload must be a valid JSON object.");
    }

    const { model_version, generated_at, recommendations } = batchPayload;

    if (!model_version || typeof model_version !== "string" || model_version.trim() === "") {
      throw new ValidationError("Field 'model_version' is required and must be a non-empty string.");
    }

    if (!generated_at || typeof generated_at !== "string" || generated_at.trim() === "") {
      throw new ValidationError("Field 'generated_at' is required and must be a non-empty string.");
    }

    if (!Array.isArray(recommendations) || recommendations.length === 0) {
      throw new ValidationError("Field 'recommendations' is required and must be a non-empty array.");
    }

    if (recommendations.length > MAX_RECOMMENDATION_BATCH_SIZE) {
      throw new ValidationError(
        `Batch size must not exceed ${MAX_RECOMMENDATION_BATCH_SIZE} items per request. Received ${recommendations.length}.`
      );
    }

    let acceptedCount = 0;
    let rejectedCount = 0;
    const recommendationIds = [];

    for (const rawItem of recommendations) {
      if (!rawItem || typeof rawItem !== "object") {
        rejectedCount++;
        continue;
      }

      if (!rawItem.recommendation_id || typeof rawItem.recommendation_id !== "string" || rawItem.recommendation_id.trim() === "") {
        rejectedCount++;
        continue;
      }

      const recId = rawItem.recommendation_id.trim();

      // Inherit batch model_version and generated_at if item does not supply them
      const itemToValidate = {
        model_version: model_version.trim(),
        generated_at: generated_at.trim(),
        ...rawItem
      };

      try {
        // Idempotency check: check if recommendation_id already exists in persistence
        const existing = await this.repository.findById(recId);
        if (existing) {
          acceptedCount++;
          recommendationIds.push(recId);
          continue;
        }

        // Validate entity schema and build default approval fields
        const entity = createRecommendationEntity(itemToValidate);
        await this.repository.create(entity);

        acceptedCount++;
        recommendationIds.push(recId);
      } catch (error) {
        if (error instanceof ValidationError) {
          rejectedCount++;
        } else {
          throw error;
        }
      }
    }

    // If all items failed validation and 0 items accepted, throw ValidationError
    if (acceptedCount === 0 && rejectedCount > 0) {
      throw new ValidationError("All recommendation items in batch failed validation.");
    }

    return {
      status: "accepted",
      model_version: model_version.trim(),
      accepted_count: acceptedCount,
      rejected_count: rejectedCount,
      recommendation_ids: recommendationIds
    };
  }
}

RecommendationService.MAX_RECOMMENDATION_BATCH_SIZE = MAX_RECOMMENDATION_BATCH_SIZE;

module.exports = RecommendationService;
