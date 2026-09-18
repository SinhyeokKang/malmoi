# spec — install-and-connect

GitHub App **설치**와 사용자 **연결**(user-to-server 인가)을 GitHub 왕복 한 번으로 합친다. launch-readiness L2.4의 후속이다.

## 사용자

**개발자 — 처음 프로젝트를 만드는 사람**(PRODUCT §0의 낯선 사용자). 번역 편집자는 이 화면을 밟지 않는다(초대받은 사람은 설치·연결이 필요 없다).

## 문제 (2026-09-18 프로덕션 실측)

1. **같은 일을 두 번 시킨다.** 새 프로젝트 ①에서 [Authorize GitHub App] → GitHub 인가 → 돌아와서 [Install GitHub App] → GitHub 설치. 사용자 눈에는 "GitHub에 malmoi를 허락한다"가 두 번이다.
2. **요청 대기 제목이 설명과 모순된다.** 조직 비관리자가 설치를 요청하고 돌아오면 설명은 "관리자 승인이 필요하다"인데 제목은 "Install the malmoi GitHub App"이다(설치할 수 없는 사람에게 설치하라고 한다).
3. **요청 대기가 착지 한 번만 보인다.** 대기 사실이 URL(`?e=install-requested`)에만 있어, 모달을 다시 열면 "설치하라" 화면으로 돌아가고 링크를 다시 누르면 요청이 한 번 더 간다.
4. **연결 전에 요청하면 대기가 사라진다.** 착지가 연결 화면이 되고 연결 왕복이 `?e=`를 버린다.

## 완료 조건

- 연결도 설치도 없는 사용자가 ①에서 **malmoi 버튼 한 번 + GitHub 인가·설치 화면의 버튼 한 번**("Install & Authorize", 계정·조직 대상 선택 클릭은 세지 않는다)으로 리포 목록에 도달한다(프로덕션 실측).
- 조직 비관리자가 ①의 버튼 한 번 + GitHub "Authorize & Request" 한 번으로 돌아오면 **연결은 끝나 있고** ①이 "Waiting for approval"이다.
- 그 상태에서 모달을 닫고 다시 열어도, 다른 기기에서 열어도 "Waiting for approval"이다.
- 요청 뒤 **다른 설치로 리포가 이미 보이는** 사용자는 목록 위 info 한 줄로 대기를 본다. 요청 시각 이후에 생긴 설치가 목록 조회에 나타나면(= 승인) 대기가 사라진다.
- 대기 화면에 설치 화면 제목("Connect your repositories")이 **0회**다(설치 가능 화면에는 1회 — 대조). "Refresh this page once you're done."은 어느 갈래에도 없다 — 설치·리포 선택 모두 같은 탭 왕복이다.
- 설치는 있는데 리포가 0개인 사용자가 [Choose repositories]로 리포를 고르고 저장하면 같은 탭에서 ①로 돌아와 목록이 보인다.
- 관리자가 승인한 뒤 [Check again]을 누르면 리포 목록이 뜬다. 아직이면 같은 화면이 다시 서고 스크린리더에 "아직 대기 중"이 알려진다.
- 이미 조직에 설치돼 있어 연결만 필요한 사용자가 ①의 링크 "Already installed on your organization? Connect your account"로 연결된다(기존 Authorize 흐름).
- **GitHub이 state 없이 설치·요청·리포 선택 변경을 되돌리면**(GitHub 앱 페이지에서 직접 설치, 설정·계정 화면의 설치 링크, 관리자의 승인 복귀) 오류 화면이 아니라 `/projects/new`에 **쓰기 없이** 착지한다.
- 서명 state가 틀린 복귀는 지금처럼 **code 교환 0회**로 거부된다.
- `GITHUB_APP_SLUG`가 없는 환경에서 ①이 항상 실패하는 버튼을 세우지 않는다 — 관리자 안내 문구로 떨어진다.

## 비목표

- **로그인 OAuth App과 연결 App을 합치기** — PRODUCT §4.3 ③, 그대로 뺀다(가용성). 이 기능은 같은 App 안의 인가와 설치를 합칠 뿐이다.
- **로컬·preview에서 시작한 설치가 그 origin으로 돌아오기** — 설치 URL은 `redirect_uri`를 받지 않아 첫 callback(프로덕션)으로 간다. L2.10(App 분리)이 푼다. 그때까지 설치 왕복은 프로덕션에서만 실측한다.
- **승인 시점 자동 감지**(웹훅 `installation.created`) — 웹훅은 PRODUCT §4.3 ②와 같은 이유(서명 검증·delivery 중복 방지·재시도가 딸려 온다)로 만들지 않는다. 사용자가 [Check again]을 누르거나 ①을 다시 연다.
- **요청이 거절됐는지 알기** — GitHub이 요청자에게 알릴 수단을 주지 않는다. 대기 화면이 다른 계정 설치로 빠지는 길("Install on a different account")을 준다. 만료(TTL)는 두지 않는다.
- **state 없이 돌아온 요청을 기록하기** — 누가 시작했는지 모르는 왕복은 쓰지 않는다. 그 사용자는 대기 대신 설치 화면을 본다.
- **조직 요청 폼에서 10분(state TTL)을 넘긴 경우** — GitHub 쪽 요청은 나갔지만 malmoi는 `state-expired`로 거부한다. 다시 누르면 요청이 한 번 더 간다.
- **이미 App이 설치된 조직의 두 번째 개발자가 주 버튼을 누르는 경우** — GitHub이 "Configure" 화면으로 보낸다(실측 3). 그 사람의 길은 보조 링크 "Connect your account"다. Configure에서 Save하면 state 없는 복귀로 ①에 착지한다.
- `/account`·프로젝트 설정의 연결·재연결 버튼 — 그대로 Authorize다.
