const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");

function createAwsClients() {
  const region = process.env.AWS_REGION;

  if (!region) {
    throw new Error("AWS_REGION must be configured before creating AWS clients.");
  }

  return {
    dynamoDbClient: new DynamoDBClient({ region })
  };
}

module.exports = { createAwsClients };
