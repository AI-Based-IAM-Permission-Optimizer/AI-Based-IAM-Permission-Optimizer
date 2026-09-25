# AI-Based IAM Permission Optimizer — ML Model V2

## Quick Start

Run notebooks in order **01 → 10** to reproduce the full pipeline from raw data to final model.

```
notebooks/
  01_data_understanding.ipynb     # EDA and raw data profiling
  02_data_cleaning.ipynb          # Cleaning, deduplication, type fixes
  03_feature_engineering.ipynb    # Feature creation (usage stats, risk flags)
  04_label_creation.ipynb         # Target labeling + user-group split
  05_weighted_baseline.ipynb      # Heuristic baseline
  06_logistic_regression.ipynb    # LR model + CV
  07_random_forest.ipynb          # RF model + regularized CV
  08_xgboost.ipynb                # XGBoost model + CV (SELECTED)
  09_model_evaluation.ipynb       # Full evaluation, generalization tests
  10_final_model.ipynb            # Final artifact + production bundle
```

**To reproduce from scratch:**
```bash
cd IAM_Model_V2_Notebooks
jupyter nbconvert --to notebook --execute --inplace notebooks/01_data_understanding.ipynb
# repeat for 02 through 10 in order
```

---

## Project Structure

```
IAM_Model_V2_Notebooks/
│
├── README.md                         # This file
├── inference.py                      # Production inference module (use this)
├── diagnostic.py                     # Deep model diagnostic (leakage, robustness)
├── verify_all.py                     # End-to-end system verification
│
├── data/
│   ├── raw/
│   │   ├── ml_ready_synthetic.csv              # Raw input (synthetic IAM logs)
│   │   └── AWS_Risk_Weight_Table_FINAL_4007_Actions_Shuffled.csv
│   ├── cleaned_dataset.csv                     # Output of notebook 02
│   ├── engineered_dataset.csv                  # Output of notebook 03
│   ├── labeled_dataset.csv                     # Output of notebook 04 (with target + split)
│   └── splits.csv                              # Persistent user-group train/val/test split
│
├── notebooks/
│   ├── 01_data_understanding.ipynb
│   ├── 02_data_cleaning.ipynb
│   ├── 03_feature_engineering.ipynb
│   ├── 04_label_creation.ipynb
│   ├── 05_weighted_baseline.ipynb
│   ├── 06_logistic_regression.ipynb
│   ├── 07_random_forest.ipynb
│   ├── 08_xgboost.ipynb
│   ├── 09_model_evaluation.ipynb
│   └── 10_final_model.ipynb
│
├── artifacts/
│   ├── iam_permission_model_v2_final.joblib    # FINAL MODEL (load this)
│   ├── iam_permission_model_v2_metadata.json   # Human-readable model metadata
│   ├── xgboost_candidate.joblib                # XGBoost candidate (used in final)
│   ├── random_forest_candidate.joblib          # RF candidate (regularized)
│   ├── logistic_regression_candidate.joblib    # LR candidate
│   ├── weighted_baseline.joblib                # Heuristic baseline
│   └── split_metadata.json                     # Split reproducibility info
│
├── outputs/
│   ├── final_production_predictions.csv        # FINAL ML OUTPUT (14-column schema)
│   ├── final_model_selection.md                # Model selection report (8 criteria)
│   ├── model_selection.json                    # Machine-readable selection record
│   ├── final_leakage_audit.md                  # Full leakage audit report
│   ├── overfitting_analysis_report.md          # Overfitting diagnosis + RF fix
│   ├── overfitting_gap_analysis.csv            # Train-val gaps: LR / RF / XGBoost
│   ├── generalization_test_results.csv         # Unseen-user + unseen-RA results
│   ├── model_validation_comparison.csv         # Side-by-side model metrics
│   ├── production_verification_report.md       # Final artifact verification
│   ├── final_cleanup_verification.json         # Latest full pipeline check
│   ├── data_understanding_summary.json         # EDA summary
│   ├── final_threshold_table.csv               # Threshold sensitivity analysis
│   ├── selected_model_permutation_importance.csv
│   ├── selected_model_thresholds_validation.csv
│   ├── validation_error_analysis.csv
│   └── weighted_baseline_thresholds.csv
│
└── docs/
    └── ML_Model_and_Output_Documentation_v2.md  # Full backend/frontend contract
```

---

## Backend Integration (Quick Reference)

```python
# In your backend (Python)
import sys
sys.path.insert(0, "/path/to/IAM_Model_V2_Notebooks")
from inference import load_model, run_inference
import pandas as pd

model = load_model()   # loads once, reuse across requests

# df must contain the 22 feature columns + user_id, role_id, action, resource
df = pd.DataFrame([{...}])      # one or many IAM permission records
results = run_inference(df, model)

# results is a DataFrame with exactly 14 columns:
# recommendation_id | user_id | role_id | action | resource |
# risk_score | risk_weight | risk_level | prediction | recommendation |
# reason_codes | explanation | model_version | generated_at
```

**Required feature columns (22):**
```
usage_count, log_usage_count, unique_days_used, log_unique_days_used,
days_since_last_use, active_days, usage_frequency, success_rate,
smoothed_failure_rate, risk_weight, scope_breadth, is_wildcard_resource,
is_delete, is_permission_change, is_security_sensitive,
service, operation_type, risk_level, action_family, position,
department, team
```

---

## Output Contract

| Field | Type | Values |
|---|---|---|
| `recommendation_id` | string | `REC-<16-hex>` — stable across retries |
| `user_id` | string | IAM user ID |
| `role_id` | string | IAM role ID |
| `action` | string | IAM action (e.g. `s3:PutObject`) |
| `resource` | string | ARN of the resource |
| `risk_score` | float [0,1] | Calibrated XGBoost probability of EXCESSIVE |
| `risk_weight` | int | Categorical risk weight (from AWS risk catalog) |
| `risk_level` | string | LOW / MEDIUM / HIGH / CRITICAL |
| `prediction` | string | `INTENDED` or `EXCESSIVE` |
| `recommendation` | string | `KEEP` / `REVIEW` / `REMOVE` |
| `reason_codes` | JSON array string | Up to 4 machine-readable flags |
| `explanation` | string | Human-readable justification |
| `model_version` | string | `iam_permission_model_v2_final_20260924` |
| `generated_at` | string | UTC ISO-8601 timestamp |

**Recommendation thresholds:**
- `KEEP`:   risk_score < 0.40
- `REVIEW`: 0.40 ≤ risk_score < 0.70
- `REMOVE`: risk_score ≥ 0.70

> **IMPORTANT**: The ML model NEVER modifies IAM permissions directly.
> Administrator approval is required for all REVIEW and REMOVE actions.

---

## Model Performance

| Metric | Score |
|---|---|
| Val PR-AUC | **0.978** |
| Test PR-AUC | **0.973** |
| Test ROC-AUC | **0.990** |
| Test Precision | **0.900** |
| Test Recall | **0.925** |
| Test F1 | **0.913** |
| Brier Score | **0.028** |
| Unseen-user PR-AUC | **0.973** |
| Unseen role-action PR-AUC | **0.987** |
| Train-val gap (PR-AUC) | **+0.020** ✅ |

---

## Key Design Decisions

1. **User-group split**: all rows for a given `user_id` go into exactly one split. No user leakage.
2. **No identity features**: `user_id`, `role_id`, exact `resource` ARN, and exact `action` string are excluded from model features. Only structural/behavioral metadata is used.
3. **22 feature columns**: usage statistics, temporal features, risk flags, and categorical role/team/service metadata.
4. **Threshold 0.535**: calibrated on validation set for maximum F1, not hard-coded to 0.5.
5. **No calibration layer needed**: XGBoost with `scale_pos_weight` produces well-calibrated probabilities (Brier = 0.028).

---

## Methodology Notes (from leakage audit)

- No `usage_count`-only leakage: `usage_count` alone achieves ROC-AUC 0.77 vs model's 0.99
- No target column or derived columns from target in feature set
- No future information (timestamps handled correctly)
- 5-fold user-group GroupKFold used for all CV
- Preprocessing fitted only on train fold in each CV iteration
