import pandas as pd

INPUT_FILE = "data/processed/reference_users_real_ml_ready_v2.csv"
OUTPUT_FILE = "data/processed/real_policy_comparison.csv"

df = pd.read_csv(INPUT_FILE)

# Reference-policy actions from Hitesh's mapping
policy_actions = {
    "demo-developer": {
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket",
        "lambda:GetFunction",
        "lambda:UpdateFunctionCode",
        "lambda:InvokeFunction",
        "ec2:DescribeInstances",
        "ec2:StartInstances",
        "ec2:StopInstances",
        "ec2:TerminateInstances",
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "iam:GetUser",
        "iam:GetRole",
        "iam:ListUsers",
        "iam:ListRoles",
        "iam:CreateUser",
    },

    "demo-data-analyst": {
        "s3:GetObject",
        "s3:ListBucket",
        "s3:PutObject",
        "s3:DeleteObject",
        "dynamodb:GetItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem",
        "athena:GetQueryResults",
        "athena:StartQueryExecution",
        "athena:StopQueryExecution",
        "glue:GetDatabase",
        "glue:GetTable",
        "glue:GetPartitions",
        "kms:Decrypt",
        "kms:DescribeKey",
        "kms:DisableKey",
    },

    "demo-devops": {
        "ec2:DescribeInstances",
        "ec2:StartInstances",
        "ec2:StopInstances",
        "ec2:TerminateInstances",
        "ec2:ModifyInstanceAttribute",
        "rds:DescribeDBInstances",
        "rds:StartDBInstance",
        "rds:StopDBInstance",
        "rds:ModifyDBInstance",
        "rds:DeleteDBInstance",
        "cloudwatch:GetMetricData",
        "cloudwatch:PutMetricData",
        "cloudtrail:GetTrail",
        "cloudtrail:DescribeTrails",
        "cloudtrail:StopLogging",
        "iam:ListRoles",
        "iam:GetRole",
        "iam:AttachRolePolicy",
        "iam:PutRolePolicy",
        "iam:PassRole",
        "kms:DescribeKey",
        "kms:DisableKey",
    },

    "demo-backend-dev": {
        "lambda:GetFunction",
        "lambda:InvokeFunction",
        "lambda:UpdateFunctionCode",
        "lambda:DeleteFunction",
        "apigateway:GET",
        "apigateway:POST",
        "apigateway:PUT",
        "apigateway:PATCH",
        "apigateway:DELETE",
        "dynamodb:GetItem",
        "dynamodb:Query",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "sqs:GetQueueAttributes",
        "sqs:SendMessage",
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sns:Publish",
        "sns:Subscribe",
        "secretsmanager:GetSecretValue",
        "secretsmanager:PutSecretValue",
        "secretsmanager:DeleteSecret",
    },
}

def extract_user(user_arn):
    return user_arn.split("/")[-1]

df["reference_user"] = df["user_id"].apply(extract_user)

df["in_reference_policy"] = df.apply(
    lambda row: row["action"] in policy_actions.get(row["reference_user"], set()),
    axis=1
)

df["baseline_excessive"] = df["permission_status"].eq("EXCESSIVE")

df["validation_status"] = df.apply(
    lambda row: (
        "BASELINE_EXCESSIVE"
        if row["baseline_excessive"]
        else (
            "OBSERVED_AND_IN_REFERENCE_POLICY"
            if row["in_reference_policy"]
            else "OBSERVED_NOT_IN_REFERENCE_POLICY"
        )
    ),
    axis=1
)

output_columns = [
    "reference_user",
    "action",
    "in_reference_policy",
    "baseline_excessive",
    "validation_status",
]

comparison = df[output_columns].sort_values(
    ["reference_user", "action"]
)

comparison.to_csv(OUTPUT_FILE, index=False)

print("Policy comparison created!")
print("Rows:", len(comparison))

print("\nValidation status:")
print(comparison["validation_status"].value_counts())

print("\nComparison:")
print(comparison.to_string(index=False))

print("\nSaved to:")
print(OUTPUT_FILE)
