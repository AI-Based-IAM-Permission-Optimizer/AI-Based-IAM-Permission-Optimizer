# IAM Permission Optimizer Backend

Phase 1 provides the Express application foundation and a health endpoint.

Phase 2 adds a provisional permission-recommendation domain. Its field list is
based on the current backend plan and will be reconciled with Suraj's confirmed
ML-ingestion payload before the real integration is built.

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

## Available API

`GET /api/health`

```json
{
  "status": "ok",
  "service": "iam-permission-optimizer-backend"
}
```

`src/config/aws.js` only defines a future AWS client-creation boundary. Phase 1 does not read or write DynamoDB data and does not use IAM.

## Recommendation domain

`src/domain/recommendation.schema.js` exports:

- `CONFIRMED_PIPELINE_FIELDS`: the 18 field names confirmed by the data/ML pipeline.
- `PENDING_BACKEND_FIELDS`: fields awaiting ML-output, workflow, or DynamoDB-contract confirmation.
- `RECOMMENDATION_FIELDS`: both groups combined as the provisional backend domain.
- `RECOMMENDATION_STATUS`: the current planned vocabulary: `PENDING`, `APPROVED`, and `REJECTED`.

It is not a database schema, API endpoint, validator, ML-ingestion implementation, or IAM-policy workflow.
