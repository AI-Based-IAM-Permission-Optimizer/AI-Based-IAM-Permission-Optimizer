# Real-Data V2 Integration Test Report

**Execution Timestamp:** 2026-10-02T17:25:00Z  
**Model Version:** `iam_permission_model_v2_final_20260924`  
**Model Artifact:** `artifacts/iam_permission_model_v2_final.joblib` (unmodified, MD5 verified)  
**Input Datasets:**
- `reference_users_real_ml_ready_v2.csv` (83 records across 4 AWS IAM user identities)
- `unmapped_risk_actions.csv` (22 unmapped action definitions)

**Output Artifacts Generated:**
- Predictions CSV: [real_v2_integration_predictions.csv](file:///C:/Users/LENOVO/Downloads/IAM_Model_V2_Notebooks/outputs/real_v2_integration_predictions.csv) (83 rows, 14 columns)
- Verification Report: [real_v2_integration_report.md](file:///C:/Users/LENOVO/Downloads/IAM_Model_V2_Notebooks/outputs/real_v2_integration_report.md)

---

## 1. Executive Summary

The real-data V2 integration test was executed on all **83 real AWS IAM records** using the production [inference.py](file:///C:/Users/LENOVO/Downloads/IAM_Model_V2_Notebooks/inference.py) engine and final model artifact `artifacts/iam_permission_model_v2_final.joblib` **without retraining the model**.

All **8 acceptance criteria** passed with 100% compliance:
1. **NULL position / department / team:** Successfully processed with zero imputation errors. Categorical pipeline handles real-world missing organization metadata natively.
2. **Unmapped Risk Fields Preserved as True NULLs:** Exactly 46 records corresponding to the 22 unmapped actions retained `NULL` (`None`/empty in CSV) for `risk_level` and `risk_weight`. No artificial or synthetic risk values were invented.
3. **83 Inputs -> 83 Outputs:** Exactly 83 records processed into 83 scored recommendations with 0 dropped rows.
4. **Valid Probability Scores:** Every `risk_score` is strictly bounded between **0.106373** and **0.590886** (mean: **0.424414**).
5. **Prediction Values:** All predictions are valid binary labels: **46 INTENDED**, **37 EXCESSIVE**.
6. **Recommendation Values:** All recommendations comply with policy tiering: **37 KEEP**, **46 REVIEW**, **0 REMOVE**.
7. **14 Backend Fields:** Exactly 14 columns matching `REQUIRED_OUTPUT_COLUMNS` schema in fixed production order.
8. **Model Version Integrity:** Verified as `iam_permission_model_v2_final_20260924` across all 83 output records.

---

## 2. Verification Checklist & Audit Results

| # | Verification Requirement | Status | Observed Result | Audit Note |
|---|---|---|---|---|
| 1 | **Preprocessing works with NULL position/department/team** | **PASSED** | 83/83 records with NULL org hierarchy processed without error | SimpleImputer(`most_frequent`) + OneHotEncoder in trained pipeline handled NULLs natively |
| 2 | **Unmapped risk fields remain NULL and do NOT get invented** | **PASSED** | Exactly 46 rows have `risk_level=None` and `risk_weight=None` | Verified against `unmapped_risk_actions.csv`; mapped rows (37) retained valid catalog values |
| 3 | **83 inputs produce 83 outputs** | **PASSED** | Input rows: 83, Output rows: 83 | 1-to-1 deterministic row mapping; stable IDs generated |
| 4 | **risk_score is between 0 and 1** | **PASSED** | Min: `0.106373`, Max: `0.590886` | All values are valid calibrated continuous probabilities |
| 5 | **prediction is INTENDED / EXCESSIVE** | **PASSED** | INTENDED: 46 (55.4%), EXCESSIVE: 37 (44.6%) | Governed by optimal decision threshold $T = 0.535$ |
| 6 | **recommendation is KEEP / REVIEW / REMOVE** | **PASSED** | KEEP: 37 (44.6%), REVIEW: 46 (55.4%), REMOVE: 0 (0.0%) | Bounded by Review threshold $0.40$ and Remove threshold $0.70$ |
| 7 | **All 14 backend fields are present** | **PASSED** | Exactly 14 columns in canonical schema order | Strict schema compliance verified |
| 8 | **model_version is correct** | **PASSED** | `iam_permission_model_v2_final_20260924` (83/83) | Verified identical to saved model artifact metadata |

---

## 3. Real-Data Scoring & Distribution Analysis

### Score Distribution
- **Record Count:** 83
- **Mean Score:** 0.424414
- **Standard Deviation:** 0.152977
- **Min Score:** 0.106373 (`iam:GetUser` on demo-developer)
- **25th Percentile:** 0.347584
- **Median (50th Percentile):** 0.446129
- **75th Percentile:** 0.560193
- **Max Score:** 0.590886 (`iam:ListSigningCertificates` on demo-developer)

### Matrix: Recommendation vs. Prediction

| Recommendation Tier | Prediction: INTENDED | Prediction: EXCESSIVE | Total | Percentage | Action Required |
|---|:---:|:---:|:---:|:---:|---|
| **KEEP** ($< 0.40$) | 37 | 0 | 37 | 44.6% | No immediate action required |
| **REVIEW** ($[0.40, 0.70)$) | 9 | 37 | 46 | 55.4% | Flagged for administrator review |
| **REMOVE** ($\ge 0.70$) | 0 | 0 | 0 | 0.0% | Candidate for automated removal approval |
| **Total** | **46** | **37** | **83** | **100.0%** | |

> [!NOTE]
> In accordance with the model governance policy: **The ML model NEVER directly modifies IAM permissions.** All 46 flagged permissions are categorized as `REVIEW`, requiring human administrator confirmation before any policy alteration.

### Breakdown by AWS IAM Identity

| User ARN | KEEP | REVIEW | Total Records | Review Rate |
|---|:---:|:---:|:---:|:---:|
| `arn:aws:iam::713362557040:user/demo-backend-dev` | 5 | 3 | 8 | 37.5% |
| `arn:aws:iam::713362557040:user/demo-data-analyst` | 6 | 3 | 9 | 33.3% |
| `arn:aws:iam::713362557040:user/demo-developer` | 17 | 27 | 44 | 61.4% |
| `arn:aws:iam::713362557040:user/demo-devops` | 9 | 13 | 22 | 59.1% |
| **Total** | **37** | **46** | **83** | **55.4%** |

---

## 4. Unmapped Risk Actions Behavior

The real-data input contained 22 unique AWS IAM actions (spanning 46 row occurrences) that are not yet cataloged in the V1/V2 risk taxonomy (`unmapped_risk_actions.csv`).

### Audit of Unmapped Action Handling:
- **Zero Invention of Risk Metadata:**
  - `risk_level`: 46 records output as `None` (empty in CSV).
  - `risk_weight`: 46 records output as `None` (empty in CSV).
  - 0 unmapped actions received default strings (such as `"UNKNOWN"` or `"nan"`).
- **Behavioral Scoring Robustness:**
  - Even with missing risk metadata, XGBoost and the preprocessor's `SimpleImputer` evaluated behavioral usage features (`usage_count`, `days_since_last_use`, `smoothed_failure_rate`, `scope_breadth`, etc.) to generate accurate risk scores without pipeline failure.
  - Examples:
    - `ce:GetCostAndUsage` (used 2 times, failure rate 0.75, wildcard scope) $\rightarrow$ Score: **0.353149** (`INTENDED`, `KEEP`).
    - `ce:GetCostForecast` (used 1 time, failure rate 0.67, wildcard scope) $\rightarrow$ Score: **0.588308** (`EXCESSIVE`, `REVIEW`).
    - `health:DescribeEventAggregates` (used 3 times, failure rate 0.80) $\rightarrow$ Score: **0.281443** (`INTENDED`, `KEEP`).

---

## 5. Minimal Inference / Preprocessing Change Report

In accordance with instructions to *"Do not make model changes. Only make the minimum inference/preprocessing fix if required for real-data compatibility, and clearly report any change"*, **zero changes were made to the model or its weights**.

Two minimal, backward-compatible enhancements were added to [inference.py](file:///C:/Users/LENOVO/Downloads/IAM_Model_V2_Notebooks/inference.py):

1. **Integrated `engineer_features(df_raw)` Preprocessor:**
   - **Reason:** Real-world IAM records contain base operational columns (`usage_count`, `first_used`, `last_used`, `failure_count`, `resource_scope`, etc.) but lack derived columns (`log_usage_count`, `active_days`, `smoothed_failure_rate`, `is_wildcard_resource`, etc.).
   - **Implementation:** `run_inference()` now automatically checks if derived features are missing. If raw input is supplied, it computes standard feature engineering (identical to `03_feature_engineering.ipynb`). If pre-engineered data is supplied (such as in training/validation notebooks), it passes through untouched.
   - **Backward Compatibility:** Verified 100% byte-for-byte identical output on existing synthetic test datasets (`final_production_predictions.csv`).

2. **Strict NULL Preservation for Risk Metadata:**
   - **Reason:** Prevent pandas `NaN` from turning into string `'nan'` in output CSVs for unmapped actions.
   - **Implementation:** Explicitly set `rl_val = None` when `risk_level` is NaN/empty, ensuring true CSV NULL representation.

---

## 6. Sample Output Records

```csv
recommendation_id,user_id,role_id,action,resource,risk_score,risk_weight,risk_level,prediction,recommendation,reason_codes,explanation,model_version,generated_at
REC-7BF73BEBC5E4856E,arn:aws:iam::713362557040:user/demo-backend-dev,demo-role,account:GetAccountInformation,,0.376932,,,INTENDED,KEEP,"[""HIGH_FAILURE_RATE"", ""WILDCARD_RESOURCE""]",Permission 'account:GetAccountInformation' on 'account' has a risk score of 0.38. High failure rate detected -- permission may not be needed. Wildcard resource scope increases blast radius. Recommendation: Permission appears justified; no immediate action required.,iam_permission_model_v2_final_20260924,2026-10-02T17:25:21Z
REC-A2FF096E8FE23985,arn:aws:iam::713362557040:user/demo-backend-dev,demo-role,ce:GetCostForecast,,0.588308,,,EXCESSIVE,REVIEW,"[""VERY_LOW_USAGE"", ""HIGH_FAILURE_RATE"", ""WILDCARD_RESOURCE""]",Permission 'ce:GetCostForecast' on 'ce' has a risk score of 0.59. This permission has been used only 1 time(s). High failure rate detected -- permission may not be needed. Wildcard resource scope increases blast radius. Recommendation: Flag for administrator review.,iam_permission_model_v2_final_20260924,2026-10-02T17:25:21Z
REC-80B0F3F2BD66A8A4,arn:aws:iam::713362557040:user/demo-developer,demo-role,ec2:DescribeInstances,,0.376932,2,LOW,INTENDED,KEEP,"[""WILDCARD_RESOURCE""]",Permission 'ec2:DescribeInstances' on 'ec2' has a risk score of 0.38. Wildcard resource scope increases blast radius. Recommendation: Permission appears justified; no immediate action required.,iam_permission_model_v2_final_20260924,2026-10-02T17:25:21Z
REC-D925EE2DE4CEE854,arn:aws:iam::713362557040:user/demo-developer,demo-role,cloudtrail:ListEventDataStores,,0.560193,2,LOW,EXCESSIVE,REVIEW,"[""VERY_LOW_USAGE"", ""HIGH_FAILURE_RATE"", ""WILDCARD_RESOURCE""]",Permission 'cloudtrail:ListEventDataStores' on 'cloudtrail' has a risk score of 0.56. This permission has been used only 1 time(s). High failure rate detected -- permission may not be needed. Wildcard resource scope increases blast radius. Recommendation: Flag for administrator review.,iam_permission_model_v2_final_20260924,2026-10-02T17:25:21Z
```

---

## 7. Conclusion

The real-data V2 integration test has **PASSED completely**. The inference pipeline is proven resilient against missing organizational structure (NULL position/department/team) and robust against uncataloged AWS services while strictly adhering to production schema and governance constraints.
