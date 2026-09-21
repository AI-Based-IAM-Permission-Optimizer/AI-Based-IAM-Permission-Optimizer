class PolicyController {
  /**
   * @param {import("../services/policyRecommendationService").PolicyRecommendationService} service - PolicyRecommendationService instance.
   */
  constructor(service) {
    if (!service) {
      throw new Error("PolicyController requires a valid PolicyRecommendationService instance.");
    }
    this.service = service;
  }

  /**
   * GET /api/v1/policies/:user_id
   */
  getPolicyByMlUserId = async (req, res, next) => {
    try {
      const { user_id } = req.params;
      const policyEnvelope = await this.service.generatePolicyByMlUserId(user_id);

      return res.status(200).json(policyEnvelope);
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = PolicyController;
