variable "alert_email" {
  description = "Email address for CloudWatch billing alarm notifications (must confirm the SNS subscription after apply)"
  type        = string
}

variable "public_key" {
  description = "ED25519 SSH public key content for the deploy keypair. Generate with: ssh-keygen -t ed25519 -f deploy_key"
  type        = string
}

variable "ssh_allowed_cidr" {
  description = <<-EOT
    CIDR block allowed to reach SSH (port 22).
    GitHub Actions runner IPs are dynamic, so set this to \"0.0.0.0/0\" for
    automated deploys and tighten it manually post-setup (or use a bastion).
    Example: \"203.0.113.5/32\" to restrict to a single IP.
  EOT
  type    = string
  default = "0.0.0.0/0"
}

variable "server_port" {
  description = "TCP port the game server listens on for HTTP/WebSocket signaling (matches SERVER_PORT env var)"
  type        = number
  default     = 3001
}

variable "webrtc_port_start" {
  description = "Start of the UDP port range for WebRTC data channels"
  type        = number
  default     = 10000
}

variable "webrtc_port_end" {
  description = "End of the UDP port range for WebRTC data channels"
  type        = number
  default     = 10100
}
