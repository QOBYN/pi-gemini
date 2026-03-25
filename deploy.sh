#!/usr/bin/env bash
# deploy.sh — Deploy pi-gemini lên VPS
#
# Usage:
#   VPS=user@host ./pi-gemini/deploy.sh
#
# Yêu cầu trên VPS:
#   - node, npm (hoặc pnpm)
#   - pm2 (npm install -g pm2)
#   - ~/apps/pi-gemini/.env đã có sẵn
#
# Env vars:
#   VPS       — user@host (bắt buộc)
#   VPS_PORT  — SSH port (default: 22)
#   APP_PORT  — port app chạy (default: 3004)

set -euo pipefail

VPS="${VPS:-${1:-}}"
[[ -z "$VPS" ]] && { echo "Usage: VPS=user@host $0"; exit 1; }

VPS_PORT="${VPS_PORT:-22}"
APP_PORT="${APP_PORT:-3004}"
SERVICE="pi-gemini"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE_DIR="~/apps/$SERVICE"

echo "==> Deploy $SERVICE → $VPS:$APP_PORT"

# 1. Build
echo "--- Build ---"
cd "$SRC_DIR"
pnpm install --frozen-lockfile
pnpm run build

# 2. Pack (không include node_modules — sẽ install trên VPS để build native modules đúng platform)
echo "--- Pack ---"
TMP_PACK="$(mktemp).tar.gz"
tar -czf "$TMP_PACK" \
  --exclude='node_modules' \
  --exclude='.env*' \
  dist/ public/ package.json pnpm-lock.yaml
echo "    $(du -sh "$TMP_PACK" | cut -f1)"

# 3. Upload
echo "--- Upload ---"
scp -P "$VPS_PORT" "$TMP_PACK" "$VPS:/tmp/$SERVICE.tar.gz"
rm -f "$TMP_PACK"

# 4. Remote: extract + install deps (với build scripts) + restart
echo "--- Remote deploy ---"
ssh -p "$VPS_PORT" "$VPS" "
  set -e
  mkdir -p $REMOTE_DIR
  tar -xzf /tmp/$SERVICE.tar.gz -C $REMOTE_DIR 2>/dev/null
  rm /tmp/$SERVICE.tar.gz
  cd $REMOTE_DIR
  pnpm install --prod --frozen-lockfile --config.unsafe-perm=true
  npm rebuild better-sqlite3
  mkdir -p $REMOTE_DIR/data
  pm2 restart $SERVICE 2>/dev/null || pm2 start dist/server.js --name $SERVICE --log /dev/null
  pm2 save
"

echo "==> Done. http://$VPS:$APP_PORT/health"
