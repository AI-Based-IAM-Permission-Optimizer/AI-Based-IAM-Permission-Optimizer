const test = require("node:test");
const assert = require("node:assert/strict");
const { generatePolicyForReferenceUser } = require("../src/services/policyOrchestrationService");
const { getUserById } = require("../src/repositories/iamReferenceRepository");
const { ValidationError } = require("../src/utils/errors");

function getBaselineDevUser() {
  return getUserById("demo-developer");
}

test("1. Generates a policy using a valid reference user and recommendations", () => {
  const devUser = getBaselineDevUser();
  const recs = [
    { action: "s3:DeleteObject", recommendation: "REMOVE", approval_status: "APPROVED" }
  ];

  const result = generatePolicyForReferenceUser(devUser, recs);
  assert.ok(result);
  assert.ok(result.policy);
  assert.equal(result.policy.Version, "2012-10-17");
});

test("2. Returns the correct reference user_id", () => {
  const devUser = getBaselineDevUser();
  const result = generatePolicyForReferenceUser(devUser, []);
  assert.equal(result.user_id, "demo-developer");
});

test("3. Returns the correct reference role_id", () => {
  const devUser = getBaselineDevUser();
  const result = generatePolicyForReferenceUser(devUser, []);
  assert.equal(result.role_id, null);
});

test("4. Returns source_policy.policy_name from the reference data", () => {
  const devUser = getBaselineDevUser();
  const result = generatePolicyForReferenceUser(devUser, []);
  assert.equal(result.source_policy.policy_name, "DemoDeveloper-OverPermissioned-Policy");
});

test("5. Returns source_policy.policy_version from the reference data", () => {
  const devUser = getBaselineDevUser();
  const result = generatePolicyForReferenceUser(devUser, []);
  assert.equal(result.source_policy.policy_version, "2012-10-17");
});

test("6. Delegates policy decisions to policyGeneratorService", () => {
  const devUser = getBaselineDevUser();
  const recs = [
    { action: "s3:DeleteObject", recommendation: "REMOVE", approval_status: "APPROVED" }
  ];

  const result = generatePolicyForReferenceUser(devUser, recs);
  const actions = result.policy.Statement[0].Action;

  assert.equal(actions.includes("s3:DeleteObject"), false);
  assert.ok(actions.includes("s3:GetObject"));
});

test("7. Correctly passes recommendations to the generator", () => {
  const devUser = getBaselineDevUser();
  const recs = [
    { action: "iam:CreateUser", recommendation: "REMOVE", approval_status: "APPROVED" }
  ];

  const result = generatePolicyForReferenceUser(devUser, recs);
  const actions = result.policy.Statement[0].Action;

  assert.equal(actions.includes("iam:CreateUser"), false);
  assert.ok(actions.includes("iam:GetUser"));
});

test("8. Empty recommendations produce a policy retaining baseline permissions", () => {
  const devUser = getBaselineDevUser();
  const result = generatePolicyForReferenceUser(devUser, []);
  const baselineActions = devUser.attached_policies[0].statements[0].action;

  assert.deepEqual(result.policy.Statement[0].Action, baselineActions);
});

test("9. Missing userReference is rejected", () => {
  assert.throws(
    () => generatePolicyForReferenceUser(null, []),
    (err) => err instanceof ValidationError && err.message.includes("userReference")
  );
  assert.throws(
    () => generatePolicyForReferenceUser(undefined, []),
    (err) => err instanceof ValidationError && err.message.includes("userReference")
  );
});

test("10. Non-array recommendations are rejected", () => {
  const devUser = getBaselineDevUser();
  assert.throws(
    () => generatePolicyForReferenceUser(devUser, null),
    (err) => err instanceof ValidationError && err.message.includes("recommendations")
  );
  assert.throws(
    () => generatePolicyForReferenceUser(devUser, "not-an-array"),
    (err) => err instanceof ValidationError && err.message.includes("recommendations")
  );
});

test("11. Does not mutate userReference", () => {
  const devUser = getBaselineDevUser();
  const originalJson = JSON.stringify(devUser);

  generatePolicyForReferenceUser(devUser, [
    { action: "s3:DeleteObject", recommendation: "REMOVE", approval_status: "APPROVED" }
  ]);

  assert.equal(JSON.stringify(devUser), originalJson);
});

test("12. Does not mutate recommendations", () => {
  const devUser = getBaselineDevUser();
  const recs = [
    { action: "s3:DeleteObject", recommendation: "REMOVE", approval_status: "APPROVED" }
  ];
  const originalRecsJson = JSON.stringify(recs);

  generatePolicyForReferenceUser(devUser, recs);
  assert.equal(JSON.stringify(recs), originalRecsJson);
});

test("13. generated_at is a valid ISO timestamp", () => {
  const devUser = getBaselineDevUser();
  const result = generatePolicyForReferenceUser(devUser, []);

  assert.ok(result.generated_at);
  const parsedDate = new Date(result.generated_at);
  assert.equal(isNaN(parsedDate.getTime()), false);
});

test("14. Does not contain or implement any user_id/role_id mapping logic", () => {
  // Test with arbitrary userReference and recommendation list without matching user_ids
  const customUserRef = {
    user_id: "arbitrary-ref-id",
    role_id: "arbitrary-role-id",
    attached_policies: [
      {
        policy_name: "Custom-Policy",
        policy_version: "2012-10-17",
        statements: [
          {
            effect: "Allow",
            action: ["s3:GetObject", "s3:DeleteObject"],
            resource: "*"
          }
        ]
      }
    ]
  };

  const recs = [
    {
      user_id: "different-ml-user-id", // ML user ID differs from customUserRef.user_id
      action: "s3:DeleteObject",
      recommendation: "REMOVE",
      approval_status: "APPROVED"
    }
  ];

  const result = generatePolicyForReferenceUser(customUserRef, recs);
  assert.equal(result.user_id, "arbitrary-ref-id");
  assert.equal(result.role_id, "arbitrary-role-id");
  assert.equal(result.source_policy.policy_name, "Custom-Policy");
  assert.equal(result.policy.Statement[0].Action.includes("s3:DeleteObject"), false);
});
