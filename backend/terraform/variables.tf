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

variable "cors_origins" {
  type        = list(string)
  default     = ["http://127.0.0.1:5500"]
  description = "Allowed origins for API Gateway and Lambda backend CORS configuration."
}

