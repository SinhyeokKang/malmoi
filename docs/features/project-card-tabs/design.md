# project-card-tabs — design

⚠️ **시각·행 구성의 정본은 Claude Design 핸드오프다** (신규 형 — 메타 열의 탭은 캔버스 `design_handoff_project_home`에 없다).
이 문서는 핸드오프가 무엇을 결정해 와야 하는지(`brief.md`)와, 어떤 결론이 와도 변하지 않는 배선·판정·함정을 적는다.
spec의 미결(D2·D3·D4·D5·D6 자리·D8)이 닫히면 §2의 행 표를 확정하고 `tasks.md`의 ⏸ 표시를 푼다.

## 1. 영향 받는 흐름

**편집 UI의 Home 한 화면**이다. push·pull·export·`/api/*`·MCP 경로는 건드리지 않는다.

| 파일 | 변경 |
|---|---|
| `lib/home/meta.ts` | `metaRows` → **탭별 행을 내는 `metaTabs`**로 교체. `SUCCESSFUL_IMPORT_RESULTS`·`advancedSyncTime`은 그대로. `homeTriggers`는 사건 payload 수치(`changedValues`·`keys`)까지 내도록 반환형이 넓어진다 |
| `lib/home/sync-time.ts` | 소스 하나의 시각 판정(`SyncTime`의 `"unrecorded"` 갈래 포함)을 소스별로 쓸 수 있게 한다(D2-a일 때) |
| `lib/home/runs.ts` | `loadHomeRuns`의 반환형이 `HomeTriggers`에서 넓어진다 — payload는 이미 고르지만(`runs.ts:15`) `homeTriggers`가 버린다. 성공 Publish 사건에 `syncRun { changed, withheld, warnings }` 조인 추가. **행위자 컬럼을 넣지 않는다** |
| 대기 초대 술어 | `acceptedAt: null` + `expiresAt > now`를 **공유 헬퍼로 추출**한다 — 지금 인라인 사본이 넷이다(`lib/auth/query.ts:151` · `issue.ts:198` · `app/invite/actions.ts:102` · `lib/mcp/tools/project.ts:113`). 이번엔 Home이 새 소비자이고 기존 사본은 **같은 배치에서 이관**한다(CLAUDE.md "실재하는 손 사본 이관은 중복 제거") |
| Home `project` select | `pushTokenHash`(값이 아니라 `!== null`만 쓰고 화면·props로 넘기지 않는다) · `_count.invitations`(위 술어). ⚠️ **`now`가 project 조회 뒤에 만들어진다**(`page.tsx:129`) — `_count` where에 넣으려면 앞으로 옮긴다 |
| `components/ui/segment.ts` | **신규 헬퍼(문자열 상수만)** — 트랙·칸·선택·비선택 클래스. `.ts`라 프리미티브 수에 안 든다 (§3) |
| `components/ui/segmented-control.tsx` | 상수를 `segment.ts`에서 import, `SegmentBody`를 **export** — 동작 불변 |
| `components/ui/tabs.tsx` | **신규 프리미티브** (§3) |
| `components/home/meta-column.tsx` | 탭 머리 + 패널 셋. 값 렌더(`value()`)는 kind별 그대로 재사용 |
| `app/(edit)/projects/[slug]/(home)/page.tsx` | `metaRows(...)` 호출을 `metaTabs(...)`로. 로케일 합집합 계산 제거(D1=(a)) |
| `app/(edit)/projects/[slug]/(home)/loading.tsx` | 골격을 탭 머리 + 기본 탭 패널 치수로. 바닥 링크를 `canOpenSettings`일 때만(기존 결함 — EDITOR에서 45px 튐) |
| `messages/en.tsx` | `m.home.meta.tabs.*` · 새 행 라벨 |

## 2. 순수 함수 (`/tdd` 진입점)

### `metaTabs(input) → { overview: MetaRow[]; sync: SyncTab; publish: MetaRow[] }`

⚠️ **입력은 `metaRows`의 것과 다르다** — 지금 입력은 `surfaces: number` 하나와 실패한 소스 하나의 시각·코드뿐이다(`meta.ts:54-79`). 바뀌는 것:

- **`locales: string[]`(합집합) 입력이 사라진다** (D1=(a)). 로케일 정렬 공유 함수는 필요 없어졌다.
- **소스별 적재 입력이 들어온다** — `surfaces: { slug; lastImportedAt; lastCommitAt; lastCommitSha; lastImportError; lastImportFailedAt; lastImportStartedAt }[]`(소스 순서 = `slug asc`).
- **T3 조회가 낼 `sel`·`shape` 필드가 입력 형에 처음부터 있다** — `ciConfigured: boolean` · `pendingInvites: number` · 성공 Publish의 `changed`·`withheld`·`warnings` · `surfaceSlugs` · 성공 적재의 `changedValues`·`keys`. **T1이 이 형을 고정하고 T3이 그 형에 맞춘다.**
- **EDITOR 행 필터의 자리** — 판정은 디자인 라운드 뒤로 미뤘다(2026-10-04 사용자). 행을 거르게 되면 JSX가 아니라 **`metaTabs` 입력(권한)** 으로 받아 단위 테스트가 전수로 고정한다. RSC 페이로드에는 세 패널이 전부 실리므로(탭은 아무것도 숨기지 않는다) 거르기는 서버에서만 차단이다.
- **`lastSync` kind가 쪼개진다** — 한 행이 들던 주체·시각·실패·보류가 각자 행이 된다. D2-a 기준 형:
  ```ts
  type SyncTab = {
    run: Trigger | null;              // 마지막 성공 적재의 주체 (homeTriggers.sync)
    changedValues: number | null;     // 같은 사건의 수치 — 프로젝트 단위, advancedSyncTime 게이트, null은 행 숨김
    keys: number | null;
    held: HoldReason | null;          // 지금의 판정 (planHomeHold) — D4가 Publish 탭을 고르면 publish 쪽으로 간다
    surfaces: SurfaceSyncRow[];       // 행 = 소스 하나
  };
  type SurfaceSyncRow =
    | { slug: string; status: "synced"; at: Date }
    | { slug: string; status: "unrecorded" }                                         // 적재됐지만 시각 컬럼 이전 (malmoi#81, SyncTime의 갈래)
    | { slug: string; status: "notSyncedYet" }
    | { slug: string; status: "syncing" }                                            // lastImportStartedAt !== null — 지난 실패를 이긴다
    | { slug: string; status: "syncFailed" | "partiallySynced"; at: Date | null };   // 실패 시각(nullable 컬럼). 성공 시각은 이 행에 붙이지 않는다
  ```
  ⚠️ **실패 판정은 `failing`·`failureState`를 부른다**(`lib/projects/list.ts:139` 근처) — 배너·목록 칩·Settings 배지와 같은 술어여야 한다. 새 술어를 만들면 그것이 네 번째 사본이다.
  `lib/status/__tests__/cross-screen.test.ts`의 판정 묶음 `REAL`(:39-43)엔 지금 `failureState`가 없고 사본 `failureKey`(:87)만 있다 — **`metaTabs`의 소스 행 판정을 `REAL`에 넣는다**(T2).
  ⚠️ **"지금 도는 중"(`lastImportStartedAt !== null`)이 지난 실패를 이긴다** — `planHomeState`와 같은 순서. `syncing` 갈래가 없으면 `failing`이 false일 때 `synced`·`notSyncedYet`으로 떨어져 거짓이 된다.
- **`lastPublish` kind가 쪼개진다** — `Pull request` · `PR state` · `Published` · `Run` · `Files changed` · `Held back` · `Dropped` · `Sources` · `Unsent now` (D3 결과로 줄어든다).
  `PR state`는 `{ open } | { none } | { checkFailed }` 셋이고, `planHomeHold`가 PR을 조회하지 않은 갈래에선 행이 없다(새 GitHub 호출 0).
- **`Sources`·`Default source`는 소스 2개 이상일 때만** — 지금 규칙(`meta.ts:91`) 그대로.
- **상태 갈래는 그대로 판정 입력이다** — `not_connected`면 리포 행이 링크를 잃고 배지가 선다, `archived`면 `Archived` 행. 이 매트릭스를 JSX의 `&&`로 흩지 않는다(지금 `metaRows` 머리 주석의 이유 그대로).

테스트(`lib/home/__tests__/meta.test.ts` 갱신 — `sync-time.test.ts:42-44`의 `metaRows` 참조도 함께):
- 탭마다 행 kind 목록을 **`HomeState` 값 전부** × 소스 1·2·5개로 전수 고정.
- 소스 A 성공 + 소스 B 실패 → 두 행이 따로 서고, A 행에 실패가, B 행에 A의 시각이 없다 (spec 문제 3의 회귀).
- 진행 중(`syncing`)이 지난 실패를 이긴다 · 일부 소스만 첫 적재 전(`notSyncedYet`) · 실패 시각 `null`.
- 로케일 행이 어느 입력에서도 나오지 않는다 (spec 문제 2의 회귀).
- `"unrecorded"`·`null` 시각과 `null` 수치가 `Never`·`0`으로 접히지 않는다 (malmoi#81).
- `Values changed`·`Keys seen`이 `advancedSyncTime`을 못 지난 partial 사건의 수를 싣지 않는다.
- 한 번도 Publish 안 함(`lastPublishedAt` null) · 보류 대기 중(`held: null`) · 보관된 기본 소스(`defaultSurface` null) · PR state 세 갈래 + 조회 안 한 갈래(행 없음).
- 소스 0개는 `planProjectReadiness`가 `ProjectNotReady`로 먼저 끊으므로(`page.tsx:124`) 대상이 아니다.

## 3. 탭 프리미티브 — `components/ui/tabs.tsx`

**지금 리포에 탭 프리미티브는 없다.** 모양은 세그먼트 형을 쓴다 (2026-10-04 사용자: "그 스타일을 살려 프리미티브로 새로 만든다").

| 선례 | 언제 · 어디 | 형 |
|---|---|---|
| **프로젝트 오른쪽 패널** `ProjectPanel` | 2026-09-11 Stage 8 (`23f0f503`, 시안 `212:995`) · `components/shell/project-panel.tsx` — 지금 없다 | 320px `<aside>` 위에 `General` · `Changes`를 `SegmentedControl`로 **전폭**(칸 `flex-1`, `p-2`) 세웠다. ⚠️ **의미는 탭이 아니라 radiogroup이었고**, 짧은 라벨 둘이었다 — 라벨 셋이 들어간다는 근거가 아니다(그래서 탭 이름을 줄였다, spec D6). 같은 커밋에서 aside와 radiogroup이 둘 다 `Project panel`로 읽힌 이름 충돌도 있었다. 내용은 8-P로 미뤘다가 패널째 사라졌다 |
| `/projects` 필터 탭 여섯 | 2026-09-11~13 (`eeff006c`가 사용처 제거 · `6003fb8f`가 export 삭제) | `SegmentedLinks`(URL 판) — 같은 트랙·칸 형 |

형(`components/ui/segmented-control.tsx`의 상수 — 지금은 export되지 않은 로컬 `:23-27`):

| 부분 | 클래스 |
|---|---|
| 트랙(`TabsList`) | `bg-canvas flex items-center gap-1 rounded-lg p-1` — **항상 전폭**(소비자 하나라 전폭 여부 prop을 열지 않는다) |
| 칸(`TabsTrigger`) | `inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 py-1 text-center text-sm flex-1` — `rounded-md` = 10px(트랙 12 = 칸 10 + `p-1` 4 동심, `segmented-control.tsx:16-21`) |
| 선택 | `bg-background shadow-low font-medium` — ⚠️ **`data-[state=active]:`로 걸지 않는다**(아래) |
| 비선택 | `text-muted-foreground hover:text-foreground` |
| 포커스 | `focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none` — **리터럴로 `tabs.tsx`에 둔다**(focus-ring 스캐너 `focus-ring.test.ts:225`가 소스의 리터럴을 센다. 지시자 원이 없어 링이 빠지면 키보드 위치를 알 수 없다, DESIGN §7) |
| 칸 내용 | `SegmentBody`(export해서 재사용) — icon → label(`truncate`) → `CountBadge` 순서 |

- ⚠️ **형을 손으로 베끼지 않는다** — 트랙·칸·선택·비선택 문자열 상수를 `components/ui/segment.ts`로 꺼내 **둘이 같은 상수를 import**한다. `SegmentBody`는 JSX라 `.ts`에 둘 수 없다 — `segmented-control.tsx`에서 export하고 `tabs.tsx`가 import한다(`.tsx`를 새로 만들면 프리미티브가 49개가 되고 focus-ring 스캐너 `FILES`에 걸린다). 이 추출이 `SegmentedControl`의 동작을 바꾸지 않음을 기존 테스트로 확인한다.
- ⚠️ **선택 스타일은 제어 컴포넌트로 건다** — `Tabs`가 `value` 상태를 들고 `SegmentedControl`(`:105`)처럼 같은 `SELECTED` 상수를 **JS로 조건부** 붙인다. `data-[state=active]:${SELECTED}`로 이어 붙이면 Tailwind가 소스 리터럴만 스캔해 **CSS가 생성되지 않는데**, jsdom 테스트는 class 문자열만 보므로 green이 난다(POSTMORTEM 2026-09-24 "jsdom에서만 참" 부류). 접두사 붙은 리터럴 사본을 따로 두면 그것이 드리프트다.
- ⚠️ **`SegmentedControl`을 탭으로 쓰지 않는다** — 그것은 `radiogroup`이고 패널 연결(`aria-controls`)이 없다(DESIGN §6.4 :721). **모양이 같고 의미가 다른 두 프리미티브**다: 보기 전환 값 = `SegmentedControl`, 패널을 바꾸는 탭 = `Tabs`. DESIGN §6.4에 그 경계를 한 줄로 적는다.
- **Radix `Tabs`를 `radix-ui` 단일 패키지에서 쓴다** — `@radix-ui/react-tabs` 1.1.21이 `radix-ui@1.6.7`의 전이 의존성으로 이미 설치돼 있다(새 의존성 0). Radix 부품 일곱 → **여덟**, 프리미티브 모듈 47 → **48**(CLAUDE.md:75 스택 표 · DESIGN.md:52 스택 표 갱신). roving tabindex·←/→·Home/End·`aria-controls`/`aria-labelledby`를 라이브러리가 든다(테스트로 확인).
- API는 소비자 하나(Home 메타 열)가 쓰는 만큼만: `Tabs`(Root, 제어) · `TabsList`(`label`) · `TabsTrigger` · `TabsContent`. `orientation`·`activationMode`·전폭 여부 같은 축을 열지 않는다.
- 카드 머리와의 배치(머리 안 · 머리 아래 · 머리 대체 — D6)는 핸드오프가 정한다. 형 자체는 확정이라 **T4는 핸드오프를 기다리지 않는다**(D6는 aside 쪽 문제라 `TabsList` API에 닿지 않는다).
- ⚠️ **Radix Tabs는 비활성 패널을 언마운트한다** — 그리고 `useArrived`는 `useState(null)`로 시작해 effect에서 `.then`으로 값을 받으므로(`components/use-arrived.ts:18-25`) **다시 마운트되면 한 프레임은 값 없이 그려진다.** `Hold`·`PR state`가 독립 행이면 탭을 오갈 때마다 행이 끼어들며 높이가 튄다.
  → **늦게 오는 promise는 항상 마운트된 탭 껍데기에서 한 번 구독하고(`useArrived`), 값을 패널로 내린다** (2026-10-04 사용자). 재마운트에도 값이 남는다. 첫 도착 때 행 자리를 미리 고정할지는 brief 결정이다. `forceMount`를 쓰지 않는다(숨은 패널 셋이 접근성 트리에 남는다).
- ⚠️ **비활성 탭의 `aria-controls`는 없는 id를 가리킨다** — 언마운트의 알려진 결과다. CDP 실측 표에 미리 적어 오진을 막는다.
- ⚠️ **jsdom + Radix + `user-event`는 실시간 지연이 있다** (POSTMORTEM 2026-09-13) — 탭 DOM 테스트 파일 머리에만 `vi.setConfig({ testTimeout: 20_000 })`. Radix `TabsTrigger`는 `onMouseDown`으로 선택하므로 `fireEvent.click`으로는 안 바뀐다 — **`user-event`를 쓴다.**
- ⚠️ **focus-ring 스캐너**: `radix-ui`를 import하는 `ui/` 파일은 `RADIX_FIXTURES`(`focus-ring.test.ts:156`) 등록이 필수이고 면제 목록은 더 얹지 않는다 — `tabs.tsx` 픽스처를 추가한다.

## 4. 서버/클라이언트 경계

탭 전환은 클라이언트 상태라 `MetaColumn`(지금 서버 컴포넌트)의 일부가 클라이언트가 된다.

- **탭 껍데기만 `"use client"`** 로 두고, 패널 내용은 서버가 렌더한 `ReactNode`를 children으로 넘긴다(Radix `Tabs.Content`에 서버 노드를 꽂는다). 그러면 `relativeTime(row.at, now)`·`pullNumberFrom` 등이 서버에 남는다.
- **탭 라벨도 서버가 props로 넘긴다** — 그러면 껍데기는 `components/ui/tabs`와 `components/use-arrived`만 import한다(`m`은 `@/lib/i18n` 잎 모듈이라 허용 목록에 있지만 필요가 없다).
- 늦게 오는 promise(보류 판정·PR state)는 껍데기가 props로 받아 구독한다(§3) — promise는 서버에서 출발해 RSC로 직렬화된다(지금 `HoldLater`와 같은 경로).
- ⚠️ **클라이언트 그래프에 `lib/**`를 끌어들이지 않는다** (POSTMORTEM 2026-09-07 — 클라이언트 컴포넌트 하나가 `lib/onboarding/message.ts`를 물어 `ts-morph` 7.2MB가 번들에 들어갔다). `components/__tests__/client-graph.test.ts`가 지킨다.
- `now`는 서버에서 한 번 만든 것을 쓴다(지금 규칙 그대로) — 클라이언트에서 다시 만들면 상대 시각 기준이 갈린다.

## 5. 접근성

- 바깥 `<aside aria-labelledby="home-meta-title">`(`complementary` · `Project`)는 유지한다 — `home-landmarks.test.tsx`가 고정.
  **D6의 결론이 머리 `h2`를 없애면** 랜드마크 이름은 `aria-label`로 옮기고, 테스트의 `labelledBy` 헬퍼(`:25-30`, `aria-labelledby`만 읽는다)를 고친다 — 기대값 `Project`는 그대로.
- 접근 이름 셋이 겹치지 않는다: aside `Project` · 탭 목록 `Project details` · 첫 탭 `Overview`.
- 패널 안은 지금처럼 `<dl>`(`Fact`) — 탭 패널이 `tabpanel` 역할과 탭 이름 라벨을 갖는다.
- CDP 접근성 트리 실측 표(DESIGN §6.64)에 탭 행을 추가한다. jsdom은 accname을 계산하지 않는다.

## 6. 스키마 · 환경변수 · 불변식

- **스키마 변경 없음.** 인벤토리(spec)의 사실은 전부 기존 컬럼·payload다(`pushTokenHash` schema:51 · `SyncRun.changed`·`withheld`·`warnings` :406-411). `sel` 행은 select 확장, `shape` 행은 반환형 변경이고 조회 라운드는 그대로다 — `loadHomeRuns`는 바깥 `Promise.all`(page.tsx:139) 안에 있고 조인은 그 함수 안이다.
- **새 GitHub 호출 없음** — PR state는 `planHomeHold`가 이미 부르는 `loadOpenPrUrlMemo`의 결과만 쓴다.
- ⚠️ **`pushTokenHash`는 해시라도 RSC 페이로드에 싣지 않는다** — 서버에서 boolean으로 접고 그것만 넘긴다(조건부 렌더는 차단이 아니다 — RSC 페이로드에 실린 것은 노출된 것이다). 정적 검사로 고정한다(tasks T3).
- ⚠️ **대기 초대 수는 추출한 공유 술어**(수락·만료 둘 다 제외)를 쓴다 — 손 사본 금지(POSTMORTEM 2026-09-10: 두 조건을 함께 건다).
- **새 환경변수 없음.**
- **불변식 영향 없음** — 읽기 전용 화면이다. export 결정성·blob SHA·인증 경계(ARCHITECTURE §0·§1·§2·§6)에 닿지 않는다.
  인가: Home 최상단 `requireProjectAccess`가 그대로 든다. 탭은 표시이고 차단이 아니다. ⚠️ **EDITOR에게 새로 보이는 사실이 생긴다** — CI 설정 여부·소스별 Commit(리포 URL)·Sync branch. PRODUCT §7.7 결정 4(:807 "EDITOR에게 경로·형식·저장소/브랜치를 보내지 않는다")·:90(push 토큰은 `project:settings`)과 대조한 판정은 **디자인 라운드 뒤로 미뤘다**(2026-10-04 사용자). 지금 Home이 EDITOR에게 Repository·Branch를 이미 보이는 것도 같은 판정 대상이다. 거르면 §2의 `metaTabs` 입력으로 서버에서 거른다.
- **사건 행위자를 싣지 않는다** (POSTMORTEM 2026-09-29 #146) — `loadHomeRuns`에 select를 더할 때 `actor`·`actorUserId`를 넣지 않는다.

## 7. 문서 갱신 (태스크로 남긴다 — 이 스킬은 직접 고치지 않는다)

- DESIGN §6.64: 메타 열 행 · 메타 열 주체 행 · 로딩 골격 행(:1261 "메타 9" 기준이 바뀐다) · 접근성 표 · 이탈 표(핸드오프 기준으로 다시) · 실측 아트보드 표.
- DESIGN §6.4: `Tabs` 프리미티브 행과 `SegmentedControl`과의 경계. DESIGN.md:52 스택 표의 Radix 부품 수.
- CLAUDE.md:75 스택 표: 프리미티브 47 → 48, Radix 일곱 → 여덟(목록에 Tabs).
- DIRECTORY: `components/ui/tabs.tsx` · `components/ui/segment.ts` · 대기 초대 술어 헬퍼.
- PRODUCT §4.1(:292 근처) "Home `Last sync` 행에 `held until…`이 붙는다" 문장 — 보류 표기 위치가 D4로 바뀐다.
- 가이드: Home을 설명하는 페이지·스크린샷이 있으면 `/guide`·`/guide-shots` 후보(tasks T10).
- 범위 밖 언급만: `lib/home/meta.ts:77`·`lib/home/cards.ts:89,158` 주석의 "Suspense"는 실제로 `useArrived` effect 구독이다(`meta.ts`를 손댈 때 그 줄은 고친다) · 카운트 카드 골격 `gap-1.5`(`loading.tsx:59`) vs 실물 `gap-0.5`(`count-cards.tsx:106`).
