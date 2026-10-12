# Rules
- Read only 파일 수정 금지

# Todo
1. Github App이라는 입장으로써 개인 토큰 - 개인 Repo 에서 발생하는 커밋 별 Diff를 분석하고 개별 커밋들마다 QA가 테스트 된 체크리스트를 자연어로 제출할 경우, Github App은 웹훅을 외부 Hermes Agents로 발신하고 Hermes Agents 는 개별 커밋으로 발생한 Diff 혹은 개별 Pull Request의 모든 커밋으로 발생한 Diff 대상으로 Claude Code를 (OAuth2 구독 스타일) 실행시켜 QA가 올바른 테스트 커버리지 내에서 테스트를 실행했는지 검토하고 이것을 평가하는 역할을 취하도록 중간 과정에서 조율한다.
2. Github App의 현재 역할은 외부 - 내부 AI 에이전트 혹은 기타 Slack 같은 메시지로 웹훅을 export & import 해줄 수 있으면 된다. 거기에 더하여 이슈, 프로젝트, PR 대상으로 코멘트를 유저가 쓰는 것을 인식할 수 있으면 된다.
3. Slack Bot의 역할도 해줘야 하는 경우가 있을 것이다. Slack bot은 따로 개인 채널에 만들고 Slack Bot이 어떤 메시지 등등을 보낼지는 본 서버에서 관여한다. (이전에 나는 이것을 젠킨스 파이프라인으로 만들긴 했었다.)

# Misc
- Kubuntu 환경 자택 노트북을 User는 EC2 혹은 Cloudflare 대용으로 배포하는 서버처럼 사용할 것이다. 노트북은 항상 켜져있다. (따로 원격 서버를 두는 것은 돈이 나가니까.)