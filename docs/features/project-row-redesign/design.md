# project-row-redesign — design

## 영향 받는 흐름

**편집 UI 둘** — `/projects` 목록(`app/(edit)/projects/(list)/`)과 Inbox(`/inbox` + 헤더 배지). push·pull·export 경로는 건드리지 않는다.

| 층 | 파일 | 변경 |
|---|---|---|
| 판정(순수) | `lib/projects/list.ts` | 판정 넷(`rowChip`·`projectGroup`·`rowBanner`·`meterSlot`)을 **`planProjectRow` 하나**로 접는다. `rowLocaleProgress`는 지운다(§5) |
| 할 일(순수) | `lib/inbox/plan.ts` · `lib/home/attention.ts` | DB에서 정해지는 할 일을 **`projectTodos` 하나**로 모아 행의 띠와 `planInbox`가 함께 쓴다(§4) |
| 로더 | `lib/keys/query.ts` `loadProjectList`·`assembleProjectListRows` | 메타 재료(소스 수·키 수·언어 수·`lastSyncTime`)와 `never_filled` 재료를 조립한다. `meters`를 지운다 |
| 로더 | `lib/inbox/load.ts` | `projectTodos`를 쓴다. `needs_reconnect`가 항목이 된다 |
| 화면 | `components/projects/project-list.tsx` · `app/(edit)/projects/(list)/page.tsx`·`loading.tsx` · Inbox 항목 렌더 | 시안대로 재조립한다. 행 전체가 `withRepoHost`를 지나고, 서버 `now`를 prop으로 넘긴다 |
| 사전 | `messages/{en,ko,es}.tsx` | 기존 키를 재사용하고, `never_filled` 띠·PR 조회 실패 띠·Inbox `needs_reconnect` 문장을 추가한다. 쓰이지 않게 된 `projects.meter.note.*`·`onGitLab.meter`는 지운다 |
| 셸 | `lib/shell/switcher.ts` | 주석만 `projectGroup`을 가리킨다. 이름이 바뀌면 같이 고친다 |

## 1. 대표 메타 (결정 2·6)

**"이 행이 무엇의 행인가"와 "얼마나 됐나"만 담는다.** 운영 상세(Connection·CI·Branch·Members·Created)는 Home 메타 열이 정본이고, 행은 그 화면으로 가는 입구다.

| 자리 | 내용 | 출처(이미 저장됨) | 문구(기존 키) |
|---|---|---|---|
| 이름 · 썸네일 | 그대로 | `Project.name`·`image` — `ProjectThumbnail` 하나만 | — |
| 리포 줄 | 호스트 글리프 + `owner/repo` — **그대로 `truncate`**(namespace가 먼저 줄어든다) | `repoHost`·`repoOwner`·`repoName` | — |
| 메타 줄(새, 리포 줄 아래) | `sources · keys · languages · synced` — **감기고 숨지 않는다**(PRODUCT §4.1) | 아래 | 아래 |

메타 칸 넷:

| 칸 | 정의 | 같은 정의의 다른 자리 | 문구 | 생략 조건 |
|---|---|---|---|---|
| 소스 수 | 비보관 `TranslationSurface` 수(첫 적재 전 소스 포함) | Sources 화면 `sources.count` | `sources.count(n)` | — (늘 선다) |
| 키 수 | 비보관 소스의 비-orphaned 키 합. `keyTotals`(`query.ts:487`)를 **행의 비보관 `surfaces` id로 합산**한다(`LiveLocale`로 돌면 로케일 수만큼 중복된다) | 사이드바 배지 `MembershipRow.keyCount`(`query.ts:206` — `_count`, 다른 로더) · Home `Keys` | `translations.keys(n)` | — |
| 언어 수 | 비보관 소스의 비-orphaned `Locale.code` 중 **어느 소스에서든 대상(비-base)인 고유 코드** 수 | — | `sources.languageCount(n)` | 0이면 생략(깨진 것으로 읽힌다) |
| 동기화 | `lastSyncTime(surfaces)`(`lib/home/sync-time.ts:11`) 재사용 — 비보관 소스 `lastImportedAt`의 최댓값 | **Home 카드**(`count-cards.tsx:157`). Home 메타 열 Last sync는 사건 `finishedAt`이라 다른 값이다(`lib/home/meta.ts:73`) | `home.cards.synced(when)` | `null`·`"unrecorded"`면 생략(`synced(null)`은 `not synced yet`이라 칩을 되풀이한다) |

- **순서는 기존 `surfaces.sourceCounts`(keys → languages)를 따른다.** `synced …`는 소문자로 시작하므로 맨 뒤에 둔다.
- **동기화의 뜻**: "리포의 값이 마지막으로 들어온 시각"이다. 같은 내용을 다시 push해도 갱신된다(`lib/push/apply.ts:343,399`). 보류(`deferred`)·실패·`partial-import`일 때는 움직이지 않는다. 그래서 적재가 보류된 프로젝트는 오래된 시각을 보인다. 그 이유는 같은 행의 띠(미발송·열린 PR)가 말하므로 따로 설명하지 않는다. 적재 실패 행(h)의 시각은 마지막 **성공** 시각이고, Home `lastGoodSync`와 같은 뜻이다.
- **상대 시각의 형**: `<time dateTime={iso} aria-label={formatMinute(at, useDateStyle())}>{relativeTime(at, now)}</time>`. 리포의 기존 형(`source-detail-modal.tsx:252-253`, DESIGN §6.68)이다. `title`은 쓰지 않는다(리포 사례 0). `project-list.tsx`는 `"use client"`이므로 **`now`는 서버(`page.tsx`)가 만들어 prop으로 넘긴다**(`relative-time.ts:9-10`). 이 화면은 UTC 고정 표면(`FIXED_UTC`)이 아니다.
- 계산은 서버 조립 층(`assembleProjectListRows`)에서 한다. `lastSyncTime`을 클라이언트 그래프에 올리지 않는다. 행에는 값(`lastSync: string | "unrecorded" | null`)만 싣는다.

걷은 후보: 마지막 Publish(띠가 같은 축을 말한다) · 전체 진행률 하나 · 역할·멤버 수(2026-09-30 사용자) · 브랜치. 언어별 진행 막대는 `source-row-locale-meter`로 옮겨 간다.

## 2. 상태 — `planProjectRow` (순수)

### 판정을 하나로 접는다
지금은 함수 넷이 각자 우선순위를 가져 칩·그룹·띠가 어긋났다(spec 문제 2). **표 하나**에서 셋을 함께 낸다.

```ts
type ProjectRowPlan = {
  chip: StateKey;          // `StatusBadge` 입력 — 낱말·톤은 `STATE`가 든다(§2.4)
  group: ProjectGroup;     // "needs_attention" | "all_set" | "archived"
  banner: RowBanner;       // 다음 할 일 하나(기존 union + `never_filled`)
};
function planProjectRow(row: RowInput, todos: readonly ProjectTodo[]): ProjectRowPlan;
```

- `rowBanner`는 `planProjectRow` 안으로 접혀 export에서 빠진다. `RowBanner` 타입은 남는다(화면이 쓴다). `RowChip`·`CHIP_STATE`는 소비자가 이 함수 하나로 줄면 모듈 안으로 숨긴다.
- `groupProjects`(`list.ts:508`)는 `planProjectRow(row, todos).group`을 쓴다.
- **`projectStatus`는 남긴다** — `lib/inbox/load.ts:56`이 부른다(`lib/pull/targets.ts:73`은 주석일 뿐이고 호출하지 않는다). `planProjectRow`는 그것을 입력 판정으로 쓰고 다시 짜지 않는다.

### 모델 — **칩은 건강, 띠는 할 일** (결정 1 · 2026-10-15 수정)

칩은 "이 프로젝트가 돌고 있나"(개발자의 질문) 하나만 말한다. 그룹은 **칩에서 기계적으로** 나온다(`active` = `All set`, 그 밖 = `Needs attention`). 할 일은 칩을 바꾸지 않고 띠에만 담는다. 할 일에는 미발송·열린 PR·PR 조회 실패·리포 앞섬·검토·빈 언어가 있다.

| # | 조건(위가 이긴다) | 코드 술어 | 칩 (`StateKey`) | 그룹 | 띠 | 띠 톤 |
|---|---|---|---|---|---|---|
| 1 | 보관 | `projectStatus === "archived"` | `archived` | archived | 없음 | — |
| 2 | 연결 끊김 | `projectStatus === "needs_reconnect"` | `disconnected` | attention | `needs_reconnect` | warning(지금 그대로) |
| 3 | 적재 실패 danger | `projectSyncFailure(...)` tone danger | `syncFailed` | attention | `import_failed` | danger |
| 4 | 적재 실패 warning | 같은 함수 tone warning(`partial-import`) — 첫 적재에서도 `applyPush`가 `lastCommitSha`와 같은 트랜잭션에서 써서 데이터가 늘 있다(`lib/surfaces/create.ts:128`) | `partiallySynced` | attention | `import_failed` | warning |
| 5 | 연결 전 | `projectStatus === "setup"` | `setup` | attention | `setup` | 지금 그대로 |
| 6 | 첫 적재 중 | `awaiting_first_sync` ∧ 적재 중인 표면 있음 ∧ 실패 표면 없음 | `syncing` — **목록의 새 칩 값**(지금은 `notSyncedYet`) | attention | 없음 | — |
| 7 | 첫 적재 대기 | `awaiting_first_sync` | `notSyncedYet` | attention | 없음 | — |
| 8 | 정상 | `projectStatus === "active"` | `active` | all set | 미발송 > 열린 PR · PR 조회 실패 > 리포 앞섬 > 검토 > 빈 언어 중 하나, 없으면 없음 | **muted**(전부) |

- **PR 조회 실패는 건강 판정에 넣지 않는다**(2026-10-15 사용자 — 결정 1의 수정).
  - `openPr === undefined`는 "이번 목록 요청이 PR을 확인하지 못했다"는 뜻이다(`lib/projects/remote.ts:101-104`). CI 보류를 뜻하지 않는다.
  - 원격 조회가 마감(8초)을 넘기면 PR 번호를 가진 행 전부가 한꺼번에 이 상태가 된다(`remote.ts:164-170`).
  - CI 보류는 미발송·열린 PR에서도 똑같이 생긴다.
  - 그래서 칩은 `active`, 그룹은 `All set`이고, 띠가 지금 우선순위대로 말한다. 미발송이 있으면 미발송이 이긴다(`list.ts:218-222`, Home도 같은 순서 — DESIGN §6.64).
  - `prCheckFailed` 칩은 목록에 생기지 않는다. 따라서 375 폭의 긴 칩 문제도 생기지 않는다.
- **미발송·리포 앞섬이 `All set`으로 내려간다**(지금은 attention). 칩과 그룹이 어긋나던 원인이 이 둘이었다. ⚠️ **DESIGN §6.63 "검토 대기와 열린 PR은 All set"의 근거("읽고 누르면 되는 것")를 미발송·리포 앞섬·PR 조회 실패·빈 언어까지 넓히는 결정이다.** DESIGN §2.4 :179의 칩 순서도 바뀐다(`syncing` 추가).
- **All set 카드 안의 띠는 전부 muted다**(2026-10-15 사용자). warning·danger 띠는 Needs attention 사유(2–5)에만 쓴다. 지금 `review` 띠는 warning이다(`project-list.tsx:354`).
- **둘째 줄은 없다.** 언어 막대가 빠지면서(spec 완료 조건 1) 상태 문장(`m.projects.meter.note.*`)도 함께 사라진다. 그래서 `progress` 필드가 없다.
- 띠의 역할 분기와 링크 목적지(`bannerTranslationsHref` 등)는 지금 것을 그대로 쓴다. 새 띠 `never_filled`의 링크는 Home Attention의 같은 항목과 같은 목적지(그 언어의 번역 화면)다.

### PR 조회 실패 띠 문안 (결정 5)
지금 띠 문장 `projects.banner.prCheckFailed`는 칩 낱말에 마침표를 붙인 것이다(`cross-screen.test.ts:477`이 그 일치를 고정한다). 결정 5는 이 일치를 깬다. 문안은 시안이 제안하고 T0에서 확정한다. 브리프에 넘길 사실 셋은 다음과 같다.
- **멈춘 것**: 이번 방문에서 열린 PR을 확인하지 못했다. 그 사이 CI 적재가 보류되는지는 이 신호만으로 알 수 없다.
- **갈 곳이 없다** — `BannerAction`이 `null`이다(`project-list.tsx:436-438`, "다음 방문에서 다시 확인").
- **금지어** — `retry`·`check again` 등은 `BANNED`이고, `Couldn't check` 단독도 쓸 수 없다(§10.1). 남을 가리키는 문구는 그 화면에 실제로 있는 컨트롤만 가리킨다(§10.1).

## 3. 호스트 문장

**행 전체가 `withRepoHost(useMessages(), row.repoHost)`를 지난다.** 지금은 `ProjectBanner`(`:347`)·`BannerAction`(`:409`)만 덮는다. `withRepoHost`는 WeakMap memo(`lib/i18n/host.ts:25`)라 행마다 불러도 비용이 없다.
- `StatusBadge`는 사전을 스스로 읽고 PR/MR 낱말을 `host` prop으로만 가른다(`status-badge.tsx:18-21`, `canon.ts:88`). 새 칩 집합(§2 표)에는 호스트에 따라 바뀌는 낱말이 없으므로 `host`는 넘기지 않는다. 이 사실은 DOM 테스트(`/github|pull request/i` 0건)가 고정한다.
- 둘째 줄 상태 문장이 사라지면 `onGitLab.meter`도 소비자를 잃는다. 사전에서 지운다. `host.test.ts`의 세 사전 노드 일치가 같이 움직인다.

## 4. 할 일 — `projectTodos` (순수) · Inbox 정렬 (2026-10-15 사용자)

**DB에서 정해지는 할 일을 한 함수가 내고, 행의 띠와 Inbox가 둘 다 그 결과를 쓴다.** 원격 신호는 행 띠 전용이다(Inbox 배지 Action은 매 헤더에서 불린다).

```ts
type ProjectTodo =
  | { kind: "needs_reconnect"; at: Date | null }          // 새 Inbox 항목
  | { kind: "setup"; at: Date }
  | { kind: "unsent"; at: Date | null; count: number; surfaceSlug: string }
  | AttentionItem;                                        // import_failed · review · never_filled
function projectTodos(input: { status: ProjectStatus; surfaces; review; neverFilled; actors; unsent; createdAt; gitlabTokenExpiresAt }): ProjectTodo[];
```

| 할 일 | 행 띠 | Inbox | 역할 |
|---|---|---|---|
| `needs_reconnect` | ✅ | ✅ **새로** | 모두 — EDITOR는 "소유자에게 요청" 문장(`import_failed`의 `ownerRetries`와 같은 형) |
| `import_failed` | ✅ | ✅ | 모두(`ownerRetries` 그대로) |
| `setup` | ✅ | ✅ | Inbox는 **OWNER만**(지금 규칙 그대로 — EDITOR가 할 수 있는 일이 없다). 띠는 EDITOR에게 문장 |
| `unsent` | ✅ | ✅ | 모두 |
| `review` | ✅ | ✅ | 모두 |
| `never_filled` | ✅ **새로** | ✅ | 모두 |
| `pr_open`·`pr_check_failed`·`repo_ahead` | ✅ | ❌ | 원격 신호 — 목록 전용 |

- 행 띠 = `projectTodos` ∪ 원격 신호 중 §2 표 우선순위의 첫 항목이다. Inbox = `projectTodos` 전부(역할 필터 후)를 `compareItems`로 정렬한 것이다.
- **`needs_reconnect`의 `at`**: GitLab 토큰 만료면 `gitlabTokenExpiresAt`, GitHub 리포 id 누락이면 `null`이다. `null`은 정렬에서 뒤로 가고, `seenAt`이 있으면 안 읽음으로 세지 않는다(`isUnread` 그대로).
- **`never_filled` 재료**: 목록 로더가 이미 읽는 `loadProjectListAggregates`(`keyTotals`·`cells`)와 소스 로케일로 `neverFilledLocales`(`lib/home/attention.ts:108`)를 돌린다. Inbox 로더가 이미 같은 일을 한다(`lib/inbox/load.ts:51`). 새 왕복은 없고, 로케일 select에 `name`·`createdAt`만 붙는다.
- Home의 Attention 카드는 손대지 않는다(`collectAttention` 결과를 그대로 쓴다).
- 가이드: Inbox 항목 서술(`guide/en/translate/edit.md:43`)이 바뀐다 → T12.

## 5. 조율 — `source-row-locale-meter`

- `LocaleMeter` 컴포넌트는 **지우지 않는다.** 이 기능이 프로젝트 행에서 막대를 빼면, 남는 소비자는 그 기능의 소스 행 하나가 된다.
- `rowLocaleProgress` 함수와 `ProjectListRow.meters`는 이 기능이 지운다. 그 기능은 둘 다 import하지 않는다(그쪽 design §6). 함께 움직이는 테스트: `lib/surfaces/__tests__/counts.test.ts:2,11`.
- **순서: 그 기능이 먼저다**(spec "사전 조건"). 그 기능의 T7이 `LocaleMeter` 입력을 `LocaleMeterValue`로 바꾼 뒤 이 기능이 들어간다. 그래서 이 기능이 늦게 끝나는 쪽이다.
- `RowLocaleProgress` 타입은 이 기능이 T6에서 `rowLocaleProgress`와 함께 지운다. 그 시점에는 `LocaleMeter`가 이미 그 타입을 쓰지 않는다. `status-badges.test.tsx:48`·`parallel-p2-meter-error.test.tsx:22`가 넘기는 모양도 그 기능이 이미 옮겼는지 T6에서 확인한다.
- DESIGN §6.63 머리의 `LocaleMeter` 소비자 서술("Projects와 Sources")은 이 기능이 T11에서 "Sources 소스 행(§6.66)"으로 고친다. 늦게 끝나는 쪽이 고친다는 규칙(그쪽 tasks T9)에 따른 결과다. 막대 자체(`components/ui/meter.tsx`)는 Sources 상세 모달도 쓰는 공유 프리미티브다.
- 목록 골격(`app/(edit)/projects/(list)/loading.tsx`)의 미터 줄은 이 기능이 지운다. Sources 골격의 막대 줄은 그 기능이 더한다.

## 순수 함수 (`/tdd` 진입점)

1. `planProjectRow` — 위 표 전 행 + 입력 축 전수 조합의 불변식(spec 완료 조건 3).
2. `projectTodos` — 종류별 생성 조건 · 역할 필터 · `needs_reconnect`의 `at` · `planInbox`가 그 결과로 기존과 같은 항목을 내는지(`never_filled`·`review`·`unsent`·`setup`·`import_failed`) + 새 `needs_reconnect`.
3. 메타 조립 — 소스 수 · 키 수(표면 id 합산) · 언어 수(고유 비-base 코드 — 같은 코드가 한 소스는 base이고 다른 소스는 대상이면 센다) · `lastSyncTime`. 순수 조립 함수로 `list-rows.test.ts`가 고정한다. 별도 `projectRowMeta` 함수는 만들지 않는다.

## 스키마 변경

**없다.** `TranslationSurface.lastImportedAt`(`prisma/schema.prisma:164`)·`Locale`·`StringKey`가 이미 있다. 표면은 `include`로 읽고 있어(`query.ts:297`) `lastImportedAt`·`lastCommitAt`이 이미 실려 온다. 바꿀 것은 `ProjectListMemberRow`(`:341-350`)와 조립 층이다.

## 새 환경변수

없다.

## 불변식 영향

- export 결정성·blob SHA·인증 경계·병합 없음(§0) — 무관하다(읽기 화면).
- **모든 쿼리는 `projectId`로 좁힌다.** 새 재료는 기존 `loadProjectList`·`loadProjectListAggregates`의 `projectId in ids` 안에서만 는다. 새 왕복을 만들지 않는다(셸 로더 `loadMemberships`에 얹지 않는다 — DESIGN §6.63 끝 문단). Inbox 배지 경로는 호스트 API를 부르지 않는다.
- `pendingWhere` SQL 사본(⑤ 미발송)은 건드리지 않는다. `pnpm test:projects:postgres`가 대조한다(`scripts/gate-plan.ts`의 `lib/keys/`(:30)·`lib/projects/list.ts`(:55) 트리거).

## 과거 함정 (POSTMORTEM)

- **같은 엔터티를 여러 화면에 그릴 때 색·모서리 교차 계약**(2026-09-17 썸네일 — 목록 4px vs Home `rounded`): 행 썸네일은 `ProjectThumbnail` 하나만 쓴다. ⚠️ 골격 썸네일이 아직 `rounded-[4px]`다(`loading.tsx:83`, 실물은 8) — T7에서 고친다. 확인 명령: `rg -n 'bg-foreground.*size-7|ProjectThumbnail|rounded-\[4px\]' components/home components/projects 'app/(edit)/projects'`.
- **다른 화면의 컨트롤을 부르는 문구**(2026-09-24 `Send changes` vs 실제 버튼 `Publish`): 띠 링크 문구는 대상 버튼의 사전 값을 테스트에서 참조해 묶는다. 새 `never_filled` 띠도 이 규칙을 따른다.
- **`.sr-only`와 스크롤 컨테이너**(2026-10-13 #260): 행마다 `position:absolute` 요소를 늘리지 않는다. 메타는 눈에 보이는 글자이고 sr-only를 새로 만들지 않는다. 세로 스크롤 실측은 T10.
- **화면 용어를 늘리면 DESIGN §10.1 표부터**: 새 낱말(`never_filled` 띠·PR 조회 실패 띠·Inbox `needs_reconnect`)은 §10.1 표와 대조한 뒤 `terminology.test.ts`의 `BANNED`를 같이 본다.

## 결정

2026-10-14 사용자(추천을 모두 채택). 2026-10-15 `/feature-review`에서 1·3·4를 수정하고 6–8을 더했다.

1. **상태 모델은 "칩은 건강, 띠는 할 일"이다.** 그룹은 칩에서 기계적으로 나온다. 미발송·리포 앞섬은 `All set`으로 내려가고 띠가 그것을 말한다. ~~열린 PR 조회 실패는 `Needs attention`으로 올라간다~~ → **2026-10-15: PR 조회 실패도 칩 `Active` · `All set` · 띠만**(일시적인 "모름"이다. 마감을 넘기면 목록 전체가 쏠린다). 대안(칩이 가장 급한 한 가지)은 버렸다.
2. **대표 메타는 소스 수 · 키 수 · 언어 수 · 마지막 동기화(상대 시각)다.** 순서는 이대로이고 소스 수는 늘 선다(2026-10-15). 0개인 언어 칸과 시각이 없는 동기화 칸은 생략한다. 역할·멤버 수는 넣지 않는다.
3. ~~언어 막대는 덜 된 언어 먼저다~~ → **2026-10-15: 프로젝트 행에서 언어 막대를 뺀다.** (소스, 로케일) 단위 데이터라 `source-row-locale-meter`가 소스 행으로 가져간다.
4. **둘째 줄은 없다**(막대가 빠졌다). 첫 적재 전 행(j·k·l)은 칩이 상태를 말한다.
5. **열린 PR 조회 실패의 띠는 다음 할 일을 말한다.** 칩과 같은 문장을 쓰지 않는다. 문구는 시안이 제안하고 T0 수령 때 확정한다(§2 사실 셋).
6. **All set 카드의 할 일 띠는 전부 muted다**(2026-10-15).
7. **Inbox 항목과 행의 띠는 같은 DB 할 일 판정에서 나온다.** 원격 신호 셋은 행 띠 전용이다. `never_filled`는 띠에 들어가고 `needs_reconnect`는 Inbox에 들어간다(2026-10-15).
8. **마지막 동기화는 `lastSyncTime`을 재사용하고 그 뜻을 명시한다**(2026-10-15) — 보류 행이 보이는 오래된 시각은 띠가 설명한다.
