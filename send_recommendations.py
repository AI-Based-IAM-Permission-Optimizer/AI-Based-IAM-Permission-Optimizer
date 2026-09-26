#!/usr/bin/env python3
"""
send_recommendations.py
=======================
Dedicated integration/sender module to read V2 ML prediction CSV output
(final_production_predictions.csv) and transmit recommendation batches
to the backend API Gateway endpoint.

Authoritative V2 Production Contract: Exactly 14 fields per recommendation.
"""

import argparse
import ast
import csv
import json
import os
import sys
from collections import Counter

import requests

DEFAULT_API_URL = "https://6ldbesb1a0.execute-api.ap-south-1.amazonaws.com/api/v1/recommendations"
DEFAULT_CSV_PATH = os.path.join("Documents", "final_production_predictions.csv")

# Authoritative 20 V2 Role IDs
VALID_V2_ROLES = Object_freeze = {
    "BackendDeveloper-Role",
    "FrontendDeveloper-Role",
    "DataEngineer-Role",
    "DataScientist-Role",
    "MLEngineer-Role",
    "DevOpsEngineer-Role",
    "CloudEngineer-Role",
    "SecurityEngineer-Role",
    "IAMAdministrator-Role",
    "DatabaseAdministrator-Role",
    "SRE-Role",
    "DataAnalyst-Role",
    "SecurityAnalyst-Role",
    "APIDeveloper-Role",
    "ApplicationSupport-Role",
    "ResearchScientist-Role",
    "PlatformEngineer-Role",
    "CloudDataArchitect-Role",
    "MLPlatformEngineer-Role",
    "ProductAnalyst-Role",
}

VALID_PREDICTIONS = {"INTENDED", "EXCESSIVE"}
VALID_RECOMMENDATIONS = {"KEEP", "REVIEW", "REMOVE"}

# Exactly 14 production fields
PRODUCTION_FIELDS = [
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


def parse_reason_codes(raw_reason_codes):
    """
    Parses reason_codes from CSV string representation into a Python list of strings.
    """
    if isinstance(raw_reason_codes, list):
        return raw_reason_codes
    if not raw_reason_codes or not isinstance(raw_reason_codes, str):
        return []

    cleaned = raw_reason_codes.strip()
    if not cleaned:
        return []

    # Attempt JSON parsing
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, list):
            return [str(item) for item in parsed]
    except Exception:
        pass

    # Attempt ast.literal_eval for Python literal list strings
    try:
        parsed = ast.literal_eval(cleaned)
        if isinstance(parsed, list):
            return [str(item) for item in parsed]
    except Exception:
        pass

    # Fallback to delimiter splitting if simple string
    if "|" in cleaned:
        return [item.strip() for item in cleaned.split("|") if item.strip()]
    if "," in cleaned and not (cleaned.startswith("[") and cleaned.endswith("]")):
        return [item.strip() for item in cleaned.split(",") if item.strip()]

    return [cleaned]


def transform_row(row):
    """
    Transforms a single CSV row dictionary into a 14-field recommendation object.
    Ensures strict type conversion and exact field matching.
    """
    rec_id = str(row.get("recommendation_id", "")).strip()
    user_id = str(row.get("user_id", "")).strip()
    role_id = str(row.get("role_id", "")).strip()
    action = str(row.get("action", "")).strip()
    resource = str(row.get("resource", "")).strip()
    risk_level = str(row.get("risk_level", "")).strip()
    prediction = str(row.get("prediction", "")).strip()
    recommendation = str(row.get("recommendation", "")).strip()
    explanation = str(row.get("explanation", "")).strip()
    model_version = str(row.get("model_version", "")).strip()
    generated_at = str(row.get("generated_at", "")).strip()

    raw_score = row.get("risk_score")
    try:
        risk_score = float(raw_score)
    except (ValueError, TypeError):
        raise ValueError(f"Recommendation '{rec_id}': risk_score must be numeric float, got '{raw_score}'")

    raw_weight = row.get("risk_weight")
    try:
        weight_num = float(raw_weight)
        risk_weight = int(weight_num) if weight_num.is_integer() else weight_num
    except (ValueError, TypeError):
        raise ValueError(f"Recommendation '{rec_id}': risk_weight must be numeric, got '{raw_weight}'")

    reason_codes = parse_reason_codes(row.get("reason_codes", []))

    item = {
        "recommendation_id": rec_id,
        "user_id": user_id,
        "role_id": role_id,
        "action": action,
        "resource": resource,
        "risk_score": risk_score,
        "risk_weight": risk_weight,
        "risk_level": risk_level,
        "prediction": prediction,
        "recommendation": recommendation,
        "reason_codes": reason_codes,
        "explanation": explanation,
        "model_version": model_version,
        "generated_at": generated_at,
    }

    # Verify emitted keys match exactly the 14 production fields
    if set(item.keys()) != set(PRODUCTION_FIELDS):
        raise ValueError(f"Recommendation '{rec_id}': emitted keys do not match the 14 production fields")

    return item


def validate_recommendations(items):
    """
    Validates a list of recommendation objects against the V2 contract rules.
    """
    if not items:
        raise ValueError("Validation failed: recommendation list is empty.")

    seen_ids = set()

    for idx, item in enumerate(items):
        rec_id = item.get("recommendation_id")
        if not rec_id:
            raise ValueError(f"Row {idx + 1}: missing required field 'recommendation_id'")

        if rec_id in seen_ids:
            raise ValueError(f"Duplicate recommendation_id '{rec_id}' found in batch (row {idx + 1})")
        seen_ids.add(rec_id)

        if not item.get("user_id"):
            raise ValueError(f"Recommendation '{rec_id}': missing required field 'user_id'")

        role_id = item.get("role_id")
        if not role_id:
            raise ValueError(f"Recommendation '{rec_id}': missing required field 'role_id'")
        if role_id not in VALID_V2_ROLES:
            raise ValueError(
                f"Recommendation '{rec_id}': invalid role_id '{role_id}'. Must be one of the 20 V2 role IDs."
            )

        if not item.get("action"):
            raise ValueError(f"Recommendation '{rec_id}': missing required field 'action'")

        if not item.get("resource"):
            raise ValueError(f"Recommendation '{rec_id}': missing required field 'resource'")

        score = item.get("risk_score")
        if not isinstance(score, (int, float)) or score < 0.0 or score > 1.0:
            raise ValueError(
                f"Recommendation '{rec_id}': risk_score must be numeric float in range [0.0, 1.0], got '{score}'"
            )

        weight = item.get("risk_weight")
        if not isinstance(weight, (int, float)) or isinstance(weight, bool):
            raise ValueError(
                f"Recommendation '{rec_id}': risk_weight must be numeric (int/float), got '{type(weight).__name__}'"
            )

        if not item.get("risk_level"):
            raise ValueError(f"Recommendation '{rec_id}': missing required field 'risk_level'")

        pred = item.get("prediction")
        if pred not in VALID_PREDICTIONS:
            raise ValueError(
                f"Recommendation '{rec_id}': invalid prediction '{pred}'. Must be INTENDED or EXCESSIVE."
            )

        rec = item.get("recommendation")
        if rec not in VALID_RECOMMENDATIONS:
            raise ValueError(
                f"Recommendation '{rec_id}': invalid recommendation '{rec}'. Must be KEEP, REVIEW, or REMOVE."
            )

        reasons = item.get("reason_codes")
        if not isinstance(reasons, list):
            raise ValueError(
                f"Recommendation '{rec_id}': reason_codes must be an array/list, got '{type(reasons).__name__}'"
            )

        if not item.get("model_version"):
            raise ValueError(f"Recommendation '{rec_id}': missing required field 'model_version'")

        if not item.get("generated_at"):
            raise ValueError(f"Recommendation '{rec_id}': missing required field 'generated_at'")

        # Ensure NO extra fields like 'confidence'
        keys = list(item.keys())
        if set(keys) != set(PRODUCTION_FIELDS):
            raise ValueError(
                f"Recommendation '{rec_id}': payload must contain exactly the 14 production fields. Got keys: {keys}"
            )


def load_and_transform_csv(csv_path, start=0, limit=None):
    """
    Reads the CSV file, transforms each row, applies start and limit, and validates items.
    """
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"Prediction CSV file not found at: {csv_path}")

    items = []
    with open(csv_path, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            if i < start:
                continue
            item = transform_row(row)
            items.append(item)
            if limit and len(items) >= limit:
                break

    validate_recommendations(items)
    return items


def create_batch_envelope(items):
    """
    Wraps recommendations list into the top-level batch envelope.
    """
    if not items:
        raise ValueError("Cannot create batch envelope from empty recommendations list.")

    model_version = items[0]["model_version"]
    generated_at = items[0]["generated_at"]

    return {
        "model_version": model_version,
        "generated_at": generated_at,
        "recommendations": items,
    }


def print_batch_summary(envelope, live_send=False):
    items = envelope.get("recommendations", [])
    model_version = envelope.get("model_version", "N/A")
    unique_users = set(item["user_id"] for item in items)
    unique_roles = set(item["role_id"] for item in items)

    rec_counts = Counter(item["recommendation"] for item in items)
    pred_counts = Counter(item["prediction"] for item in items)

    mode_str = "[LIVE SEND REQUEST]" if live_send else "[DRY-RUN / PREVIEW MODE]"

    print("\n==================================================")
    print(f"      ML -> Backend Ingestion Summary {mode_str}")
    print("==================================================")
    print(f"Selected records: {len(items)}")
    print(f"Model version:    {model_version}")
    print(f"Unique users:     {len(unique_users)}")
    print(f"Unique roles:     {len(unique_roles)}")
    print("Recommendations:")
    for k in ["KEEP", "REVIEW", "REMOVE"]:
        print(f"  {k:8s}: {rec_counts.get(k, 0)}")
    print("Predictions:")
    for k in ["INTENDED", "EXCESSIVE"]:
        print(f"  {k:8s}: {pred_counts.get(k, 0)}")
    print("==================================================")


def send_batch(api_url, envelope, timeout=30):
    """
    Transmits the batch payload to the API Gateway backend.
    """
    headers = {"Content-Type": "application/json"}
    try:
        response = requests.post(api_url, json=envelope, headers=headers, timeout=timeout)
        print(f"\n[HTTP Response Status]: {response.status_code}")
        try:
            body = response.json()
            print(f"[Accepted Count]:      {body.get('accepted_count', 'N/A')}")
            print(f"[Rejected Count]:      {body.get('rejected_count', 'N/A')}")
            print(f"[Status/Message]:      {body.get('status', body.get('message', 'N/A'))}")
            print(f"[Selected Batch Size]: {len(envelope.get('recommendations', []))}")
        except Exception:
            print(f"[Response Body]:       {response.text}")

        response.raise_for_status()
        return response
    except requests.exceptions.RequestException as e:
        print(f"\n[ERROR]: Failed to send recommendations batch: {e}")
        raise


def main():
    parser = argparse.ArgumentParser(
        description="Reads production ML prediction CSV and transmits recommendation batch to Backend API."
    )
    parser.add_argument(
        "--csv-path",
        default=DEFAULT_CSV_PATH,
        help="Path to final_production_predictions.csv (default: Documents/final_production_predictions.csv)",
    )
    parser.add_argument(
        "--start",
        type=int,
        default=0,
        help="Zero-based starting row after CSV loading (default: 0)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=3,
        help="Limit number of records to read (default: 3 for safe controlled batch)",
    )
    parser.add_argument(
        "--send",
        action="store_true",
        help="Explicit flag to execute live HTTP POST request to API endpoint (without --send, script runs in dry-run mode)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run in dry-run mode without sending HTTP requests (default behavior if --send is omitted)",
    )
    parser.add_argument(
        "--api-url",
        default=os.environ.get("RECOMMENDATIONS_API_URL", DEFAULT_API_URL),
        help="Target Backend API endpoint URL",
    )

    args = parser.parse_args()

    # Load and transform CSV
    items = load_and_transform_csv(args.csv_path, start=args.start, limit=args.limit)
    envelope = create_batch_envelope(items)

    is_live = args.send and not args.dry_run

    # Print summary
    print_batch_summary(envelope, live_send=is_live)

    if not is_live:
        print("\nNotice: Running in DRY-RUN mode. No HTTP requests were sent.")
        print("To send live batch, include the --send flag.")
        return

    # Live Send Execution
    print(f"\nSending live batch of {len(items)} records to: {args.api_url}")
    send_batch(args.api_url, envelope)


if __name__ == "__main__":
    main()
