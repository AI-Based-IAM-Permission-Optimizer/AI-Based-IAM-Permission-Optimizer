terraform {
  backend "s3" {
    bucket         = "iamopt-terraform-state-713362557040"
    key            = "aarya-backend/terraform.tfstate"
    region         = "ap-south-1"
    dynamodb_table = "iamopt-terraform-locks"
    encrypt        = true
  }
}