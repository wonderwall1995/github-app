[중요] 코드 바꾼 뒤 재배포 (프로젝트 루트에서 실행)

1. worker/ 코드를 바꿨다 -> pnpm deploy:worker
2. DB 표 구조를 바꿨다 -> pnpm db:migrate 하고 pnpm deploy:worker
3. Worker 비밀값을 바꿨다 -> pnpm -C worker exec wrangler secret put 이름
4. src/ 코드를 바꿨다 (노트북) -> git pull && pnpm install --frozen-lockfile --filter github-app && pnpm build && sudo systemctl restart github-app
5. .env를 바꿨다 (노트북) -> sudo systemctl restart github-app
6. .env를 바꿨다 (데스크탑) -> pnpm dev 를 Ctrl+C로 끄고 다시 pnpm dev

자주 쓰는 명령

7. 서버 실행 (데스크탑) -> pnpm dev
8. 테스트 -> pnpm test
9. Worker 테스트 -> pnpm -C worker test
10. Worker 살아있나 확인 -> curl https://github-app-gate.ltwayne0.workers.dev/healthz
11. Worker 실시간 로그 -> pnpm -C worker exec wrangler tail
12. 노트북 서비스 상태 -> systemctl status github-app
13. 노트북 로그 보기 -> journalctl -u github-app -f
14. 토큰 만들기 -> openssl rand -hex 32
15. 바뀐 파일 확인 -> git status
16. pnpm deploy 는 쓰지 않는다 -> 항상 pnpm deploy:worker
