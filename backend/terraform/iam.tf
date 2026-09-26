# Reference existing team-managed IAM role for Lambda execution.
# This role is NOT created or modified by Terraform — it is managed separately by the team.
data "aws_iam_role" "lambda_exec" {
  name = "AI-IAM-Lambda-Execution-Role"
}

# ---------------------------------------------------------------------------
# Deployment permissions for the aarya-backend IAM user
#
# Grants the minimum set of actions required for Terraform to deploy and manage:
#   - API Gateway HTTP API (v2) resources
#   - Lambda function and its resource-based policy (lambda:AddPermission)
#   - CloudWatch Logs log group for the Lambda function
#   - iam:PassRole — scoped ONLY to AI-IAM-Lambda-Execution-Role so that
#     Lambda can assume it; does NOT grant any ability to modify the role.
#
# The Lambda execution role (AI-IAM-Lambda-Execution-Role) is intentionally
# excluded from any create/modify/delete actions here.
# ---------------------------------------------------------------------------

# --- 1. API Gateway v2 (HTTP API) management ---
resource "aws_iam_policy" "aarya_backend_apigateway" {
  name        = "aarya-backend-apigateway-deploy"
  description = "--"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ManageBackendApiGateway"
        Effect = "Allow"
        Action = [
          "apigateway:POST",
          "apigateway:GET",
          "apigateway:PUT",
          "apigateway:PATCH",
          "apigateway:DELETE"
        ]
        Resource = [
          "arn:aws:apigateway:ap-south-1::/apis",
          "arn:aws:apigateway:ap-south-1::/apis/*",
          "arn:aws:apigateway:ap-south-1::/tags/*"
        ]
      }
    ]
  })
}

resource "aws_iam_user_policy_attachment" "aarya_backend_apigateway" {
  user       = "aarya-backend"
  policy_arn = aws_iam_policy.aarya_backend_apigateway.arn
}

# --- 2. Lambda function lifecycle management ---
resource "aws_iam_policy" "aarya_backend_lambda" {
  name        = "aarya-backend-lambda-deploy"
  description = "--"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ManageBackendLambdaFunctions"
        Effect = "Allow"
        Action = [
          "lambda:CreateFunction",
          "lambda:UpdateFunctionCode",
          "lambda:UpdateFunctionConfiguration",
          "lambda:GetFunction",
          "lambda:GetFunctionConfiguration",
          "lambda:GetFunctionCodeSigningConfig",
          "lambda:DeleteFunction",
          "lambda:AddPermission",
          "lambda:RemovePermission",
          "lambda:GetPolicy"
        ]
        Resource = "arn:aws:lambda:ap-south-1:713362557040:function:ai-iam-permission-backend"
      },
      {
        Sid      = "ListLambdaFunctions"
        Effect   = "Allow"
        Action   = ["lambda:ListFunctions"]
        Resource = "*"
      },
      {
        Sid    = "TagBackendLambda"
        Effect = "Allow"
        Action = [
          "lambda:TagResource",
          "lambda:UntagResource",
          "lambda:ListTags"
        ]
        Resource = "arn:aws:lambda:ap-south-1:713362557040:function:ai-iam-permission-backend"
      }
    ]
  })
}

resource "aws_iam_user_policy_attachment" "aarya_backend_lambda" {
  user       = "aarya-backend"
  policy_arn = aws_iam_policy.aarya_backend_lambda.arn
}

# --- 3. CloudWatch Logs — Lambda log group management ---
resource "aws_iam_policy" "aarya_backend_logs" {
  name        = "aarya-backend-logs-deploy"
  description = "--"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ManageBackendLogGroup"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:DeleteLogGroup",
          "logs:PutRetentionPolicy",
          "logs:DeleteRetentionPolicy",
          "logs:ListTagsForResource",
          "logs:TagResource",
          "logs:UntagResource"
        ]
        Resource = [
          "arn:aws:logs:ap-south-1:713362557040:log-group:/aws/lambda/ai-iam-permission-backend",
          "arn:aws:logs:ap-south-1:713362557040:log-group:/aws/lambda/ai-iam-permission-backend:*"
        ]
      },
      {
        Sid      = "DescribeBackendLogGroups"
        Effect   = "Allow"
        Action   = ["logs:DescribeLogGroups"]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_user_policy_attachment" "aarya_backend_logs" {
  user       = "aarya-backend"
  policy_arn = aws_iam_policy.aarya_backend_logs.arn
}

# --- 4. iam:PassRole — scoped exclusively to the existing Lambda execution role ---
#
# This allows Terraform (running as aarya-backend) to pass AI-IAM-Lambda-Execution-Role
# to the Lambda service when creating/updating the function. It does NOT grant any
# ability to modify, delete, or attach policies to the role itself.
resource "aws_iam_policy" "aarya_backend_passrole" {
  name        = "aarya-backend-passrole-lambda-exec"
  description = "--"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "PassOnlyBackendLambdaExecutionRole"
        Effect = "Allow"
        Action = [
          "iam:PassRole",
          "iam:GetRole"
        ]
        Resource = "arn:aws:iam::713362557040:role/AI-IAM-Lambda-Execution-Role"
        Condition = {
          StringEquals = {
            "iam:PassedToService" = "lambda.amazonaws.com"
          }
        }
      }
    ]
  })
}

resource "aws_iam_user_policy_attachment" "aarya_backend_passrole" {
  user       = "aarya-backend"
  policy_arn = aws_iam_policy.aarya_backend_passrole.arn
}
