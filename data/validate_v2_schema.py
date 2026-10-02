import pandas as pd

REQUIRED_COLUMNS = [
    "id",
    "user_id",
    "role_id",
    "position",
    "department",
    "team",
    "action",
    "resource",
    "resource_scope",
    "permission_age_days",
    "policy_attachment",
    "usage_count",
    "unique_days_used",
    "days_since_last_use",
    "first_used",
    "last_used",
    "success_count",
    "failure_count",
    "success_rate",
    "failure_rate",
    "permission_status",
    "service",
    "operation_type",
    "risk_level",
    "risk_weight",
]

df = pd.read_csv("data/processed/ml_ready.csv")

missing = [col for col in REQUIRED_COLUMNS if col not in df.columns]

print("Current columns:", len(df.columns))
print("V2 expected columns:", len(REQUIRED_COLUMNS))

if missing:
    print("\nMissing V2 columns:")
    for col in missing:
        print("-", col)
else:
    print("\nAll V2 columns are present.")

print("\nCurrent dataset shape:", df.shape)