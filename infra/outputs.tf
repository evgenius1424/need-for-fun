output "elastic_ip" {
  description = "Elastic IP address of the game server — add this to GitHub Secrets as EC2_HOST"
  value       = aws_eip.gameserver.public_ip
}

output "instance_id" {
  description = "EC2 instance ID (for console access or AWS CLI operations)"
  value       = aws_instance.gameserver.id
}

output "instance_ip" {
  description = "Current private IP of the EC2 instance (for reference)"
  value       = aws_instance.gameserver.private_ip
}
