const test = require("node:test");
const assert = require("node:assert/strict");
const { PutCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const RecommendationRepository = require("../src/repositories/recommendation.repository");
const { RepositoryError } = require("../src/utils/errors");

function createMockDocClient(sendImpl) {
  return {
    send: sendImpl || (async () => ({}))
  };
}

const mockItem = {
  recommendation_id: "rec-uuid-100",
  status: "PENDING",
  created_at: "2026-09-20T10:00:00.000Z",
  reviewed_at: null,
  user_id: "usr-01",
  role_id: "rol-01",
  action: "dynamodb:DeleteItem",
  resource: "arn:aws:dynamodb:ap-south-1:123456789012:table/MyTable",
  risk_score: 90,
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
