"""
End-to-End System & Code Verification Script for IAM Model V2
Executes and validates:
  1. All 10 notebooks in sequence (01 to 10)
  2. Data file generation & schema integrity
  3. Model artifacts & bundle structure
  4. Diagnostic script (diagnostic.py)
  5. Final predictions format and consistency
  6. Code efficiency & execution timing profile
"""
import glob
import json
import os
import sys
import time
from pathlib import Path

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import joblib
import nbformat
import numpy as np
import pandas as pd
from nbconvert.preprocessors import ExecutePreprocessor

ROOT = Path(__file__).parent.resolve()
NOTEBOOKS_DIR = ROOT / "notebooks"
DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
ART_DIR = ROOT / "artifacts"
OUT_DIR = ROOT / "outputs"

print("=" * 80)
print("  IAM MODEL V2 — FULL SYSTEM & EFFICIENCY VERIFICATION")
print("=" * 80)
print(f"Working Directory: {ROOT}")
print(f"Python Version   : {sys.version}")

report = {
    "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
    "notebook_executions": [],
    "file_verifications": {},
    "artifact_verifications": {},
    "pipeline_consistency": {},
    "diagnostic_status": None,
    "efficiency_profile": {},
}

# -------------------------------------------------------------
# STEP 1: Verify Raw Data Sources First
# -------------------------------------------------------------
print("\n" + "─" * 80)
print("STEP 1: RAW DATA VALIDATION")
print("─" * 80)

raw_files = [
    RAW_DIR / "ml_ready_synthetic.csv",
    RAW_DIR / "AWS_Risk_Weight_Table_FINAL_4007_Actions_Shuffled.csv"
]
for rf in raw_files:
    if not rf.exists():
        print(f"  ❌ MISSING RAW FILE: {rf}")
        sys.exit(1)
    df_raw = pd.read_csv(rf, nrows=5)
    print(f"  ✅ Raw File Found: {rf.name} ({rf.stat().st_size:,} bytes, {len(df_raw.columns)} cols)")

# -------------------------------------------------------------
# STEP 2: Execute all 10 Notebooks Sequentially
# -------------------------------------------------------------
print("\n" + "─" * 80)
print("STEP 2: SEQUENTIAL NOTEBOOK EXECUTION (01 → 10)")
print("─" * 80)

notebook_files = [
    "01_data_understanding.ipynb",
    "02_data_cleaning.ipynb",
    "03_feature_engineering.ipynb",
    "04_label_creation.ipynb",
    "05_weighted_baseline.ipynb",
    "06_logistic_regression.ipynb",
    "07_random_forest.ipynb",
    "08_xgboost.ipynb",
    "09_model_evaluation.ipynb",
    "10_final_model.ipynb",
]

total_nb_time = 0.0

for nb_name in notebook_files:
    nb_path = NOTEBOOKS_DIR / nb_name
    print(f"  Running: {nb_name} ...", end=" ", flush=True)
    t0 = time.time()
    
    try:
        with open(nb_path, encoding="utf-8") as f:
            nb = nbformat.read(f, as_version=4)
        
        ep = ExecutePreprocessor(timeout=1800, kernel_name="python3")
        # Run inside the notebooks directory to replicate exact user interactive working directory
        ep.preprocess(nb, {"metadata": {"path": str(NOTEBOOKS_DIR)}})
        
        # Save back the executed notebook to preserve execution outputs
        with open(nb_path, "w", encoding="utf-8") as f:
            nbformat.write(nb, f)
            
        elapsed = time.time() - t0
        total_nb_time += elapsed
        print(f"✅ PASSED ({elapsed:.2f}s)")
        
        report["notebook_executions"].append({
            "notebook": nb_name,
            "status": "PASSED",
            "time_seconds": round(elapsed, 2)
        })
        
    except Exception as e:
        elapsed = time.time() - t0
        print(f"❌ FAILED ({elapsed:.2f}s)")
        print(f"     Error: {e}")
        report["notebook_executions"].append({
            "notebook": nb_name,
            "status": "FAILED",
            "time_seconds": round(elapsed, 2),
            "error": str(e)
        })
        print("\nStopping full execution due to notebook failure.")
        sys.exit(1)

print(f"\n  Total Notebook Pipeline Execution Time: {total_nb_time:.2f}s")
report["efficiency_profile"]["total_notebook_time_seconds"] = round(total_nb_time, 2)

# -------------------------------------------------------------
# STEP 3: Verify Intermediate & Labeled Datasets
# -------------------------------------------------------------
print("\n" + "─" * 80)
print("STEP 3: INTERMEDIATE DATASET INTEGRITY CHECKS")
print("─" * 80)

datasets = {
    "cleaned_dataset.csv": {"min_rows": 19000, "required_cols": ["action", "user_id", "service", "risk_weight"]},
    "engineered_dataset.csv": {"min_rows": 19000, "required_cols": ["log_usage_count", "action_family", "is_delete"]},
    "labeled_dataset.csv": {"min_rows": 19000, "required_cols": ["target", "split"]},
    "splits.csv": {"min_rows": 19000, "required_cols": ["row_id", "user_id", "split"]}
}

for filename, spec in datasets.items():
    fpath = DATA_DIR / filename
    if not fpath.exists():
        print(f"  ❌ Missing Dataset: {filename}")
        report["file_verifications"][filename] = {"status": "MISSING"}
        continue
    
    df = pd.read_csv(fpath)
    rows, cols = df.shape
    missing_cols = [c for c in spec["required_cols"] if c not in df.columns]
    
    status = "OK" if (rows >= spec["min_rows"] and not missing_cols) else "WARNING"
    print(f"  {'✅' if status == 'OK' else '⚠'} {filename:<25} Rows: {rows:<6} Cols: {cols:<3} MissingCols: {missing_cols}")
    
    report["file_verifications"][filename] = {
        "rows": rows,
        "cols": cols,
        "status": status,
        "missing_required_cols": missing_cols
    }

# Check class balance and split proportions in labeled_dataset
labeled = pd.read_csv(DATA_DIR / "labeled_dataset.csv")
split_counts = labeled["split"].value_counts().to_dict()
target_counts = labeled["target"].value_counts(normalize=True).to_dict()
print(f"\n  Splits Distribution: {split_counts}")
print(f"  Target Proportions:  0 (INTENDED): {target_counts.get(0, 0):.2%}, 1 (EXCESSIVE): {target_counts.get(1, 0):.2%}")

report["pipeline_consistency"]["split_counts"] = split_counts
report["pipeline_consistency"]["target_proportions"] = target_counts

# -------------------------------------------------------------
# STEP 4: Verify Saved Artifacts & Models
# -------------------------------------------------------------
print("\n" + "─" * 80)
print("STEP 4: MODEL ARTIFACTS VERIFICATION")
print("─" * 80)

expected_artifacts = [
    "weighted_baseline.joblib",
    "logistic_regression_candidate.joblib",
    "random_forest_candidate.joblib",
    "xgboost_candidate.joblib",
    "split_metadata.json",
    "model_selection.json",
    "iam_permission_model_v2_final.joblib",
    "iam_permission_model_v2_metadata.json"
]

for art_name in expected_artifacts:
    art_path = ART_DIR / art_name
    if not art_path.exists():
        print(f"  ❌ Missing Artifact: {art_name}")
        report["artifact_verifications"][art_name] = {"status": "MISSING"}
        continue
    
    size_kb = round(art_path.stat().st_size / 1024, 1)
    print(f"  ✅ Artifact Present: {art_name:<38} ({size_kb:>8.1f} KB)")
    report["artifact_verifications"][art_name] = {"status": "OK", "size_kb": size_kb}

# Verify final model bundle structure & inference test
final_bundle_path = ART_DIR / "iam_permission_model_v2_final.joblib"
final_bundle = joblib.load(final_bundle_path)
required_bundle_keys = ["model", "calibrator", "risk_catalog", "metadata"]
missing_keys = [k for k in required_bundle_keys if k not in final_bundle]
if missing_keys:
    print(f"  ❌ Final bundle missing keys: {missing_keys}")
else:
    print(f"  ✅ Final model bundle has all keys: {list(final_bundle.keys())}")

# -------------------------------------------------------------
# STEP 5: Run Diagnostic Script (diagnostic.py)
# -------------------------------------------------------------
print("\n" + "─" * 80)
print("STEP 5: RELIABILITY DIAGNOSTIC EXECUTION")
print("─" * 80)

t0 = time.time()
DOCS_EVAL_DIR = ROOT / "docs" / "evaluation"
DOCS_EVAL_DIR.mkdir(parents=True, exist_ok=True)
diag_log = DOCS_EVAL_DIR / "diagnostic_run.log"
diag_exit = os.system(f'python "{ROOT / "diagnostic.py"}" > "{diag_log}" 2>&1')
diag_time = time.time() - t0

if diag_exit == 0:
    print(f"  ✅ diagnostic.py executed cleanly in {diag_time:.2f}s")
    report["diagnostic_status"] = "PASSED"
    report["efficiency_profile"]["diagnostic_time_seconds"] = round(diag_time, 2)
else:
    print(f"  ❌ diagnostic.py exited with code {diag_exit}")
    report["diagnostic_status"] = f"FAILED ({diag_exit})"

# -------------------------------------------------------------
# STEP 6: Validate Final Predictions & Recommendations
# -------------------------------------------------------------
print("\n" + "─" * 80)
print("STEP 6: FINAL PREDICTIONS FILE VALIDATION")
print("─" * 80)

preds_path = OUT_DIR / "final_production_predictions.csv"
if preds_path.exists():
    preds = pd.read_csv(preds_path)
    print(f"  ✅ File: {preds_path.name} ({len(preds):,} rows, {len(preds.columns)} cols)")
    
    # Check probability bounds
    p_min, p_max = preds["risk_score"].min(), preds["risk_score"].max()
    valid_bounds = (p_min >= 0.0) and (p_max <= 1.0)
    print(f"  {'✅' if valid_bounds else '❌'} Risk Score Range: [{p_min:.4f}, {p_max:.4f}]")
    
    # Check recommendation distribution
    rec_dist = preds["recommendation"].value_counts().to_dict()
    print(f"  Recommendation Counts: {rec_dist}")
    
    # Check for NaN values in output
    null_counts = preds[["user_id", "action", "risk_score", "prediction", "recommendation"]].isnull().sum().to_dict()
    has_nulls = any(v > 0 for v in null_counts.values())
    print(f"  {'❌' if has_nulls else '✅'} Null values check in key output fields: {null_counts}")
    
    report["pipeline_consistency"]["predictions_summary"] = {
        "rows": len(preds),
        "risk_score_min": float(p_min),
        "risk_score_max": float(p_max),
        "recommendation_distribution": rec_dist,
        "null_counts": null_counts
    }
else:
    print(f"  ❌ Missing final_production_predictions.csv")

# -------------------------------------------------------------
# STEP 7: Save Full Verification Summary
# -------------------------------------------------------------
out_summary = OUT_DIR / "verification_pipeline_summary.json"
out_summary.write_text(json.dumps(report, indent=2), encoding="utf-8")
print("\n" + "=" * 80)
print(f"  ALL SYSTEM CHECKS COMPLETED")
print(f"  Detailed Verification Report Saved to: {out_summary}")
print("=" * 80)
