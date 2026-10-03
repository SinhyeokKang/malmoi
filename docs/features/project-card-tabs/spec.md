# project-card-tabs — spec

Home(`/projects/[slug]`) 오른쪽 `Project` 메타 열을 **탭 셋(Overview · Sync · Publish)** 으로 재편하고,
그 정보 구성을 **지금의 데이터 모델**(다중 소스 · 소스별 적재 상태 · 보류 게이트 · 전달 불변식)에 맞게 다시 짠다.

## 사용자

**둘 다 — 단 주 독자는 개발자(OWNER)다.** Home의 게이트는 `translation:write`라 EDITOR도 이 열을 본다.
리포·적재·보류는 OWNER가 판단하고 고치는 사실이고, EDITOR가 이 열에서 답을 구하는 질문은 "내 편집이 나갔나"(Publish) 하나다.
두 요구가 갈리는 지점: OWNER는 소스별 실패 원인까지 보고 싶고, EDITOR에게 그것은 소음이다 → 실패의 **"무엇을 하라"** 와
**상태·사유**는 지금처럼 배너·`Needs your attention`이 들고, 이 열은 **사실만** 든다(`components/home/meta-column.tsx:22` 머리 주석의 "변하지 않는 사실만"을 잇는다).

## 문제 (관측)

1. **한 행에 사실이 넷까지 인라인으로 붙는다.** `Last sync` 값이 `[Nightly sync] 1d ago · [Sync failed] 10m ago · [Held]` —
   주체 배지 · 성공 시각 · 실패 배지 · 실패 시각 · 보류 배지가 한 줄에 흐른다(`components/home/meta-column.tsx:135-185`의 `lastSync`).
   `Last publish`도 `Pull request #127 · [Nightly publish] 2d ago`로 셋이다. 320px 열에서 줄바꿈되며 어느 조각이 어느 사실에 붙는지 안 읽힌다.
2. **로케일이 소스를 무시하고 합쳐진다.** `Locale`의 키는 `@@id([projectId, surfaceId, code])`인데, Home이 전 소스의 코드를
   `Set`으로 합쳐 한 행에 늘어놓는다(`page.tsx:362`의 `metaRows({ locales: [...new Set(...)] })`). `web`에만 `ja`가 있어도 프로젝트 전체가 `ja`를 가진 것처럼 읽힌다.
3. **한 행이 서로 다른 소스의 사실을 섞는다.** `Last sync` 시각은 **전 소스 `lastImportedAt`의 최댓값**(`lib/home/sync-time.ts`의 `lastSyncTime`)이고,
   같은 행의 실패는 **가장 나쁜 소스 하나**(`lib/projects/list.ts`의 `worstFailingSurface`)다. `web` 12시간 전 성공 + `emails` 10분 전 실패가 한 줄에서
   "12시간 전에 동기화됐고 10분 전에 실패했다"로 읽힌다 — 같은 실행처럼 보이지만 다른 소스다.
4. **카드가 2026-09-15 재편 이후의 모델을 모른다.** 그 뒤 들어온 것: 다중 소스와 소스별 적재 상태,
   보류 게이트(09-18 편집 · 09-30 열린 PR · fail-closed `pr-check-failed`), 전달 불변식(`DeliveryConfirmation` · `SyncRun.withheld`),
   사건 기반 실행 주체(`ProjectEvent` · `triggerOf`), 소스별 기준 로케일 선언. 행 목록은 그 전 그대로다.

## 완료 조건 (검증 가능한 문장)

- [ ] 메타 열이 탭 셋 `Overview` · `Sync` · `Publish`를 갖고, 탭 하나의 패널만 보인다. (DOM 테스트)
- [ ] **한 행 = 라벨 하나 + 사실 하나.** 값 안에 `·`로 이어 붙인 둘째 사실이 없다. 상태 배지는 그 행의 사실 자체일 때만 선다
      (예: D2-a의 소스 행 값이 `[Sync failed]`). (`metaTabs` 단위 테스트가 행 모양을 고정 · DOM 테스트가 값 안 `·` 0건을 센다)
- [ ] 로케일이 카드에 나타나지 않는다(D1=(a)) — `Sources` 행이 Sources 화면으로 가는 링크다. (단위 테스트 — 로케일 행 kind가 사라졌다)
- [ ] `Sync` 탭의 각 사실이 **어느 소스의 것인지** 화면에서 특정된다 — 다른 소스의 시각과 실패가 한 행에 서지 않는다. (단위 테스트)
- [ ] 키보드: 탭 목록이 `tablist`/`tab`/`tabpanel` 역할이고 ←/→·Home/End로 이동, 패널이 탭 이름으로 라벨된다. (DOM 테스트 + CDP 접근성 트리 실측)
- [ ] 랜드마크 `complementary` 이름 `Project`가 유지되고 `Settings ›` 바닥 링크가 남는다(OWNER). (`home-landmarks.test.tsx` green)
- [ ] 아래 **기준 아트보드** 각각에서 패널 내용이 Claude Design 핸드오프와 같다. (`/design-sync` 수동 실측 — 밟지 못한 갈래는 미검증으로 적는다)
      기준 아트보드(brief와 같은 목록): `2a` 기본(소스 1·2개) · `2a` 빈(첫 적재 전) · `2b` 한 소스 실패 / 일부 반영 · `2c` 미연결 · `2d` 보관 · `2e` 로딩 골격 ·
      한 번도 Publish 안 함 · 한 소스만 첫 적재 전 · 보류 늦게 도착.
- [ ] 로딩 골격(`(home)/loading.tsx`)이 탭 머리 + 기본 탭 패널 치수와 같고, 바닥 링크는 `canOpenSettings`일 때만 그린다(EDITOR 45px 튐 해소). (수동 실물 대조 — `/design-sync` `2e`)
- [ ] Home 조회 라운드가 늘지 않는다 — 새 조회가 생기면 기존 `Promise.all` 한 라운드 안이다. **새 GitHub 호출은 0이다.**
- [ ] `pnpm gate` green. DESIGN §6.64 · DIRECTORY · CLAUDE.md(프리미티브 수) 갱신.

## 사실 인벤토리 (2026-10-04 사용자: "세로 공간은 충분하니 최대한 넣고, 불필요한 것은 디자인 라운드에서 뺀다")

**원칙에 걸리는 행은 spec이 먼저 뺐다** (2026-10-04 `/feature-review` — 아래 "넣지 않는 행"). 남은 행은 **기본값이 "넣는다"** 이고 디자인 라운드가 지우는 쪽으로 판정한다.
비용 열: **0** = Home 조회가 이미 고른다 · **sel** = 기존 조회의 select에 컬럼만 더한다(라운드 불변) · **shape** = 이미 고르지만 반환 모양이 바뀐다 · **gh** = 이미 일어나는 GitHub 호출의 결과(늦게 도착).
⚠️ **라벨은 13px로 96px 라벨 열(`components/ui/facts.tsx:20` `w-24`) 안에 들어가야 한다** — 넘으면 줄이 바뀐다.

### Overview 탭

| 행 | 값 | 출처 | 비용 |
|---|---|---|---|
| Repository | `owner/name` 링크 · 끊김이면 링크 없이 연결 상태 배지가 값 | `Project.repoOwner/Name` · `loadConnectionHealth` | 0 |
| Connection | `Connected` / `Not connected` / `Disconnected` / `Wrong repository` (Repository 행에서 떼어 독립 행으로 둘지) | `connectionProblem` | 0 |
| Branch | 기준 브랜치 | `baseBranch` | 0 |
| Sync branch | Malmoi PR이 쓰는 브랜치 | `syncBranchFor(slug)` | 0 |
| CI | push 토큰 설정 여부(`Configured` / `Not set up`) | `pushTokenHash !== null` | sel |
| Sources | 개수 → Sources 화면 링크. **소스가 1개면 숨긴다**(지금 규칙 `lib/home/meta.ts:91`의 `surfaces > 1`) | 비보관 표면 수 | 0 |
| Default source | 기본 소스 slug. **소스가 1개면 숨긴다** | `defaultSurface` | 0 |
| Keys | 전 소스 합 | `aggregates.keyTotals`의 합 | 0 |
| Members | 멤버 수 | `_count.members` | 0 |
| Pending invites | 대기 초대 수 | `_count.invitations` — 술어는 `acceptedAt: null` **그리고** `expiresAt > now`(`lib/auth/query.ts:151`)를 **추출해 공유**한다(design §6) | sel |
| Created | 상대 시각 | `createdAt` | 0 |
| Archived | 상대 시각 (보관일 때만) | `archivedAt` | 0 |

### Sync 탭

| 행 | 값 | 출처 | 비용 |
|---|---|---|---|
| Run | 마지막 성공 적재의 실행 종류 배지 | `loadHomeRuns` → `triggers.sync` (page.tsx의 변수명) | 0 |
| Synced | 마지막 성공 시각 (D2-b면 프로젝트 합계, D2-a면 소스 행으로 내려간다) | `lastImportedAt` | 0 |
| Hold | `Held` 배지 (D4가 이 탭을 고를 때) | `planHomeHold` (PR 조회는 늦게 도착) | 0 / gh |
| Values changed | **마지막 성공 적재 사건 하나**가 바꾼 셀 수 — 프로젝트 단위 | IMPORT payload `changedValues` | shape |
| Keys seen | 같은 사건이 본 키 수 — 프로젝트 단위 | IMPORT payload `keys` | shape |
| (소스별) Commit | 짧은 SHA → GitHub 커밋 링크 | `lastCommitSha` (이미 select됨) | 0 |
| (소스별) Committed | 커밋 시각 (적재 시각과 다르다 — malmoi#81) | `lastCommitAt` | 0 |
| (소스별) Synced / 상태 | D2-a의 행 본체 — 성공 시각, 또는 진행 중 · 실패 · 일부 반영이 그 행의 값 | 위와 같은 컬럼의 소스별 값 | 0 |

⚠️ **`Values changed`·`Keys seen`은 사건 단위(프로젝트 값)다** — D2-a의 소스 행 사이·옆에 두면 문제 3이 탭 안에서 되살아난다. `Run` 옆(프로젝트 단위 묶음)에만 선다.
`Run`과 같은 `advancedSyncTime` 게이트(`lib/home/meta.ts:129`)를 따르고, 값이 없으면 `0`으로 접지 않고 행을 숨긴다.

### Publish 탭

| 행 | 값 | 출처 | 비용 |
|---|---|---|---|
| Pull request | `#127` 링크 | `lastPrUrl` | 0 |
| PR state | `Open` / 열린 PR 없음 / `Couldn't check`(조회 실패 — fail-closed라 보류가 선다) **갈래 셋**. ⚠️ **새 GitHub 호출을 만들지 않는다** — `planHomeHold`가 PR을 조회하지 않는 갈래(미전달 편집 있음·보관·미연결·게이트 미적용)에선 행을 그리지 않는다("없음"으로 그리면 거짓) | `loadOpenPrUrlMemo` | gh |
| Published | 시각 | `lastPublishedAt` | 0 |
| Run | 실행 종류 배지 | `triggers.publish` | 0 |
| Files changed | 바꾼 파일 수 | `SyncRun.changed` | sel |
| Held back | 이번 PR에 못 실은 편집 수 (다음 Publish 대기) | `SyncRun.withheld` | sel |
| Dropped | writer가 버린 항목 수 | `SyncRun.warnings` | sel |
| Sources | 그 PR에 실린 소스 | PUBLISH payload `surfaceSlugs` | shape |
| Unsent now | 지금의 미전달 편집 수 | `counts.toSend` (카운트 카드 `To send`와 같은 값 — 두 번 **그리기**만 한다) | 0 |

⚠️ **인벤토리의 어느 행도 행위자(사람 이름·이메일)를 싣지 않는다** (POSTMORTEM 2026-09-29 #146 — Home 사건 조회는 행위자를 고르지 않는다). 실행 주체는 종류 배지뿐이다.

### 넣지 않는 행 (2026-10-04 `/feature-review`)

| 행 | 이유 |
|---|---|
| 로케일 · 소스별 Base locale · Format · Path · 소스별 Keys (D1=(a), D7 소멸) | PRODUCT §7.7 결정 4 — 기준 로케일과 언어 진단은 Sources 상세가 소유한다. 메타 열 안 소스별 소구역은 project-home 비목표("표면 목록 블록의 부활")를 다시 연다. `Sources` 행이 그 화면으로 가는 링크다 |
| Next nightly (두 탭) | 두 탭 중복 · cron은 프로덕션에서만 돌아 preview·로컬에서 거짓 · `vercel.json` 값의 손 사본 |
| Status · Reason · Last failed | 배너·`Needs your attention`의 셋째 사본 — "사실만" 원칙과 충돌. Last failed는 조회도 하나 늘린다. 소스별 실패는 D2-a 소스 행의 값으로만 선다 |
| Last nightly check | 스킵·보류 방문도 쓰는 정렬 힌트(`lastNightlyAt` 스키마 주석) · 라벨이 96px 열을 넘는다 |

## 결정됨 (2026-10-04 `/feature-review`)

- **D1 = (a)** — 로케일을 카드에서 뺀다. `Sources` 행이 Sources 화면 링크(소스 2개 이상일 때만 선다).
- **D6 이름 충돌** — 탭 이름을 `Overview` · `Sync` · `Publish`로 한다. 3등분 세그먼트의 칸 내용 폭(74~79px)에 `Last publish`(84.6px)가 안 들어가 `Last publi…`로 잘렸다. 카드 머리 `Project`(`h2#home-meta-title`)와 랜드마크 이름은 그대로다. 탭 목록의 접근 이름은 `Project details`.
- **D7 소멸** — D1=(a)로 Overview 탭에 소스별 소구역이 없다.

## 미결 — Claude Design 라운드에서 결정 (2026-10-04 사용자)

| # | 질문 | 후보 | 메모 |
|---|---|---|---|
| D2 | **Sync 탭의 축** | (a) 소스별 목록(행 = 소스, 값 = 그 소스의 마지막 성공 시각, 진행 중·실패·일부 반영이면 그 상태가 그 행의 값) + 탭 위쪽 프로젝트 단위 `Run`·`Hold`·`Values changed`·`Keys seen` · (b) 프로젝트 합계 행(`Synced` · `Run` · `Hold`) | (b)를 고르면 `Status` 행이 빠졌으므로 실패는 카드에 서지 않고 배너만 든다 — 문제 3은 "섞지 않음"으로 풀린다 |
| D3 | **인벤토리에서 더 뺄 행** | 위 세 표 — 기본값은 전부 넣는다 | `gh` 행(PR state)은 늦게 도착하고 일부 갈래에서 서지 않는다 |
| D4 | **보류(`Held`)는 어느 탭인가** | Sync(보류되는 것이 자동 적재다) · Publish(원인이 미전달 편집·열린 PR이다) | 사유 문장은 지금처럼 `To send` 카드 보조 줄이 든다 |
| D5 | **기본 탭 · 상태 신호** | 항상 `Overview` · 실패·보류면 `Sync`가 기본 · 탭 라벨에 상태 점/배지 | 배너가 실패를 이미 말한다 — 탭 신호가 셋째 사본이 되는지 본다. ⚠️ **판정 입력은 첫 렌더에 이미 아는 값(`failing`·`heldNow`)뿐이다** — 늦게 도착하는 PR 보류로 기본 탭을 바꾸면 착지 뒤 탭이 바뀐다 |
| D6 | **탭 목록의 자리** | 카드 머리 안 · 머리 바로 아래 · 머리 대체 | 머리를 대체하면 랜드마크 이름이 `aria-label`로 옮겨 가고 `home-landmarks.test.tsx`의 `labelledBy` 헬퍼를 고쳐야 한다(기대값 `Project`는 그대로) |
| D8 | **탭마다 높이가 다르다** | 받아들인다(`Settings ›`가 탭마다 위아래로 움직인다) · 패널 최소 높이를 가장 긴 탭에 맞춘다 | aside가 `h-fit`이라 왼쪽 열엔 영향이 없다 |

## 비목표

- **스키마 변경 없음.** 인벤토리의 사실은 전부 이미 있다 — 새 컬럼을 요구하는 행(예: PR 머지 여부, 다음 실행 예약)은 넣지 않는다.
- **새 GitHub 호출 없음** — PR state는 이미 일어나는 조회의 결과만 쓴다(malmoi#107 착지 병목).
- 탭 선택을 URL(`?tab=`)·저장소에 남기지 않는다 — 착지할 때마다 기본 탭이다.
- 소스별 Publish 이력 · 실행 목록 — Logs가 소유한다. 이 열은 "마지막" 하나씩만 든다.
- 배너 · `Needs your attention` · 카운트 카드 넷 · `Recent logs`는 건드리지 않는다.
- 이 열에서 Sync·Publish·Reconnect 같은 **동작**을 하지 않는다 — 동작은 머리 툴바와 배너가 든다.
- 다른 화면(번역 툴바·Sources·Settings)의 같은 사실 표기를 이번에 맞추지 않는다 — 어긋남은 `/ux-audit` 후보로 남긴다.
