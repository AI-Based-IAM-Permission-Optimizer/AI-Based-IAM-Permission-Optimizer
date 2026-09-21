const test = require("node:test");
const assert = require("node:assert/strict");
const { PutCommand, GetCommand, ScanCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const RecommendationRepository = require("../src/repositories/recommendation.repository");
const { RepositoryError, NotFoundError, ValidationError } = require("../src/utils/errors");

function createMockDocClient(sendImpl) {
  return {
    send: sendImpl || (async () => ({}))
  };
}

const mockItem = {
  recommendation_id: "rec-uuid-100",
  approval_status: "PENDING",
  status: "PENDING",
  created_at: "2026-09-20T10:00:00.000Z",
  updated_at: "2026-09-20T10:00:00.000Z",
  approved_by: null,
  approved_at: null,
  rejection_reason: null,
  policy_version: null,
  reviewed_at: null,
  user_id: "usr-01",
  role_id: "rol-01",
  action: "dynamodb:DeleteItem",
  resource: "arn:aws:dynamodb:ap-south-1:123456789012:table/MyTable",
  risk_score: 0.90,
  risk_level: "HIGH",
  recommendation: "REMOVE"
};

test("RecommendationRepository.create stores item using PutCommand", async () => {
  let capturedCommand = null;
  const mockDocClient = createMockDocClient(async (command) => {
    capturedCommand = command;
    return {};
  });

  const repository = new RecommendationRepository(mockDocClient, "test-table");
  const result = await repository.create(mockItem);

  assert.equal(result, mockItem);
  assert.ok(capturedCommand instanceof PutCommand);
  assert.equal(capturedCommand.input.TableName, "test-table");
  assert.deepEqual(capturedCommand.input.Item, mockItem);
});

test("RecommendationRepository.create wraps SDK errors into RepositoryError", async () => {
  const mockDocClient = createMockDocClient(async () => {
    throw new Error("DynamoDB service unavailable");
  });

  const repository = new RecommendationRepository(mockDocClient, "test-table");

  await assert.rejects(
    () => repository.create(mockItem),
    (err) => err instanceof RepositoryError && err.message.includes("DynamoDB service unavailable")
  );
});

test("RecommendationRepository.findById fetches item using GetCommand", async () => {
  let capturedCommand = null;
  const mockDocClient = createMockDocClient(async (command) => {
    capturedCommand = command;
    return { Item: mockItem };
  });

  const repository = new RecommendationRepository(mockDocClient, "test-table");
  const result = await repository.findById("rec-uuid-100");

  assert.deepEqual(result, mockItem);
  assert.ok(capturedCommand instanceof GetCommand);
  assert.equal(capturedCommand.input.TableName, "test-table");
  assert.deepEqual(capturedCommand.input.Key, { recommendation_id: "rec-uuid-100" });
});

test("RecommendationRepository.findById returns null if item does not exist", async () => {
  const mockDocClient = createMockDocClient(async () => ({}));

  const repository = new RecommendationRepository(mockDocClient, "test-table");
  const result = await repository.findById("non-existent-id");

  assert.equal(result, null);
});

test("RecommendationRepository.findAll scans table with FilterExpression when filters provided", async () => {
  let capturedCommand = null;
  const mockDocClient = createMockDocClient(async (command) => {
    capturedCommand = command;
    return { Items: [mockItem] };
  });

  const repository = new RecommendationRepository(mockDocClient, "test-table");
  const results = await repository.findAll({
    approval_status: "PENDING",
    recommendation: "REMOVE"
  });

  assert.deepEqual(results, [mockItem]);
  assert.ok(capturedCommand instanceof ScanCommand);
  assert.equal(capturedCommand.input.TableName, "test-table");
  assert.ok(capturedCommand.input.FilterExpression.includes("#approval_status = :approval_status"));
  assert.ok(capturedCommand.input.FilterExpression.includes("#recommendation = :recommendation"));
  assert.equal(capturedCommand.input.ExpressionAttributeValues[":approval_status"], "PENDING");
  assert.equal(capturedCommand.input.ExpressionAttributeValues[":recommendation"], "REMOVE");
});

test("RecommendationRepository.updateApproval uses atomic ConditionExpression", async () => {
  let capturedCommand = null;
  const updatedItem = { ...mockItem, approval_status: "APPROVED", approved_by: "admin@company.com" };

  const mockDocClient = createMockDocClient(async (command) => {
    capturedCommand = command;
    return { Attributes: updatedItem };
  });

  const repository = new RecommendationRepository(mockDocClient, "test-table");
  const result = await repository.updateApproval("rec-uuid-100", {
    approval_status: "APPROVED",
    approved_by: "admin@company.com",
    approved_at: "2026-09-21T12:00:00.000Z",
    rejection_reason: null,
    updated_at: "2026-09-21T12:00:00.000Z"
  });

  assert.deepEqual(result, updatedItem);
  assert.ok(capturedCommand instanceof UpdateCommand);
  assert.equal(capturedCommand.input.ConditionExpression, "attribute_exists(recommendation_id) AND approval_status = :pending_status");
  assert.equal(capturedCommand.input.ExpressionAttributeValues[":pending_status"], "PENDING");
});

test("RecommendationRepository.updateApproval handles ConditionalCheckFailedException correctly", async () => {
  const mockDocClient = createMockDocClient(async (command) => {
    if (command instanceof UpdateCommand) {
      const err = new Error("Conditional check failed");
      err.name = "ConditionalCheckFailedException";
      throw err;
    }
    if (command instanceof GetCommand) {
      return { Item: { ...mockItem, approval_status: "APPROVED" } };
    }
    return {};
  });

  const repository = new RecommendationRepository(mockDocClient, "test-table");

  await assert.rejects(
    () => repository.updateApproval("rec-uuid-100", {
      approval_status: "APPROVED",
      approved_by: "admin@company.com",
      updated_at: "2026-09-21T12:00:00.000Z"
    }),
    (err) => err instanceof ValidationError && err.message.includes("must be PENDING")
  );
});
