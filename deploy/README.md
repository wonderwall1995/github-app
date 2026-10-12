# Kubuntu 노트북 24/7 배포

목표: 노트북이 켜져 있는 동안 앱이 죽지 않고, 재부팅해도 알아서 올라오고, GitHub 이벤트를 놓치지 않는다.

## 구성

기본은 Cloudflare Worker가 앞문을 맡는 방식이다. 노트북은 밖으로 나가는 요청만 하므로 공개 URL, 터널, 포트 개방이 필요 없다.

```
GitHub -> Cloudflare Worker (고정 주소, 서명 검증, D1 보관)
                 ^
노트북 앱 -------+  20초마다 가져감 (밖으로만 요청)  -> Hermes (localhost)
```

Worker 배포는 [worker/README.md](../worker/README.md)를 먼저 따른다. 그 문서의 7번까지 마치면 이 문서의 `.env`에 넣을 값이 모두 준비된다.

(대안) `EVENT_SOURCE=webhook`으로 두면 GitHub이 노트북 앱에 직접 webhook을 보낸다. 이 방식은 Cloudflare 터널이나 ngrok 같은 공개 URL이 따로 필요하고, 노트북이 인터넷에서 닿을 수 있게 된다. 데스크탑에서 빠르게 시험할 때만 쓴다.

## 1. 준비

```bash
# Node 22 이상, pnpm, git
node -v
corepack enable        # pnpm 사용 (package.json의 packageManager 기준)
git clone <레포 주소> && cd github-app
cp .env.example .env   # 값 채우기
# credentials/ 에 GitHub App의 .pem 넣기, .env의 GITHUB_APP_PRIVATE_KEY_PATH와 맞추기
```

Worker 방식의 `.env` 필수 값: `EVENT_SOURCE=worker`, `WORKER_URL`, `WORKER_PULL_TOKEN`, `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY_PATH`.
이 방식에서는 `GITHUB_WEBHOOK_SECRET`이 노트북에 필요 없다 (Worker가 검증한다).
`HOST`는 `127.0.0.1`로 둔다. 앱의 `/healthz` 포트는 노트북 안에서만 쓴다.

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

노트북이 잠깐 꺼져도 이벤트는 Worker에 최대 7일 쌓여 있다가 켜지면 처리된다.

## 4. 동작 확인

1. 로그에 "Worker 이벤트 가져오기 시작"이 나오는지 본다 (`journalctl -u github-app -f`).
2. GitHub App 설정 > Advanced > Recent Deliveries 에서 ping이 `202` 인지 확인 (실패한 건 Redeliver 가능).
3. 앱이 설치된 Repo에서 이슈나 PR에 코멘트를 달면 최대 20초 안에 "이벤트 수집" 로그가 찍힌다.
4. 재부팅 후 서비스가 올라오는지, 덮개를 닫아도 계속 동작하는지 확인한다.

## 문제 확인 순서

| 증상 | 확인 |
|---|---|
| 서비스가 시작되지 않음 | `journalctl -u github-app -n 50` (`.env` 누락/키 경로 오류는 시작 시 에러 메시지로 나온다) |
| "Worker에서 이벤트를 가져오지 못함" 반복 | `WORKER_URL`, 인터넷 연결 확인. HTTP 401이면 `WORKER_PULL_TOKEN`이 Worker의 `PULL_TOKEN`과 다르다 |
| GitHub Deliveries가 401 | Worker의 `GITHUB_WEBHOOK_SECRET`과 GitHub App의 Webhook secret 불일치 (`wrangler secret put`으로 다시 등록) |
| GitHub Deliveries가 404 | Webhook URL 끝에 `/webhook`이 빠졌다 |
| 이벤트가 안 온다 | GitHub App 설정의 Subscribe to events 체크 확인 |
| 놓친 이벤트 | GitHub App > Advanced > Recent Deliveries 에서 Redeliver |
