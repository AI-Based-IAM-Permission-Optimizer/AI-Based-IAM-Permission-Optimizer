"""
Deep Diagnostic: Is the IAM model genuine, overfitted, or leaking?
Runs 8 tests covering:
  1. Leakage audit (usage-count-only baseline vs full model)
  2. Synthetic label correlation analysis
  3. Feature-target mutual information
  4. Cross-user generalization (group-aware test)
  5. Score distribution sanity
  6. Calibration quality (reliability diagram)
  7. Adversarial robustness (missing/noisy/unseen inputs)
  8. Real-world simulation (synthetic data hallmark check)
"""
import sys
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import json
import warnings
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.calibration import calibration_curve
from sklearn.feature_selection import mutual_info_classif
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    f1_score,
    roc_auc_score,
)
from sklearn.model_selection import GroupKFold

warnings.filterwarnings("ignore")

ROOT = Path(__file__).parent
DATA = ROOT / "data"
ART = ROOT / "artifacts"
OUT = ROOT / "outputs"

# ─────────────────────────────────────────────
# Load data & model
# ─────────────────────────────────────────────
print("=" * 70)
print("  IAM Model v2 — Reliability & Leakage Diagnostic")
print("=" * 70)

labeled = pd.read_csv(DATA / "labeled_dataset.csv")
meta = json.loads((ART / "iam_permission_model_v2_metadata.json").read_text())
model_bundle = joblib.load(ART / "iam_permission_model_v2_final.joblib")

model_pipeline = model_bundle["model"]
preprocessor = model_pipeline.named_steps["preprocessor"]
classifier = model_pipeline.named_steps["model"]
calibrator = model_bundle["calibrator"]

threshold = meta["prediction_threshold"]
feat_cols = meta["feature_columns"]
num_feats = meta["numeric_features"]
cat_feats = meta["categorical_features"]
test_metrics = meta["test_metrics"]

def safe_logit(p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))

def predict_risk_proba(X):
    raw = model_pipeline.predict_proba(X)[:, 1]
    return calibrator.predict_proba(safe_logit(raw).reshape(-1, 1))[:, 1]

# Rebuild splits from labeled_dataset
train_df = labeled[labeled["split"] == "train"].copy()
val_df   = labeled[labeled["split"] == "validation"].copy()
test_df  = labeled[labeled["split"] == "test"].copy()

y_test   = test_df["target"].values
proba_test = predict_risk_proba(test_df[feat_cols])
y_pred_test = (proba_test >= threshold).astype(int)

results = {}

# ─────────────────────────────────────────────
# TEST 1: Train/Val/Test gap — overfitting probe
# ─────────────────────────────────────────────
print("\n" + "─" * 70)
print("TEST 1 │ Train-Val-Test Performance Gap (Overfitting Check)")
print("─" * 70)

def score_split(df):
    X = df[feat_cols]
    y = df["target"].values
    pr = predict_risk_proba(X)
    yp = (pr >= threshold).astype(int)
    return {
        "pr_auc":   round(float(average_precision_score(y, pr)), 4),
        "f1":       round(float(f1_score(y, yp)), 4),
        "roc_auc":  round(float(roc_auc_score(y, pr)), 4),
        "brier":    round(float(brier_score_loss(y, pr)), 4),
        "n":        int(len(df)),
    }

tr = score_split(train_df)
vl = score_split(val_df)
ts = score_split(test_df)

gap_pr  = tr["pr_auc"]  - ts["pr_auc"]
gap_f1  = tr["f1"]      - ts["f1"]
gap_roc = tr["roc_auc"] - ts["roc_auc"]

print(f"{'Split':<12} {'N':>7}  {'PR-AUC':>8}  {'F1':>8}  {'ROC-AUC':>8}  {'Brier':>8}")
print(f"{'Train':<12} {tr['n']:>7}  {tr['pr_auc']:>8}  {tr['f1']:>8}  {tr['roc_auc']:>8}  {tr['brier']:>8}")
print(f"{'Validation':<12} {vl['n']:>7}  {vl['pr_auc']:>8}  {vl['f1']:>8}  {vl['roc_auc']:>8}  {vl['brier']:>8}")
print(f"{'Test':<12} {ts['n']:>7}  {ts['pr_auc']:>8}  {ts['f1']:>8}  {ts['roc_auc']:>8}  {ts['brier']:>8}")
print(f"\n  Train→Test PR-AUC gap : {gap_pr:+.4f}  {'⚠ SUSPICIOUS' if gap_pr > 0.05 else '✓ OK'}")
print(f"  Train→Test F1 gap     : {gap_f1:+.4f}  {'⚠ SUSPICIOUS' if gap_f1 > 0.05 else '✓ OK'}")
print(f"  Train→Test ROC gap    : {gap_roc:+.4f}  {'⚠ SUSPICIOUS' if gap_roc > 0.05 else '✓ OK'}")

overfitting_flag = (gap_pr > 0.05) or (gap_f1 > 0.05)
results["overfitting"] = {
    "flag": bool(overfitting_flag),
    "train_pr_auc": tr["pr_auc"],
    "test_pr_auc": ts["pr_auc"],
    "gap": round(float(gap_pr), 4)
}

# ─────────────────────────────────────────────
# TEST 2: Usage-count-only leakage audit
# ─────────────────────────────────────────────
print("\n" + "─" * 70)
print("TEST 2 │ Label Leakage Audit — Usage-Count-Only Model")
print("─" * 70)
print("  (If a 1-feature model matches the full model, there's data leakage)")

usage_only_model = LogisticRegression(class_weight="balanced", max_iter=500, random_state=42)
X_tr_usage = train_df[["usage_count"]].values
X_ts_usage = test_df[["usage_count"]].values
usage_only_model.fit(X_tr_usage, train_df["target"].values)

pr_usage = usage_only_model.predict_proba(X_ts_usage)[:, 1]
yp_usage = (pr_usage >= 0.5).astype(int)
prauc_usage = average_precision_score(y_test, pr_usage)
f1_usage    = f1_score(y_test, yp_usage)

prauc_full = ts["pr_auc"]
leak_gap   = prauc_full - prauc_usage

print(f"  Usage-count-only PR-AUC : {prauc_usage:.4f}")
print(f"  Full model PR-AUC       : {prauc_full:.4f}")
print(f"  Improvement (full-only) : {leak_gap:+.4f}")

if prauc_usage > 0.92:
    verdict = "⚠ STRONG LEAKAGE — usage_count almost perfectly predicts the label. Synthetic data is deterministic."
elif prauc_usage > 0.80:
    verdict = "⚠ MODERATE LEAKAGE — usage_count is suspiciously predictive. Check label generation."
elif prauc_usage > 0.65:
    verdict = "⚡ MILD ASSOCIATION — some correlation expected, but not severe leakage."
else:
    verdict = "✓ OK — usage_count alone is weak. Full model learning is genuine."

print(f"\n  Verdict: {verdict}")
results["leakage_audit"] = {
    "usage_only_prauc": round(float(prauc_usage), 4),
    "full_prauc": round(float(prauc_full), 4),
    "gap": round(float(leak_gap), 4),
    "flag": bool(prauc_usage > 0.80)
}

# ─────────────────────────────────────────────
# TEST 3: Feature–target mutual information
# ─────────────────────────────────────────────
print("\n" + "─" * 70)
print("TEST 3 │ Feature–Target Mutual Information (Leakage Probe)")
print("─" * 70)

X_mi = labeled[num_feats].fillna(0)
y_mi = labeled["target"].values
mi_scores = mutual_info_classif(X_mi, y_mi, discrete_features=False, random_state=42)
mi_df = pd.DataFrame({"feature": num_feats, "mutual_info": mi_scores}).sort_values("mutual_info", ascending=False)

print(f"  {'Feature':<30}  {'MI Score':>10}  {'Flag'}")
for _, row in mi_df.iterrows():
    flag = "⚠ HIGH — possible leakage" if row["mutual_info"] > 0.35 else ""
    print(f"  {row['feature']:<30}  {row['mutual_info']:>10.4f}  {flag}")

top_feature     = mi_df.iloc[0]["feature"]
top_mi          = mi_df.iloc[0]["mutual_info"]
leakage_mi_flag = top_mi > 0.35
results["mutual_info"] = {
    "top_feature": str(top_feature),
    "top_mi": round(float(top_mi), 4),
    "flag": bool(leakage_mi_flag)
}

# ─────────────────────────────────────────────
# TEST 4: Cross-user generalization
# ─────────────────────────────────────────────
print("\n" + "─" * 70)
print("TEST 4 │ Cross-User Generalization (Group-Aware CV on Full Dataset)")
print("─" * 70)
print("  Tests whether the model generalizes to ENTIRELY UNSEEN users")

X_all = preprocessor.transform(labeled[feat_cols])
y_all = labeled["target"].values
groups = labeled["user_id"].values

gkf = GroupKFold(n_splits=5)
fold_scores = []
for fold, (tr_idx, ts_idx) in enumerate(gkf.split(X_all, y_all, groups)):
    Xtr, Xts = X_all[tr_idx], X_all[ts_idx]
    ytr, yts = y_all[tr_idx], y_all[ts_idx]
    m = clone(classifier)
    m.fit(Xtr, ytr)
    pr = m.predict_proba(Xts)[:, 1]
    fold_scores.append(average_precision_score(yts, pr))
    print(f"  Fold {fold+1}: PR-AUC = {fold_scores[-1]:.4f}  (test users: {len(set(groups[ts_idx]))})")

mean_cv = np.mean(fold_scores)
std_cv  = np.std(fold_scores)
print(f"\n  Group-CV mean PR-AUC: {mean_cv:.4f} ± {std_cv:.4f}")
gen_flag = std_cv > 0.08 or mean_cv < 0.75
print(f"  Verdict: {'⚠ HIGH VARIANCE — poor generalization across users' if gen_flag else '✓ OK — stable across user groups'}")
results["cross_user_cv"] = {
    "mean_pr_auc": round(float(mean_cv), 4),
    "std": round(float(std_cv), 4),
    "flag": bool(gen_flag)
}

# ─────────────────────────────────────────────
# TEST 5: Score distribution sanity
# ─────────────────────────────────────────────
print("\n" + "─" * 70)
print("TEST 5 │ Risk Score Distribution (Sanity Check)")
print("─" * 70)

scores_intended  = proba_test[y_test == 0]
scores_excessive = proba_test[y_test == 1]

print(f"  INTENDED  scores — mean: {scores_intended.mean():.3f}, std: {scores_intended.std():.3f}, "
      f"p95: {np.percentile(scores_intended, 95):.3f}")
print(f"  EXCESSIVE scores — mean: {scores_excessive.mean():.3f}, std: {scores_excessive.std():.3f}, "
      f"p5:  {np.percentile(scores_excessive, 5):.3f}")

separation = scores_excessive.mean() - scores_intended.mean()
print(f"\n  Mean score separation   : {separation:.3f}")
overlap_flag = separation < 0.30
print(f"  Verdict: {'⚠ LOW SEPARATION — classes overlap heavily' if overlap_flag else '✓ OK — clear class separation'}")
results["score_distribution"] = {
    "intended_mean": round(float(scores_intended.mean()), 4),
    "excessive_mean": round(float(scores_excessive.mean()), 4),
    "separation": round(float(separation), 4),
    "flag": bool(overlap_flag)
}

# ─────────────────────────────────────────────
# TEST 6: Calibration quality
# ─────────────────────────────────────────────
print("\n" + "─" * 70)
print("TEST 6 │ Calibration Quality (Reliability)")
print("─" * 70)

fraction_pos, mean_pred = calibration_curve(y_test, proba_test, n_bins=10, strategy="quantile")
brier = brier_score_loss(y_test, proba_test)
max_calib_err = np.max(np.abs(fraction_pos - mean_pred))

print(f"  Brier score          : {brier:.4f}  ({'✓ Excellent (<0.05)' if brier < 0.05 else '⚠ Poor (>0.10)' if brier > 0.10 else 'OK'})")
print(f"  Max calibration error: {max_calib_err:.4f}  ({'✓ Good (<0.10)' if max_calib_err < 0.10 else '⚠ Poor'})")
print(f"\n  {'Predicted Prob':>16}  {'Actual Fraction':>16}")
for pred, frac in zip(mean_pred, fraction_pos):
    bar = "█" * int(frac * 20)
    print(f"  {pred:>16.3f}  {frac:>16.3f}  {bar}")

calib_flag = brier > 0.10 or max_calib_err > 0.15
results["calibration"] = {
    "brier_score": round(float(brier), 4),
    "max_calib_error": round(float(max_calib_err), 4),
    "flag": bool(calib_flag)
}

# ─────────────────────────────────────────────
# TEST 7: Adversarial robustness
# ─────────────────────────────────────────────
print("\n" + "─" * 70)
print("TEST 7 │ Adversarial Robustness (Missing / Noisy / Unseen Inputs)")
print("─" * 70)

def score_adversarial(X_mod, label):
    try:
        pr = predict_risk_proba(X_mod)
        yp = (pr >= threshold).astype(int)
        f1 = f1_score(y_test, yp)
        prauc = average_precision_score(y_test, pr)
        print(f"  {label:<40} PR-AUC={prauc:.4f}  F1={f1:.4f}  {'⚠ FRAGILE' if f1 < 0.70 else '✓ Robust'}")
        return prauc, f1
    except Exception as e:
        print(f"  {label:<40} ERROR: {e}")
        return None, None

X_base = test_df[feat_cols].copy()
score_adversarial(X_base, "Baseline (clean test set)")

# Missing numeric values
X_miss = X_base.copy()
for col in num_feats[:5]:
    X_miss[col] = np.nan
score_adversarial(X_miss, "5 numeric features = NaN")

# Noisy numeric values (+50% Gaussian noise)
X_noisy = X_base.copy()
rng = np.random.default_rng(42)
for col in ["usage_count", "log_usage_count", "unique_days_used"]:
    X_noisy[col] = X_base[col] * (1 + rng.normal(0, 0.5, len(X_base)))
score_adversarial(X_noisy, "+/-50% noise on usage features")

# Unseen categorical values
X_unk = X_base.copy()
X_unk["action_family"] = "unknown_family"
X_unk["service"] = "newservice"
X_unk["operation_type"] = "unknown_op"
score_adversarial(X_unk, "Unseen categorical values")

# All zeros (edge case)
X_zero = X_base.copy()
for col in num_feats:
    X_zero[col] = 0
score_adversarial(X_zero, "All numeric features = 0")

# ─────────────────────────────────────────────
# TEST 8: Real-World Simulation — synthetic data hallmark check
# ─────────────────────────────────────────────
print("\n" + "─" * 70)
print("TEST 8 │ Synthetic Data Hallmark Analysis")
print("─" * 70)

# Check if label can be predicted from usage_count ranges alone
labeled["usage_bucket"] = pd.cut(labeled["usage_count"], bins=10, labels=False)
pivot = labeled.groupby("usage_bucket", observed=False)["target"].agg(["mean", "count"]).reset_index()
pivot.columns = ["bucket", "pct_excessive", "count"]

print("  Usage-count bucket vs % EXCESSIVE (deterministic pattern = leakage risk):")
print(f"  {'Bucket':>8}  {'% Excessive':>12}  {'Count':>8}  {'Flag'}")
for _, row in pivot.iterrows():
    flag = "⚠ NEAR-DETERMINISTIC" if row["pct_excessive"] > 0.95 or row["pct_excessive"] < 0.02 else ""
    print(f"  {row['bucket']:>8.0f}  {row['pct_excessive']:>12.3f}  {row['count']:>8.0f}  {flag}")

# Check class balance
class_dist = labeled["target"].value_counts(normalize=True)
print(f"\n  Class distribution — INTENDED: {class_dist.get(0, 0):.1%}  EXCESSIVE: {class_dist.get(1, 0):.1%}")

# Check duplicate records
n_dupes = labeled.duplicated(subset=feat_cols + ["target"]).sum()
print(f"  Duplicate feature+label records: {n_dupes}")

# Check if user_id is indirectly leaking via correlated features
user_target_entropy = labeled.groupby("user_id")["target"].mean()
user_entropy_std = user_target_entropy.std()
print(f"  Std of EXCESSIVE rate across users: {user_entropy_std:.4f}")
print(f"  {'⚠ USERS HAVE STRONGLY DIFFERENT EXCESSIVE RATES — could memorize users' if user_entropy_std > 0.3 else '✓ Reasonable variation across users'}")

# ─────────────────────────────────────────────
# FINAL VERDICT
# ─────────────────────────────────────────────
print("\n" + "=" * 70)
print("  OVERALL DIAGNOSTIC VERDICT")
print("=" * 70)

flags = {
    "Overfitting (train-test gap)":        results["overfitting"]["flag"],
    "Label Leakage (usage-count-only)":    results["leakage_audit"]["flag"],
    "Feature MI too high":                 results["mutual_info"]["flag"],
    "Cross-user generalization poor":      results["cross_user_cv"]["flag"],
    "Class score separation low":          results["score_distribution"]["flag"],
    "Poor calibration":                    results["calibration"]["flag"],
}

flagged = [k for k, v in flags.items() if v]
ok      = [k for k, v in flags.items() if not v]

for k in ok:
    print(f"  ✅  {k}")
for k in flagged:
    print(f"  ❌  {k}")

print()
if len(flagged) == 0:
    print("  VERDICT: ✅ MODEL APPEARS GENUINE AND RELIABLE")
    print("  The model generalizes across users, has no obvious leakage,")
    print("  and shows consistent train/val/test performance.")
elif len(flagged) <= 2:
    print("  VERDICT: ⚡ MODEL IS PARTIALLY RELIABLE WITH CAVEATS")
    print(f"  Flags detected: {', '.join(flagged)}")
    print("  Use with caution; address flagged issues before production.")
else:
    print("  VERDICT: ⚠ MODEL HAS SIGNIFICANT RELIABILITY CONCERNS")
    print(f"  {len(flagged)} issues found: {', '.join(flagged)}")
    print("  Do NOT deploy. Address leakage and synthetic data quality first.")

# Save summary
summary = {
    "test_metrics": test_metrics,
    "diagnostic_results": results,
    "flagged_issues": flagged,
    "overall_verdict": "GENUINE" if len(flagged)==0 else ("PARTIAL" if len(flagged)<=2 else "UNRELIABLE")
}
(OUT / "model_reliability_diagnostic.json").write_text(json.dumps(summary, indent=2))
print(f"\n  Detailed results saved to: outputs/model_reliability_diagnostic.json")
print("=" * 70)
