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

// ---------------------------------------------------------------------------
// 20-Role V2 Mapping Resolution Tests
// ---------------------------------------------------------------------------

const EXPECTED_V2_ROLE_MAPPINGS = [
  // demo-backend-dev (3 roles)
  { role_id: "BackendDeveloper-Role", expected_user: "demo-backend-dev", expected_policy: "DemoBackend-OverPermissioned-Policy" },
  { role_id: "APIDeveloper-Role", expected_user: "demo-backend-dev", expected_policy: "DemoBackend-OverPermissioned-Policy" },
  { role_id: "FrontendDeveloper-Role", expected_user: "demo-backend-dev", expected_policy: "DemoBackend-OverPermissioned-Policy" },

  // demo-data-analyst (6 roles)
  { role_id: "DataAnalyst-Role", expected_user: "demo-data-analyst", expected_policy: "DemoDataAnalyst-OverPermissioned-Policy" },
  { role_id: "DataEngineer-Role", expected_user: "demo-data-analyst", expected_policy: "DemoDataAnalyst-OverPermissioned-Policy" },
  { role_id: "DataScientist-Role", expected_user: "demo-data-analyst", expected_policy: "DemoDataAnalyst-OverPermissioned-Policy" },
  { role_id: "CloudDataArchitect-Role", expected_user: "demo-data-analyst", expected_policy: "DemoDataAnalyst-OverPermissioned-Policy" },
  { role_id: "ResearchScientist-Role", expected_user: "demo-data-analyst", expected_policy: "DemoDataAnalyst-OverPermissioned-Policy" },
  { role_id: "ProductAnalyst-Role", expected_user: "demo-data-analyst", expected_policy: "DemoDataAnalyst-OverPermissioned-Policy" },

  // demo-devops (10 roles)
  { role_id: "DevOpsEngineer-Role", expected_user: "demo-devops", expected_policy: "DemoDevOps-OverPermissioned-Policy" },
  { role_id: "CloudEngineer-Role", expected_user: "demo-devops", expected_policy: "DemoDevOps-OverPermissioned-Policy" },
  { role_id: "SecurityEngineer-Role", expected_user: "demo-devops", expected_policy: "DemoDevOps-OverPermissioned-Policy" },
  { role_id: "IAMAdministrator-Role", expected_user: "demo-devops", expected_policy: "DemoDevOps-OverPermissioned-Policy" },
  { role_id: "DatabaseAdministrator-Role", expected_user: "demo-devops", expected_policy: "DemoDevOps-OverPermissioned-Policy" },
  { role_id: "SRE-Role", expected_user: "demo-devops", expected_policy: "DemoDevOps-OverPermissioned-Policy" },
  { role_id: "SecurityAnalyst-Role", expected_user: "demo-devops", expected_policy: "DemoDevOps-OverPermissioned-Policy" },
  { role_id: "ApplicationSupport-Role", expected_user: "demo-devops", expected_policy: "DemoDevOps-OverPermissioned-Policy" },
  { role_id: "PlatformEngineer-Role", expected_user: "demo-devops", expected_policy: "DemoDevOps-OverPermissioned-Policy" },
  { role_id: "MLPlatformEngineer-Role", expected_user: "demo-devops", expected_policy: "DemoDevOps-OverPermissioned-Policy" },

  // demo-developer (1 role)
  { role_id: "MLEngineer-Role", expected_user: "demo-developer", expected_policy: "DemoDeveloper-OverPermissioned-Policy" }
];

test("Every one of the 20 V2 role IDs resolves to the exact reference_user_id", async () => {
  assert.equal(EXPECTED_V2_ROLE_MAPPINGS.length, 20);

  for (const { role_id, expected_user, expected_policy } of EXPECTED_V2_ROLE_MAPPINGS) {
    const mlUserId = `user-for-${role_id}`;
    const store = [
      {
        recommendation_id: `rec-${role_id}`,
        user_id: mlUserId,
        role_id: role_id,
        action: "dummy:action",
        recommendation: "KEEP",
        approval_status: "APPROVED"
      }
    ];

    const { app } = createTestPolicyApp(store);
    const response = await request(app).get(`/api/v1/policies/${mlUserId}`);

    assert.equal(response.status, 200, `Expected 200 for ${role_id}`);
    assert.equal(response.body.user_id, expected_user, `Expected ${role_id} to resolve to ${expected_user}`);
    assert.equal(response.body.source_policy.policy_name, expected_policy);
    assert.ok(response.body.policy);
    assert.equal(response.body.policy.Version, "2012-10-17");
  }
});

// ---------------------------------------------------------------------------
// Obsolete & Unknown Role Rejection Tests
// ---------------------------------------------------------------------------

test("ApplicationDeveloper-Role is rejected/not mapped", async () => {
  const store = [
    {
      recommendation_id: "rec-obsolete-1",
      user_id: "user-obsolete-1",
      role_id: "ApplicationDeveloper-Role",
      action: "s3:GetObject",
      recommendation: "KEEP",
      approval_status: "APPROVED"
    }
  ];

  const { app } = createTestPolicyApp(store);
  const response = await request(app).get("/api/v1/policies/user-obsolete-1");

  assert.equal(response.status, 400);
  assert.ok(response.body.error.message.includes("Unknown or unmapped role_id"));
});

test("DevOps-Role is rejected/not mapped", async () => {
  const store = [
    {
      recommendation_id: "rec-obsolete-2",
      user_id: "user-obsolete-2",
      role_id: "DevOps-Role",
      action: "s3:GetObject",
      recommendation: "KEEP",
      approval_status: "APPROVED"
    }
  ];

  const { app } = createTestPolicyApp(store);
  const response = await request(app).get("/api/v1/policies/user-obsolete-2");

  assert.equal(response.status, 400);
  assert.ok(response.body.error.message.includes("Unknown or unmapped role_id"));
});

test("Unknown role_id is rejected/not mapped", async () => {
  const store = [
    {
      recommendation_id: "rec-unknown",
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

test("demo-backend-dev is used as the backend reference user", async () => {
  const store = [
    {
      recommendation_id: "rec-backend-1",
      user_id: "backend-ml-user",
      role_id: "BackendDeveloper-Role",
      action: "secretsmanager:DeleteSecret",
      recommendation: "REMOVE",
      approval_status: "APPROVED"
    }
  ];

  const { app } = createTestPolicyApp(store);
  const response = await request(app).get("/api/v1/policies/backend-ml-user");

  assert.equal(response.status, 200);
  assert.equal(response.body.user_id, "demo-backend-dev");
  assert.equal(response.body.source_policy.policy_name, "DemoBackend-OverPermissioned-Policy");
});

// ---------------------------------------------------------------------------
// Policy Generation Rule & Edge Case Tests
// ---------------------------------------------------------------------------

test("GET /api/v1/policies/synthetic-user-01 succeeds with MLEngineer-Role resolving to demo-developer", async () => {
  const store = [
    {
      recommendation_id: "rec-01",
      user_id: "synthetic-user-01",
      role_id: "MLEngineer-Role",
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

test("KEEP recommendations retain permission", async () => {
  const store = [
    {
      recommendation_id: "rec-06",
      user_id: "synthetic-user-01",
      role_id: "MLEngineer-Role",
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

test("REVIEW recommendations retain permission", async () => {
  const store = [
    {
      recommendation_id: "rec-07",
      user_id: "synthetic-user-01",
      role_id: "MLEngineer-Role",
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

test("REMOVE + PENDING retains permission", async () => {
  const store = [
    {
      recommendation_id: "rec-08",
      user_id: "synthetic-user-01",
      role_id: "MLEngineer-Role",
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

test("REMOVE + REJECTED retains permission", async () => {
  const store = [
    {
      recommendation_id: "rec-09",
      user_id: "synthetic-user-01",
      role_id: "MLEngineer-Role",
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

test("REMOVE + APPROVED removes permission", async () => {
  const store = [
    {
      recommendation_id: "rec-10",
      user_id: "synthetic-user-01",
      role_id: "MLEngineer-Role",
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

test("Baseline permissions without recommendations remain", async () => {
  const store = [
    {
      recommendation_id: "rec-11",
      user_id: "synthetic-user-01",
      role_id: "MLEngineer-Role",
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

test("Unknown ML user_id returns 404", async () => {
  const { app } = createTestPolicyApp([]);
  const response = await request(app).get("/api/v1/policies/unknown-ml-user-id");

  assert.equal(response.status, 404);
  assert.ok(response.body.error.message.includes("No recommendations found"));
});

test("Missing role_id returns 400", async () => {
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

test("Multiple distinct role_ids for the same user return 400 rather than choosing one", async () => {
  const store = [
    {
      recommendation_id: "rec-14",
      user_id: "synthetic-user-confused",
      role_id: "MLEngineer-Role",
      action: "s3:GetObject",
      recommendation: "KEEP",
      approval_status: "APPROVED"
    },
    {
      recommendation_id: "rec-15",
      user_id: "synthetic-user-confused",
      role_id: "DevOpsEngineer-Role",
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

test("Empty user_id is rejected", async () => {
  const { app } = createTestPolicyApp([]);
  const response = await request(app).get("/api/v1/policies/%20");

  assert.equal(response.status, 400);
  assert.ok(response.body.error.message.includes("User ID parameter is required"));
});

test("No AWS IAM API is called and no live IAM resources are modified", async () => {
  const store = [
    {
      recommendation_id: "rec-16",
      user_id: "synthetic-user-01",
      role_id: "MLEngineer-Role",
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
