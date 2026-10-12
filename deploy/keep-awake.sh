#!/usr/bin/env bash
# Kubuntu에서 실행한다: 덮개를 닫거나 방치해도 노트북이 절전/최대절전에 들어가지 않게 한다.
# 사용법: ./deploy/keep-awake.sh  (sudo 필요). 되돌리려면 /etc/systemd/logind.conf.d/github-app.conf 삭제 후 unmask.
set -euo pipefail

sudo mkdir -p /etc/systemd/logind.conf.d
sudo tee /etc/systemd/logind.conf.d/github-app.conf >/dev/null <<'EOF'
[Login]
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
HandleLidSwitchDocked=ignore
IdleAction=ignore
EOF

sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target

echo "logind 설정은 재부팅하거나 'sudo systemctl restart systemd-logind' 후 적용된다 (로그인 세션이 끊길 수 있으니 재부팅을 권한다)."
echo "KDE 자체 절전도 꺼야 한다: 시스템 설정 > 전원 관리 > 에너지 절약 에서 '화면 에너지 절약'만 두고 '절전 모드 전환'을 끈다."
