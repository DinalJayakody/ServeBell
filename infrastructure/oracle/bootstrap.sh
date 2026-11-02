#!/usr/bin/env bash
# One-time server preparation for Oracle Cloud (Ubuntu 22.04/24.04, Ampere A1 or AMD).
# Run on the server:  bash infrastructure/oracle/bootstrap.sh
set -euo pipefail
# Oracle Linux images (user "opc") use dnf/firewalld — delegate.
if [ -f /etc/oracle-release ]; then exec bash "$(dirname "$0")/bootstrap-oraclelinux.sh"; fi
[ "$(id -u)" -eq 0 ] && { echo "Run as the default 'ubuntu' user (it uses sudo)."; exit 1; }

echo "▶ Updating packages"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl git ufw fail2ban unattended-upgrades netfilter-persistent iptables-persistent

echo "▶ Installing Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo usermod -aG docker "$USER"
sudo systemctl enable --now docker

echo "▶ Opening ports 80/443 in the instance firewall"
# Oracle's Ubuntu images ship iptables rules that REJECT everything except SSH.
# Insert ACCEPT rules before that REJECT rule and persist them.
for port in 80 443; do
  sudo iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 6 -p tcp --dport "$port" -m state --state NEW -j ACCEPT
done
sudo iptables -C INPUT -p udp --dport 443 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 6 -p udp --dport 443 -j ACCEPT
sudo netfilter-persistent save

echo "▶ Swap (protects builds on small instances)"
if ! sudo swapon --show | grep -q /swapfile; then
  sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

echo "▶ Automatic security updates + SSH brute-force protection"
sudo dpkg-reconfigure -f noninteractive unattended-upgrades
sudo systemctl enable --now fail2ban

echo "▶ Docker log rotation"
echo '{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "5" } }' | sudo tee /etc/docker/daemon.json >/dev/null
sudo systemctl restart docker

echo "✔ Server ready. Log out and back in (so 'docker' works without sudo), then run: bash infrastructure/oracle/deploy.sh"
