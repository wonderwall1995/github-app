# Kubuntu 노트북 24/7 배포

목표: 노트북이 항상 켜져 있는 동안 서버가 죽지 않고, 재부팅해도 알아서 올라오고, GitHub이 외부에서 webhook을 보낼 수 있다.

구성: GitHub -> Cloudflare Tunnel (https) -> localhost:3200 -> github-app (systemd 서비스)

## 1. 준비

```bash
# Node 22 이상, pnpm, git
node -v
corepack enable        # pnpm 사용 (package.json의 packageManager 기준)
git clone <레포 주소> && cd github-app
pnpm install
cp .env.example .env   # 값 채우기
# credentials/ 에 GitHub App의 .pem 넣기, .env의 GITHUB_APP_PRIVATE_KEY_PATH와 맞추기
```

HOST는 `127.0.0.1`로 둔다. 외부 접근은 터널이 대신 받는다.

## 2. 서비스 등록 (재부팅 후 자동 시작, 죽으면 자동 재시작)

```bash
./deploy/install-service.sh
curl http://127.0.0.1:3200/healthz     # {"status":"ok",...}
journalctl -u github-app -f            # 로그
```

스크립트가 `pnpm install`과 `pnpm build`까지 해 준다. 코드를 갱신한 뒤에는 `git pull && pnpm install && pnpm build && sudo systemctl restart github-app`.

## 3. 절전 방지

```bash
./deploy/keep-awake.sh
```

스크립트가 끝나면 안내하는 KDE 전원 설정도 직접 바꾼다. 확인:

```bash
systemctl status sleep.target     # masked 이면 정상
```

## 4. 공개 URL (Cloudflare Tunnel)

도메인이 Cloudflare에 있어야 고정 URL을 쓸 수 있다. 임시 주소(trycloudflare)는 재시작마다 바뀌어서 24/7 용도로 부적합하다.

1. Cloudflare Zero Trust 대시보드 > Networks > Tunnels > Create a tunnel (Cloudflared)
2. 대시보드가 알려주는 설치 명령을 노트북에서 실행한다. 이 명령이 `cloudflared`를 systemd 서비스로 등록해서 재부팅 후에도 유지된다.
3. Public hostname 추가: 예) `hook.내도메인.com` -> Service `HTTP` `localhost:3200`
4. GitHub App 설정의 Webhook URL을 `https://hook.내도메인.com/webhook` 으로 바꾼다. Webhook secret은 `.env`의 `GITHUB_WEBHOOK_SECRET`과 같아야 한다.

## 5. 동작 확인

1. GitHub App 설정 > Advanced > Recent Deliveries 에서 ping이 `202` 인지 확인 (실패한 건 Redeliver 가능).
2. 앱이 설치된 Repo에서 이슈나 PR에 코멘트를 달고 `journalctl -u github-app -f` 에서 "이벤트 수집" 로그를 확인한다.
3. 재부팅 후 서비스가 올라오는지, 덮개를 닫아도 계속 응답하는지 확인한다.

## 문제 확인 순서

| 증상 | 확인 |
|---|---|
| 서비스가 시작되지 않음 | `journalctl -u github-app -n 50` (`.env` 누락/키 경로 오류는 시작 시 에러 메시지로 나온다) |
| GitHub Deliveries가 401 | `.env`의 `GITHUB_WEBHOOK_SECRET` 과 GitHub App의 Webhook secret 불일치 |
| GitHub Deliveries가 타임아웃/502 | `systemctl status cloudflared`, `curl 127.0.0.1:3200/healthz` |
| 놓친 이벤트 | GitHub App > Advanced > Recent Deliveries 에서 Redeliver |
