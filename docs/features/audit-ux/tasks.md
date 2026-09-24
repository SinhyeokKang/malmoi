# tasks — 이동·액션 로딩 UX 감사 (2026-09-24)

출처는 2026-09-24 사용성 감사(dev @ `7abe3c90`)다. 렌즈 셋을 병렬로 돌렸다: **페이지 이동**(로딩 경계·prefetch·레이아웃 await) · **Server Action 대기**(pending·성공/실패 뒤 갱신) · **번역 편집기·데이터 화면**(검색·필터·상세). 발견 34건(🔴 10 · 🟡 14 · ⚪ 10)을 **배치 7개**로 나눴다. **체크박스는 구현 완료 상태가 아니다.**

**읽는 법**
- **한 배치 = 한 번의 `/ship`**. 배치 밖 항목은 같은 파일에 있어도 손대지 않는다 — 각 배치의 "경계" 줄이 겹치는 파일과 소유 배치를 적는다.
- **감사는 정적 읽기다. 브라우저 실측은 하지 않았다.** 각 항목의 첫 검증은 재현(red)이고, 재현이 안 되면 항목을 닫고 그 사실을 적는다. `(추정)`이 붙은 항목은 Next 16.3의 타이밍 동작에 기댄 판정이다 — `/runtime-test`에서 CDP 네트워크 스로틀(Slow 4G)로 먼저 밟는다.
- 지휘 세션이 코드로 직접 재확인한 항목: #1 · #2 · #3 · #4 · #11.
- **공통 원인 셋**이 거의 모든 항목의 뿌리다 — 배치가 이 셋을 기준으로 갈렸다.
  1. `[slug]` 아래 형제 화면(Translations·Members·Sources·Settings·Locales)에 `loading.tsx`가 없고 `useLinkStatus`가 0곳이다 → 이동 동안 **옛 화면이 표시 없이 멈춘다.** 위쪽 `projects/loading.tsx`는 공유 레이아웃보다 위라 형제 이동에서 다시 서지 않고, 동적 라우트 prefetch도 가장 가까운 경계까지만 받는다.
  2. searchParams로 구동되는 조작(키 선택·트리·필터·More·로그 상세)이 전부 `useTransition` 없는 `router.push`다 → searchParams만 바뀌면 `loading.tsx`도 안 서므로 **조작 뒤 무반응**이다.
  3. 액션의 pending이 재검증 커밋보다 먼저 끝난다 — action이 이미 `revalidatePath`를 부르는데 클라이언트가 `router.refresh()`를 또 부르거나, transition의 `isPending`을 버리고 `await` 뒤 `setState`로 잠금을 푼다.
- "0회/없음"을 단언하는 검증은 같은 픽스처의 허용 경로에서 N > 0을 짝으로 단언한다(POSTMORTEM 2026-09-14).
- 시안 캔버스는 은퇴했다(2026-09-24) — 레이아웃 QA는 `/design-sync`가 아니라 **DESIGN.md 대조**다.
- 작업 중인 파일에 `git checkout -- <경로>`를 쓰지 않는다(POSTMORTEM 2026-09-16).
- **결정은 2026-09-24에 다섯 개 모두 닫혔다**(D1~D5 — 각 배치의 "결정 기록"). 배치에 들어가면 **정본(DESIGN·ARCHITECTURE)을 먼저 고치고** 항목을 푼다.
- 끝나면 결론을 정본(DESIGN — 이동·대기 형 / ARCHITECTURE — GitHub 대기 마감)으로 올리고 이 디렉터리를 지운다.

## 배치 요약

| 순서 | 배치 | 항목 | 진입 | 검증 게이트 | 결정 |
|---|---|---|---|---|---|
| 1 | **U1 편집기 정합성** | #1·2·3·15 | `/ship` | `pnpm test`(jsdom) + `/runtime-test`(OWNER) | — |
| 1 | **U2 이동 경계·내비 pending** | #4·5·6·11·21·22·31·32 | DESIGN 먼저 → `/ship` | `pnpm test` + `pnpm build` + `/runtime-test`(스로틀) | — |
| 1 | **U4 대화상자·목록 필터** | #9(클라이언트)·17·28 | `/ship` | `pnpm test`(jsdom) + `/runtime-test` | — |
| 1 | **U5 GitHub 대기 경로** | #8·24·#9(서버) | `/ship` | `pnpm test` + `pnpm smoke:github` + `/runtime-test` | ✅ D5 |
| 2 | **U3 번역 화면 전환** | #7·16·18·19·20·29·30·33 | `/ship bypass` | `pnpm test`(jsdom) + `pnpm test:projects:postgres` + `/runtime-test`(스로틀) | ✅ D2 · D4 |
| 3 | **U6 액션 대기 정합성** | #12·13·14·26·27 | `/ship` | `pnpm test`(jsdom) + `/runtime-test`(OWNER·EDITOR) | — |
| 4 | **U7 긴 실행·pending 규칙** | #10·23·25 | DESIGN 먼저 → `/ship` | `pnpm test` + `/runtime-test`(`i18n-many-locales`로 30초 탐지) | ✅ D1 · D3 |

**배치 밖**: #34 `components/surface-selector.tsx` 문서 드리프트는 코드가 아니라 문서다 — `/doc-check`가 소유한다(기존 dead code는 언급만 하고 지우지 않는다).

**순서 제약**
- **U1 · U2 · U4 · U5는 파일이 안 겹쳐 병렬로 돌 수 있다**(아래 경계).
- **U1 → U3 → U6 → U7은 직렬이다.** 넷이 `workspace.tsx`를 함께 건드리고, U1·U6·U7은 `publish-button.tsx`까지 겹친다.
- **U2 → U6 · U7**: U2가 `components/home/sync-button.tsx:228`(링크)과 `new-project.tsx:479`를 고친다. 같은 파일의 pending은 U6(`sync-button.tsx:120`)·U7(`sync-button.tsx:157`, `new-project.tsx:235`)이 다룬다.
- **U4 · U5**: 이벤트 상세는 둘로 쪼갰다. **닫기·열기의 클라이언트 동작은 U4**(`event-dialog.tsx`·`logs-card.tsx`)이고, **Home이 상세 때문에 GitHub probe를 다시 도는 서버 쪽은 U5**(`(home)/page.tsx`)다.

---

## U1 편집기 정합성

**왜 한 배치인가**: 느린 게 아니라 **틀리는** 부류만 모았다 — 입력이 사라지거나, 서로 막아야 할 실행이 겹치거나, 비활성 문구가 거짓이다.

**항목**
- [x] **#1** 🔴 `components/translations/workspace/workspace.tsx:120-125`, `:227-239` — 키 전환이 대기 중일 때 친 입력이 조용히 사라진다.
  - 실패 시나리오: 키 A 상세 → 목록에서 B 클릭(`planEditorNavigation`이 클릭 시점의 `dirty = []`로 `go`) → 응답 전까지 A 패널이 그대로라 A 칸에 계속 입력 → B 도착 → effect가 `detail.key.id !== draft.keyId`로 `initKeyDraft` 교체 → A 입력이 확인창 없이 사라지고 세션 복구 사본도 지워진다(`:171-181`).
  - 방향: 이동이 대기 중이면 상세를 읽기 전용이나 흐림 처리한다. 교체 직전에 dirty를 다시 보고, 남아 있으면 discard 확인창을 띄운다.
  - 재현: jsdom에서 `router.push`를 보류시키고 입력 → `detail` prop 교체 → A 값이 사라지는지 단언한다.
- [x] **#2** 🔴 `workspace.tsx:421-422` · `components/publish-button.tsx:90` — 번역 화면에서 Sync와 Publish가 서로 안 잠긴다(DESIGN §6 "진행 중 상호 잠금" 위반).
  - 원인: `SyncButton`에 `onPendingChange`가 안 넘어가고, `PublishButton`에 `disabled`가 없으며, `planPublishButton`에 `otherPending: false`가 하드코딩돼 있다. Home은 `components/home/actions.tsx:76,149,154`로 잠근다. 같은 화면의 Sync 결과 [Try again]만 `retryDisabled={publish.pending}`(`:488`)로 잠겨 있다.
  - 방향: Home의 `syncPending`/`publishPending` 호스트 배선을 workspace로 옮긴다. 판정은 호스트의 몫이다(DESIGN §6).
- [x] **#3** 🔴 `workspace.tsx:302-305` · `messages/en.tsx:2036` — Revert 비활성 문구("This stays off while a save, publish, or sync is running.")와 실제 조건(`saving || revertBusy`)이 다르다. Publish·Sync 중에도 눌리고, 서버의 `busy` 거부로만 멈춘다.
  - 방향: #2에서 만든 두 pending을 `revertBlocked`에 더한다.
- [x] **#15** 🟡 `components/search-input.tsx:30-31` — Enter 뒤 이어 친 글자가 응답 도착과 함께 되돌려진다(`useEffect(() => setText(value))`). 번역 화면과 Logs 검색(`log-filters.tsx:201-204`)이 같은 컴포넌트다.
  - 방향: 마지막으로 제출한 값을 ref에 두고, 현재 입력이 그 값과 같을 때만 URL 값으로 동기화한다.

**경계**: `workspace.tsx`의 전환 pending(#7·#18·#19·#29·#30)은 **U3**, `:335`의 `router.refresh()`(#12)는 **U6**, Publish 직렬화(#10)는 **U7**이다. `publish-button.tsx:80`(#12)·`:99`(#25)·`:296`(#23)도 이 배치가 아니다.

---

## U2 이동 경계·내비 pending

**왜 한 배치인가**: 공통 원인 1을 한 번에 닫는다. 형제 화면에 골격을 두고, 누른 링크가 즉시 반응하게 하고, 이동 경로의 불필요한 왕복을 걷어낸다.

**진입 전 정본**: DESIGN §6 `Button loading` 행의 "라우트 이동의 pending은 `Link.onNavigate` + `useTransition`이 형이고 소비자는 [New project] 하나" 문장을 **`useLinkStatus` 형**으로 갱신한다(사이드바 `Item`). Home 로딩 행의 골격 규칙(같은 치수 · 개수는 가장 흔한 수 · `motion-safe:`)은 새 골격에도 그대로 적용한다.

**항목**
- [x] **#4** 🔴 `lib/shell/nav.ts:82` → `app/(edit)/projects/[slug]/translations/page.tsx:18-23` — 사이드바 Translations가 옛 주소를 가리켜, 누를 때마다 서버 리다이렉트를 한 번 더 거친다(인증 → 접근 → `defaultSurface` 조회 → `redirect` → 표면 렌더). 두 세그먼트 모두 경계가 없어 prefetch도 무의미하고, 그동안 옛 화면이 멈춰 있다.
  - 같은 옛 링크: `components/home/count-cards.tsx:68` · `components/home/sync-button.tsx:228` · `components/onboarding/new-project.tsx:479`.
  - 방향: `defaultSurface`의 slug를 셸 데이터에 싣고 `routes.surfaceTranslations`로 직접 조립한다. 옛 라우트는 외부 링크 호환용으로 남긴다.
  - ⚠️ **Home의 두 링크(`count-cards.tsx:68` · `home/sync-button.tsx:228`)는 U5가 소유한다**(2026-09-25 orchestrate 인테이크) — 표면 slug를 `(home)/page.tsx`에서 내려야 하는데 그 파일은 U5가 고친다. U2는 사이드바(`nav.ts`)와 `new-project.tsx:479`만 고친다.
- [x] **#5** 🔴 `loading.tsx`가 없는 형제 화면들 — `surfaces/[surfaceSlug]/translations` · `surfaces/[surfaceSlug]/locales` · `members` · `sources` · `settings`. Home·Logs에서 이 화면들로, 또 이 화면들끼리 이동하면 옛 화면이 표시 없이 멈춘다(추정 — 스로틀로 확정).
  - 방향: 각 세그먼트에 실물 치수의 골격을 둔다(번역은 세 패널). `[slug]/`에 하나로 두지 않는다 — malmoi#95의 이유와 같다.
- [x] **#6** 🔴 `components/shell/sidebar.tsx:119-121` — 이동 pending 표시가 앱 전체에 [New project] 하나뿐이다(`useLinkStatus` 0곳). 사이드바 선택 표시가 커밋 뒤의 `usePathname`을 봐서 응답이 올 때까지 옛 항목에 남는다.
  - 방향: 사이드바 `Item`에 `useLinkStatus`를 붙여 누른 항목에 즉시 pending 면을 세운다.
- [x] **#11** 🟡 `app/(edit)/error.tsx:7,13` · `app/(edit)/projects/[slug]/logs/error.tsx:21,24,31` — `reset`은 다시 그리기만 하고 다시 가져오지 않아, 재시도를 눌러도 같은 서버 오류가 다시 난다. `[slug]` 아래 Members·Sources·Settings·Translations의 실패가 전부 `(edit)/error`로 모인다. 루트 `app/error.tsx`는 이미 `retry`로 고쳐져 있다. `logs/error.tsx:21`의 주석("`reset()`은 현재 URL을 다시 조회한다")은 틀렸다.
  - 방향: 루트와 같은 `retry` 형으로 바꾸고 주석을 고친다.
- [x] **#21** 🟡 `app/(edit)/projects/loading.tsx` (추정) — 이 경계는 `projects`의 자식 키가 바뀌면(`__PAGE__` → `[slug]`) 다시 선다. prefetch가 끝나기 전에 누른 목록 행이나 온보딩 ④의 [Open translations]에서 **목록 골격이 떴다가** 다른 화면으로 바뀐다. malmoi#95와 같은 결함이 한 층 위에 남아 있는 셈이다.
  - 방향: `projects/(list)/` 그룹으로 옮긴다.
- [x] **#22** 🟡 `components/onboarding/new-project.tsx:479` — 생성 완료 뒤 [Open translations]가 transition 없는 `router.push`다. 누른 뒤 무반응이고, 뒤로가기를 누르면 가로챈 모달(`/projects/new`)이 다시 뜬다. `nextPending`은 ③에서만 켜진다.
  - 방향: `router.replace` + transition pending(`new-project-button.tsx:28`의 형). 목적지는 #4의 직접 주소다.
- [x] **#31** ⚪ `app/api/github/callback/route.ts:238` → `app/(edit)/projects/[slug]/surfaces/new/page.tsx:16` — callback에서 소스 추가 화면까지 리다이렉트가 두 번이다. 방향: callback이 `routes.sources(slug, { add: "sources" })`로 바로 보낸다. ⚠️ callback은 `middleware.ts` matcher에 넣지 않는다(CLAUDE.md).
- [x] **#32** ⚪ `lib/auth/read-session.ts:24` — `readSession`이 React `cache`를 안 써서, 한 요청에서 `auth()`가 여러 번 돈다(`@modal/[...rest]/page.tsx`·`@modal/page.tsx`의 `requireUser` 포함). 병렬이라 지연은 작다. 방향: `cache()`로 감싼다. 세션 폐기(`lib/session-revocation/`)와의 상호작용을 먼저 확인한다.

**진행 기록 (2026-09-25)**
- #5의 Locales 골격은 두지 않았다 — `surfaces/[surfaceSlug]/locales`는 Sources로 redirect만 하는 라우트라 골격이 한 번 번쩍일 뿐이다. #31 뒤 소비자가 0이 된 `routes.addSurface`는 지웠다(`/surfaces/new` 페이지는 옛 링크 호환으로 남는다).
- #21 이동이 `/projects/new`의 경계를 빼앗는 회귀를 리뷰가 잡았다 — `new/`도 `(list)/new/`로 옮겼다(GitHub callback의 전체 로드 착지가 최대 8초 빈 화면이었다).
- 새 export `SkeletonLine`(`components/ui/skeleton.tsx`) — 글자 크기 클래스 + U+200B로 실물 line box를 세운다. 기존 골격(Home·Logs·목록·계정)은 px 형 그대로다.

**경계**: `home/sync-button.tsx`는 `:228`의 링크만 이 배치다(`:120`은 U6, `:157`은 U7). `new-project.tsx`는 `:479`만 이 배치다(`:235`는 U7).

---

## U3 번역 화면 전환

**왜 한 배치인가**: 공통 원인 2의 본체다. 전부 `workspace.tsx`의 이동 함수(`go`·`selectTree`·`filter`)와 그 결과를 받는 목록·상세 패널이라 쪼개면 서로의 diff를 덮는다. U1이 dev에 들어간 뒤 시작한다(#1의 "이동 대기 중" 상태를 이 배치가 그대로 재사용한다).

**결정 기록 (2026-09-24)**
- **D2 → 키 선택과 More는 `replace`, 트리·필터·검색은 `push`** (#33). 뒤로가기가 키 한 칸씩 거슬러 가면 화면을 떠나는 길이 사라지고, 키 퍼머링크는 `replace`로도 주소창에 남는다. 필터·트리는 "방금 조건으로 되돌아가기"가 뒤로가기의 쓸모라 기록에 남긴다.
- **D4 → 셀 단위 "Saving…" 표시만 하고, `revalidatePath(…, "layout")` 범위는 그대로 둔다** (#20). 범위를 줄이면 미전달 배지·Home 집계가 같은 요청에서 같이 움직인다는 보장이 깨질 수 있어 불변식 검토(ARCHITECTURE §5.8)가 먼저다 — 범위 축소는 이 감사의 범위 밖이다. "Saving…"은 버튼 라벨이 아니라 **셀의 상태 글자**라 D1(버튼 문구 고정)과 충돌하지 않는다.

**항목**
- [x] **#7** 🔴 `workspace.tsx:233-247`, `:388-392`, `:444-475`, `:504` — 키·트리·필터·표면 조작이 표시 없이 멈췄다가 한꺼번에 바뀐다. 필터 메뉴는 닫히는데 트리거 라벨(`query`에서 파생)과 목록은 옛값이라 다시 누르게 된다. 선택 행 배경(`selectedKeyId = detail?.key.id`)도 응답이 와야 움직인다. 페이지는 await 다섯 단계를 순서대로 돈다(`surfaces/[surfaceSlug]/translations/page.tsx:50→54→64→68→73`).
  - 방향: 이동 함수를 `startTransition`으로 감싸고, `isPending`을 목록·상세에 `aria-busy`로 건다. 선택 행과 필터 라벨은 낙관적 로컬 상태로 먼저 바꾼다. 서로 의존하지 않는 await는 병렬로 돌린다.
- [x] **#16** 🟡 `workspace.tsx:532` · `components/translations/workspace/locale-panel.tsx:53-57` — 상세의 언어 필터는 클라이언트에서 거르는데도 페이지 전체를 서버에서 다시 받는다. 방향: `window.history.replaceState`로 URL만 맞춘다(`useSearchParams`와 연동된다).
- [x] **#18** 🟡 `workspace.tsx:205-218`, `:240-243` · `lib/translations/query.ts:126-132` — 트리 전환이 서버 왕복 두 번이다. `treeQuery`가 `key`를 지워 첫 응답에서 상세가 "Select a key to translate" 빈 상태로 번쩍이고, effect가 첫 키로 `router.replace`를 한 번 더 한다. 다른 소스로 가면 `[surfaceSlug]`가 바뀌어 workspace가 새로 마운트되는데, `pendingSelection` ref는 옛 인스턴스에 남아 첫 키 자동 선택이 안 될 수 있다(추정).
  - 방향: `key`가 없는 트리 이동이면 서버가 첫 키 상세를 같은 렌더에 싣는다.
- [x] **#19** 🟡 `workspace.tsx:197-199`, `:507` · `lib/keys/translation-list.ts:183-185` · `components/translations/workspace/key-list.tsx:80-84` — "더 보기"의 cursor가 URL에 남는다. 새로고침·공유·뒤로가기 때 cursor 이후 페이지만 보이고, 키 선택도 `{...query}`로 cursor를 달고 다닌다. 버튼에 로딩 표시가 없어 여러 번 누를 수 있다(중복은 걸러진다).
  - 방향: 클라이언트에서 누적하고 URL에는 cursor를 남기지 않는다. 버튼에 `loading`을 건다.
- [x] **#20** 🟡 `app/(edit)/actions.ts:53`, `:113-116` · `locale-panel.tsx:194-195` — Save 스피너가 쓰기 자체보다 오래 돈다. 액션 응답이 트리·목록·상세·미전달 수를 다시 렌더한 결과까지 싣고 돌아오기 때문이다. 셀 단위 표시는 없고, 전송 중인 셀에 계속 "Not saved"가 붙어 있다.
  - 방향(D4): 전송 중인 셀(`inFlight.sent`)을 "Saving…"으로 표시한다. 재검증 범위는 건드리지 않는다.
  - 이미 되는 것(회귀 금지): 포커스·스크롤·다른 칸 입력 보존, 행 제자리 유지(`draft.ts`의 `server`/`success`, `saved-rows.ts`, `useLandAfter`).
- [x] **#29** ⚪ `workspace.tsx:185-203` · `key-list.tsx:53` — `rows`를 `useEffect`로 갱신해서, 조건이 바뀐 첫 커밋은 새 배지·라벨에 옛 행으로 그려진다. 결과가 0↔N으로 바뀔 때 빈 상태가 한 프레임 번쩍인다. 방향: `conditionKey`가 바뀌었는지 렌더 중에 판정해 상태를 리셋한다.
- [x] **#30** ⚪ `workspace.tsx:263`, `:302`, `:585-586` (추정) — 저장 직후 푸터가 "Saved" → "Saved · not sent"로 두 번 바뀌고 `aria-live`도 두 번 읽힐 수 있다. `hasPending`이 서버 prop(`detail.locales[].pending`)에서 오기 때문이다. 방향: 성공 결과의 셀로 `pendingLocales`를 낙관적으로 합친다(목록 행은 이미 이렇게 한다, `:266-273`).
- [x] **#33** ⚪ `workspace.tsx:233-236`, `:507` — 키 선택과 More가 `push`라 뒤로가기가 키 단위로 거슬러 간다. D2대로 고친다.

**선행 배치에서 넘어온 것 (2026-09-25)**
- **U1이 이동 잠금을 이미 transition으로 세웠다** — `workspace.tsx`의 `const [navigating, startNavigation] = useTransition()`와 `navigate(href, how)`. 이 배치는 새 transition을 만들지 않고 **그 `navigating`을 표시(#7의 `aria-busy`·흐림·낙관 선택)에 재사용**한다. 읽기 전용 잠금은 그대로 둔다.
- **U2가 `surfaces/[surfaceSlug]/translations/loading.tsx`를 세웠다** — 트리에서 **다른 소스**를 누르면 `[surfaceSlug]` 세그먼트가 바뀌어 이 골격이 머리·트리·목록을 통째로 덮는다(같은 소스 안의 조작은 searchParams라 안 덮는다). #18을 설계할 때 이 동작을 전제로 한다 — 받아들일지, 소스 전환도 옛 화면 + pending으로 둘지 판정해 handoff에 적는다.
- U5가 Home의 [Sync]→`Publish first` 링크에 `surfaceSlug`를 넘겼다. 번역 화면 안의 `SyncButton`은 넘기지 않아 옛 `/translations` 경로로 간다 — 현재 표면을 넘기는 한 줄을 이 배치가 든다.

**진행 기록 (2026-09-25)**
- #18은 URL 예약값 `key=@first`로 서버가 첫 키 상세를 같은 렌더에 싣는다(왕복 1회). 소스 전환의 전면 골격(U2)은 받아들였다 — 세그먼트가 바뀌는 이동이라 정직한 표시다.
- #19는 읽기 전용 Server Action `loadMoreTranslationKeys`를 새로 두었다(CLAUDE.md 데이터 변경 표에 등재). 대가: 저장 뒤 재검증은 첫 페이지만 다시 그린다 — 붙인 행은 `applySavedRow`·`selectedInResult`로만 갱신된다(ARCHITECTURE).
- 리뷰가 잡아 고친 것: 대기 중 연속 조작이 서버 prop의 옛 `query`로 주소를 만들어 앞 선택을 지웠다(POSTMORTEM 2026-09-12 부류 — 이제 낙관값 `view.query` 위에 쌓는다) · `replaceState`가 대기 중 이동을 버렸다(Next 16.3 `ACTION_RESTORE` — 대기 중 언어 메뉴 잠금).

**경계**: `:335`의 `router.refresh()`(#12)는 **U6**, `:351`의 `usePublish`(#10)는 **U7**이다. `components/search-input.tsx`(#15)는 **U1**이다.

---

## U4 대화상자·목록 필터

**왜 한 배치인가**: 번역 화면 밖에서 searchParams가 구동하는 자리들이다. 결과를 기다릴 필요가 없는 조작(닫기·클라이언트 필터)까지 서버 왕복을 기다린다.

**항목**
- [x] **#9** 🔴 (클라이언트 쪽) `components/logs/event-dialog.tsx:40-44` · `components/home/logs-card.tsx:48` · `app/(edit)/projects/[slug]/logs/page.tsx:63-69` — 이벤트 상세 대화상자의 `open`이 늘 true인 제어형이다.
  - Esc·×를 눌러도 `router.push`의 전체 재조회가 끝날 때까지 떠 있다.
  - 로그 행을 누르면 표시 없이 기다렸다가 뜬다.
  - 닫기가 `push`라서 뒤로가기를 누르면 다시 열린다.
  - 방향: 로컬 `open`으로 먼저 닫고 URL은 `router.replace`로 뒤따르게 한다. 열 때는 transition pending을 행에 표시한다.
- [x] **#17** 🟡 `components/projects/search-input.tsx:27` · `components/projects/project-list.tsx:114`(`listBody(all, q)`) · `app/(edit)/projects/page.tsx:59` — 프로젝트 검색은 클라이언트 필터인데 서버 왕복을 타고, 원격 신호(최대 8초)를 기다리는 동안 목록이 굳어 있다. 방향: `q`를 로컬 state로 거르고, URL은 `history.replaceState`로만 맞춘다.
- [x] **#28** ⚪ `components/logs/log-filters.tsx:63`, `:93`, `:194` — [Refresh](`router.refresh()`만 부른다)와 필터 초기화에 pending이 없다. 바뀐 게 없으면 눌렸는지조차 알 수 없다. 방향: transition pending으로 아이콘을 교체한다(DESIGN §6 "아이콘이 있는 버튼은 교체"). 폴링이 없는 것은 설계대로다(`logs/page.tsx:38`).

**경계**: Home이 `?event=` 때문에 GitHub probe를 다시 도는 서버 쪽(#9 서버)은 **U5**다. `log-filters.tsx:201-204`가 쓰는 `components/search-input.tsx`는 **U1**이다.

---

## U5 GitHub 대기 경로

**왜 한 배치인가**: 스켈레톤이 있어도, 없어도 **GitHub 왕복이 이동의 임계 경로에 있다.** 원인이 `lib/github.ts` 하나로 모인다.

**결정 기록 (2026-09-24)**
- **D5 → probe 마감은 목록의 `loadRemoteSignals`와 같은 8초**(`lib/projects/remote.ts:57`). 같은 원격을 기다리는 두 화면이 서로 다른 마감을 가지면 한쪽은 "연결 안 됨", 다른 쪽은 "연결됨"으로 갈린다. 값은 두 곳이 같은 상수를 읽게 한다(사본 둘이면 다시 갈린다). ARCHITECTURE에 "GitHub 대기 마감 8초" 한 줄을 올린다.

**항목**
- [x] **#8** 🔴 `app/(edit)/projects/[slug]/settings/page.tsx:38-40` · `lib/github.ts:31-38`, `:55-75` — Settings가 GitHub을 동기로 기다리는데 로딩 경계가 없다(#5가 경계를 세워도 대기 시간은 그대로다).
  - `probeRepo`가 설치 조회 → 토큰 발급 → 리포 조회를 순서대로 부르고, `loadOpenPrUrl`이 토큰 발급 + PR 조회를 따로 또 한다.
  - `createApp()`이 호출마다 `new App`이라, 설치 토큰 캐시가 요청 사이에 살아남지 않는다.
  - `probeRepo`에 마감이 없어, GitHub이 멈추면 `maxDuration` 60초까지 끌려간다.
  - 방향: 연결 상태 카드를 `<Suspense>`로 떼어 스트리밍하고, probe에 D5 마감을 두고, `App`을 모듈 스코프 lazy 싱글턴으로 둔다. ⚠️ 모듈 최상위에서 env를 평가하지 않는다(CLAUDE.md) — 싱글턴은 첫 호출 때 만든다. ⚠️ installation 토큰 경계(`credential-separation.test.ts`)를 넘지 않는다.
- [ ] ⛔ **#24** 🟡 `app/(edit)/projects/[slug]/(home)/page.tsx:82→86→133→160→169` — 모든 Home 진입이 같은 probe(GitHub 3홉)를 기다린다. 골격은 있지만 그만큼 오래 서 있다. 방향: 연결 상태만 Suspense로 떼어, 카운트 카드와 메타 열이 먼저 뜨게 한다.
- [ ] ⛔ **#9** 🔴 (서버 쪽) `(home)/page.tsx:133-158` — `?event=`로 대화상자를 여닫을 때마다 Home 전체와 probe가 다시 돈다. 방향: #24의 Suspense 분리로 probe가 상세 여닫기의 임계 경로에서 빠지게 한다.

- [x] **#4b** (U2에서 이관) `components/home/count-cards.tsx:68` · `components/home/sync-button.tsx:228` — Home의 번역 링크를 옛 `routes.translations`에서 `routes.surfaceTranslations`로 직접 조립한다. 카드의 `cardQuery`(`ns` 명시 — `count-cards.tsx:62-67` 주석)는 그대로 싣는다. `sync-button.tsx`는 `:228` 링크만 — `:120`은 U6, `:157`은 U7이다.

**진행 기록 (2026-09-25)**
- ⛔ **#24 · #9(서버)는 막힘으로 닫았다** — `health`가 `planHomeState`를 거쳐 카드·할 일·메타·배너·머리 `paused`를 전부 정해서, probe 전에 카드·메타를 그리면 DESIGN §6.64 상태 매트릭스가 뒤집힌다(App이 제거된 프로젝트에서 Publish가 잠깐 켜진다). `?event=` 열기는 transition이라 Suspense로도 probe를 못 비킨다(추정). 이 배치가 준 것은 App 싱글턴(웜 인스턴스에서 probe 3홉→2홉)과 8초 상한이다. 닫기는 U4가 `replaceState`로 서버 왕복을 없앴다. **남은 지연은 런타임 QA(Slow 4G)로 재고**, 여전히 느리면 probe 결과 TTL 메모를 검토한다 — 키에 `installationId`·`repositoryId`를 넣고 `error`는 캐시하지 않고 설정 화면은 건너뛰어야 한다(안 그러면 Reconnect 직후 거짓 `installation-changed`).
- 리뷰가 잡아 같은 배치에서 고친 것: 캐시된 App의 설치 토큰이 만료 1분 전에 `createGitClient`의 고정 Octokit에 실릴 수 있었다(5분 미만이면 재발급) · `loadAccountView`에 마감이 없었다. 남은 후보: `loadInstalledRepoCount`(`/account`)에 마감 없음.

**경계**: `event-dialog.tsx`·`logs-card.tsx`(#9 클라이언트)는 **U4**다. `lib/projects/remote.ts`는 읽기만 하고 고치지 않는다(D5의 기준값).

---

## U6 액션 대기 정합성

**왜 한 배치인가**: 공통 원인 3이다. pending이 화면 갱신보다 먼저 끝나거나, 실패가 화면 전체를 오류로 넘긴다. 기준 형은 이미 리포 안에 있다 — `general-card`·`repository-form`·`profile-picture`·`archive-card`는 transition pending이 재검증 커밋까지 유지되고, 끝난 뒤 `useLandAfter`로 착지한다.

**항목**
- [x] **#12** 🟡 action이 이미 `revalidatePath(…, "layout")`를 부르는데(`app/(edit)/actions.ts:114,179` · `app/(edit)/projects/actions.ts:1409,1453,1836`) 클라이언트가 `router.refresh()`를 또 부른다 — `components/home/sync-button.tsx:120` · `components/publish-button.tsx:80` · `workspace.tsx:335` · `components/sources/sources-screen.tsx:131,145`. 결과 문구가 먼저 뜨고, 그 뒤 transition 밖에서 두 번째 전체 렌더가 표시 없이 돈다. Sources는 `load()` 직접 호출에 refresh로 바뀐 `data` effect(`:61`)까지 겹쳐 `loadSourceDetail`이 세 번 돈다. `sources-screen.tsx:131`은 모달을 닫고 결과 배너를 먼저 띄우는데, 목록은 refresh 뒤에야 바뀐다.
  - 방향: 중복 `router.refresh()`를 지운다. 꼭 남아야 하는 곳은 `startTransition`으로 감싸 pending에 포함한다. ⚠️ audit B3 #5·#11("실패에도 refresh")에서 고친 `outcome.ok` 가드를 되돌리지 않는다(POSTMORTEM 2026-09-08).
- [x] **#13** 🟡 `components/members/member-list.tsx:78`, `:100` · `components/members/pending-invitations.tsx:64`, `:96-103` · `components/members/invite-modal.tsx:220-222` — `[, startTransition]`으로 `isPending`을 버리고 `await` 뒤 `setPendingId(null)`로 잠금을 푼다. 목록 커밋 전에 곧 사라질 행의 [Remove]가 잠깐 다시 켜지고, 역할 Select가 옛 역할로 보인다. Resend·초대 완료 toast가 목록보다 먼저 뜬다.
  - 방향: `general-card.tsx`처럼 `isPending`과 AND로 잠금을 유지하고, toast·닫기는 커밋 뒤로 옮긴다.
- [x] **#14** 🟡 try/catch 없이 action을 부르는 일곱 곳 — `components/settings/push-token-panel.tsx:68` · `components/account/profile-picture.tsx:63-68`, `:88-94`(`finally`만 있다) · `components/account/profile-name-form.tsx:53` · `components/onboarding/connect-github.tsx:89` · `components/sources/add-sources-modal.tsx:101` · `components/account/login-methods.tsx:108` · `components/account/sessions-section.tsx:38`. 네트워크가 끊기면 화면 전체가 오류 경계로 넘어간다. audit B3 #24가 다른 넷(member-list·pending-invitations·github-account·reconnect-button)을 이미 고쳤다 — 같은 형으로 인라인 "확인 불가"를 말한다.
- [x] **#26** ⚪ 대기 상태 하나를 두 버튼이 나눠 써서 엉뚱한 버튼에 스피너가 돈다 — `add-sources-modal.tsx:84`/`:109`(Add와 수동 Confirm) · `components/sources/source-detail-modal.tsx:113`(Retry가 `loading={busy}`라 기준 언어 저장 중에도 돈다). `profile-picture.tsx:45` 주석이 경고한 함정이다.
- [x] **#27** ⚪ 비활성만 되고 스피너가 없는 트리거 — `add-sources-modal.tsx:101`(GitHub 재연결) · `components/onboarding/steps/repo.tsx:424`(보조 링크).

**진행 기록 (2026-09-25)**
- #12: Sync·Publish·첫 적재는 중복 refresh만 걷었다 — 대기를 재검증 커밋까지 끌려면 `startTransition(async …)`로 감싸야 하는데 React 19가 열린 async action에 이후 모든 transition(Link 이동 포함)을 얽어 긴 실행 동안 이동이 막힌다(ARCHITECTURE에 규칙으로 올렸다). promise 해제가 라우터 커밋보다 한 렌더 먼저인 것은 받는 대가다.
- #13: Resend는 행 독립 계약(`pending-resend.test.tsx`)을 지키려고 커밋까지 잠그지 않는다 — 토스트가 한 렌더 빠를 수 있다.
- #14: redirect로 끝나는 호출부는 catch에서 `unstable_rethrow`로 되던진다(이 리포 첫 사용).
- Sources `not-awaiting`(다른 실행이 이미 적재) 뒤에는 상세를 직접 다시 읽는다 — 재검증이 없는 유일한 상태 변화 거부다.

**경계**: `publish-button.tsx`의 `:99` 라벨(#25)·`:296` 진행(#23)은 **U7**이다. `add-sources-modal.tsx:50`의 탐지 대기(#23)도 **U7**이다.

---

## U7 긴 실행·pending 규칙

**왜 한 배치인가**: 긴 원격 실행(Publish·Sync·리포 탐지) 동안의 표시와 잠금이다. D1·D3이 닫혀 설계 배치가 아니게 됐다 — DESIGN §6을 먼저 고치고 `/ship`한다.

**결정 기록 (2026-09-24)**
- **D1 → 규칙대로 문구를 고정한다** (추천안 "Sync·Publish 예외 명문화"를 사용자가 뒤집었다). Sync·Publish 트리거도 스피너만 세우고 라벨은 `Sync`·`Publish` 그대로다(`sync-button.tsx:157`, `publish-button.tsx:99`). 예외가 없어야 "어느 버튼은 문구가 바뀌나"가 매 화면 판단이 되지 않는다. **DESIGN §6 "진행 중 상호 잠금" 행의 `Syncing…` 서술을 먼저 고친다** — 그 행의 요지(두 진행을 하나의 `busy`로 접지 않는다 · 포커스 복귀 대상 유지)는 라벨과 무관하게 남는다. 무엇이 도는지는 스피너 위치와 진행 모달·결과 문구가 말한다. ⚠️ 라벨이 접근 이름이므로 `aria-busy`가 빠지면 스크린리더에겐 진행 신호가 0이 된다 — 두 트리거에 `aria-busy`가 서는지 단언한다.
- **D3 → 같은 화면의 다른 쓰기 트리거만 잠그고 사유를 보인다** (#10). `usePublish`를 `[slug]` 셸로 올리는 것은 하지 않는다 — 레이아웃이 클라이언트 상태를 들게 되는 구조 변경이다. 화면을 옮기면 진행 표시가 사라지는 것은 알고 받는 대가이고, 그때 다시 누르면 나오는 서버의 `already-running` 결과가 그 사실을 말한다. 조회 action을 Route Handler로 옮기는 안은 CLAUDE.md의 "내부 쓰기 = Server Action" 원칙과 충돌해 채택하지 않는다.

**항목**
- [x] **#10** 🔴 `components/publish-button.tsx:76` · `messages/en.tsx:2231`("Leaving this page won't stop it.") · `components/home/actions.tsx:64` · `workspace.tsx:351` — Server Action이 순서대로 실행되므로, 긴 Publish(PR 생성) 뒤에 Save·Revert 미리보기·Sync 확인창이 줄을 서서 스피너만 돈다. 온보딩 ②의 샘플 로드(`loadCandidateSample`)도 30초 넘는 `detectRepoFormats` 뒤에 선다. `usePublish`가 화면마다 따로 있어, 다른 화면으로 가면 진행 상태와 결과가 사라지고 버튼이 다시 켜진다. 다시 누르면 서버의 `already-running` 거부가 결과로 뜬다.
  - 방향(D3): Publish가 도는 동안 같은 화면의 Save·Revert·Sync 확인창을 `aria-disabled`로 잠그고 사유 한 줄을 보인다. Sync↔Publish 상호 잠금은 U1 #2가 이미 세운 배선을 넓힌다. 온보딩 ②의 탐지 뒤 샘플 로드 대기는 #23의 지연 문구로 다룬다.
- [x] **#23** 🟡 긴 실행에 시간에 비례한 안내가 없다.
  - 리포 탐지(`components/onboarding/new-project.tsx:235`, `components/onboarding/steps/files.tsx:227`, `add-sources-modal.tsx:50`)는 30초 이상 걸릴 수 있는데, 스켈레톤과 고정 문구 "Reading repo · branch…"뿐이다.
  - `addSurfaces`(첫 적재 포함)와 Sync도 버튼 스피너 하나뿐이다.
  - Publish의 `Progress`(`publish-button.tsx:296`)는 2.5초·6.5초 타이머로 가짜 단계를 넘긴 뒤, 마지막 단계에서 멈춘 채 돈다.
  - 방향: N초가 지나면 "큰 리포는 오래 걸린다"는 지연 문구 한 단계를 둔다. 가짜 단계는 실제 단계로 바꾸거나 걷어낸다.
- [x] **#25** ⚪ D1대로 정리한다: `sync-button.tsx:157` · `publish-button.tsx:99`의 "Syncing…"·"Publishing…" 라벨을 걷고 `loading`/`busy` 스피너로 바꾼다(죽는 문구는 `messages/en.tsx`에서 같이 지운다). DESIGN §6 "진행 중 상호 잠금" 행을 고친다. `components/reconnect-button.tsx:38`, `:58`은 `RefreshCw` 옆에 스피너를 **더한다** — "아이콘이 있는 버튼은 교체" 규칙대로 교체한다(`push-token-panel.tsx:49`가 맞는 형이다).

**진행 기록 (2026-09-25)**
- [Publish] 트리거는 `loading`/`busy`를 쓰지 않는다 — 도는 동안 누르면 진행 모달을 다시 연다(두 번 실행은 `running` 문이 막는다). 스피너 교체 + `aria-busy`만 건다. 진행 모달의 확정 버튼은 누른 확정 라벨을 유지한다.
- 지연 문구 임계값은 `SLOW_AFTER_MS = GITHUB_WAIT_MS`(8초, import로 묶었다). 모달을 다시 열면 0부터 다시 잰다(늦을 뿐 거짓이 아니다).
- 남은 후보: `reconnect-button.tsx`·`add-sources-modal.tsx`의 기존 `startTransition(async …)`가 ARCHITECTURE의 "긴 Action을 async transition으로 감싸지 않는다"와 어긋난다(범위 밖 — 후속).

**경계**: 이 배치는 U6 뒤에 시작한다(`publish-button.tsx`·`add-sources-modal.tsx`·`sync-button.tsx`가 겹친다).

---

## 문제없음 확인 (회귀 금지 목록)

- 목록 → Home, `/account` 진입, Logs 첫 진입은 골격이 즉시 뜬다. 네 골격(`projects`·`(home)`·`logs`·`account`)의 치수에서 코드상 어긋남은 찾지 못했다(Account의 Sessions 카드, Home 배너 높이는 DESIGN이 수용한 대가다).
- [New project] 모달 열기는 pending 스피너가 있다. 닫기는 가로챈 경우 `back`, 직접 진입한 경우 `replace(/projects)`로 갈린다(`new-project.tsx:423-426`).
- 늦은 응답 방어: Sources 상세(`sources-screen.tsx:47-58` — sequence·selection), Publish 미리보기·Sync 준비(`publish-button.tsx:50-66`, `home/sync-button.tsx:66-82` — 세대 카운터).
- 저장 중 다른 칸 입력 보존, 행 재정렬 없음, 포커스 착지.
- redirect로 끝나는 action(초대 수락·로그인·연결)은 `useFormStatus`·transition 덕에 이동할 때까지 스피너가 유지된다.
- 모든 검색창이 Enter 제출이라 입력 중에는 화면이 멈추지 않는다(#15는 제출 **뒤**의 문제다).
- `not-found`는 `[slug]`·`[surfaceSlug]`·루트에 있고, 루트 `error`와 `global-error`는 `retry`를 쓴다.
