# To-do
1. Kubuntu 노트북 24/7 배포 완료 및 검증 (deploy/README.md 순서: 서비스 등록, 절전 방지, 공개 URL 터널, GitHub App webhook URL 등록) [최우선]
2. GitHub App 설정에서 받을 이벤트 구독 체크 (Issues, Pull request, Pull request review, Pull request review comment, Issue comment, Commit comment, Push, Workflow run. 그 외 원하는 것) [사용자 작업]
3. Hermes → App 완료 콜백 엔드포인트 구현 [Hermes가 결과를 직접 게시하면 불필요, 삭제 여부 확인 중]
4. CI check-run 결과 및 coverage 리포트 수집 (교차 검증용)
5. 큰 diff 대응 (파일별 분할/요약 폴백) [보류]
6. 실패/재시도/타임아웃 처리 및 로깅 [후순위]
7. mock Hermes로 end-to-end 테스트 [진짜 나중에]

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
