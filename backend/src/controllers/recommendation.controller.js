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
   * GET /api/v1/recommendations
   */
  list = async (req, res, next) => {
    try {
      const { approval_status, recommendation, user_id, role_id } = req.query;
      const filters = { approval_status, recommendation, user_id, role_id };

      const items = await this.service.listRecommendations(filters);

      return res.status(200).json({
        count: items.length,
        data: items
      });
    } catch (error) {
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
      return next(error);
    }
  };
}

module.exports = RecommendationController;
