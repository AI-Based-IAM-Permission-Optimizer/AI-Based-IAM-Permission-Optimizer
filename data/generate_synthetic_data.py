import os
import random
import sys

import pandas as pd

sys.path.append(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)

from lambdas.parser.features import build_features


# ============================================================
# CONFIGURATION
# ============================================================

TARGET_FEATURE_ROWS = 20000
NUM_USERS = 24
RANDOM_SEED = 42

random.seed(RANDOM_SEED)


# ============================================================
# HITESH'S EXACT 4 DEMO ROLES
# ============================================================

hitesh_permissions = {
    "ApplicationDeveloper": [
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
    ],

    "DataAnalyst": [
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
    ],

    "DevOpsEngineer": [
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
    ],

    "BackendDeveloper": [
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
    ],
}


# Exact excessive permissions from Hitesh
hitesh_excessive = {
    "ApplicationDeveloper": [
        "s3:DeleteObject",
        "ec2:TerminateInstances",
        "dynamodb:DeleteItem",
        "iam:CreateUser",
    ],

    "DataAnalyst": [
        "s3:PutObject",
        "s3:DeleteObject",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem",
        "kms:DisableKey",
    ],

    "DevOpsEngineer": [
        "ec2:TerminateInstances",
        "rds:DeleteDBInstance",
        "cloudtrail:StopLogging",
        "iam:AttachRolePolicy",
        "iam:PutRolePolicy",
        "iam:PassRole",
        "kms:DisableKey",
    ],

    "BackendDeveloper": [
        "lambda:DeleteFunction",
        "dynamodb:DeleteItem",
        "sqs:DeleteMessage",
        "secretsmanager:GetSecretValue",
        "secretsmanager:DeleteSecret",
    ],
}


# ============================================================
# 8 ADDITIONAL SYNTHETIC ROLES
# ============================================================

synthetic_roles = [
    "CloudEngineer",
    "DatabaseAdministrator",
    "SecurityEngineer",
    "MLDataScientist",
    "CloudArchitect",
    "QAEngineer",
    "ProductEngineer",
    "PlatformEngineer",
]


all_roles = list(hitesh_permissions.keys()) + synthetic_roles


# ============================================================
# USERS — 2 USERS PER ROLE = 24 USERS
# ============================================================

users = {}

for index, role in enumerate(all_roles):
    users[f"synthetic-user-{index * 2 + 1:02d}"] = role
    users[f"synthetic-user-{index * 2 + 2:02d}"] = role


# ============================================================
# LOAD HITESH RISK TABLE
# ============================================================

risk = pd.read_csv(
    "data/AWS_Risk_Weight_Table_FINAL_4007_Actions_Shuffled.csv"
)

risk_actions = set(risk["action"])


# ============================================================
# BUILD 200-ACTION POOL
# ============================================================

hitesh_actions = set()

for actions in hitesh_permissions.values():
    hitesh_actions.update(actions)

# Keep all 60 actions used by Hitesh's demo policies.
additional_actions_needed = 200 - len(hitesh_actions)

available_extra_actions = sorted(
    risk_actions - hitesh_actions
)

additional_actions = random.sample(
    available_extra_actions,
    additional_actions_needed
)

action_pool = sorted(
    hitesh_actions.union(additional_actions)
)

print("Action pool:", len(action_pool))


# ============================================================
# SYNTHETIC ROLE PERMISSION MAPPING
# ============================================================

synthetic_mapping = {}

for role in synthetic_roles:

    # Every synthetic role has 200 granted actions.
    # 160 are intended and 40 are excessive.
    excessive = set(
        random.sample(action_pool, 40)
    )

    intended = set(action_pool) - excessive

    synthetic_mapping[role] = {
        "intended": intended,
        "excessive": excessive,
    }


# ============================================================
# GENERATE FEATURE-LEVEL USAGE COMBINATIONS
# ============================================================

feature_combinations = []

start_date = pd.Timestamp(
    "2026-08-01T00:00:00Z"
)


for user_id, role in users.items():

    # --------------------------------------------------------
    # Hitesh roles: preserve EXACT permission sets
    # --------------------------------------------------------

    if role in hitesh_permissions:

        granted_actions = hitesh_permissions[role]

        excessive_actions = set(
            hitesh_excessive[role]
        )

        intended_actions = (
            set(granted_actions)
            - excessive_actions
        )

        number_of_resources = 5

    # --------------------------------------------------------
    # Additional synthetic roles
    # --------------------------------------------------------

    else:

        granted_actions = action_pool

        excessive_actions = synthetic_mapping[
            role
        ]["excessive"]

        intended_actions = synthetic_mapping[
            role
        ]["intended"]

        number_of_resources = 5


    for action in granted_actions:

        # Add a 6th resource to most synthetic
        # role/action combinations.
        extra_resource = False

        if role in synthetic_roles:
            extra_resource = (
                random.random() < 0.99
            )

        resource_count = number_of_resources

        if extra_resource:
            resource_count += 1


        for resource_index in range(
            resource_count
        ):

            if action in excessive_actions:

                permission_status = "EXCESSIVE"

                usage_count = random.randint(1, 5)

                success_probability = random.uniform(
                    0.65,
                    0.88
                )

            elif action in intended_actions:

                permission_status = "INTENDED"

                usage_count = random.randint(5, 12)

                success_probability = random.uniform(
                    0.88,
                    0.99
                )

            else:

                permission_status = "EXCESSIVE"

                usage_count = random.randint(1, 4)

                success_probability = random.uniform(
                    0.65,
                    0.85
                )


            resource = (
                f"arn:aws:synthetic:"
                f"{action.split(':')[0]}:"
                f"123456789012:"
                f"resource-{resource_index + 1}"
            )


            for _ in range(usage_count):

                timestamp = (
                    start_date
                    + pd.Timedelta(
                        days=random.randint(0, 40),
                        hours=random.randint(0, 23),
                        minutes=random.randint(0, 59),
                    )
                )

                events_success = (
                    random.random()
                    < success_probability
                )

                feature_combinations.append(
                    {
                        "user_id": user_id,
                        "action": action,
                        "resource": resource,
                        "timestamp": timestamp.isoformat(),
                        "success": events_success,
                    }
                )


# ============================================================
# BUILD FEATURES
# ============================================================

features = build_features(
    feature_combinations
)


# ============================================================
# ROLE IDs
# ============================================================

role_mapping = {
    role: f"{role}-Role"
    for role in all_roles
}

features["role_id"] = features[
    "user_id"
].map(
    lambda user: role_mapping[
        users[user]
    ]
)


# ============================================================
# RESOURCE SCOPE
# ============================================================

features["resource_scope"] = "*"


# ============================================================
# PERMISSION STATUS
# ============================================================

def classify_permission(row):

    role = users[row["user_id"]]

    if role in hitesh_permissions:

        if row["action"] in hitesh_excessive[role]:
            return "EXCESSIVE"

        return "INTENDED"

    if row["action"] in synthetic_mapping[
        role
    ]["excessive"]:

        return "EXCESSIVE"

    return "INTENDED"


features["permission_status"] = features.apply(
    classify_permission,
    axis=1
)


# ============================================================
# JOIN RISK INFORMATION
# ============================================================

final = features.merge(
    risk[
        [
            "action",
            "operation_type",
            "risk_level",
            "risk_weight",
        ]
    ],
    on="action",
    how="left"
)


# ============================================================
# EXACTLY ~20,000 FEATURE RECORDS
# ============================================================

if len(final) > TARGET_FEATURE_ROWS:

    # Keep the Hitesh users represented.
    hitesh_user_ids = [
        user
        for user, role in users.items()
        if role in hitesh_permissions
    ]

    hitesh_part = final[
        final["user_id"].isin(hitesh_user_ids)
    ]

    synthetic_part = final[
        ~final["user_id"].isin(hitesh_user_ids)
    ]

    remaining = (
        TARGET_FEATURE_ROWS
        - len(hitesh_part)
    )

    synthetic_part = synthetic_part.sample(
        remaining,
        random_state=RANDOM_SEED
    )

    final = pd.concat(
        [
            hitesh_part,
            synthetic_part
        ],
        ignore_index=True
    )


elif len(final) < TARGET_FEATURE_ROWS:

    print(
        "WARNING: Generated fewer than target rows."
    )


# ============================================================
# RESET IDs
# ============================================================

final["id"] = range(
    1,
    len(final) + 1
)


# ============================================================
# SAVE
# ============================================================

final.to_csv(
    "data/processed/ml_ready_synthetic.csv",
    index=False
)

features.to_csv(
    "data/processed/synthetic_features.csv",
    index=False
)


# ============================================================
# SUMMARY
# ============================================================

print("\nSynthetic dataset created!")
print("Rows:", len(final))
print("Columns:", len(final.columns))
print("Unique users:", final["user_id"].nunique())
print("Unique roles:", final["role_id"].nunique())
print("Unique actions:", final["action"].nunique())
print("Missing values:", final.isna().sum().sum())

print("\nPermission status:")
print(
    final["permission_status"].value_counts()
)

print("\nRisk levels:")
print(
    final["risk_level"].value_counts()
)

print("\nSaved:")
print(
    "data/processed/ml_ready_synthetic.csv"
)
print(
    "data/processed/synthetic_features.csv"
)