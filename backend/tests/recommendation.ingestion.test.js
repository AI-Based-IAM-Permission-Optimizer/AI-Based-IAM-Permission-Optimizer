const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const express = require("express");
const createRecommendationRouter = require("../src/routes/recommendation.routes");
const RecommendationController = require("../src/controllers/recommendation.controller");
const RecommendationService = require("../src/services/recommendation.service");
const { errorHandler, notFoundHandler } = require("../src/middleware/error.middleware");
const { RepositoryError } = require("../src/utils/errors");

function createIngestionTestApp(customRepoOverrides = {}) {
  const itemsMap = new Map();

  const mockRepo = {
    itemsMap,
    findById: async (id) => itemsMap.get(id) || null,
    create: async (item) => {
      itemsMap.set(item.recommendation_id, item);
      return item;
    },
    ...customRepoOverrides
  };

  const service = new RecommendationService(mockRepo);
  const controller = new RecommendationController(service);
  const router = createRecommendationRouter(controller);

  const app = express();
  app.use(express.json());
  app.use("/api/v1/recommendations", router);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return { app, mockRepo, itemsMap };
}

const validSingleItem = {
  recommendation_id: "rec-20260920-000001",
  user_id: "synthetic-user-01",
  role_id: "ApplicationDeveloper-Role",
  action: "s3:DeleteObject",
  resource: "*",
  risk_score: 0.9142,
  risk_weight: 8,
  risk_level: "HIGH",
  prediction: "EXCESSIVE",
  recommendation: "REVIEW",
  confidence: 0.9142,
  reason_codes: ["LOW_USAGE", "HIGH_RISK_ACTION"],
  explanation: "Permission shows low historical usage.",
  model_version: "iam-risk-v1",
  generated_at: "2026-09-20T12:30:00Z"
};

const validBatchPayload = {
  model_version: "iam-risk-v1",
  generated_at: "2026-09-20T12:30:00Z",
  recommendations: [validSingleItem]
};

test("POST /api/v1/recommendations ingests valid single recommendation batch", async () => {
  const { app, itemsMap } = createIngestionTestApp();
  const response = await request(app)
    .post("/api/v1/recommendations")
    .send(validBatchPayload);

  assert.equal(response.status, 200);
  assert.equal(response.body.status, "accepted");
  assert.equal(response.body.model_version, "iam-risk-v1");
  assert.equal(response.body.accepted_count, 1);
  assert.equal(response.body.rejected_count, 0);
  assert.deepEqual(response.body.recommendation_ids, ["rec-20260920-000001"]);

  // Verify item stored in persistence with correct defaults
  const stored = itemsMap.get("rec-20260920-000001");
  assert.ok(stored);
  assert.equal(stored.recommendation_id, "rec-20260920-000001");
  assert.equal(stored.approval_status, "PENDING");
  assert.equal(stored.approved_by, null);
  assert.equal(stored.approved_at, null);
  assert.equal(stored.rejection_reason, null);
  assert.equal(stored.policy_version, null);
  assert.ok(stored.updated_at);
});

test("POST /api/v1/recommendations ingests batch with multiple valid recommendations", async () => {
  const { app, itemsMap } = createIngestionTestApp();
  const multiPayload = {
    ...validBatchPayload,
    recommendations: [
      validSingleItem,
      {
        ...validSingleItem,
        recommendation_id: "rec-20260920-000002",
        action: "iam:CreateUser",
        recommendation: "REMOVE",
        risk_score: 0.99
      }
    ]
  };

  const response = await request(app)
    .post("/api/v1/recommendations")
    .send(multiPayload);

  assert.equal(response.status, 200);
  assert.equal(response.body.accepted_count, 2);
  assert.equal(response.body.rejected_count, 0);
  assert.deepEqual(response.body.recommendation_ids, ["rec-20260920-000001", "rec-20260920-000002"]);
  assert.equal(itemsMap.size, 2);
});

test("POST /api/v1/recommendations rejects missing model_version", async () => {
  const { app } = createIngestionTestApp();
  const response = await request(app)
    .post("/api/v1/recommendations")
    .send({ generated_at: "2026-09-20T12:30:00Z", recommendations: [validSingleItem] });

  assert.equal(response.status, 400);
  assert.ok(response.body.error.message.includes("Field 'model_version' is required"));
});

test("POST /api/v1/recommendations rejects missing generated_at", async () => {
  const { app } = createIngestionTestApp();
  const response = await request(app)
    .post("/api/v1/recommendations")
    .send({ model_version: "iam-risk-v1", recommendations: [validSingleItem] });

  assert.equal(response.status, 400);
  assert.ok(response.body.error.message.includes("Field 'generated_at' is required"));
});

test("POST /api/v1/recommendations rejects missing recommendations array", async () => {
  const { app } = createIngestionTestApp();
  const response = await request(app)
    .post("/api/v1/recommendations")
    .send({ model_version: "iam-risk-v1", generated_at: "2026-09-20T12:30:00Z" });

  assert.equal(response.status, 400);
  assert.ok(response.body.error.message.includes("Field 'recommendations' is required"));
});

test("POST /api/v1/recommendations rejects empty recommendations array", async () => {
  const { app } = createIngestionTestApp();
  const response = await request(app)
    .post("/api/v1/recommendations")
    .send({ model_version: "iam-risk-v1", generated_at: "2026-09-20T12:30:00Z", recommendations: [] });

  assert.equal(response.status, 400);
  assert.ok(response.body.error.message.includes("Field 'recommendations' is required"));
});

test("POST /api/v1/recommendations handles malformed individual items with rejected_count", async () => {
  const { app } = createIngestionTestApp();
  const mixedPayload = {
    ...validBatchPayload,
    recommendations: [
      validSingleItem,
      { ...validSingleItem, recommendation_id: "rec-bad-002", risk_score: 1.5 }, // invalid risk_score > 1.0
      { ...validSingleItem, recommendation_id: "rec-bad-003", recommendation: "INVALID_DECISION" }
    ]
  };

  const response = await request(app)
    .post("/api/v1/recommendations")
    .send(mixedPayload);

  assert.equal(response.status, 200);
  assert.equal(response.body.accepted_count, 1);
  assert.equal(response.body.rejected_count, 2);
  assert.deepEqual(response.body.recommendation_ids, ["rec-20260920-000001"]);
});

test("POST /api/v1/recommendations handles missing recommendation_id as rejected", async () => {
  const { app } = createIngestionTestApp();
  const missingIdPayload = {
    ...validBatchPayload,
    recommendations: [
      { ...validSingleItem, recommendation_id: "" }
    ]
  };

  const response = await request(app)
    .post("/api/v1/recommendations")
    .send(missingIdPayload);

  assert.equal(response.status, 400);
  assert.ok(response.body.error.message.includes("failed validation"));
});

test("POST /api/v1/recommendations enforces idempotency on duplicate recommendation_id", async () => {
  const { app, itemsMap } = createIngestionTestApp();

  // First request
  const response1 = await request(app)
    .post("/api/v1/recommendations")
    .send(validBatchPayload);

  assert.equal(response1.status, 200);
  assert.equal(response1.body.accepted_count, 1);

  // Duplicate request with same recommendation_id
  const response2 = await request(app)
    .post("/api/v1/recommendations")
    .send(validBatchPayload);

  assert.equal(response2.status, 200);
  assert.equal(response2.body.accepted_count, 1);
  assert.equal(response2.body.rejected_count, 0);
  assert.deepEqual(response2.body.recommendation_ids, ["rec-20260920-000001"]);

  // Verify only 1 record exists in persistence (no duplicates)
  assert.equal(itemsMap.size, 1);
});

test("POST /api/v1/recommendations maps unexpected repository errors cleanly", async () => {
  const { app } = createIngestionTestApp({
    create: async () => {
      throw new RepositoryError("DynamoDB storage failure");
    }
  });

  const response = await request(app)
    .post("/api/v1/recommendations")
    .send(validBatchPayload);

  assert.equal(response.status, 500);
  assert.equal(response.body.error.message, "Internal server error");
});
