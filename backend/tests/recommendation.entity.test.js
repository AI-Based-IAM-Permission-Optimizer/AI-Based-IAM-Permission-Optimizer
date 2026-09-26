const test = require("node:test");
const assert = require("node:assert/strict");
const { createRecommendationEntity } = require("../src/domain/recommendation.entity");
const { VALID_V2_ROLE_IDS } = require("../src/domain/recommendation.schema");
const { ValidationError } = require("../src/utils/errors");

const validPayload = {
  user_id: "usr-123",
  role_id: "BackendDeveloper-Role",
  action: "s3:GetObject",
  resource: "arn:aws:s3:::my-bucket/*",
  risk_score: 0.85,
  risk_level: "HIGH",
  prediction: "EXCESSIVE",
  recommendation: "REMOVE"
};

test("createRecommendationEntity generates backend fields correctly", () => {
  const entity = createRecommendationEntity(validPayload);

  assert.ok(entity.recommendation_id);
  assert.equal(typeof entity.recommendation_id, "string");
  assert.equal(entity.approval_status, "PENDING");
  assert.equal(entity.status, "PENDING");
  assert.equal(entity.approved_by, null);
  assert.equal(entity.approved_at, null);
  assert.equal(entity.rejection_reason, null);
  assert.equal(entity.policy_version, null);
  assert.ok(entity.updated_at);
  assert.ok(entity.created_at);
  assert.equal(entity.user_id, "usr-123");
  assert.equal(entity.role_id, "BackendDeveloper-Role");
  assert.equal(entity.action, "s3:GetObject");
  assert.equal(entity.resource, "arn:aws:s3:::my-bucket/*");
  assert.equal(entity.risk_score, 0.85);
  assert.equal(entity.risk_level, "HIGH");
  assert.equal(entity.prediction, "EXCESSIVE");
  assert.equal(entity.recommendation, "REMOVE");
});

test("createRecommendationEntity accepts all 20 finalized V2 role IDs", () => {
  assert.equal(VALID_V2_ROLE_IDS.length, 20);

  for (const roleId of VALID_V2_ROLE_IDS) {
    const entity = createRecommendationEntity({ ...validPayload, role_id: roleId });
    assert.equal(entity.role_id, roleId);
  }
});

test("createRecommendationEntity rejects invalid/unknown role_id", () => {
  assert.throws(
    () => createRecommendationEntity({ ...validPayload, role_id: "ApplicationDeveloper-Role" }),
    (err) => err instanceof ValidationError && err.message.includes("role_id")
  );
  assert.throws(
    () => createRecommendationEntity({ ...validPayload, role_id: "UnknownRole" }),
    (err) => err instanceof ValidationError && err.message.includes("role_id")
  );
});

test("createRecommendationEntity preserves ML-provided recommendation_id idempotency key", () => {
  const entity = createRecommendationEntity({
    ...validPayload,
    recommendation_id: "ml-rec-custom-id-99"
  });

  assert.equal(entity.recommendation_id, "ml-rec-custom-id-99");
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

test("createRecommendationEntity accepts valid prediction values INTENDED and EXCESSIVE", () => {
  const entityIntended = createRecommendationEntity({ ...validPayload, prediction: "INTENDED" });
  assert.equal(entityIntended.prediction, "INTENDED");

  const entityExcessive = createRecommendationEntity({ ...validPayload, prediction: "EXCESSIVE" });
  assert.equal(entityExcessive.prediction, "EXCESSIVE");
});

test("createRecommendationEntity rejects invalid prediction value", () => {
  assert.throws(
    () => createRecommendationEntity({ ...validPayload, prediction: "INVALID_PREDICTION" }),
    (err) => err instanceof ValidationError && err.message.includes("prediction")
  );
});

test("createRecommendationEntity accepts payload without confidence field", () => {
  const payloadNoConfidence = { ...validPayload };
  delete payloadNoConfidence.confidence;

  const entity = createRecommendationEntity(payloadNoConfidence);
  assert.equal(entity.confidence, null);
  assert.equal(entity.recommendation, "REMOVE");
});

test("createRecommendationEntity enforces risk_score numeric range [0.0, 1.0]", () => {
  assert.throws(
    () => createRecommendationEntity({ ...validPayload, risk_score: "0.85" }),
    (err) => err instanceof ValidationError && err.message.includes("risk_score")
  );
  assert.throws(
    () => createRecommendationEntity({ ...validPayload, risk_score: NaN }),
    (err) => err instanceof ValidationError && err.message.includes("risk_score")
  );
  assert.throws(
    () => createRecommendationEntity({ ...validPayload, risk_score: -0.1 }),
    (err) => err instanceof ValidationError && err.message.includes("between 0.0 and 1.0")
  );
  assert.throws(
    () => createRecommendationEntity({ ...validPayload, risk_score: 1.5 }),
    (err) => err instanceof ValidationError && err.message.includes("between 0.0 and 1.0")
  );
});

test("createRecommendationEntity accepts numeric risk_weight without range restrictions", () => {
  const entityWithIntWeight = createRecommendationEntity({
    ...validPayload,
    risk_weight: 8
  });
  assert.equal(entityWithIntWeight.risk_weight, 8);

  const entityWithFloatWeight = createRecommendationEntity({
    ...validPayload,
    risk_weight: 0.25
  });
  assert.equal(entityWithFloatWeight.risk_weight, 0.25);
});

test("createRecommendationEntity rejects string risk_weight", () => {
  assert.throws(
    () => createRecommendationEntity({ ...validPayload, risk_weight: "8" }),
    (err) => err instanceof ValidationError && err.message.includes("risk_weight")
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

test("createRecommendationEntity preserves optional ML and enrichment fields if provided", () => {
  const entity = createRecommendationEntity({
    ...validPayload,
    model_version: "iam-risk-v1",
    reason_codes: ["UNUSED_PRIVILEGE"],
    explanation: "Permission unused for 90 days"
  });

  assert.equal(entity.model_version, "iam-risk-v1");
  assert.deepEqual(entity.reason_codes, ["UNUSED_PRIVILEGE"]);
  assert.equal(entity.explanation, "Permission unused for 90 days");
});

test("GAP-4: recommendation_id length limits are enforced correctly", () => {
  const { RECOMMENDATION_ID_MAX_LENGTH } = require("../src/domain/recommendation.entity");
  assert.equal(typeof RECOMMENDATION_ID_MAX_LENGTH, "number");
  assert.equal(RECOMMENDATION_ID_MAX_LENGTH, 512);

  // Valid length 512 is accepted
  const validLengthId = "a".repeat(RECOMMENDATION_ID_MAX_LENGTH);
  const entity = createRecommendationEntity({ ...validPayload, recommendation_id: validLengthId });
  assert.equal(entity.recommendation_id, validLengthId);

  // Oversized length 513 is rejected
  const oversizedId = "a".repeat(RECOMMENDATION_ID_MAX_LENGTH + 1);
  assert.throws(
    () => createRecommendationEntity({ ...validPayload, recommendation_id: oversizedId }),
    (err) => err instanceof ValidationError && err.message.includes("must not exceed 512 characters")
  );

  // Real production recommendation ID formats are preserved
  const prodId1 = "rec-20260920-000001";
  const prodId2 = "REC-A72A704EE806AA16";
  assert.equal(createRecommendationEntity({ ...validPayload, recommendation_id: prodId1 }).recommendation_id, prodId1);
  assert.equal(createRecommendationEntity({ ...validPayload, recommendation_id: prodId2 }).recommendation_id, prodId2);
});

