# AI-Based IAM Permission Optimizer — Data Engineer Handoff

## Overview

This project analyzes AWS CloudTrail activity to identify excessive or unused IAM permissions, using engineered usage features and risk scoring to prepare data for ML-based permission optimization.

---

## Completed Work

### 1. CloudTrail → S3

- CloudTrail trail: `iam-permission-optimizer-trail`
- Region: `ap-south-1`
- CloudTrail logs are delivered to the project S3 bucket.
- Real CloudTrail `.json.gz` logs were verified.

### 2. CloudTrail Parser

File: `lambdas/parser/parser.py`

The parser extracts:

- `user_id`
- `action`
- `resource`
- `timestamp`
- `success`

It was tested with both a sample event and a real CloudTrail event.

### 3. Feature Engineering

File: `lambdas/parser/features.py`

Base features:

- `id`
- `user_id`
- `role_id`
- `action`
- `resource`
- `resource_scope`
- `usage_count`
- `unique_days_used`
- `days_since_last_use`
- `first_used`
- `last_used`
- `success_count`
- `failure_count`
- `success_rate`
- `failure_rate`
- `permission_status`

### 4. Synthetic ML Dataset

File: `data/processed/ml_ready_synthetic.csv`

Dataset:

- Records: 19,998
- Columns: 19
- Missing values: 0
- Users: 24
- Roles: 12
- Actions: 200

The dataset contains diverse user-role-action combinations, including overlapping actions across different roles with role-dependent `INTENDED` and `EXCESSIVE` classifications.

Usage features such as usage count, unique days used, recency, and success/failure rates contain varied values for ML training.

The original four demo roles and their permission classifications provided by Hitesh have been preserved.

### 5. Risk Information

The Hitesh risk table was joined using the `action` field.

Added fields:

- `operation_type`
- `risk_level`
- `risk_weight`

The risk weights are project-defined values and are used as part of the project's risk-scoring process.

### 6. Lambda

Files:

- `lambdas/parser/handler.py`
- `lambdas/parser/parser.py`
- `lambdas/parser/features.py`

A Lambda deployment ZIP has been prepared.

---

## Validation

The updated dataset was validated for:

- 24 unique synthetic users
- 12 unique roles
- 200 unique AWS actions
- 19,998 ML-ready records
- 0 missing values
- 174 actions appearing with both `INTENDED` and `EXCESSIVE` classifications
- Variation in usage count
- Variation in unique days used
- Variation in days since last use
- Variation in success and failure rates

---

## Pending / Blockers

- AWS Lambda deployment
- S3 → Lambda trigger configuration
- End-to-end AWS Lambda testing

These steps require the required AWS IAM/deployment permissions.

---

## ML Handoff

Primary file for Suraj:

`data/processed/ml_ready_synthetic.csv`

The final dataset contains:

- Usage-based features
- User and role information
- Role-dependent permission status
- AWS operation type
- Project-defined risk level
- Project-defined risk weight

The dataset is prepared as the input for the ML/risk-scoring stage.

### Reference

Hitesh's IAM/CloudTrail handoff contains the original demo users, roles, permission classifications, and risk information used as the reference for the dataset.

---