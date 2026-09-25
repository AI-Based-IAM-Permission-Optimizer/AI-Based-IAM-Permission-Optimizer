# Overfitting Analysis Report — IAM Model V2

**Date:** 2026-09-24  
**Models:** Logistic Regression, Random Forest, XGBoost  
**Metric threshold for overfitting flag:** Train–Val gap > 0.05 on any of PR-AUC / ROC-AUC / F1

---

## 1. Final Results (After Fix)

| Model | Train PR-AUC | Val PR-AUC | Gap | Train ROC | Val ROC | Gap | Train F1 | Val F1 | Gap | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| Logistic Regression | 0.5807 | 0.5906 | −0.010 | 0.8280 | 0.8407 | −0.013 | 0.5508 | 0.5647 | −0.014 | OK |
| Random Forest | 0.7350 | 0.6873 | +0.048 | 0.8946 | 0.8576 | +0.037 | 0.6204 | 0.5814 | +0.039 | OK |
| XGBoost | 0.9982 | 0.9784 | +0.020 | 0.9996 | 0.9920 | +0.008 | 0.9720 | 0.9301 | +0.042 | OK |

All three models now pass the overfitting check (all gaps < 0.05).

---

## 2. Original Diagnosis (Before Fix)

| Model | Train PR-AUC | Val PR-AUC | Gap | Verdict |
|---|---|---|---|---|
| Logistic Regression | 0.5807 | 0.5906 | −0.010 | OK |
| Random Forest | 0.8290 | 0.7153 | +0.114 | OVERFIT |
| XGBoost | 0.9982 | 0.9784 | +0.020 | OK |

Root cause (Random Forest): Original search space allowed max_depth up to 20, min_samples_leaf=2, no ccp_alpha. This produced trees with avg 312 leaves each — the model memorised the training set.

---

## 3. XGBoost Complexity Verification

| Parameter | Value |
|---|---|
| n_estimators | 366 |
| max_depth | 5 |
| learning_rate | 0.113 |
| subsample | 0.7 |
| colsample_bytree | 0.9 |
| min_child_weight | 5 |
| reg_lambda | 1.04 |
| Avg leaves/tree | 16.6 (52% of theoretical max for depth=5) |
| Total leaf nodes | 6,078 |

Verdict: XGBoost is NOT excessively complex. Trees are half-grown on average. The near-perfect train score is expected for boosting with high-signal synthetic features; the small validation drop (+0.020) is within normal bounds.

---

## 4. Fix Applied — Random Forest

### Original vs Updated hyperparameters

| Parameter | Before | After |
|---|---|---|
| max_depth | 12 | 10 |
| min_samples_leaf | 3 | 5 |
| min_samples_split | 6 | 10 |
| max_features | 0.5 | 0.5 |
| ccp_alpha | 0.000 | 0.0005 |
| n_estimators | 514 | 400 |
| Avg leaves/tree | 312 | 93 |

The ccp_alpha (cost-complexity pruning) parameter was the decisive lever. It eliminates weak internal splits and directly controls tree complexity. Average leaves per tree dropped from 312 to 93 (-70%).

### Updated search space in 07_random_forest.ipynb

```python
param_space = {
    "model__n_estimators": randint(250, 450),
    "model__max_depth": randint(8, 14),
    "model__min_samples_split": randint(6, 16),
    "model__min_samples_leaf": randint(3, 8),
    "model__max_features": ["sqrt", 0.4, 0.5],
    "model__ccp_alpha": uniform(0.0001, 0.0006)
}
```

---

## 5. Exploration Summary

| max_depth | min_leaf | ccp_alpha | Val PR-AUC | Gap | Status |
|---|---|---|---|---|---|
| 12 | 3 | 0.000 | 0.7153 | +0.114 | Original (OVERFIT) |
| 12 | 5 | 0.000 | 0.7053 | +0.106 | OVERFIT |
| 11 | 5 | 0.000 | 0.6954 | +0.076 | OVERFIT |
| 11 | 5 | 0.0004 | 0.6969 | +0.066 | OVERFIT |
| 10 | 5 | 0.0003 | 0.6848 | +0.065 | OVERFIT |
| 10 | 6 | 0.0004 | 0.6831 | +0.054 | OVERFIT |
| 9  | 6 | 0.0003 | 0.6589 | +0.053 | OVERFIT |
| 10 | 5 | 0.0005 | 0.6873 | +0.048 | **SELECTED (OK)** |
| 9  | 6 | 0.0005 | 0.6639 | +0.039 | OK (lower val) |

The selected config achieves the highest validation PR-AUC among all gap-clean configs.

---

## 6. Files Updated

| File | Change |
|---|---|
| notebooks/07_random_forest.ipynb | Cells 2 and 3 updated with regularized config |
| artifacts/random_forest_candidate.joblib | Rebuilt with final regularized RF |
| outputs/overfitting_gap_analysis.csv | Updated with all three models' final gaps |

---

## 7. Impact on Model Selection

XGBoost remains the selected champion (Val PR-AUC 0.978 vs RF 0.687). The RF fix ensures Random Forest is a valid challenger without a misleading inflated CV score.
