class RecommendationController {
  /**
   * @param {import("../services/recommendation.service")} service - RecommendationService instance.
   */
  constructor(service) {
    if (!service) {
      throw new Error("RecommendationController requires a valid RecommendationService instance.");
    }
    this.service = service;
  }

  /**
   * Logs an error safely: full stack only for unexpected 5xx errors.
   * Expected 4xx application errors produce a one-line summary to avoid CloudWatch noise
   * and to avoid emitting internal DynamoDB ARNs or table names in production logs.
   *
   * @param {string} context - Short description of where the error occurred.
   * @param {Error} error - The caught error.
   */
  #logError(context, error) {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) {
      // Unexpected server fault — full details needed for diagnosis.
      console.error(`[ERROR] ${context}:`, error.name, error.message, error.stack);
    } else {
      // Expected client error — one-line summary only.
      console.warn(`[WARN] ${context}: ${error.name} (${statusCode}) - ${error.message}`);
    }
  }

  /**
   * GET /api/v1/recommendations
   */
  list = async (req, res, next) => {
    try {
      const { approval_status, recommendation, user_id, role_id, next_token } = req.query;
      const filters = { approval_status, recommendation, user_id, role_id, next_token };

      const result = await this.service.listRecommendations(filters);

      return res.status(200).json({
        count: result.data.length,
        data: result.data,
        next_token: result.next_token
      });
    } catch (error) {
      this.#logError("GET /api/v1/recommendations", error);
      return next(error);
    }
  };

  /**
   * GET /api/v1/recommendations/:id
   */
  getById = async (req, res, next) => {
    try {
      const { id } = req.params;
      const item = await this.service.getRecommendationById(id);

      return res.status(200).json({
        data: item
      });
    } catch (error) {
      this.#logError(`GET /api/v1/recommendations/${req.params.id}`, error);
      return next(error);
    }
  };

  /**
   * PATCH /api/v1/recommendations/:id/approve
   */
  approve = async (req, res, next) => {
    try {
      const { id } = req.params;
      const updated = await this.service.approveRecommendation(id, req.body);

      return res.status(200).json({
        message: "Recommendation approved successfully.",
        data: updated
      });
    } catch (error) {
      this.#logError(`PATCH /api/v1/recommendations/${req.params.id}/approve`, error);
      return next(error);
    }
  };

  /**
   * PATCH /api/v1/recommendations/:id/reject
   */
  reject = async (req, res, next) => {
    try {
      const { id } = req.params;
      const updated = await this.service.rejectRecommendation(id, req.body);

      return res.status(200).json({
        message: "Recommendation rejected successfully.",
        data: updated
      });
    } catch (error) {
      this.#logError(`PATCH /api/v1/recommendations/${req.params.id}/reject`, error);
      return next(error);
    }
  };

  /**
   * POST /api/v1/recommendations
   */
  ingestBatch = async (req, res, next) => {
    try {
      const result = await this.service.ingestRecommendationsBatch(req.body);
      return res.status(200).json(result);
    } catch (error) {
      this.#logError("POST /api/v1/recommendations", error);
      return next(error);
    }
  };
}

module.exports = RecommendationController;
