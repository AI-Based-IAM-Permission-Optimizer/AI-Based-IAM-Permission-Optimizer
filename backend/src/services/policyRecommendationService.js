const { getUserById: defaultGetUserById } = require("../repositories/iamReferenceRepository");
const { generatePolicyForReferenceUser } = require("./policyOrchestrationService");
const { APPROVAL_STATUS, RECOMMENDATION_VALUES } = require("../domain/recommendation.schema");
const { ValidationError, NotFoundError } = require("../utils/errors");

/**
 * Confirmed Role-to-IAM Reference User Mapping (Authoritative for Phase 8)
 */
const ROLE_TO_IAM_USER_MAP = Object.freeze({
  "ApplicationDeveloper-Role": "demo-developer",
  "DataAnalyst-Role": "demo-data-analyst",
  "DevOps-Role": "demo-devops",
  "BackendDeveloper-Role": "demo-backend"
});

class PolicyRecommendationService {
  /**
   * @param {import("../repositories/recommendation.repository")} recommendationRepository - RecommendationRepository instance.
   * @param {Object} [iamRefRepo] - IAM Reference Repository instance/object (defaults to singleton getUserById).
   */
  constructor(recommendationRepository, iamRefRepo = { getUserById: defaultGetUserById }) {
    if (!recommendationRepository) {
      throw new Error("PolicyRecommendationService requires a valid RecommendationRepository instance.");
    }
    this.recommendationRepository = recommendationRepository;
    this.iamRefRepo = iamRefRepo;
  }

  /**
   * Validates input payload, builds domain entity, and persists it.
   *
   * @param {Object} payload - Recommendation payload from caller or ingestion pipeline.
   * @returns {Promise<Object>} Created and persisted recommendation object.
   */
  async createRecommendation(payload) {
    const { createRecommendationEntity } = require("../domain/recommendation.entity");
    const entity = createRecommendationEntity(payload);
    return await (this.repository ? this.repository.create(entity) : this.recommendationRepository.create(entity));
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

    const item = await this.recommendationRepository.findById(recommendationId.trim());

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
    const { approval_status, recommendation, user_id, role_id } = filters;
    const validatedFilters = {};

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

    return await this.recommendationRepository.findAll(validatedFilters);
  }

  /**
   * Approves a PENDING recommendation (PENDING -> APPROVED transition).
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

    return await this.recommendationRepository.updateApproval(recommendationId.trim(), updateData);
  }

  /**
   * Rejects a PENDING recommendation (PENDING -> REJECTED transition).
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

    return await this.recommendationRepository.updateApproval(recommendationId.trim(), updateData);
  }

  /**
   * Retrieves recommendation records matching the caller-supplied filters and generates a policy envelope.
   *
   * @param {Object} userReference - Resolved IAM reference user object.
   * @param {Object} recommendationFilters - Filter options to pass to recommendationRepository.findAll().
   * @returns {Promise<Object>} Policy envelope generated by PolicyOrchestrationService.
   */
  async generatePolicyWithRecommendations(userReference, recommendationFilters) {
    if (!userReference || typeof userReference !== "object" || Array.isArray(userReference)) {
      throw new ValidationError("Parameter 'userReference' is required and must be a valid object.");
    }

    if (!recommendationFilters || typeof recommendationFilters !== "object" || Array.isArray(recommendationFilters)) {
      throw new ValidationError("Parameter 'recommendationFilters' is required and must be an object.");
    }

    const recommendations = await this.recommendationRepository.findAll(recommendationFilters);
    return generatePolicyForReferenceUser(userReference, recommendations);
  }

  /**
   * Generates a policy for an ML recommendation user_id by resolving their role_id to an IAM reference user.
   *
   * @param {string} mlUserId - ML recommendation user_id string from API URL.
   * @returns {Promise<Object>} Generated policy envelope object.
   */
  async generatePolicyByMlUserId(mlUserId) {
    if (!mlUserId || typeof mlUserId !== "string" || mlUserId.trim() === "") {
      throw new ValidationError("User ID parameter is required and must be a non-empty string.");
    }

    const trimmedMlUserId = mlUserId.trim();

    // 1. Retrieve recommendations for the ML user_id from repository
    const recommendations = await this.recommendationRepository.findAll({ user_id: trimmedMlUserId });

    if (!recommendations || recommendations.length === 0) {
      throw new NotFoundError(`No recommendations found for user ID '${trimmedMlUserId}'.`);
    }

    // 2. Inspect role_id values across recommendations
    const roleIds = new Set();
    for (const rec of recommendations) {
      if (!rec || !rec.role_id || typeof rec.role_id !== "string" || rec.role_id.trim() === "") {
        throw new ValidationError(`Recommendations for user '${trimmedMlUserId}' do not specify a valid role_id.`);
      }
      roleIds.add(rec.role_id.trim());
    }

    if (roleIds.size > 1) {
      throw new ValidationError(
        `Ambiguous policy generation: multiple distinct role IDs (${Array.from(roleIds).join(", ")}) found for user '${trimmedMlUserId}'.`
      );
    }

    const [resolvedRoleId] = Array.from(roleIds);

    // 3. Map role_id to IAM reference user_id using confirmed mapping
    const referenceUserId = ROLE_TO_IAM_USER_MAP[resolvedRoleId];
    if (!referenceUserId) {
      throw new ValidationError(
        `Unknown or unmapped role_id '${resolvedRoleId}' for policy generation.`
      );
    }

    // 4. Resolve IAM reference user from reference repository
    const referenceUser = this.iamRefRepo.getUserById(referenceUserId);
    if (!referenceUser) {
      throw new NotFoundError(`IAM reference user '${referenceUserId}' was not found.`);
    }

    // 5. Delegate to policyOrchestrationService
    return generatePolicyForReferenceUser(referenceUser, recommendations);
  }
}

// Export both default class and named exports for maximum compatibility
module.exports = PolicyRecommendationService;
module.exports.PolicyRecommendationService = PolicyRecommendationService;
module.exports.ROLE_TO_IAM_USER_MAP = ROLE_TO_IAM_USER_MAP;
