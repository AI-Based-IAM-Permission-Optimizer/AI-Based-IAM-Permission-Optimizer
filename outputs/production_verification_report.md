# IAM Permission Model V2 — Production Verification Report

**Date:** 2026-09-24  
**Artifact:** `artifacts/iam_permission_model_v2_final.joblib`  
**Model:** XGBoost  
**Model Version:** `iam_permission_model_v2_final_20260924`

---

## Verification Checklist

| Check | Result |
|---|---|
| Artifact saved successfully | PASS (640.9 KB) |
| Artifact reloads without error | PASS |
| `inference_fn` callable after reload | PASS |
| Output has exactly 14 required columns | PASS |
| `recommendation_id` is unique across all rows | PASS (4,000 / 4,000) |
| `risk_score` is in range [0.0, 1.0] | PASS (0.0003 – 0.9977) |
| `prediction` values in {INTENDED, EXCESSIVE} | PASS |
| `recommendation` values in {KEEP, REVIEW, REMOVE} | PASS |
| `recommendation_id` is stable across retries | PASS |

**All 9 checks passed.**

---

## Output Schema (14 Required Fields)

| Column | Type | Description |
|---|---|---|
| `recommendation_id` | string | Deterministic SHA-256 ID — `REC-<16-char-hex>`. Stable across retries for same (user, role, action, resource). |
| `user_id` | string | IAM user identifier |
| `role_id` | string | IAM role identifier |
| `action` | string | IAM action (e.g. `s3:PutObject`) |
| `resource` | string | ARN of the resource |
| `risk_score` | float [0,1] | Calibrated XGBoost probability of EXCESSIVE |
| `risk_weight` | int | Categorical risk weight from risk catalog |
| `risk_level` | string | LOW / MEDIUM / HIGH / CRITICAL |
| `prediction` | string | INTENDED \| EXCESSIVE (threshold=0.535) |
| `recommendation` | string | KEEP \| REVIEW \| REMOVE |
| `reason_codes` | JSON array | Up to 4 machine-readable flags |
| `explanation` | string | Human-readable justification |
| `model_version` | string | `iam_permission_model_v2_final_20260924` |
| `generated_at` | string | UTC ISO-8601 timestamp |

---

## Test-Set Performance

Evaluated on 4,000 held-out test rows (20% positive rate).  
Threshold: **0.535** (optimised for F1 on validation set).

| Metric | Score |
|---|---|
| PR-AUC | **0.9733** |
| ROC-AUC | **0.9904** |
| Precision (excessive class) | **0.9002** |
| Recall (excessive class) | **0.9250** |
| F1 (excessive class) | **0.9125** |
| Brier Score | **0.0276** |

---

## Recommendation Distribution (Test Set)

| Recommendation | Count | % |
|---|---|---|
| KEEP | 3,090 | 77.2% |
| REVIEW | 187 | 4.7% |
| REMOVE | 723 | 18.1% |

---

## Recommendation Thresholds

| Recommendation | Risk Score Range | Interpretation |
|---|---|---|
| KEEP | 0.00 – 0.40 | Permission appears justified |
| REVIEW | 0.40 – 0.70 | Flagged for administrator review |
| REMOVE | 0.70 – 1.00 | Strong signal of excessive grant; remove after approval |

---

## Reason Codes Reference

| Code | Trigger Condition |
|---|---|
| `ZERO_USAGE` | `usage_count == 0` |
| `VERY_LOW_USAGE` | `usage_count < 3` |
| `INACTIVE_90D` | `days_since_last_use > 90` |
| `INACTIVE_30D` | `days_since_last_use > 30` |
| `HIGH_FAILURE_RATE` | `smoothed_failure_rate > 0.5` |
| `SECURITY_SENSITIVE_ACTION` | `is_security_sensitive == 1` |
| `PERMISSION_CHANGE_ACTION` | `is_permission_change == 1` |
| `DELETE_ACTION` | `is_delete == 1` |
| `WILDCARD_RESOURCE` | `is_wildcard_resource == 1` |
| `HIGH_RISK_WEIGHT` | `risk_weight >= 8` |
| `MEDIUM_RISK_WEIGHT` | `risk_weight >= 5` |
| `MODEL_PATTERN_EXCESSIVE` | Model-only signal, risk_score > 0.7 |
| `LOW_RISK_PROFILE` | No specific flag triggered |

---

## Sample Output

| recommendation_id | user_id | action | risk_score | prediction | recommendation | reason_codes |
|---|---|---|---|---|---|---|
| REC-85581A89F019D410 | synthetic-user-001 | apigateway:TagResource | 0.158 | INTENDED | KEEP | ["INACTIVE_90D"] |
| REC-56B841644384AD1A | synthetic-user-001 | apigateway:GetRestApis | 0.025 | INTENDED | KEEP | ["LOW_RISK_PROFILE"] |
| REC-9FE35EC8D822216D | synthetic-user-001 | ecr:DescribeRepositories | 0.601 | EXCESSIVE | REVIEW | ["VERY_LOW_USAGE", "INACTIVE_90D", "WILDCARD_RESOURCE"] |
| REC-A72A704EE806AA16 | synthetic-user-001 | events:CreateEndpoint | 0.986 | EXCESSIVE | REMOVE | ["INACTIVE_30D", "MEDIUM_RISK_WEIGHT"] |

---

## Policy Constraints (Hard-Coded)

> **The ML model NEVER directly modifies IAM permissions.**  
> All REVIEW and REMOVE recommendations require administrator approval before any IAM policy change is enacted.  
> This is enforced by design — the model output is read-only.

---

## Output Files

| File | Description |
|---|---|
| `artifacts/iam_permission_model_v2_final.joblib` | Final model artifact (640.9 KB) |
| `outputs/final_production_predictions.csv` | 4,000-row test-set inference output |
| `outputs/model_selection.json` | Machine-readable selection record |
| `outputs/final_model_selection.md` | Model selection report |
| `docs/evaluation/overfitting_analysis_report.md` | Overfitting diagnosis and RF fix |
| `docs/evaluation/generalization_test_results.csv` | Unseen-user and unseen-RA results |
| `docs/evaluation/overfitting_gap_analysis.csv` | Train-val gap table |
