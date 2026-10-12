# GitLab repositories — 재개 후 태스크

상태: **재개됨**(2026-10-12 `/orchestrate gitlab-repositories` — §0 완료, §1부터 진행). 배치·소유권은 [orch.md](orch.md). 갱신 2026-10-12(W0 — §0 결정·실측·전수 표).

검증 줄 표기: **[자동]** 명령 결과로 판정 · **[수동]** 스킬·절차로 사람이 판정(이 리포엔 e2e 프레임워크가 없다). 실물 증거(원격 SHA·MR 번호·CI 실행 링크·스크린샷)는 해당 배치의 `/merge` PR body에 남기고, 결론은 정본(ARCHITECTURE 등)으로 올린다 — 이 디렉터리는 기능이 끝나면 지워진다.

**배치 경계**: 커밋 A·B1·B2·C·D·E는 **같은 `/push` 배치 하나**로 나간다(2026-10-12 사용자 결정). 백엔드만 dev에 나가면 화면은 GitHub 문구인 채 GitLab 경로가 열리고, A만 나가면 GitLab 소비자 없는 경계(확장성 선반영)가 남는다. B1 마이그레이션은 `/push` 전에 `/db`로 dev에 넓힌다. 커밋마다 `pnpm gate`를 green으로 통과시킨다 — 출력을 `| grep`·`| head`로 거르지 않는다(POSTMORTEM 2026-09-30).

**런타임 검증 원칙**(`/ship` 6.2): 진입점 + 가짜 클라이언트 + 격리 PG로 결정적으로 잴 수 있는 상태는 `*.integration.ts` 시나리오 테스트로 쓰고 끝 단언은 DB 행이 아니라 **뷰 모델 출력**(`metaTabs`·`attentionItems`·`eventSentence` 등 — Home·Inbox·Logs가 쓰는 함수)이다. `/runtime-test`에는 렌더·포커스·라이트/다크·375 폭·실제 외부만 남긴다.

## 0. 재개 결정·설계 확정 — 문서 경계

- [x] 사용자가 spec §6의 미결 행을 닫는다 — 구현 시점·도입 팀·검증 리포, 포지셔닝·정본 문구(PRODUCT §1·§2·§3·§4.1·README·불변식 6·11), PR/MR 호칭, MR 번호 표기·es 호칭, 지원 배포형, GitLab 전용 셀프 호스팅 설치의 GitHub App, PAT 봉투 키·회전, 연결자가 프로젝트를 떠날 때, CI 배포 형태, 활성화 방식, no-changes 종료 상태, 트리 크기 입력.
  - 검증: [수동] spec §6의 모든 행에 사용자 결정과 근거가 적혀 "미결"이 0행이다. → 완료(orch.md D1~D13, spec §6).
- [x] PAT 실물 확인 — 최소 스코프(`api` 없이 commit·MR이 되는지), 토큰 메타 API로 만료일·스코프·주인을 읽을 수 있는지, 토큰 생성 페이지 URL 프리필(이름·스코프)이 되는지, 만료·철회·스코프 부족·권한 상실 각각의 응답 코드.
  - 검증: [수동] design §2 "GitLab 연결"과 §5에 실측 결과(엔드포인트·응답 코드·스코프 목록)가 적혀 "확인 필요" 표기가 0이다. 철회·퇴사·만료 사례별 동작 표가 있다. → 완료. 최소 스코프 `api`(실측 + 문서 근거 — `api` 없는 토큰은 만들 수 없어 문서로 판정), 만료·철회·스코프 부족·권한 상실 응답은 **문서 근거** 표기.
- [x] GitLab 실제 테스트 리포에서 API의 base 재생성·MR 재사용·no-changes 정리·권한 부족·응답 유실·**트리 항목의 size 제공 여부와 크기 조회 비용**을 검증하고 공통 인터페이스를 확정한다.
  - 검증: [수동] 시나리오별로 원격 commit의 parent SHA = 캡처한 base SHA, 변경 외 파일 blob id 불변, 열린 MR 개수 = 1(no-changes 뒤 0), 두 번째 no-changes 실행의 외부 쓰기 호출 0회, 실패 주입 뒤 sync 브랜치·MR 상태, 크기 예산(`lib/onboarding/budget.ts`) 입력을 얻는 방식과 호출 수가 기록된다. 지원 못 하는 계약이 있으면 spec을 다시 확정하기 전까지 다음 단계로 가지 않는다. → 완료(design §2 Publish 실측 표 · §3 "공통 경계"). 지원 못 하는 계약 없음. 응답 유실·실패 주입은 실물로 재지 못해 계약 테스트(§3)와 `/roundtrip`(§6)으로 남긴다. fork MR은 문서 근거.
- [x] `installationId`·`repositoryId` 소비자 전수 표를 만든다(재개 실측 56 = `app` 7 · `lib` 48 · `scripts` 1). 메모 키(`open-pr-memo`·`probe-memo`)에 리포 호스트를 넣을지, 저장 오류 코드(`github-error`·`not-installed`) 정책, `GITHUB_WAIT_MS` 이름 일반화를 판정한다. design §2 UI 표면 표를 design에 적힌 기준 명령으로 키 단위로 다시 만든다.
  - 검증: [수동] `rg -l -e installationId -e repositoryId app lib components scripts -g '!**/__tests__/**'`의 파일 수와 표의 행 수가 같고, 행마다 "경계 이관/GitHub 전용 유지/무관" 중 하나가 적혀 있다. UI 표에 design §2의 "빠뜨리면 안 되는 자리"가 전부 있다. → 완료([consumers.md](consumers.md) — 56행, UI 136키, 판정은 design §3 "0단계 판정"). D6 전제 경로 전수는 consumers.md §2(예외 `/api/push` → D6a).
- [x] **시안 확보** — [design-brief.md](design-brief.md)의 열린 갈래를 spec §6 결정으로 닫고 시안을 받는다(Claude Code는 DesignSync, Codex는 로컬 핸드오프). 시안 링크는 받는 즉시 이 문서에 URL 그대로 적는다. 시안: [GitLab Repositories](https://claude.ai/design/p/b99d54cd-3034-44f1-8446-0a864da9d767?file=GitLab+Repositories.dc.html) (2026-10-12 수령).
  - 검증: [수동] 브리프에 "열린 갈래" 0행, 시안 링크·대상 프레임 목록이 feature 문서에 있고, E의 UI 구현 태스크가 이 태스크 뒤에 놓여 있다. → 완료(design-brief "열린 갈래 — 0" · G7 본문 요건).

## 1. 공통 판정·계약 — 커밋 A

선행 조건: §0의 GitLab 실물 검증 완료(경계를 두 번 짜지 않도록).

- [x] identity(`repoTargetOf` — `ok`/`not-connected`/`unpinned` 셋, `sameRepoTarget`·`sameRepository` — design §3 "공통 경계")·연결/readiness·지문 넷(design §2 지문 표)·원격 상태 정규화·URL·저장 오류 코드·권한 분류의 순수 함수 테스트를 먼저 작성한다("CI 입력" 순수 함수는 D1 소유 — §4).
  - 검증: [자동] red 관측 뒤 구현하고 `pnpm gate` green. 다른 리포 호스트의 같은 id·하위 그룹·조회 실패·첫 적재 미완·**기존 GitHub 지문(전달 문맥) 바이트 불변**·401을 `unavailable`로 접지 않음·access level 없음 → `unavailable` 사례 포함. GitHub `unpinned`가 `not-connected`로 접히지 않는다(설정·Home·번역·MCP의 [Reconnect] 갈래 유지). `sameRepository`는 연결이 달라도 같은 리포면 true, `sameRepoTarget`은 연결이 다르면 false.
- [x] 공용 가짜 클라이언트를 새 경계로 이관한다. 대상은 `createFakeGitClient` 소비자 14개 파일, `vi.mock("@/lib/github", …)` 20개 파일, `vi.doMock` 2개(`lib/keys/__tests__/list-aggregates.integration.ts`·`sync-edit-protection.integration.ts`) — 재개 시점에 다시 센다. 가짜에 N번째 호출 실패·상태 코드 지정·페이지네이션·열린 PR/MR 응답 지정(지금 `isPullRequestOpen`은 항상 false)을 더한다.
  - 검증: [자동] 이관 전후 `pnpm test`·`pnpm test:projects:postgres`·`pnpm test:credentials:postgres`의 Tests 수를 각각 기록해 같고 `pnpm gate` green.
- [x] 실제 GitHub 소비자를 새 경계로 함께 이관하고 GitHub 전용 요청 조립은 리포 호스트 구현에 남긴다. 범위는 [consumers.md](consumers.md) §1(경계 이관 43)과 §1.1 간접 소비자(번역 페이지의 `storedConnection`·`loadConnectionHealth` — 설정 페이지 `:56`도)다. 호출자 접근 확인 뒤 I/O는 항상 `repoTargetOf(project)`로 연다.
  - 검증: [자동] 기존 호출 생략·고정 base·단일 PR·전달 확인 계약 테스트 통과, **무효화 순서 한 줄**(가짜 클라이언트 호출 기록에서 첫 비읽기 메서드 `publishSnapshot`·`closePr`·`resetSyncBranch`가 `invalidateDelivery` 뒤), `pnpm gate` green(이관 경로가 `test:projects:postgres` 트리거라 격리 PG 스위트가 붙는다).
- [x] 새 구현 경로를 `scripts/gate-plan.ts` 트리거와 해당 `vitest.*.config.ts` 수집 경로에 등록한다 — **`lib/repo-host/`와 GitLab 구현 디렉터리(B·C가 채울 경로 포함)를 A가 한 번에** 등록한다(B·C는 gate-plan을 건드리지 않는다). include 밖의 생산 경로도 등재한다(POSTMORTEM 2026-10-07).
  - 검증: [자동] `scripts/__tests__/gate-plan.test.ts`에 "새 GitLab 구현 파일 하나만 바꾼 diff" 케이스를 추가해 `test:projects:postgres`가 선택된다.

## 2. additive 스키마·연결 저장 — 커밋 B1·B2

### B1 — `/db` 산출물만

- [x] 확정 설계에 따라 리포 호스트/주소/자격증명 migration을 작성한다. 번역 테이블을 복제하거나 기존 필드를 즉시 제거하지 않는다. **백필은 SQL 안에서 끝낸다**(셀프 호스팅은 버전을 건너뛴다 — SELF-HOSTING §3-1). 커밋은 `schema.prisma`와 migration 파일만이다(`/db` 6단계).
  - 검증: [수동] `/db` 절차로 SQL 검토, dev에서 `has_schema_privilege`(anon·authenticated × USAGE·CREATE) 네 칸 false, 새 자격증명 테이블이면 `role_table_grants` 0건. [자동] 기존 GitHub 행 보존과 혼합 리포 호스트 identity를 격리 PG에서 확인, 앱 코드 없이 마이그레이션만으로 기존 행이 GitHub로 해석된다.

### B2 — 배선

- [x] **최소 GitLab transport**(읽기 GET만)를 B가 만든다 — 숫자 id 주소(REST `/projects/<id>/…`, 인코딩한 `namespace%2Fpath` 금지), `execution.fetch()` 주입점(Publish 실행 수명 — C가 쓰기를 얹는다), 오류 분류(401 → 재인가 · 403 `insufficient_scope` · 404 → 접근 상실(없음과 권한 은폐를 가르지 않고 "없다"로 단정하지 않는다) · 5xx/429/네트워크 → `unavailable`). B2의 PAT 검증(`/self`·`/user`)·호출자 권한(`members/all/<user id>`)·credential-separation의 "GitLab 클라이언트 모듈 import" 기준이 이 위에 선다.
  - 검증: [자동] 분류 테스트(401을 `unavailable`로 접지 않음 · 429는 `unavailable`), **주소 계약: 가짜 transport가 받은 URL·GraphQL 본문에 `%2F`나 `fullPath`가 있으면 red**(design §3 — POSTMORTEM 2026-09-27 형), 자체 재시도 0.
- [x] 개인정보 모델의 새 필드(계정 GitLab 연결 — PAT 봉투·GitLab 사용자 id·사용자명·만료일·스코프)를 같은 커밋에서 `lib/privacy/collected.ts`에 등재한다(빠지면 typecheck red — CLAUDE.md "개인정보 방침"). 방침 본문·개정 이력은 E-sh다.
  - 검증: [자동] `pnpm typecheck` green, `lib/privacy/__tests__/` 수집 목록 테스트 green.
- [x] App 구성 여부 판정 헬퍼(D4a — `GITHUB_APP_*` 다섯이 다 있나)를 둔다. E-ui의 ①·`/account`·설정 화면 갈래와 E-sh의 preflight 그룹 규칙이 이것을 쓴다.
  - 검증: [자동] 다섯 다·일부·없음 세 사례 단위 테스트.
- [x] `connectRepository`(`app/(edit)/projects/[slug]/settings/actions.ts`, GitHub 전용)에 호스트 가드를 둔다 — `host !== "github"`이면 probe 전에 거부하고 UPDATE `where`에 `host: "github"`(consumers.md #3).
  - 검증: [자동] GitLab 프로젝트 slug로 직접 호출하면 GitHub probe 호출 0 · 행 무변경 · 거부 코드.

- [x] 연결 저장·재연결·쓰기 권한 검증·지문 넷·readiness에 리포 호스트 identity를 연결한다. 새 연결·재연결 Action을 `app/__tests__/locked-access.test.ts`의 `SITES`(토큰을 쓰면 `TOKEN_SITES`)에 등록한다.
  - 검증: [자동] 연결 변경 중 적재/Publish, 제거된 멤버, 보관 프로젝트, 다른 리포 id, 같은 숫자 id의 다른 리포 호스트, **연결 흐름 도중 세션 만료**(Action이 세션을 다시 읽는 경로)에 대한 PG 통합 테스트 통과. 잠금 호출을 지운 뮤테이션에서 locked-access가 red.
- [x] 호출자의 리포 권한 검사를 경로별로 보존한다. 수동 Sync와 연결된 프로젝트의 base branch 목록·저장(`updateRepositorySettings`)은 읽기 권한, 생성·재연결·소스 추가·push 토큰 회전은 쓰기 권한을 요구한다. `requirePush`는 기본값 없는 필수 인자로 둔다. GitLab 권한은 호출자 PAT로 `GET /projects/<id>/members/all/<호출자 user id>`의 `access_level`이다(쓰기 40↑ · 읽기 Reporter 20↑ · 404 = 멤버 아님 — design §3 `checkRepoAccess`). `RepoAccess`의 GitLab 갈래와 GitLab 실패 코드(`OnboardFailure` 추가 — 호출자 GitLab 연결 없음·만료·fine-grained·unavailable)는 B의 계약이다.
  - 검증: [자동] 두 리포 호스트 모두 읽기 전용 OWNER의 Sync·base branch 목록·저장은 성공하고, 쓰기 권한이 필요한 네 경로는 거부된다. 그룹에서 Maintainer를 상속한 사용자(`project_access: null`)가 쓰기 경로를 통과하고 Guest는 읽기도 거부된다. 연결자가 아닌 OWNER의 Sync·소스 추가가 `repo-replaced`로 거부되지 않는다(`sameRepository`). 서버 쓰기 자격증명의 존재만으로 호출자의 권한을 인정하지 않는다. 401 → 재인가 경로가 있고 복구 컨트롤 0개인 화면 상태가 없다(POSTMORTEM 2026-09-19).
- [x] `lib/github-connect/__tests__/credential-separation.test.ts`에 GitLab 경계를 등록한다 — **쓰기(Sync·Publish·야간)는 그 프로젝트가 참조하는 연결의 PAT만, 호출자 세션의 연결은 쓰지 않는다**. 완전성 검사의 기준(GitLab 클라이언트 모듈 import)과 fetch 기반 쓰기 패턴(비GET `fetch`)을 정의한다.
  - 검증: [자동] 쓰기 경로가 호출자 연결을 고르는 픽스처, 연결 경로에 비GET `fetch`를 넣은 픽스처에서 각각 red, 원복 시 green.
- [x] 새 Route Handler가 없음을 확인한다(design §5 "새 진입점 없음"). 구현 중 생기면 인가 스캐너 `app/__tests__/entry-points.test.ts`의 `guard(` 집계에 등록한다(POSTMORTEM 2026-09-18).
  - 검증: [자동] `app/api/` 아래 새 파일 0, 생겼다면 `guard(` 호출을 지운 뮤테이션에서 red.
- [x] PAT 입력·검증·보관·교체·해제 Server Action과 프로젝트의 연결 참조(생성·재연결)를 만든다(design §2 "GitLab 연결" — 저장은 계정 하나, 프로젝트는 참조). 검증 사유를 가르는 순수 함수(무효(401 — 만료·철회 포함)·스코프 부족(`api` 없음)·fine-grained 거부(`granular`)·네트워크/5xx/429 → `unavailable`, design §2 "GitLab 연결" 2단계)를 먼저 테스트한다. `/self`의 `last_used_ips`는 저장하지 않는다.
  - 검증: [자동] 사유별 분류 테스트(네트워크 오류를 "무효"로 접지 않음), 원문 PAT가 응답·로그·`ProjectEvent`·MCP 응답에 0건(spec 완료 조건 11), 해제 뒤 봉투 행 0 + 참조하던 프로젝트가 `Disconnected`, 계정 토큰 교체 뒤 참조하는 프로젝트 전부가 새 토큰으로 쓰기, 참조 주인이 멤버에서 빠지면 같은 tx에서 참조가 빔, 다른 OWNER의 재연결이 참조를 자기 연결로 바꿈.

## 3. GitLab I/O·Sync·Publish — 커밋 C

- [x] GitLab 가짜 클라이언트(호출 기록·실패 주입·페이지네이션)를 먼저 만든다 — B의 최소 transport 위에 쓰기·Publish·MR을 얹는다.
  - 검증: [자동] 가짜 클라이언트 자체 테스트 green. 아래 계약 테스트가 이것만으로 쓰인다.
- [x] GitLab 쓰기를 Publish 실행 수명 계약에 묶는다 — B transport의 `execution.fetch()` 주입점을 지나고, 비GET(commit·MR 생성·MR 닫기·브랜치 삭제)은 쓰기로 세며 자동 재시도 0회(design §2 Publish). GraphQL(POST)은 Publish 실행 안에서 부르지 않는다(design §3 `sizes`).
  - 검증: [자동] 예산 만료 뒤 새 전송 0건 · 애매한 5xx 뒤 MR POST 1회 · 늦은 성공이 stale FAILED를 덮지 않음 · 쓰기 뒤 실패는 `execution-uncertain`(POSTMORTEM 2026-10-09).
- [x] 렌더 중 원격 조회(GitLab 원격 상태·probe·열린 MR 게이트)가 공유 마감 `lib/github-wait.ts`를 쓰게 한다. 손 사본을 만들지 않는다.
  - 검증: [자동] 테스트가 `lib/__tests__/fast-github-wait.ts`를 쓰고 `pnpm test`에 EnvironmentTeardownError 0(POSTMORTEM 2026-10-02).
- [x] 완전한 tree/blob 스냅샷(REST tree keyset 끝까지)·크기 예산(GraphQL `blobs` 100경로씩 — `RepoReader.sizes`, design §3)·페이지네이션·불변 id 검증을 구현한다.
  - 검증: [자동] 중간 페이지 실패·잘린 목록·크기 초과·크기 미제공·이름 재사용을 성공/빈 목록으로 처리하지 않는다. GraphQL `size`는 문자열 → 숫자, 안전 정수가 아니면 `unavailable` · 응답 `project.id`가 저장된 gid와 다르면 `unavailable`. SHA-256 리포·LFS 포인터 파일은 거부, 경로 인코딩(공백·유니코드·`%`·하위 그룹)은 왕복 동일, 429는 일시 장애로 판정. GitHub `getTree` truncated에서 던지는 동작도 같은 계약 테스트에 한 줄.
- [x] 다섯 파일 포맷 × 두 리포 호스트의 render 바이트 동일을 단언한다. 빈 키·orphan·로케일 누락·빈 `{}` 중첩 JSON·chrome `placeholders: null` 사례를 GitLab에도 한 줄씩 둔다.
  - 검증: [자동] 어댑터 계약 테스트 green, 같은 DB·원본에서 두 호스트 출력의 blob hash가 같다(spec 완료 조건 2).
- [x] commit actions 조립 테스트를 먼저 작성한 뒤 GitLab 쓰기와 MR 생명주기를 연결한다.
  - 검증: [자동] 고정 base·파일 mode(`execute_filemode` 미사용 — 수정 파일 100644)·중복 MR 방지·target 변경·no-changes(닫기 → 정리 순서, 두 번째 실행 외부 쓰기 0회)·결과 미확인·Publish 도중 쓰기 토큰 만료 계약 테스트 통과. 동명 fork MR과 자체 MR이 공존하거나 fork MR만 있는 경우를 넣어 source/target project id가 다른 MR을 재사용·닫기·자동 적재 보호 대상으로 선택하지 않는지 확인한다. 보관된 GitLab 프로젝트의 쓰기 403은 재연결 필요로 분류되고 재시도하지 않는다. GitHub `findOpenPr` 페이지네이션 사례도 한 줄. compare: `ahead = commits.length > 0 || diffs.length > 0`, `compare_timeout: true`는 조회 실패(throw — "변경 없음" 아님). GitLab `createGitClient`의 `GET /projects/<id>`가 1층(미전달 0) 뒤에서만 나간다(1층 스킵 시 호출 0).
- [x] 변경 없음 경로의 쓰기 호출 0회를 단언한다.
  - 검증: [자동] 1층(DB 미전달 0 → 원격 호출 0)·2층(blob hash 전부 동일 → commit API 호출 0)을 가짜 클라이언트 호출 기록으로 단언.
- [x] 첫 적재·소스 관리·수동 Sync·야간·자동 적재 보호를 기존 코어에 연결한다(gate-plan 트리거는 A가 이미 등록했다 — 빠진 경로가 보이면 지휘자에게 알린다). 저장 오류 코드 정책(§0 판정)을 적용한다.
  - 검증: [자동] `pnpm gate` green(관련 격리 PG 스위트 포함). 열린 MR/조회 실패 보류, Publish/no-changes 경합, 미전달 토큰 보존, 기본 브랜치 개명 시 `base-branch-missing`과 늦게 도착한 판정 무시 포함. 저장 오류 코드는 재사용(design §3 "0단계 판정") — `error-codes.test.ts` 등재 변화 없음, Logs 문장만 호스트 분기.
- [x] 연결 상태 시나리오를 `*.integration.ts`로 쓴다 — 권한별 연결·PAT 만료·만료 임박·철회·스코프 부족·주인의 권한 상실·일시 장애·재시도·보관 403. 쓰기 직전 project id 재대조(PAT에는 리포 한정 층이 없다)도 시나리오로 둔다.
  - 검증: [자동] 진입점 → 가짜 클라이언트 → 격리 PG → **뷰 모델 출력**(Home `metaTabs`·Inbox `attentionItems`·Logs `eventSentence`·설정 연결 상태)으로 단언. DB 행에서 멈춘 단언이 없다.

## 4. CI·MCP — 커밋 D

- [x] GitLab CI 경로를 **불변 태그 clone + SHA 대조**(D5)로 만든다 — 원본 `.gitlab/malmoi-i18n-push/push.sh`, 생성기 `lib/onboarding/gitlab-ci.ts`, 태그 축 `malmoi-i18n-push-gitlab-vN`(design §2 "적재와 Sync"). 40자 SHA 대조·protected+masked `PUSH_TOKEN`·base 조건·루프 마커 가드(`rules` + `push.sh`, 두 겹)·열린 MR 경고(서버 `deferred` 사유)·`/api/push/failure` 보고(`lastCommitSha` 미전진)를 연결한다. 동작 기준선은 action v3, 셀프 호스팅이면 `MALMOI_I18N_API_URL`을 항상 든다. `docs/ACTIONS.md`에 GitLab 절을 쓴다. 태그를 처음 만드는 것은 action 릴리스와 같은 절차다(앱 릴리스와 별개).
  - CI 입력 변환 순수 함수(checkout·base·마커·설정 → 기존 생산자 입력/스킵 — design §3 표)도 D1이 만든다(§1에서 옮김).
  - 검증: [자동] 페이로드 생산자·CI 입력 변환 테스트 green. GitLab 템플릿을 `lib/pull/__tests__/skip-marker.test.ts`의 마커 소비자 넷째로 등록하고 GitLab merge commit·squash 기본·squash 사용자 템플릿·fast-forward 메시지 모양 사례 green(POSTMORTEM 2026-09-17 grep 기대값 갱신). GitLab 템플릿 YAML 계약 테스트(`scripts/__tests__/action-setup.test.ts` 선례) green. 셀프 호스팅 생성 템플릿에 `api-url`이 있다. 실제 CI 검증(서버 GitLab 경로·Publish MR이 필요하다)은 §6 QA 항목이다.
- [x] MCP 저장소 목록·프로젝트 생성·연결 및 Sync/Publish를 동일 코어에 배선한다. MCP 응답 문구는 `messages/{en,ko,es}.tsx`의 `mcp` 절이고 D2 소유다 — 기존 키 수정이면 en만, **새 키면 세 사전을 같은 커밋에서**(`satisfies Messages`). 기존 필드명(`lastPublishPullRequest`·`newFromGitHub`)의 호환 정책을 적용하고 `get_workflow`(`lib/mcp/tools/onboarding.ts`의 경로 하드코드)가 리포 호스트에 맞는 경로를 낸다.
  - 검증: [자동] 리포 호스트 지정/기존 클라이언트 호환·사용자/프로젝트 인가·credential 비노출·실패 응답 테스트, GitLab 프로젝트 대상 도구 응답에 `GitHub`·`pull request`·`github.com` 0건.

## 5. UI·번역·가이드·셀프 호스팅 — 커밋 E

- [x] DESIGN §10.1·§2.4·§6, `lib/i18n/__tests__/helpers/banned-terms.ts`(GitLab 조사 `이·은·을·으로` 행 포함), `lib/i18n/__tests__/terminology.test.ts`의 `CONCEPT_BANNED`·`ALLOWED`를 spec §6의 PR/MR 호칭 결정에 맞게 **사전 작업보다 먼저** 고친다. design §2 연결 상태 톤 표를 채운다.
  - 검증: [자동] banned-terms·terminology 테스트 green(머지 리퀘스트 표기 변형·GitLab 조사 오용·홀로 선 "Couldn't check"가 MR 목적어에도 걸림). [수동] 톤 표에 "미결" 0행.
- [x] 상태 라벨 분기를 `lib/status/canon.ts`의 `STATE` 한 곳에서 한다(`prOpen`·`prCheckFailed` 재사용/추가, 만료 임박 새 상태 행 warning). 만료일은 `lib/date-format.ts`, 남은 기간은 `lib/relative-time.ts`.
  - 검증: [자동] 화면 컴포넌트에 MR/PR 상태 문구 직접 분기 0(grep), `date-format-consumers.test.ts` green.
- [x] 기존 프리미티브로 ① GitHub / GitLab 탭(`components/ui/tabs.tsx` — GitHub 탭은 현행 그대로, **GitHub App이 없는 설치는 탭 줄 없이 GitLab 단독이고 `/account`·설정의 GitHub 연결 카드·설치 링크를 그리지 않는다** — D4a, B의 App 구성 판정 헬퍼)·GitLab 탭의 PAT 입력과 상태 shell·`/account`의 GitLab 연결(**미연결이면 [Connect]** — 같은 PAT 입력 shell, 2026-10-12 결정)·설정·상태·PR/MR 표시(GitLab `!128`), 프로젝트 목록·Home(**Platform 행 — 두 호스트 모두**)·설정의 리포 호스트 맥락, `workflow-block`·`ci-card`의 GitLab CI 안내를 구현한다. 시안(§0)을 따른다. 문구는 **리포 호스트별 문장 분기**이고 호스트 이름 + 조사 보간이 없다.
  - 검증: [자동] DOM 테스트에서 GitLab 프로젝트 스코프 화면에 `GitHub`·`pull request`·`github.com` 0건(말모이 자체 리포 링크·로그인 공급자 이름 제외), 호스트가 글리프만이 아니라 텍스트/접근 이름으로 드러난다, 나란히 선 Disconnect의 접근 이름이 축을 든다, PAT 입력의 라벨·오류가 `aria-describedby`로 이어진다, 탭 전환이 GitHub 탭의 기존 상태(리포 검색어·선택)를 잃지 않는다. [수동] `/runtime-test`로 렌더·포커스·라이트/다크·**375 폭에서 긴 하위 그룹 주소**(리포 목록·Home 메타·Sync Dialog·설정 행).
- [x] GitLab 브랜드 글리프(단색 `currentColor` — D10)를 `components/signin/brand-icons.tsx`에 추가하고 `components/__tests__/gitlab-glyph.test.ts`를 새로 둔다. `GitPullRequest*` 일반 글리프는 유지한다.
  - 검증: [자동] gitlab-glyph(`fill="currentColor"`·색 리터럴 0)·`visual-system.test.ts` green.
- [x] 시안 대상 신규 UI는 `/design-sync`로 대조한다. 기존 화면의 소규모 수정은 해당 DOM·런타임 검증을 한다.
  - 검증: [수동] 시안 대상은 `/design-sync` 실측 리포트(computed style·접근성 트리 대조)에 불일치 0건. 그 외는 화면별 링크 목적지가 GitLab URL인 것을 `/runtime-test`로 확인.
- [x] 문서·사전을 실제 구현에 맞춘다 — 소유자가 둘이라 두 하위 항목으로 나눈다(루트 `.env.example`은 새 env가 없어 대상이 아니다 — D6).
  - **(E-ui)** en/ko/es 사전의 랜딩·SEO·공개 문서(`landing`·`seo`·`publicDocs` 중 `publicDocs.privacy` 제외 — 그 절은 E-sh) 포지셔닝 문구(D3 — 헤드라인 유지, 기능·포맷 절만), `/translate` 모드 ①. 호스트 문맥이 없는 † 키 8개는 문장 분기가 아니라 "GitHub or GitLab" 꼴 문구 개정이다(consumers.md §3.1).
    - 검증: [자동] 사전·`no-korean-ui`·`brand-spelling`·`dictionary-consistency` 테스트 green.
  - **(E-doc)** 가이드 `guide/{en,ko,es}/`(셀프 호스팅 제외)와 PRODUCT(§1·§2·§3·**§4.1 셀프 호스팅 "하지 않는 것"의 GitLab**)·README("…and GitLab aren't supported")·ARCHITECTURE(불변식 6·11)·DIRECTORY·**OPERATIONS(롤백 절차의 D6a 한 줄 — design §4)**.
    - 검증: [자동] 가이드 테스트 green. [수동] 지원 플랜·인증 만료·지원 배포형 설명과 구현 대조, PRODUCT §4.1·README에 GitLab 미지원 문구 0, OPERATIONS에 롤백 전 GitLab CI 중지/`PUSH_TOKEN` 회전 줄이 있다.
- [x] 초대 이메일 `lib/invitation-email/template.ts`의 "sends it back to GitHub"를 리포 호스트별 문장으로 분기한다.
  - 검증: [자동] `lib/invitation-email/__tests__/message.test.ts`에 GitHub·GitLab 프로젝트 초대 사례를 더해 각각 다른 리포 호스트 이름이 0건.
- [x] 셀프 호스팅 유지보수 계약(design §5)을 맞춘다 — GitLab env는 없다(D6). `GITHUB_APP_*` 다섯을 `optional` + **all-or-none 그룹 규칙**(D4, 반쪽 기동 거부 — 로그인 공급자 쌍 규칙과 같은 자리)과 App 없는 설치의 화면 갈래(D4a), `deploy/.env.example`, `credentials:self-hosted`의 `rotate-token`·`verify`·`oldTokenKey` 집계에 새 자격증명 열(`lib/credentials/conversion.ts`), 토큰 경로 nginx 마스킹, `guide/{en,ko,es}/self-hosting/{install,operate}.md`의 env("required either way" 수정)·키 회전·백업·**롤백 전 GitLab CI 중지/`PUSH_TOKEN` 회전 한 줄**(D6a), 운영자 개인정보 재료.
  - 검증: [자동] preflight 테스트(App 다섯 중 일부만 → red · 다섯 다 없음 → green(GitLab 전용) · 다섯 다 → green — 판정은 B의 App 구성 헬퍼), credentials 변환 테스트에 새 열, `pnpm test:credentials:postgres` green. [수동] SELF-HOSTING §3 기능 개발 체크리스트 1~8 통과 — 판정 재료는 E-sh 인계, `docs/SELF-HOSTING.md` 기록은 **지휘자**.
- [x] 인증 결정에 따른 GitLab 전송처·자격증명·수집 정보를 `/privacy` 영문·국문 본문(`messages/ko-privacy.tsx`·en `publicDocs.privacy` 절 — 이 두 곳은 E-sh 소유)에 반영하고 필요한 개정 이력·시행일을 갱신한다. 수집 목록 `lib/privacy/collected.ts` 등재는 B2가 이미 했다.
  - 검증: [자동] `lib/privacy/__tests__/`의 수집 목록·방침 게이트 테스트 green. [수동] 새 전송처·수집 목적·보존 설명과 구현 대조. GitLab 활성화 전에 반영한다.

## 6. 수락·배포 게이트 — 검증 경계

- [x] `/roundtrip`을 GitLab으로 확장한다 — `pnpm smoke:gitlab`(읽기 전용, `pnpm test` 밖), `roundtrip.md`의 GitLab 분기(MR 머지 방식 merge·squash·fast-forward를 **인자로** 받는다 — POSTMORTEM 2026-09-17, `Project.installationId` 전제 제거), 폐기용 GitLab 리포 목록 지정.
  - 검증: [수동] 폐기용 GitLab 리포로 `smoke:gitlab`이 연결·tree 조회를 통과하고, roundtrip이 머지 방식 인자 셋을 받는다.
- [ ] **(QA)** 폐기용 GitLab 리포의 실제 CI(D1 템플릿)에서 정상 적재·보류(200 `deferred`)·실패 보고·오래된 커밋 409·재실행, 그리고 각 머지 방식(merge·squash·fast-forward)에서 Publish MR 머지 뒤 push가 스킵되는지 확인한다(§4 첫 항목에서 옮김 — C의 서버 경로가 있어야 한다).
  - 검증: [수동] 시나리오별 CI 실행 링크·응답 코드를 `/merge` PR body 재료로 인계에 남긴다.
  - ⏳ 2026-10-13: CI 태그 `malmoi-i18n-push-gitlab-v1` 미발행이라 실제 파이프라인은 fail-closed — `/api/push` 경로는 `pnpm push:local`로 QA 통과(적재·deferred·409·failure 204). 실물 CI는 태그 발행(`/merge` 준비물) 뒤.
- [x] GitHub와 GitLab 테스트 리포에서 `/roundtrip`(적재 → 편집 → Publish → PR/MR 머지 → 재적재)을 실행한다. GitHub 연결 callback 왕복은 로컬이 아니라 preview(`https://dev.mal-moi.com`)에서 본다. GitLab은 PAT라 callback이 없어 로컬에서도 연결된다. 폐기용 리포에 어댑터 엣지 픽스처(빈 `{}` 중첩 JSON·chrome `placeholders: null`)를 둔다.
  - 검증: [수동] 두 리포 호스트 모두 재적재 뒤 DB 값 = 편집 값, 로컬 `git hash-object` = 원격 blob id, orphan 복원, 열린 PR/MR 개수 1, Last sent/Logs 갱신, 실패 주입 뒤 편집 보존.
- [ ] 셀프 호스팅 설치본에서 GitLab 프로젝트의 연결 → 적재 → Publish를 확인한다(spec 완료 조건 10).
  - 검증: [수동] 로컬 compose 설치본에서 preflight 통과, GitLab 왕복 성립(GitLab은 PAT라 로컬에서 된다. 로그인용 외부 OAuth가 없어 못 하면 "미실행"). 실행은 QA(읽기 전용)이고 SELF-HOSTING §7의 날짜·digest 기록은 **지휘자**가 쓴다.
  - ⏳ 2026-10-13: 미실행 — Docker 데몬·CI 태그 필요. 셀프 호스팅 코드 경로(preflight·credentials·가이드)는 E-sh 테스트·리뷰로만 확인.
- [ ] **(지휘자)** 전체 게이트를 돌리고 두 리포 호스트의 외부 실패를 주입한다 — 통합 뒤 지휘자 몫이다(배치 소유 없음).
  - 검증: [자동] `pnpm gate` green, 가짜 클라이언트로 실패 주입 계약 테스트 green. [수동] 실물 리포에서 권한 철회·토큰 만료 주입. spec 완료 조건 1–10마다 자동/수동 증거를 PR body에 연결한다.
  - ⏳ 2026-10-13: 무부하 `pnpm gate` ok(14374) · 실패 주입은 가짜 클라이언트 계약·PG 시나리오로 완료 · 실물 권한 철회·Reporter 강등은 미실행(주인 하나).
- [ ] 배포: dev DB는 `/push` 전에 `/db`로 넓힌다. 프로덕션은 별도 사용자 `/merge` 요청으로만 진행하고, `/merge` 1단계에서 `db:deploy`·`db:status:prod`로 prod를 넓힌 뒤 prod `has_schema_privilege` 네 칸 false(새 자격증명 테이블이면 GRANT 0건)를 확인한다. prod를 겨눈 리셋은 금지다. 활성화는 스위치가 없다(D6) — `/merge`가 곧 prod 활성화이고 셀프 호스팅은 그 태그로 업그레이드가 활성화다.
  - 검증: [수동] `db:status:prod`가 최신, 권한 검사 결과 기록, 구버전이 GitLab 프로젝트를 처리하는 창이 없고 기존 GitHub 프로젝트의 Sync·Publish가 정상. 롤백 절차(design §4 — 구버전 `/api/push`의 열린 MR 게이트 부재, D6a)가 OPERATIONS·셀프 호스팅 운영 가이드에 있다.

다음 단계는 §1(커밋 A)·§5 첫 항목(E0)·§4 첫 항목(D1)의 병렬 파동이다(orch.md "파일 겹침·실행 순서").

  - ⏳ 2026-10-13: dev DB 적용·권한 네 칸 false·GRANT 0 완료. prod는 `/merge` 1단계.