# IAM Permission Optimizer Backend

Phase 1 provides the Express application foundation and a health endpoint.

Phase 2 adds a provisional permission-recommendation domain.

Phase 3 implements DynamoDB persistence with clean layered architecture:
- `src/domain/recommendation.entity.js`: Domain validation & factory (`recommendation_id` UUID generation, `created_at` timestamp, `status` defaulting to `PENDING`).
- `src/repositories/recommendation.repository.js`: DynamoDB repository interface (`create`, `findById`) using `@aws-sdk/lib-dynamodb`.
- `src/services/recommendation.service.js`: Domain service layer orchestrating domain validation and repository persistence.
- `src/config/aws.js`: Configures `DynamoDBClient` and `DynamoDBDocumentClient` targeting `iam-permission-recommendations` table.

Phase 4 adds controlled mock recommendation dataset:
- `src/data/mockRecommendations.js`: Provides valid mock records covering `KEEP`, `REVIEW`, and `REMOVE` decisions using the finalized 21-field ML contract (`model_version: "iam-risk-v1"`), plus seeding utility functions.


## Setup

1. Copy `.env.example` to `.env`.
2. Update values for your local environment. Never commit `.env`.
3. Install dependencies with `pnpm install`.

## Run

```bash
pnpm run dev
```

## Test

```bash
pnpm test
```

Phase 5 implements Recommendation Retrieval REST APIs:
- `GET /api/v1/recommendations`: List recommendations with optional query filters (`approval_status`, `recommendation`, `user_id`, `role_id`).
- `GET /api/v1/recommendations/:id`: Get single recommendation by `recommendation_id`.

## Available API

`GET /api/health`

```json
{
  "status": "ok",
  "service": "iam-permission-optimizer-backend"
}
```

`GET /api/v1/recommendations`
`GET /api/v1/recommendations/:id`


## Recommendation domain

`src/domain/recommendation.schema.js` exports:

- `CONFIRMED_PIPELINE_FIELDS`: the 18 field names confirmed by the data/ML pipeline.
- `PENDING_BACKEND_FIELDS`: fields awaiting ML-output, workflow, or DynamoDB-contract confirmation.
- `RECOMMENDATION_FIELDS`: both groups combined as the provisional backend domain.
- `RECOMMENDATION_STATUS`: planned workflow vocabulary (`PENDING`, `APPROVED`, `REJECTED`).
- `RECOMMENDATION_VALUES`: decision values (`KEEP`, `REVIEW`, `REMOVE`).

