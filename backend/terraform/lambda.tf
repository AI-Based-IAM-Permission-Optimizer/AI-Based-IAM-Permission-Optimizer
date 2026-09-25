# The Lambda deployment zip is built by build_lambda.ps1 (run before terraform plan/apply).
# This avoids the Windows/pnpm symlink issue with the archive provider on OneDrive paths.
# Run: powershell -ExecutionPolicy Bypass -File build_lambda.ps1
locals {
  lambda_zip_path = "${path.module}/lambda_payload.zip"
}


# CloudWatch log group for Lambda function
resource "aws_cloudwatch_log_group" "lambda_logs" {
  name              = "/aws/lambda/${var.lambda_function_name}"
  retention_in_days = 14
}

# AWS Lambda function hosting Express app via @vendia/serverless-express handler
resource "aws_lambda_function" "backend" {
  filename         = local.lambda_zip_path
  source_code_hash = filemd5(local.lambda_zip_path)
  function_name    = var.lambda_function_name
  role             = aws_iam_role.lambda_exec.arn
  handler          = "src/lambda.handler"
  runtime          = "nodejs20.x"
  timeout          = 15
  memory_size      = 256

  environment {
    variables = {
      AWS_REGION          = var.aws_region
      DYNAMODB_TABLE_NAME = var.dynamodb_table_name
      NODE_ENV            = "production"
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.lambda_logs,
    aws_iam_role_policy_attachment.lambda_least_privilege_attach
  ]
}
