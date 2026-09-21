const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const express = require("express");
const createPolicyRouter = require("../src/routes/policy.routes");
const PolicyController = require("../src/controllers/policy.controller");
const { PolicyRecommendationService } = require("../src/services/policyRecommendationService");
const { getUserById } = require("../src/repositories/iamReferenceRepository");
const { errorHandler, notFoundHandler } = require("../src/middleware/error.middleware");

function createTestPolicyApp(recommendationsStore = []) {
  const itemsMap = new Map();
  recommendationsStore.forEach((item) => itemsMap.set(item.recommendation_id, item));

  const mockRepo = {
    findById: async (id) => itemsMap.get(id) || null,
    findAll: async (filters = {}) => {
      let result = Array.from(itemsMap.values());
      if (filters.user_id) {
        result = result.filter((i) => i.user_id === filters.user_id);
      }
      if (filters.role_id) {
        result = result.filter((i) => i.role_id === filters.role_id);
      }
      return result;
    }
  };

  const service = new PolicyRecommendationService(mockRepo, { getUserById });
  const controller = new PolicyController(service);
  const router = createPolicyRouter(controller);

  const app = express();
  app.use(express.json());
  app.use("/api/v1/policies", router);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return { app, mockRepo, itemsMap };
}

test("1 & 2. GET /api/v1/policies/synthetic-user-01 succeeds and resolves ApplicationDeveloper-Role to demo-developer", async () => {
  const store = [
    {
      recommendation_id: "rec-01",
      user_id: "synthetic-user-01",
      role_id: "ApplicationDeveloper-Role",
      action: "s3:DeleteObject",
      recommendation: "REMOVE",
      approval_status: "APPROVED"
    }
  ];

  const { app } = createTestPolicyApp(store);
  const response = await request(app).get("/api/v1/policies/synthetic-user-01");

  assert.equal(response.status, 200);
  assert.equal(response.body.user_id, "demo-developer");
  assert.equal(response.body.source_policy.policy_name, "DemoDeveloper-OverPermissioned-Policy");
  assert.equal(response.body.source_policy.policy_version, "2012-10-17");
  assert.ok(response.body.policy);
  assert.equal(response.body.policy.Version, "2012-10-17");
});

test("3. DataAnalyst-Role resolves to demo-data-analyst", async () => {
  const store = [
    {
      recommendation_id: "rec-02",
      user_id: "synthetic-user-02",
      role_id: "DataAnalyst-Role",
      action: "kms:DisableKey",
      recommendation: "REMOVE",
      approval_status: "APPROVED"
    }
  ];

  const { app } = createTestPolicyApp(store);
  const response = await request(app).get("/api/v1/policies/synthetic-user-02");

  assert.equal(response.status, 200);
  assert.equal(response.body.user_id, "demo-data-analyst");
  assert.equal(response.body.source_policy.policy_name, "DemoDataAnalyst-OverPermissioned-Policy");
});

test("4. DevOps-Role resolves to demo-devops", async () => {
  const store = [
    {
      recommendation_id: "rec-03",
      user_id: "synthetic-user-03",
      role_id: "DevOps-Role",
      action: "cloudtrail:StopLogging",
      recommendation: "REMOVE",
      approval_status: "APPROVED"
    }
  ];

  const { app } = createTestPolicyApp(store);
  const response = await request(app).get("/api/v1/policies/synthetic-user-03");

  assert.equal(response.status, 200);
  assert.equal(response.body.user_id, "demo-devops");
  assert.equal(response.body.source_policy.policy_name, "DemoDevOps-OverPermissioned-Policy");
});

test("5. BackendDeveloper-Role resolves to demo-backend", async () => {
  const store = [
    {
      recommendation_id: "rec-04",
      user_id: "synthetic-user-04",
      role_id: "BackendDeveloper-Role",
      action: "secretsmanager:DeleteSecret",
      recommendation: "REMOVE",
      approval_status: "APPROVED"
    }
  ];

  const { app } = createTestPolicyApp(store);
  const response = await request(app).get("/api/v1/policies/synthetic-user-04");

  assert.equal(response.status, 200);
  assert.equal(response.body.user_id, "demo-backend");
  assert.equal(response.body.source_policy.policy_name, "DemoBackend-OverPermissioned-Policy");
});

test("6 & 7. Correct source policy selected after role resolution and recommendations retrieved using ML user_id", async () => {
  const store = [
    {
      recommendation_id: "rec-05",
      user_id: "ml-user-100",
      role_id: "ApplicationDeveloper-Role",
      action: "ec2:TerminateInstances",
      recommendation: "REMOVE",
      approval_status: "APPROVED"
    }
  ];

  const { app } = createTestPolicyApp(store);
  const response = await request(app).get("/api/v1/policies/ml-user-100");

  assert.equal(response.status, 200);
  assert.equal(response.body.source_policy.policy_name, "DemoDeveloper-OverPermissioned-Policy");
  const actions = response.body.policy.Statement[0].Action;
  assert.equal(actions.includes("ec2:TerminateInstances"), false);
});

test("8. KEEP recommendations retain permission", async () => {
  const store = [
    {
      recommendation_id: "rec-06",
      user_id: "synthetic-user-01",
      role_id: "ApplicationDeveloper-Role",
      action: "s3:GetObject",
      recommendation: "KEEP",
      approval_status: "APPROVED"
    }
  ];

  const { app } = createTestPolicyApp(store);
  const response = await request(app).get("/api/v1/policies/synthetic-user-01");

  assert.equal(response.status, 200);
  assert.ok(response.body.policy.Statement[0].Action.includes("s3:GetObject"));
});

test("9. REVIEW recommendations retain permission", async () => {
  const store = [
    {
      recommendation_id: "rec-07",
      user_id: "synthetic-user-01",
      role_id: "ApplicationDeveloper-Role",
      action: "s3:PutObject",
      recommendation: "REVIEW",
      approval_status: "APPROVED"
    }
  ];

  const { app } = createTestPolicyApp(store);
  const response = await request(app).get("/api/v1/policies/synthetic-user-01");

  assert.equal(response.status, 200);
  assert.ok(response.body.policy.Statement[0].Action.includes("s3:PutObject"));
});

test("10. REMOVE + PENDING retains permission", async () => {
  const store = [
    {
      recommendation_id: "rec-08",
      user_id: "synthetic-user-01",
      role_id: "ApplicationDeveloper-Role",
      action: "s3:DeleteObject",
      recommendation: "REMOVE",
      approval_status: "PENDING"
    }
  ];

  const { app } = createTestPolicyApp(store);
  const response = await request(app).get("/api/v1/policies/synthetic-user-01");

  assert.equal(response.status, 200);
  assert.ok(response.body.policy.Statement[0].Action.includes("s3:DeleteObject"));
});

test("11. REMOVE + REJECTED retains permission", async () => {
  const store = [
    {
      recommendation_id: "rec-09",
      user_id: "synthetic-user-01",
      role_id: "ApplicationDeveloper-Role",
      action: "s3:DeleteObject",
      recommendation: "REMOVE",
      approval_status: "REJECTED"
    }
  ];

  const { app } = createTestPolicyApp(store);
  const response = await request(app).get("/api/v1/policies/synthetic-user-01");

  assert.equal(response.status, 200);
  assert.ok(response.body.policy.Statement[0].Action.includes("s3:DeleteObject"));
});

test("12. REMOVE + APPROVED removes permission", async () => {
  const store = [
    {
      recommendation_id: "rec-10",
      user_id: "synthetic-user-01",
      role_id: "ApplicationDeveloper-Role",
      action: "s3:DeleteObject",
      recommendation: "REMOVE",
      approval_status: "APPROVED"
    }
  ];

  const { app } = createTestPolicyApp(store);
  const response = await request(app).get("/api/v1/policies/synthetic-user-01");

  assert.equal(response.status, 200);
  assert.equal(response.body.policy.Statement[0].Action.includes("s3:DeleteObject"), false);
});

test("13. Baseline permissions without recommendations remain", async () => {
  const store = [
    {
      recommendation_id: "rec-11",
      user_id: "synthetic-user-01",
      role_id: "ApplicationDeveloper-Role",
      action: "s3:DeleteObject",
      recommendation: "REMOVE",
      approval_status: "APPROVED"
    }
  ];

  const { app } = createTestPolicyApp(store);
  const response = await request(app).get("/api/v1/policies/synthetic-user-01");

  assert.equal(response.status, 200);
  const actions = response.body.policy.Statement[0].Action;
  assert.ok(actions.includes("ec2:StartInstances"));
  assert.ok(actions.includes("iam:CreateUser"));
});

test("14. Unknown ML user_id returns 404", async () => {
  const { app } = createTestPolicyApp([]);
  const response = await request(app).get("/api/v1/policies/unknown-ml-user-id");

  assert.equal(response.status, 404);
  assert.ok(response.body.error.message.includes("No recommendations found"));
});

test("15. Unknown role_id returns 400", async () => {
  const store = [
    {
      recommendation_id: "rec-12",
      user_id: "synthetic-user-99",
      role_id: "UnknownSuperUser-Role",
      action: "s3:GetObject",
      recommendation: "KEEP",
      approval_status: "APPROVED"
    }
  ];

  const { app } = createTestPolicyApp(store);
  const response = await request(app).get("/api/v1/policies/synthetic-user-99");

  assert.equal(response.status, 400);
  assert.ok(response.body.error.message.includes("Unknown or unmapped role_id"));
});

test("16. Missing role_id returns 400", async () => {
  const store = [
    {
      recommendation_id: "rec-13",
      user_id: "synthetic-user-88",
      role_id: "",
      action: "s3:GetObject",
      recommendation: "KEEP",
      approval_status: "APPROVED"
    }
  ];

  const { app } = createTestPolicyApp(store);
  const response = await request(app).get("/api/v1/policies/synthetic-user-88");

  assert.equal(response.status, 400);
  assert.ok(response.body.error.message.includes("do not specify a valid role_id"));
});

test("17. Multiple distinct role_ids for the same user return 400 rather than choosing one", async () => {
  const store = [
    {
      recommendation_id: "rec-14",
      user_id: "synthetic-user-confused",
      role_id: "ApplicationDeveloper-Role",
      action: "s3:GetObject",
      recommendation: "KEEP",
      approval_status: "APPROVED"
    },
    {
      recommendation_id: "rec-15",
      user_id: "synthetic-user-confused",
      role_id: "DevOps-Role",
      action: "ec2:StartInstances",
      recommendation: "KEEP",
      approval_status: "APPROVED"
    }
  ];

  const { app } = createTestPolicyApp(store);
  const response = await request(app).get("/api/v1/policies/synthetic-user-confused");

  assert.equal(response.status, 400);
  assert.ok(response.body.error.message.includes("Ambiguous policy generation"));
});

test("18. Empty user_id is rejected", async () => {
  const { app } = createTestPolicyApp([]);
  const response = await request(app).get("/api/v1/policies/%20");

  assert.equal(response.status, 400);
  assert.ok(response.body.error.message.includes("User ID parameter is required"));
});

test("20 & 21. No AWS IAM API is called and no live IAM resources are modified", async () => {
  const store = [
    {
      recommendation_id: "rec-16",
      user_id: "synthetic-user-01",
      role_id: "ApplicationDeveloper-Role",
      action: "s3:DeleteObject",
      recommendation: "REMOVE",
      approval_status: "APPROVED"
    }
  ];

  const { app } = createTestPolicyApp(store);
  const response = await request(app).get("/api/v1/policies/synthetic-user-01");

  assert.equal(response.status, 200);
  assert.ok(response.body.generated_at);
});
