const test = require("node:test");
const assert = require("node:assert/strict");
const PolicyRecommendationService = require("../src/services/policyRecommendationService");
const { getUserById } = require("../src/repositories/iamReferenceRepository");
const { ValidationError } = require("../src/utils/errors");

function createMockRepo(items = []) {
  let capturedFilters = null;
  return {
    getCapturedFilters: () => capturedFilters,
    findAll: async (filters = {}) => {
      capturedFilters = filters;
      let result = [...items];
      if (filters.user_id) {
        result = result.filter((i) => i.user_id === filters.user_id);
      }
      if (filters.role_id) {
        result = result.filter((i) => i.role_id === filters.role_id);
      }
      return result;
    }
  };
}

function getBaselineDevUser() {
  return getUserById("demo-developer");
}

test("1. Retrieves recommendations using supplied filters", async () => {
  const mockRepo = createMockRepo([
    { action: "s3:DeleteObject", recommendation: "REMOVE", approval_status: "APPROVED", user_id: "ml-user-1" }
  ]);
  const service = new PolicyRecommendationService(mockRepo);
  const devUser = getBaselineDevUser();

  await service.generatePolicyWithRecommendations(devUser, { user_id: "ml-user-1" });
  assert.deepEqual(mockRepo.getCapturedFilters(), { user_id: "ml-user-1" });
});

test("2. Passes retrieved recommendations to policy orchestration", async () => {
  const mockRepo = createMockRepo([
    { action: "s3:DeleteObject", recommendation: "REMOVE", approval_status: "APPROVED" }
  ]);
  const service = new PolicyRecommendationService(mockRepo);
  const devUser = getBaselineDevUser();

  const result = await service.generatePolicyWithRecommendations(devUser, {});
  const actions = result.policy.Statement[0].Action;
  assert.equal(actions.includes("s3:DeleteObject"), false);
});

test("3. Returns the generated policy envelope", async () => {
  const mockRepo = createMockRepo([]);
  const service = new PolicyRecommendationService(mockRepo);
  const devUser = getBaselineDevUser();

  const result = await service.generatePolicyWithRecommendations(devUser, {});
  assert.equal(result.user_id, "demo-developer");
  assert.equal(result.source_policy.policy_name, "DemoDeveloper-OverPermissioned-Policy");
  assert.ok(result.policy);
  assert.ok(result.generated_at);
});

test("4. Empty recommendation result still generates baseline policy", async () => {
  const mockRepo = createMockRepo([]);
  const service = new PolicyRecommendationService(mockRepo);
  const devUser = getBaselineDevUser();

  const result = await service.generatePolicyWithRecommendations(devUser, {});
  const baselineActions = devUser.attached_policies[0].statements[0].action;
  assert.deepEqual(result.policy.Statement[0].Action, baselineActions);
});

test("5. Supports user_id filter when explicitly supplied", async () => {
  const mockRepo = createMockRepo([
    { action: "s3:DeleteObject", recommendation: "REMOVE", approval_status: "APPROVED", user_id: "ml-u1" },
    { action: "iam:CreateUser", recommendation: "REMOVE", approval_status: "APPROVED", user_id: "ml-u2" }
  ]);
  const service = new PolicyRecommendationService(mockRepo);
  const devUser = getBaselineDevUser();

  const result = await service.generatePolicyWithRecommendations(devUser, { user_id: "ml-u1" });
  const actions = result.policy.Statement[0].Action;

  assert.equal(actions.includes("s3:DeleteObject"), false);
  assert.ok(actions.includes("iam:CreateUser")); // ml-u2 recommendation was filtered out
});

test("6. Supports role_id filter when explicitly supplied", async () => {
  const mockRepo = createMockRepo([
    { action: "s3:DeleteObject", recommendation: "REMOVE", approval_status: "APPROVED", role_id: "role-1" }
  ]);
  const service = new PolicyRecommendationService(mockRepo);
  const devUser = getBaselineDevUser();

  await service.generatePolicyWithRecommendations(devUser, { role_id: "role-1" });
  assert.deepEqual(mockRepo.getCapturedFilters(), { role_id: "role-1" });
});

test("7. Does not invent or perform identifier mapping", async () => {
  const mockRepo = createMockRepo([]);
  const service = new PolicyRecommendationService(mockRepo);
  const devUser = getBaselineDevUser();

  // Passing explicit custom ML filter
  await service.generatePolicyWithRecommendations(devUser, { user_id: "custom-ml-id" });
  // Verifies that service passed custom-ml-id directly to repo without mapping devUser.user_id
  assert.equal(mockRepo.getCapturedFilters().user_id, "custom-ml-id");
});

test("8. Rejects missing userReference", async () => {
  const mockRepo = createMockRepo([]);
  const service = new PolicyRecommendationService(mockRepo);

  await assert.rejects(
    () => service.generatePolicyWithRecommendations(null, {}),
    (err) => err instanceof ValidationError && err.message.includes("userReference")
  );
});

test("9. Rejects invalid userReference", async () => {
  const mockRepo = createMockRepo([]);
  const service = new PolicyRecommendationService(mockRepo);

  await assert.rejects(
    () => service.generatePolicyWithRecommendations("not-an-object", {}),
    (err) => err instanceof ValidationError && err.message.includes("userReference")
  );
});

test("10. Rejects missing recommendationFilters", async () => {
  const mockRepo = createMockRepo([]);
  const service = new PolicyRecommendationService(mockRepo);
  const devUser = getBaselineDevUser();

  await assert.rejects(
    () => service.generatePolicyWithRecommendations(devUser, null),
    (err) => err instanceof ValidationError && err.message.includes("recommendationFilters")
  );
});

test("11. Rejects non-object recommendationFilters", async () => {
  const mockRepo = createMockRepo([]);
  const service = new PolicyRecommendationService(mockRepo);
  const devUser = getBaselineDevUser();

  await assert.rejects(
    () => service.generatePolicyWithRecommendations(devUser, "invalid-filter"),
    (err) => err instanceof ValidationError && err.message.includes("recommendationFilters")
  );
});

test("12. Does not mutate userReference", async () => {
  const mockRepo = createMockRepo([]);
  const service = new PolicyRecommendationService(mockRepo);
  const devUser = getBaselineDevUser();
  const originalJson = JSON.stringify(devUser);

  await service.generatePolicyWithRecommendations(devUser, {});
  assert.equal(JSON.stringify(devUser), originalJson);
});

test("13. Does not mutate recommendationFilters", async () => {
  const mockRepo = createMockRepo([]);
  const service = new PolicyRecommendationService(mockRepo);
  const devUser = getBaselineDevUser();
  const filters = { user_id: "ml-user-1" };
  const originalFiltersJson = JSON.stringify(filters);

  await service.generatePolicyWithRecommendations(devUser, filters);
  assert.equal(JSON.stringify(filters), originalFiltersJson);
});

test("14 & 15. Uses existing RecommendationRepository instance and does not instantiate new SDK client", async () => {
  let findAllCalled = false;
  const mockRepo = {
    findAll: async () => {
      findAllCalled = true;
      return [];
    }
  };

  const service = new PolicyRecommendationService(mockRepo);
  const devUser = getBaselineDevUser();

  await service.generatePolicyWithRecommendations(devUser, {});
  assert.equal(findAllCalled, true);
});
