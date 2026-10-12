# To-do
1. 노트북 계속 pull 해주기 [의미 확인 중: 노트북에서 git pull을 자동으로 반복할지, 다른 의미인지]
2. 로그 숫자 60줄로 늘리기 (너무 짧음)

# Hermes 담당 (이 레포 범위 밖일 수 있음)
1. Claude Code 헤드리스 실행기 구현 (OAuth 구독 로그인, 읽기 전용 도구만 허용, 네트워크 차단)
2. QA 커버리지 평가 프롬프트 및 JSON 출력 스키마 정의 (판정, 점수, 누락 항목)
3. 프롬프트 인젝션 방어 (diff/체크리스트를 비신뢰 입력으로 처리, 출력 스키마 검증)
4. 평가 결과 게시 (매체에 따라 GitHub 코멘트 또는 Slack 답장)
5. QA 체크리스트 제출 포맷 확정 및 파서 구현 (PR 코멘트 `/qa <sha>`)
6. 커밋 단위 / PR 전체 단위 diff 수집 모듈 구현 (mode: commit | pr)

# 나중에
1. Slack Bot 토큰/설정 (개인 채널에 Bot 생성, .env 관리)
2. Slack sink 구현 (어떤 메시지를 보낼지는 서버에서 결정하는 규칙 포함)
3. import webhook 서명 검증 (Hermes 콜백, Slack 이벤트 등 외부 → 서버 방향)
4. Hermes 전용 규격 확인 후 HTTP sink 맞춤 (지금은 범용 JSON POST)
5. Grafana 대시보드 (앱에 /metrics 추가, Prometheus 수집, 평가 점수는 DB 저장)
6. GitHub App 설정에서 받을 이벤트 구독 체크 (Issues, Pull request, Pull request review, Pull request review comment, Issue comment, Commit comment, Push, Workflow run. 그 외 원하는 것) [사용자 작업]
7. 보안 허용 목록 (ALLOWED_REPOS, ALLOWED_ACTORS로 내 Repo/내 계정 이벤트만 Hermes로 전달)
8. CI check-run 결과 및 coverage 리포트 수집 (교차 검증용)
9. 큰 diff 대응 (파일별 분할/요약 폴백)
10. 실패/재시도/타임아웃 처리 및 로깅 (계속 실패하는 이벤트는 현재 7일 뒤 Worker에서 사라짐)
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
13. Cloudflare Worker 배포 완료 (github-app-gate, https://github-app-gate.ltwayne0.workers.dev, D1 생성과 표 적용, 비밀값 등록, preview_urls 끔, healthz 200 / 토큰 없는 /events 401 / 서명 없는 /webhook 401 확인)
14. GitHub App의 Webhook URL을 Worker 주소(/webhook)로 교체
15. 루트에서 쓰는 편의 명령 추가 (pnpm deploy:worker, worker:dev, db:migrate, db:migrate:local, svc:status/restart/deploy/logs)
16. 설명 및 명령 문서 작성 (whatissink.md, whatishono.md, command-helper.md)
17. 노트북 .env를 EVENT_SOURCE=worker로 전환하고 실제 이벤트 흐름 확인
18. Kubuntu 노트북 24/7 배포 및 배포 테스트 확인 (서비스 등록, 절전 방지)
