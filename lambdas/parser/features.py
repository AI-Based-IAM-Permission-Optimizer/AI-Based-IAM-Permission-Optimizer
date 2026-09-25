import pandas as pd


FEATURE_COLUMNS = [
    "id",
    "user_id",
    "role_id",
    "action",
    "resource",
    "resource_scope",
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
]


def build_features(events, permission_status="GRANTED"):
    df = pd.DataFrame(events)

    df["timestamp"] = pd.to_datetime(df["timestamp"])

    result = (
        df.groupby(
            ["user_id", "action", "resource"],
            dropna=False
        )
        .agg(
            usage_count=("action", "count"),
            unique_days_used=(
                "timestamp",
                lambda x: x.dt.date.nunique()
            ),
            first_used=("timestamp", "min"),
            last_used=("timestamp", "max"),
            success_count=("success", "sum"),
        )
        .reset_index()
    )

    result["failure_count"] = (
        result["usage_count"] - result["success_count"]
    )

    result["success_rate"] = (
        result["success_count"] / result["usage_count"]
    )

    result["failure_rate"] = (
        result["failure_count"] / result["usage_count"]
    )

    result["role_id"] = "demo-role"
    result["resource_scope"] = "*"
    result["permission_status"] = permission_status

    result["days_since_last_use"] = (
        pd.Timestamp.now(tz="UTC") - result["last_used"]
    ).dt.days

    result.insert(
        0,
        "id",
        range(1, len(result) + 1)
    )

    return result[FEATURE_COLUMNS]
