# To-do
1. 노트북 계속 pull 해주기 [의미 확인 중: 노트북에서 git pull을 자동으로 반복할지, 다른 의미인지]
2. 로그 숫자 60줄로 늘리기 (너무 짧음)
3. .env에 HERMES_API_SECRET 추가 후 pnpm build, pnpm svc:restart [사용자 작업. 값은 ~/.hermes/testgate.json 의 analysis.github_app_secret 과 같아야 함. 코드는 구현되어 있고 키가 없으면 API가 열리지 않음]
3-1. .env의 HTTP_SINK_URL 설정 [Hermes 웹훅 활성화 이후. 값은 현재 비어 있음(사용자 확인). Hermes 쪽 계획은 hermes-test-gate 레포의 llms-todo.md 참고]

# Hermes 담당 (이 레포 범위 밖일 수 있음)
(Hermes 쪽 작업의 상세 목록은 ~/.hermes/projects/hermes-test-gate/llms-todo.md 에서 관리한다)
1. Claude Code 헤드리스 실행기 구현 (OAuth 구독 로그인, 읽기 전용 도구만 허용, 네트워크 차단)
2. QA 커버리지 평가 프롬프트 및 JSON 출력 스키마 정의 (판정, 점수, 누락 항목)
3. 프롬프트 인젝션 방어 (diff/체크리스트를 비신뢰 입력으로 처리, 출력 스키마 검증)
4. 평가 결과 게시 (매체에 따라 GitHub 코멘트 또는 Slack 답장)
5. QA 체크리스트 제출 포맷 확정 및 파서 구현 (PR 코멘트 `/qa <sha>`)
6. 커밋 단위 / PR 전체 단위 diff 수집 모듈 구현 (mode: commit | pr)

# 나중에
1. Slack Bot 토큰/설정 (개인 채널에 Bot 생성, .env 관리)
2. Slack sink 구현 (어떤 메시지를 보낼지는 서버에서 결정하는 규칙 포함)
3. import webhook 서명 검증 중 Slack 이벤트 등 나머지 외부 → 서버 방향 [Hermes 방향은 구현 완료: Done 25번. 남은 것은 Slack 쪽]
4. 나가는 sink 서명을 방식 B로 상향 (X-Webhook-Signature-V2 + X-Webhook-Timestamp, 재전송 공격 방어). 방식 A는 적용 완료. 범용 JSON POST는 유지하고 필터링은 Hermes가 한다 [들어오는 /api/* 는 이미 타임스탬프 방식(x-hermes-*)이라 재전송 방어가 있음]
5. Grafana 대시보드 (앱에 /metrics 추가, Prometheus 수집, 평가 점수는 DB 저장)
6. GitHub App 설정에서 받을 이벤트 구독 체크 (Issues, Pull request, Pull request review, Pull request review comment, Commit comment, Push, Workflow run. 그 외 원하는 것) [사용자 작업. Issue comment 구독과 쓰기 권한은 확인 완료]
7. 보안 허용 목록 (ALLOWED_REPOS, ALLOWED_ACTORS로 내 Repo/내 계정 이벤트만 Hermes로 전달). 선택 기능으로만 둔다. 범용성을 위해 기본은 전부 전달하고, 버릴지 판단하는 일은 Hermes가 한다
8. CI check-run 결과 및 coverage 리포트 수집 (교차 검증용)
9. 큰 diff 대응 (파일별 분할/요약 폴백) [일부 구현: /api/pr 이 100만 자 초과 시 뒤쪽 파일을 diff_included=false 로 표시. 요약 폴백은 미구현]
10. 실패/재시도/타임아웃 처리 및 로깅 (계속 실패하는 이벤트는 현재 7일 뒤 Worker에서 사라짐. /api/comment 의 deliveryId 중복 방지 기록은 메모리에만 있어 재시작하면 사라짐)
11. mock Hermes로 end-to-end 테스트

# Done
1. GitHub App 생성 및 권한/이벤트 설정 (issue_comment, pull_request, contents/checks/pull_requests 권한)
2. webhook 서버 스캐폴딩 (스택 확정, 즉시 200 응답 후 비동기 처리)
3. webhook 서명(X-Hub-Signature-256) 검증 및 X-GitHub-Delivery 기반 멱등 처리
4. installation token 발급/캐싱 모듈 구현 (App private key 기반, 1시간 만료 갱신)
5. 이벤트 정규화 모듈 분리 (src/events: issue_comment, pull_request_review_comment, Bot 코멘트 무시, 로그 출력)
6. 배포 자산 작성 (deploy/: systemd 서비스 템플릿, 설치 스크립트, 절전 방지 스크립트, 가이드)
7. 데스크탑에서 실제 webhook 수신 확인 (pnpm dev + pnpm temp-server, 이슈 코멘트가 정규화되어 202 응답, 서명 검증 통과)
8. 출력 sink 인터페이스 정의 및 라우터 구현 (src/sinks: Sink, SinkRouter, 부분 실패 시 Redeliver 가능)
9. HTTP sink 구현 (src/sinks/http.ts: JSON POST, 선택적 HMAC 서명 헤더, 타임아웃, 로컬 수신기로 e2e 확인)
10. 이벤트 수집/알림 판정 구조 구현 (src/events: collectors/ 폴더에 이벤트별 수집 코드 8종 + generic 기본 수집, policy.ts 알림 규칙 표, 기본은 전부 알림, Bot 이벤트와 ping은 수집만)
11. Cloudflare Worker 문지기 구현 (worker/: Hono, webhook 서명 검증, delivery 중복 제거, D1 보관, 노트북용 조회/삭제 API와 Bearer 토큰 인증, 2MB 제한, 7일 보관, 보관소는 EventStore 인터페이스로 분리해 Postgres 교체 가능, 로컬 D1로 e2e 확인)
12. 노트북 앱이 Worker에서 이벤트를 20초마다 가져오는 구조 추가 (EVENT_SOURCE=webhook|worker, WorkerPoller: ack 후 삭제, 실패 시 재시도, 중복 방지, 연결 실패 시 간격 증가, 로컬 Worker와 e2e 확인)
13. Cloudflare Worker 배포 완료 (github-app-gate, https://github-app-gate.<서브도메인>.workers.dev, D1 생성과 표 적용, 비밀값 등록, preview_urls 끔, healthz 200 / 토큰 없는 /events 401 / 서명 없는 /webhook 401 확인)
14. GitHub App의 Webhook URL을 Worker 주소(/webhook)로 교체
15. 루트에서 쓰는 편의 명령 추가 (pnpm deploy:worker, worker:dev, db:migrate, db:migrate:local, svc:status/restart/deploy/logs)
16. 설명 및 명령 문서 작성 (whatissink.md, whatishono.md, command-helper.md)
17. 노트북 .env를 EVENT_SOURCE=worker로 전환하고 실제 이벤트 흐름 확인
18. Kubuntu 노트북 24/7 배포 및 배포 테스트 확인 (서비스 등록, 절전 방지)
19. Hermes 연동용 sink 헤더 수정 방식 A (src/sinks/http.ts: 서명 헤더를 x-hub-signature-256으로 변경, x-github-event 헤더 추가. 값은 GitHub 이벤트 이름이 아니라 event.kind. test/sinks.test.ts 수정, pnpm test 77건과 typecheck 통과, 커밋 안 함)
20. pnpm build 실행, dist/에 새 헤더 반영 확인 (서비스 재시작은 미실행)
21. 공개 대비 민감 정보 점검 (.env, .pem, credentials는 추적된 적 없음, 토큰 패턴 없음, 개인 정보 3건은 위 To-do 4번)
22. GitHub App 설정 확인 (사용자: Issue comment 구독, Pull requests와 Issues 쓰기 권한, hermes-test-gate 레포 접근 모두 정상)
23. 서비스 재시작 (사용자 실행, 2026-10-13 11:17 KST). 새 헤더 적용 상태로 동작 중
24. 공개 대비 개인 정보 정리 (사용자 결정, 2026-10-13): Worker 주소는 command-helper.md와 llms-todo.md에서 <서브도메인> 형식으로 교체함. 커밋 작성자 이메일과 D1 database_id는 문제 없다고 판단해 그대로 둠. 이미 커밋된 옛 기록에는 주소가 남아 있음
25. Hermes 연동 API 구현 (사용자 승인, 2026-10-13): POST /api/pr (PR 제목, 설명, 기준 브랜치 이름, 헤드 SHA, 변경 파일 목록, diff, 상한 초과 시 파일별 diff_included 표시, commit을 주면 그 PR에 속하는지 확인 후 커밋 하나의 diff), POST /api/comment (Bot 이름으로 PR 코멘트, deliveryId로 중복 게시 방지). 서명: x-hermes-timestamp + x-hermes-signature = HMAC(<timestamp>.<바디>), 재전송 창 300초. 새 환경 변수 HERMES_API_SECRET (없으면 API 미등록), API_ALLOWED_OWNERS (선택). 새 파일: src/github/client.ts, src/api/{auth,diff,routes}.ts, test/{api,githubClient}.test.ts. pnpm test 108건, typecheck 통과. 실제 GitHub 호출은 아직 하지 않음.
