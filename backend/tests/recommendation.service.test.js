const test = require("node:test");
const assert = require("node:assert/strict");
const RecommendationService = require("../src/services/recommendation.service");
const { ValidationError, NotFoundError } = require("../src/utils/errors");

function createMockRepository() {
  const items = new Map();
  return {
    items,
    create: async (item) => {
      items.set(item.recommendation_id, item);
      return item;
    },
    findById: async (id) => {
      return items.get(id) || null;
    }
  };
}

const validPayload = {
  user_id: "usr-99",
  role_id: "BackendDeveloper-Role",
  action: "iam:CreateUser",
  resource: "*",
  risk_score: 0.95,
  risk_level: "HIGH",
  recommendation: "REMOVE"
};

test("RecommendationService.createRecommendation builds entity and persists it", async () => {
  const mockRepo = createMockRepository();
  const service = new RecommendationService(mockRepo);

  const result = await service.createRecommendation(validPayload);

  assert.ok(result.recommendation_id);
  assert.equal(result.approval_status, "PENDING");
  assert.equal(result.status, "PENDING");
  assert.equal(result.recommendation, "REMOVE");
  assert.equal(result.risk_score, 0.95);
  assert.equal(mockRepo.items.size, 1);
  assert.deepEqual(mockRepo.items.get(result.recommendation_id), result);
});

test("RecommendationService.createRecommendation preserves ML recommendation_id", async () => {
  const mockRepo = createMockRepository();
  const service = new RecommendationService(mockRepo);

  const payloadWithId = {
    ...validPayload,
    recommendation_id: "ml-rec-id-77"
  };

  const result = await service.createRecommendation(payloadWithId);

  assert.equal(result.recommendation_id, "ml-rec-id-77");
  assert.deepEqual(mockRepo.items.get("ml-rec-id-77"), result);
});

test("RecommendationService.getRecommendationById returns item when found", async () => {
  const mockRepo = createMockRepository();
  const service = new RecommendationService(mockRepo);

  const created = await service.createRecommendation(validPayload);
  const fetched = await service.getRecommendationById(created.recommendation_id);

  assert.deepEqual(fetched, created);
});

test("RecommendationService.getRecommendationById throws NotFoundError when not found", async () => {
  const mockRepo = createMockRepository();
  const service = new RecommendationService(mockRepo);

  await assert.rejects(
    () => service.getRecommendationById("missing-id"),
    (err) => err instanceof NotFoundError && err.message.includes("was not found")
  );
});

test("RecommendationService.getRecommendationById throws ValidationError for empty ID", async () => {
  const mockRepo = createMockRepository();
  const service = new RecommendationService(mockRepo);

  await assert.rejects(
    () => service.getRecommendationById(" "),
    (err) => err instanceof ValidationError && err.message.includes("Recommendation ID must be")
  );
});
