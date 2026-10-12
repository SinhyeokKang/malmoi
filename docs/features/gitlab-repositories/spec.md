# GitLab repositories — 스펙

작성: 2026-10-08 · 갱신: 2026-10-12(재개 확정 — `/orchestrate gitlab-repositories`, §6 미결 0 · GitLab 실물 검증 반영) · 상태: **재개됨 · 구현 중**(결정 기록은 [orch.md](orch.md) D1~D13)

## 1. 목적과 사용자

GitLab 리포를 쓰는 개발자도 말모이에 소스 문자열을 적재하고, 번역 편집자가 저장한 값을 같은 리포의 Merge Request(MR)로 받을 수 있게 한다. 번역 편집자는 기존 편집·권한·Publish 흐름을 공유한다.

**1순위 사용자는 개발자**(연결·CI 도입을 결정하는 사람)다. 번역 편집자에게는 화면 변화를 최소로 둔다 — 편집자가 보는 차이는 리포 호스트 이름·링크·PR/MR 호칭뿐이어야 한다. 이 차이는 **리포 호스트별 문장 분기**로 낸다(2026-10-12 사용자 결정 — design §2 "문구 전략").

**두 리포 호스트는 연결 방식이 다르다**(2026-10-12 사용자 결정). **GitHub는 현행(GitHub App 설치 + 사용자 연결) 그대로**이고 이 기능이 바꾸지 않는다. **GitLab은 개발자가 붙여 넣는 레거시 개인 액세스 토큰(PAT, 스코프 `api` 하나)**으로 연결한다(2026-10-12 D13 — fine-grained PAT는 §5 비목표). 근거: GitLab에는 GitHub App처럼 "설치하면 서버가 리포 한정 토큰을 발급받는" 모델이 없다. 봇 토큰(프로젝트 액세스 토큰)은 GitLab.com Premium 이상이 필요하다. 같은 종류의 제품인 GitBook GitLab Sync도 PAT(`api`·`read_repository`·`write_repository`, Maintainer)를 붙여 넣는 방식이다(2026-10-12 조회 — [Enabling GitLab Sync](https://gitbook.com/docs/getting-started/git-sync/enabling-gitlab-sync)). 말모이는 git clone을 하지 않고 REST·GraphQL만 쓰므로 `api` 하나면 된다 — `read_repository`·`write_repository`는 Git-over-HTTP 전용이다(design §2 "GitLab 연결" 실측).

새 프로젝트 모달 ①의 맨 위에 **GitHub / GitLab 탭**을 두고 전환한다. GitHub 탭은 지금 ① 그대로다.

**재개됨**(2026-10-12, D1 — `/orchestrate gitlab-repositories` 호출이 구현 시점 결정이다). 범위는 tasks §0~§6이고 커밋 A~E는 `/push` 한 배치로 dev에 나간다. 프로덕션 배포·prod 마이그레이션·GitLab 활성화는 `/merge` 몫이다. 실제 도입 팀은 여전히 확인되지 않았다 — 잠재 수요로 착수한다(§2).

## 2. 관측된 문제

- 현재 리포 연결은 GitHub App 설치와 불변 repository id에 묶여 있다.
- readiness는 세 상태다 — `installationId`가 없으면 `setup`, 있지만 활성 소스에 `lastCommitSha`가 없으면 `awaiting_first_sync`, 있으면 `ready`(`lib/onboarding/readiness.ts`). `repositoryId`는 readiness가 아니라 `needs_reconnect` 판정과 인가 단계의 "저장된 id = 조회한 id" 비교에 쓰인다. Sync·Publish·열린 PR 판정에도 `installationId` 전제가 들어 있어 API 클라이언트 교체만으로 GitLab 프로젝트가 동작하지 않는다.
- `repositoryId`에는 unique 제약도 리포 호스트 컬럼도 없다(`prisma/schema.prisma`). 그래서 같은 숫자 id의 위험은 DB 충돌이 아니라 **인가 비교가 리포 호스트를 대조하지 않는 것**이다.
- 파일 포맷 어댑터와 번역 데이터는 리포 호스트와 독립적으로 재사용할 수 있다. GitLab용 번역 엔진·번역 테이블을 복제할 이유가 없다.
- hosted와 셀프 호스팅은 **같은 이미지**다(v1.3.0 — 매 앱 태그마다 GHCR 발행, 모드는 `MALMOI_ORIGIN`으로 판정 `lib/deployment/mode.ts`). 그래서 GitLab 코드가 들어가면 막지 않는 한 셀프 호스팅 설치본에도 실린다.
- GitLab 미지원으로 이탈한 사용자 수나 확정 도입 요청은 관측하지 않았다. 잠재 수요와 실제 수요를 구분한다.

근거와 변경 경계는 [design.md](design.md), 화면은 [design-brief.md](design-brief.md)에 둔다.

## 3. 범위 게이트와 제안 범위

PRODUCT §4.2(만들지 않는 것)에 GitLab 리포 지원을 금지한 항목은 없다. **그러나 §4.1 셀프 호스팅의 "하지 않는 것"(PRODUCT `:425` "폐쇄망·GitHub Enterprise·GitLab")과 README의 공개 문구("…and GitLab aren't supported")는 GitLab 미지원을 말한다** — 착수하면 둘 다 고친다(tasks §5). §4.3의 로그인 변경·push webhook을 이 기능의 선행 조건으로 요구하지 않는다. 기존 로그인은 유지하고 CI·수동 Sync·야간 적재를 사용한다. 값 병합이나 충돌 해소를 도입하지 않으므로 ARCHITECTURE §0의 코어 원칙과 양립한다.

⚠️ **GitLab 쓰기는 연결한 개발자의 개인 명의다 — 이것이 이 기능이 고르는 대가다.** CLAUDE.md·ARCHITECTURE 불변식 6은 "OAuth 토큰으로 커밋하면 특정 개인 명의가 되고 그 사람이 떠나면 파이프라인이 깨진다"를 이유로 GitHub 쓰기를 installation 토큰으로 분리했다. GitLab에서는 그 분리를 하지 않는다: Publish 커밋·MR의 작성자는 토큰 주인이고, 토큰이 만료(GitLab 16.0부터 기본 최대 1년)되거나 철회되거나 주인이 리포 권한을 잃으면 연결이 끊긴다. 화면이 그 상태를 말하고 재연결(토큰 다시 붙여 넣기)로 복구한다. GitHub 쪽 분리는 그대로다.

⚠️ **정본의 GitHub 전제 문구와도 충돌하며, 이것은 구현 결과가 아니라 착수 전 제품 판정이다.** PRODUCT §2 "GitHub-native" 포지셔닝 · §1 완료 조건의 "pull request" · §3 "GitHub 쓰기(push) 권한" · §4.1 셀프 호스팅 "하지 않는 것"의 GitLab · §4.3② Actions 경로 · ARCHITECTURE §0 불변식 6(쓰기 신원 분리 — GitLab 예외를 문장으로 들여야 한다)과 **불변식 11**("리포의 정체성은 `Project.repositoryId`"·토큰을 그 id로 좁히는 층 — PAT는 리포 하나로 좁힐 수 없다) · README · 랜딩·SEO·공개 문서 · DESIGN §10.1의 App 호칭(현재 처음 "the GitHub App", 이어서 "the app" — DESIGN `:2422`)·`pull request` 호칭 규칙과 `banned-terms.ts`. 포지셔닝·불변식 6·11 문장·PR/MR 호칭은 §6에서 닫았다(D3·D7) — 정본 갱신은 E0·E-doc 배치가 구현과 함께 한다.

**제안 범위**: GitLab.com 리포만 1차 지원한다(사용자 지정 호스트 없음). 한 Project는 한 리포 호스트의 한 리포를 가리킨다. 기존 GitHub 프로젝트와 같은 앱·DB에서 공존한다. GitLab 하위 그룹 경로는 리포 주소로만 지원하며 말모이 조직·권한 계층으로 옮기지 않는다. **hosted와 셀프 호스팅 말모이 둘 다에서 지원한다**(2026-10-12 사용자 결정). **GitLab Free 플랜 리포도 지원한다** — PAT는 플랜과 무관하다.

기능 범위는 GitLab 연결(PAT 입력·검증·교체·해제)·첫 적재·소스 관리·수동 Sync·CI push·야간 실행·Publish·실패 후 복구와 해당 웹/MCP 진입점이다. 셀프 호스팅 쪽은 preflight·`deploy/` 설정·설치/운영 가이드·운영자 개인정보 재료·생성 CI 템플릿의 `api-url`까지다. 파일 포맷·편집 기능·프로젝트 역할은 기존 계약을 공유한다. 앱 자체의 릴리스·개발 CI·changelog 원본을 GitLab으로 옮기지는 않는다.

## 4. 완료 조건 — 향후 구현의 수락 기준

1. GitHub와 GitLab 프로젝트가 같은 DB에서 공존하며 리포 호스트가 달라도 프로젝트·소스 인가가 섞이지 않는다. 인가 단계의 repository id 비교는 리포 호스트를 함께 대조한다(같은 숫자 id가 다른 호스트의 리포를 통과시키지 않는다). 읽기 권한만 가진 OWNER의 **수동 Sync, 연결된 프로젝트의 base branch 목록·저장**을 허용하고(PRODUCT §3 · #123), 생성·재연결·소스 추가·push 토큰 회전에는 리포 쓰기 권한을 요구하는 기존 계약을 보존한다. GitLab에서 "호출자의 리포 권한"은 **그 호출자가 연결한 PAT로 조회한 access level**이다. [단위·PG 통합]
2. 지원하는 다섯 파일 포맷은 같은 파일·DB 상태에서 리포 호스트와 무관하게 동일 바이트를 만든다. [어댑터 계약·blob hash 대조]
3. 연결 설정만으로 ready가 되지 않고 첫 적재 성공 뒤에만 ready가 된다. [단위·PG 통합]
4. GitLab 리포의 적재 → 편집 → Publish → MR 리뷰·머지 → 재적재 왕복이 성립한다. Publish는 고정 브랜치의 열린 MR 하나를 재사용한다. [실제 테스트 리포]
5. 자동 적재는 미전달 편집·열린 MR·MR 조회 실패·전달 revision 경합에서 기존 규칙대로 전체 보류한다. 수동 폐기는 OWNER의 서버 발급 승인 지문을 요구한다. [단위·PG 경합]
6. Publish 실패·결과 미확인·미전달 셀은 성공으로 기록하거나 토큰을 해제하지 않는다. 재시도는 중복 MR을 만들지 않는다. **GitLab 쓰기도 기존 Publish 실행 수명 계약을 따른다** — 240초 실행 예산 안에서만 요청을 보내고, 비GET 요청은 자동 재시도하지 않으며, 만료 뒤 새 요청 전송 0건, 300초 `publish-unsettled` 창(ARCHITECTURE §5.6.2, `lib/sync/execution.ts`, POSTMORTEM 2026-10-09). [실패 주입·실물]
7. 리포 이름 변경·이전 주소 재사용·**PAT 만료·철회·스코프 부족·토큰 주인의 리포 권한 상실·토큰 주인이 프로젝트를 떠남** 시 다른 리포에 쓰거나 정상 연결로 표시하지 않는다. PAT는 리포 하나로 좁혀지지 않으므로 **쓰기 직전 project id 재대조가 필수 층**이다. 만료 임박은 경고로 미리 보인다. [계약 테스트·실물]
8. GitLab CI는 기존 페이로드 생산자(`lib/push/payload.ts`)와 **말모이 프로젝트 push 토큰**(PAT가 아니다)을 사용하며 오래된 커밋 거부·보류 응답·`/api/push/failure` 보고를 검증한다. **동작 기준선은 action v3**(`docs/ACTIONS.md` — 보류 사유별 경고, `unmanaged`는 red 아님)이고, 셀프 호스팅 설치본이 만든 템플릿은 **항상 `api-url`을 든다**(PRODUCT §4.1). **base 브랜치 조건·루프 마커 가드·열린 MR 경고는 서버가 아니라 GitLab CI 템플릿 쪽 책임**이라 새로 만들며, GitLab 머지 방식(merge commit·squash·fast-forward)과 사용자 정의 커밋 메시지 템플릿별로 `[skip-malmoi-i18n]` 마커가 보존되는지 검증한다(POSTMORTEM 2026-09-17). [생산자 테스트·마커 소비자 집계·실제 CI]
9. 웹과 MCP가 같은 코어를 부른다. **GitLab 프로젝트 스코프 라우트(`/projects/[slug]/**`)와 그 프로젝트를 대상으로 한 MCP 도구 응답**에 `GitHub`·`pull request`·`github.com`이 0건이고 워크플로 안내는 `.gitlab-ci.yml`이다. 제외: 말모이 자체 리포를 가리키는 링크, 로그인 공급자 이름, 여러 프로젝트가 섞인 화면(`/projects` 목록·Inbox·`/account`)의 GitHub 프로젝트 행, ① 모달의 GitHub 탭. 기존 MCP 필드명(`lastPublishPullRequest`·`newFromGitHub` 등)의 호환 정책이 명시돼 있다. 기존 GitHub 왕복도 통과한다. [DOM·MCP·브라우저·왕복]
10. 셀프 호스팅 설치본에서 GitLab 프로젝트의 연결 → 적재 → Publish가 hosted와 같은 코어로 성립한다. GitLab 쪽 새 env는 없고(D6), preflight는 `GITHUB_APP_*` 다섯을 all-or-none 그룹으로 판정한다(반쪽은 기동 거부, 다섯 다 없으면 GitLab 전용 설치로 기동 — D4). SELF-HOSTING §3 기능 개발 체크리스트를 통과한다. [preflight 단위·SH 체크리스트·실물]
11. **PAT는 원문으로 저장·로그·응답되지 않는다.** 봉투 암호화로만 저장되고, 화면은 붙여 넣은 뒤 다시 보여 주지 않으며(만료일·주인·스코프만), MCP·Logs·오류 메시지에 실리지 않는다. 연결 해제는 저장된 봉투를 지우고 그 연결을 참조하던 프로젝트를 `Disconnected`로 만든다. 쓰기는 프로젝트가 참조하는 연결의 PAT만 쓰고 호출자의 연결을 쓰지 않는다. [단위·credential 비노출 테스트]

## 5. 비목표

- GitLab Self-Managed·Dedicated·폐쇄망, 사용자 지정 호스트. 재개 때 유지로 확정했다(2026-10-12 — 지원 배포형 행). (말모이를 셀프 호스팅하는 것과 다르다 — 그쪽은 §3 범위다.)
- **GitLab OAuth 앱 연결·프로젝트/그룹 액세스 토큰(봇)·서비스 계정** — 2026-10-12에 모든 플랜 연결자 PAT로 정했다. OAuth는 결국 연결자 명의라 PAT와 쓰기 신원이 같고 앱 등록·callback·origin 경계만 늘린다. 봇 토큰은 "연결은 PAT, 쓰기는 봇"으로 구현 가능함을 확인했지만(design §2) GitLab.com Premium 이상이라 Free를 막고 경로가 둘이 된다.
- **fine-grained PAT**(2026-10-12 D13 — 레거시 PAT만 받는다). 조사 결과(문서 근거): GitLab 19.2 GA·Free 포함, 프로젝트 하나로 좁힐 수 있고 말모이가 쓰는 REST 경로 전부에 권한 행이 있으며 `GET /personal_access_tokens/self`의 `granular_scopes[]`로 범위를 읽을 수 있다. 받지 않는 이유: 계정 단위 연결 하나를 여러 프로젝트가 참조하는 모델(design §2)과 프로젝트 한정 토큰이 맞지 않고, 생성 페이지 프리필이 없어 사용자가 프로젝트·권한 약 8개를 손으로 고르며, GraphQL 커버리지가 미완이다. 검증은 fine-grained 토큰을 **분명한 사유로 거부**한다(반쯤 동작시키지 않는다). ⚠️ 대가: GitLab.com 최상위 그룹 Owner가 레거시 PAT 차단을 켠 조직은 연결할 수 없다 — 실제 수요가 관측되면 다시 본다.
- **PAT 자동 회전**(GitLab self-rotate API) — 만료 임박 경고 + 사람이 다시 붙여 넣기로 충분한지 운영해 본 뒤 판단한다.
- GitLab 로그인, SSO, 조직 계층, 새 역할, webhook, 자동 머지.
- GitHub 연결 방식 변경 — 현행 GitHub App 그대로다.
- GitHub↔GitLab 미러링·기존 프로젝트의 리포 호스트 전환·리포 간 데이터 이전.
- 값 병합·3-way merge·충돌 해소 UI·리포 호스트별 번역 테이블.
- 세 번째 리포 호스트를 위한 플러그인 시스템·소비자 없는 범용 API·선행 리팩터.
- SHA-256 object format 리포. 연결 시 거부한다(blob 비교가 SHA-1 `git hash-object` 전제다).
- **리포 호스트 중립 낱말은 이 기능이 정한다.** 셀프 호스팅(v1.3.0, 정본 `docs/SELF-HOSTING.md`·PRODUCT §4.1)은 App 호칭만 정리하고(DESIGN §10.1 — "the GitHub App" → "the app") 리포 호스트 축은 건드리지 않은 채 출시됐다 — 초대 메일 `lib/invitation-email/template.ts`는 여전히 "sends it back to GitHub"다. 이 스펙은 "저장소 제공자" 대신 **"리포 호스트"**라고 쓴다 — 셀프 호스팅의 "저장소 provider"(파일 저장소)와 뜻이 다르다.

## 6. 재개 결정 (2026-10-12 — 미결 0)

결정 ID는 [orch.md](orch.md) "결정 기록"이다. 실측 원문은 W0 워크트리 `.scratch/gitlab-measure/`에 있었고 결론은 design에 올렸다.

| 결정 | 결정 | 근거 |
|---|---|---|
| 구현 시점 | **지금**(D1). 도입 팀은 미확인 — 잠재 수요로 착수 | 사용자 `/orchestrate gitlab-repositories` 호출 |
| 검증 리포 | 사용자가 준비한 GitLab.com 폐기용 private 프로젝트 + 레거시 PAT(D2). 실측 완료(design §2) | 사용자 2026-10-12 |
| 인증 방식 | GitHub 현행 · GitLab은 **모든 플랜에서 연결자 레거시 PAT, 스코프 `api` 하나**, Maintainer(40) 이상. 계정 단위로 하나 보관하고 프로젝트는 그 연결을 참조한다(design §2). fine-grained PAT·봇 토큰은 받지 않는다(§5, D13) | 실측: `api` 토큰으로 commit·MR·브랜치 삭제·tree·GraphQL 전부 성공. 문서: `write_repository`는 "Does not support API authentication", `read_repository`는 files API GET/HEAD만 — 최소 스코프는 `api`(스코프 낮은 두 번째 토큰은 만들 수 없어 **문서 근거**). 메타 `GET /personal_access_tokens/self` 실측 200(`scopes`·`expires_at`·`user_id`·`active`·`revoked`·`granular`). 프리필 URL 실측(지휘자) — design §2 |
| GitLab Free 플랜 | **지원**(PAT라 플랜 무관) | — |
| 연결 입구 | ① 맨 위 GitHub / GitLab 탭(design-brief) | — |
| 포지셔닝·정본 문구 | **GitHub 주, GitLab.com 병기**(D3). PRODUCT §2 "GitHub-native" 유지 + GitLab.com 지원 문장 · 불변식 6 = "GitHub은 쓰기 신원 분리, GitLab은 연결자 PAT 명의(예외)" · 불변식 11 = "PAT에는 첫 층이 없어 쓰기 직전 project id 재대조가 필수 층" · 랜딩·SEO 헤드라인 유지, 기능·포맷 절과 §4.1·README의 미지원 문구만 고친다 | 사용자 2026-10-12 |
| PR/MR 호칭 | GitLab 프로젝트에선 **merge request**(D7). GitHub은 그대로. DESIGN §10.1·§2.4·§6·`banned-terms.ts`·`terminology.test.ts`는 E0 배치가 사전 작업보다 먼저 고친다 | DESIGN §10.1의 pull request 허용 근거("제공자 고유명사이고 링크가 실제로 그리 간다")가 그대로 답한다 |
| MR 번호 표기 | GitLab `!128`, GitHub `#128` 그대로 | 2026-10-12 |
| es 호칭 | 영어 고유명사 **`merge request`** 유지(D7, 시안 G11b `las merge requests`) | es가 이미 "pull request"를 영어로 쓴다 |
| 지원 배포형 | 리포 호스트는 GitLab.com 한정(Self-Managed는 §5 비목표 유지) · 말모이 배포는 hosted·셀프 호스팅 둘 다 | 2026-10-12 |
| GitLab 전용 셀프 호스팅 설치의 GitHub App | `GITHUB_APP_*` 다섯은 **all-or-none 그룹 선택**(반쪽은 기동 거부, D4). App이 없는 설치는 ①에 탭 줄 없이 GitLab 단독, `/account`·설정의 GitHub 연결 카드·설치 링크를 그리지 않는다(D4a). hosted는 항상 둘 다 | 사용자(D4) · 지휘자(D4a — `GITHUB_APP_SLUG` 부재 시 조용히 사라지는 선례) |
| PAT 봉투 키·회전 | **토큰 키**(`TOKEN_ENCRYPTION_KEYS`)로 봉한다(D8). `lib/credentials/conversion.ts`의 `rotate-token`·`verify`·`oldTokenKey` 집계에 새 열 등록 | OPERATIONS 키 표의 용도 구분 — GitHub 연결 토큰과 같은 부류 |
| 연결자가 프로젝트를 떠날 때 | 끊긴다. 참조 주인이 멤버에서 빠지거나 계정·연결을 지우면 참조가 비고 `Disconnected`, 남은 OWNER가 자기 PAT로 재연결 | 2026-10-12 |
| GitLab CI 배포 형태 | **불변 태그 clone + SHA 대조**(D5). 생성 `.gitlab-ci.yml`이 말모이(GitHub) 리포를 새 태그 축 `malmoi-i18n-push-gitlab-vN`으로 shallow clone → 템플릿에 박힌 40자 commit SHA와 대조 → action v3와 같은 pnpm 생산자. 원본 위치·본문 요건은 design §2 | 사용자 2026-10-12 |
| GitLab 생성 활성화 방식 | **스위치 없음**(D6) — prod는 `/merge`, 셀프 호스팅은 그 태그로 업그레이드가 곧 활성화. 새 env 없음. 롤백 창의 위험 하나(구버전 `/api/push`에 열린 MR 게이트 없음)는 수용하고 롤백 절차로 막는다(D6a, design §4) | 사용자(D6) · 지휘자(D6a). 구버전 경로 전수는 [consumers.md](consumers.md) §2 |
| no-changes 종료 상태 | **MR 닫기 → sync 브랜치 삭제**를 GitHub "base로 되돌리기"와 동등으로 인정(D9). 두 번째 실행 외부 쓰기 0회 실측 | 실측: GitLab엔 ref 강제 이동 API가 없고, `allow_empty` 빈 커밋은 head ≠ base라 수렴하지 않는다(design §2) |
| 트리 크기 입력 | REST tree는 `size`를 주지 않는다(실측) → 예산 대상 경로만 **GraphQL `repository.blobs(ref, paths)`**로 `size`·`lfsOid`를 한 번에 읽는다. 호출당 100경로(복잡도 한도 250 — 실측 2N+18), 200파일 상한이면 최대 2회 | 실측(design §2 Publish 표) · D12 |
| 저장 오류 코드 · 메모 키 · `GITHUB_WAIT_MS` | 기존 코드 재해석 · 키에 호스트·연결 참조 · 이름 유지(D12) | design §3 "0단계 판정" |
| UI | 시안 v6 확인 완료 · 열린 갈래 0(design-brief) · 만료 임박 경계 14일(D11) · 글리프 단색 `currentColor`(D10) · CI YAML 본문 요건 확정(design-brief G7) | 지휘자 D10·D11 · 시안 검토 |
| GitLab 쓰기 계약 | 실측 완료 — base 재생성·MR 재사용·no-changes 정리·보호 브랜치 거부·blob id 대조(design §2 Publish 표). fork MR·권한 상실·만료·철회는 **문서 근거**(실측 불가 표기) | W0 실측 2026-10-12 |

남은 것은 결정이 아니라 구현이다 — tasks §1부터 진행한다.
