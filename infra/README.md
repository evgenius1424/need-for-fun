# Game Server Infrastructure

AWS infrastructure for the **Need For Fun** game server, provisioned with Terraform.

- **Region**: `eu-central-1` (Frankfurt)
- **Compute**: t3.micro EC2, Amazon Linux 2023
- **Networking**: Elastic IP (stable address across reboots)
- **Cost guard**: CloudWatch billing alarm at $10/month → SNS email

---

## Prerequisites

- [Terraform ≥ 1.6](https://developer.hashicorp.com/terraform/downloads)
- AWS CLI configured (`aws configure`) with an IAM user that has EC2, IAM, CloudWatch, and SNS permissions
- A GitHub repo with Actions enabled

---

## One-Time Setup

### 1. Generate deploy SSH keypair

Run this locally (do **not** commit the private key):

```bash
ssh-keygen -t ed25519 -f deploy_key -C "gameserver-deploy"
# Creates: deploy_key (private) and deploy_key.pub (public)
```

### 2. Provision infrastructure

```bash
cd infra/
terraform init
terraform apply
```

Terraform will prompt for:

| Variable | Value |
|---|---|
| `alert_email` | Your email for billing alerts |
| `public_key` | Paste the content of `deploy_key.pub` |

Leave all other variables at their defaults unless you need different ports.

After apply completes, note the outputs:

```
elastic_ip  = "x.x.x.x"   ← copy this
instance_id = "i-..."
```

### 3. Add GitHub Secrets

In your repository → **Settings → Secrets and variables → Actions**, add:

| Secret name | Value |
|---|---|
| `EC2_HOST` | The `elastic_ip` output from step 2 |
| `EC2_SSH_KEY` | Content of `deploy_key` (the private key, PEM format) |

### 4. Allow `gameserver` user to manage its service

SSH into the instance (once, manually):

```bash
ssh -i deploy_key ec2-user@<elastic_ip>
sudo visudo -f /etc/sudoers.d/gameserver
```

Add exactly this line:

```
gameserver ALL=(ALL) NOPASSWD: /bin/systemctl start gameserver, /bin/systemctl stop gameserver, /bin/systemctl restart gameserver, /bin/systemctl status gameserver
```

Save and exit. This is the minimum needed for the CI/CD pipeline to manage the service without a full root shell.

### 5. Confirm billing alarm email

After `terraform apply`, AWS sends a confirmation email to `alert_email`. **You must click the confirmation link** or the alarm will never send notifications.

---

## How the Billing Alarm Works

- The alarm watches `AWS/Billing → EstimatedCharges` in `us-east-1` (the only region where billing metrics are published).
- It checks once per day (period = 86400s).
- If the estimated monthly bill reaches or exceeds **$10**, it publishes to the `gameserver-billing-alert` SNS topic.
- The SNS topic sends an email to `var.alert_email`.
- Free Tier usage is reflected in estimated charges, so the alarm won't fire if you stay within Free Tier limits.

---

## SSH Access for Debugging

```bash
# As the deploy user (deploy key)
ssh -i deploy_key gameserver@<elastic_ip>

# As ec2-user (if you need sudo / system access)
ssh -i deploy_key ec2-user@<elastic_ip>
```

Useful debug commands on the instance:

```bash
# Check service status and recent logs
sudo systemctl status gameserver
sudo journalctl -u gameserver -n 100 -f

# Restart manually
sudo systemctl restart gameserver

# Check binary
file /opt/gameserver/server
/opt/gameserver/server --version  # if --version is implemented
```

---

## Port Reference

| Port | Protocol | Purpose | Source |
|------|----------|---------|--------|
| 22 | TCP | SSH (key-based auth only) | `var.ssh_allowed_cidr` (default: 0.0.0.0/0) |
| 3001 | TCP | WebSocket signaling / HTTP API | 0.0.0.0/0 |
| 10000–10100 | UDP | WebRTC data channels | 0.0.0.0/0 |

> **SSH restriction**: GitHub Actions runner IPs are dynamic, so SSH is open to
> `0.0.0.0/0` by default but protected by **key-based authentication only**
> (password auth is disabled on Amazon Linux 2023). For stricter lockdown after
> initial setup, set `var.ssh_allowed_cidr` to your office/home IP or add a
> bastion host.

> **WebRTC port range**: The `webrtc` crate needs to be configured to use the
> 10000–10100 range via `SettingEngine::set_ephemeral_udp_port_range()`.
> Until that's wired up the firewall rule is open but the server may use OS
> ephemeral ports instead. See the crate docs for configuration details.

---

## Tearing Everything Down

```bash
cd infra/
terraform destroy
```

This removes the EC2 instance, Elastic IP, security group, IAM role, SNS topic, and CloudWatch alarm. It does **not** delete the GitHub Secrets — remove those manually.

---

## Cost Estimate (post-Free-Tier)

| Resource | Cost |
|----------|------|
| t3.micro (always-on) | ~$7.59/month |
| Elastic IP (attached) | Free |
| gp3 8 GB root volume | ~$0.64/month |
| CloudWatch alarm | Free (1 alarm) |
| SNS email | Free |
| Data transfer (outbound) | ~$0.09/GB after 100 GB/month |
| **Total estimate** | **< $10/month** |
