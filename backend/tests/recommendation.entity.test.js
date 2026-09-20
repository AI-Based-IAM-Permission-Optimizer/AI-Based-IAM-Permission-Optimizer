const test = require("node:test");
const assert = require("node:assert/strict");
const { createRecommendationEntity } = require("../src/domain/recommendation.entity");
const { ValidationError } = require("../src/utils/errors");

const validPayload = {
  user_id: "usr-123",
  role_id: "rol-456",
  action: "s3:GetObject",
  resource: "arn:aws:s3:::my-bucket/*",
  risk_score: 85.5,
  risk_level: "HIGH",
  recommendation: "REMOVE"
};

test("createRecommendationEntity generates backend fields correctly", () => {
  const entity = createRecommendationEntity(validPayload);

  assert.ok(entity.recommendation_id);
  assert.equal(typeof entity.recommendation_id, "string");
  assert.equal(entity.status, "PENDING");
  assert.ok(entity.created_at);
  assert.equal(entity.reviewed_at, null);
  assert.equal(entity.user_id, "usr-123");
  assert.equal(entity.role_id, "rol-456");
  assert.equal(entity.action, "s3:GetObject");
  assert.equal(entity.resource, "arn:aws:s3:::my-bucket/*");
  assert.equal(entity.risk_score, 85.5);
  assert.equal(entity.risk_level, "HIGH");
  assert.equal(entity.recommendation, "REMOVE");
});

test("createRecommendationEntity accepts allowed recommendation values KEEP, REVIEW, REMOVE", () => {
  for (const recValue of ["KEEP", "REVIEW", "REMOVE"]) {
    const entity = createRecommendationEntity({ ...validPayload, recommendation: recValue });
    assert.equal(entity.recommendation, recValue);
  }
});

test("createRecommendationEntity rejects invalid recommendation value", () => {
  assert.throws(
    () => createRecommendationEntity({ ...validPayload, recommendation: "DELETE" }),
    (err) => err instanceof ValidationError && err.message.includes("Field 'recommendation' must be one of")
  );
});

test("createRecommendationEntity rejects non-numeric risk_score", () => {
  assert.throws(
    () => createRecommendationEntity({ ...validPayload, risk_score: "85.5" }),
    (err) => err instanceof ValidationError && err.message.includes("risk_score")
  );
  assert.throws(
    () => createRecommendationEntity({ ...validPayload, risk_score: NaN }),
    (err) => err instanceof ValidationError && err.message.includes("risk_score")
  );
});

test("createRecommendationEntity rejects missing core fields", () => {
  assert.throws(
    () => createRecommendationEntity({ ...validPayload, user_id: "" }),
    (err) => err instanceof ValidationError && err.message.includes("user_id")
  );
  assert.throws(
    () => createRecommendationEntity({ ...validPayload, role_id: " " }),
    (err) => err instanceof ValidationError && err.message.includes("role_id")
  );
  assert.throws(
    () => createRecommendationEntity({ ...validPayload, action: null }),
    (err) => err instanceof ValidationError && err.message.includes("action")
  );
});

test("createRecommendationEntity preserves optional enrichment fields if provided", () => {
  const entity = createRecommendationEntity({
    ...validPayload,
    usage_count: 5,
    resource_scope: "GLOBAL"
  });

  assert.equal(entity.usage_count, 5);
  assert.equal(entity.resource_scope, "GLOBAL");
});
