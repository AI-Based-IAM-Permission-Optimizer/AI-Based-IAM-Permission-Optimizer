const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");

/**
 * Creates AWS SDK v3 client instances.
 *
 * @param {Object} [overrideConfig] - Optional client configuration overrides (e.g. for testing or local endpoints).
 * @returns {{ dynamoDbClient: DynamoDBClient, docClient: DynamoDBDocumentClient }}
 */
function createAwsClients(overrideConfig = {}) {
  const region = overrideConfig.region || process.env.AWS_REGION || "ap-south-1";

  const clientConfig = {
    region,
    ...overrideConfig
  };

  const dynamoDbClient = new DynamoDBClient(clientConfig);

  const docClient = DynamoDBDocumentClient.from(dynamoDbClient, {
    marshallOptions: {
      removeUndefinedValues: true,
      convertEmptyValues: false
    }
  });

  return {
    dynamoDbClient,
    docClient
  };
}

/**
 * Gets the configured DynamoDB table name for recommendations.
 *
 * @returns {string} Table name
 */
function getTableName() {
  return process.env.DYNAMODB_TABLE_NAME || "iam-permission-recommendations";
}

module.exports = {
  createAwsClients,
  getTableName
};
