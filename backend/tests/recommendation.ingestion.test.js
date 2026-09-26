const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const express = require("express");
const createRecommendationRouter = require("../src/routes/recommendation.routes");
const RecommendationController = require("../src/controllers/recommendation.controller");
const RecommendationService = require("../src/services/recommendation.service");
const { VALID_V2_ROLE_IDS } = require("../src/domain/recommendation.schema");
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

const validV2SingleItem = {
  recommendation_id: "rec-20260920-000001",
  user_id: "synthetic-user-01",
  role_id: "BackendDeveloper-Role",
  action: "s3:DeleteObject",
  resource: "*",
  risk_score: 0.9142,
  risk_weight: 8,
  risk_level: "HIGH",
  prediction: "EXCESSIVE",
  recommendation: "REVIEW",
  reason_codes: ["LOW_USAGE", "HIGH_RISK_ACTION", "BROAD_RESOURCE_SCOPE"],
  explanation: "Permission shows low historical usage and the action has high IAM risk with broad resource scope.",
  model_version: "iam-risk-v1",
  generated_at: "2026-09-20T12:30:00Z"
};

const validBatchPayload = {
  model_version: "iam-risk-v1",
  generated_at: "2026-09-20T12:30:00Z",
  recommendations: [validV2SingleItem]
};

// ---------------------------------------------------------------------------
// Final V2 ML Contract Ingestion Tests (A through O)
// ---------------------------------------------------------------------------

test("A. Valid V2 recommendation with BackendDeveloper-Role is accepted", async () => {
  const { app, itemsMap } = createIngestionTestApp();
  const response = await request(app)
    .post("/api/v1/recommendations")
    .send(validBatchPayload);

  assert.equal(response.status, 200);
  assert.equal(response.body.status, "accepted");
  assert.equal(response.body.accepted_count, 1);
  assert.equal(response.body.rejected_count, 0);

  const stored = itemsMap.get("rec-20260920-000001");
  assert.ok(stored);
  assert.equal(stored.role_id, "BackendDeveloper-Role");
});

test("B. Valid V2 recommendation with MLEngineer-Role is accepted", async () => {
  const { app, itemsMap } = createIngestionTestApp();
  const payload = {
    ...validBatchPayload,
    recommendations: [{ ...validV2SingleItem, recommendation_id: "rec-ml-01", role_id: "MLEngineer-Role" }]
  };

  const response = await request(app)
    .post("/api/v1/recommendations")
    .send(payload);

  assert.equal(response.status, 200);
  assert.equal(response.body.accepted_count, 1);
  assert.equal(itemsMap.get("rec-ml-01").role_id, "MLEngineer-Role");
});

test("C. Valid V2 recommendation with all 20 finalized role IDs is accepted", async () => {
  const { app, itemsMap } = createIngestionTestApp();
  assert.equal(VALID_V2_ROLE_IDS.length, 20);

  const items = VALID_V2_ROLE_IDS.map((roleId, idx) => ({
    ...validV2SingleItem,
    recommendation_id: `rec-v2-role-${idx}`,
    role_id: roleId
  }));

  const response = await request(app)
    .post("/api/v1/recommendations")
    .send({ model_version: "iam-risk-v1", generated_at: "2026-09-20T12:30:00Z", recommendations: items });

  assert.equal(response.status, 200);
  assert.equal(response.body.accepted_count, 20);
  assert.equal(response.body.rejected_count, 0);
  assert.equal(itemsMap.size, 20);
});

test("D. Missing confidence field is accepted cleanly because confidence is not part of V2 contract", async () => {
  const { app, itemsMap } = createIngestionTestApp();
  const itemWithoutConfidence = { ...validV2SingleItem, recommendation_id: "rec-no-conf-01" };
  delete itemWithoutConfidence.confidence;

  const response = await request(app)
    .post("/api/v1/recommendations")
    .send({ model_version: "iam-risk-v1", generated_at: "2026-09-20T12:30:00Z", recommendations: [itemWithoutConfidence] });

  assert.equal(response.status, 200);
  assert.equal(response.body.accepted_count, 1);
  assert.equal(itemsMap.get("rec-no-conf-01").confidence, null);
});

test("E. prediction = INTENDED is accepted", async () => {
  const { app, itemsMap } = createIngestionTestApp();
  const payload = {
    ...validBatchPayload,
    recommendations: [{ ...validV2SingleItem, recommendation_id: "rec-pred-intended", prediction: "INTENDED" }]
  };

  const response = await request(app).post("/api/v1/recommendations").send(payload);
  assert.equal(response.status, 200);
  assert.equal(response.body.accepted_count, 1);
  assert.equal(itemsMap.get("rec-pred-intended").prediction, "INTENDED");
});

test("F. prediction = EXCESSIVE is accepted", async () => {
  const { app, itemsMap } = createIngestionTestApp();
  const payload = {
    ...validBatchPayload,
    recommendations: [{ ...validV2SingleItem, recommendation_id: "rec-pred-excessive", prediction: "EXCESSIVE" }]
  };

  const response = await request(app).post("/api/v1/recommendations").send(payload);
  assert.equal(response.status, 200);
  assert.equal(response.body.accepted_count, 1);
  assert.equal(itemsMap.get("rec-pred-excessive").prediction, "EXCESSIVE");
});

test("G. recommendation = KEEP is accepted", async () => {
  const { app, itemsMap } = createIngestionTestApp();
  const payload = {
    ...validBatchPayload,
    recommendations: [{ ...validV2SingleItem, recommendation_id: "rec-decision-keep", recommendation: "KEEP" }]
  };

  const response = await request(app).post("/api/v1/recommendations").send(payload);
  assert.equal(response.status, 200);
  assert.equal(response.body.accepted_count, 1);
  assert.equal(itemsMap.get("rec-decision-keep").recommendation, "KEEP");
});

test("H. recommendation = REVIEW is accepted", async () => {
  const { app, itemsMap } = createIngestionTestApp();
  const payload = {
    ...validBatchPayload,
    recommendations: [{ ...validV2SingleItem, recommendation_id: "rec-decision-review", recommendation: "REVIEW" }]
  };

  const response = await request(app).post("/api/v1/recommendations").send(payload);
  assert.equal(response.status, 200);
  assert.equal(response.body.accepted_count, 1);
  assert.equal(itemsMap.get("rec-decision-review").recommendation, "REVIEW");
});

test("I. recommendation = REMOVE is accepted", async () => {
  const { app, itemsMap } = createIngestionTestApp();
  const payload = {
    ...validBatchPayload,
    recommendations: [{ ...validV2SingleItem, recommendation_id: "rec-decision-remove", recommendation: "REMOVE" }]
  };

  const response = await request(app).post("/api/v1/recommendations").send(payload);
  assert.equal(response.status, 200);
  assert.equal(response.body.accepted_count, 1);
  assert.equal(itemsMap.get("rec-decision-remove").recommendation, "REMOVE");
});

test("J. risk_weight = \"8\" (string) is rejected", async () => {
  const { app } = createIngestionTestApp();
  const payload = {
    ...validBatchPayload,
    recommendations: [{ ...validV2SingleItem, recommendation_id: "rec-str-weight", risk_weight: "8" }]
  };

  const response = await request(app).post("/api/v1/recommendations").send(payload);
  assert.equal(response.status, 400);
  assert.ok(response.body.error.message.includes("failed validation"));
});

test("K. risk_score outside 0..1 is rejected", async () => {
  const { app } = createIngestionTestApp();
  const payload = {
    ...validBatchPayload,
    recommendations: [{ ...validV2SingleItem, recommendation_id: "rec-bad-score", risk_score: 1.5 }]
  };

  const response = await request(app).post("/api/v1/recommendations").send(payload);
  assert.equal(response.status, 400);
  assert.ok(response.body.error.message.includes("failed validation"));
});

test("L. invalid prediction is rejected", async () => {
  const { app } = createIngestionTestApp();
  const payload = {
    ...validBatchPayload,
    recommendations: [{ ...validV2SingleItem, recommendation_id: "rec-bad-pred", prediction: "INVALID_PREDICTION" }]
  };

  const response = await request(app).post("/api/v1/recommendations").send(payload);
  assert.equal(response.status, 400);
  assert.ok(response.body.error.message.includes("failed validation"));
});

test("M. invalid recommendation decision is rejected", async () => {
  const { app } = createIngestionTestApp();
  const payload = {
    ...validBatchPayload,
    recommendations: [{ ...validV2SingleItem, recommendation_id: "rec-bad-rec", recommendation: "DISCARD" }]
  };

  const response = await request(app).post("/api/v1/recommendations").send(payload);
  assert.equal(response.status, 400);
  assert.ok(response.body.error.message.includes("failed validation"));
});

test("N. invalid/unknown role_id is rejected", async () => {
  const { app } = createIngestionTestApp();
  const payloadObsolete = {
    ...validBatchPayload,
    recommendations: [{ ...validV2SingleItem, recommendation_id: "rec-obs-role", role_id: "ApplicationDeveloper-Role" }]
  };

  const response1 = await request(app).post("/api/v1/recommendations").send(payloadObsolete);
  assert.equal(response1.status, 400);

  const payloadUnknown = {
    ...validBatchPayload,
    recommendations: [{ ...validV2SingleItem, recommendation_id: "rec-unk-role", role_id: "SuperAdminRole" }]
  };

  const response2 = await request(app).post("/api/v1/recommendations").send(payloadUnknown);
  assert.equal(response2.status, 400);
});

test("O. duplicate recommendation_id preserves existing idempotency behavior", async () => {
  const { app, itemsMap } = createIngestionTestApp();

  const response1 = await request(app).post("/api/v1/recommendations").send(validBatchPayload);
  assert.equal(response1.status, 200);
  assert.equal(response1.body.accepted_count, 1);

  const response2 = await request(app).post("/api/v1/recommendations").send(validBatchPayload);
  assert.equal(response2.status, 200);
  assert.equal(response2.body.accepted_count, 1);
  assert.equal(response2.body.rejected_count, 0);

  assert.equal(itemsMap.size, 1);
});

test("Ingests a realistic multi-item V2 batch with different role_ids, predictions, decisions, and duplicate handling", async () => {
  const { app, itemsMap } = createIngestionTestApp();

  const realisticBatch = {
    model_version: "iam-risk-v2",
    generated_at: "2026-09-26T12:00:00Z",
    recommendations: [
      {
        recommendation_id: "rec-batch-001",
        user_id: "usr-dev-01",
        role_id: "BackendDeveloper-Role",
        action: "s3:GetObject",
        resource: "arn:aws:s3:::app-data/*",
        risk_score: 0.12,
        risk_weight: 1,
        risk_level: "LOW",
        prediction: "INTENDED",
        recommendation: "KEEP",
        reason_codes: ["DAILY_USAGE"],
        explanation: "Permission actively used for daily backend operations.",
        model_version: "iam-risk-v2",
        generated_at: "2026-09-26T12:00:00Z"
      },
      {
        recommendation_id: "rec-batch-002",
        user_id: "usr-data-02",
        role_id: "DataScientist-Role",
        action: "dynamodb:Scan",
        resource: "arn:aws:dynamodb:ap-south-1:123456789012:table/analytics",
        risk_score: 0.65,
        risk_weight: 5,
        risk_level: "MEDIUM",
        prediction: "EXCESSIVE",
        recommendation: "REVIEW",
        reason_codes: ["INFREQUENT_ACCESS", "BROAD_READ_ACTION"],
        explanation: "Table scan action used infrequently, requires admin review.",
        model_version: "iam-risk-v2",
        generated_at: "2026-09-26T12:00:00Z"
      },
      {
        recommendation_id: "rec-batch-003",
        user_id: "usr-ops-03",
        role_id: "DevOpsEngineer-Role",
        action: "iam:CreateUser",
        resource: "*",
        risk_score: 0.95,
        risk_weight: 9,
        risk_level: "HIGH",
        prediction: "EXCESSIVE",
        recommendation: "REMOVE",
        reason_codes: ["ZERO_USAGE", "CRITICAL_ADMIN_ACTION"],
        explanation: "Admin permission unused over 90 days, recommend removal.",
        model_version: "iam-risk-v2",
        generated_at: "2026-09-26T12:00:00Z"
      }
    ]
  };

  const response1 = await request(app)
    .post("/api/v1/recommendations")
    .send(realisticBatch);

  assert.equal(response1.status, 200);
  assert.equal(response1.body.status, "accepted");
  assert.equal(response1.body.accepted_count, 3);
  assert.equal(response1.body.rejected_count, 0);
  assert.deepEqual(response1.body.recommendation_ids, ["rec-batch-001", "rec-batch-002", "rec-batch-003"]);
  assert.equal(itemsMap.size, 3);

  // Repeated request (idempotency check)
  const response2 = await request(app)
    .post("/api/v1/recommendations")
    .send(realisticBatch);

  assert.equal(response2.status, 200);
  assert.equal(response2.body.accepted_count, 3);
  assert.equal(response2.body.rejected_count, 0);
  assert.equal(itemsMap.size, 3);
});

// ---------------------------------------------------------------------------
// Additional Ingestion Structural Edge Cases
// ---------------------------------------------------------------------------

test("POST /api/v1/recommendations rejects missing model_version", async () => {
  const { app } = createIngestionTestApp();
  const response = await request(app)
    .post("/api/v1/recommendations")
    .send({ generated_at: "2026-09-20T12:30:00Z", recommendations: [validV2SingleItem] });

  assert.equal(response.status, 400);
  assert.ok(response.body.error.message.includes("Field 'model_version' is required"));
});

test("POST /api/v1/recommendations rejects missing generated_at", async () => {
  const { app } = createIngestionTestApp();
  const response = await request(app)
    .post("/api/v1/recommendations")
    .send({ model_version: "iam-risk-v1", recommendations: [validV2SingleItem] });

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

/* ========================================================================== */
/* GAP-5: INGESTION BATCH AND REQUEST BODY SIZE LIMIT TESTS                    */
/* ========================================================================== */

test("GAP-5: exactly 100 records batch is accepted", async () => {
  const { app } = createIngestionTestApp();
  const batch100 = Array.from({ length: 100 }, (_, i) => ({
    ...validV2SingleItem,
    recommendation_id: `rec-batch100-${i + 1}`
  }));

  const response = await request(app)
    .post("/api/v1/recommendations")
    .send({
      model_version: "iam-risk-v1",
      generated_at: "2026-09-20T12:30:00Z",
      recommendations: batch100
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.accepted_count, 100);
  assert.equal(response.body.rejected_count, 0);
});

test("GAP-5: 101 records batch is rejected with HTTP 400", async () => {
  const { app } = createIngestionTestApp();
  const batch101 = Array.from({ length: 101 }, (_, i) => ({
    ...validV2SingleItem,
    recommendation_id: `rec-batch101-${i + 1}`
  }));

  const response = await request(app)
    .post("/api/v1/recommendations")
    .send({
      model_version: "iam-risk-v1",
      generated_at: "2026-09-20T12:30:00Z",
      recommendations: batch101
    });

  assert.equal(response.status, 400);
  assert.ok(response.body.error.message.includes("Batch size must not exceed 100 items"));
});

test("GAP-5: empty recommendations array is rejected with HTTP 400", async () => {
  const { app } = createIngestionTestApp();
  const response = await request(app)
    .post("/api/v1/recommendations")
    .send({
      model_version: "iam-risk-v1",
      generated_at: "2026-09-20T12:30:00Z",
      recommendations: []
    });

  assert.equal(response.status, 400);
  assert.ok(response.body.error.message.includes("non-empty array"));
});

test("GAP-5: request body exceeding 1MB limit is rejected with 413 Payload Too Large", async () => {
  const mainApp = require("../src/app");
  // Generate a large string > 1MB
  const largePadding = "x".repeat(1.2 * 1024 * 1024);
  const response = await request(mainApp)
    .post("/api/v1/recommendations")
    .send({
      model_version: "iam-risk-v1",
      generated_at: "2026-09-20T12:30:00Z",
      padding: largePadding,
      recommendations: [validV2SingleItem]
    });

  assert.equal(response.status, 413);
});

