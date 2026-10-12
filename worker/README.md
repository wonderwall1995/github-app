# Cloudflare Worker 문지기

GitHub이 보내는 webhook을 대신 받아서 검증하고 잠시 보관한다. 노트북 앱이 밖으로 나가는 요청으로 이벤트를 가져간다.
노트북이 인터넷에 열릴 필요가 없다.

```
GitHub --webhook--> [이 Worker]  서명 검증, 중복 제거, D1에 보관
                         ^
노트북 앱 ---20초마다 "새 이벤트 있어?" (Bearer 토큰)---+
```

## 경로

| 경로 | 누가 | 하는 일 |
|---|---|---|
| `POST /webhook` | GitHub | 서명(`X-Hub-Signature-256`)을 검증하고 보관한다. 같은 delivery는 한 번만 저장한다. 2MB 초과는 413. |
| `GET /events?limit=20` | 노트북 | 오래된 순서로 이벤트를 돌려준다. 가져가기만 해서는 지워지지 않는다. |
| `POST /events/ack` | 노트북 | `{"ids":[1,2]}` 처리를 끝낸 이벤트를 지운다. 7일이 지난 이벤트도 함께 정리한다. |
| `GET /healthz` | 누구나 | 살아 있는지만 알려준다. |

`/events` 아래 경로는 `Authorization: Bearer <PULL_TOKEN>`이 없으면 401이다. 토큰이 설정되지 않은 배포는 모두 503으로 거절한다.

## 처음 배포하기

명령은 `worker/` 폴더에서 실행한다. 의존성은 프로젝트 루트에서 `pnpm install` 한 번으로 설치된다.

1. Cloudflare에 로그인한다. 브라우저가 열린다.
   ```bash
   pnpm exec wrangler login
   ```
2. 이벤트 보관용 D1 데이터베이스를 만든다. 출력되는 `database_id`를 `wrangler.toml`의 `database_id`에 붙여 넣는다.
   ```bash
   pnpm exec wrangler d1 create github-app-events
   ```
3. 표를 만든다.
   ```bash
   pnpm db:migrate
   ```
4. 비밀값을 등록한다. 각각 프롬프트에 값을 붙여 넣는다.
   ```bash
   pnpm exec wrangler secret put GITHUB_WEBHOOK_SECRET   # GitHub App 설정의 Webhook secret과 같은 값
   pnpm exec wrangler secret put PULL_TOKEN              # openssl rand -hex 32 로 만든 값. 노트북 .env의 WORKER_PULL_TOKEN과 같아야 한다
   ```
5. 배포한다. 출력되는 `https://github-app-gate.<서브도메인>.workers.dev` 가 고정 주소다.
   ```bash
   pnpm run deploy        # "pnpm deploy"는 pnpm 내장 명령이라 run을 붙여야 한다
   ```
6. GitHub App 설정의 Webhook URL을 `https://github-app-gate.<서브도메인>.workers.dev/webhook` 으로 바꾼다.
7. 노트북 `.env`에 아래를 넣고 서비스를 재시작한다.
   ```
   EVENT_SOURCE=worker
   WORKER_URL=https://github-app-gate.<서브도메인>.workers.dev
   WORKER_PULL_TOKEN=<4번에서 등록한 값>
   ```

## 로컬에서 시험하기

비밀값은 `worker/.dev.vars` 파일에 둔다 (git에 올라가지 않는다).

```
GITHUB_WEBHOOK_SECRET=local-secret
PULL_TOKEN=local-token
```

```bash
pnpm db:migrate:local
pnpm dev            # http://localhost:8787
```

## 개발

```bash
pnpm typecheck
pnpm test           # 메모리 보관소로 Hono 앱 전체를 시험한다
```

보관소는 `src/store.ts`의 `EventStore` 인터페이스 뒤에 있다. D1 대신 다른 DB(예: Postgres)를 쓰려면 이 인터페이스를 구현하는 클래스를 새로 만들고 `src/app.ts`의 기본 팩토리만 바꾸면 된다.

## 알아둘 점

- 노트북이 꺼져 있는 동안 이벤트는 최대 7일까지 이 Worker에 쌓인다. 켜면 오래된 것부터 처리한다.
- 노트북이 처리에 실패한 이벤트는 지우지 않고 다음 확인 때 다시 받는다. 계속 실패하는 이벤트는 7일 뒤에 사라진다.
- 전달은 "최소 한 번"이다. 같은 이벤트가 두 번 올 수 있어서 노트북 앱이 `deliveryId`로 중복을 거른다.
