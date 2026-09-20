const { createRecommendationEntity } = require("../domain/recommendation.entity");
const { ValidationError, NotFoundError } = require("../utils/errors");

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
}

module.exports = RecommendationService;
