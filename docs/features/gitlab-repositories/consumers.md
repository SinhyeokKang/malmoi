# GitLab repositories — 소비자 전수 표

[design](./design.md) §1·§2의 0단계 산출물(tasks §0 넷째 항목). 기준 커밋 `5415cc0e`(2026-10-12). 표의 행은 **재개 시점 실측**이고, 구현 배치는 착수 때 같은 명령으로 다시 세어 이 표와 차이를 인계에 적는다.

## 1. `installationId`·`repositoryId` 소비자 (56행)

기준 명령: `rg -l -e installationId -e repositoryId app lib components scripts -g '!**/__tests__/**'` → **56파일**(`app` 7 · `lib` 48 · `scripts` 1 · `components` 0). 판정 셋:

- **경계 이관** — 커밋 A~C에서 리포 호스트 경계(design §3 "공통 경계")를 지나도록 옮긴다. "연결 증거" = GitHub `installationId` / GitLab 연결 참조(B1의 nullable 열).
- **GitHub 전용 유지** — GitHub App·사용자 연결·GitHub 구현체다. GitLab 짝은 새 파일로 두고 이 파일에 GitLab 분기를 넣지 않는다.
- **무관** — 주석만 이름을 언급한다.

| # | 파일 | 쓰임 | 판정 | 이관 메모 |
|---|---|---|---|---|
| 1 | `app/(edit)/layout.tsx` | 주석(RSC 페이로드 사고 기록) | 무관 | — |
| 2 | `app/(edit)/projects/[slug]/(home)/page.tsx` | select · `installationId` 있을 때만 연결 조회 | 경계 이관 | 연결 건강성을 호스트별로 부른다(GitLab = 연결 참조 + PAT probe) |
| 3 | `app/(edit)/projects/[slug]/settings/actions.ts` | `connectRepository`(GitHub probe → installationId·repositoryId 재기록) | GitHub 전용 유지 | GitLab 재연결은 B2의 새 Action(연결 참조 교체). `updateRepositorySettings`는 이 열을 안 읽는다. ⚠️ **B: `host !== "github"`이면 probe 전에 거부하고 UPDATE `where`에 `host: "github"`를 둔다** — slug만 받는 Action이라 화면에서 숨겨도 직접 호출된다. 가드가 없으면 GitLab 행이 GitHub 행(또는 `installationId`가 박힌 혼종)이 되는 길이 숫자 id 우연 일치라는 확률 방어 하나뿐이다 |
| 4 | `app/(edit)/projects/[slug]/settings/page.tsx` | Repository 카드 select · `storedConnection` 직접 호출(`:56`, `unpinned` 판정) | 경계 이관 | 호스트·연결 참조·만료일 select 추가 · `:56`은 `repoTargetOf(project).status === "unpinned"`로 |
| 5 | `app/(edit)/projects/actions.ts` | ① 온보딩(owner/repo → `checkRepoAccess`) · `runFirstIngest`(readiness + `openRepoReader`) | 경계 이관 | ① GitHub 갈래는 그대로, GitLab ①은 PAT Action 짝. `runFirstIngest`는 경계 reader |
| 6 | `app/api/pull/route.ts` | 야간 대상 select | 경계 이관 | 대상 선정이 연결 증거로 |
| 7 | `app/api/push/route.ts` | 열린 PR 게이트 입력 select | 경계 이관 | GitLab도 열린 MR 게이트를 받는다(D6a — 구버전엔 이 게이트가 없다) |
| 8 | `lib/github-connect/connect-plan.ts` | probe → installationId 계획 | GitHub 전용 유지 | — |
| 9 | `lib/github-connect/health.ts` | `storedConnection`·`planConnectionHealth` | GitHub 전용 유지 | GitLab 연결 건강성은 짝 순수 함수. `storedConnection`의 `installationId === null → not-connected`는 호스트 분기 **뒤**에서만 부른다 |
| 10 | `lib/github-connect/installed-repos.ts` | 설치별 리포 수 | GitHub 전용 유지 | — |
| 11 | `lib/github-connect/probe-memo.ts` | 메모 키 `[owner, name, installationId, repositoryId]` | 경계 이관 | 키 판정(§3): 호스트·연결 참조를 키에 넣는다 |
| 12 | `lib/github-connect/repository-id.ts` | `requirePinnedRepositoryId`(installation 토큰 좁히기) | GitHub 전용 유지 | GitLab의 대응은 "쓰기 직전 project id 재대조"(design §5) — 별도 함수 |
| 13 | `lib/github-connect/user.ts` | `listInstallationRepos` | GitHub 전용 유지 | — |
| 14 | `lib/github.ts` | GitHub 구현체 전부 | GitHub 전용 유지 | 경계의 GitHub 측 구현이 된다(design §3) |
| 15 | `lib/home/state.ts` | 주석 | 무관 | — |
| 16 | `lib/import/apply-plan.ts` | repository identity 타입 | 경계 이관 | identity에 호스트·연결 증거 |
| 17 | `lib/import/approval.ts` | 승인 지문용 identity select | 경계 이관 | 같다 |
| 18 | `lib/import/run.ts` | identity 비교(`unpinned`/`repo-replaced`) · readiness | 경계 이관 | 잠금 안 재검증 → `sameRepoTarget`(연결 포함) |
| 19 | `lib/inbox/load.ts` | readiness·열린 PR select | 경계 이관 | — |
| 20 | `lib/keys/delivery.ts` | `deliveryContextFingerprint` 입력 | 경계 이관 | ⚠️ GitHub 행 바이트 불변(design §2 지문 표) |
| 21 | `lib/keys/query.ts` | 목록·멤버십 select·통과 | 경계 이관 | select에 호스트·연결 참조 |
| 22 | `lib/keys/search.ts` | 주석 | 무관 | — |
| 23 | `lib/mcp/confirm.ts` | 샘플 확인값 context `installationId: string` 필수 | 경계 이관 | context를 연결 증거로 일반화 |
| 24 | `lib/mcp/tools/account.ts` | readiness select | 경계 이관 | — |
| 25 | `lib/mcp/tools/project.ts` | readiness select · `get_project` | 경계 이관 | 필드 호환 정책은 D2 배치 |
| 26 | `lib/nightly/run.ts` | reader·client 생성 · 잠금 안 재검증(`:150`) | 경계 이관 | `:150` → `sameRepoTarget`(재연결 감지) |
| 27 | `lib/onboarding-run/access.ts` | `checkRepoAccess`(호출자 리포 권한, `requirePush`) | 경계 이관 | GitLab = 그 호출자의 PAT access level(spec §4-1) |
| 28 | `lib/onboarding-run/add.ts` | identity 대조 · reader | 경계 이관 | 호출자 접근 대조 → `sameRepository`(host+id만). reader는 `repoTargetOf(project)`로 연다 |
| 29 | `lib/onboarding-run/branches.ts` | ① 브랜치·연결된 프로젝트 브랜치 | 경계 이관 | 읽기 권한 OWNER 허용 유지(#123) |
| 30 | `lib/onboarding-run/create.ts` | 생성 시 installationId·repositoryId 저장 | 경계 이관 | GitLab = 호스트·연결 참조 저장 |
| 31 | `lib/onboarding-run/detect.ts` | identity 대조 · reader | 경계 이관 | `sameRepository` · reader는 `repoTargetOf(project)` |
| 32 | `lib/onboarding-run/import.ts` | identity 대조 · reader | 경계 이관 | `:61` → `sameRepository` · `:65`의 "프로젝트 쪽 id로 연다"는 `repoTargetOf(project)`로 그대로 |
| 33 | `lib/onboarding-run/rotate-token.ts` | 쓰기 권한 확인 전 null 판정 | 경계 이관 | 쓰기 권한 요구 경로 |
| 34 | `lib/onboarding/confirm.ts` | 주석 | 무관 | — |
| 35 | `lib/onboarding/create-plan.ts` | GitHub probe → 생성 계획 | GitHub 전용 유지 | GitLab 생성 계획은 짝 |
| 36 | `lib/onboarding/readiness.ts` | `installationId === null → setup` | 경계 이관 | 연결 증거 = installationId 또는 GitLab 연결 참조 |
| 37 | `lib/onboarding/sample-confirmation.ts` | 확인값 스키마 | 경계 이관 | #23과 같은 일반화 |
| 38 | `lib/projects/list.ts` | `needs_reconnect` 축 | 경계 이관 | GitLab 연결 참조 null도 `needs_reconnect` |
| 39 | `lib/projects/open-pr-memo.ts` | 메모 키 | 경계 이관 | 키 판정(§3) |
| 40 | `lib/projects/open-pr.ts` | 열린 PR 조회 | 경계 이관 | 열린 MR(source/target project id 대조) |
| 41 | `lib/projects/ready.ts` | readiness select | 경계 이관 | — |
| 42 | `lib/projects/remote.ts` | 원격 신호 client | 경계 이관 | `installationId ?? ""` 폴백 제거 대상 |
| 43 | `lib/protection/fingerprint.ts` | `discardFingerprint` 입력 | 경계 이관 | 호스트 투입 가능(저장 안 함) |
| 44 | `lib/protection/plan.ts` | `openPrGateApplies` | 경계 이관 | GitLab도 게이트 적용 |
| 45 | `lib/publish/fingerprint.ts` | `publishFingerprint` 입력 | 경계 이관 | 같다 |
| 46 | `lib/publish/read.ts` | 미리보기 client | 경계 이관 | — |
| 47 | `lib/pull/load.ts` | select · 전달 문맥 | 경계 이관 | GitHub 바이트 불변 |
| 48 | `lib/pull/run.ts` | `not-installed` 분기 · Publish 쓰기 | 경계 이관 | 쓰기 단계가 경계 메서드로(design §3) |
| 49 | `lib/pull/targets.ts` | 준비된 대상 필터 | 경계 이관 | — |
| 50 | `lib/pull/trigger.ts` | client 생성 · `not-installed` | 경계 이관 | 코드 정책(§3) |
| 51 | `lib/sources/actions.ts` | `installed` → readiness | 경계 이관 | `installed`를 `connected`로 |
| 52 | `lib/sources/query.ts` | `installed` 플래그 | 경계 이관 | 같다 |
| 53 | `lib/surfaces/create.ts` | identity 대조(잠금 안) | 경계 이관 | `sameRepoTarget` |
| 54 | `lib/surfaces/remove.ts` | 열린 PR 조회 | 경계 이관 | — |
| 55 | `lib/translations/context.ts` | `deliveryContextFingerprint` | 경계 이관 | ⚠️ GitHub 바이트 불변 |
| 56 | `scripts/smoke-github.ts` | 실 API 스모크 | GitHub 전용 유지 | `smoke:gitlab` 짝(F 배치) |

집계: **경계 이관 43 · GitHub 전용 유지 9 · 무관 4 = 56**.

### 1.1 간접 소비자 — 필드명을 쓰지 않고 연결 판정을 부르는 파일

위 명령은 필드명이 문자 그대로 나오는 파일만 센다. 보조 명령 `rg -l -e storedConnection -e planConnectionHealth -e loadConnectionHealth app lib components scripts -g '!**/__tests__/**'` → 11파일 중 위 표에 **없는** 셋:

| 파일 | 쓰임 | 판정 | 이관 메모 |
|---|---|---|---|
| `app/(edit)/projects/[slug]/surfaces/[surfaceSlug]/translations/page.tsx` | `storedConnection(project)`(`:143`) + `loadConnectionHealth(project, { memo })`(`:146`) | 경계 이관 | `repoTargetOf(project)` 결과로 첫 렌더 판정, `loadConnectionHealth(result, { memo })`. select에 호스트·연결 참조(`lib/keys/query.ts` #21) |
| `components/translations/workspace/workspace.tsx` | 주석(`:84`) | 무관 | — |
| `components/settings/repository-form.tsx` | 주석(`:28`) | 무관 | — |

나머지 여덟(`home/page.tsx`·`settings/page.tsx`·`settings/actions.ts`·`lib/github.ts`·`lib/home/state.ts`·`lib/keys/query.ts`·`lib/github-connect/health.ts`·`lib/mcp/tools/project.ts`)은 위 표에 있다. `settings/page.tsx:56`의 `storedConnection` 직접 호출은 #4 비고. 합계 **경계 이관 44 · GitHub 전용 유지 9 · 무관 6 = 59**.

## 2. D6 전제 — 롤백된 구버전이 GitLab 행을 만날 때

전제 행: `installationId = null` · `repositoryId = <GitLab project id>` · `repoOwner/repoName = <namespace>/<path>` · 새 열(호스트·연결 참조)은 구버전 Prisma가 읽지 않는다. 경로 전수(위 표의 "무관" 외 52파일 기준):

| 경로 | 구버전 동작 | 판정 |
|---|---|---|
| readiness(`lib/onboarding/readiness.ts`) | `setup` | 안전 |
| 수동 Sync·Publish(`lib/pull/trigger.ts`·`run.ts`) | `not-installed`로 실패 기록 | 안전 |
| 야간(`lib/pull/targets.ts` → `lib/nightly/run.ts`) | readiness가 `ready` 아니라 대상 제외 | 안전 |
| Publish 미리보기(`lib/publish/read.ts` ← `load-preview.ts`) | "Repository unavailable" throw → `failed`로 접힘 | 안전(크래시 아님, GitHub 호출 0) |
| 열린 PR 표시·게이트(`lib/projects/open-pr.ts`) | `installationId === null → null` | 표시 안전 |
| 원격 신호(`lib/projects/remote.ts`) | 가드가 `NONE` | 안전 |
| 소스 추가·탐지·적재·브랜치·토큰 회전(`lib/onboarding-run/*`) | `repo-not-installed`·`unpinned`·`repo-replaced`(installationId 불일치) | 안전 |
| 재연결(`settings/actions.ts` `connectRepository`) | GitHub에 `<namespace>/<path>` probe(GET) → 저장된 GitLab id ≠ GitHub id → `repo-forbidden`. 하위 그룹(`a/b/c`)이면 probe가 `error` → `unavailable` | 안전(GitHub 읽기 1회, 쓰기 0). 숫자 id가 우연히 같고 같은 이름의 GitHub 리포가 설치돼 있으면 GitHub 프로젝트로 바뀐다 — 확률상 무시, 구버전 한정. 신버전은 호스트 가드(#3)로 닫는다 |
| MCP(`lib/mcp/tools/*`) | readiness `setup` · `not-ready` | 안전 |
| Home·목록·Inbox | `setup` 표시 | 안전 |
| **`/api/push`**(`app/api/push/route.ts`) | `openPrGateApplies` false → **열린 MR 게이트 없이 strict 적재**(미전달 편집·`publish-raced` 게이트는 유지) | ⚠️ **약화 — 열린 Malmoi MR이 있어도 base push가 리포 값으로 DB 번역을 덮는 쓰기**다(MR에 담긴 전달 끝난 번역이 DB에서 사라지고, 롤포워드 뒤 Publish가 그 MR을 덮인 값으로 다시 만든다). 지휘자 결정 D6a(수용 + 롤백 절차 문서화) |

결론: GitHub 쓰기 0, 크래시 0. 예외 하나(`/api/push`의 열린 MR 게이트 부재 — 열린 MR이 있어도 리포 값이 DB 번역을 덮는다)는 D6a로 수용했고 롤백 절차(롤백 전에 GitLab CI 중지 또는 `PUSH_TOKEN` 회전)가 막는다(design §4).

## 3. UI 표면 — 키 단위 (design §2 기준 명령)

기준 커밋 `5415cc0e`. 키 경로는 TS AST(ts-morph 번들 `ts`)로 `en` 객체 중첩을 따라 계산했고, **값(주석 제거 후)에 정규식이 걸린 잎만** 셌다. 여러 줄 값은 1키.

### 3.0 기준 명령 원시 결과

| 명령 | 결과 |
|---|---|
| `rg -n -i 'github\|pull request\|\bPRs?\b' messages/en.tsx \| wc -l` | **202** 줄 |
| `rg -l -i 'github' guide/en guide/ko guide/es \| sort` | **81** 파일 (en 27 · ko 27 · es 27 — 세 트리 동형) |
| `rg -l 'GithubIcon\|github\.com\|GitPullRequest' components app \| sort` | **54** 파일 (테스트 제외 24) |
| `rg -c -i '…' messages/ko.tsx messages/es.tsx` | ko **88** · es **109** |

guide 27개(언어별 동일 경로): `README` · `faq` · `account/{README,profile}` · `ai-agents/{README,browser,permissions,prompts}` · `reference/troubleshooting` · `self-hosting/{README,install,operate,troubleshooting}` · `setup/{README,allowed-actions,create-project,sources,workflow}` · `sync/{README,logs,merging,nightly,push}` · `translate/{README,edit,join,publish}`.

components/app 비테스트 24: `app/(edit)/projects/[slug]/(home)/page.tsx` · `app/(edit)/projects/[slug]/logs/page.tsx` · `app/fonts/geist/README.md` · `app/invite/[token]/page.tsx` · `app/oauth/authorize/page.tsx` · `app/page.tsx` · `app/signin/link/[challenge]/page.tsx` · `app/signin/page.tsx` · `components/account/github-section.tsx` · `components/account/login-methods.tsx` · `components/home/count-cards.tsx` · `components/landing/mockup/publish.tsx` · `components/logs/glyph.tsx` · `components/onboarding/connect-github.tsx` · `components/onboarding/steps/repo.tsx` · `components/projects/project-list.tsx` · `components/public-shell/header.tsx` · `components/public-shell/nav-drawer.tsx` · `components/publish-button.tsx` · `components/settings/repository-card.tsx` · `components/signin/brand-icons.tsx` · `components/sources/sources-screen.tsx` · `components/ui/button.tsx` · `components/ui/table.tsx`.

#### 202줄 → 136키 환산
- 202줄 중 **값에 걸린 줄**이 136키를 이룬다. 나머지는 JSDoc/`//` 주석 줄이다(한국어 주석 안의 `GitHub`·`PR` 등).
- 주석이 아닌데 키에 안 잡힌 줄 2개: `1166 home.meta.pr: (n) => \`#${n}\`` (키 **이름**만 PR, 값은 `#n`) · `1912 account.github: {` (네임스페이스 키 이름). 둘 다 아래 §3.3에서 다룬다.
- 주의: rg의 `\b`는 유니코드 경계라 `PR이` 같은 한국어 붙임 주석은 rg 202에 안 들어간다(JS 정규식으로는 214줄). 값은 영어라 키 집계에 영향 없음.

### 3.1 집계

**총 136키 / 20 네임스페이스.**

| 네임스페이스 | 키 수 | | 네임스페이스 | 키 수 |
|---|---|---|---|---|
| translations | 29 | | settings | 9 |
| publicDocs | 15 | | home | 7 |
| logs | 13 | | projects | 6 |
| newProject | 12 | | landing | 4 |
| mcp | 12 | | repositorySync | 4 |
| errors | 8 | | account · sources | 3 · 3 |
| changelog · seo · signIn · mcpConnector | 2 · 2 · 2 · 2 | | link · locales · members | 1 · 1 · 1 |

| 분류 | 키 수 |
|---|---|
| 문장 분기 | 61 |
| 문장 분기 † (공개/사용자 단위 표면 — 프로젝트 호스트 문맥이 없어 분기 불가, 양 호스트 병기로 문구 개정 대상) | 6 |
| 흐름 분기 | 35 |
| CI 안내 | 5 |
| URL | **0** (사전 값이 URL을 만들지 않는다 — URL은 전부 코드, §4) |
| 제외-말모이 자체 | 4 |
| 제외-로그인 공급자 | 11 |
| 고정 영어 표면 (mcp) | 12 |
| 고정 영어 표면 † (seo — 영어 고정 + 호스트 문맥 없음) | 2 |
| **합계** | **136** |

→ 호스트별 분기가 실제로 필요한 키 = 문장 분기 61 + 흐름 분기 35 + CI 안내 5 = **101**. 문구 개정(†) 8. mcp 12는 영어 고정이지만 GitHub 단언이 있어 **응답 문장도 호스트 분기가 필요**(사전 분기와 별개로 영어 한 벌 안에서).

### 3.2 네임스페이스별 키 표

#### repositorySync (4)

| key path | line | 분류 | 비고 |
|---|---|---|---|
| `repositorySync.openPr` | 157–158 | 문장 분기 | `#n` |
| `repositorySync.prChecking` | 165 | 문장 분기 |  |
| `repositorySync.prUnknown` | 170 | 문장 분기 |  |
| `repositorySync.errors.not-connected` | 241 | 흐름 분기 |  |

#### seo (2)

| key path | line | 분류 | 비고 |
|---|---|---|---|
| `seo.homeTitle` | 452 | 고정 영어 표면 † |  |
| `seo.ogImageAlt` | 458 | 고정 영어 표면 † |  |

#### signIn (2)

| key path | line | 분류 | 비고 |
|---|---|---|---|
| `signIn.github` | 475 | 제외-로그인 공급자 |  |
| `signIn.footer.github` | 479 | 제외-말모이 자체 |  |

#### landing (4)

| key path | line | 분류 | 비고 |
|---|---|---|---|
| `landing.shell.github` | 546 | 제외-말모이 자체 |  |
| `landing.hero.body` | 563 | 문장 분기 † |  |
| `landing.stage.captions.[4]` | 576 | 문장 분기 † |  |
| `landing.closing.body` | 582 | 문장 분기 † |  |

#### publicDocs (15)

| key path | line | 분류 | 비고 |
|---|---|---|---|
| `publicDocs.privacy.intro` | 706 | 문장 분기 † |  |
| `publicDocs.privacy.sections.[0].blocks.[1].table.rows.[0].[1]` | 722 | 제외-로그인 공급자 |  |
| `publicDocs.privacy.sections.[0].blocks.[1].table.rows.[2].[0]` | 731 | 제외-로그인 공급자 |  |
| `publicDocs.privacy.sections.[0].blocks.[1].table.rows.[2].[1]` | 732 | 제외-로그인 공급자 |  |
| `publicDocs.privacy.sections.[0].blocks.[1].table.rows.[3].[0]` | 736 | 흐름 분기 | GitHub 사용자 토큰 행 — PAT 저장 시 방침 개정(policy-gate) |
| `publicDocs.privacy.sections.[0].blocks.[1].table.rows.[3].[1]` | 737 | 흐름 분기 |  |
| `publicDocs.privacy.sections.[0].blocks.[1].table.rows.[3].[2]` | 738 | 흐름 분기 |  |
| `publicDocs.privacy.sections.[0].blocks.[1].table.rows.[4].[2]` | 743 | 제외-로그인 공급자 |  |
| `publicDocs.privacy.sections.[0].blocks.[2].p` | 789 | 제외-로그인 공급자 |  |
| `publicDocs.privacy.sections.[1].blocks.[0].ul.[7]` | 809 | 문장 분기 † |  |
| `publicDocs.privacy.sections.[3].blocks.[1].ul.[0]` | 853 | 흐름 분기 | 전송처 행 — GitLab 전송처 추가 |
| `publicDocs.privacy.sections.[3].blocks.[2].p` | 861 | 제외-로그인 공급자 |  |
| `publicDocs.privacy.sections.[4].blocks.[1].p` | 885 | 흐름 분기 | "GitHub and Google connections" |
| `publicDocs.privacy.sections.[5].blocks.[0].p` | 897 | 제외-로그인 공급자 |  |
| `publicDocs.privacy.sections.[5].blocks.[1].table.rows.[3].[2]` | 914 | 제외-로그인 공급자 |  |

#### changelog (2)

| key path | line | 분류 | 비고 |
|---|---|---|---|
| `changelog.releases` | 986 | 제외-말모이 자체 |  |
| `changelog.failed` | 991 | 제외-말모이 자체 |  |

#### home (7)

| key path | line | 분류 | 비고 |
|---|---|---|---|
| `home.cards.held.open-pr` | 1047 | 문장 분기 |  |
| `home.cards.held.pr-check-failed` | 1048 | 문장 분기 |  |
| `home.meta.pullRequest` | 1143 | 문장 분기 |  |
| `home.meta.prState` | 1144 | 문장 분기 |  |
| `home.meta.prCheckFailed` | 1145 | 문장 분기 |  |
| `home.banner.notConnected.body` | 1198 | 흐름 분기 |  |
| `home.banner.wrongRepository.body` | 1214 | 문장 분기 | "Check it on GitHub" |

#### logs (13)

| key path | line | 분류 | 비고 |
|---|---|---|---|
| `logs.deferReasons.open-pr` | 1370 | 문장 분기 |  |
| `logs.deferReasons.pr-check-failed` | 1371 | 문장 분기 |  |
| `logs.meta.noPullRequest` | 1419 | 문장 분기 |  |
| `logs.sentence.publish.running` | 1448 | 문장 분기 | "to GitHub" |
| `logs.sentence.publish.sent` | 1449 | 문장 분기 | "to GitHub" |
| `logs.sentence.import.held.open-pr` | 1472 | 문장 분기 |  |
| `logs.sentence.import.held.pr-check-failed` | 1473 | 문장 분기 |  |
| `logs.detail.labels.pullRequest` | 1521 | 문장 분기 |  |
| `logs.detail.labels.closedPullRequest` | 1532 | 문장 분기 |  |
| `logs.detail.actions.openRepository` | 1544 | 문장 분기 | +URL logs/page.tsx:213 |
| `logs.detail.notes.publish` | 1552 | 문장 분기 |  |
| `logs.reasons.github-error` | 1610 | 문장 분기 | 사유 코드명도 github |
| `logs.refusals.surface-removed` | 1627 | CI 안내 |  |

#### projects (6)

| key path | line | 분류 | 비고 |
|---|---|---|---|
| `projects.empty.description` | 1729 | 문장 분기 |  |
| `projects.summary.newFromGithub` | 1742 | 문장 분기 | 키 이름에 Github |
| `projects.meter.note.setup` | 1782 | 흐름 분기 |  |
| `projects.banner.prOpen` | 1802 | 문장 분기 | `#n` — GitLab MR은 `!n` |
| `projects.banner.prCheckFailed` | 1807 | 문장 분기 |  |
| `projects.banner.action.viewPr` | 1828 | 문장 분기 | PR url (lib/projects/pr-url.ts가 github.com origin만 통과) |

#### account (3)

| key path | line | 분류 | 비고 |
|---|---|---|---|
| `account.github.title` | 1930 | 흐름 분기 |  |
| `account.github.rowName` | 1986 | 흐름 분기 | 값 "GitHub" — App 연결 행 이름(github-section.tsx:73) |
| `account.github.confirmDisconnect` | 1993 | 흐름 분기 |  |

#### mcpConnector (2)

| key path | line | 분류 | 비고 |
|---|---|---|---|
| `mcpConnector.grants.translation:write.hint` | 2121 | 문장 분기 † | "publish PRs" — 토큰 단위라 프로젝트 문맥 없음 |
| `mcpConnector.grants.project:create.hint` | 2125 | 흐름 분기 | "List your GitHub repositories" |

#### newProject (12)

| key path | line | 분류 | 비고 |
|---|---|---|---|
| `newProject.steps.result.description` | 2287 | 문장 분기 |  |
| `newProject.empty.connect.action` | 2298 | 흐름 분기 |  |
| `newProject.empty.connect.reauthorize` | 2299 | 흐름 분기 |  |
| `newProject.empty.install.description` | 2303 | 흐름 분기 |  |
| `newProject.empty.install.action` | 2304 | 흐름 분기 |  |
| `newProject.empty.repos.description` | 2311 | 흐름 분기 |  |
| `newProject.empty.waiting.description` | 2320 | 흐름 분기 |  |
| `newProject.empty.reconnect.title` | 2338 | 흐름 분기 |  |
| `newProject.empty.reconnect.description` | 2339 | 흐름 분기 |  |
| `newProject.empty.noLink` | 2342 | 흐름 분기 |  |
| `newProject.repo.loading` | 2360 | 흐름 분기 |  |
| `newProject.naming.hint` | 2455–2460 | 문장 분기 | "pull request on {branch}" |

#### translations (29)

| key path | line | 분류 | 비고 |
|---|---|---|---|
| `translations.workspace.filters.state.new` | 2550 | 문장 분기 | "New from GitHub" |
| `translations.banner.basePending` | 2713–2716 | CI 안내 |  |
| `translations.publish.viewLink` | 2746 | 문장 분기 |  |
| `translations.publish.previewIntro` | 2752–2753 | 문장 분기 |  |
| `translations.publish.previewIntroPartial` | 2755–2756 | 문장 분기 |  |
| `translations.publish.same.closesTitle` | 2763 | 문장 분기 | `#n` |
| `translations.publish.same.closeAction` | 2766 | 문장 분기 | `#n` |
| `translations.publish.same.nothingBody` | 2768 | 문장 분기 |  |
| `translations.publish.nothingSendable.body` | 2774 | 문장 분기 |  |
| `translations.publish.otherFile.body` | 2787 | 문장 분기 |  |
| `translations.publish.prOpen.body` | 2836–2842 | 문장 분기 | `#n` |
| `translations.publish.prNone.title` | 2845 | 문장 분기 |  |
| `translations.publish.prUnknown.title` | 2852 | 문장 분기 |  |
| `translations.publish.openPr` | 2855 | 문장 분기 |  |
| `translations.publish.replacePr` | 2856 | 문장 분기 | `#n` |
| `translations.publish.progressDescription` | 2864 | 문장 분기 |  |
| `translations.publish.progress` | 2865–2869 | 문장 분기 |  |
| `translations.publish.createdDescription` | 2874–2875 | 문장 분기 |  |
| `translations.publish.prMeta` | 2876–2877 | 문장 분기 | `#n` |
| `translations.publish.accessNote` | 2882 | 문장 분기 |  |
| `translations.publish.updated` | 2885 | 문장 분기 |  |
| `translations.publish.replacedBody` | 2889–2895 | 문장 분기 |  |
| `translations.publish.noChangesDescription` | 2902 | 문장 분기 |  |
| `translations.publish.closedPr.description` | 2927 | 문장 분기 |  |
| `translations.publish.closedPr.line` | 2928 | 문장 분기 | `#n` |
| `translations.publish.transientError` | 2965 | 문장 분기 | "GitHub didn't answer" |
| `translations.publish.transientErrorDescription` | 2967 | 문장 분기 | "request to GitHub" |
| `translations.publish.tooSoonBody` | 3035 | 문장 분기 |  |
| `translations.publish.previewFailedBody` | 3043–3044 | 문장 분기 |  |

#### sources (3)

| key path | line | 분류 | 비고 |
|---|---|---|---|
| `sources.removal.openPr` | 3110 | 문장 분기 |  |
| `sources.removal.prUnknown` | 3112 | 문장 분기 |  |
| `sources.removal.workflowLine` | 3114 | CI 안내 |  |

#### locales (1)

| key path | line | 분류 | 비고 |
|---|---|---|---|
| `locales.field.help` | 3200 | CI 안내 |  |

#### members (1)

| key path | line | 분류 | 비고 |
|---|---|---|---|
| `members.invite.description` | 3319 | 제외-로그인 공급자 | "for GitHub, their primary email" |

#### settings (9)

| key path | line | 분류 | 비고 |
|---|---|---|---|
| `settings.sources.rerun` | 3450 | CI 안내 |  |
| `settings.recovery` | 3481 | 흐름 분기 | "Manage your GitHub authorization in Account" |
| `settings.installed` | 3483 | 흐름 분기 |  |
| `settings.openRepo` | 3484 | 문장 분기 | +URL repository-card.tsx:82 |
| `settings.repository.health.repo-replaced` | 3507 | 문장 분기 | "Check it on GitHub" |
| `settings.repository.fields.branchHelp` | 3523 | 문장 분기 |  |
| `settings.account.connect` | 3588 | 흐름 분기 |  |
| `settings.account.reconnect` | 3589 | 흐름 분기 |  |
| `settings.account.disconnectLabel` | 3598 | 흐름 분기 |  |

#### link (1)

| key path | line | 분류 | 비고 |
|---|---|---|---|
| `link.providers.github` | 3653 | 제외-로그인 공급자 |  |

#### mcp (12)

전부 **고정 영어 표면** (MCP 응답, `import { en }`): `tools.whoami`:3724 · `tools.get_project`:3726 · `tools.list_repositories`:3727 · `tools.preview_publish`:3732 · `tools.preview_source_removal`:3735 · `tools.get_workflow`:3737 · `tools.publish`:3743 · `summary.publishPreview`:3774 · `summary.published`:3775 · `needsBrowser.not-connected`:3819 · `needsBrowser.reauthorize`:3820 · `needsBrowser.no-installations`:3821

#### errors (8)

| key path | line | 분류 | 비고 |
|---|---|---|---|
| `errors.connect.denied` | 3947 | 흐름 분기 |  |
| `errors.connect.exchange-failed` | 3948 | 흐름 분기 |  |
| `errors.connect.taken-by-other` | 3950 | 흐름 분기 |  |
| `errors.connect.not-connected` | 3951 | 흐름 분기 |  |
| `errors.connect.reauthorize` | 3952 | 흐름 분기 |  |
| `errors.connect.fallback` | 3960 | 흐름 분기 |  |
| `errors.onboarding.no-installations` | 3970 | 흐름 분기 |  |
| `errors.onboarding.no-repos` | 3971 | 흐름 분기 |  |


† = 프로젝트 호스트 문맥이 없는 표면(랜딩·SEO·방침·MCP 커넥터 grant 힌트). 사전에 호스트별 문장을 두어도 고를 근거가 없으니 "GitHub or GitLab" 꼴의 문구 개정이 맞다.

### 3.3 "놓치면 안 되는 자리" 대조

| 자리 | 상태 | 실제 위치 |
|---|---|---|
| translations Publish 모달 | 있음 | `translations.publish.*` 27키, en.tsx 2746–3044 (§3.2 translations) |
| key status filter "New from GitHub" | 있음 | `translations.workspace.filters.state.new` 2550 |
| base-locale 배너 "GitHub Actions workflow" | 있음 | `translations.banner.basePending` 2713–2716 |
| summary.newFromGithub | 있음 | `projects.summary.newFromGithub` 1742 · `components/home/count-cards.tsx:26`(키 `newFromGithub`)·`:29` `GitPullRequestArrow`·`:149` |
| home.meta.pullRequest / prState / prCheckFailed | 있음 | 1143 / 1144 / 1145. ⚠️ 형제 `home.meta.pr` 1166 = `` `#${n}` `` — 값엔 정규식이 안 걸리지만 **GitLab MR 참조는 `!n`** 이라 분기 필요 |
| components/home/meta-column.tsx | 있음 | `:201` case `pullRequest`, `:212–218` `prState`/`LatePrState`/`StatusBadge prOpen·prCheckFailed`. repo 링크 URL은 `lib/home/meta.ts:187` + `(home)/page.tsx:392` |
| components/home/hold-later.tsx | 있음 | GitHub 리터럴 없음 — `m.home.cards.held`(→ `held.open-pr` 1047 · `held.pr-check-failed` 1048) 소비 |
| components/home/sync-result.tsx | 있음 | `m.repositorySync.errors`(→ `not-connected` 241) + `connectErrorMessage`(→ `errors.connect.*`). `:20` 주석이 "use Authorize GitHub App below" 언급 |
| logs "Open on GitHub" | 있음 | `logs.detail.actions.openRepository` 1544 (URL: `logs/page.tsx:213`) |
| logs "sent translations to GitHub" | 있음 | `logs.sentence.publish.sent` 1449 (+ `running` 1448) |
| logs pr-check-failed | 있음 | `logs.deferReasons.pr-check-failed` 1371 · `logs.sentence.import.held.pr-check-failed` 1473 |
| settings "The GitHub App is installed…" | 있음 | `settings.installed` 3483 |
| settings "Authorize GitHub App" | 있음 | `settings.account.connect` 3588 (`newProject.empty.connect.action` 2298과 같은 문구) |
| components/settings/repository-card.tsx GithubIcon | 있음 | `:5` import · `:79` IconTile 안 GithubIcon · `:82` `https://github.com/${owner}/${repo}` + `m.settings.openRepo` · `:14` `installationSettingsUrl` |
| components/account/github-section.tsx | 있음 | `:12` GithubIcon import · `:72` 렌더 · `:60–103` `m.account.github.*`·`m.settings.account.connect/reconnect` |
| components/github-account.tsx | 있음 | `:46` `account.github.confirmDisconnect` · `:47` `confirmHint` · `:61` `disconnectGithub()` |
| components/reconnect-button.tsx | 있음 | GitHub 리터럴 없음 — `:12` `connectErrorMessage`(→ `errors.connect.*`) · `m.settings.repository.connectFailed` |
| errors (connect/onboarding) | 있음 | `errors.connect.*` 6키 3947–3960 · `errors.onboarding.no-installations/no-repos` 3970/3971 |
| components/onboarding/connect-github.tsx | 있음 | `:7` import · `:59` GithubIcon · `:99` `startGithubConnectForUser` |
| components/onboarding/steps/repo.tsx | 있음 | `:491`·`:532`·`:537` GithubIcon · `:477–538` `newProject.empty.*` 분기 |
| components/onboarding/workflow-block.tsx | 있음 | `:5` `WORKFLOW_PATH = ".github/workflows/malmoi-i18n.yml"` (사전 밖 상수 — CI 안내) |
| projects 띠 "Open on GitHub" | 있음 | `projects.banner.action.viewPr` 1828 (project-list.tsx:425) |
| projects "Connect the GitHub App" | 있음 | `projects.meter.note.setup` 1782 (같은 문구 `home.banner.notConnected.body` 1198) |
| components/projects/project-list.tsx GithubIcon | 있음 | `:281` GithubIcon · `:375–376` GitPullRequest(Arrow) · `:432` github.com `compare` URL · `:349–350` `banner.prOpen/prCheckFailed` |
| sources workflowLine | 있음 | `sources.removal.workflowLine` 3114 |
| sources prUnknown | 있음 | `sources.removal.prUnknown` 3112 (+ `openPr` 3110). 동명 `repositorySync.prUnknown` 170도 있음 |
| components/sources/remove-source-dialog.tsx | 있음 | `:135`·`:150` workflowLine · `:149` prUnknown |
| components/sources/add-sources-modal.tsx | 있음 | `:6`·`:166` `startGithubConnect` · `:168` `newProject.empty.connect.action/reauthorize` |
| mcp 응답 문자열 | 있음 | `mcp.*` 12키 3724–3821 (§3.2) |
| lib/status/canon.ts prOpen/prCheckFailed | 있음 | `:25` union · `:42–43` tone · `:80` `prOpen → m.translations.publish.prState`(값 `"Open"` 2880, 정규식 밖) · `:81` `prCheckFailed → m.home.meta.prCheckFailed` |
| repositorySync.not-connected | 있음 | `repositorySync.errors.not-connected` 241 |
| locales.help | 있음 | `locales.field.help` 3200 (경로는 `field.help`) |
| mcpConnector project:create | 있음 | `mcpConnector.grants.project:create.hint` 2125 |
| components/settings/ci-card.tsx | 있음 | GitHub 리터럴 없음 — `m.settings.ci.*`(3477–3479) · `m.settings.workflow.hookDoc/hookHint`. 정규식 밖 CI 안내 후보(§3.5) |
| components/shell/attention-inbox.tsx | 있음 | 파일 안 GitHub 문자열 없음(`:34` 주석만). 행 문장은 `lib/home/attention-view.ts` → `projects.banner.setup/unsent`·`home.attention.*`(정규식 밖), 글리프 `GitPullRequestArrow` `attention-view.ts:17` |
| GitPullRequest* 글리프 사용처 | 있음 | 비테스트 6: `components/home/count-cards.tsx:29` · `components/landing/mockup/publish.tsx:164` · `components/logs/glyph.tsx:44` · `components/projects/project-list.tsx:375–376` · `components/publish-button.tsx:219` · `lib/home/attention-view.ts:17` |
| lib/invitation-email/template.ts "sends it back to GitHub" | 있음 | `:74` **사전 밖 하드코딩 영어**(초대 메일 = 영어 고정 표면). 사전 키가 아님 |
| landing / seo / publicDocs | 있음 | landing 4 (546–582) · seo 2 (452/458) · publicDocs 15 (706–914, privacy 방침). ⚠️ ko 방침 본문은 `messages/ko-privacy.tsx`에 따로 있다 |

전부 존재. 경로 드리프트: `summary.newFromGithub` → 실제 `projects.summary.newFromGithub`, `locales.help` → `locales.field.help`, `repositorySync.not-connected` → `repositorySync.errors.not-connected`.

### 3.4 새로 찾은 표면 (위 목록에 없음)

**정규식이 걸린 키 중 목록 밖:**
- repositorySync: `openPr` 157 (`#n`), `prChecking` 165, `prUnknown` 170
- home: `banner.wrongRepository.body` 1214 ("Check it on GitHub")
- logs: `deferReasons.open-pr` 1370 · `meta.noPullRequest` 1419 · `sentence.publish.running` 1448 · `sentence.import.held.open-pr` 1472 · `detail.labels.pullRequest` 1521 · `detail.labels.closedPullRequest` 1532 · `detail.notes.publish` 1552 · `reasons.github-error` 1610 · `refusals.surface-removed` 1627 (CI 안내 — "GitHub workflow")
- projects: `empty.description` 1729 · `banner.prOpen` 1802 (`#n`, "merge it") · `banner.prCheckFailed` 1807
- account: `github.title` 1930 · `github.rowName` 1986 · `github.confirmDisconnect` 1993 (네임스페이스 `account.github` 자체가 GitHub 이름)
- mcpConnector: `grants.translation:write.hint` 2121 ("publish PRs")
- newProject: `steps.result.description` 2287 · `empty.*` 8키(2299–2342, `connect.action` 2298 제외) · `repo.loading` 2360 · `naming.hint` 2455
- settings: `sources.rerun` 3450 · `recovery` 3481 · `repository.health.repo-replaced` 3507 · `repository.fields.branchHelp` 3523 · `account.reconnect` 3589 · `account.disconnectLabel` 3598
- members: `invite.description` 3319 ("for GitHub, their primary email" — 로그인 공급자)
- link: `providers.github` 3653 (로그인 공급자)
- signIn: `github` 475 (공급자) · `footer.github` 479 (말모이 리포 링크, `lib/links.ts:39`)
- changelog: `releases` 986 · `failed` 991 (말모이 Releases)

**사전 밖 코드 표면 (분기 대상, 목록 밖):**
- `lib/keys/view.ts:68` — 코드 참조 링크 `https://github.com/{owner}/{repo}/blob/{sha}/{path}#L{line}` (GitLab은 `/-/blob/…#L`)
- `lib/home/meta.ts:187` · `app/(edit)/projects/[slug]/(home)/page.tsx:392` · `…/logs/page.tsx:213` — repo URL 조립
- `lib/projects/pr-url.ts:6` — PR URL이 `https://github.com` origin이 아니면 버린다(GitLab MR URL이 조용히 사라짐)
- `lib/github-connect/installation-url.ts:15` — App 설치 URL
- `lib/security-headers.ts:93` — CSP `form-action`에 `https://github.com`만 (GitLab OAuth/폼 이동 시 추가 필요 여부 확인)
- `components/sources/sources-screen.tsx:92` — 리포 이름 앞 GithubIcon
- `components/landing/mockup/publish.tsx:164`, `components/publish-button.tsx:219` — GitPullRequestArrow
- 말모이 자체(제외): `lib/links.ts:12–20` GITHUB_REPO/Releases · `app/page.tsx:86`·`components/public-shell/header.tsx:84`·`nav-drawer.tsx` GithubIcon. 로그인 공급자(제외): `app/signin/*`·`app/invite/[token]/page.tsx`·`app/oauth/authorize/page.tsx`·`components/account/login-methods.tsx` GithubIcon

**`#n` 참조 표기 (GitLab MR은 `!n`)**: `home.meta.pr` 1166 · `repositorySync.openPr` · `projects.banner.prOpen` · `translations.publish.same.closesTitle/closesBody/closeAction` 2763–2766 · `prOpen.body` · `replacePr` · `prMeta` · `closedPr.line`. 낱말만이 아니라 번호 접두도 분기 대상.

### 3.5 정규식 밖이지만 GitHub 전제 문구 (참고, 36키)

정규식(`github|pull request|PR`)에 안 걸려 키 집계 136에 **없다**. GitLab에서 거짓이 되거나 다르게 읽힐 수 있는 것만:
- **GitHub Actions/gh 전제(CI 안내)**: `newProject.result.token.description` 2515 ("repository's **Actions secret**") · `mcp.tools.rotate_push_token` 3749 · `mcp.summary.pushToken` 3787 · `mcp.summary.created` 3794 (셋 다 `gh secret set PUSH_TOKEN --repo OWNER/REPO`) · `mcp.summary.workflow` 3766 · `settings.token.description` 3544 · `settings.token.confirmBody` 3562
- **App 설치 전제(흐름 분기)**: `account.github.hintNotConnected` 1943 · `account.github.installedOn` 1977 · `account.github.installationSettings` 1984 · `settings.repository.health.not-connected/installation-changed/install/installHint` 3501–3510 · `errors.connect.repo-not-installed/installation-forbidden` 3953–3954 · `logs.reasons.not-installed` 1608 · `logs.refusals.not-installed` 1625 · `settings.repository.health.app-uninstalled` 3502
- **workflow/CI 일반어(호스트 중립일 수 있음)**: `home.meta.ci` 1129 · `logs.trigger.ci` 1597 · `logs.meta.runType.*.ci` 1414–1415 · `logs.deferReasons.too-large` 1377 · `newProject.result.ingest.refsHint` 2525 · `sources.removal.workflowStep` 3122 · `sources.firstImport/pendingHelp/notImportedHelp/workflow` 3146–3178 · `settings.ci.*` 6키 3477–3479 · `settings.workflow.hookDoc` 3579 · `mcp.summary.sourcesAdded/sourceRemoved` 3796/3803 · `mcp.tools.create_project` 3740
- **merge 낱말**: `translations.publish.same.closesBody` 2764 ("nothing left to merge", `#n`) · `projects.banner.prOpen`("merge it")는 이미 집계

### 3.6 ko·es

`rg -c` 결과 ko **88**줄 · es **109**줄 (en 202). ko·es는 en과 `satisfies Messages`로 키가 묶여 있으므로 키 집합은 en의 136과 같다 — 줄 수 차이는 주석 양(en에 한국어 JSDoc이 몰려 있음)과 번역 문장의 줄 배치 차이다. ko는 `PR`이 한글 조사에 붙어(`PR이`) rg 유니코드 `\b`에 안 걸리는 줄이 있어 과소 집계될 수 있다.
