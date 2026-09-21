const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const express = require("express");
const createRecommendationRouter = require("../src/routes/recommendation.routes");
const RecommendationController = require("../src/controllers/recommendation.controller");
const RecommendationService = require("../src/services/recommendation.service");
const { getMockRecommendations } = require("../src/data/mockRecommendations");
const { errorHandler, notFoundHandler } = require("../src/middleware/error.middleware");

function createTestApp() {
  const itemsMap = new Map();
  getMockRecommendations().forEach((item) => itemsMap.set(item.recommendation_id, item));

  const mockRepo = {
    findById: async (id) => itemsMap.get(id) || null,
    findAll: async (filters = {}) => {
      let result = Array.from(itemsMap.values());
      if (filters.approval_status) {
        result = result.filter((i) => i.approval_status === filters.approval_status);
      }
      if (filters.recommendation) {
        result = result.filter((i) => i.recommendation === filters.recommendation);
      }
      if (filters.user_id) {
        result = result.filter((i) => i.user_id === filters.user_id);
      }
      if (filters.role_id) {
        result = result.filter((i) => i.role_id === filters.role_id);
      }
      return result;
    }
  };

  const service = new RecommendationService(mockRepo);
  const controller = new RecommendationController(service);
  const router = createRecommendationRouter(controller);

  const app = express();
  app.use(express.json());
  app.use("/api/v1/recommendations", router);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

test("GET /api/v1/recommendations returns 200 OK with recommendation items", async () => {
  const app = createTestApp();
  const response = await request(app).get("/api/v1/recommendations");

  assert.equal(response.status, 200);
  assert.equal(response.body.count, 3);
  assert.equal(Array.isArray(response.body.data), true);
  assert.equal(response.body.data.length, 3);
});

test("GET /api/v1/recommendations filters by recommendation decision", async () => {
  const app = createTestApp();
  const response = await request(app).get("/api/v1/recommendations?recommendation=REMOVE");

  assert.equal(response.status, 200);
  assert.equal(response.body.count, 1);
  assert.equal(response.body.data[0].recommendation, "REMOVE");
});

test("GET /api/v1/recommendations filters by approval_status", async () => {
  const app = createTestApp();
  const response = await request(app).get("/api/v1/recommendations?approval_status=PENDING");

  assert.equal(response.status, 200);
  assert.equal(response.body.count, 3);
});

test("GET /api/v1/recommendations returns 400 for invalid approval_status filter", async () => {
  const app = createTestApp();
  const response = await request(app).get("/api/v1/recommendations?approval_status=INVALID_STATUS");

  assert.equal(response.status, 400);
  assert.ok(response.body.error.message.includes("Filter 'approval_status' must be one of"));
});

test("GET /api/v1/recommendations returns 400 for invalid recommendation filter", async () => {
  const app = createTestApp();
  const response = await request(app).get("/api/v1/recommendations?recommendation=INVALID_REC");

  assert.equal(response.status, 400);
  assert.ok(response.body.error.message.includes("Filter 'recommendation' must be one of"));
});

test("GET /api/v1/recommendations/:id returns 200 OK for valid ID", async () => {
  const app = createTestApp();
  const response = await request(app).get("/api/v1/recommendations/rec-mock-remove-003");

  assert.equal(response.status, 200);
  assert.equal(response.body.data.recommendation_id, "rec-mock-remove-003");
  assert.equal(response.body.data.recommendation, "REMOVE");
});

test("GET /api/v1/recommendations/:id returns 404 Not Found for non-existent ID", async () => {
  const app = createTestApp();
  const response = await request(app).get("/api/v1/recommendations/non-existent-id");

  assert.equal(response.status, 404);
  assert.ok(response.body.error.message.includes("was not found"));
});
