import pandas as pd

INPUT_FILE = "data/processed/reference_users_real_features.csv"
RISK_FILE = "data/AWS_Risk_Weight_Table_FINAL_4007_Actions_Shuffled.csv"
METADATA_FILE = "data/reference_metadata.csv"
OUTPUT_FILE = "data/processed/reference_users_real_ml_ready_v2.csv"

role_map = {
    "demo-developer": "ApplicationDeveloper",
    "demo-data-analyst": "DataAnalyst",
    "demo-devops": "DevOpsEngineer",
    "demo-backend-dev": "BackendDeveloper",
}

excessive = {
    "ApplicationDeveloper": {
        "s3:DeleteObject",
        "ec2:TerminateInstances",
        "dynamodb:DeleteItem",
        "iam:CreateUser",
    },
    "DataAnalyst": {
        "s3:PutObject",
        "s3:DeleteObject",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem",
        "kms:DisableKey",
    },
    "DevOpsEngineer": {
        "ec2:TerminateInstances",
        "rds:DeleteDBInstance",
        "cloudtrail:StopLogging",
        "iam:AttachRolePolicy",
        "iam:PutRolePolicy",
        "iam:PassRole",
        "kms:DisableKey",
    },
    "BackendDeveloper": {
        "lambda:DeleteFunction",
        "dynamodb:DeleteItem",
        "sqs:DeleteMessage",
        "secretsmanager:GetSecretValue",
        "secretsmanager:DeleteSecret",
    },
}

intended = {
    "ApplicationDeveloper": {
        "s3:GetObject",
        "s3:PutObject",
        "s3:ListBucket",
        "lambda:GetFunction",
        "lambda:UpdateFunctionCode",
        "lambda:InvokeFunction",
        "ec2:DescribeInstances",
        "ec2:StartInstances",
        "ec2:StopInstances",
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:Query",
        "iam:GetUser",
        "iam:GetRole",
        "iam:ListUsers",
        "iam:ListRoles",
    },
    "DataAnalyst": {
        "s3:GetObject",
        "s3:ListBucket",
        "dynamodb:GetItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "athena:GetQueryResults",
        "athena:StartQueryExecution",
        "athena:StopQueryExecution",
        "glue:GetDatabase",
        "glue:GetTable",
        "glue:GetPartitions",
        "kms:Decrypt",
        "kms:DescribeKey",
    },
    "DevOpsEngineer": {
        "ec2:DescribeInstances",
        "ec2:StartInstances",
        "ec2:StopInstances",
        "ec2:ModifyInstanceAttribute",
        "rds:DescribeDBInstances",
        "rds:StartDBInstance",
        "rds:StopDBInstance",
        "rds:ModifyDBInstance",
        "cloudwatch:GetMetricData",
        "cloudwatch:PutMetricData",
        "cloudtrail:GetTrail",
        "cloudtrail:DescribeTrails",
        "iam:ListRoles",
        "iam:GetRole",
        "kms:DescribeKey",
    },
    "BackendDeveloper": {
        "lambda:GetFunction",
        "lambda:InvokeFunction",
        "lambda:UpdateFunctionCode",
        "apigateway:GET",
        "apigateway:POST",
        "apigateway:PUT",
        "apigateway:PATCH",
        "apigateway:DELETE",
        "dynamodb:GetItem",
        "dynamodb:Query",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "sqs:GetQueueAttributes",
        "sqs:SendMessage",
        "sqs:ReceiveMessage",
        "sns:Publish",
        "sns:Subscribe",
        "secretsmanager:PutSecretValue",
    },
}

features = pd.read_csv(INPUT_FILE)
risk = pd.read_csv(RISK_FILE)
metadata = pd.read_csv(METADATA_FILE)

# Convert full IAM ARN to short reference user ID
features["reference_user"] = (
    features["user_id"]
    .str.split("/")
    .str[-1]
)

features["reference_role"] = (
    features["reference_user"]
    .map(role_map)
)

def classify_action(row):
    role = row["reference_role"]
    action = row["action"]

    if action in excessive.get(role, set()):
        return "EXCESSIVE"

    if action in intended.get(role, set()):
        return "INTENDED"

    return "NOT_IN_REFERENCE_POLICY"

features["permission_status"] = features.apply(
    classify_action,
    axis=1
)

# Add risk information
features = features.merge(
    risk[
        [
            "action",
            "operation_type",
            "risk_level",
            "risk_weight",
        ]
    ],
    on="action",
    how="left",
)

# IMPORTANT:
# Metadata contains short user IDs such as demo-developer,
# while features contain full IAM ARNs.
# Merge using the normalized reference_user field.
features = features.merge(
    metadata,
    left_on="reference_user",
    right_on="user_id",
    how="left",
    suffixes=("", "_metadata"),
)

# Remove duplicate metadata user_id column
features = features.drop(columns=["user_id_metadata"])

# Keep the original full IAM ARN as user_id
features["service"] = (
    features["action"]
    .str.split(":")
    .str[0]
)

required = [
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

features = features[required]

features.to_csv(
    OUTPUT_FILE,
    index=False
)

print("Real reference-user V2 dataset created!")
print("Rows:", len(features))
print("Columns:", len(features.columns))

print("\nPermission status:")
print(features["permission_status"].value_counts())

print("\nPermission age:")
print(features["permission_age_days"].value_counts(dropna=False))

print("\nMissing risk weights:")
print(features["risk_weight"].isna().sum())

print("\nMissing metadata:")
print("position:", features["position"].isna().sum())
print("department:", features["department"].isna().sum())
print("team:", features["team"].isna().sum())

print("\nOutput file:")
print(OUTPUT_FILE)