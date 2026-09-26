const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("iamReferenceData.json is valid JSON with 4 expected demo users", () => {
  const filePath = path.join(__dirname, "../src/data/iamReferenceData.json");
  const rawContent = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(rawContent);

  assert.equal(data.format, "before_iam_reference_data");
  assert.ok(Array.isArray(data.users));
  assert.equal(data.users.length, 4);

  const userIds = data.users.map((u) => u.user_id);
  assert.deepEqual(userIds, [
    "demo-developer",
    "demo-data-analyst",
    "demo-devops",
    "demo-backend-dev"
  ]);

  for (const user of data.users) {
    assert.equal(Array.isArray(user.attached_policies), true);
    assert.equal(user.attached_policies.length, 1);

    const policy = user.attached_policies[0];
    assert.equal(policy.policy_version, "2012-10-17");
    assert.equal(Array.isArray(policy.statements), true);
    assert.equal(policy.statements.length, 1);
  }
});
