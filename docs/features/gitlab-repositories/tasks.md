# GitLab repositories — 재개 후 태스크

상태: **전부 미착수·구현 보류**. 문서 기록·검수는 아래 실행을 승인하지 않는다. 각 묶음은 향후 구현 커밋 경계이며 현재 구현 코드를 커밋하지 않는다.

검증 줄 표기: **[자동]** 명령 결과로 판정 · **[수동]** 스킬·절차로 사람이 판정(이 리포엔 e2e 프레임워크가 없다). 실물 증거(원격 SHA·MR 번호·CI 실행 링크·스크린샷)는 해당 배치의 `/merge` PR body에 남기고, 결론은 정본(ARCHITECTURE 등)으로 올린다 — 이 디렉터리는 기능이 끝나면 지워진다.

**배치 경계**: 커밋 A·B1·B2·C는 **같은 `/push` 배치**로 나간다. A만 먼저 dev에 나가면 GitLab 소비자 없는 경계(확장성 선반영)가 남는다. 커밋마다 `pnpm gate`를 green으로 통과시킨다 — 출력을 `| grep`·`| head`로 거르지 않는다(POSTMORTEM 2026-09-30).

## 0. 재개 결정·설계 확정 — 문서 경계

- [ ] 사용자가 spec §6의 미결 행을 닫는다 — 구현 시점·도입 팀·검증 리포, 포지셔닝·정본 문구, PR/MR 호칭, 지원 배포형, Free 플랜 지원, CI 배포 형태, 활성화 방식, no-changes 종료 상태.
  - 검증: [수동] spec §6의 모든 행에 사용자 결정과 근거가 적혀 "미결"이 0행이다.
- [ ] 인증 방식·쓰기 신원·권한 증명·만료/회전·연결 해제의 영향을 확정한다. 개인 OAuth 쓰기를 허용하려면 기존 원칙과의 차이를 먼저 결정한다.
  - 검증: [수동] design §5에 로그인/연결/쓰기 자격증명 표, 신규 env 목록(없으면 "없음"), 철회·퇴사 사례별 동작이 적혀 "미확정" 표기가 0이다.
- [ ] GitLab 실제 테스트 리포에서 API의 base 재생성·MR 재사용·no-changes 정리·권한 부족·응답 유실을 검증하고 공통 인터페이스를 확정한다.
  - 검증: [수동] 시나리오별로 원격 commit의 parent SHA = 캡처한 base SHA, 변경 외 파일 blob id 불변, 열린 MR 개수 = 1(no-changes 뒤 0), 두 번째 no-changes 실행의 외부 쓰기 호출 0회, 실패 주입 뒤 sync 브랜치·MR 상태가 기록된다. 지원 못 하는 계약이 있으면 spec을 다시 확정하기 전까지 다음 단계로 가지 않는다.
- [ ] `installationId`·`repositoryId` 소비자 전수 표를 만든다(2026-10-08 기준 비테스트 52개 파일). 메모 키(`open-pr-memo`·`probe-memo`)에 리포 호스트를 넣을지 판정한다. design §2 UI 표면 표도 `messages/`·`components/`·`guide/` 전수 grep으로 갱신한다.
  - 검증: [수동] `grep -rl installationId app lib components --exclude-dir=__tests__`의 파일 수와 표의 행 수가 같고, 행마다 "경계 이관/GitHub 전용 유지/무관" 중 하나가 적혀 있다.
- [ ] UI 변경 범위를 확인한다. 신규 표면 또는 큰 변경이면 design-brief를 먼저 작성하고, **UI 구현 작업의 첫 태스크로 시안 확보**(Claude Code는 DesignSync, Codex는 로컬 핸드오프)를 배치한다.
  - 검증: [수동] 브리프·시안 링크·대상 화면 목록이 feature 문서에 있고, 시안 대상 화면의 구현 태스크가 시안 확보 태스크 뒤에 놓여 있다.

## 1. 공통 판정·계약 — 커밋 A

선행 조건: §0의 GitLab 실물 검증 완료(경계를 두 번 짜지 않도록).

- [ ] identity·연결/readiness·지문·원격 상태 정규화·URL·CI 입력의 순수 함수 테스트를 먼저 작성한다.
  - 검증: [자동] red 관측 뒤 구현하고 `pnpm gate` green. 다른 리포 호스트의 같은 id·하위 그룹·조회 실패·첫 적재 미완·기존 GitHub 지문 바이트 불변 사례 포함.
- [ ] 공용 가짜 클라이언트(`lib/pull/__tests__/fake-client.ts`의 `createFakeGitClient`)와 `vi.mock("@/lib/github")` 소비자(약 17개 파일)를 새 경계로 이관한다.
  - 검증: [자동] 이관 전후 같은 테스트 수가 green이고 `pnpm gate` green.
- [ ] 실제 GitHub 소비자를 새 경계로 함께 이관하고 GitHub 전용 요청 조립은 리포 호스트 구현에 남긴다.
  - 검증: [자동] 기존 호출 생략·고정 base·단일 PR·전달 확인 계약 테스트 통과, `pnpm gate` green(이관 경로가 `test:projects:postgres` 트리거라 격리 PG 스위트가 붙는다).
- [ ] 새 구현 경로를 `scripts/gate-plan.ts` 트리거와 해당 `vitest.*.config.ts` 수집 경로에 등록한다.
  - 검증: [자동] 새 경로 파일 하나만 바꾼 diff에서 gate-plan 테스트가 필요한 PG 스위트를 선택한다.

## 2. additive 스키마·연결 저장 — 커밋 B1·B2

### B1 — `/db` 산출물만

- [ ] 확정 설계에 따라 리포 호스트/주소/자격증명 migration을 작성한다. 번역 테이블을 복제하거나 기존 필드를 즉시 제거하지 않는다. 커밋은 `schema.prisma`와 migration 파일만이다(`/db` 6단계).
  - 검증: [수동] `/db` 절차로 SQL 검토, dev에서 `has_schema_privilege`(anon·authenticated × USAGE·CREATE) 네 칸 false, 새 자격증명 테이블이면 `role_table_grants` 0건. [자동] 기존 GitHub 행 보존과 혼합 리포 호스트 identity를 격리 PG에서 확인.

### B2 — 배선

- [ ] 연결 저장·재연결·쓰기 권한 검증·승인 지문·전달 문맥 지문·readiness에 리포 호스트 identity를 연결한다. 새 연결·재연결 Action을 `app/__tests__/locked-access.test.ts` 집계에 등록한다.
  - 검증: [자동] 연결 변경 중 적재/Publish, 제거된 멤버, 보관 프로젝트, 다른 리포 id, 같은 숫자 id의 다른 리포 호스트에 대한 PG 통합 테스트 통과. locked-access 집계 수가 새 Action만큼 늘어 green.
- [ ] 호출자의 리포 권한 검사를 경로별로 보존한다. 수동 Sync와 연결된 프로젝트의 base branch 목록·저장(`updateRepositorySettings`)은 읽기 권한, 생성·재연결·소스 추가·push 토큰 회전은 쓰기 권한을 요구한다.
  - 검증: [자동] 두 리포 호스트 모두 읽기 전용 OWNER의 Sync·base branch 목록·저장은 성공하고, 쓰기 권한이 필요한 네 경로는 거부된다. 서버 쓰기 자격증명의 존재만으로 호출자의 권한을 인정하지 않는다.
- [ ] `lib/github-connect/__tests__/credential-separation.test.ts`에 GitLab 연결/쓰기 루트와 GitLab 쓰기 호출 패턴을 등록하고 진입점별 메타 테스트를 붙인다.
  - 검증: [자동] 연결 경로에 GitLab 쓰기 호출을 일부러 넣은 픽스처에서 테스트가 red, 원복 시 green.

## 3. GitLab I/O·Sync·Publish — 커밋 C

- [ ] GitLab 가짜 클라이언트(호출 기록·실패 주입·페이지네이션)를 먼저 만든다.
  - 검증: [자동] 가짜 클라이언트 자체 테스트 green. 아래 계약 테스트가 이것만으로 쓰인다.
- [ ] 완전한 tree/blob 스냅샷·크기 예산·페이지네이션·불변 id 검증을 구현한다.
  - 검증: [자동] 중간 페이지 실패·잘린 목록·크기 초과·이름 재사용을 성공/빈 목록으로 처리하지 않는다. SHA-256 리포·LFS 포인터 파일은 거부, 경로 인코딩(공백·유니코드·`%`·하위 그룹)은 왕복 동일, 429는 일시 장애로 판정.
- [ ] commit actions 조립 테스트를 먼저 작성한 뒤 GitLab 쓰기와 MR 생명주기를 연결한다.
  - 검증: [자동] 고정 base·파일 mode·중복 MR 방지·target 변경·no-changes(닫기 → 정리 순서, 두 번째 실행 외부 쓰기 0회)·결과 미확인·Publish 도중 쓰기 토큰 만료 계약 테스트 통과. 동명 fork MR과 자체 MR이 공존하거나 fork MR만 있는 경우를 넣어 source/target project id가 다른 MR을 재사용·닫기·자동 적재 보호 대상으로 선택하지 않는지 확인한다. 보관된 GitLab 프로젝트의 쓰기 403은 재연결 필요로 분류되고 재시도하지 않는다.
- [ ] 변경 없음 경로의 쓰기 호출 0회를 단언한다.
  - 검증: [자동] 1층(DB 미전달 0 → 원격 호출 0)·2층(blob hash 전부 동일 → commit API 호출 0)을 가짜 클라이언트 호출 기록으로 단언.
- [ ] 첫 적재·소스 관리·수동 Sync·야간·자동 적재 보호를 기존 코어에 연결한다. 새 `lib/` 경로를 gate-plan 트리거에 등록한다.
  - 검증: [자동] `pnpm gate` green(관련 격리 PG 스위트 포함). 열린 MR/조회 실패 보류, Publish/no-changes 경합, 미전달 토큰 보존, 기본 브랜치 개명 시 `base-branch-missing`과 늦게 도착한 판정 무시 포함.

## 4. CI·MCP — 커밋 D

- [ ] spec §6에서 고른 배포 형태로 GitLab CI 경로를 만든다. 불변 태그/SHA 고정·별도 릴리스 축·protected+masked `PUSH_TOKEN`·base 조건·루프 마커 가드·열린 MR 경고·`/api/push/failure` 보고(`lastCommitSha` 미전진)를 연결한다. `docs/ACTIONS.md`에 GitLab 절을 쓴다.
  - 검증: [자동] 페이로드 생산자·CI 입력 변환 테스트 green. [수동] 폐기용 GitLab 리포의 실제 CI에서 정상 적재·보류(200 `deferred`)·실패 보고·오래된 커밋 409·재실행, 그리고 merge commit·squash·fast-forward·사용자 정의 템플릿 각각에서 Publish MR 머지 뒤 push가 스킵되는지 확인(POSTMORTEM 2026-09-17).
- [ ] MCP 저장소 목록·프로젝트 생성·연결 및 Sync/Publish를 동일 코어에 배선한다. 기존 필드명(`lastPublishPullRequest`·`newFromGitHub`)의 호환 정책을 적용하고 `get_workflow`가 리포 호스트에 맞는 경로를 낸다.
  - 검증: [자동] 리포 호스트 지정/기존 클라이언트 호환·사용자/프로젝트 인가·credential 비노출·실패 응답 테스트, GitLab 프로젝트 응답에 `GitHub`·`pull request`·`github.com` 0건.

## 5. UI·번역·가이드 — 커밋 E

- [ ] DESIGN §10.1·§2.4·§6과 `lib/i18n/__tests__/helpers/banned-terms.ts`를 spec §6의 PR/MR 호칭 결정에 맞게 **사전 작업보다 먼저** 고친다. design §2 연결 상태 톤 표를 채운다.
  - 검증: [자동] banned-terms 테스트 green(머지 리퀘스트 표기 변형·GitLab 문맥의 "GitHub App" 오용 행 포함). [수동] 톤 표에 "미결" 0행.
- [ ] 기존 프리미티브로 연결/설정/상태/PR·MR 표시와 `workflow-block`·`ci-card`의 GitLab CI 안내를 구현한다. 0단계에서 시안 대상으로 확정된 화면은 시안을 먼저 확보한다(Claude Code는 DesignSync, Codex는 로컬 핸드오프).
  - 검증: [자동] DOM 테스트에서 GitLab 프로젝트 화면에 `GitHub`·`pull request`·`github.com` 0건(말모이 자체 리포 링크 제외). [수동] `/runtime-test`로 권한별 연결·만료·철회·일시 장애·재시도·라이트/다크를 로컬에서 확인.
- [ ] GitLab 브랜드 글리프를 `components/signin/brand-icons.tsx`에 추가하고 `components/__tests__/github-glyph.test.ts` 집계를 확장한다. `GitPullRequest*` 일반 글리프는 유지한다.
  - 검증: [자동] glyph 테스트 green, `visual-system.test.ts` green(색은 시안 결정을 따른다).
- [ ] 시안 대상 신규 UI는 `/design-sync`로 대조한다. 기존 화면의 소규모 수정은 해당 DOM·런타임 검증을 한다.
  - 검증: [수동] 시안 대상은 `/design-sync` 실측 리포트(computed style·접근성 트리 대조)에 불일치 0건. 그 외는 화면별 링크 목적지가 GitLab URL인 것을 `/runtime-test`로 확인.
- [ ] en/ko/es 사전·가이드(포지셔닝 결정 범위의 README·랜딩·SEO·공개 문서 포함)와 PRODUCT/ARCHITECTURE/DIRECTORY/OPERATIONS 및 필요한 `.env.example`을 실제 구현에 맞춘다.
  - 검증: [자동] 사전·가이드·`no-korean-ui`·`brand-spelling` 테스트 green. [수동] 지원 플랜·인증 만료·지원 배포형 설명과 구현 대조.
- [ ] 초대 이메일의 GitHub 고정 소개 문구를 리포 호스트 중립 문구로 바꾼다(self-hosting과 겹치면 spec §5의 낱말 원칙).
  - 검증: [자동] 메일 템플릿 테스트에서 GitHub·GitLab 프로젝트의 초대 모두 다른 리포 호스트 이름이 0건.
- [ ] 인증 결정에 따른 GitLab 전송처·자격증명·수집 정보를 `/privacy` 영문·국문 본문과 수집 목록에 반영하고 필요한 개정 이력·시행일을 갱신한다.
  - 검증: [자동] `lib/privacy/__tests__/`의 수집 목록·방침 게이트 테스트 green. [수동] 새 전송처·수집 목적·보존 설명과 구현 대조. GitLab 활성화 전에 반영한다.

## 6. 수락·배포 게이트 — 검증 경계

- [ ] `/roundtrip`을 GitLab으로 확장한다 — `pnpm smoke:gitlab`(읽기 전용, `pnpm test` 밖), `roundtrip.md`의 GitLab 분기(`gh pr merge` 대신 MR 머지, `installationId` 전제 제거), 폐기용 GitLab 리포 지정.
  - 검증: [수동] 폐기용 GitLab 리포로 `smoke:gitlab`이 연결·tree 조회를 통과한다.
- [ ] GitHub와 GitLab 테스트 리포에서 `/roundtrip`(적재 → 편집 → Publish → PR/MR 머지 → 재적재)을 실행한다. 연결 callback 왕복은 로컬이 아니라 preview(`https://dev.mal-moi.com`)에서 본다.
  - 검증: [수동] 두 리포 호스트 모두 재적재 뒤 DB 값 = 편집 값, 로컬 `git hash-object` = 원격 blob id, orphan 복원, 열린 PR/MR 개수 1, Last sent/Logs 갱신, 실패 주입 뒤 편집 보존.
- [ ] 전체 게이트를 돌리고 두 리포 호스트의 외부 실패를 주입한다.
  - 검증: [자동] `pnpm gate` green, 가짜 클라이언트로 실패 주입 계약 테스트 green. [수동] 실물 리포에서 권한 철회·토큰 만료 주입. spec 완료 조건 1–9마다 자동/수동 증거를 PR body에 연결한다.
- [ ] 배포: dev DB는 `/push` 전에 `/db`로 넓힌다. 프로덕션은 별도 사용자 `/merge` 요청으로만 진행하고, `/merge` 1단계에서 `db:deploy`·`db:status:prod`로 prod를 넓힌 뒤 prod `has_schema_privilege` 네 칸 false(새 자격증명 테이블이면 GRANT 0건)를 확인한다. prod를 겨눈 리셋은 금지다. 그 뒤 spec §6에서 고른 방식으로 GitLab 생성을 활성화한다.
  - 검증: [수동] `db:status:prod`가 최신, 권한 검사 결과 기록, 구버전이 GitLab 프로젝트를 처리하는 창이 없고 기존 GitHub 프로젝트의 Sync·Publish가 정상. 활성화 방식이 env 스위치면 `.env.example`·OPERATIONS·롤백 절차가 같은 배치에 있다.

다음 단계는 **구현 시점과 spec §6의 결정 재확인**이다. 지금 `/tdd interface`로 진행하지 않는다.
