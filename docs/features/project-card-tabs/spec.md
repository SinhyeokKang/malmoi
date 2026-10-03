# project-card-tabs — spec

Home(`/projects/[slug]`) 오른쪽 `Project` 메타 열을 **탭 셋(Project · Sync · Publish)** 으로 재편하고,
그 정보 구성을 **지금의 데이터 모델**(다중 소스 · 보류 게이트 · 전달 불변식 · 사건 기반 실행)에 맞게 다시 짠다.
**시각·행 구성의 정본은 Claude Design `Project Home Meta Tabs v3.dc.html`이다**(2026-10-04 수령 · 리뷰 반영 — 아래 "결정").
**디자인 정본**: [Project Home Meta Tabs v3](https://claude.ai/design/p/b99d54cd-3034-44f1-8446-0a864da9d767?file=Project+Home+Meta+Tabs+v3.dc.html) — Claude Design 프로젝트 `b99d54cd-3034-44f1-8446-0a864da9d767`, 파일 `Project Home Meta Tabs v3.dc.html` (`/design-sync`는 DesignSync `get_file`로 이 경로를 읽는다). **이 기능은 정본 구현이다** — `/design-sync`(tasks T10)를 건너뛰지 않는다(2026-10-04 사용자).

## 사용자

**둘 다 — 단 주 독자는 개발자(OWNER)다.** Home의 게이트는 `translation:write`라 EDITOR도 이 열을 본다.
리포·적재·보류는 OWNER가 판단하고 고치는 사실이고, EDITOR가 이 열에서 답을 구하는 질문은 "내 편집이 나갔나"(Publish) 하나다.
두 요구가 갈리는 지점: OWNER는 소스별 실패 원인까지 보고 싶고, EDITOR에게 그것은 소음이다 → 실패의 **"무엇을 하라"** 와
**상태·사유**는 지금처럼 배너·`Needs your attention`이 들고, 이 열은 **사실만** 든다(`components/home/meta-column.tsx:22` 머리 주석의 "변하지 않는 사실만"을 잇는다).
**행은 역할과 무관하게 같다** (2026-10-04 사용자) — 역할이 바꾸는 것은 `Settings ›` 바닥 링크 하나다.

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
5. **Publish가 무엇을 얼마나 옮겼는지 기록이 없다** (2026-10-04 시안 리뷰) — Sync는 사건 payload `changedValues`가 "바꾼 값 수"를 들지만,
   Publish는 `SyncRun.changed`(파일 수)뿐이다. 두 탭이 같은 단위로 "무엇을 옮겼나"를 말할 수 없고 Logs도 Publish 행에 그 수가 없다.

## 완료 조건 (검증 가능한 문장)

- [ ] 메타 열이 탭 셋 `Project` · `Sync` · `Publish`를 갖고, 탭 하나의 패널만 보인다. 보이는 카드 머리는 없고 탭 목록이 머리다. (DOM 테스트)
- [ ] **한 행 = 라벨 하나 + 사실 하나.** 값 안에 `·`로 이어 붙인 둘째 사실이 없다. 상태 배지는 그 행의 사실 자체일 때만 선다
      (예: `Result` 행의 값이 `[Partially synced]`). 예외 하나 — `Members`의 `4 (2)`(멤버 수 + 대기 초대 수, 사용자 결정). (`metaTabs` 단위 테스트가 행 모양을 고정 · DOM 테스트가 값 안 `·` 0건을 센다)
- [ ] 로케일이 카드에 나타나지 않는다 — `Sources` 행이 Sources 화면으로 가는 앱 안 링크다. (단위 테스트)
- [ ] `Sync` 탭의 모든 행이 **같은 실행 하나**(마지막으로 시각을 전진시킨 IMPORT 사건)의 사실이다 — 다른 실행·소스의 시각과 결과가 한 탭에 섞이지 않는다. `Publish` 탭도 같은 규칙(마지막 성공 Publish 실행 하나). (단위 테스트)
- [ ] Sync 실패·진행 중이 카드를 바꾸지 않는다 — 실패는 배너가 든다. (단위 테스트)
- [ ] Publish 실행이 **리포 파일에서 바꾼 값 수(수정+추가)** 를 기록하고, Publish 탭 `Changed`와 Logs의 Publish 상세가 그 수를 보인다. 스킵은 `0`, 실패·기록 이전은 `null`(Home은 행 없음 · Logs는 `—` + not recorded). (단위 테스트 + 통합 테스트)
- [ ] 키보드: 탭 목록이 `tablist`/`tab`/`tabpanel` 역할이고 ←/→·Home/End로 이동, 패널이 탭 이름으로 라벨된다. (DOM 테스트 + CDP 접근성 트리 실측)
- [ ] 랜드마크 `complementary` 이름 `Project`가 유지되고(`aria-label`), `Settings ›`(OWNER, Project 탭) · `Sync logs ›`(전 역할, Sync 탭) · `Publish logs ›`(전 역할, Publish 탭) 바닥 링크가 선다. (`home-landmarks.test.tsx` green)
- [ ] 시안 v3의 보드 각각에서 패널 내용이 같다 — `1a` 기본·소스 둘 · `1b` 기본·소스 하나 · `2a` 첫 Sync 전 · `2b` Sync 실패 · `2b′` 일부 반영 · `2c` 미연결 · `2d` 보관 · `2e` 로딩 · `2f` 발송 전 · `2g` 늦게 오는 행 · `2h` EDITOR. 시안과 다르게 확정한 것(아래 "결정"의 ⚠️ — `Members (0)` · 바닥 링크 라벨·목표)은 결정이 이긴다. (`/design-sync` 수동 실측 — **보드 11개 전부 필수**. 로컬에서 바로 안 서는 갈래는 dev DB 픽스처·상태 조작으로 재현해 밟는다. 그래도 못 밟은 갈래는 완료로 치지 않고 사용자에게 보고한다)
- [ ] 로딩 골격(`(home)/loading.tsx`)이 탭 머리(실물) + Project 탭 8행 치수와 같고, 바닥 링크는 `canOpenSettings`일 때만 그린다. (수동 실물 대조 — `/design-sync` `2e`)
- [ ] Home 조회 라운드가 늘지 않는다 — 새 조회가 생기면 기존 `Promise.all` 한 라운드 안이다. **새 GitHub 호출은 0이다.**
- [ ] `pnpm gate` green. DESIGN §6.64 · ARCHITECTURE(스키마) · DIRECTORY · CLAUDE.md(프리미티브 수) 갱신.

## 결정 (2026-10-04 — 시안 v3 수령 · 사용자 리뷰)

**구조**
- 카드 머리(`h2#home-meta-title`)를 없애고 탭 목록이 머리다(머리 padding 12, 높이 60). 랜드마크 이름은 aside `aria-label="Project"`. 탭 이름 `Project` · `Sync` · `Publish`(앞선 리뷰의 `Overview` 안을 시안이 대체 — 보이는 머리가 없어 충돌이 없고 라벨이 짧아 잘리지 않는다).
- 기본 탭은 항상 `Project` · 탭에 상태 점 없음 · 높이는 탭을 따른다(바닥 링크만 오르내린다).
- 값은 **오른쪽 정렬**(라벨 96 왼쪽 고정, 값은 오른쪽 끝 — `dir` 아님). `Fact`에 정렬 옵션을 더한다. 지금 `meta-column.tsx:71-74` 주석이 막던 형(justify-between)과 다르다 — 라벨 폭이 고정이라 값의 끝이 한 열로 선다.
- 행은 묶음(구분선)으로 나뉜다 — 묶음 padding `14 16` · 행 gap 10(지금 `MetaGroup`과 같다).
- 파랑은 GitHub으로 나가는 것뿐(Repository · Pull request). 앱 안 이동(Sources · 바닥 링크)은 검정 + chevron.

**Project 탭** — 묶음 셋
| 행 | 값 | 출처 |
|---|---|---|
| Repository | `owner/name` 링크. 연결이 정상이 아니면 **평문**(상태는 다음 행) | `repoOwner/Name` · `loadConnectionHealth` |
| Connection | `connected`(초록) · `notConnected`(회색) · `disconnected`(호박) · `wrongRepository`(빨강) — StatusBadge 키 그대로 | `connectionProblem` |
| Branch | 기준 브랜치 | `baseBranch` |
| CI | `Configured` / `Not set up` | `pushTokenHash !== null` (서버에서 boolean으로 접는다) |
| Sources | 소스 수 → Sources 화면(검정 + chevron). **소스 1개여도 선다**(시안 — Keys가 몇 개의 합인지 말한다. 지금 `meta.ts:91`의 `> 1` 규칙을 뒤집는다) | 비보관 표면 수 |
| Keys | 전 소스 합 | `aggregates.keyTotals` |
| Members | `4 (2)` — 앞 = 멤버 수(OWNER+EDITOR), 괄호 = 대기 초대 수. ⚠️ **초대가 없어도 `(0)`을 보인다**(2026-10-04 사용자 — 시안의 "0이면 괄호 없음"을 뒤집는다) | `_count.members` · 대기 초대 술어(`acceptedAt: null` + `expiresAt > now`, 추출해 공유) |
| Created | 상대 시각 | `createdAt` |
| Archived | 상대 시각 (보관일 때만, 행위자 없음) | `archivedAt` |

**Sync 탭** — 마지막으로 시각을 전진시킨 IMPORT 사건 **하나**에서 전부 읽는다(2026-10-04 사용자)
| 행 | 값 | 출처 |
|---|---|---|
| Last sync | 실행 종류 배지(`Nightly sync` 등). 첫 Sync 전이면 `notSyncedYet` 배지가 값이고 탭에 이 행 하나뿐 | 사건 `triggerOf` |
| Synced | 그 실행의 **종료 시각**(상대) | 그 실행의 종료 시각 — `lastSyncTime`(전 소스 최댓값)이 아니다. 출처는 T6에서 확정(사건 `occurredAt`은 시작) |
| Result | `synced`(초록) / `partiallySynced`(호박) — 실행이 있으면 늘 선다 | 사건 `result` (`imported` / `partial`) |
| Changed | `128 values` | payload `changedValues` (null이면 행 없음) |
| Keys seen | 그 실행이 본 키 수 | payload `keys` (null이면 행 없음) |
| Sources | `web, mobile` 쉼표 평문 — **프로젝트 소스가 둘 이상일 때만** | payload `surfaceSlugs` |
| Hold | `held` 배지 — 늦게 도착하면 묶음 끝에 붙는다. 자리를 잡지 않는다(대부분 null) | `planHomeHold` |

**Publish 탭** — 마지막 성공 Publish 실행 **하나**에서 읽는다(Sync 탭 규칙과 같다)
| 행 | 값 | 출처 |
|---|---|---|
| Last publish | 실행 종류 배지. 발송 전이면 회색 평문 `Never`(`m.home.meta.never`)가 값이고 탭에 이 행 하나뿐 | 사건 `triggerOf` |
| Published | 그 실행의 시각 | `SyncRun.finishedAt` |
| Pull request | `#127` 링크. 연결이 정상이 아니면 평문 | `SyncRun.prUrl` |
| PR state | `prOpen` 배지 / 평문 `Not open` / `couldNotCheck` 배지. 조회하는 갈래면 스켈레톤(56px)이 자리를 먼저 잡고, 조회하지 않는 갈래면 행이 없다. **새 GitHub 호출 없음** | `loadOpenPrUrlMemo`(planHomeHold가 이미 부르는 것) |
| Changed | `24 values` — **새 기록**(아래 스키마). 열린 PR을 갱신한 실행이면 PR 전체 vs base 누적. 기록 이전 실행이면 행 없음 | `SyncRun.changedValues` |
| Sources | 그 실행이 대상으로 잡은 소스(실행 시작 때의 비보관 소스 전부 — "PR에 실린 소스"가 아니다) — 프로젝트 소스가 둘 이상일 때만, 백필된 옛 사건의 `[]`이면 행 없음 | PUBLISH payload `surfaceSlugs` |

**바닥 링크** — Project 탭 `Settings ›`(OWNER만, `routes.settings(slug)`) · Sync 탭 **`Sync logs ›`** → `routes.logs(slug, { kind: "imports" })` · Publish 탭 **`Publish logs ›`** → `routes.logs(slug, { kind: "publish" })`. 둘 다 전 역할 · 보관 중에도 · 이력이 없어도 늘 선다(빈 목록은 Logs의 빈 상태가 말한다). ⚠️ **시안(`Logs ›`, 필터 없음)과 다르다 — 2026-10-04 사용자가 정했고 시안은 고치지 않는다.**

**상태별**
- Sync 실패 · 진행 중 → 카드 불변(배너가 든다). 일부 반영은 성공 실행이라 `Result`만 호박이다.
- 미연결 → Repository · Pull request 평문, Connection 배지가 상태.
- 로딩 → 탭·바닥은 실물, 본문은 Project 탭 8행 스켈레톤(Repository · Connection · Branch · CI / Sources · Keys · Members / Created). EDITOR는 바닥 없음.
- ⚠️ **사건 기록 이전에 적재된 프로젝트**(`ProjectEvent` 2026-09-20 이전 적재 후 시각을 전진시킨 실행이 없음)는 `notSyncedYet`이 거짓이다 — 그 갈래는 `Last sync` 한 행에 회색 평문(기록 없음)으로 선다(문구는 T1에서 고정, 시안에 없는 갈래).

**스키마 확장 하나** (2026-10-04 사용자 — 비목표 해제)
- `SyncRun.changedValues Int?` — Publish가 **리포 파일에서 실제로 바꾼 번역 엔트리 수(수정 + 추가, 삭제 제외)**: 바뀐 파일마다 base 원문과 새 원문을 어댑터로 파싱해 견준다(2026-10-04 사용자 — 정의 (b)). 두 탭의 `Changed`가 같은 단위(번역 값 수)다. **열린 PR을 갱신한 실행이면 PR 전체 vs base 누적**이다(`SyncRun.changed` 파일 수와 같은 의미). 표현만 바뀐 커밋·스킵은 `0`, 실패·기록 이전은 `null`. **관측값이다 — 판정에 쓰지 않는다**(쓰는 순간 병합이다, IMPORT의 같은 필드 주석과 같다). Logs는 Publish **상세**에 이 수를 보인다(보조줄엔 넣지 않는다).

## 넣지 않는 행

| 행 | 이유 |
|---|---|
| 로케일 · 소스별 Base locale · Format · Path · 소스별 Keys | PRODUCT §7.7 결정 4 — Sources 상세가 소유한다. `Sources` 행이 그 화면 링크다 |
| Next nightly · Last nightly check | 프로덕션 cron에서만 돈다 · 정렬 힌트 · 손 사본 |
| Status · Reason · Last failed · 소스별 Commit/Committed/상태 | 배너의 사본 · Sync 탭은 실행 하나의 사실만 든다(D2-b) |
| Sync branch · Default source | 시안이 지웠다 — 자동 결정값 |
| Files changed · Held back · Dropped · Unsent now | 시안이 지웠다 — `Changed`(값 수)가 대신하고, 보류·미전달은 `To send` 카드가 든다 |

## 비목표

- **스키마 변경은 `SyncRun.changedValues` 하나(additive)뿐이다** — 그 밖의 새 컬럼(PR 머지 여부, 다음 실행 예약)을 요구하는 행은 넣지 않는다.
- **새 GitHub 호출 없음** — PR state는 이미 일어나는 조회의 결과만 쓴다(malmoi#107 착지 병목).
- 탭 선택을 URL(`?tab=`)·저장소에 남기지 않는다 — 착지할 때마다 `Project` 탭이다.
- 소스별 이력 · 실행 목록 — Logs가 소유한다. 이 열은 "마지막" 하나씩만 든다. Logs의 변경은 Publish 행에 `Changed` 수를 더하는 것 하나다.
- 배너 · `Needs your attention` · 카운트 카드 넷 · `Recent logs`는 건드리지 않는다.
- 이 열에서 Sync·Publish·Reconnect 같은 **동작**을 하지 않는다.
- 다른 화면(번역 툴바·Sources·Settings)의 같은 사실 표기를 이번에 맞추지 않는다 — 어긋남은 `/ux-audit` 후보로 남긴다.
