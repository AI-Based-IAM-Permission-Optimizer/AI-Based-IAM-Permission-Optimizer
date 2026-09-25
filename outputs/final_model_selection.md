# Final Model Selection Report — IAM Model V2

**Date:** 2026-09-24  
**Task:** Select the champion model for IAM permission excessive-grant detection  
**Candidates:** Logistic Regression, Random Forest, XGBoost

---

## Decision

> **Selected Model: XGBoost**  
> Artifact: `artifacts/xgboost_candidate.joblib`  
> Optimal threshold: **0.535**

XGBoost wins on every primary criterion — PR-AUC, precision, recall, F1, calibration, unseen-user generalization, and unseen role-action generalization — while maintaining a clean train-validation gap. The selection is supported by evidence across all eight criteria, not accuracy alone.

---

## 1. PR-AUC (Primary Metric)

PR-AUC measures ranking quality under class imbalance (20% positive rate). It is the most reliable single metric for this task.

| Model | Val PR-AUC | CV PR-AUC |
|---|---|---|
| **XGBoost** | **0.9784** | **0.9359** |
| Random Forest | 0.6873 | 0.6708 |
| Logistic Regression | 0.5906 | 0.5531 |

**Winner: XGBoost** (+0.291 over RF, +0.388 over LR)

---

## 2. Excessive-Class Precision

Precision on the excessive (positive) class — fraction of flagged grants that are truly excessive.

| Model | Precision |
|---|---|
| **XGBoost** | **0.922** |
| Random Forest | 0.599 |
| Logistic Regression | 0.564 |

**Winner: XGBoost** — Low false-alarm rate. LR and RF would flag too many valid grants.

---

## 3. Excessive-Class Recall

Recall on the excessive class — fraction of actual excessive grants that are caught.

| Model | Recall |
|---|---|
| **XGBoost** | **0.945** |
| Logistic Regression | 0.625 |
| Random Forest | 0.623 |

**Winner: XGBoost** — Catches 94.5% of excessive grants. RF and LR miss ~38% of cases.

---

## 4. F1 Score (Excessive Class)

Harmonic mean of precision and recall at the optimal threshold.

| Model | F1 | Optimal Threshold |
|---|---|---|
| **XGBoost** | **0.933** | 0.535 |
| Random Forest | 0.610 | 0.625 |
| Logistic Regression | 0.593 | 0.649 |

**Winner: XGBoost** — F1 of 0.93 vs 0.61 for RF. The 32-point gap is decisive.

---

## 5. Calibration — Brier Score

Brier score measures probabilistic calibration (lower = better). Good calibration enables reliable thresholding and risk scoring.

| Model | Brier Score |
|---|---|
| **XGBoost** | **0.028** |
| Random Forest | 0.145 |
| Logistic Regression | 0.164 |

**Winner: XGBoost** — 5.2x better calibrated than RF. XGBoost probabilities can be directly used as risk scores.

---

## 6. Unseen-User Performance

Evaluated on test users not seen during training (all 4,000 test rows; users are split by user_id). This tests whether the model generalizes to new employees/accounts.

| Model | PR-AUC | ROC-AUC | F1 |
|---|---|---|---|
| **XGBoost** | **0.973** | **0.990** | **0.913** |
| Random Forest | 0.673 | 0.853 | 0.596 |
| Logistic Regression | 0.589 | 0.829 | 0.568 |

**Winner: XGBoost** — Val→Unseen-User PR-AUC drop: −0.005 (negligible). The model generalizes cleanly to new users.

---

## 7. Unseen Role-Action Performance

Evaluated on (role_id, action) combinations not seen during training (2,123 rows, 36.3% positive rate).

| Model | PR-AUC | ROC-AUC | F1 |
|---|---|---|---|
| **XGBoost** | **0.984** | **0.989** | **0.938** |
| Random Forest | 0.798 | 0.854 | 0.682 |
| Logistic Regression | 0.738 | 0.824 | 0.661 |

**Winner: XGBoost** — PR-AUC 0.984 on unseen role-action pairs, actually *higher* than its validation score (0.978). The model is driven by `service`, `department`, `position`, and usage features — not memorised (role, action) lookup patterns.

---

## 8. Train-Validation Gap

The gap measures overfitting. All models have been verified to be within bounds after Random Forest was regularized.

| Model | Train PR-AUC | Val PR-AUC | Gap | Train F1 | Val F1 | Gap |
|---|---|---|---|---|---|---|
| Logistic Regression | 0.5807 | 0.5906 | −0.010 | 0.5508 | 0.5647 | −0.014 |
| Random Forest | 0.7350 | 0.6873 | +0.048 | 0.6204 | 0.5814 | +0.039 |
| XGBoost | 0.9982 | 0.9784 | +0.020 | 0.9720 | 0.9301 | +0.042 |

All gaps are < 0.05. XGBoost's near-perfect training score is expected for gradient boosting on high-signal synthetic features — the small gap confirms it is not simply memorising.

**XGBoost complexity check:** `max_depth=5`, avg 16.6 leaves/tree (52% of theoretical max). Trees are not over-grown; `min_child_weight=5` and `reg_lambda=1.04` are working.

---

## Full Comparison Table

| Criterion | Logistic Regression | Random Forest | XGBoost | Winner |
|---|---|---|---|---|
| Val PR-AUC | 0.591 | 0.687 | **0.978** | XGBoost |
| Val ROC-AUC | 0.841 | 0.858 | **0.992** | XGBoost |
| Val Precision | 0.564 | 0.599 | **0.922** | XGBoost |
| Val Recall | 0.625 | 0.623 | **0.945** | XGBoost |
| Val F1 | 0.593 | 0.610 | **0.933** | XGBoost |
| Brier Score ↓ | 0.164 | 0.145 | **0.028** | XGBoost |
| Unseen-User PR-AUC | 0.589 | 0.673 | **0.973** | XGBoost |
| Unseen-RA PR-AUC | 0.738 | 0.798 | **0.984** | XGBoost |
| Train-Val Gap | −0.010 | +0.048 | +0.020 | LR (trivially; all OK) |

**XGBoost wins 8 of 9 criteria.** The one criterion where LR has a smaller gap is trivially explained by underfitting — a near-zero gap on poor metrics is not an advantage.

---

## Why Not Random Forest?

- Val PR-AUC 0.687 vs XGBoost 0.978 — a **29 percentage point** deficit
- Brier score 0.145 — poorly calibrated; probabilities cannot be used as reliable risk scores
- Precision 0.599 — would generate high false-alarm rates in production
- Unseen-user F1 0.596 — roughly random performance on new entities

After regularization RF is no longer overfit, but it was never competitive in raw predictive power.

## Why Not Logistic Regression?

- Val PR-AUC 0.591 — near-baseline for this task (a random classifier at 20% positive rate scores ~0.20, naive baseline ~0.40)
- Linear boundary cannot capture the complex interactions between `service`, `usage_count`, `department`, and `risk_weight`
- Useful only as a sanity-check baseline; not suitable for production IAM enforcement

---

## Final Configuration

```
Model:              XGBoost (XGBClassifier)
Artifact:           artifacts/xgboost_candidate.joblib
Threshold:          0.535 (optimised for F1 on validation set)
n_estimators:       366
max_depth:          5
learning_rate:      0.113
subsample:          0.70
colsample_bytree:   0.90
min_child_weight:   5
reg_lambda:         1.04
scale_pos_weight:   (class-imbalance weighted)
```

---

## Output Files

| File | Description |
|---|---|
| `outputs/final_model_selection.md` | This report |
| `outputs/model_selection.json` | Machine-readable selection record |
| `docs/evaluation/overfitting_gap_analysis.csv` | Train-val gaps for all models |
| `docs/evaluation/generalization_test_results.csv` | Unseen-user and unseen-RA results |
| `docs/evaluation/overfitting_analysis_report.md` | RF overfitting diagnosis and fix |
| `artifacts/xgboost_candidate.joblib` | Selected model artifact |
