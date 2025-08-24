# create vpc
resource "aws_vpc" "snapcore_vpc" {
  cidr_block = var.vpc_cidr_block

  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "hackathon-ai-avengers-vpc"
  }
}

# create vpc subnet
resource "aws_subnet" "default_subnet" {
  vpc_id                  = aws_vpc.snapcore_vpc.id
  cidr_block              = var.subnet_cidr_block
  availability_zone       = var.availability_zone
  map_public_ip_on_launch = true

  tags = {
    Name = "vpc-subnet"
  }
}

resource "aws_subnet" "second_subnet" {
  vpc_id                  = aws_vpc.snapcore_vpc.id
  cidr_block              = var.second_subnet_cidr_block
  availability_zone       = var.availability_zone_b
  map_public_ip_on_launch = true

  tags = {
    Name = "vpc-second-subnet"
  }
}

# create internet gateway for our vpc
resource "aws_internet_gateway" "vpc_igw" {
  vpc_id = aws_vpc.snapcore_vpc.id

  tags = {
    Name = "hackathon-ai-avengers-vpc-internet-gateway"
  }
}

# create subnet route table
resource "aws_route_table" "default_route_table" {
  vpc_id = aws_vpc.snapcore_vpc.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.vpc_igw.id
  }

  tags = {
    Name = "default-route-table"
  }
}

# route table associations
resource "aws_route_table_association" "default_route_table_assoc" {
  subnet_id      = aws_subnet.default_subnet.id
  route_table_id = aws_route_table.default_route_table.id
}

resource "aws_route_table_association" "second_route_table_assoc" {
  subnet_id      = aws_subnet.second_subnet.id
  route_table_id = aws_route_table.default_route_table.id
}

