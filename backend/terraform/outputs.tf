output "api_endpoint" {
  description = "The HTTP endpoint URL of the deployed API Gateway."
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "lambda_function_name" {
  description = "The name of the backend Lambda function."
  value       = aws_lambda_function.backend.function_name
}

output "lambda_function_arn" {
  description = "The ARN of the backend Lambda function."
  value       = aws_lambda_function.backend.arn
}

output "dynamodb_table_name" {
  description = "The referenced DynamoDB table name."
  value       = var.dynamodb_table_name
}
