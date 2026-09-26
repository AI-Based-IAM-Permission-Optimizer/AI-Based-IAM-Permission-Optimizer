const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getAllUsers,
  getUserById,
  IamReferenceRepository
} = require("../src/repositories/iamReferenceRepository");

test("getAllUsers returns exactly 4 expected baseline users", () => {
  const users = getAllUsers();
  assert.equal(Array.isArray(users), true);
  assert.equal(users.length, 4);

  const userIds = users.map((u) => u.user_id);
  assert.deepEqual(userIds, [
    "demo-developer",
    "demo-data-analyst",
    "demo-devops",
    "demo-backend-dev"
  ]);
});

test("getUserById returns demo-developer correctly", () => {
  const user = getUserById("demo-developer");
  assert.ok(user);
  assert.equal(user.user_id, "demo-developer");
  assert.equal(user.attached_policies.length, 1);
  assert.equal(user.attached_policies[0].policy_name, "DemoDeveloper-OverPermissioned-Policy");
});

test("getUserById returns demo-data-analyst correctly", () => {
  const user = getUserById("demo-data-analyst");
  assert.ok(user);
  assert.equal(user.user_id, "demo-data-analyst");
  assert.equal(user.attached_policies.length, 1);
  assert.equal(user.attached_policies[0].policy_name, "DemoDataAnalyst-OverPermissioned-Policy");
});

test("getUserById returns demo-backend-dev correctly", () => {
  const user = getUserById("demo-backend-dev");
  assert.ok(user);
  assert.equal(user.user_id, "demo-backend-dev");
  assert.equal(user.attached_policies.length, 1);
  assert.equal(user.attached_policies[0].policy_name, "DemoBackend-OverPermissioned-Policy");
});

test("getUserById returns null for unknown user ID", () => {
  const user = getUserById("unknown-user-id");
  assert.equal(user, null);
});

test("getUserById returns null for empty or missing ID", () => {
  assert.equal(getUserById(""), null);
  assert.equal(getUserById("   "), null);
  assert.equal(getUserById(null), null);
  assert.equal(getUserById(undefined), null);
});

test("Repository does not allow callers to mutate internal reference data", () => {
  const repo = new IamReferenceRepository();
  const users1 = repo.getAllUsers();
  
  // Mutate returned object
  users1[0].user_id = "MUTATED_ID";
  users1[0].attached_policies[0].statements = [];

  // Fetch fresh reference data
  const users2 = repo.getAllUsers();
  assert.equal(users2[0].user_id, "demo-developer");
  assert.equal(users2[0].attached_policies[0].statements.length, 1);

  const devUser = repo.getUserById("demo-developer");
  devUser.user_id = "MUTATED_DEV";
  const devUserFresh = repo.getUserById("demo-developer");
  assert.equal(devUserFresh.user_id, "demo-developer");
});
