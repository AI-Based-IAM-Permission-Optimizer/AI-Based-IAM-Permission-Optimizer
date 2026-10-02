# ML-to-Backend Integration Documentation

## 1. System Architecture
CloudTrail → S3 → Parser Lambda → Processed data → ML inference → Recommendation CSV → Backend API → DynamoDB → Recommendation retrieval and human approval

## 2. ML-to-Backend Data Flow
The ML pipeline produces predictions offline and saves them as "final_production_predictions.csv". The Python ingestion script ("send_recommendations.py") parses this CSV, validates the content against the backend contract, packages the records into batches of up to 100, and sends them via HTTP POST to the backend API Gateway.

## 3. Final 14-field Contract
1. recommendation_id (String)
2. user_id (String)
3. role_id (String, must be one of 20 predefined roles)
4. action (String)
5. resource (String)
6. risk_score (Numeric, 0.0 to 1.0)
7. risk_weight (Numeric)
8. risk_level (String)
9. prediction (String: INTENDED or EXCESSIVE)
10. recommendation (String: KEEP, REVIEW, or REMOVE)
11. reason_codes (Array of Strings)
12. explanation (String)
13. model_version (String)
14. generated_at (String ISO 8601)

## 4. CSV Structure
The CSV has headers exactly matching the 14-field contract (except reason_codes which may be JSON strings).

## 5. Data Transformation Rules
- reason_codes: Parsed from JSON string/literal to Python lists.
- risk_score and risk_weight: Cast to numeric floats/ints.

## 6. Validation Rules
The python script rigorously validates all rows against required fields, valid role enums, numeric ranges, and duplicate IDs.

## 7. Batch-Ingestion Process
- Script chunks records in batches of max 100.
- Serialized JSON payload size is strictly checked against the 1MB Express backend limit.
- Batches are sent synchronously.

## 8. API Endpoints
- POST /api/v1/recommendations: Ingest batches.
- GET /api/v1/recommendations: List recommendations.
- GET /api/v1/recommendations/:id: Retrieve single recommendation.
- GET /api/v1/policies/:user_id: Fetch synthesized policy for user.

## 9. Environment Variables
- PORT
- NODE_ENV
- AWS_REGION
- DYNAMODB_TABLE_NAME
- RECOMMENDATIONS_API_URL

## 10. Local Test Commands
python -m unittest test_send_recommendations.py

## 11. Dry-Run Commands
python send_recommendations.py --all --dry-run

## 12. Live-Ingestion Procedure and Approval Gates
Do not perform live ingestion without approval.
1. Test with 3 records: python send_recommendations.py --limit 3 --send
2. Once verified, run: python send_recommendations.py --all --send

## 13. Error Handling and Troubleshooting
- ValueError for payload size > 1MB or contract breaches.
- 4xx/5xx HTTP responses logged directly in standard output.

## 14. AWS Resources Used
- API Gateway (HTTP API)
- Lambda (ai-iam-permission-backend)
- DynamoDB (iam-permission-recommendations)

## 15. Permissions Required
- dynamodb:PutItem, dynamodb:GetItem, dynamodb:Query, dynamodb:Scan, dynamodb:UpdateItem for the Backend Lambda.

## 16. Security Considerations
- CORS restricts access to explicit frontend origin.
- Payloads limited to 1MB to prevent memory exhaustion.
- Idempotency via recommendation_id prevents duplicate data pollution.

## 17. Known Limitations
- The python script is synchronous and blocks until each batch resolves. 

## 18. Current Implementation Status
- The ingestion script fully supports chunking 4,000 records.
- Backend API is deployed and correctly integrated with DynamoDB.

## 19. Remaining Tasks
- Live ingestion of the final 4,000 records.

## 20. Instructions for Frontend Team
Frontend should interact with GET /api/v1/recommendations for list views, providing pagination via next_token. Approval and Rejection actions should hit the respective PATCH endpoints. Policy extraction is available via GET /api/v1/policies/:user_id.