output "ec2_endpoint" {
  value = aws_instance.app_server.public_dns
}
