#!/usr/bin/env python3
"""
prepare_real_v2_for_backend.py
==============================
Standalone pre-ingestion converter script for the final IAM Guard demo.

Transforms real-data ML prediction output (outputs/real_v2_integration_predictions.csv)
into backend-ready format (outputs/real_v2_backend_ready_predictions.csv) WITHOUT
modifying backend source code, API contracts, frontend code, or AWS infrastructure.

Transformations Applied:
1. User ID: Strips IAM ARN prefix ('arn:aws:iam::713362557040:user/') -> short user ID ('demo-developer', etc.)
2. Role ID: Maps placeholder 'demo-role' to confirmed V2 Role IDs:
     demo-developer    -> MLEngineer-Role
     demo-data-analyst -> DataAnalyst-Role
     demo-devops       -> DevOpsEngineer-Role
     demo-backend-dev  -> BackendDeveloper-Role
3. Risk Fields:
   - Preserves ML pipeline's authoritative unmapped risk metadata by default.
   - Provides an optional --backend-fallback flag to supply 'UNCATALOGED' for risk_level and 1 for risk_weight
     if strict non-empty backend schema validation is enforced.
4. Resources: Preserves valid resource ARNs and cleans string 'nan' to '*' (wildcard scope).
"""

import argparse
import csv
import json
import os
import sys
from collections import Counter

# File Paths
INPUT_CSV = os.path.join("C:", os.sep, "Users", "shita", "OneDrive", "Desktop", "awsproject", "outputs", "real_v2_integration_predictions.csv")
OUTPUT_CSV = os.path.join("C:", os.sep, "Users", "shita", "OneDrive", "Desktop", "awsproject", "outputs", "real_v2_backend_ready_predictions.csv")
INSPECT_OUTPUT_CSV = os.path.join("Documents", "real_v2_backend_ready_predictions.csv")

# Canonical 14 backend fields
REQUIRED_FIELDS = [
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

# Confirmed Role Mapping
USER_TO_ROLE_MAP = {
    "demo-developer": "MLEngineer-Role",
    "demo-data-analyst": "DataAnalyst-Role",
    "demo-devops": "DevOpsEngineer-Role",
    "demo-backend-dev": "BackendDeveloper-Role",
}

VALID_V2_ROLES = set(USER_TO_ROLE_MAP.values())
VALID_PREDICTIONS = {"INTENDED", "EXCESSIVE"}
VALID_RECOMMENDATIONS = {"KEEP", "REVIEW", "REMOVE"}


def extract_short_user_id(raw_user_id):
    cleaned = str(raw_user_id).strip()
    if "user/" in cleaned:
        return cleaned.split("user/")[-1]
    return cleaned


def convert_record(row, apply_backend_fallback=False):
    raw_user = row.get("user_id", "")
    short_user = extract_short_user_id(raw_user)

    if short_user not in USER_TO_ROLE_MAP:
        raise ValueError(f"Unknown demo user ID '{short_user}' extracted from '{raw_user}'")

    mapped_role = USER_TO_ROLE_MAP[short_user]

    raw_resource = str(row.get("resource", "")).strip()
    if not raw_resource or raw_resource.lower() in ("nan", "none", "null"):
        clean_resource = "*"
    else:
        clean_resource = raw_resource

    risk_score_raw = row.get("risk_score", "")
    try:
        risk_score_val = float(risk_score_raw)
    except (ValueError, TypeError):
        raise ValueError(f"Invalid risk_score '{risk_score_raw}'")

    risk_weight_raw = str(row.get("risk_weight", "")).strip()
    if not risk_weight_raw or risk_weight_raw.lower() in ("nan", "none", "null", ""):
        clean_risk_weight = "1" if apply_backend_fallback else ""
    else:
        try:
            w_float = float(risk_weight_raw)
            clean_risk_weight = str(int(w_float)) if w_float.is_integer() else str(w_float)
        except ValueError:
            clean_risk_weight = risk_weight_raw

    risk_level_raw = str(row.get("risk_level", "")).strip()
    if not risk_level_raw or risk_level_raw.lower() in ("nan", "none", "null", ""):
        clean_risk_level = "UNCATALOGED" if apply_backend_fallback else ""
    else:
        clean_risk_level = risk_level_raw

    converted = {
        "recommendation_id": str(row.get("recommendation_id", "")).strip(),
        "user_id": short_user,
        "role_id": mapped_role,
        "action": str(row.get("action", "")).strip(),
        "resource": clean_resource,
        "risk_score": f"{risk_score_val:.6f}",
        "risk_weight": clean_risk_weight,
        "risk_level": clean_risk_level,
        "prediction": str(row.get("prediction", "")).strip(),
        "recommendation": str(row.get("recommendation", "")).strip(),
        "reason_codes": str(row.get("reason_codes", "")).strip(),
        "explanation": str(row.get("explanation", "")).strip(),
        "model_version": str(row.get("model_version", "")).strip(),
        "generated_at": str(row.get("generated_at", "")).strip(),
    }

    return converted


def validate_records(records, allow_empty_risk=True):
    if len(records) != 83:
        raise ValueError(f"Validation Error: Expected exactly 83 records, got {len(records)}")

    seen_ids = set()
    user_counts = Counter()
    role_counts = Counter()
    user_rec_counts = {}

    for idx, r in enumerate(records, 1):
        rec_id = r.get("recommendation_id")
        if not rec_id:
            raise ValueError(f"Row {idx}: Missing recommendation_id")
        if rec_id in seen_ids:
            raise ValueError(f"Row {idx}: Duplicate recommendation_id '{rec_id}'")
        seen_ids.add(rec_id)

        user_id = r.get("user_id")
        if user_id not in USER_TO_ROLE_MAP:
            raise ValueError(f"Row {idx}: Invalid user_id '{user_id}'")
        user_counts[user_id] += 1

        role_id = r.get("role_id")
        if role_id not in VALID_V2_ROLES:
            raise ValueError(f"Row {idx}: Invalid role_id '{role_id}'")
        role_counts[role_id] += 1

        if not r.get("action"):
            raise ValueError(f"Row {idx}: Missing action")

        if not r.get("resource"):
            raise ValueError(f"Row {idx}: Missing resource")

        try:
            score = float(r.get("risk_score"))
            if not (0.0 <= score <= 1.0):
                raise ValueError(f"Row {idx}: risk_score out of range [0, 1]: {score}")
        except Exception as e:
            raise ValueError(f"Row {idx}: Invalid risk_score: {e}")

        pred = r.get("prediction")
        if pred not in VALID_PREDICTIONS:
            raise ValueError(f"Row {idx}: Invalid prediction '{pred}'")

        rec = r.get("recommendation")
        if rec not in VALID_RECOMMENDATIONS:
            raise ValueError(f"Row {idx}: Invalid recommendation '{rec}'")

        if user_id not in user_rec_counts:
            user_rec_counts[user_id] = Counter()
        user_rec_counts[user_id][rec] += 1

        if not r.get("model_version"):
            raise ValueError(f"Row {idx}: Missing model_version")

        if not r.get("generated_at"):
            raise ValueError(f"Row {idx}: Missing generated_at")

        if not allow_empty_risk and not r.get("risk_level"):
            raise ValueError(f"Row {idx}: risk_level is empty")

        if list(r.keys()) != REQUIRED_FIELDS:
            raise ValueError(f"Row {idx}: Keys do not match 14 required fields exactly")

    return user_counts, role_counts, user_rec_counts


def main():
    parser = argparse.ArgumentParser(description="Prepare Real V2 Recommendations for Backend Ingestion")
    parser.add_argument(
        "--backend-fallback",
        action="store_true",
        help="Apply 'UNCATALOGED' for risk_level and '1' for risk_weight on unmapped actions if strict backend string validation is enforced.",
    )
    args = parser.parse_args()

    print("==================================================")
    print("   Preparing Real V2 Recommendations for Backend")
    print("==================================================")
    if args.backend_fallback:
        print("[Mode]: Backend Strict Validation Fallback (UNCATALOGED / 1)")
    else:
        print("[Mode]: Strict ML Pipeline Metadata Preservation (NULL / Empty String)")

    input_path = INPUT_CSV if os.path.exists(INPUT_CSV) else "outputs/real_v2_integration_predictions.csv"
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input predictions CSV not found at: {input_path}")

    print(f"Reading input CSV: {input_path}")
    raw_records = []
    with open(input_path, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        raw_records = list(reader)

    print(f"Input records read: {len(raw_records)}")

    converted_records = [convert_record(row, apply_backend_fallback=args.backend_fallback) for row in raw_records]

    # Validate converted records
    user_counts, role_counts, user_rec_counts = validate_records(converted_records, allow_empty_risk=not args.backend_fallback)

    # Write output CSV
    out_paths = [OUTPUT_CSV, INSPECT_OUTPUT_CSV]
    for out_p in out_paths:
        out_dir = os.path.dirname(out_p)
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)

        with open(out_p, mode="w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=REQUIRED_FIELDS)
            writer.writeheader()
            writer.writerows(converted_records)
        print(f"Successfully created: {out_p}")

    print("\n==================================================")
    print("             VALIDATION SUMMARY")
    print("==================================================")
    print(f"Total output records: {len(converted_records)}")
    print(f"Total columns:        {len(REQUIRED_FIELDS)}")
    print(f"Columns:              {', '.join(REQUIRED_FIELDS)}")
    print("\nUser Record Counts:")
    for user, count in sorted(user_counts.items()):
        print(f"  {user:20s}: {count}")

    print("\nRole Record Counts:")
    for role, count in sorted(role_counts.items()):
        print(f"  {role:25s}: {count}")

    print("\nRecommendations Breakdown by User:")
    for user, rec_c in sorted(user_rec_counts.items()):
        recs_str = ", ".join([f"{k}: {v}" for k, v in sorted(rec_c.items())])
        print(f"  {user:20s}: {recs_str}")

    missing_fields_count = 0
    invalid_fields_count = 0

    print(f"\nMissing required 14 fields: {missing_fields_count}")
    print(f"Invalid field values:      {invalid_fields_count}")
    print("==================================================")


if __name__ == "__main__":
    main()
