# Hono란

Hono는 웹 서버를 만들 때 쓰는 **작은 웹 프레임워크**다. 이름은 일본어 "炎(불꽃)"에서 왔다.
"어떤 주소로 요청이 오면 이 함수를 실행해라"라는 규칙을 짧게 적게 해 주는 도구다.

```ts
app.get("/healthz", (c) => c.json({ status: "ok" }));   // GET /healthz 가 오면 JSON을 돌려준다
```

## 비유

식당으로 비유하면 이렇다.
- 요청은 손님의 주문이다.
- 프레임워크는 홀 직원이다. 주문서를 받아서 알맞은 주방 담당(함수)에게 전달하고, 나온 음식을 손님에게 가져다준다.
- Hono는 짐을 가볍게 만든 직원이다. 아주 좁은 주방(Cloudflare Worker)에서도 일할 수 있다.

## 왜 Hono를 골랐나

우리 프로젝트에는 웹 서버가 두 개 있다.

| | 어디서 도나 | 프레임워크 | 하는 일 |
|---|---|---|---|
| 노트북 앱 (`src/`) | 노트북의 Node.js | Fastify | `/healthz`, (webhook 직접 수신 방식일 때) `/webhook` |
| Worker (`worker/`) | Cloudflare의 Workers | **Hono** | GitHub webhook 수신, 노트북에게 이벤트 전달 |

Cloudflare Workers는 일반 Node.js가 아니다. 파일을 읽거나 Node 전용 기능을 쓰는 Fastify, Express 같은 프레임워크는 그대로 올라가지 않는다.
Hono는 **웹 표준**(`Request`, `Response`, `fetch`)만으로 만들어져서 Workers에서 바로 돌아간다. 같은 코드가 Node.js, Deno, Bun에서도 돌아간다.

그 밖의 장점은 아래와 같다.
- 매우 가볍다 (수십 KB 이하). Worker는 시작 속도가 중요해서 작을수록 좋다.
- 문법이 Express와 비슷해서 읽기 쉽다.
- TypeScript를 기본으로 지원한다.
- 서버를 켜지 않고도 테스트할 수 있다 (아래 참고).

## 우리 코드에서 Hono가 쓰이는 곳

[worker/src/app.ts](worker/src/app.ts)에 있다.

```ts
const app = new Hono<{ Bindings: Env }>();      // 앱을 만든다. Env는 Worker에 등록한 비밀값과 D1이다.

app.get("/healthz", (c) => c.json({ status: "ok" }));   // 경로 하나 = 줄 하나

app.post("/webhook", async (c) => {                     // GitHub이 webhook을 보내는 곳
  const body = await c.req.arrayBuffer();               // c.req = 들어온 요청
  ...
  return c.json({ ok: true }, 202);                     // c.json = JSON 응답, 두 번째 값은 상태 코드
});

app.use("/events/*", requirePullToken);                 // 이 경로들은 먼저 토큰 검사를 거친다 (미들웨어)
```

- `c`는 "context"의 약자로, 요청을 읽고 응답을 만드는 도구 모음이다.
- 미들웨어는 경로 앞에 끼워 넣는 검문소다. 토큰이 없으면 `401`로 돌려보내고, 맞으면 다음으로 넘긴다.
- 테스트에서는 서버를 켜지 않고 `app.request("/events", ...)`로 요청을 바로 흘려 보낸다. [worker/test/app.test.ts](worker/test/app.test.ts)의 18개 테스트가 이렇게 돈다.

## 헷갈리기 쉬운 점

- Hono는 **서버가 아니라 서버 안의 길 안내 도구**다. 서버를 실제로 돌려 주는 것은 Cloudflare Workers다.
- 노트북 앱의 Fastify와 하는 일은 같지만 서로 대체 관계가 아니다. 돌아가는 곳(런타임)이 달라서 둘 다 필요하다.
- 나중에 Worker를 다른 곳으로 옮기게 되더라도 Hono 코드는 거의 그대로 쓸 수 있다.
