# create instance
resource "aws_instance" "app_server" {
  ami           = var.ami_id
  instance_type = var.instance_type

  subnet_id                   = aws_subnet.default_subnet.id
  vpc_security_group_ids      = [aws_security_group.instance_security_group.id]
  associate_public_ip_address = true

  key_name = var.instance_key_pair_name

  user_data = file("data/instance_init_data.sh")

  tags = {
    Name = "hackathon-ai-avengers-api-instance"
  }
}
