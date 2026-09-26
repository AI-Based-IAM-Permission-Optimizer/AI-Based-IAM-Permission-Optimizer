const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const express = require("express");
const createRecommendationRouter = require("../src/routes/recommendation.routes");
const RecommendationController = require("../src/controllers/recommendation.controller");
const RecommendationService = require("../src/services/recommendation.service");
const { getMockRecommendations } = require("../src/data/mockRecommendations");
const { errorHandler, notFoundHandler } = require("../src/middleware/error.middleware");
const { NotFoundError, ValidationError } = require("../src/utils/errors");

function createTestApp() {
  const itemsMap = new Map();
  getMockRecommendations().forEach((item) => {
    // Clone item to isolate state per test app instance
    itemsMap.set(item.recommendation_id, { ...item });
  });

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
      if (filters.next_token) {
        if (filters.next_token === "malformed-token" || filters.next_token === "invalid-token") {
          throw new ValidationError("Invalid next_token format.");
        }
      }
      if (filters.paginate) {
        const nextToken = filters.next_token === "valid-token" ? "next-page-token" : null;
        return { data: result, next_token: nextToken };
      }
      return result;
    },
    updateApproval: async (id, updateData) => {
      const existing = itemsMap.get(id);
      if (!existing) {
        throw new NotFoundError(`Recommendation with ID '${id}' was not found.`);
      }
      if (existing.approval_status !== "PENDING") {
        throw new ValidationError(
          `Cannot update recommendation '${id}' because its current approval_status is '${existing.approval_status}' (must be PENDING).`
        );
      }

      // Update only finalized approval fields without writing legacy status/reviewed_at
      existing.approval_status = updateData.approval_status;
      existing.approved_by = updateData.approved_by;
      existing.approved_at = updateData.approved_at;
      existing.rejection_reason = updateData.rejection_reason;
      existing.updated_at = updateData.updated_at;

      return existing;
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

  return { app, itemsMap };
}

test("GET /api/v1/recommendations returns 200 OK with recommendation items", async () => {
  const { app } = createTestApp();
  const response = await request(app).get("/api/v1/recommendations");

  if (response.status !== 200) console.log(response.body); assert.equal(response.status, 200);
  assert.equal(response.body.count, 3);
  assert.equal(Array.isArray(response.body.data), true);
  assert.equal(response.body.data.length, 3);
});

test("GET /api/v1/recommendations filters by recommendation decision", async () => {
  const { app } = createTestApp();
  const response = await request(app).get("/api/v1/recommendations?recommendation=REMOVE");

  if (response.status !== 200) console.log(response.body); assert.equal(response.status, 200);
  assert.equal(response.body.count, 1);
  assert.equal(response.body.data[0].recommendation, "REMOVE");
});

test("GET /api/v1/recommendations filters by approval_status", async () => {
  const { app } = createTestApp();
  const response = await request(app).get("/api/v1/recommendations?approval_status=PENDING");

  if (response.status !== 200) console.log(response.body); assert.equal(response.status, 200);
  assert.equal(response.body.count, 3);
});

test("GET /api/v1/recommendations returns 400 for invalid approval_status filter", async () => {
  const { app } = createTestApp();
  const response = await request(app).get("/api/v1/recommendations?approval_status=INVALID_STATUS");

  assert.equal(response.status, 400);
  assert.ok(response.body.error.message.includes("Filter 'approval_status' must be one of"));
});

test("GET /api/v1/recommendations returns 400 for invalid recommendation filter", async () => {
  const { app } = createTestApp();
  const response = await request(app).get("/api/v1/recommendations?recommendation=INVALID_REC");

  assert.equal(response.status, 400);
  assert.ok(response.body.error.message.includes("Filter 'recommendation' must be one of"));
});

test("GET /api/v1/recommendations/:id returns 200 OK for valid ID", async () => {
  const { app } = createTestApp();
  const response = await request(app).get("/api/v1/recommendations/rec-mock-remove-003");

  if (response.status !== 200) console.log(response.body); assert.equal(response.status, 200);
  assert.equal(response.body.data.recommendation_id, "rec-mock-remove-003");
  assert.equal(response.body.data.recommendation, "REMOVE");
});

test("GET /api/v1/recommendations/:id returns 404 Not Found for non-existent ID", async () => {
  const { app } = createTestApp();
  const response = await request(app).get("/api/v1/recommendations/non-existent-id");

  assert.equal(response.status, 404);
  assert.ok(response.body.error.message.includes("was not found"));
});

/* ========================================================================== */
/* PHASE 6 APPROVE / REJECT WORKFLOW TESTS                                    */
/* ========================================================================== */

test("PATCH /api/v1/recommendations/:id/approve updates PENDING to APPROVED correctly", async () => {
  const { app } = createTestApp();
  const response = await request(app)
    .patch("/api/v1/recommendations/rec-mock-remove-003/approve")
    .send({ approved_by: "admin@company.com" });

  if (response.status !== 200) console.log(response.body); assert.equal(response.status, 200);
  assert.equal(response.body.message, "Recommendation approved successfully.");

  const item = response.body.data;
  assert.equal(item.approval_status, "APPROVED");
  assert.equal(item.approved_by, "admin@company.com");
  assert.ok(item.approved_at);
  assert.equal(item.rejection_reason, null);
  assert.ok(item.updated_at);

  // Assert legacy compatibility fields are NOT modified
  assert.equal(item.status, "PENDING");
  assert.equal(item.reviewed_at, null);
});

test("PATCH /api/v1/recommendations/:id/approve rejects missing or empty approved_by", async () => {
  const { app } = createTestApp();
  const response = await request(app)
    .patch("/api/v1/recommendations/rec-mock-remove-003/approve")
    .send({ approved_by: "   " });

  assert.equal(response.status, 400);
  assert.ok(response.body.error.message.includes("Field 'approved_by' is required"));
});

test("PATCH /api/v1/recommendations/:id/reject updates PENDING to REJECTED correctly", async () => {
  const { app } = createTestApp();
  const response = await request(app)
    .patch("/api/v1/recommendations/rec-mock-review-002/reject")
    .send({ rejection_reason: "Permission required for compliance reports." });

  if (response.status !== 200) console.log(response.body); assert.equal(response.status, 200);
  assert.equal(response.body.message, "Recommendation rejected successfully.");

  const item = response.body.data;
  assert.equal(item.approval_status, "REJECTED");
  assert.equal(item.approved_by, null);
  assert.equal(item.approved_at, null);
  assert.equal(item.rejection_reason, "Permission required for compliance reports.");
  assert.ok(item.updated_at);

  // Assert legacy compatibility fields are NOT modified
  assert.equal(item.status, "PENDING");
  assert.equal(item.reviewed_at, null);
});

test("PATCH approve/reject returns 400 if recommendation is already APPROVED or REJECTED", async () => {
  const { app } = createTestApp();

  // First approval succeeds
  const firstApprove = await request(app)
    .patch("/api/v1/recommendations/rec-mock-remove-003/approve")
    .send({ approved_by: "admin@company.com" });
  assert.equal(firstApprove.status, 200);

  // Second approval fails with 400
  const secondApprove = await request(app)
    .patch("/api/v1/recommendations/rec-mock-remove-003/approve")
    .send({ approved_by: "admin2@company.com" });
  assert.equal(secondApprove.status, 400);
  assert.ok(secondApprove.body.error.message.includes("must be PENDING"));

  // Rejection of already APPROVED item fails with 400
  const rejectApproved = await request(app)
    .patch("/api/v1/recommendations/rec-mock-remove-003/reject")
    .send({ rejection_reason: "Not needed" });
  assert.equal(rejectApproved.status, 400);
  assert.ok(rejectApproved.body.error.message.includes("must be PENDING"));
});

test("PATCH approve/reject returns 404 for non-existent ID", async () => {
  const { app } = createTestApp();

  const responseApprove = await request(app)
    .patch("/api/v1/recommendations/non-existent-id/approve")
    .send({ approved_by: "admin@company.com" });
  assert.equal(responseApprove.status, 404);

  const responseReject = await request(app)
    .patch("/api/v1/recommendations/non-existent-id/reject")
    .send({ rejection_reason: "Reason" });
  assert.equal(responseReject.status, 404);
});

/* ========================================================================== */
/* PHASE 11 PAGINATION ROUTE TESTS                                            */
/* ========================================================================== */

test("GET /api/v1/recommendations?next_token=<valid-token> processes valid pagination token", async () => {
  const { app } = createTestApp();
  const response = await request(app).get("/api/v1/recommendations?next_token=valid-token");

  assert.equal(response.status, 200);
  assert.equal(Array.isArray(response.body.data), true);
  assert.equal(response.body.count, 3);
  assert.equal(response.body.next_token, "next-page-token");
});

test("GET /api/v1/recommendations?next_token=<malformed-token> rejects malformed token with HTTP 400", async () => {
  const { app } = createTestApp();
  const response = await request(app).get("/api/v1/recommendations?next_token=malformed-token");

  assert.equal(response.status, 400);
  assert.ok(response.body.error);
  assert.equal(typeof response.body.error.message, "string");
  assert.ok(response.body.error.message.includes("Invalid next_token format"));
});

