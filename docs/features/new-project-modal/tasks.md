# tasks — 새 프로젝트 온보딩 모달

**디자인 SoT는 spec.md §0**(`design_handoff_new_project_modal/`)이다. 각 단계 UI를 짜기 전에
`DesignSync`로 `README.md`의 해당 절과 `New Project.dc.html`의 해당 아트보드를 **한 번씩 다시 본다** —
이 문서의 수치는 그것의 사본이라 갈릴 수 있다.

**순서는 순수 함수 → 껍데기(Action) → UI다.** 역순은 테스트 못 하는 코드를 먼저 쌓는 것이다.
각 태스크에 **검증 한 줄**이 붙는다. `⏹` 표시가 커밋 경계다(`/ship`이 이 분리를 지킨다).

⚠️ **모든 태스크가 TDD다.** 검증 줄의 "green"은 **"구현 전에 그 단언이 red였다"**를 전제로 한다 —
신규 인터페이스(순수 함수 넷 · Action 둘 · `listBranches` · 모달 껍데기 · 프리미티브 셋)가 전부
그 대상이다. 무엇이 red였는지를 적지 않은 "green"은 판정이 아니다(POSTMORTEM 2026-09-10:
`pnpm test`가 2553 green인데 단언 하나가 거짓이었고, 그 스위트는 애초에 안 돌아갔다).

## T0. 확정된 결정 (완료)

| # | 결정 |
|---|---|
| ① 브랜치 선택 | `Select` + 신규 `listRepoBranches` |
| ② 주소 중복 | **제출 시(`createProject`)** — `checkSlug`를 기각했다. 형식은 `planSlug`를 클라이언트가 직접 부른다 |
| ③ 샘플 줄 수 | **10행**, 키 행만 스크롤 |
| ④ 세그먼트 언어 | 후보의 **전 언어** + lazy load(`loadCandidateSample`) |
| ⑤ ①의 [Back] | **안 그린다**(`showBack=false`) |
| ⑥ `Select` 옵션 키 수 | **받은 언어만**. multi-locale은 처음부터 전부 |
| ⑦ ③의 `Most keys`·키 수 비교 | **아는 언어에만** 단다 |
| ⑧ 껍데기 폭 | **960** (좌측 240 · 표 `1fr 2fr`) |
| ⑨ 모달 껍데기 | **Radix `Dialog.*` 직접 조립** — `components/ui/dialog.tsx`를 안 쓴다 |
| ⑩ 적재 생존 | **보장하지 않고 문구로 말한다** |

**남은 사람 판단 하나**: `New Project.dc.html`의 아트보드 열세 개(각 단의 오른쪽 열이 결정과 근거다)를
구현 직전에 한 번 훑고, 이 문서와 어긋나는 수치가 있으면 **아트보드 쪽으로** 맞춘다.
⚠️ **예외 셋은 이 문서가 이긴다**(검수에서 뒤집힌 값들): 폭 960 · 좌측 240 · 높이 규격(design §8).

---

## T1. 순수 함수 — 샘플·키 수 ⏹

- `lib/onboarding/__tests__/detect.test.ts`에 red를 먼저 박는다: `sampleRows`(순서 보존 · 상한 10 ·
  읽기 실패 시 `[]`) · `keyGap`(차이 0이면 `undefined`).
- `summarizeCandidates`가 `samples: LocaleSample[]`를 싣는다. **추가 blob이 0인지**를 `probeTargets`의
  결과와 대조하는 단언을 함께 박는다.
- **multi-locale(ts-dict)이 전 언어를 드는지**를 별도 케이스로 고정한다 — 한 파일이라 공짜인 것이
  §3.3·⑥의 전제다.

- ⚠️ **`adapter.read` 호출 수 상한**도 함께 박는다. "추가 blob 0"은 **다운로드**만 재는데,
  `summarizeCandidates`가 기준 로케일 하나 → 셋으로 늘면 **파싱이 후보당 1→3배**다(`ts-dict`면
  ts-morph가 그만큼). `PROBE_LIMITS` 주석이 *"비용이 아니라 응답 시간 — `maxDuration`이 60초"*라고
  적는다.
- ⚠️ **`pathTemplate`·`adapter`·`baseLocale`의 산출 규칙을 손대지 않는다.** 그 셋이 "어느 파일에
  쓰느냐"를 정하므로, 건드리면 `/l10n-roundtrip` 제외 판정의 전제가 깨진다.

**검증**: `pnpm test lib/onboarding` green — **구현 전에 red였던 단언**: `sampleRows`의 순서·상한·
실패, `keyGap`의 0 → `undefined`, `samples`의 blob 수, `read` 호출 수. `PROBE_LIMITS`가 한 줄도
안 바뀌었다.

## T2. 순수 함수 — 브랜치·slug·게이트 ⏹

- `lib/onboarding/branch.ts`의 `planBranchChoice`.
- `lib/onboarding/slug.ts`에 `suggestAlternateSlug` — **존재 확인 없음**, `planSlug` 통과값만.
- **`lib/onboarding/next-enabled.ts`**의 `nextEnabled(step, state)` — design.md §4 표를 코드로.
  ⚠️ **`lib/` 아래 잎에 둔다**(`components/` 아래면 `"use client"` 그래프에 들어간다).
- ⚠️ **`relativeTime`을 만들지 않는다 — `lib/relative-time.ts`에 이미 있다.**
  `(then: Date, now: Date)`이고 `now`를 인자로 받는 이유까지 그 파일 주석이 적고 있으며 소비자가
  다섯이다. `pushedAt`(ISO)을 `new Date(...)`로 감싸 그 함수에 넘기고, **`now`는 서버 페이지가
  한 번 만들어 내려보낸다**(클라이언트에서 만들면 그 주석이 경고하는 hydration 어긋남이다).

**검증**: `pnpm test lib/onboarding` green — **구현 전에 red였던 단언**: `planBranchChoice`의
`Select`/`Input` 갈래와 기본 선택, `suggestAlternateSlug`가 `planSlug`를 통과하는 값만 낸다,
`nextEnabled`가 §4 표의 각 행을 재현한다. 각 함수에 실패 케이스가 하나 이상 있다.
`grep -rn "lib/format/relative-time" .` 이 0건이다(중복 모듈을 안 만들었다).

## T3. GitHub 껍데기 — 브랜치 목록 + 리포 메타 ⏹

- `lib/github.ts`에 `listBranches(owner, repo, installationId)` — `per_page=100`, 최대 3페이지,
  `truncated`를 값으로. `createApp()`을 **한 번만** 부른다. 실패는 값(`unavailable`), 단
  `MissingEnvError`는 **던진다**(설정 오류를 "잠시 뒤 다시"로 위장하지 않는다).
- ⚠️ **슬래시 브랜치(`release/2.0`)를 octokit에 맨값으로 넘긴다** — 인코딩을 이중으로 하지 않는다
  (POSTMORTEM 2026-09-01).
- `lib/github-connect/user.ts`의 `listInstallationRepos`를 `{ fullName, pushedAt }`로 넓힌다 —
  엔드포인트는 **`GET /user/installations/{installation_id}/repositories`**(user-to-server, `paginate`)
  이고 응답에 `pushed_at`이 이미 있다(**추가 호출 0**).
- ⚠️ **중복 제거와 정렬을 함께 고친다.** 지금은 `[...new Set(names)].sort()`인데 **객체가 되면 기본
  `.sort()`가 전부 `"[object Object]"`로 비교해 정렬이 조용히 사라진다**(`tsc`가 못 본다).
  `fullName` 키로 접고 **`fullName` 오름차순 명시 비교자**를 준다.
- `RepoOption`을 `lib/onboarding/types.ts`로 내린다(§5가 `new-project-flow.tsx`를 쪼갠다).

**검증**: **`lib/__tests__/github-branches.test.ts`**(⚠️ `onboarding.test.ts`가 **아니다** — 층을
맞춰야 T3이 T4 없이 단독으로 green하게 끊긴다. 선례: `lib/__tests__/github-probe.test.ts`)에
octokit mock — **구현 전에 red였던 단언**: 두 페이지를 이어 붙인다 · 3페이지에서 끊고 `truncated: true`
· 실패가 `unavailable` 값이고 `MissingEnvError`만 던진다 · **`release/2.0`이 이중 인코딩 없이 나간다**.
`listConnectableRepos`가 `pushedAt`을 실어 주고, 같은 리포가 두 설치에 있어도 한 번만 나오며
**이름순으로 정렬돼 있다**.

## T4. Server Action 둘 ⏹

- `listRepoBranches` — `requireUser` → `checkRepoAccess` → `listBranches`. `defaultBranch`는
  `checkRepoAccess`가 이미 준 값(GitHub 재호출 없음).
- `loadCandidateSample` — `requireUser` → `checkRepoAccess` → **`isValidBranchName(ref)`** →
  `snapshot(ref)` → **`planConfirmedFormat`** + **`isPathSafeLocale(locale)`** → 트리와 교차 →
  `readFiles`(≤1) → `sampleRows`.
  ⚠️ **불변식 10이 걸리는 자리다**(design §3.4). **`templatePaths`로 대신하지 않는다** — 그건
  `planConfirmedFormat`이 내부에서 부르는 **탐지 헬퍼**이고, 탐지용 판정을 적재 방어로 재사용하는
  것이 POSTMORTEM 2026-09-09의 모양이다. ARCHITECTURE §3.1이 그 값 쌍에 지정한 통제를 부른다.
- **`ref`를 세 진입점 전부 `isValidBranchName`으로 본다** — `detectRepoFormats` · `loadCandidateSample` ·
  `createProject`(T5). 잎 함수라 비용이 0이다.
- **`checkSlug`는 만들지 않는다**(결정 ②). 형식은 `planSlug`를 클라이언트가 직접 부르고(잎이라
  번들 비용이 없다), 중복은 `createProject`가 판정한다.
- **`app/__tests__/entry-points.test.ts`의 `USER_SCOPED_ACTIONS`에 이름 둘을 더한다**(주석:
  "생성 경로 — 아직 프로젝트가 없다").

**검증**: `pnpm test app` green — **구현 전에 red였던 단언**: 인가 거부 셋이 각자 나오고 **그 리포를
읽지도 않는다** · `pathTemplate`을 조작한 페이로드가 `planConfirmedFormat`에서 거부되고 **`readFiles`가
한 번도 안 불린다** · `locale`에 `../`가 들어가면 `isPathSafeLocale`이 막는다 · 잘못된 `ref`가
GitHub에 안 나간다 · `USER_SCOPED_ACTIONS` 검사가 이름 둘을 요구한다.

## T5. `createProject` 브랜치 인자 ⏹

- ⚠️ **`baseBranch`를 이 커밋에서 필수로 만들지 않는다.** 유일한 프로덕션 호출부
  (`new-project-flow.tsx:113`)에 아직 그 값의 출처가 없어(`RepoOption`에 브랜치 필드가 없고
  `baseBranch`는 지금 **응답으로만** 내려온다) 필수로 하면 **이 커밋에서 `typecheck`·`build`가 red**다.
  `onboarding.test.ts`의 `createInput()`도 인덱스 시그니처라 21개 호출부가 동시에 컴파일 에러다.
  → **`baseBranch?` + `?? access.defaultBranch` 폴백으로 받고, UI가 값을 주는 T8에서 필수로 조인다**
  (두 커밋 다 green).
- `isValidBranchName`(설정 화면과 **같은 함수**)을 서버가 부른다.
- ⚠️ **실패 사유 `invalid-branch`가 `OnboardError`에 **없다**(`RepositorySettingsError` 전용) — 셋을
  함께 늘린다: union 멤버 · `ONBOARD_ERRORS` Set · `m.errors.onboarding` 사전
  (`satisfies Record<…>`가 걸려 있어 빠뜨리면 `tsc`가 잡는다). "새 **검증**을 안 만든다"는 맞지만
  "새 **갈래**를 안 만든다"는 틀렸다.
- `reader.snapshot(input.baseBranch ?? access.defaultBranch)` · 같은 값을 저장.
- `detectRepoFormats`에 `ref?` 인자(미지정이면 default branch) + `isValidBranchName`.
- **`runFirstIngest`는 손대지 않는다** — DB 컬럼을 읽으므로 저절로 따라온다.
- **`revalidatePath`에 `/projects/new`를 더한다** — `createProject`·`runFirstIngest` 둘 다. 지금은
  **접두가 아니라 경로 하나**라 새로 생긴 "모달 뒤 목록"을 안 덮는다(POSTMORTEM 2026-09-09).
- `onboarding.test.ts`의 두 단언을 "**사용자가 고른 브랜치**"로 갱신하고 폴백 케이스를 남긴다.

**검증**: `pnpm typecheck && pnpm test` green — **구현 전에 red였던 단언**: 고른 브랜치가
`snapshot`에 간다 · 그 값이 저장된다 · 미지정이면 default branch로 떨어진다 · 없는 브랜치가
`base-branch-missing`(새 갈래를 안 만들었다) · 형식 불량이 `invalid-branch`이고 그 문구가 사전에 있다 ·
**`release/2.0`이 저장·조회·YAML 셋 다 통과한다** · **`revalidatePath`의 인자가 `/projects/new`를
포함한다**. `workflow.test.ts` green — `on.push.branches`가 저장값을 따르고 **슬래시 값도 YAML 인용이
맞다**.

## T6. 문구 — **추가만 한다** ⏹

- `messages/en.tsx`에 design.md §7의 새 키를 더한다.
- ⚠️ **이 단계에서 아무것도 지우지 않는다.** §7 "없어지는 것"의 소비자가 **전부
  `new-project-flow.tsx`에 살아 있다**(`repo.title`:209 · `repo.pick`:237 · `repo.other`:314 ·
  `files.title`:318 · `baseLocale.title`:363 · `naming.title`:429 · `result.ingest.title`:498 ·
  `.running`:500) — 지우면 red다. 삭제는 **T8 뒤 T8b**다.
- ⚠️ **`newProject.naming.create`는 삭제 대상이 아니다** — ③의 [Next] 라벨로 **재사용**한다.
- `pathHint`의 `satisfies Record<Adapter["layout"], …>`를 소비자 쪽에서 계속 건다
  (`manual-format-hint.test.ts`가 그 키 집합을 어댑터 `layout`과 대조한다).

**검증**: `pnpm test lib/i18n` green(`no-korean-ui`). `pnpm typecheck` green — 추가만 했으므로
기존 소비자가 하나도 안 깨졌다.

## T7. 프리미티브 확장 + 모달 껍데기 ⏹

**프리미티브 먼저** (`components/ui/` — 넓히는 것이지 옮기는 것이 아니다):

- `segmented-control.tsx`에 **`leading?: ReactNode`** — 국기가 들어갈 자리. ⚠️ **새로 만들지 않는다**,
  DESIGN §6.4가 §8과 같은 수치를 이미 못 박았고 role·Home/End가 딸려 온다.
- `empty-state.tsx`에 **`className`** — 지금은 prop이 없어 §8의 칩 48·제목 18/500을 못 넣는다.
- **`skeleton.tsx` 신설** — 지금은 `projects/loading.tsx`의 `bg-foreground/5` 관용구 하나뿐이다.
- ⚠️ **`dialog.tsx`는 손대지 않는다.** 모달이 그것을 **안 쓴다**(아래).

**껍데기** (`components/onboarding/modal.tsx`):

- ⚠️ **Radix `Dialog.*`를 직접 조립한다**(결정 ⑨). `components/ui/dialog.tsx`로는 §8이 안 만들어진다
  — Overlay 고정 · 머리/본문/바닥 padding 박힘 · 바닥 `justify-end` · X 하드코딩(design §2.1의 표).
  프리미티브를 **안 쓰고 안 고치므로** 초대·확인·아카이브 모달 넷이 안 움직인다.
- design.md §2.1의 props(`nextPending`·`announce` 포함), §8의 수치.
- **높이는 dim padding을 뺀 값에 물린다** — `min-h-[min(80svh,calc(100svh-96px))]
  max-h-[calc(100svh-96px)]`, dim padding 48, 본문 열에 `min-h-0 flex-1 overflow-y-auto`.
  ⚠️ **`vh`가 아니라 `svh`다**(셸 관용구).
- 바닥이 `Step n of 4` + [Back]·[Next]를 소유하고 `nextEnabled`를 부른다. `showBack=false`면 안 그린다.
- **`step`이 바뀌면 본문 컨테이너(`tabIndex={-1}`)에 포커스를 옮기고 `sr-only aria-live="polite"`에
  제목을 쓴다**(design §1.2.1).
- 닫기는 `router.replace(routes.projects({ q, filter }))`. **④에서도 닫힌다.**
- 새 토큰 **넷**(`#f0f0f0` — 먼저 `border-subtle`로 되는지 본다 · dim 알파 · blur · 스켈레톤 알파)을
  `@theme`에 넣고 **DESIGN §6.2에 등재**한다. ⚠️ **`shadow-medium`·`--color-canvas`·radius는 이미
  있다** — 새로 만들지 않는다(design §8.0).
- `Button` size `lg`의 "셸 밖 카드 전용" 주석을 보고 **바닥 버튼 40을 그 예외에 넣을지 포기할지**
  정한다.

**검증**: **jsdom 테스트가 spec 완료 조건 4를 판정한다** — **구현 전에 red였던 단언**:
`Step n of 4`가 렌더된다 · 스텝퍼(`role="tablist"`·`role="list"`) **0개** · ①④에 [Back]이 없다 ·
④에 X는 있다 · `nextDisabled`가 껍데기에서 나온다 · 단계가 바뀌면 포커스가 본문으로 가고 live
영역에 제목이 쓰인다. `pnpm test` green(`focus-ring`·`multiline-detail` 포함).

## T8. 라우팅 + 단계 UI ⏹

- ⚠️ **`app/(edit)/projects/new/layout.tsx`를 지운다.** 그 파일이 이미 `<ContentPanel>`을 들고
  `new/page.tsx`에는 import조차 없다 — 남긴 채 페이지에도 넣으면 `chain()`이 **2**를 세어
  `shell-layout.test.ts`가 red다. 그 레이아웃의 존재 이유(*"갈래마다 따로 반환하므로"*)는 갈래 넷이
  모달 안으로 들어가면 사라진다.
- 목록 본문을 `components/projects/project-list.tsx`로 내리고 **`<ContentPanel>` 래퍼는 두 페이지에
  각각 남긴다**(공유 컴포넌트로 올리면 둘 다 0이 되어 red).
- `app/(edit)/projects/new/page.tsx` — 목록 + `<NewProjectModal open />`. `maxDuration = 60` 유지.
  `?e=`를 두 union으로 읽어 ① 본문 맨 위 배너로.
- **`searchParams`를 `Raw<"e" | "filter" | "q">`로 넓히고 `routes.newProject()`가 `q`·`filter`를
  싣는다.** 닫기가 그 값을 들고 `/projects`로 간다(design §1.4). ⚠️ `entry-points.test.ts`의 쿼리
  수신자 검사가 그 형에서 키를 뽑으므로 **선언이 곧 계약이다.**
- **①의 리포 목록을 `<Suspense>`로 감싼다** — 안 그러면 §4의 "① 로딩" 행도
  `newProject.repo.loading` 키도 **도달 불가**다(POSTMORTEM 2026-09-08).
- **막힘 상태 셋(예외 A·B·C)을 모달 ① 본문으로 옮긴다** — `newProject.empty.*` 10키의 소비자가
  거기로 간다. 이 이관이 위의 `layout.tsx` 삭제를 성립시킨다.
- `new-project-flow.tsx`를 `components/onboarding/steps/{repo,files,naming,result}.tsx`로 쪼갠다.
  `result.tsx`가 `failed === 0 ? "success" : "warning"`를 그대로 들고,
  `app/__tests__/screens.test.ts`의 경로 목록을 **그 파일로 갱신**한다(지우지 않는다).
- **`createProject`의 `baseBranch`를 필수로 조인다**(T5에서 optional로 열어 뒀다).
- 로딩은 **다음 단계 안의 스켈레톤**(개수는 실제보다 적게 — ① 셋, ② 둘). 진행률 숫자를 만들지 않는다.
  ⚠️ **예외 하나**: ③→④만 [Next]가 로딩이다(예외 I가 ③에 머물러야 하므로 미리 넘어갈 수 없다) —
  규칙과 예외를 나란히 주석으로 남긴다.
- ②는 `bodyDirection="row"` + `bodyScroll="hidden"`(키 행만 스크롤 + `tabIndex={0}` + 접근 이름),
  ④도 `bodyScroll="hidden"`(블록 자신이 스크롤).
- ⚠️ **캐시 키와 무효화 경계를 명시한다.** 지금은 [Back]이 `ConfirmStep`을 **언마운트**해서 stale이
  원리적으로 안 생기는데, **모달은 단계가 껍데기를 공유하므로 상태가 살아남는다.** 키는
  `${owner}/${repo}@${ref}` + 후보 index + locale이고, 무효화 경계는 넷이다: **브랜치 변경 ·
  리포 변경 · 후보 변경**(→ `baseLocale`·`name`·`slug`도 함께 무효 — design §9) · 그리고 **[Back]이
  리포 검색어를 남길지**를 의도로 적는다(지금은 언마운트로 날아간다).
- **예외 J**(세션 만료·인가 거부)를 전 단계에 배선한다 — 모달을 닫지도 `router.refresh()`를 부르지도
  않고 그 단계에 머물며 입력값을 지킨다.

**검증**: `pnpm test` green — 특히 `shell-layout`(⚠️ **두 라우트 다 정확히 1**) · `screens` ·
`entry-points`(Action 둘 + **넓어진 쿼리 형**) · `focus-ring` · `client-graph`(⚠️ `AdapterChoice`·
`SampleRow`·`LocaleSample`은 **타입만**) · `manual-format-hint` · `multiline-detail` ·
`projects-screen`. **`projects-query.test.tsx`에 `/projects/new` 케이스 둘**: (a) `?e=` + 중복 `q`
(b) **`q`·`filter`가 뒤 목록에 실제로 반영된다**. `pnpm build` green(`"use client"` 누락·직렬화
위반은 `tsc`가 못 본다).

## T8b. 죽은 문구 키 삭제 ⏹

- `new-project-flow.tsx`가 사라졌으므로 design.md §7 "없어지는 것"의 각 키를
  `grep -rn "newProject\.<key>" app components lib messages`로 **0을 확인한 뒤** 지운다.
- ⚠️ **`newProject.naming.create`는 지우지 않는다** — ③의 [Next] 라벨로 재사용 중이다.

**검증**: 지운 키를 참조하는 자리가 grep으로 0이다. `pnpm typecheck && pnpm test` green.

## T9. 문서 갱신 ⏹ (문서별 별도 커밋)

- `docs/PRODUCT.md` §7.7 — **두 자리다**: (a) IA 표에서 `/projects/new`가 **`/projects` 위의 모달
  딥링크**임 (b) **"⚠️ `?e=`만 생성기가 없다(읽는 라우트 다섯)" 문단** — 그 문단이 `/projects/new?e=`의
  계약을 적은 유일한 자리이고 이제 "**모달이 열린 채** 사유를 든다"가 된다(완료 조건 3).
  ⚠️ **slug 예약 넷의 근거 주석은 안 바뀐다** — `new`가 예약인 이유는 그것이 라우트라는 것이고
  라우트는 남는다.
- `docs/DESIGN.md` — §6.7의 표를 모달 네 단계로 다시 쓴다. ⚠️ **바뀌는 줄 셋**: "`owner/name`은 mono"
  → sans, **"경로 템플릿 | mono" → sans**(후보 경로가 sans가 된다), "섹션 셋 `Card`" → 단계 넷.
  §6.2에 **새 토큰 넷**(`#f0f0f0` 또는 `border-subtle` 재사용 판정 · dim 알파 · **blur — 리포 최초의
  `backdrop-*`이라 절이 필요하다** · 스켈레톤 알파) 등재. ⚠️ **국기 치수를 24×17로 늘렸다면**
  §6.2의 "이 값을 다른 곳에 번지게 하지 않는다"와 함께 그 예외를 등재한다(안 늘렸으면 불필요).
- `docs/ARCHITECTURE.md` — §3.1의 `maxDuration = 60` **"세 페이지"**가 여전히 맞는지 확인.
  §3.1의 `planConfirmedFormat` 문단에 **`loadCandidateSample`이 그 통제를 지난다**를 더한다.
- `docs/DIRECTORY.md` — `components/onboarding/{modal,steps/}` · `components/projects/project-list.tsx` ·
  `components/ui/skeleton.tsx`(신설) · `lib/onboarding/{branch,next-enabled,types}.ts`.
  ⚠️ **`lib/format/relative-time.ts`는 없다** — 기존 `lib/relative-time.ts`를 쓴다.
  **`app/(edit)/projects/new/layout.tsx` 삭제**도 반영.
- `app/(edit)/projects/[slug]/settings/actions.ts:251`의 주석 — *"브랜치의 실존을 GitHub에 묻지
  않는다 — 실존은 pull이 시끄럽게 말한다"*가 이 변경으로 **부분 번복**된다. "온보딩은 묻고 설정은
  안 묻는다 + 그 이유(처음 고르는 자리 / 이미 아는 값을 고치는 자리)"로 갱신한다.
- `.env.example` — **변경 없음**(새 환경변수가 없다).

**검증**: 위 각 항목을 **grep으로 대조**한다 — PRODUCT에 "모달 딥링크"·"모달이 열린 채"가 있고,
DESIGN §6.7에 `mono`가 `owner/name`·경로 템플릿 자리에 **남아 있지 않으며**, DIRECTORY에
`lib/format/relative-time`이 **0건**이고 `new/layout.tsx`가 **0건**이다.
(⚠️ `/doc-check`은 문서 전수 스윕이라 네 문서로 범위를 좁혀 돌릴 수 없다.)

## T10. 실물 검증 ⏹ (커밋 없음)

- `/bugshot-qa` 로컬 — spec.md §3의 완료 조건 **1·2·3·7·8(수동분)·9·10·11·14·15**를 화면에서 본다.
  (4는 T7의 jsdom이, 5·6은 T5가, 8의 자동분은 T1이, 12·13은 게이트가 판정한다.)
- ⚠️ **뷰포트 둘 다 돈다: 1440×900과 1280×720.** 이 기능은 **높이**가 축이라(design §8) 기본
  1920×1080에서는 넘침 결함이 **한 번도 안 보인다**(POSTMORTEM 2026-09-11의 재발 방지 조항).
- 대상: `bugshot-i18n-test`(ko/en/fr — 세그먼트 셋) · `i18n-order-check`(재생성 어댑터) ·
  `i18n-format-check`(**한 리포에 프로젝트 둘** — 주소 중복 갈래를 실제로 만난다).
- **경로로 반드시 도는 것 넷**(표에 있지만 우연히는 안 밟힌다):
  1. `/projects?q=…`에서 [New project] → 뒤 목록이 그 검색 결과인지 → 닫으면 검색이 살아 있는지.
  2. ①에서 리포를 고르고 ②로 → [Back] → **다른 리포·다른 브랜치**로 → ②의 후보·샘플이 갈렸는지
     (캐시 무효화), ③의 `baseLocale`이 옛 후보의 값을 안 들고 있는지.
  3. ④에서 **적재 중에 X로 닫고** → 목록에 `Waiting for first import`가 있는지 → 설정에서 재시도와
     토큰 재발급이 되는지.
  4. ②에서 **못 읽는 파일**을 만나 "We couldn't read this file."이 뜨는지(빈 칸과 구별되는지).
- **`/l10n-roundtrip`은 이번 범위가 아니다** — 어댑터 출력이 안 바뀐다(`.write(`를 부르는 곳은
  `lib/pull/render.ts`와 `lib/survey/one.ts` 셋뿐이고 `samples`는 표시용이다). ⚠️ **전제**: T1이
  `pathTemplate`·`adapter`·`baseLocale`의 산출 규칙을 손대지 않았다.

**검증**: 리포트에 red 0. 발견한 결함은 이슈로.

---

## 배포 순서

**스키마 변경이 없으므로 `/db`가 없다.** `/push`(dev·preview) → `/bugshot-qa` → `/merge`(프로덕션).
T5가 `Project.baseBranch`에 **쓰는 값의 출처**만 바꾸고 컬럼은 그대로라(`prisma/schema.prisma`에
이미 있고 default가 `"main"`) 배포 순서 제약이 없다.

**커밋 경계마다 green이어야 한다.** 특히 앞에서 뒤집은 둘을 다시 적는다:

| 커밋 | 왜 green인가 |
|---|---|
| T5 | `baseBranch`가 **optional + 폴백**이라 기존 호출부(`new-project-flow.tsx`)와 `createInput()`이 안 깨진다 |
| T6 | **추가만** 하므로 살아 있는 소비자가 안 깨진다 |
| T8 | UI가 값을 주므로 여기서 `baseBranch`를 필수로 조인다 |
| T8b | `new-project-flow.tsx`가 사라진 뒤이므로 삭제가 안전하다 |
