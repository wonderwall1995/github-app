# What
- Claude가 질문을 남긴다.
- 가급적 Oneline으로 질문을 남긴다.
- User는 대답한다.
- 개별 질문은 ## Questions 아래에 작성한다. 질문마다 MM-DD 태그를 달아 구분한다.
- 가장 최신 질문을 가장 상단에 작성한다. User가 보기 편하게.
- 뭘하면 좋을지 묻지 말것. 이것들은 다른 문서와 역할이 겹친다.

## Questions

6. [10-12] QA 관련 To-do(1, 2번)는 뒤로 미루고, 다음은 출력 sink 인터페이스(3번)부터 진행해도 될까요?
> 엥? To-do 1번 2번은 Hermes Agents가 해도 되는 역할 같은데.
5. [10-12] 아직 커밋이 하나도 없는데, 지금까지 작업분을 커밋해도 되나요? (git safe.directory 설정이 먼저 필요합니다)
> ㄴㄴ ㄱㅊ 내가 커밋 알아서 할게
4. [10-12] QA 체크리스트는 PR 코멘트에 `/qa <sha>` 다음 줄부터 자연어로 쓰는 형식이면 되나요? (sha 생략 시 PR 최신 커밋 기준, 이슈 코멘트의 /qa는 무시)
> ??? 질문이 너무 앞서 나가고 있어. QA 체크리스트 지금 신경쓸 게 아님 PR 최신 커밋도 혹은 PR 내 커밋 별 Diff도 알아서 나중에 구성할 거야.
1. [10-12] 코드 주석은 ASD-STE100(영어)으로 쓰는 게 맞나요? 맞다면 기존 한글 주석도 STE 영어로 바꿀까요?
> 영어로 쓰지마. 한글로 가자구.
2. [10-12] To-do 1번(installation token)에 쓸 GitHub App ID와 private key(.pem) 경로를 .env의 GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY_PATH에 넣어주실 수 있나요?
> ㅇㅋ
3. [10-12] 설치 대상은 개인 Repo 하나뿐인가요, 아니면 여러 Repo(installation 여러 개)도 다뤄야 하나요?
> 개인 Repo 만 일단 다루고 여타 다른 user 혹은 organizations 대상으로 지원할지는 지금 고민할 필요없음.