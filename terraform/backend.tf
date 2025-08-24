# terraform backend
terraform {
  backend "s3" {
    bucket  = "hackathon-ai-avengers-terraform-state"
    key     = "terraform.tfstate"
    region  = "af-south-1"
  }
}
