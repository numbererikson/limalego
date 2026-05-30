#!/usr/bin/env bash
# Generate concrete systemd unit files from the templates in this directory
# and install them. Run as the user who will own the service.
#
# Usage:  ./install.sh
set -euo pipefail

THIS_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_ROOT="$(cd "$THIS_DIR/../.." && pwd)"
USER_NAME="$(id -un)"

for tmpl in "$THIS_DIR"/*.template; do
  out="${tmpl%.template}"
  sed -e "s|__USER__|$USER_NAME|g" \
      -e "s|__APP_ROOT__|$APP_ROOT|g" \
      "$tmpl" > "$out"
  echo "Generated: $out"
done

echo
echo "Installing to /etc/systemd/system/ (requires sudo)..."
sudo install -m 644 "$THIS_DIR"/limalego-backend.service  /etc/systemd/system/
sudo install -m 644 "$THIS_DIR"/limalego-frontend.service /etc/systemd/system/
sudo install -m 644 "$THIS_DIR"/limalego-backup.service   /etc/systemd/system/
sudo install -m 644 "$THIS_DIR"/limalego-backup.timer     /etc/systemd/system/
sudo systemctl daemon-reload

echo
echo "To start everything:"
echo "  sudo systemctl enable --now limalego-backend.service"
echo "  sudo systemctl enable --now limalego-frontend.service"
echo "  sudo systemctl enable --now limalego-backup.timer"
