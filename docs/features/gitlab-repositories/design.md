# GitLab repositories — 기술 설계 초안

상태: **재개됨 · 확정 설계**(spec §6 미결 0 — 결정 ID는 [orch.md](orch.md) D1~D13) · 화면은 [design-brief.md](design-brief.md) · 소비자 전수·UI 키 표는 [consumers.md](consumers.md). 이 문서는 "저장소 제공자" 대신 **리포 호스트**라고 쓴다(spec §5). 갱신 2026-10-12(W0 — GitLab.com 실물 측정, 공통 경계 서명 확정).

## 1. 현재 코드와 분리 경계

| 현재 위치 | 재사용할 계약 | 분리·수정할 결합 |
|---|---|---|
| `lib/adapters/types.ts`·포맷별 어댑터 | 경로·내용 입력, 탐지·파싱·결정적 write | 리포 호스트 조건을 추가하지 않는다 |
| `lib/push/{payload,plan,apply}.ts` | 페이로드 생산·검증·strict 적재 | 리포 호스트 identity를 CI 입력과 서버 설정 사이에서 검증 |
| `app/api/push/route.ts` | 프로젝트 토큰 인가·보류 응답 | 열린 PR 판정이 `installationId`를 읽는다 |
| `lib/import/{run,apply-plan}.ts` | 실행권·설정 revision·일괄 적재 | `installationId` 및 GitHub reader 의존 |
| `lib/onboarding/readiness.ts` | `setup` → `awaiting_first_sync` → `ready` 세 상태 | 설치 id 존재를 공통 연결 증명으로 대체 |
| `lib/pull/{plan,render,load}.ts` | 렌더·변경 판정·전달 확인 | 리포 호스트별 프로젝트 조회 배선 점검 |
| `lib/pull/client.ts` (`GitClient`) | 경계가 실제로 사는 인터페이스 | `createTree/createCommit/updateRefForce` — GitLab이 흉내 내지 않는다(아래 Publish) |
| `lib/pull/{run,payload,targets}.ts` | Publish 순서·보호 계약 | Git Data API 단계와 `owner:branch` PR 조회 |
| `lib/sync/execution.ts` · `lib/github.ts`의 transport 주입 | Publish 실행 수명(240초 예산·`execution.fetch()`·비GET은 쓰기로 셈) | GitLab transport도 같은 `execution.fetch()`를 지난다(아래 Publish) |
| `lib/github.ts`의 `openRepoReader`·`listBranches`·`probeRepo` | 읽기 경로(불변식 11의 첫 층 — 토큰을 리포 id 하나로 좁힌다) | `installationId`·`repositoryId` 인자 |
| `lib/publish/` (`publishFingerprint`) | Publish 미리보기·MCP reconfirm 지문 | 지문 입력(아래 지문 표) |
| `lib/sync/plan.ts` (`SYNC_ERROR_CODES`) | 저장되는 실패 코드(`SyncRun.errorCode`·`ProjectEvent` 페이로드 → Logs·화면 분기) | **코드 문자열은 그대로, 의미를 일반화한다**(아래 §3 "0단계 판정") |
| `lib/github-wait.ts` (`GITHUB_WAIT_MS` 8초) · 테스트 공유 사본 `lib/__tests__/fast-github-wait.ts` | 렌더 중 원격 조회의 공유 마감 | GitLab 원격 상태·probe·열린 MR 게이트도 같은 마감을 쓴다. 손 사본을 만들지 않는다(POSTMORTEM 2026-10-02). **이름은 유지한다**(§3 "0단계 판정") |
| `lib/nightly/run.ts` | Publish/적재/스킵 분기 | 대상 선정이 `installationId` 전제 |
| `lib/projects/{open-pr,remote,list}.ts` · `lib/inbox/load.ts` | 열린 PR·원격 상태·목록·Inbox | `installationId` 전제 |
| `lib/projects/open-pr-memo.ts` · `lib/github-connect/probe-memo.ts` | 요청 내 메모 | 키에 **리포 호스트·GitLab 연결 참조를 더한다**(§3 "0단계 판정") |
| `lib/github-connect/health.ts` (`planConnectionHealth`) | 연결 상태 판정 | GitHub 설치·인가 전제 |
| `lib/mcp/tools/project.ts` · `lib/mcp/tools/onboarding.ts` | MCP 도구 | `onboarding.ts:50`이 `.github/workflows/malmoi-i18n.yml`을 하드코드한다. `lib/mcp/confirm.ts`는 **온보딩 샘플 확인값**(HMAC, `lib/onboarding/sample-confirmation.ts`)이지 승인 지문이 아니다 — context에 `installationId: string` 필수 |
| `lib/onboarding/workflow.ts` | 생성 워크플로 YAML(루프 가드 `if:`) | GitLab 템플릿 생성기 짝 |
| `lib/deployment/{mode,preflight}.ts` | 배포 모드·기동 전 env 분류 | `GITHUB_APP_*` 다섯을 self-hosted `required`에서 **all-or-none 그룹 선택**으로(D4 — 반쪽은 기동 거부). GitLab 쪽 새 env는 없다(§5) |
| `lib/credentials/conversion.ts` | 토큰 봉투 회전·검증 CLI(`credentials:{dev,prod,self-hosted}`) | 새 자격증명 열 등록(빠지면 회전 뒤 옛 키 폐기 순간 못 연다) |
| `scripts/smoke-github.ts` | 실 API 읽기 스모크 | `smoke:gitlab` 짝 |
| `lib/github.ts`·`lib/github-connect/` | 기존 GitHub 동작 | GitHub 전용 구현으로 유지 |
| `prisma/schema.prisma` | Project/Surface/Key/Translation/Member/Event | 리포 호스트·주소·쓰기 자격증명 |

이 표는 핵심만 담는다. 테스트 밖에서 `installationId|repositoryId`를 참조하는 파일 **56개**(`app` 7 · `lib` 48 · `scripts` 1)의 전수 표는 [consumers.md](consumers.md) §1이다 — 경계 이관 43 · GitHub 전용 유지 9 · 무관 4. 필드명 없이 연결 판정을 부르는 간접 소비자 3(번역 페이지 이관 1 + 주석 2)은 §1.1.

공통 번역 코어 하나와 실제 소비자가 있는 리포 호스트 구현 둘을 둔다. 파일 포맷 어댑터와 리포 호스트 구현은 별개 축이다. GitLab 구현을 하는 배치에서 GitHub 소비자도 같은 경계로 옮기며, 미리 추상화만 추가하지 않는다.

## 2. 영향 받는 흐름

### GitLab 연결 (PAT)

GitHub 연결(App 설치 + 사용자 연결 → installation 토큰)은 **바꾸지 않는다**. GitLab만 아래 흐름이다.

1. ① 모달의 GitLab 탭에서 개발자가 **레거시 PAT**(스코프 `api` 하나, D13)를 붙여 넣는다. Server Action이 받는다 — 외부 진입점이 아니라 내부 쓰기다(OAuth callback·Route Handler가 생기지 않는다).
2. 서버가 그 PAT로 `GET /personal_access_tokens/self`를 읽어 **검증**한다(아래 실측). 갈래: 401 → `invalid`(무효·만료·철회가 같은 본문이라 가르지 않는다) · `granular: true` 또는 `granular_scopes` 있음 → `fine-grained`(거부 — spec §5) · `scopes`에 `api` 없음 → `scope-missing`(빠진 스코프 이름 `api`) · `active: false`/`revoked: true` → `invalid` · 네트워크·5xx·429 → `unavailable`(일시 장애를 "무효"로 접지 않는다). 통과하면 `GET /user`로 사용자명을 읽는다.
3. 통과하면 PAT를 **계정 단위로 봉해 보관**한다(`/account`의 GitLab 연결 — 다음 ①에서 다시 붙여 넣지 않게 하는 목록용). 함께 저장하는 메타는 GitLab 사용자 id·사용자명·`expires_at`·`scopes` 넷이다 — `/self` 응답의 `last_used_ips`(IP 목록)는 **저장하지 않는다**. 원문은 응답·로그·이벤트에 싣지 않는다.
4. ①의 리포 목록은 `GET /projects?membership=true&min_access_level=40&archived=false`(Maintainer 이상, 페이지 끝까지)다 — `permissions.group_access`가 상속을 반영하는지 문서가 없어 필터 쪽을 쓴다. Free 플랜 리포도 같다. 선택한 리포는 `GET /projects/<id>`로 `repository_object_format == "sha1"`·`archived == false`를 확인하고(SHA-256·보관은 `accessError`), 생성·재연결 직전 호출자 권한은 `GET /projects/<id>/members/all/<user id>`의 `access_level ≥ 40`으로 다시 본다(§3 `checkRepoAccess`). 이후 모든 호출은 숫자 id로만 주소한다.
5. 프로젝트 생성(또는 재연결) 시 프로젝트는 **연결자의 계정 GitLab 연결을 참조**한다(2026-10-12 사용자 결정 — 사본을 두지 않는다). 이후 Sync·Publish·야간은 **그 프로젝트가 참조하는 연결**의 PAT로 쓴다(호출자의 연결이 아니다). 쓰기 작성자는 토큰 주인이다(spec §3). PAT는 어차피 개인 명의라 사본이 주는 독립성이 없고, 계정에서 [Replace token] 한 번이면 그 연결을 참조하는 프로젝트가 전부 복구된다(시안 G8).
6. 만료 임박(14일, D11)·만료·철회·스코프 부족·주인의 권한 상실은 연결 상태로 보이고(아래 톤 표·사례 표), 복구는 둘이다: 토큰 주인이 계정에서 **토큰 교체**(참조하는 프로젝트 전부 복구) · 다른 OWNER가 프로젝트 설정에서 **재연결**(자기 계정 연결로 참조를 바꿈 — 명의가 바뀐다는 문장을 먼저 보인다, 시안 G6c).
7. **연결자가 떠나면 끊긴다**(2026-10-12 결정): 참조 주인이 그 프로젝트의 `ProjectMember`에서 빠지거나 계정을 지우거나 GitLab 연결을 해제하면 참조가 비고 프로젝트는 `Disconnected`다. 남은 OWNER가 재연결한다. 떠난 사람의 토큰으로 계속 쓰지 않는다.

**실측**(2026-10-12, GitLab.com · 폐기용 private 프로젝트 `87515176` · 레거시 PAT `api`+`read_repository`+`write_repository` · 원문은 W0 워크트리 `.scratch/gitlab-measure/`):

| 확인 | 결과 | 근거 |
|---|---|---|
| 최소 스코프 | **`api` 하나**. `api` 토큰으로 commit·MR·브랜치 삭제·tree·blob·GraphQL 전부 200/201. `api` 없는 토큰의 실패는 스코프 낮은 두 번째 토큰을 만들 수 없어 재지 못했다 | **문서 근거**: [scope 표](https://docs.gitlab.com/security/tokens/access_token_scopes/) — `write_repository`는 Git-over-HTTP 전용("does not support API authentication"), `read_repository`는 files API GET/HEAD만, 커밋·MR·브랜치 삭제는 `api`, tree·MR 목록은 `read_api` 이상. 지휘자 관측(토큰 생성 화면의 `write_repository` 설명) |
| 토큰 메타 | `GET /personal_access_tokens/self` → 200, 필드 `id`·`name`·`description`·`scopes`·`expires_at`(날짜, 그날 자정 UTC 만료)·`user_id`·`active`·`revoked`·`created_at`·`last_used_at`·`last_used_ips`·`granular` | 실측. 스코프 무관하게 동작(문서는 self-revoke 절만 명시, 소스 확인) |
| 사용자 | `GET /user` → 200 `id`·`username`·`state` | 실측 |
| 무효 토큰 | 401 `{"message":"401 Unauthorized"}` + 헤더 `ratelimit-name: throttle_unauthenticated_api` | 실측(일부러 틀린 값) |
| 만료·철회 토큰 | 401, 본문은 무효와 같다 — 셋을 가르지 않는다 | **문서 근거**([REST 인증](https://docs.gitlab.com/api/rest/troubleshooting/) "doesn't exist, has expired, or was revoked") |
| 스코프 부족 | 403 `{"error":"insufficient_scope",…}` | **문서 근거**(sudo 예시 + 소스 `api_guard.rb`) — 연결 뒤엔 `/self`의 `scopes`로 먼저 막는다 |
| 프로젝트 접근 상실·없는 프로젝트 | 404 `{"message":"404 Project Not Found"}`(무인증 private 조회로 실측) | 실측. ⚠️ GitLab도 권한 없음을 404로 숨긴다 — "없음"으로 단정하지 않는다(GitHub과 같은 함정) |
| 토큰 생성 페이지 프리필 | `https://gitlab.com/-/user_settings/personal_access_tokens?name=<이름>&scopes=api` → `/legacy/new`로 리다이렉트되며 이름·스코프가 채워진다. 만료일 파라미터는 없다 | 지휘자 실측(2026-10-12) + [문서](https://docs.gitlab.com/user/profile/personal_access_tokens/#prefill-personal-access-token-name-and-scopes)(`name`·`description`·`scopes` 쉼표 구분) |
| 만료 기본·상한 | 생성 화면 기본 30일, 상한 365일(GitLab.com 관리자 설정 — 지휘자 관측 2026-10-12). 만료 알림 메일 7일 전(17.6+ 60·30·7일) | 지휘자 관측 + [문서](https://docs.gitlab.com/user/profile/personal_access_tokens/#access-token-expiration) |
| 리포 메타 | `GET /projects/:id` → `id`·`path_with_namespace`·`default_branch`·`archived`·`repository_object_format`(`sha1`)·`permissions.project_access.access_level`(50)·`merge_method`·`squash_option`·`merge_commit_template`·`squash_commit_template` | 실측. ⚠️ 응답에 `runners_token`(러너 등록 토큰)이 실린다 — **응답을 통째로 로그·저장하지 않는다**(W0가 실측 중 터미널에 한 번 노출해 즉시 재발급했다) |
| 레이트 리밋 | 인증 2000/분(`ratelimit-limit`·`ratelimit-remaining`·`ratelimit-reset` 헤더), 무인증 500/분. 429는 `Retry-After` | 실측 헤더 + 문서 |

**사례별 동작**(연결 뒤):

| 사례 | GitLab 응답 | 말모이 판정 | 화면 | 복구 |
|---|---|---|---|---|
| 토큰 만료 | 401(문서 근거) | `Disconnected`(사유 만료 — 저장한 `expires_at`가 지났으면 호출 전에 안다) | 설정·Home `STATE` 만료 · `/account` 만료 | 주인이 [Replace token] |
| 만료 임박(≤14일) | — (저장 메타로 판정, 호출 0) | 연결 정상 + warning | `STATE.expiresSoon` | 같음 |
| 토큰 철회 | 401(문서 근거) | `Disconnected`(무효) | 재연결 필요 | 주인 교체 · 다른 OWNER 재연결 |
| 스코프 부족(`api` 제거된 토큰은 생성 불가 — 교체 시 다른 토큰) | `/self` `scopes` 검사로 저장 전 거부 · 쓰기 중이면 403 `insufficient_scope`(문서 근거) | 저장 거부 / `Disconnected` | ① 입력 아래 danger / 재연결 필요 | 다시 붙여 넣기 |
| 주인의 리포 권한 상실(추방 · Reporter 이하 강등) | 404(접근 상실 — 실측 형태) 또는 403 push 거부(문서 근거) | `Disconnected`(재연결 필요) — 일시 장애로 접지 않는다 | 재연결 필요 | 다른 OWNER 재연결 |
| 주인이 Developer로 강등 | 보호되지 않은 sync 브랜치 push·MR 생성은 계속 된다(문서 근거) | 연결 정상 — Maintainer 요구는 생성·재연결·소스 추가·push 토큰 회전 시점 검사다(spec §4-1) | 변화 없음 | — |
| 주인이 말모이 프로젝트를 떠남 | — (말모이 내부) | 같은 tx에서 참조를 비움 → `Disconnected` | 재연결 필요 | 남은 OWNER 재연결 |
| 주인이 GitLab 계정 삭제·차단 | 401(문서 근거) | `Disconnected` | 재연결 필요 | 다른 OWNER 재연결 |
| 보관된 GitLab 프로젝트 | `archived: true`(조회) · 쓰기 403(문서 근거 — "read-only") | 재연결 필요(재시도 루프 금지) | `accessError`/재연결 필요 | GitLab에서 보관 해제 |
| 보호 브랜치 push 거부 | 403 `You are not allowed to push into this branch`(실측) | Publish 실패, 재시도 없음 — 연결은 정상 | Publish 실패(§2.4 기존 danger) | GitLab 보호 규칙에서 `malmoi-i18n/sync-*` 허용 |
| 일시 장애·429 | 5xx·429 | `unavailable`(Couldn't check) | 재시도 | 자동 |

**GitLab 봇 토큰을 쓰지 않는 이유**(2026-10-12 검토 · 사용자 결정): 연결자 PAT로 `POST /projects/:id/access_tokens`를 불러 프로젝트 봇 토큰을 발급하면 봇 명의 쓰기·리포 한정·자가 회전(`/access_tokens/self/rotate`)이 다 된다(공식 문서 확인). 그러나 GitLab.com에서 프로젝트 액세스 토큰은 **Premium 이상**이라 Free 리포가 막히고, 두 경로를 두면 복잡도가 배가 된다 — 모든 플랜에서 연결자 PAT 하나로 간다.

### 적재와 Sync

서버 설정으로 리포 호스트를 결정 → 불변 repository id로 연결·호출 경로별 권한 검증 → 특정 commit의 완전한 파일 스냅샷 → 기존 탐지·read → 기존 보호 판정과 strict 적재. 파일 다운로드는 DB 트랜잭션 밖, 최종 인가·설정·실행권 재검증은 Project → 정렬된 Surface 잠금 안에서 한다.

호출자의 리포 권한과 서버의 리포 쓰기 자격증명은 구분한다. 생성·재연결·소스 추가·push 토큰 회전은 호출자의 리포 쓰기 권한을 확인한다. **수동 Sync와 연결된 프로젝트의 base branch 목록·저장(`updateRepositorySettings`)은 읽기 권한만 가진 OWNER도 허용**한다(PRODUCT §3·ARCHITECTURE §6.4, #123 회귀). 이 구분을 두 리포 호스트에 동일하게 적용하고, CI·야간 실행에 대화형 사용자 권한 검사를 추가하지 않는다.

CI는 현재 `lib/push/payload.ts` 생산자를 재사용한다. `/api/push`의 프로젝트 토큰이 대상을 결정하며 요청의 리포 호스트·리포명은 라우팅 권한이 아니다. 기존 GitHub 페이로드와의 호환 및 namespace 하위 그룹 입력을 검증한다. GitLab CI 배포 형태는 **불변 태그 clone + SHA 대조**다(D5). 위치:

- **원본**: 말모이 리포의 `.gitlab/malmoi-i18n-push/push.sh` — `.github/actions/malmoi-i18n-push/action.yml`의 짝(루프 가드 둘째 겹 · 버전 읽기 · `pnpm install --frozen-lockfile` · 생산자 실행 · 보류 사유별 경고 · 실패 시 `/api/push/failure`). GitHub 리포 안의 `.gitlab/`은 GitHub에서 아무것도 하지 않는다.
- **생성기**: `lib/onboarding/gitlab-ci.ts` — `lib/onboarding/workflow.ts`의 짝. 대상 리포에 붙이는 `.gitlab-ci.yml` job을 만든다(`docs/ACTIONS.md` GitLab 절이 정본 예시, 같은 대조 테스트).
- **릴리스 축**: 태그 `malmoi-i18n-push-gitlab-vN`(앱 `v<x.y.z>`·GitHub action `malmoi-i18n-push-vN`과 별개). 생성 job은 그 태그의 40자 commit SHA를 함께 박고 clone 뒤 `git rev-parse HEAD`와 대조한다 — 태그를 옮겨도 대상 리포 러너는 박힌 SHA 밖의 코드를 돌리지 않는다.

생성 job 본문 요건(D1 배치가 YAML을 만든다 — design-brief G7):

1. `rules`: `$CI_PIPELINE_SOURCE == "push"` · `$CI_COMMIT_BRANCH == "<설정된 base>"` · `$CI_COMMIT_MESSAGE !~ /\[skip-malmoi-i18n\]/`(루프 가드 첫 겹). 둘째 겹은 `push.sh` 안.
2. 이미지: Node 24 공식 이미지를 버전 태그 + digest로 고정.
3. `script`: `git clone --depth 1 --branch malmoi-i18n-push-gitlab-vN https://github.com/SinhyeokKang/malmoi.git .malmoi` → SHA 대조(불일치면 실패) → `.malmoi/.gitlab/malmoi-i18n-push/push.sh`.
4. 변수: `PUSH_TOKEN`은 **protected·masked** CI/CD 변수(보호 브랜치 파이프라인에서만 노출) · 프로젝트·표면·경로 템플릿·어댑터·기준 언어는 job `variables` · 셀프 호스팅 설치본이 만든 job은 **항상 `MALMOI_I18N_API_URL`**을 든다.
5. 열린 MR 경고는 서버의 `deferred`(사유 `open-pr`·`pr-check-failed`) 응답을 경고로 찍는다 — 별도 MR 조회 토큰을 요구하지 않는다(action v3의 `gh pr list` 사전 경고에 해당하는 조회는 `CI_JOB_TOKEN`의 허용 API에 MR 목록이 있는지 D1이 확인하고, 없으면 두지 않는다).

나머지 제약:

- **바뀌는 참조로 말모이 코드를 받지 않는다.** GitLab에는 composite action이 없다 — `include: remote`·브랜치 ref로 받으면 말모이 쪽 커밋 하나가 `PUSH_TOKEN`을 가진 남의 러너에서 즉시 돈다(CLAUDE.md의 `@main` 금지와 같은 부류). 불변 태그나 SHA로 고정한다.
- 릴리스 축은 앱 태그 `v<x.y.z>`·GitHub action 태그 `malmoi-i18n-push-vN`과 별개로 둔다.
- `PUSH_TOKEN`은 protected·masked CI/CD 변수로, 보호 브랜치 파이프라인에서만 노출한다.
- base 브랜치 조건·`[skip-malmoi-i18n]` 루프 가드·열린 MR 경고는 서버가 아니라 템플릿 책임이다. 현재 action은 `github.event.head_commit.message`와 `gh pr list`에 기대므로 GitLab에서 새로 만든다. GitLab은 merge·squash 커밋 메시지 템플릿을 프로젝트마다 바꿀 수 있어 MR 제목의 마커가 커밋에 남는다는 보장이 없다(POSTMORTEM 2026-09-17).
- `/api/push/failure` 계약을 그대로 따른다 — 적재 없음, `lastCommitSha` 미전진(전진시키면 다음 push가 `stale-commit` 409).
- **동작 기준선은 action v3**(`docs/ACTIONS.md` — 보류 사유별 경고, `unmanaged`는 red 아님). 셀프 호스팅 설치본이 만든 템플릿은 **항상 `api-url`을 든다**(없으면 push 토큰이 호스팅 서비스로 간다 — PRODUCT §4.1).
- **루프 가드는 지금 두 겹이다** — action v3 안(`.github/actions/malmoi-i18n-push/action.yml`)과 생성 워크플로의 `if:`(`lib/onboarding/workflow.ts`). GitLab 템플릿도 두 겹으로 둔다(하나로 줄이면 2026-09-17 squash 함정의 그물이 한 겹 준다). 마커 리터럴 소비자 집계(`lib/pull/__tests__/skip-marker.test.ts` — 지금 셋)에 GitLab 템플릿을 넷째로 등록하고, GitLab merge commit·squash 기본·squash 사용자 템플릿·fast-forward 메시지 모양을 같은 테스트에 넣는다.
- 외부 계약 문서 `docs/ACTIONS.md`에 GitLab 절을, 안내 화면 `components/onboarding/workflow-block.tsx`·`components/settings/ci-card.tsx`에 `.gitlab-ci.yml`과 masked 변수 안내를 짝으로 만든다.

자동 적재는 pending token·열린 PR/MR을 공통 판정으로 받고 조회 실패를 닫힘으로 해석하지 않는다. 사전 전달 revision과 잠금 뒤 revision 비교도 그대로 유지한다. 야간의 Publish/적재/스킵 분기와 수동 Sync 승인 지문을 복제하지 않는다.

리포 연결이 입력에 드는 지문은 넷이고, 모두 리포 호스트 identity와 연결 변경이 반영돼 오래된 승인이 재사용되지 않아야 한다.

| 지문 | 위치 | 저장 | 리포 호스트 투입 |
|---|---|---|---|
| OWNER 폐기 승인 `discardFingerprint` | `lib/protection/fingerprint.ts:25` | 아니오(서버 발급·즉시 대조) | 입력에 리포 호스트를 더해도 된다 |
| 소스 제거 승인 `removalFingerprint` | `lib/protection/fingerprint.ts:53` | 아니오 | 같다 |
| Publish 미리보기·MCP reconfirm `publishFingerprint` | `lib/publish/fingerprint.ts:16` | 아니오 | 같다 |
| 전달 문맥 `deliveryContextFingerprint` | `lib/translations/context.ts:34` — 소비자 `lib/pull/load.ts`·`lib/keys/delivery.ts` | **예**(`DeliveryConfirmation`) | ⚠️ **기존 GitHub 행의 입력·출력은 바이트 단위로 보존하고 GitLab일 때만 리포 호스트를 섞는다** — 일괄로 바꾸면 배포 순간 기존 `DeliveryConfirmation`이 전부 무효가 된다 |

`lib/mcp/confirm.ts`는 지문이 아니라 온보딩 샘플 확인값이다(위 §1 표).

### Publish

기존 미전달 캡처 → base SHA 고정 → 완전한 tree와 원본 blob 읽기 → 공통 render·변경 판정 → 전달 확인 무효화 → 리포 쓰기 → 성공 관측 → 기존 DB 확정 순서다.

`GitClient`의 `createTree/createCommit/updateRefForce`를 GitLab이 흉내 내도록 강제하지 않는다. 공통 코어가 필요로 하는 **고정 base에서 파일 스냅샷을 발행하고 review request를 유지하는 동작**으로 경계를 잡는다 — 확정 서명은 §3 "공통 경계". GitHub의 첫 외부 쓰기 이전 무효화와 API 호출 생략 동작을 보존한다.

**Publish 실행 수명 계약을 그대로 따른다**(ARCHITECTURE §5.6.2, POSTMORTEM 2026-10-09 — 셀프 호스팅엔 `maxDuration`이 없어 이 계약이 유일한 종료 장치다): GitLab transport도 `lib/sync/execution.ts`의 `execution.fetch()`를 지나 240초 예산·transport 직전 검사를 받는다. **비GET은 전부 쓰기로 센다**(commit·MR 생성·MR 닫기·브랜치 삭제) — 그 뒤 실패는 `execution-uncertain`, 300초 `publish-unsettled` 창, 자기 RUNNING에 대한 CAS 종료. GitHub 쪽이 Publish 중 retry/throttle을 끄듯(`lib/github.ts:87-89`) **GitLab 클라이언트도 자체 재시도·자체 fetch를 두지 않는다** — 애매한 5xx 뒤 MR 생성 POST가 다시 나가면 중복 MR이다.

GitLab 쓰기는 [Commits API](https://docs.gitlab.com/api/commits/#create-a-commit-with-multiple-files-and-actions)의 `POST /projects/:id/repository/commits` 한 번(`branch`·`start_sha`=캡처한 base·`force: true`·`actions[]`)과 [Merge requests API](https://docs.gitlab.com/api/merge_requests/)다. `start_sha`에 캡처한 base를 쓰므로 기존 sync 브랜치와 값을 병합하지 않는다. tree·commit·ref 세 단계가 호출 하나라 **"첫 외부 쓰기"도 그 호출 하나**다.

**실측**(2026-10-12, 프로젝트 `87515176`, base `cc61cf32`, sync 브랜치 `malmoi/i18n-measure` — 측정 뒤 기본 브랜치만·열린 MR 0으로 되돌렸다):

| 계약 | 결과 |
|---|---|
| 새 브랜치 + `start_sha` | 201, `parent_ids == [base]` |
| 새 브랜치 + `start_sha` + `force: true` | 201, `parent_ids == [base]` — **브랜치 유무와 관계없이 `force: true` 한 형태로 부른다**(존재 확인 `getRefSha` 불필요) |
| 기존 브랜치 + `start_sha`, `force` 없음 | 400 `A branch called '…' already exists…` |
| 기존 브랜치(앞선 커밋 2개 위) + `start_sha` + `force: true` | 201, `parent_ids == [base]` — 브랜치가 base 위 새 커밋으로 덮인다(GitHub `updateRefForce`와 동등) |
| 변경 외 파일 blob id | README·en·fr의 id가 base와 같다(tree 비교) |
| 파일 mode | `execute_filemode: true`로 만든 `100755` 파일이 다음 커밋(다른 파일만 수정)에서 `100755` 유지 · 수정 파일은 `100644` |
| blob id = 로컬 `git hash-object` | 4파일 원문(raw API) + 보낸 내용 2건 모두 일치(SHA-1, `repository_object_format: sha1`) |
| `actions: []` | 400 `Provide at least one action, or set allow_empty to true` |
| `allow_empty: true` + `actions: []` + `start_sha` + `force` | 201, base 위 **빈 커밋**(stats 0) — head ≠ base라 no-changes 판정(`staleHead !== baseHead`)이 매번 다시 서서 **수렴하지 않는다**. no-changes에 쓰지 않는다 |
| 내용이 같은 `update` | 201, 빈 diff 커밋(stats 0)이 생긴다 — GitLab은 no-op 커밋을 걸러 주지 않는다. **2층(blob hash 전부 같으면 commit 호출 0)이 유일한 방어선**이다 |
| MR 생성 | 201 `iid`·`state: opened`·`source_project_id`·`target_project_id`·`source_branch`·`target_branch`·`web_url`·`sha` |
| 같은 source 브랜치로 MR 재생성 | **409** `["Another open merge request already exists for this source branch: !1"]` — 중복 MR은 서버가 막지만, 응답 유실 뒤엔 재조회로 판정한다(409를 성공으로 읽지 않는다) |
| 열린 MR에 force 커밋 | MR의 `sha`가 새 커밋으로 따라온다(재사용 = 커밋만 다시) |
| MR 조회 | `GET /merge_requests?state=opened&source_branch=…&target_branch=…` — 오프셋 페이지(`x-total`·`Link`). 행마다 `source_project_id`·`target_project_id` |
| source 브랜치 삭제 | 204. ⚠️ **열린 MR이 자동으로 `closed`가 됐다**(`detailed_merge_status: not_open`) — 이전 설계 문장("자동으로 닫지 않는다")은 틀렸다. 그래도 순서는 **닫기(이유 코멘트) → 삭제**로 둔다: 먼저 지우면 이유 없는 종료가 남는다(GitHub `closePr` 선례) |
| MR 닫기 | `PUT state_event=close` 200 · 이미 닫힌 MR에 다시 닫기도 200(쓰기로 센다 — 호출하지 않는다) |
| 없는 브랜치 삭제 | 404 `404 Branch Not Found` |
| 기본 브랜치 삭제 | 400 `…The default branch of a project cannot be deleted.` |
| no-changes 두 번째 실행 | 열린 MR 목록 `[]` · 브랜치 404 → **외부 쓰기 0회**(읽기 2회) |
| 보호 브랜치(push 권한 없음)에 커밋 | 403 `403 Forbidden - You are not allowed to push into this branch` |
| 보호 브랜치(push 허용·force 금지)에 `force: true` | 400 `You are not allowed to force push code to a protected branch on this project.` — 우회하지 않는다. 사용자에게 `malmoi-i18n/sync-*`를 보호하지 말라고 안내 |
| 없는 source 브랜치로 MR | 400 `{"source_branch":["does not exist"]}` |
| 트리 | `GET /repository/tree?recursive=true&per_page=100` → 항목 `id`·`name`·`type`·`path`·`mode`, **`size` 없음**, 잘림 플래그 없음. 오프셋 페이지는 `x-total`·`x-total-pages`, keyset(`pagination=keyset`)은 `Link rel="next"`만 — **keyset으로 `next`가 없을 때까지** 읽는다(오프셋 `x-total`은 큰 리포에서 빠진다 — 문서) |
| 크기 | REST: `HEAD /repository/files/:path?ref=` → `X-Gitlab-Size`·`X-Gitlab-Blob-Id`(파일당 1회) · `GET /repository/blobs/:sha` → `size`(파일당 1회). **GraphQL `repository.blobs(ref, paths)` → `size`(문자열)·`rawSize`·`oid`·`lfsOid` 한 번에** — 복잡도 한도 250, 실측 2N+18(50·100경로 통과, 120경로 256으로 거부). 없는 경로는 결과에서 빠진다. 실측은 `project(fullPath:)`로 했다 — 구현은 숫자 id 주소 `projects(ids: ["gid://gitlab/Project/<id>"])`(§3 "공통 경계")이고 `id` 필드 하나만 늘어 100경로 218로 한도 안이다 |
| compare | `GET /repository/compare?from=<sha>&to=<branch>&straight=true` → `commits[]`·`diffs[]`(`old_path`·`new_path`·`renamed_file`·`new_file`·`deleted_file`)·`compare_timeout` |
| 레이트 리밋 | 인증 2000/분 — Publish 한 번은 아래 서명 기준 읽기 ~5 + 쓰기 2~3회 |

**판정**:

- **트리 크기 입력**(D12): reader가 REST tree(keyset)로 전체 목록·blob id를 읽고, 예산 대상 경로(`checkDownloadBudget`의 `paths` — 최대 200)만 GraphQL `blobs`로 크기를 100경로씩 묻는다(최대 2회, `projects(ids:)` 숫자 id 주소 · 응답 `project.id` 대조). 같은 응답의 `lfsOid`가 있으면 LFS 포인터로 거부한다(§3 원격 파일 판정). 크기 조회 실패는 `unavailable`이지 예산 초과가 아니다.
- **no-changes**(D9): `staleHead !== null && staleHead !== baseHead`이면 무효화 → 열린 MR(자기 프로젝트 것만)에 이유 코멘트 + 닫기 → sync 브랜치 삭제. 이후 `staleHead === null`이라 두 번째 실행은 읽기만 한다. `allow_empty` 빈 커밋은 head ≠ base라 수렴하지 않아 쓰지 않는다.
- **fork MR**: 프로젝트 MR 목록은 그 프로젝트를 target으로 하는 fork MR도 돌려준다. `source_project_id == target_project_id == 저장된 repositoryId`인 열린 MR만 재사용·닫기·자동 적재 보호 대상으로 고른다. fork 생성은 폐기용 리포에 잔여물을 남겨 실측하지 않았다 — **문서 근거**([MR 목록](https://docs.gitlab.com/api/merge_requests/#list-project-merge-requests)의 `source_project_id`).

다음은 실측하지 못해 계약 테스트(가짜 클라이언트)와 `/roundtrip`으로 남기는 것이다: 커밋 성공/MR 실패, 타임아웃, 실행권 만료, Publish 도중 토큰 만료에서 전달 확인·편집 토큰을 성공으로 만들지 않는다("결과 미확인"). 페이지네이션 중간 실패·불완전한 목록을 삭제 또는 변경 없음으로 판정하지 않는다. SHA-256 리포는 연결 시 거부한다(spec §5 — `repository_object_format`).

### 편집 UI·MCP

편집 기능·역할은 공유한다. MCP가 Action을 호출하지 않고 같은 코어를 쓰는 구조를 유지한다. 내부 쓰기는 Server Action, 외부 push는 Route Handler다.

GitHub 고정 문구·URL·글리프가 있는 표면. **키 단위 전수 표는 [consumers.md](consumers.md) §3**이다(2026-10-12 재개 0단계 — 2026-10-08 표가 v1.1~1.3 화면을 빠뜨려 3차 검수에서 버렸다). 기준 명령(같은 정규식을 세 사전·가이드에 쓴다):

```
rg -n -i 'github|pull request|\bPRs?\b' messages/en.tsx     # 줄 단위 — 키 단위 표로 옮긴다
rg -l -i 'github' guide/en guide/ko guide/es
rg -l 'GithubIcon|github\.com|GitPullRequest' components app
```

2026-10-12 재개 실측: en 사전 202줄 → **136키**(호스트 분기 101 = 문장 분기 61 · 흐름 분기 35 · CI 안내 5 / 호스트 문맥 없는 문구 개정 8 / 제외 15 / mcp 고정 영어 12), ko 88줄·es 109줄(키 집합은 en과 같다), 가이드 81파일(en·ko·es 각 27, 셀프 호스팅 4 포함), 컴포넌트·앱 54파일(비테스트 24). 정규식 밖 GitHub 전제 키 36과 사전 밖 코드 표면(`lib/projects/pr-url.ts`의 github.com origin 필터 · `lib/keys/view.ts` blob URL · `lib/security-headers.ts` CSP `form-action` 등)은 consumers.md §3.4·§3.5. 빠뜨리면 안 되는 자리(검수가 찾은 누락 — 전부 있음을 확인했다):

| 사전 namespace · 컴포넌트 | 변경 유형 |
|---|---|
| `translations` — Publish 모달, 키 상태 필터 `New from GitHub`(en `:2550`), 기준 언어 배너의 "GitHub Actions workflow" | 문장 분기 · URL |
| `summary` — Home 카운트 카드 제목 `newFromGithub`(`components/home/count-cards.tsx:26`, en `:1742` — 버튼이 아니다) | 문장 분기 |
| `home` — `meta.pullRequest`·`prState`·`prCheckFailed`(en `:1143-1145`), `meta-column.tsx`·`hold-later.tsx`·`sync-result.tsx` | 문장 분기 · 번호 표기(GitLab `!128`, GitHub `#128` — 2026-10-12 결정) · **Platform 행 신설(두 호스트 모두 — 시안 G5a, 2026-10-12 결정)** |
| `logs` — `Open on GitHub`·`sent translations to GitHub`·`pr-check-failed`(en `:1371`·`:1448`·`:1544`) | 문장 분기 · URL |
| `settings` — `The GitHub App is installed…`·`Authorize GitHub App`(en `:3483`·`:3588`), `components/settings/repository-card.tsx`(GithubIcon) | 흐름 분기 |
| `account`·`errors` — `components/account/github-section.tsx`, `components/github-account.tsx`, `components/reconnect-button.tsx` | 흐름 분기 |
| `newProject` — `components/onboarding/connect-github.tsx`·`steps/repo.tsx`·`workflow-block.tsx` | 흐름 분기 · CI 안내 |
| `projects` — 띠의 `Open on GitHub`, `Connect the GitHub App`, `components/projects/project-list.tsx`(GithubIcon) | 문장 분기 · URL · 흐름 분기 |
| `sources` — `workflowLine`·`prUnknown`(en `:3110-3114`), `remove-source-dialog.tsx`·`add-sources-modal.tsx` | 문장 분기 |
| `mcp` 응답 문구(en `:3724-3821`) · MCP 도구 설명·`get_workflow` 경로·필드명 `lastPublishPullRequest`·`newFromGitHub` | 문장 분기 · 경로 · 호환 정책 |
| `lib/status/canon.ts`의 `prOpen`·`prCheckFailed` 상태 키 | 라벨 분기(아래 톤 표) |
| `repositorySync.not-connected`, `locales.help`, `mcpConnector`의 `project:create` 권한 설명 | 문장 분기 |
| `components/settings/ci-card.tsx` · `components/shell/attention-inbox.tsx` | CI 안내 · 문장 분기 · URL |
| Logs·Home·소스 — `GitPullRequest*` 글리프(`publish-button.tsx`의 `GitPullRequestArrow`·`logs/glyph.tsx`·`home/count-cards.tsx`·`project-list.tsx`·`lib/home/attention-view.ts`) | **유지**(git 일반 글리프 — 시안 v6이 MR에도 같은 글리프를 썼다) |
| `guide/en·ko·es` 27개 파일 × 3 · README · 랜딩·SEO·공개 문서(`landing`·`seo`·`publicDocs`, `app/page.tsx`) | 포지셔닝 결정(spec §6)에 따름 |
| 셀프 호스팅 가이드 `guide/*/self-hosting/{install,operate}.md` | GitLab env·키 회전·백업 절차(spec §3 범위) |

**제외 대상** — 말모이 자체 리포를 가리키는 링크는 바꾸지 않는다: `/changelog`의 View on GitHub, 공개 헤더·푸터의 GitHub 링크. 로그인 공급자 이름(`/signin`·`/account` 로그인 수단)도 리포 호스트 문구가 아니다.

**문구 전략 — 리포 호스트별 문장 분기**(2026-10-12 사용자 결정, spec §1). 해당 키는 호스트를 받아 **문장을 통째로** 고른다. ⚠️ **호스트 이름 + 조사를 보간하지 않는다** — ko에서 GitHub(깃허브)는 받침이 없어 `가·는·를·로`, GitLab(깃랩)은 받침이 있어 `이·은·을·으로`다(`lib/i18n/__tests__/helpers/banned-terms.ts:59-63`이 GitHub 쪽을 강제한다). 보간하면 한쪽 조사가 반드시 틀린다. banned-terms에 GitLab 조사 행을 더한다.

용어 규칙은 정본이 먼저 바뀐다. DESIGN §10.1의 App 호칭 행(v1.3.0부터 "Malmoi GitHub App"은 **금지어**이고 처음 "the GitHub App", 이어서 "the app" — DESIGN `:2422`, banned-terms `:34-35`·`:92-94`)·`pull request` 허용 근거("GitHub의 고유명사이고 링크가 실제로 그리 간다"), §2.4의 "Couldn't check for an open pull request" 행, §6 메타 열의 "파랑은 GitHub으로 나가는 것뿐", `lib/i18n/__tests__/helpers/banned-terms.ts`의 PR·App 호칭·조사 규칙이 GitHub을 고정한다. PR/MR 호칭(spec §6)이 닫히면 이 정본과 banned-terms, 그리고 `lib/i18n/__tests__/terminology.test.ts`의 `CONCEPT_BANNED`·`ALLOWED`(홀로 서는 "Couldn't check" 금지가 merge request 목적어에도 통해야 한다)를 사전 작업보다 **먼저** 고친다.

브랜드 글리프 — `lucide-react`에는 GitHub·GitLab 브랜드 아이콘이 없다. GitLab 글리프는 이 리포의 유일한 브랜드 글리프 위치인 `components/signin/brand-icons.tsx`에 추가한다. `github-glyph.test.ts`는 GitHub path만 세므로 **`gitlab-glyph.test.ts`를 새로 둔다**(`mcp-glyph.test.ts` 선례). tanuki는 **단색 `currentColor`**다(D10 — 옆에 서는 GitHub 글리프와 같은 형이고 DESIGN §6.2 raw 색 예외를 늘리지 않는다). ⚠️ `visual-system.test.ts`는 `brand-icons.tsx`를 파일 단위로 면제하므로 다색이 섞여도 green이다 — `gitlab-glyph.test.ts`가 `fill="currentColor"`와 색 리터럴 0을 센다.

연결 상태와 §2.4 톤 매핑(**확정 — E0, 2026-10-12**: D11 만료 임박 14일 · D13 레거시 PAT `api` 하나). 상태는 화면마다 그리지 않고 **`lib/status/canon.ts`의 `STATE` → `StatusBadge` 한 경로**로만 그린다(POSTMORTEM 2026-10-08 — 결과 미확인의 톤과 PR 조회 실패 문구가 화면마다 갈렸다). PR/MR 분기도 `STATE.prOpen`·`prCheckFailed`의 label 한 곳에서 한다(DESIGN §2.4 — GitLab 짝 `Couldn't check for an open merge request`).

**자리가 둘이다** — 프로젝트의 Connection 행(Home 메타 · 설정 연결 행, `repositoryConnectionState` 다섯 값)과 **토큰의 자리**(`/account` GitLab 카드 · 설정 GitLab 카드의 연결자·만료일 줄). 프로젝트 행은 "Sync·Publish가 도나"를, 토큰 자리는 "토큰이 어떤가"를 말한다 — GitHub App 계정 카드의 `Expired`가 프로젝트 Connection 행에 서지 않는 것과 같은 분리다.

| 상태 | §2.4 톤 | 프로젝트 Connection 행 `STATE` | 토큰 자리 `STATE` | 연결 건강성(`planConnectionHealth` 8종)과의 대응 |
|---|---|---|---|---|
| 만료 (401 — 만료일 지남) | warning | `disconnected` + [Reconnect](다른 OWNER) | `expired`(기존 — 인가·MCP 토큰·연결 앱의 Expired와 같은 키) + [Replace token](주인) | `Disconnected`로 접는다 — GitHub 전용 사유(`app-uninstalled`·`installation-changed`·`unpinned`)와 별개 사유 |
| 철회 (401 — 만료일 전) | warning | `disconnected` + [Reconnect] | `disconnected`(검증이 만료와 철회를 가르지 못하면 만료일로 가른다 — 만료일 전 401 = 철회) | `Disconnected` |
| 일시 장애 (네트워크 · 5xx · 429) | warning | `couldNotCheck`(기존 `Couldn't check`) | `couldNotCheck` | ⚠️ `unknown` — 끊김으로 접지 않는다. 컨트롤 없음 |
| 보관된 GitLab 프로젝트 (쓰기 403) | warning | `disconnected` + [Reconnect] | 대응 없음 — 토큰은 정상 | `Disconnected`(재시도 루프 금지) |
| PAT 만료 임박 (만료일 ≤ 14일, D11) | **warning**(새 톤이 아니라 새 **상태 행**) | `connected` — 연결은 정상이라 접지 않는다 | **새 키 `expiresSoon`**(warning · `soft-amber`, 낱말 en **Expires soon** · ko **만료 예정** · es **Caduca pronto** — 사전·§10.1 등재는 E-ui) + 만료일(`formatDay`) | 대응 없음 — 정상 |
| PAT 스코프 부족 (`api` 없음) · fine-grained PAT | danger — 연결 거부(① 입력 아래 `Alert danger`, `aria-describedby`) | 저장되지 않으므로 상태 없음 | 저장되지 않으므로 상태 없음 | 대응 없음. ⚠️ 레거시 PAT의 스코프는 만든 뒤 바꿀 수 없어 "연결 뒤 발견"은 생기지 않는다 — 생기면(403 insufficient_scope) 철회 행과 같다. 새 키를 두지 않는다 |
| PAT 주인이 리포 권한을 잃음 (Maintainer 미만 · 멤버 아님) | warning | `disconnected` + [Reconnect] | 대응 없음 — 토큰은 정상(다른 프로젝트는 돈다) | `Disconnected` |
| 보호 브랜치 권한 부족 (403 push · 400 force — 실측) | danger | 대응 없음 — 연결은 정상(`connected`) | 대응 없음 | 대응 없음. Publish 결과의 실패 갈래(Logs `logsFailed`)이고 안내 문장이 "sync 브랜치를 보호 규칙에서 빼라"를 말한다 |

새 `STATE` 키는 `expiresSoon` 하나다. 나머지는 전부 기존 키(`connected`·`disconnected`·`couldNotCheck`·`expired`·`logsFailed`·`prOpen`·`prCheckFailed`) 재사용이다.

만료일 표시는 `lib/date-format.ts`(사용자 시간대 + 오프셋 라벨, CLAUDE.md 날짜 규칙), 남은 기간은 `lib/relative-time.ts`다.

**375px 폭**(DESIGN — v1.3.2부터 최소 대응 폭 375, 폭에 따른 기능 분기 0): GitLab 하위 그룹 주소(`group/subgroup/project`)가 길다. 리포 목록 행·Home 메타 Repository(라벨 + 오른쪽 정렬 값)·Sync 확인 Dialog의 브랜치 줄·설정 Repository 행에서 말줄임/줄바꿈 규칙을 정한다(이름 끝을 보존). 시안 G3b·G4e·G6c.

**접근성**: 호스트를 글리프만으로 가르지 않는다 — 브랜드 마크는 `aria-hidden`이므로 호스트 이름이 텍스트나 접근 이름에 든다. `/account`에 GitHub·GitLab 연결이 나란히 서면 Disconnect 접근 이름이 축을 든다(`settings.disconnectLabel` 선례, DESIGN §6.646). PAT 입력 필드는 라벨·오류를 `aria-describedby`로 잇는다.

초대 이메일도 영향 범위다. `lib/invitation-email/template.ts:74`의 "sends it back to GitHub"를 리포 호스트에 맞는 문장으로 분기하고(초대 대상 프로젝트의 호스트) 두 리포 호스트의 초대에서 검증한다. 사전을 통하지 않는 영문 템플릿이므로 사전 갱신과 별도로 다룬다. 셀프 호스팅은 이 문구를 정하지 않고 출시됐다 — 이 기능이 정한다(spec §5).

화면은 [design-brief.md](design-brief.md)가 든다 — ① 맨 위 GitHub / GitLab 탭(GitHub 탭은 현행), GitLab 탭의 PAT 입력과 상태 shell, 그리고 프로젝트 목록·Home·설정에 리포 호스트 맥락을 넣는 방식. 열린 갈래는 없다(MR 번호 `!128` · 글리프 단색 D10 · 만료 임박 14일 D11).

## 3. 순수 함수 — 향후 TDD 진입점

| 대상(이름은 가칭) | 입력 → 판정 | 주요 회귀 |
|---|---|---|
| 리포 identity 정규화/비교 | 리포 호스트·정규 호스트·불변 id·namespace → identity/거부 | 같은 id의 다른 리포 호스트, 하위 그룹, 이전 이름 재사용, SHA-256 object format 거부 |
| 연결·readiness 판정 | 리포 호스트별 연결 증거·첫 적재 상태 → 상태 | 설치 id 없는 정상 GitLab, 설정만 있는 프로젝트 |
| 승인/전달 문맥 지문 | 캡처 identity·연결 revision·현재 설정 → 유효/실효 | 조회 중 재연결·권한 철회·소스 변경, **기존 GitHub 지문 바이트 불변** |
| GitLab commit 요청 조립 | 고정 base·공통 파일 변경·mode → actions | create/update 구분, 비정상 경로, 파일 mode, 경로 인코딩(공백·유니코드·`%`·하위 그룹 namespace) |
| 원격 파일 판정 | tree 항목·blob 내용 → 읽기/거부 | LFS 포인터 파일 거부(포인터를 파싱하거나 Publish가 덮어쓰면 안 된다) |
| PR/MR 조회 결과 정규화 | 저장된 repositoryId·sync branch·원격 응답 → 열림/없음/조회 실패 | 권한 은폐 404를 없음으로 오인 금지, source/target project id가 다른 동명 fork MR 제외 |
| 리포 호스트 URL·오류 판정 | identity·commit·경로·상태 → 안전한 URL/복구 코드 | GitLab 하위 그룹, 재연결 필요와 일시 장애 구분, 429는 일시 장애, 보관된 GitLab 프로젝트의 쓰기 403은 재연결 필요(재시도 루프 금지), 기본 브랜치 개명은 `base-branch-missing`이며 늦게 도착한 판정이 현재 상태를 덮지 않는다 |
| CI 입력 변환 | checkout·base·마커·설정 → 기존 생산자 입력/스킵 | 다른 브랜치, 머지 방식, 오래된 실행 |
| 저장 오류 코드 정책 | 리포 호스트·실패 → `SyncRun.errorCode` | 기존 `github-error`·`not-installed` 행의 의미 보존 — **재사용으로 판정**(아래 "0단계 판정"). GitLab 실패도 같은 두 코드로 저장되고 Logs 문장만 프로젝트 호스트로 분기한다. `error-codes.test.ts` 등재 변화 없음 |
| 권한 분류 | 원격 응답 → 재인가/일시 장애/거부 | 401을 `unavailable`로 접지 않는다(복구 컨트롤 0개 화면 금지, POSTMORTEM 2026-09-19) · access level 정보가 없으면 거부가 아니라 `unavailable` · `requirePush`는 기본값 없는 필수 인자(2026-09-27) |

strict 적재·미전달 보호·렌더·전달 확인은 기존 순수 함수와 테스트에 양쪽 리포 호스트의 사례를 추가한다. 같은 판정의 GitLab 사본을 만들지 않는다. 어댑터를 공유하므로 빈 키 목록·orphan·로케일 누락·빈 `{}` 중첩 JSON(POSTMORTEM 2026-09-29)·chrome `placeholders: null`(2026-09-24)은 기존 테스트에 GitLab 사례 한 줄씩이고, spec 완료 조건 2는 **다섯 포맷 × 두 리포 호스트 render 바이트 동일** 테스트로 잰다. 기존 GitHub 쪽 공백 — `getTree` truncated에서 던지는 동작(`lib/github.ts:391-392`) 미단언, `findOpenPr`의 `data[0]`만 보는 페이지네이션 부재(`:452-462`) — 도 공통 계약 테스트에 GitHub 사례를 한 줄씩 둔다. **변경 없음 경로의 쓰기 호출 0회**(1층 — DB 미전달 0이면 원격 호출 0, 2층 — blob hash가 모두 같으면 commit API 호출 0)는 가짜 클라이언트의 호출 기록으로 단언한다.

### 0단계 판정 (2026-10-12, D12)

| 판정 | 결론 | 이유 |
|---|---|---|
| 저장 오류 코드 `github-error`·`not-installed` | **문자열을 그대로 두고 의미를 일반화한다** — `github-error` = 리포 호스트 HTTP 실패(분류기 `lib/sync/plan.ts`의 `httpStatus` 판정은 이미 호스트 중립), `not-installed` = 그 프로젝트에 쓸 연결 자격증명이 없음(GitHub 설치 없음 / GitLab 연결 참조 비어 있음). 새 코드를 만들지 않는다. `SYNC_ERROR_CODES` 머리 주석에 두 의미를 적고 Logs 문장(`logs.reasons.*`)만 호스트로 분기한다 | 이 코드는 `SyncRun.errorCode`와 **지우지 않는** `ProjectEvent` 페이로드(`lib/events/payload.ts`)에 저장된다 — 이름을 바꾸면 과거 사건이 못 읽히거나 이중 코드가 영구히 남는다(불변식 3의 확장) |
| 메모 키(`open-pr-memo`·`probe-memo`) | **리포 호스트와 GitLab 연결 참조를 키에 더한다**: `[host, owner, name, installationId, gitlabConnectionId, repositoryId]`(open-pr은 앞에 slug) | 같은 숫자 id·이름이 두 호스트에 있을 수 있고, GitLab 재연결은 `installationId`가 아니라 연결 참조를 바꾼다 — 빠지면 재연결 직후 옛 판정이 새 연결에 붙는다(probe-memo 머리 주석의 기존 함정과 같은 형). 메모는 메모리 TTL이라 키가 바뀌어도 호환 문제가 없다 |
| `GITHUB_WAIT_MS`·`withinGithubWait`·`lib/github-wait.ts` | **이름을 유지한다**. GitLab 소비자도 같은 상수를 import하고, 머리 주석에 "리포 호스트 원격 대기 전체의 공유 마감"을 적는다 | 이름 변경만으로 비테스트 8 + 테스트 7 파일이 움직인다(외과적 변경 위반) — 손 사본이 생기지 않는 것이 요지이고 이름은 그 요지와 무관하다 |

### 공통 경계 (커밋 A가 만든다)

**경로 (D15)**: 경계 = `lib/repo-host/`(`target.ts` 판정 · `reader.ts` 리더 계약 · `index.ts` 호스트 선택) · GitLab I/O(B transport + C client·reader·Publish) = `lib/gitlab/` · GitLab PAT 연결(B2, `lib/github-connect/` 짝) = `lib/gitlab-connect/`. `lib/github.ts`는 제자리에서 GitHub 쪽 구현이다. 셋 다 `scripts/gate-plan.ts`의 `test:projects:postgres` 트리거이고 `vitest.projects.config.ts` include에 있다(커밋 A가 미리 등록 — B·C는 게이트를 건드리지 않는다).

**커밋 A 반영본과 아래 서명의 차이**: ① `publishSnapshot` 입력은 `message`가 아니라 `summary`다 — 메시지(루프 마커)는 구현이 `commitMessage(summary)`(`lib/pull/payload.ts`)로 만든다(마커가 드는 문자열 조립을 한 곳에 둔다). `buildTreePayload`·`buildCommitPayload`는 `skip-marker.test.ts`·`payload.test.ts`가 직접 물어 `payload.ts`에 남고 GitHub `publishSnapshot`만 부른다. ② `checkRepoAccess`의 거부 갈래는 `status: "rejected"` 그대로다(호출부의 판정이 전부 `status !== "ok"`라 이름만 바꾸는 diff를 만들지 않았다). ③ 프로젝트 행 → `RepoLocator`는 `repoLocatorOf(project)`(`target.ts`) 하나다 — B가 호스트 갈래를 거기 더한다. ④ 온보딩 재대조 셋(`import.ts`·`add.ts`·`detect.ts`)은 `sameAccessedRepository(access, repoTargetOf(project).target)`이다(D16): `sameRepository`(호스트 + 리포 id)에 **GitHub 갈래만 설치 id 동일**을 더한다. App 설치는 계정 단위라 호출자가 보는 설치가 곧 프로젝트가 써야 할 설치이고, 재설치 뒤 옛 설치로 읽으러 가면 토큰 발급에서 `ingest-failed`로 죽는다 — 지금처럼 `repo-replaced`·`repo-forbidden`으로 멈춘다(GitHub 동작 불변). GitLab 갈래는 `sameRepository`만 본다. ⑤ 같은 이유로 `add.ts`·`detect.ts`·설정 브랜치 목록(`listLinkedBranches`)의 GitHub 갈래는 지금처럼 **확인한 접근의 값으로** 연다(대조를 지난 뒤라 같은 설치·리포다). 사람 단위 연결인 GitLab 갈래는 프로젝트 쪽 연결로 연다(B·C). ⑥ `RepoTarget`·`RepoLocator`·`RepoAccess`는 GitHub 변형 하나뿐이다 — GitLab 변형과 각 `switch`의 갈래는 소비자가 생기는 B·C가 더한다(`default`의 `unreachable(x.host)`가 빠뜨린 자리를 typecheck로 알린다).

**원칙**: 기존 `GitClient`(`lib/pull/client.ts`)와 `RepoReader`(`lib/github.ts`)를 경계로 삼고 **GitLab이 흉내 낼 수 없는 쓰기 넷만 바꾼다**. 메서드 이름(`findOpenPr` 등)은 내부 이름이라 바꾸지 않는다(이관 diff를 줄인다 — 화면 낱말은 사전이 든다). 모든 메서드는 GitHub(커밋 A)·GitLab(커밋 C) 둘 다 구현하고 소비자가 있다.

```ts
// lib/repo-host/target.ts — 경계의 입력. Project 행에서 만든다(클라이언트 입력이 아니다).
export type RepoTarget =
  | { host: "github"; owner: string; name: string; installationId: string; repositoryId: string }
  | { host: "gitlab"; owner: string; name: string; repositoryId: string; connectionId: string };
//   owner = GitLab namespace 전체(group/subgroup), name = path. repositoryId = GitLab project id(문자열).
/** 연결 증거가 없으면 이유를 가른다 — GitHub `unpinned`(설치 id 있음 + 리포 id 없음)와 `not-connected`를 한 null로 접지 않는다(sec-audit-2 #34의 [Reconnect] 안내가 이 갈래에 선다). */
export type RepoTargetResult = { status: "ok"; target: RepoTarget } | { status: "not-connected" } | { status: "unpinned" };
export function repoTargetOf(project: ProjectRepoColumns): RepoTargetResult;
//   GitHub: installationId null → not-connected · repositoryId null → unpinned (지금 storedConnection과 같은 판정 — 그 함수를 이리로 옮긴다)
//   GitLab: 연결 참조 null → not-connected · repositoryId는 생성 때 항상 있다(unpinned 없음)

/** 잠금 안 재검증용 — 호스트·리포 id·연결 증거(installationId / connectionId)까지 같아야 같다. 재연결을 감지한다. 소비자: nightly/run.ts:150 · import/run.ts:93 · surfaces/create.ts:58 */
export function sameRepoTarget(a: RepoTarget, b: RepoTarget): boolean;
/** 호출자 접근 결과 대 프로젝트 대조용 — 호스트 + 리포 id만. GitLab에서 호출자 연결 ≠ 프로젝트 참조 연결이 정상이라(D13) 연결은 보지 않는다. 소비자: onboarding-run/import.ts:61 · add.ts:63 · detect.ts:67 */
export function sameRepository(a: { host: RepoHost; repositoryId: string }, b: { host: RepoHost; repositoryId: string }): boolean;
//   ⚠️ 기계적으로 installationId → connectionId로 바꾸면 연결자가 아닌 OWNER의 수동 Sync·소스 추가가 전부 repo-replaced가 된다.
//   ⚠️ **호출자 접근 확인 뒤의 I/O는 항상 repoTargetOf(project)(프로젝트 참조 연결)로 연다** — 호출자 연결로 열지 않는다(import.ts:65가 지금 프로젝트 쪽 id로 여는 형을 지킨다).

// lib/repo-host/index.ts — 호스트별 구현을 고르는 유일한 자리. 소비자는 lib/github.ts를 직접 import하지 않는다(GitHub 전용 파일 제외 — consumers.md §1).
export function createGitClient(target: RepoTarget, execution?: PublishExecution): Promise<GitClient>;
export function openRepoReader(target: RepoTarget): Promise<RepoReader>;
export function listBranches(target: RepoTarget): Promise<BranchList>;
export function loadConnectionHealth(result: RepoTargetResult, options?: { memo?: boolean }): Promise<ConnectionHealth>;
//   ok가 아니면 호출 0으로 not-connected·unpinned를 돌려준다(지금 storedConnection 갈래). storedConnection을 직접 부르는 페이지 둘
//   (설정 page.tsx:56 · 번역 page.tsx:143)도 repoTargetOf 결과로 옮긴다 — consumers.md §1.1 간접 소비자.

// ⚠️ **GitLab REST·GraphQL은 숫자 id로만 주소한다** — REST `/projects/<repositoryId>/…`, GraphQL `projects(ids: ["gid://gitlab/Project/<repositoryId>"])`.
//   인코딩한 `namespace%2Fpath`·GraphQL `project(fullPath:)` 주소는 금지한다. 이것이 PAT에서 실제로 서는 첫 층이다 — 이름이 재사용·이전돼도 남의 프로젝트를 읽거나 쓰지 않는다.
//   계약 테스트: 가짜 transport가 받은 URL·GraphQL 본문에 `%2F`나 `fullPath`가 있으면 red(POSTMORTEM 2026-09-27 — 주소 형태만 보고 대상이 옳은지 안 본 형).
// GitLab createGitClient·openRepoReader는 생성 때 GET /projects/<id> 1회로 archived=false·repository_object_format=sha1을 확인하고
//   path_with_namespace가 저장된 owner/name과 다르면 표시층 `repo-replaced`의 재료로 넘긴다(id로 부르는 한 id 대조는 동어반복이다).
//   이 GET은 1층(미전달 0 → 원격 호출 0) **뒤**에 둔다 — run.ts의 not-installed 판정을 repoTargetOf로 바꿀 때 클라이언트 생성 순서를 지킨다.
// GitHub은 기존 pinnedOctokit(토큰을 리포 id 하나로 좁힌다)이 첫 층이다.

// lib/pull/client.ts — 바뀌는 것만
export type GitClient = {
  getRefSha(ref: string): Promise<string | null>;               // 유지
  getTree(commitSha: string): Promise<GitTreeEntry[]>;           // 유지 — GitLab은 keyset 끝까지, 중간 실패는 throw
  getBlobText(sha: string): Promise<string>;                     // 유지
  /** 고정 base 위에 변경 파일로 커밋 하나를 만들고 sync 브랜치를 그 커밋으로 맞춘다(없으면 만든다). 첫 외부 쓰기. 반환 = 커밋 SHA. */
  publishSnapshot(input: { branch: string; baseSha: string; changes: readonly (PullChange & { inBase: boolean })[]; message: string }): Promise<string>;
  //   GitHub: createTree → createCommit → getRefSha → createRef|updateRefForce (지금 run.ts의 네 단계를 옮긴다)
  //   GitLab: POST /repository/commits { branch, start_sha: baseSha, force: true, actions: inBase ? update : create } 1회
  /** no-changes 수렴 — sync 브랜치를 "base와 같음"으로 만든다. 호출부는 staleHead !== null && !== baseHead일 때만 부른다. */
  resetSyncBranch(branch: string, baseSha: string): Promise<void>;
  //   GitHub: updateRefForce(branch, baseSha) / GitLab: DELETE /repository/branches/:branch (404면 이미 수렴 — 성공)
  /** @param branch sync 브랜치 이름만 — GitHub 구현이 `owner:branch`를 조립한다(호출부가 조립하던 함정을 경계 안으로). */
  findOpenPr(branch: string): Promise<{ url: string; number: number; title: string; base: string } | null>;
  //   GitLab: state=opened&source_branch 목록에서 source_project_id === target_project_id === repositoryId만. number = iid
  createPr(headBranch: string, baseBranch: string, title: string, body: string): Promise<string>; // 유지 — GitLab 409는 throw(재조회는 호출부 결과 미확인 경로)
  updatePrTitle(number: number, title: string): Promise<void>;   // 유지
  updatePrBase(number: number, base: string): Promise<void>;     // 유지 — GitLab PUT target_branch
  closePr(number: number, comment: string): Promise<void>;       // 유지 — GitLab: POST notes → PUT state_event=close
  compareToBase(baseSha: string, branch: string): Promise<{ ahead: boolean; files: ChangedFile[] }>; // 유지 — GitLab compare straight=true
  //   GitLab ahead 판정·compare_timeout은 C의 계약 항목: ahead = commits.length > 0 || diffs.length > 0, compare_timeout: true는 "변경 없음"이 아니라 조회 실패(throw).
  isPullRequestOpen(number: number): Promise<boolean>;           // 유지 — GitLab GET merge_requests/:iid state
};
// 삭제: createTree · createCommit · createRef · updateRefForce (소비자는 run.ts 둘뿐이고 publishSnapshot·resetSyncBranch로 옮긴다)
// lib/pull/payload.ts의 buildTreePayload·buildCommitPayload는 GitHub 구현 안으로 들어간다. GitLab actions 조립은 순수 함수(위 "GitLab commit 요청 조립").
// 파일 mode: GitHub은 바뀐 파일을 전부 100644로 쓴다(payload.ts). GitLab 조립은 `execute_filemode`를 넣지 않는다(update 실측 100644) — 같은 동작이다.
// 무효화 순서는 호출부(run.ts)가 든다 — 계약 테스트 한 줄: 가짜 클라이언트 호출 기록에서 첫 비읽기 메서드가 invalidateDelivery 뒤에 온다.

// RepoReader — 하나 추가
export type RepoReader = {
  snapshot(baseBranch: string): Promise<RepoSnapshot>;           // 유지 — GitLab files[].size는 비어 있다
  blob(sha: string): Promise<string | undefined>;                // 유지
  /** 예산 대상 경로의 크기. GitHub = 인자 snapshot의 size(호출 0 — reader가 상태를 들지 않는다), GitLab = GraphQL blobs 100경로씩. LFS 포인터면 그 경로를 거부 사유로 준다. */
  sizes(snapshot: Extract<RepoSnapshot, { status: "ok" }>, paths: readonly string[]): Promise<{ status: "ok"; sizes: Map<string, number> } | { status: "lfs"; path: string } | { status: "unavailable" }>;
  //   GitLab: projects(ids:[gid]) { repository { blobs(ref: headSha, paths) { path size lfsOid } } } — 응답 project.id가 gid와 다르면 unavailable.
  //   `size`는 **문자열**로 온다("89") — 숫자로 바꾸고 안전 정수가 아니면 unavailable(checkDownloadBudget이 Number.isSafeInteger를 본다).
  //   ⚠️ GraphQL은 POST다 — **Publish 실행(`execution.fetch()`) 안에서 부르지 않는다.** 부르면 쓰기로 세어져 그 뒤 실패가 execution-uncertain이 된다. 지금 소비자는 import뿐이다.
};
// 소비자: lib/import/read.ts가 checkDownloadBudget 앞에서 부른다(지금 snapshot.files의 size를 쓰는 자리).

// 호출자 리포 권한 — lib/onboarding-run/access.ts
export function checkRepoAccess(prisma: PrismaClient, userId: string, target: RepoLocator, options: { requirePush: boolean }): Promise<RepoAccess>;
//   RepoLocator = { host: "github"; owner; name } | { host: "gitlab"; repositoryId }. requirePush는 기본값 없는 필수(2026-09-27).
//   GitLab은 **호출자 자신의** 계정 연결 PAT로 `GET /projects/<id>/members/all/<호출자 GitLab user id>`의 access_level을 읽는다 —
//   상속·공유 그룹 권한을 포함한 유효 권한이다(`GET /projects/:id`의 permissions는 그룹 상속이 project_access: null로 와서 틀린다).
//   쓰기 = 40(Maintainer) 이상 · 읽기 = 20(Reporter) 이상(Guest는 private 코드를 못 읽는다) · 404 = 멤버 아님(거부). ①의 목록 필터 min_access_level=40과 기준이 같다.
export type RepoAccess =
  | { status: "ok"; host: "github"; repositoryId: string; repoOwner: string; repoName: string; defaultBranch: string; installationId: string; connect: RepoConnect }
  | { status: "ok"; host: "gitlab"; repositoryId: string; repoOwner: string; repoName: string; defaultBranch: string }
  | { status: "error"; error: OnboardFailure };
//   GitHub 전용 필드(installationId·connect)는 host 갈래 안에만 둔다. GitLab 실패 코드(호출자에게 GitLab 연결 없음·만료·fine-grained·unavailable)의
//   OnboardFailure 추가는 A가 아니라 B의 계약이다(A는 GitHub 갈래만 채운다).
```

경계 밖으로 두는 것: GitLab PAT 연결 검증(`/self`·`/user`)·①의 리포 목록·연결 저장은 GitLab 전용 Server Action과 순수 함수다(GitHub의 `lib/github-connect/`와 대칭인 새 디렉터리, B2). GitHub 설치·인가 흐름은 그대로다.

## 4. 스키마와 배포

**additive-first 제안**이다. 번역·키·로케일·멤버·이력 테이블을 리포 호스트별로 복제하지 않는다.

- Project에 리포 호스트 식별을 추가하고 기존 행은 GitHub로 해석한다. 호스트는 1차가 GitLab.com이면 서버의 리포 호스트별 고정 매핑으로 충분하다. 사용자 지정 host 컬럼을 선행 추가하지 않는다.
- repository id의 identity는 `(리포 호스트, canonical host, repositoryId)`다. 현재 `repositoryId`에 unique가 없어 같은 숫자 id가 DB에서 즉시 충돌하지 않는다 — additive로 충분하다. DB의 전역 unique 추가 여부는 기존 동일 리포 연결 정책을 확인한 뒤 정하며 임의로 한 리포 한 프로젝트 제약을 만들지 않는다.
- GitHub `installationId`는 GitHub 전용 nullable 정보로 유지한다. GitLab을 통과시키려고 가짜 설치 id를 쓰지 않는다.
- GitLab namespace는 `group/subgroup`을 보존해야 한다. 기존 owner/name 검증을 전수 확인하고 부족한 주소 필드를 additive로 추가한다. repositoryId는 주소와 분리한다.
- PAT 저장은 **하나**다(위 "GitLab 연결"): 계정 단위 GitLab 연결(사용자당 하나 — PAT 봉투 + GitLab 사용자명·만료일·스코프 메타). 프로젝트는 그 연결을 **참조하는 열**(연결 id, nullable)만 든다. 원문 저장·로그 출력 없이 기존 봉투 암호화/회전 원칙을 따른다. 참조 주인이 멤버에서 빠지거나 연결을 해제하면 참조를 같은 트랜잭션에서 비운다. **로그인 `Account`에 섞지 않는다** — GitLab은 로그인 공급자가 아니다. 연결자가 프로젝트를 떠날 때 사본 처리는 spec §6 결정 행.
- `lastPrUrl`·실행 이력은 기존 저장을 활용할 수 있으나 URL 판정·payload 스키마·UI 문구를 리포 호스트에 맞춘다. 이름 변경만을 위한 전면 열 rename은 하지 않는다.

배포 순서: additive migration → 기존 GitHub 행 검증 → 두 리포 호스트를 이해하는 모든 reader/writer 배포 → GitLab 생성 활성화. 구현은 **A~E 한 `/push` 배치**다(2026-10-12 결정 — dev에 화면 없는 GitLab 경로가 열리는 창을 만들지 않는다). ⚠️ **셀프 호스팅 설치본은 버전을 건너뛰어 업데이트할 수 있다** — 백필은 앱 코드가 아니라 **마이그레이션 SQL 안에서** 끝낸다(SELF-HOSTING §3-1). "기존 GitHub 행 검증"이 앱 코드 백필을 전제하면 건너뛴 설치본에서 깨진다. dev DB는 `/push` 전에 `/db`로, prod DB는 `/merge` 1단계(`db:deploy`·`db:status:prod`)에서 넓힌다. 활성화는 **스위치 없음**이다(D6) — prod는 `/merge`, 셀프 호스팅은 그 태그로 업그레이드가 곧 활성화다. 새 env가 없다. 구 필드 제거가 필요해지면 소비자 이관과 별도 배포로 나눈다. 마이그레이션은 B1 배치가 만들고 지휘자가 dev에 적용한다.

**롤백**(D6 전제 확인 + D6a — 경로 전수는 [consumers.md](consumers.md) §2): 구버전(GitLab 이전 코드)은 GitLab 행(`installationId = null`·`repositoryId` 있음)을 `setup`/`not-installed`/`failed`로 읽고 GitHub에 쓰거나 크래시하지 않는다. **예외 하나** — 구버전 `/api/push`는 `openPrGateApplies`가 false라 **열린 MR 게이트 없이** strict 적재한다(미전달 편집·`publish-raced` 게이트는 남는다). 그래서 롤백 절차에 한 줄을 둔다: **GitLab 릴리스 이전 버전으로 되돌리기 전에 GitLab 프로젝트의 CI 파이프라인을 멈추거나 그 프로젝트들의 `PUSH_TOKEN`을 회전한다 — 구버전 `/api/push`에는 `installationId = null` 행의 열린 MR 게이트가 없다.** 셀프 호스팅 운영 가이드(`guide/*/self-hosting/operate.md`)에도 같은 줄을 E-sh 배치가 넣는다.

## 5. 인증과 환경변수

**GitHub는 불변식 6의 로그인/연결/쓰기 분리를 그대로 유지한다.** GitLab은 2026-10-12 결정으로 **연결자 PAT가 연결 증명이자 쓰기 신원**이다 — 분리하지 않는 대가(개인 명의 커밋·만료·퇴사 시 끊김)는 spec §3에 적었다. 불변식 6 문장은 "GitHub에서는 분리, GitLab에서는 연결자 PAT"로 다시 쓴다(spec §6 정본 문구 행).

이 분리를 상시로 세는 `lib/github-connect/__tests__/credential-separation.test.ts`는 Octokit 형태(`App` import, `rest.*.create`, `paginate("POST`)만 정규식으로 세고, `app/`을 스캔하지 않으며, 완전성 검사도 "`@/lib/github`를 import하는 lib 파일"만 대상으로 한다. GitLab은 Octokit이 아니라 `fetch`로 쓰므로 등록만으로는 지나간다. GitLab 쪽에서 이 테스트가 지킬 경계는 다르다 — **Sync·Publish·야간 쓰기는 "그 프로젝트가 참조하는 연결"의 PAT만 쓰고, 호출자(요청한 사람)의 연결을 쓰지 않는다.** 호출자 연결로 쓰면 다른 사람의 프로젝트에 내 명의로 쓰게 된다. 완전성 검사의 기준(GitLab 클라이언트 모듈 import)과 fetch 기반 쓰기 패턴(비GET `fetch`)을 정의하고, 쓰기 경로가 호출자 세션에서 연결을 고르면 red로 만든다(tasks §2).

불변식 11의 세 층의 GitLab 대응: ① 토큰을 리포 하나로 좁히는 층은 **PAT에 없다**(사용자가 접근하는 모든 프로젝트에 쓸 수 있다) — 그래서 ② **모든 REST·GraphQL을 저장된 숫자 project id로만 주소하는 규칙**(이름·`fullPath` 주소 금지 — §3 "공통 경계")이 그 자리를 대신하고, 클라이언트 생성 때 `GET /projects/<id>`가 보관·object format을 확인하고 `path_with_namespace` 변경을 ③ 화면의 `repo-replaced` 재료로 넘긴다. ②를 깨면(이름으로 주소하면) 이름 재사용으로 남의 리포를 읽거나 쓴다. 불변식 11 정본 문장("쓰기 직전 project id 재대조가 필수 층" — D3·D13)은 이 규칙과 그 GET을 함께 가리킨다.

**PAT 수명**: GitLab 16.0부터 PAT는 만료일이 필수(기본 최대 1년, 인스턴스 설정에 따름)다. 만료일을 저장해 만료 임박을 미리 보인다(톤 표). 자동 회전은 비목표(spec §5).

**새 환경변수는 없다**(확정 — D6 스위치 없음) — PAT 방식은 앱 등록·client secret·callback이 없다. GitLab API 주소(`https://gitlab.com/api/v4`·`/api/graphql`)는 코드 상수다(GitLab.com 한정 — spec §5). 사용하지 않을 변수·SDK·키를 미리 추가하지 않는다.

**셀프 호스팅 유지보수 계약**(SELF-HOSTING §3 체크리스트 — 셀프 호스팅도 지원 범위다, spec §3):
- preflight(`lib/deployment/preflight.ts`): GitLab env는 없다. `GITHUB_APP_ID`·`GITHUB_APP_PRIVATE_KEY`·`GITHUB_APP_CLIENT_ID`·`GITHUB_APP_CLIENT_SECRET`·`GITHUB_APP_SLUG` 다섯을 `required`에서 `optional`로 내리고 **all-or-none 그룹 규칙**을 `preflight()`에 둔다(D4 — 로그인 공급자 쌍 규칙과 같은 자리·형, 반쪽은 기동 거부). 다섯이 없으면 GitHub 연결 경로가 서지 않는다 — ①은 탭 줄 없이 GitLab 단독, `/account`·설정의 GitHub 연결 카드·설치 링크를 그리지 않는다(D4a). `deploy/.env.example`·설치 가이드의 "required either way"를 같이 고친다(SH-15 ②).
- PAT를 봉하는 키는 **토큰 키**(`TOKEN_ENCRYPTION_KEYS`, D8)다. `credentials:{dev,prod,self-hosted}`의 `rotate-token`·`verify`·`oldTokenKey` 집계에 새 열(계정 GitLab 연결) 등록, 셀프 호스팅 운영 가이드의 키 회전·백업 절.
- PAT는 요청 본문(Server Action)으로만 오고 URL에 실리지 않는다 — nginx 접근 로그 마스킹(`deploy/nginx/`)에 새 경로는 없다. 이 전제가 깨지면(쿼리로 받는 경로가 생기면) 마스킹에 등록한다.
- 운영자 개인정보 재료(가이드)에 GitLab 전송처를 넣는다.

**새 진입점 없음**: PAT 입력·검증·교체·해제는 전부 Server Action이다(CLAUDE.md 데이터 변경 경로 — 내부 쓰기). OAuth callback·`ALLOWED_HOSTS`·state 서명 갈래가 생기지 않는다. 새 Action은 잠금이 필요하면 `locked-access`, 인가는 기존 `getProjectAccess`·`requireUser`를 지난다.

새 자격증명(PAT 봉투)·수집 정보(GitLab 사용자명·토큰 만료일)·GitLab 전송처를 개인정보 방침과 대조한다. GitLab 활성화 전에 `/privacy`의 영문·국문 본문, 해당 수집 목록, 필요한 개정 이력·시행일을 실제 구현에 맞춘다. 현재 방침은 미래 기능으로 고치지 않는다.

## 6. 불변식과 과거 장애

ARCHITECTURE §0·§2·§3·§5.5·§6.4·§6.5·§7 기준으로 다음을 보존한다.

- DB 값/리포 키 소유권과 strict 적재, base 파일의 키 집합 예외, orphan 보존은 그대로다. 리포 호스트 차이로 값 병합을 도입하지 않는다.
- 같은 DB·원본에서 바이트가 같다. blob hash는 commit id와 혼동하지 않고 로컬 `git hash-object` 및 원격 blob과 대조한다.
- 모든 DB 접근은 인가된 projectId/surfaceId로 좁히며 GitLab 역할을 Malmoi 멤버 역할로 승격하지 않는다.
- 리포 identity 검증은 읽기·쓰기·표시·승인 지문 모두에 적용한다(불변식 11의 세 층 — §5). 원격 호출을 DB 잠금 안으로 옮기지 않는다.
- 첫 외부 쓰기 전 전달 확인 무효화, 유효한 실행권/context 확인 후 성공 확정, 미전달 셀 토큰 보존을 양쪽 리포 호스트에서 검증한다.

[POSTMORTEM](../../POSTMORTEM.md)에서 인용할 회귀 근거:

| 사건 | 이 기능의 검증 |
|---|---|
| 2026-09-16 「같은 요청의 Promise.all이 토큰 회전을 둘로 겹쳤고…」 | refresh 방식 채택 시 동시 만료·회전 충돌을 실제 호출로 검증 |
| 2026-09-17 「번역 PR을 merge commit으로 머지하면 루프 마커가 사라져 push가 DB를 덮었다」 | GitLab 머지 방식(merge commit·squash·fast-forward)과 사용자 정의 커밋 메시지 템플릿별로 마커 보존을 실제 CI에서 검증 |
| 2026-09-19 「인가를 철회한 사용자가 잠시 뒤 다시에 갇혔고…」 | 철회와 일시 장애를 구분하고 도달 가능한 재연결 경로 제공 |
| 2026-09-27 「경로 안전만 검사해 경로가 옳은지를 안 봤고…」 | push 토큰 발급·회전·리포 연결의 실제 쓰기 권한과 출력 경로 검증 |
| 2026-10-07 「허용된 CI 경합이 재Publish 뒤 PR의 복구본까지 지울 수 있었다」 | CI/야간 사전 판정 뒤 Publish·no-changes 경합에서 revision 재검; 토큰/확인 원자성 유지 |
| 2026-10-07 「비동기 경계와 검증 트리거가 구현의 끝까지 닿지 않았다」 | 새 PG 테스트의 수집 설정과 실제 구현 경로의 gate-plan 트리거를 새 경로가 처음 생기는 커밋에서 함께 확인 |
| 2026-10-09 「self-hosted Publish의 stale 교체가 옛 실행을 멈추지 않았다」 | GitLab transport가 `execution.fetch()`를 지나고 자체 재시도 0 — 예산 만료 뒤 새 전송 0건, 5xx 뒤 MR POST 1회, 늦은 성공이 stale FAILED를 덮지 않음 |
| 2026-10-08 「결과 미확인의 톤과 PR 조회 실패 문구가 화면마다 갈렸다」 | MR 상태도 `canon.ts` `STATE` 한 경로, terminology 테스트 확장 |
| 2026-10-02 (EnvironmentTeardownError — 타이머 위생) | 화면 대기 마감 `GITHUB_WAIT_MS` 공유, 테스트는 `fast-github-wait.ts` |
| 2026-09-18 (인가 스캐너 `guard(`) | 새 Route Handler 등록, 호출을 지운 뮤테이션에서 red |

PRODUCT §2 포지셔닝·§1·§3·§4.1 문구, README와 ARCHITECTURE 불변식 6·11의 일반화는 **착수 전 결정**이다(spec §3·§6). 그 결정이 닫힌 뒤 정본 갱신은 구현과 함께 실제 동작에 맞춘다. 현재 정본 문서를 미래 기능으로 바꾸지 않는다.
