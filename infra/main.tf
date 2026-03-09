terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "eu-central-1"
}

# ─── AMI: Amazon Linux 2023 (latest) ────────────────────────────────────────

data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# ─── Key pair (public key supplied as variable) ──────────────────────────────

resource "aws_key_pair" "deploy" {
  key_name   = "gameserver-deploy"
  public_key = var.public_key
}

# ─── IAM: empty instance role (no permissions — stateless server) ────────────

resource "aws_iam_role" "gameserver" {
  name = "gameserver-instance-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
}

resource "aws_iam_instance_profile" "gameserver" {
  name = "gameserver-instance-profile"
  role = aws_iam_role.gameserver.name
}

# ─── Security group ──────────────────────────────────────────────────────────

resource "aws_security_group" "gameserver" {
  name        = "gameserver-sg"
  description = "Game server: WebSocket signaling + WebRTC UDP"

  # SSH — key-based auth only. GitHub Actions runners have dynamic IPs so
  # restricting to a CIDR here requires a bastion or manual update.
  # After initial setup you can tighten this via var.ssh_allowed_cidr.
  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.ssh_allowed_cidr]
  }

  # WebSocket / HTTP signaling
  ingress {
    description = "WebSocket signaling"
    from_port   = var.server_port
    to_port     = var.server_port
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  # WebRTC UDP data channels
  ingress {
    description = "WebRTC UDP"
    from_port   = var.webrtc_port_start
    to_port     = var.webrtc_port_end
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  # ICMP (ping / MTU discovery)
  ingress {
    description = "ICMP"
    from_port   = -1
    to_port     = -1
    protocol    = "icmp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # All outbound allowed
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# ─── EC2 instance ────────────────────────────────────────────────────────────

resource "aws_instance" "gameserver" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = "t3.micro"
  key_name               = aws_key_pair.deploy.key_name
  iam_instance_profile   = aws_iam_instance_profile.gameserver.name
  vpc_security_group_ids = [aws_security_group.gameserver.id]

  # Root volume — 8 GB gp3, enough for the static binary + logs
  root_block_device {
    volume_type = "gp3"
    volume_size = 8
    encrypted   = true
  }

  user_data = <<-EOT
    #!/bin/bash
    set -euo pipefail

    # Create non-root service user
    useradd -r -m -d /opt/gameserver -s /sbin/nologin gameserver

    # Create working directory
    mkdir -p /opt/gameserver
    chown gameserver:gameserver /opt/gameserver

    # Place systemd unit file
    cat > /etc/systemd/system/gameserver.service << 'SERVICE'
    ${file("${path.module}/gameserver.service")}
    SERVICE

    systemctl daemon-reload
    systemctl enable gameserver
    # Binary is deployed by CI/CD — do NOT start the service here
  EOT

  tags = {
    Name = "need-for-fun-gameserver"
  }
}

# ─── Elastic IP (free while attached) ────────────────────────────────────────

resource "aws_eip" "gameserver" {
  instance = aws_instance.gameserver.id
  domain   = "vpc"

  tags = {
    Name = "need-for-fun-gameserver-eip"
  }
}

# ─── CloudWatch billing alarm ─────────────────────────────────────────────────
# Note: billing metrics are only available in us-east-1

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

resource "aws_sns_topic" "billing_alert" {
  provider = aws.us_east_1
  name     = "gameserver-billing-alert"
}

resource "aws_sns_topic_subscription" "billing_email" {
  provider  = aws.us_east_1
  topic_arn = aws_sns_topic.billing_alert.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

resource "aws_cloudwatch_metric_alarm" "billing_10usd" {
  provider            = aws.us_east_1
  alarm_name          = "gameserver-monthly-bill-10usd"
  alarm_description   = "AWS estimated charges exceeded $10 — check for unexpected resource usage"
  namespace           = "AWS/Billing"
  metric_name         = "EstimatedCharges"
  statistic           = "Maximum"
  period              = 86400  # 24 hours
  evaluation_periods  = 1
  threshold           = 10
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    Currency = "USD"
  }

  alarm_actions = [aws_sns_topic.billing_alert.arn]
}
