"""
IAM Permission Model V2 — Production Inference Module

Usage:
    from inference import load_model, run_inference

    model = load_model()                     # loads iam_permission_model_v2_final.joblib
    results_df = run_inference(df, model)    # returns DataFrame with 14 required columns

The ML model NEVER directly modifies IAM permissions.
All REVIEW and REMOVE recommendations require administrator approval.
"""
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

# ── Paths ──────────────────────────────────────────────────────────────────
_HERE = Path(__file__).parent.resolve()
_DEFAULT_ARTIFACT = _HERE / "artifacts" / "iam_permission_model_v2_final.joblib"

# ── Output schema ──────────────────────────────────────────────────────────
REQUIRED_OUTPUT_COLUMNS = [
    "recommendation_id",
    "user_id",
    "role_id",
    "action",
    "resource",
    "risk_score",
    "risk_weight",
    "risk_level",
    "prediction",
    "recommendation",
    "reason_codes",
    "explanation",
    "model_version",
    "generated_at",
]
REQUIRED_COLS = REQUIRED_OUTPUT_COLUMNS

# ── Thresholds ─────────────────────────────────────────────────────────────
PREDICTION_THRESHOLD = 0.535   # INTENDED vs EXCESSIVE
REVIEW_THRESHOLD     = 0.40    # KEEP -> REVIEW
REMOVE_THRESHOLD     = 0.70    # REVIEW -> REMOVE


# ── Model loader ───────────────────────────────────────────────────────────
def load_model(artifact_path: str | Path = None) -> dict:
    """
    Load the final IAM permission model artifact.

    Args:
        artifact_path: Path to .joblib artifact. Defaults to
                       artifacts/iam_permission_model_v2_final.joblib

    Returns:
        dict with keys: estimator, feature_columns, optimal_threshold,
                        model_version, recommendation_thresholds, policy_notes, ...
    """
    path = Path(artifact_path) if artifact_path else _DEFAULT_ARTIFACT
    if not path.exists():
        raise FileNotFoundError(f"Model artifact not found: {path}")
    return joblib.load(path)


# ── Business logic ─────────────────────────────────────────────────────────
def make_recommendation_id(user_id: str, role_id: str, action: str, resource: str) -> str:
    """
    Deterministic, stable recommendation ID.
    Produces the same REC-XXXX for the same (user, role, action, resource) on every call.
    """
    key = f"v2|{user_id}|{role_id}|{action}|{resource}"
    return "REC-" + hashlib.sha256(key.encode()).hexdigest()[:16].upper()


def score_to_recommendation(risk_score: float) -> str:
    if risk_score >= REMOVE_THRESHOLD:
        return "REMOVE"
    if risk_score >= REVIEW_THRESHOLD:
        return "REVIEW"
    return "KEEP"


def _safe(val, default=0):
    """Return val if it is not None/NaN, else default."""
    if val is None:
        return default
    try:
        if np.isnan(float(val)):
            return default
    except (TypeError, ValueError):
        pass
    return val


def compute_reason_codes(row: dict, risk_score: float) -> list:
    """Return up to 4 machine-readable reason codes for the prediction."""
    codes = []
    uc   = _safe(row.get("usage_count"), 0)
    dslu = _safe(row.get("days_since_last_use"), 0)
    sfr  = _safe(row.get("smoothed_failure_rate"), 0)
    rw   = _safe(row.get("risk_weight"), 0)

    if uc == 0:
        codes.append("ZERO_USAGE")
    elif uc < 3:
        codes.append("VERY_LOW_USAGE")
    if dslu > 90:
        codes.append("INACTIVE_90D")
    elif dslu > 30:
        codes.append("INACTIVE_30D")
    if sfr > 0.5:
        codes.append("HIGH_FAILURE_RATE")
    if _safe(row.get("is_security_sensitive"), 0) == 1:
        codes.append("SECURITY_SENSITIVE_ACTION")
    if _safe(row.get("is_permission_change"), 0) == 1:
        codes.append("PERMISSION_CHANGE_ACTION")
    if _safe(row.get("is_delete"), 0) == 1:
        codes.append("DELETE_ACTION")
    if _safe(row.get("is_wildcard_resource"), 0) == 1:
        codes.append("WILDCARD_RESOURCE")
    if rw >= 8:
        codes.append("HIGH_RISK_WEIGHT")
    elif rw >= 5:
        codes.append("MEDIUM_RISK_WEIGHT")
    if not codes:
        codes.append("MODEL_PATTERN_EXCESSIVE" if risk_score > 0.7 else "LOW_RISK_PROFILE")
    return codes[:4]


def compute_explanation(row: dict, risk_score: float, codes: list, rec: str) -> str:
    """Return a human-readable explanation string for an administrator."""
    action  = row.get("action", "unknown action")
    service = row.get("service", "unknown service")
    uc_raw  = _safe(row.get("usage_count"), 0)
    u_count = int(uc_raw)
    dslu_v  = _safe(row.get("days_since_last_use"), None)
    dslu    = int(dslu_v) if dslu_v is not None else None

    parts = [f"Permission '{action}' on '{service}' has a risk score of {risk_score:.2f}."]
    if "ZERO_USAGE" in codes:
        parts.append("This permission has never been used.")
    elif "VERY_LOW_USAGE" in codes:
        parts.append(f"This permission has been used only {u_count} time(s).")
    if "INACTIVE_90D" in codes and dslu is not None:
        parts.append(f"Last used {dslu} days ago (inactive >90 days).")
    elif "INACTIVE_30D" in codes and dslu is not None:
        parts.append(f"Last used {dslu} days ago (inactive >30 days).")
    if "HIGH_FAILURE_RATE" in codes:
        parts.append("High failure rate detected -- permission may not be needed.")
    if "SECURITY_SENSITIVE_ACTION" in codes:
        parts.append("This is a security-sensitive action requiring elevated justification.")
    if "WILDCARD_RESOURCE" in codes:
        parts.append("Wildcard resource scope increases blast radius.")
    if rec == "REMOVE":
        parts.append("Recommendation: Remove this permission pending administrator review.")
    elif rec == "REVIEW":
        parts.append("Recommendation: Flag for administrator review.")
    else:
        parts.append("Recommendation: Permission appears justified; no immediate action required.")
    return " ".join(parts)


# ── Main inference function ─────────────────────────────────────────────────
def run_inference(
    df_input: pd.DataFrame,
    model: dict = None,
    threshold: float = None,
) -> pd.DataFrame:
    """
    Run production inference on a DataFrame of IAM permission records.

    Args:
        df_input:  DataFrame containing at minimum the model's feature_columns
                   plus identity columns (user_id, role_id, action, resource, etc.)
        model:     Model dict returned by load_model(). If None, loads the default artifact.
        threshold: Risk score threshold for EXCESSIVE prediction. Defaults to model's
                   optimal_threshold (0.535).

    Returns:
        DataFrame with exactly 14 columns (REQUIRED_OUTPUT_COLUMNS).
        Column order is guaranteed stable.

    Policy:
        This function ONLY produces recommendations.
        It does NOT modify any IAM permissions or policies.
        All REVIEW/REMOVE actions require administrator approval.
    """
    if model is None:
        model = load_model()

    estimator      = model["estimator"]
    feature_columns = model["feature_columns"]
    model_version  = model.get("model_version", "iam_permission_model_v2_final_20260924")
    thr            = threshold if threshold is not None else model.get("optimal_threshold", PREDICTION_THRESHOLD)

    # Validate input columns
    missing = [c for c in feature_columns if c not in df_input.columns]
    if missing:
        raise ValueError(f"Input DataFrame is missing required feature columns: {missing}")

    # Coerce to float so XGBoost can handle NaN natively
    X = df_input[feature_columns].copy().astype({c: "float64" for c in feature_columns
              if df_input[feature_columns][c].dtype.kind in ("i", "u")})
    risk_scores = estimator.predict_proba(X)[:, 1]
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    records = []
    for i, (_, row) in enumerate(df_input.iterrows()):
        score = float(risk_scores[i])
        pred  = "EXCESSIVE" if score >= thr else "INTENDED"
        rec   = score_to_recommendation(score)
        row_d = row.to_dict()
        codes = compute_reason_codes(row_d, score)
        expl  = compute_explanation(row_d, score, codes, rec)
        rid   = make_recommendation_id(
            str(row.get("user_id", "")),
            str(row.get("role_id", "")),
            str(row.get("action", "")),
            str(row.get("resource", "")),
        )
        rw = row.get("risk_weight")
        records.append({
            "recommendation_id": rid,
            "user_id":           str(row.get("user_id", "")),
            "role_id":           str(row.get("role_id", "")),
            "action":            str(row.get("action", "")),
            "resource":          str(row.get("resource", "")),
            "risk_score":        round(score, 6),
            "risk_weight":       int(rw) if rw is not None and not (isinstance(rw, float) and np.isnan(rw)) else None,
            "risk_level":        str(row.get("risk_level", "")),
            "prediction":        pred,
            "recommendation":    rec,
            "reason_codes":      json.dumps(codes),
            "explanation":       expl,
            "model_version":     model_version,
            "generated_at":      generated_at,
        })

    return pd.DataFrame(records)[REQUIRED_OUTPUT_COLUMNS]


# ── CLI convenience ────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    print("Loading model...")
    m = load_model()
    print(f"Model version   : {m['model_version']}")
    print(f"Threshold       : {m['optimal_threshold']}")
    print(f"Feature columns : {len(m['feature_columns'])}")

    # Quick smoke test
    HERE = Path(__file__).parent
    df = pd.read_csv(HERE / "data" / "labeled_dataset.csv")
    splits = pd.read_csv(HERE / "data" / "splits.csv")
    df["split"] = splits["split"].values
    sample = df[df["split"] == "test"].head(10).reset_index(drop=True)

    out = run_inference(sample, m)
    print(f"\nSample inference ({len(out)} rows):")
    print(out[["recommendation_id", "action", "risk_score", "prediction", "recommendation"]].to_string(index=False))
    print("\nAll columns:", out.columns.tolist())
    print("\nSmoke test PASSED.")
