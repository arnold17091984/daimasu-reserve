#!/usr/bin/env bash
# One-time bootstrap for a fresh Vultr Ubuntu 24.04 VPS.
# Owner runs this after provisioning the instance and pointing DNS.
#
# What it does:
#   1. Hardens SSH (disables password auth — assumes you've added your pubkey)
#   2. Installs Docker + Compose plugin
#   3. Creates /opt/daimasu with the Caddyfile + compose file
#   4. Sets up UFW (allow 22, 80, 443 only)
#   5. Creates an unprivileged deploy user
#
# Usage (on the VPS as root):
#   curl -fsSL https://raw.githubusercontent.com/kjh960120-dev/daimasu-projection-mapping/main/deploy/vultr-bootstrap.sh | bash
#
# After this, copy /opt/daimasu/.env.production from your local machine via scp.

set -euo pipefail

if [[ "$EUID" -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

# ── 1. apt baseline ────────────────────────────────────────────────────────────
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -y upgrade
apt-get -y install ca-certificates curl gnupg ufw fail2ban unattended-upgrades

# ── 2. Docker + Compose plugin (official Docker repo) ─────────────────────────
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# ── 3. unprivileged deploy user ───────────────────────────────────────────────
if ! id -u deploy >/dev/null 2>&1; then
  useradd -m -s /bin/bash -G docker deploy
  mkdir -p /home/deploy/.ssh
  chmod 700 /home/deploy/.ssh
  if [[ -f /root/.ssh/authorized_keys ]]; then
    cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
    chown -R deploy:deploy /home/deploy/.ssh
    chmod 600 /home/deploy/.ssh/authorized_keys
  fi
fi

# ── 4. /opt/daimasu skeleton ──────────────────────────────────────────────────
mkdir -p /opt/daimasu
chown deploy:deploy /opt/daimasu
echo "Place docker-compose.yml + Caddyfile + .env.production in /opt/daimasu/"

# ── 5. Firewall ───────────────────────────────────────────────────────────────
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment "ssh"
ufw allow 80/tcp comment "http"
ufw allow 443/tcp comment "https"
ufw --force enable

# ── 6. SSH hardening ──────────────────────────────────────────────────────────
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
systemctl restart ssh

# ── 7. Unattended security upgrades ───────────────────────────────────────────
dpkg-reconfigure -f noninteractive unattended-upgrades

cat <<EOM

==============================================================================
  Vultr bootstrap done.

  Next steps (from your local machine):
    1. scp docker-compose.yml deploy@<IP>:/opt/daimasu/
    2. scp deploy/Caddyfile  deploy@<IP>:/opt/daimasu/Caddyfile
    3. scp .env.production   deploy@<IP>:/opt/daimasu/.env.production
       (production env file — see docs/SETUP.md)
    4. Add deploy SSH key to GitHub repo secrets as VULTR_SSH_KEY
    5. First deploy:
         ssh deploy@<IP>
         cd /opt/daimasu && docker compose up -d
==============================================================================
EOM
