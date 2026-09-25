terraform {
  required_version = ">= 1.0.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

# Construct the existing DynamoDB table ARN from known, stable identifiers.
# The table already exists and must NOT be created, modified, or destroyed by Terraform.
# We avoid using data "aws_dynamodb_table" because the aarya-backend IAM user does not
# have dynamodb:DescribeContinuousBackups, which the Terraform AWS provider calls internally.
locals {
  dynamodb_table_arn = "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/${var.dynamodb_table_name}"
}
