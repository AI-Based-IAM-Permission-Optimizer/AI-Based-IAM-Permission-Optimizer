const { PutCommand, GetCommand, ScanCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { getTableName } = require("../config/aws");
const { RepositoryError, NotFoundError, ValidationError } = require("../utils/errors");

class RecommendationRepository {
  /**
   * @param {import("@aws-sdk/lib-dynamodb").DynamoDBDocumentClient} docClient - Configured DynamoDB document client.
   * @param {string} [tableName] - Optional table name override.
   */
  constructor(docClient, tableName) {
    if (!docClient) {
      throw new Error("RecommendationRepository requires a valid DynamoDB DocumentClient instance.");
    }
    this.docClient = docClient;
    this.tableName = tableName || getTableName();
  }

  /**
   * Persists a recommendation item into DynamoDB.
   *
   * @param {Object} recommendation - Validated recommendation entity.
   * @returns {Promise<Object>} The persisted recommendation item.
   */
  async create(recommendation) {
    if (!recommendation || !recommendation.recommendation_id) {
      throw new RepositoryError("Cannot persist recommendation without a valid recommendation_id.");
    }

    const params = {
      TableName: this.tableName,
      Item: recommendation
    };

    try {
      await this.docClient.send(new PutCommand(params));
      return recommendation;
    } catch (error) {
      throw new RepositoryError(
        `Failed to persist recommendation into DynamoDB table '${this.tableName}': ${error.message}`,
        error
      );
    }
  }

  /**
   * Retrieves a recommendation item by its recommendation_id.
   *
   * @param {string} recommendationId - Unique recommendation ID.
   * @returns {Promise<Object|null>} The item if found, or null if not found.
   */
  async findById(recommendationId) {
    if (!recommendationId || typeof recommendationId !== "string") {
      throw new RepositoryError("Recommendation ID must be a non-empty string.");
    }

    const params = {
      TableName: this.tableName,
      Key: {
        recommendation_id: recommendationId
      }
    };

    try {
      const response = await this.docClient.send(new GetCommand(params));
      return response.Item || null;
    } catch (error) {
      throw new RepositoryError(
        `Failed to retrieve recommendation '${recommendationId}' from DynamoDB: ${error.message}`,
        error
      );
    }
  }

  /**
   * Retrieves recommendations with optional simple FilterExpression support.
   *
   * @param {Object} [filters] - Supported filters: approval_status, recommendation, user_id, role_id.
   * @returns {Promise<Array<Object>>} List of matching recommendation items.
   */
  async findAll(filters = {}) {
    const filterExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    const allowedKeys = ["approval_status", "recommendation", "user_id", "role_id"];

    for (const key of allowedKeys) {
      if (filters[key] !== undefined && filters[key] !== null && String(filters[key]).trim() !== "") {
        const attrKey = `#${key}`;
        const valKey = `:${key}`;

        expressionAttributeNames[attrKey] = key;
        expressionAttributeValues[valKey] = String(filters[key]).trim();
        filterExpressions.push(`${attrKey} = ${valKey}`);
      }
    }

    const params = {
      TableName: this.tableName
    };

    if (filterExpressions.length > 0) {
      params.FilterExpression = filterExpressions.join(" AND ");
      params.ExpressionAttributeNames = expressionAttributeNames;
      params.ExpressionAttributeValues = expressionAttributeValues;
    }

    try {
      const response = await this.docClient.send(new ScanCommand(params));
      return response.Items || [];
    } catch (error) {
      throw new RepositoryError(
        `Failed to scan recommendations from DynamoDB table '${this.tableName}': ${error.message}`,
        error
      );
    }
  }

  /**
   * Atomically updates a PENDING recommendation to APPROVED or REJECTED using a DynamoDB ConditionExpression.
   *
   * @param {string} recommendationId - Unique recommendation ID.
   * @param {Object} updateData - Finalized approval fields to update.
   * @returns {Promise<Object>} Updated recommendation item.
   */
  async updateApproval(recommendationId, updateData) {
    if (!recommendationId || typeof recommendationId !== "string" || recommendationId.trim() === "") {
      throw new RepositoryError("Recommendation ID must be a non-empty string.");
    }

    const { approval_status, approved_by, approved_at, rejection_reason, updated_at } = updateData;

    const params = {
      TableName: this.tableName,
      Key: { recommendation_id: recommendationId.trim() },
      ConditionExpression: "attribute_exists(recommendation_id) AND approval_status = :pending_status",
      UpdateExpression: "SET approval_status = :approval_status, approved_by = :approved_by, approved_at = :approved_at, rejection_reason = :rejection_reason, updated_at = :updated_at",
      ExpressionAttributeValues: {
        ":pending_status": "PENDING",
        ":approval_status": approval_status,
        ":approved_by": approved_by !== undefined ? approved_by : null,
        ":approved_at": approved_at !== undefined ? approved_at : null,
        ":rejection_reason": rejection_reason !== undefined ? rejection_reason : null,
        ":updated_at": updated_at
      },
      ReturnValues: "ALL_NEW"
    };

    try {
      const response = await this.docClient.send(new UpdateCommand(params));
      return response.Attributes;
    } catch (error) {
      if (error.name === "ConditionalCheckFailedException" || error.code === "ConditionalCheckFailedException") {
        const existing = await this.findById(recommendationId.trim());
        if (!existing) {
          throw new NotFoundError(`Recommendation with ID '${recommendationId}' was not found.`);
        }
        throw new ValidationError(
          `Cannot update recommendation '${recommendationId}' because its current approval_status is '${existing.approval_status}' (must be PENDING).`
        );
      }
      if (error instanceof NotFoundError || error instanceof ValidationError) {
        throw error;
      }
      throw new RepositoryError(
        `Failed to update recommendation '${recommendationId}' in DynamoDB: ${error.message}`,
        error
      );
    }
  }
}

module.exports = RecommendationRepository;
