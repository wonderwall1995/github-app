#!/usr/bin/env bash
# Kubuntu에서 실행한다: 현재 프로젝트를 systemd 서비스(github-app)로 등록하고 바로 기동한다.
# 사용법: 프로젝트 루트에서 ./deploy/install-service.sh  (sudo 비밀번호를 물어본다)
set -euo pipefail

cd "$(dirname "$0")/.."
WORKDIR="$(pwd)"
RUN_USER="${SUDO_USER:-$USER}"
NODE="$(command -v node || true)"
SERVICE=/etc/systemd/system/github-app.service

[ -n "$NODE" ] || { echo "node를 찾을 수 없다. Node 22 이상을 먼저 설치한다."; exit 1; }
"$NODE" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' \
  || { echo "Node 22 이상이 필요하다 (현재 $("$NODE" -v))."; exit 1; }
[ -f .env ] || { echo ".env가 없다. .env.example을 복사해서 채운다."; exit 1; }
command -v pnpm >/dev/null || { echo "pnpm을 찾을 수 없다. 'corepack enable'을 먼저 실행한다."; exit 1; }

pnpm install --frozen-lockfile
pnpm build
[ -f dist/index.js ] || { echo "빌드 결과(dist/index.js)가 없다."; exit 1; }

# 비밀 파일 권한 제한
chmod 600 .env
find credentials -type f ! -name .gitkeep -exec chmod 600 {} +

sed -e "s|@USER@|$RUN_USER|g" -e "s|@WORKDIR@|$WORKDIR|g" -e "s|@NODE@|$NODE|g" \
  deploy/github-app.service.template | sudo tee "$SERVICE" >/dev/null

sudo systemctl daemon-reload
sudo systemctl enable github-app
sudo systemctl restart github-app

sleep 3
systemctl --no-pager --lines=15 status github-app || true
echo
echo "로그 보기: journalctl -u github-app -f"
