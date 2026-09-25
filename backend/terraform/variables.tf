variable "aws_region" {
  type        = string
  default     = "ap-south-1"
  description = "AWS Region for backend infrastructure deployment."
}

variable "dynamodb_table_name" {
  type        = string
  default     = "iam-permission-recommendations"
  description = "Name of the existing DynamoDB table for IAM recommendations."
}

variable "lambda_function_name" {
  type        = string
  default     = "ai-iam-permission-backend"
  description = "Name of the AWS Lambda function for the Express backend."
}
