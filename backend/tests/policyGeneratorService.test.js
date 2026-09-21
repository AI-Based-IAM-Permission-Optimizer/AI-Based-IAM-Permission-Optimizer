const test = require("node:test");
const assert = require("node:assert/strict");
const { generatePolicy } = require("../src/services/policyGeneratorService");
const { getUserById } = require("../src/repositories/iamReferenceRepository");

function getBaselineDevUser() {
  return getUserById("demo-developer");
}

test("1. KEEP recommendation keeps the permission", () => {
  const devUser = getBaselineDevUser();
  const recs = [
    {
      action: "s3:GetObject",
      recommendation: "KEEP",
      approval_status: "APPROVED"
    }
  ];

  const policy = generatePolicy(devUser, recs);
  const actions = policy.Statement[0].Action;
  assert.ok(actions.includes("s3:GetObject"));
});

test("2. REVIEW recommendation keeps the permission", () => {
  const devUser = getBaselineDevUser();
  const recs = [
    {
      action: "s3:PutObject",
      recommendation: "REVIEW",
      approval_status: "APPROVED"
    }
  ];

  const policy = generatePolicy(devUser, recs);
  const actions = policy.Statement[0].Action;
  assert.ok(actions.includes("s3:PutObject"));
});

test("3. REMOVE + PENDING keeps the permission", () => {
  const devUser = getBaselineDevUser();
  const recs = [
    {
      action: "s3:DeleteObject",
      recommendation: "REMOVE",
      approval_status: "PENDING"
    }
  ];

  const policy = generatePolicy(devUser, recs);
  const actions = policy.Statement[0].Action;
  assert.ok(actions.includes("s3:DeleteObject"));
});

test("4. REMOVE + REJECTED keeps the permission", () => {
  const devUser = getBaselineDevUser();
  const recs = [
    {
      action: "s3:DeleteObject",
      recommendation: "REMOVE",
      approval_status: "REJECTED"
    }
  ];

  const policy = generatePolicy(devUser, recs);
  const actions = policy.Statement[0].Action;
  assert.ok(actions.includes("s3:DeleteObject"));
});

test("5. REMOVE + APPROVED removes the permission", () => {
  const devUser = getBaselineDevUser();
  const recs = [
    {
      action: "s3:DeleteObject",
      recommendation: "REMOVE",
      approval_status: "APPROVED"
    }
  ];

  const policy = generatePolicy(devUser, recs);
  const actions = policy.Statement[0].Action;
  assert.equal(actions.includes("s3:DeleteObject"), false);
  assert.ok(actions.includes("s3:GetObject"));
});

test("6. Baseline permission with no recommendation remains", () => {
  const devUser = getBaselineDevUser();
  const policy = generatePolicy(devUser, []);
  const actions = policy.Statement[0].Action;
  assert.ok(actions.includes("ec2:StartInstances"));
  assert.ok(actions.includes("iam:CreateUser"));
});

test("7. Multiple recommendations are processed correctly", () => {
  const devUser = getBaselineDevUser();
  const recs = [
    { action: "s3:DeleteObject", recommendation: "REMOVE", approval_status: "APPROVED" },
    { action: "iam:CreateUser", recommendation: "REMOVE", approval_status: "APPROVED" },
    { action: "s3:GetObject", recommendation: "KEEP", approval_status: "PENDING" },
    { action: "ec2:TerminateInstances", recommendation: "REMOVE", approval_status: "PENDING" }
  ];

  const policy = generatePolicy(devUser, recs);
  const actions = policy.Statement[0].Action;

  assert.equal(actions.includes("s3:DeleteObject"), false);
  assert.equal(actions.includes("iam:CreateUser"), false);
  assert.ok(actions.includes("s3:GetObject"));
  assert.ok(actions.includes("ec2:TerminateInstances"));
});

test("8. Only the matching action is removed", () => {
  const devUser = getBaselineDevUser();
  const initialActionCount = devUser.attached_policies[0].statements[0].action.length;
  const recs = [
    { action: "iam:CreateUser", recommendation: "REMOVE", approval_status: "APPROVED" }
  ];

  const policy = generatePolicy(devUser, recs);
  const newActionCount = policy.Statement[0].Action.length;

  assert.equal(newActionCount, initialActionCount - 1);
  assert.equal(policy.Statement[0].Action.includes("iam:CreateUser"), false);
  assert.ok(policy.Statement[0].Action.includes("iam:GetUser"));
});

test("9. Original userReference is not mutated", () => {
  const devUser = getBaselineDevUser();
  const originalJson = JSON.stringify(devUser);

  const recs = [
    { action: "s3:DeleteObject", recommendation: "REMOVE", approval_status: "APPROVED" }
  ];

  generatePolicy(devUser, recs);
  assert.equal(JSON.stringify(devUser), originalJson);
});

test("10. Original recommendations array is not mutated", () => {
  const devUser = getBaselineDevUser();
  const recs = [
    { action: "s3:DeleteObject", recommendation: "REMOVE", approval_status: "APPROVED" }
  ];
  const originalRecsJson = JSON.stringify(recs);

  generatePolicy(devUser, recs);
  assert.equal(JSON.stringify(recs), originalRecsJson);
});

test("11. When all actions in a statement are removed, the statement is omitted", () => {
  const singleStatementUser = {
    user_id: "test-user",
    attached_policies: [
      {
        policy_name: "Test-Policy",
        policy_version: "2012-10-17",
        statements: [
          {
            effect: "Allow",
            action: ["s3:DeleteObject"],
            resource: "*"
          }
        ]
      }
    ]
  };

  const recs = [
    { action: "s3:DeleteObject", recommendation: "REMOVE", approval_status: "APPROVED" }
  ];

  const policy = generatePolicy(singleStatementUser, recs);
  assert.equal(policy.Statement.length, 0);
});

test("12. Policy version remains 2012-10-17", () => {
  const devUser = getBaselineDevUser();
  const policy = generatePolicy(devUser, []);
  assert.equal(policy.Version, "2012-10-17");
});

test("13. Effect remains Allow", () => {
  const devUser = getBaselineDevUser();
  const policy = generatePolicy(devUser, []);
  assert.equal(policy.Statement[0].Effect, "Allow");
});

test("14. Resource remains *", () => {
  const devUser = getBaselineDevUser();
  const policy = generatePolicy(devUser, []);
  assert.equal(policy.Statement[0].Resource, "*");
});

test("15. Empty recommendations result in original permissions being retained", () => {
  const devUser = getBaselineDevUser();
  const policy = generatePolicy(devUser, []);
  const baselineActions = devUser.attached_policies[0].statements[0].action;

  assert.deepEqual(policy.Statement[0].Action, baselineActions);
});
