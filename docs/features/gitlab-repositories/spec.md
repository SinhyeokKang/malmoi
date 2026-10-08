# GitLab repositories — 스펙

작성: 2026-10-08 · 상태: 보류 초안 · 구현 시점 미정 · 미확정 결정 있음

## 1. 목적과 사용자

GitLab 리포를 쓰는 개발자도 말모이에 소스 문자열을 적재하고, 번역 편집자가 저장한 값을 같은 리포의 Merge Request(MR)로 받을 수 있게 한다. 번역 편집자는 기존 편집·권한·Publish 흐름을 공유한다.

**1순위 사용자는 개발자**(연결·CI 도입을 결정하는 사람)다. 번역 편집자에게는 화면 변화를 최소로 둔다 — 편집자가 보는 차이는 리포 호스트 이름·링크·PR/MR 호칭뿐이어야 한다.

기능 범위는 **향후 검토를 위한 스펙 기록과 문서 검수까지**다. 구현·마이그레이션·구현 코드 커밋·배포를 시작하지 않는다. 실제 도입 팀과 구현 일정은 확인되지 않았다. GitLab 지원이 제품의 필수 완성 조건이라고 확정하지 않는다.

## 2. 관측된 문제

- 현재 리포 연결은 GitHub App 설치와 불변 repository id에 묶여 있다.
- readiness는 두 단계다 — `installationId`가 없으면 `setup`, 있으면 활성 소스에 `lastCommitSha`가 있어야 `ready`(`lib/onboarding/readiness.ts`). `repositoryId`는 readiness가 아니라 `needs_reconnect` 판정과 인가 단계의 "저장된 id = 조회한 id" 비교에 쓰인다. Sync·Publish·열린 PR 판정에도 `installationId` 전제가 들어 있어 API 클라이언트 교체만으로 GitLab 프로젝트가 동작하지 않는다.
- `repositoryId`에는 unique 제약도 리포 호스트 컬럼도 없다(`prisma/schema.prisma`). 그래서 같은 숫자 id의 위험은 DB 충돌이 아니라 **인가 비교가 리포 호스트를 대조하지 않는 것**이다.
- 파일 포맷 어댑터와 번역 데이터는 리포 호스트와 독립적으로 재사용할 수 있다. GitLab용 번역 엔진·번역 테이블을 복제할 이유가 없다.
- GitLab 미지원으로 이탈한 사용자 수나 확정 도입 요청은 관측하지 않았다. 잠재 수요와 실제 수요를 구분한다.

근거와 변경 경계는 [design.md](design.md)에 둔다.

## 3. 범위 게이트와 제안 범위

PRODUCT §4.2에 GitLab 리포 지원을 금지한 항목은 없다. §4.3의 로그인 변경·push webhook을 이 기능의 선행 조건으로 요구하지 않는다. 기존 로그인은 유지하고 CI·수동 Sync·야간 적재를 사용한다. 값 병합이나 충돌 해소를 도입하지 않으므로 ARCHITECTURE §0의 코어 원칙과 양립한다.

⚠️ **다만 정본의 GitHub 전제 문구와는 충돌하며, 이것은 구현 결과가 아니라 착수 전 제품 판정이다.** PRODUCT §2 "GitHub-native" 포지셔닝 · §1 완료 조건의 "pull request" · §3 "GitHub 쓰기(push) 권한" · §4.3② Actions 경로 · ARCHITECTURE §0 불변식 6(GitHub OAuth와 installation 토큰 분리의 문자 그대로의 서술) · README · 랜딩·SEO·공개 문서 · DESIGN §10.1의 "Malmoi GitHub App"·`pull request` 호칭 규칙과 `banned-terms.ts`. 포지셔닝을 고칠지(GitHub-native 유지 + GitLab 부가 지원인지), 불변식 6을 리포 호스트 일반형으로 다시 쓸지, GitLab 프로젝트에서 PR을 무엇으로 부를지는 §6에서 착수 전에 닫는다.

**제안 범위(미확정)**: GitLab.com 리포만 1차 지원한다. 한 Project는 한 리포 호스트의 한 리포를 가리킨다. 기존 GitHub 프로젝트와 같은 앱·DB에서 공존한다. GitLab 하위 그룹 경로는 리포 주소로만 지원하며 말모이 조직·권한 계층으로 옮기지 않는다.

기능 범위는 연결·첫 적재·소스 관리·수동 Sync·CI push·야간 실행·Publish·실패 후 복구와 해당 웹/MCP 진입점이다. 파일 포맷·편집 기능·프로젝트 역할은 기존 계약을 공유한다. 앱 자체의 릴리스·개발 CI·changelog 원본을 GitLab으로 옮기지는 않는다.

연결 인증과 UI 정보 구조는 구현 재개 때 확정한다. 이 문서는 GitLab 로그인 추가나 특정 토큰 방식의 승인을 뜻하지 않는다.

## 4. 완료 조건 — 향후 구현의 수락 기준

1. GitHub와 GitLab 프로젝트가 같은 DB에서 공존하며 리포 호스트가 달라도 프로젝트·소스 인가가 섞이지 않는다. 인가 단계의 repository id 비교는 리포 호스트를 함께 대조한다(같은 숫자 id가 다른 호스트의 리포를 통과시키지 않는다). 읽기 권한만 가진 OWNER의 **수동 Sync, 연결된 프로젝트의 base branch 목록·저장**을 허용하고(PRODUCT §3 · #123), 생성·재연결·소스 추가·push 토큰 회전에는 리포 쓰기 권한을 요구하는 기존 계약을 보존한다. [단위·PG 통합]
2. 지원하는 다섯 파일 포맷은 같은 파일·DB 상태에서 리포 호스트와 무관하게 동일 바이트를 만든다. [어댑터 계약·blob hash 대조]
3. 연결 설정만으로 ready가 되지 않고 첫 적재 성공 뒤에만 ready가 된다. [단위·PG 통합]
4. GitLab 리포의 적재 → 편집 → Publish → MR 리뷰·머지 → 재적재 왕복이 성립한다. Publish는 고정 브랜치의 열린 MR 하나를 재사용한다. [실제 테스트 리포]
5. 자동 적재는 미전달 편집·열린 MR·MR 조회 실패·전달 revision 경합에서 기존 규칙대로 전체 보류한다. 수동 폐기는 OWNER의 서버 발급 승인 지문을 요구한다. [단위·PG 경합]
6. Publish 실패·결과 미확인·미전달 셀은 성공으로 기록하거나 토큰을 해제하지 않는다. 재시도는 중복 MR을 만들지 않는다. [실패 주입·실물]
7. 리포 이름 변경·이전 주소 재사용·자격증명 폐기·쓰기 권한 상실 시 다른 리포에 쓰거나 정상 연결로 표시하지 않는다. [계약 테스트·실물]
8. GitLab CI는 기존 페이로드 생산자(`lib/push/payload.ts`)와 프로젝트 push 토큰을 사용하며 오래된 커밋 거부·보류 응답·`/api/push/failure` 보고를 검증한다. **base 브랜치 조건·루프 마커 가드·열린 MR 경고는 서버가 아니라 GitLab CI 템플릿 쪽 책임**이라 새로 만들며, GitLab 머지 방식(merge commit·squash·fast-forward)과 사용자 정의 커밋 메시지 템플릿별로 `[skip-malmoi-i18n]` 마커가 보존되는지 검증한다(POSTMORTEM 2026-09-17). [생산자 테스트·실제 CI]
9. 웹과 MCP가 같은 코어를 부른다. GitLab 프로젝트의 웹 화면·MCP 응답에 `GitHub`·`pull request`·`github.com`이 0건이고 워크플로 안내는 `.gitlab-ci.yml`이다(말모이 자체 리포를 가리키는 링크는 제외). 기존 MCP 필드명(`lastPublishPullRequest`·`newFromGitHub` 등)의 호환 정책이 명시돼 있다. 기존 GitHub 왕복도 통과한다. [DOM·MCP·브라우저·왕복]

## 5. 비목표

- GitLab Self-Managed·Dedicated·폐쇄망, 사용자 지정 호스트. 이 제외는 1차 제안이며 재개 전에 확인한다.
- GitLab 로그인, SSO, 조직 계층, 새 역할, webhook, 자동 머지.
- GitHub↔GitLab 미러링·기존 프로젝트의 리포 호스트 전환·리포 간 데이터 이전.
- 값 병합·3-way merge·충돌 해소 UI·리포 호스트별 번역 테이블.
- 세 번째 리포 호스트를 위한 플러그인 시스템·소비자 없는 범용 API·선행 리팩터.
- SHA-256 object format 리포. 연결 시 거부한다(blob 비교가 SHA-1 `git hash-object` 전제다).
- 말모이 자체의 셀프 호스팅 구현. `self-hosting` 스펙과 별개다. **셀프호스팅 말모이 + GitLab.com 리포 조합도 이 스펙의 비목표다** — 두 스펙이 모두 착수된 뒤에야 의미가 있는 조합이라 지금 담당을 정하면 선반영이다.
- `self-hosting`과 같은 파일을 고치는 지점(초대 메일 `lib/invitation-email/` · 사전의 "GitHub App" 문구 · README · `/privacy` 전송처 · ARCHITECTURE §0)은 **먼저 착수하는 쪽이 리포 호스트 중립 낱말을 정하고 나중 쪽이 따른다.** 이 스펙은 "저장소 제공자" 대신 **"리포 호스트"**라고 쓴다 — self-hosting의 "저장소 provider"(파일 저장소)와 뜻이 다르다.

## 6. 재개 조건과 확인 필요

| 결정 | 현재 상태 | 재개 때 필요한 확인 |
|---|---|---|
| 구현 시점 | 보류, 사용자 재결정 | 실제 도입 팀·검증 리포·우선순위 |
| 포지셔닝·정본 문구 | 미결, 착수 차단 | PRODUCT §2 "GitHub-native" 유지/수정, §1·§3 문구, ARCHITECTURE 불변식 6 일반화 여부(§3 목록) |
| PR/MR 호칭 | 미결, 사전 작업 차단 | GitLab 프로젝트에서 제공자 고유명사(merge request)를 따를지 · DESIGN §10.1·§2.4·§6·`banned-terms.ts` 갱신 범위. 사전 문자열 약 90곳 × 3개 언어 분기 비용 |
| 지원 배포형 | GitLab.com 한정 제안, 미확정 | 실제 수요가 사내 설치형인지 확인 |
| 인증 방식 | 미확정, 구현 차단 | 개인에 종속되지 않는 쓰기 신원과 연결자의 리포 쓰기 권한 증명 |
| GitLab Free 플랜 지원 여부 | 미결, **사용자 결정** | 프로젝트 토큰을 고르면 GitLab.com Premium 이상만 쓸 수 있다 — "누가 쓸 수 있나"를 정하는 제품 판정이라 인증 기술 선택에 묻지 않는다 |
| GitLab CI 배포 형태 | 미결 | 불변 태그 clone / CI·CD 컴포넌트 / npm 중 택일. 제약은 design §2 |
| GitLab 생성 활성화 방식 | 미결 | env 스위치 vs `/merge` 분할. 스위치를 고르면 env·`.env.example`·롤백 절차가 태스크가 된다 |
| no-changes 종료 상태 | 미결 | "MR 닫기 → sync 브랜치 삭제"를 GitHub의 "base로 되돌리기"와 동등으로 인정할지(design §2) |
| UI | 연결·설정 흐름 미설계 | 기존 화면 수정 범위 확정, 신규 표면/큰 변경이면 design-brief 작성·시안 확보 |
| GitLab 쓰기 계약 | API 후보만 조사 | base 재생성·no-changes 정리·MR 재사용·불명확한 실패를 실물로 검증 |

이 결정이 닫히기 전 `/tdd interface`·`/implement`·`/ship`으로 자동 진행하지 않는다. 현재 산출물은 구현 가능한 최종 명세가 아니라 재개할 때 보완할 보류 초안이다.
