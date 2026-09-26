const { createRecommendationEntity } = require("../domain/recommendation.entity");

/**
 * Controlled mock recommendation records adhering to the finalized 21-field ML contract.
 */
const rawMockRecommendations = Object.freeze([
  {
    recommendation_id: "rec-mock-keep-001",
    user_id: "usr-alice-01",
    role_id: "BackendDeveloper-Role",
    action: "s3:GetObject",
    resource: "arn:aws:s3:::company-shared-docs/*",
    risk_score: 0.15,
    risk_weight: 2,
    risk_level: "LOW",
    prediction: "INTENDED",
    recommendation: "KEEP",
    confidence: 0.98,
    reason_codes: ["DAILY_ACCESS", "LOW_RISK_READ_ACTION"],
    explanation: "Permission is actively used for daily operations and represents low security risk.",
    model_version: "iam-risk-v1",
    generated_at: "2026-09-21T10:00:00.000Z",
    approval_status: "PENDING",
    approved_by: null,
    approved_at: null,
    rejection_reason: null,
    policy_version: null,
    updated_at: "2026-09-21T10:00:00.000Z"
  },
  {
    recommendation_id: "rec-mock-review-002",
    user_id: "usr-bob-02",
    role_id: "SecurityEngineer-Role",
    action: "iam:GenerateCredentialReport",
    resource: "*",
    risk_score: 0.55,
    risk_weight: 5,
    risk_level: "MEDIUM",
    prediction: "EXCESSIVE",
    recommendation: "REVIEW",
    confidence: 0.85,
    reason_codes: ["INFREQUENT_ACCESS", "PERIODIC_AUDIT_ACTION"],
    explanation: "Permission is used infrequently; requires manual admin review before removal.",
    model_version: "iam-risk-v1",
    generated_at: "2026-09-21T10:05:00.000Z",
    approval_status: "PENDING",
    approved_by: null,
    approved_at: null,
    rejection_reason: null,
    policy_version: null,
    updated_at: "2026-09-21T10:05:00.000Z"
  },
  {
    recommendation_id: "rec-mock-remove-003",
    user_id: "usr-charlie-03",
    role_id: "MLEngineer-Role",
    action: "iam:CreateUser",
    resource: "*",
    risk_score: 0.92,
    risk_weight: 8,
    risk_level: "HIGH",
    prediction: "EXCESSIVE",
    recommendation: "REMOVE",
    confidence: 0.96,
    reason_codes: ["NEVER_USED", "ADMIN_PRIVILEGE_ACTION"],
    explanation: "High-risk administrative permission has never been used and should be removed.",
    model_version: "iam-risk-v1",
    generated_at: "2026-09-21T10:10:00.000Z",
    approval_status: "PENDING",
    approved_by: null,
    approved_at: null,
    rejection_reason: null,
    policy_version: null,
    updated_at: "2026-09-21T10:10:00.000Z"
  }
]);

/**
 * Returns fresh validated domain entity instances for all mock recommendations.
 *
 * @returns {Array<Object>} List of validated domain entities.
 */
function getMockRecommendations() {
  return rawMockRecommendations.map((item) => createRecommendationEntity(item));
}

/**
 * Helper to seed mock data into a repository or service instance.
 *
 * @param {Object} serviceOrRepo - RecommendationService or RecommendationRepository instance.
 * @returns {Promise<Array<Object>>} List of created recommendation records.
 */
async function seedMockRecommendations(serviceOrRepo) {
  if (!serviceOrRepo) {
    throw new Error("Target service or repository must be provided for seeding.");
  }

  const mockEntities = getMockRecommendations();
  const seeded = [];

  for (const entity of mockEntities) {
    if (typeof serviceOrRepo.createRecommendation === "function") {
      seeded.push(await serviceOrRepo.createRecommendation(entity));
    } else if (typeof serviceOrRepo.create === "function") {
      seeded.push(await serviceOrRepo.create(entity));
    } else {
      throw new Error("Provided target does not support create/createRecommendation methods.");
    }
  }

  return seeded;
}

module.exports = {
  rawMockRecommendations,
  getMockRecommendations,
  seedMockRecommendations
};
