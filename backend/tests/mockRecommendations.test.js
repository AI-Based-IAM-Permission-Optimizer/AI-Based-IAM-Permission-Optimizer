const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getMockRecommendations,
  seedMockRecommendations,
  rawMockRecommendations
} = require("../src/data/mockRecommendations");
const { FINAL_RECOMMENDATION_FIELDS } = require("../src/domain/recommendation.schema");

test("getMockRecommendations returns 3 validated mock recommendation records", () => {
  const mocks = getMockRecommendations();
  assert.equal(mocks.length, 3);
});

test("mock recommendations cover KEEP, REVIEW, and REMOVE decisions", () => {
  const mocks = getMockRecommendations();
  const decisions = mocks.map((m) => m.recommendation);

  assert.ok(decisions.includes("KEEP"));
  assert.ok(decisions.includes("REVIEW"));
  assert.ok(decisions.includes("REMOVE"));
});

test("every mock recommendation contains all 21 finalized contract fields", () => {
  const mocks = getMockRecommendations();

  for (const mock of mocks) {
    for (const field of FINAL_RECOMMENDATION_FIELDS) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(mock, field),
        `Mock item missing required contract field: ${field}`
      );
    }
  }
});

test("mock recommendations conform to ML and backend approval defaults", () => {
  const mocks = getMockRecommendations();

  for (const mock of mocks) {
    assert.equal(mock.model_version, "iam-risk-v1");
    assert.equal(typeof mock.risk_score, "number");
    assert.ok(mock.risk_score >= 0.0 && mock.risk_score <= 1.0);
    assert.equal(mock.approval_status, "PENDING");
    assert.equal(mock.approved_by, null);
    assert.equal(mock.approved_at, null);
    assert.equal(mock.rejection_reason, null);
    assert.equal(mock.policy_version, null);
  }
});

test("seedMockRecommendations seeds mock records into mock repository/service", async () => {
  const seededItems = [];
  const mockService = {
    createRecommendation: async (item) => {
      seededItems.push(item);
      return item;
    }
  };

  const result = await seedMockRecommendations(mockService);
  assert.equal(result.length, 3);
  assert.equal(seededItems.length, 3);
  assert.equal(seededItems[0].recommendation_id, "rec-mock-keep-001");
});
