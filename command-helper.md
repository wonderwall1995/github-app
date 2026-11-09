[중요] 코드 바꾼 뒤 재배포 (프로젝트 루트에서 실행)

1. pnpm deploy:worker <- worker/ 코드를 바꿨다
2. pnpm db:migrate 하고 pnpm deploy:worker <- DB 표 구조를 바꿨다
3. pnpm -C worker exec wrangler secret put 이름 <- Worker 비밀값을 바꿨다
4. git pull && pnpm install --frozen-lockfile --filter github-app && pnpm build && sudo systemctl restart github-app <- src/ 코드를 바꿨다 (노트북)
5. sudo systemctl restart github-app <- .env를 바꿨다 (노트북)
6. pnpm dev 를 Ctrl+C로 끄고 다시 pnpm dev <- .env를 바꿨다 (데스크탑)

자주 쓰는 명령

7. pnpm dev <- 서버 실행 (데스크탑)
8. pnpm test <- 테스트
9. pnpm -C worker test <- Worker 테스트
10. curl https://github-app-gate.<서브도메인>.workers.dev/healthz <- Worker 살아있나 확인
11. pnpm -C worker exec wrangler tail <- Worker 실시간 로그
12. systemctl status github-app <- 노트북 서비스 상태
13. journalctl -u github-app -f <- 노트북 로그 보기
14. openssl rand -hex 32 <- 토큰 만들기
15. git status <- 바뀐 파일 확인
16. 항상 pnpm deploy:worker <- pnpm deploy 는 쓰지 않는다
17. pnpm svc:status <- 노트북 서비스 켜져 있나 확인
18. pnpm svc:restart <- 노트북 서비스 재시작
19. pnpm svc:deploy <- 노트북 pull부터 재시작까지 한 번에
20. pnpm svc:logs <- 노트북 로그 보기 (간단히)
