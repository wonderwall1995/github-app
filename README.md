# GitHub App

Pull Request 코멘트 명령어(/qa, /qa free:)로 테스트 문서 생성과 Claude Code 대화를 연결하는 GitHub App

| 구분 | 링크 |
|---|---|
| GitHub Repo (이 저장소) | https://github.com/wonderwall1995/github-app |
| 이력서 | https://resume-hwk.ltwayne0.workers.dev/main |

<!-- 실행 방법, 기술 스택, 폴더 구조 같은 안내는 이 아래에 직접 채운다. -->

## 문제 프레임

재직 중이던 회사에선 대부분의 자동화 서비스를 GitHub 또는 Slack으로 집중시켰습니다.
Jenkins를 Hermes Agent 휘하의 자동화 파이프라인으로 사용하기도 했었으며,
그러한 프로젝트들이 퇴사 후 회사의 재산이 됨에 따라 일종의 프로젝트 유기성을 위한 보드, 메시지 창구
혹은 그것을 날라다 주는 우편함 같은 개념으로 GitHub App 프로젝트가 하나 필요했습니다.

## 설계

/qa 혹은 /qa free: 이와 같은 명령어를 Pull Request 측에서의 코멘트로 감지합니다.
그에 따라 /qa의 경우엔 테스트 커버리지를 충족시킬 생성 문서를 출력하는 **'창구'**
/qa free: 는 Hermes 내부 하위 에이전트인 Claude Code와 대화를 할 수 있는 기능을 가집니다.
**주로 GitHub Webhook을 받기 위한,** 그리고 **여타 프로젝트 구현에 따른 작동을 위한** 프로젝트입니다.

| 명령어 | 동작 |
|---|---|
| `/qa` | 테스트 커버리지를 충족시킬 생성 문서를 출력 |
| `/qa free:` | Hermes 내부 하위 에이전트인 Claude Code와 대화 |

## 기타

**현 프로젝트 기능은 Slack Bot, Linear, Notion으로도 연계**가 가능합니다.
그러한 제품군이 공개적으로 쓰기는 적절치는 않아 GitHub App을 단독 사용한 상태입니다.

## 관련 저장소

이 App이 받은 Webhook과 Diff는 Hermes 쪽 프로젝트에서 분석합니다.

| 저장소 | 역할 |
|---|---|
| https://github.com/wonderwall1995/hermes-ced-taker | 맥락 문서(CED) 저장, 전송 |
| https://github.com/wonderwall1995/hermes-controller | Hermes 내부 프로젝트 사이의 중간 허브 |
| https://github.com/wonderwall1995/hermes-test-gate | github-app이 가져온 Diff 분석, Pull Request 코멘트 작성 |
