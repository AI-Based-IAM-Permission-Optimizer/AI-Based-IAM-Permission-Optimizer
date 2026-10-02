terraform {
  backend "s3" {
    bucket         = "iamopt-terraform-state-713362557040"
    key            = "aaliya-data/terraform.tfstate"
    region         = "ap-south-1"
    dynamodb_table = "iamopt-terraform-locks"
    encrypt        = true
  }
}