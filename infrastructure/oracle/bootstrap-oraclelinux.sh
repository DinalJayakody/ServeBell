#!/usr/bin/env bash
# One-time server preparation for Oracle Linux 8/9 (user "opc"), e.g. Always Free E2.1.Micro or A1.
set -euo pipefail
echo "▶ Security updates"
sudo dnf -y -q update --security || sudo dnf -y -q update
echo "▶ Docker CE + compose plugin"
if ! command -v docker >/dev/null; then
  sudo dnf -y -q install dnf-plugins-core
  sudo dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo
  sudo dnf -y -q install docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi
echo '{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "5" } }' | sudo tee /etc/docker/daemon.json >/dev/null
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
echo "▶ Firewall: allow HTTP/HTTPS (firewalld)"
sudo firewall-cmd --permanent --add-service=http --add-service=https >/dev/null
sudo firewall-cmd --permanent --add-port=443/udp >/dev/null
sudo firewall-cmd --reload >/dev/null
echo "▶ Swap (4 GB) — essential on 1 GB instances"
if ! sudo swapon --show | grep -q /swapfile; then
  sudo dd if=/dev/zero of=/swapfile bs=1M count=4096 status=none && sudo chmod 600 /swapfile && sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-servebell.conf >/dev/null && sudo sysctl -q -p /etc/sysctl.d/99-servebell.conf
echo "▶ Automatic security updates + SSH brute-force protection"
sudo dnf -y -q install dnf-automatic
sudo sed -i 's/^upgrade_type.*/upgrade_type = security/; s/^apply_updates.*/apply_updates = yes/' /etc/dnf/automatic.conf
sudo systemctl enable --now dnf-automatic.timer
sudo dnf -y -q install oracle-epel-release-el9 2>/dev/null || sudo dnf -y -q install oracle-epel-release-el8 2>/dev/null || true
if sudo dnf -y -q install fail2ban 2>/dev/null; then
  printf '[sshd]\nenabled = true\nbackend = systemd\n' | sudo tee /etc/fail2ban/jail.d/sshd.local >/dev/null
  sudo systemctl enable --now fail2ban
fi
echo "✔ Server ready (log out/in so docker works without sudo)."
