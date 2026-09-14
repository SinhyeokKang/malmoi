# Project Home 재편 — design

`spec.md`의 §7(불일치)·§9(닫힌 결정 여덟)을 전제로 한다. **결정은 2026-09-15에 전부 닫혔고,
남은 차단은 §9.6의 선과제 하나다** — [Sync] 재적재 경로가 별도 `/feature`로 빠졌다.

## 1. 영향 받는 흐름

**push / 편집 UI / pull 중 편집 UI 하나다.** 읽기 전용 화면이고 **이 스펙은 새 쓰기 경로를
만들지 않는다** — [Sync]의 재적재 Action은 §9.6의 선과제가 든다.

| 흐름 | 이번 변경 |
|---|---|
| push (`/api/push` → `applyPush`) | **없음.** 읽기만 한다 |
| 편집 UI | Home 페이지 전면 재작성. 기존 Server Action은 그대로 |
| pull (`runSync`) | **없음.** `[Publish]`가 기존 `triggerPullAction`을 그대로 부른다 |

## 2. ⚠️ 가장 큰 발견 — 카드 넷은 이미 구현돼 있다

캔버스의 *"카드 넷은 새 쿼리를 요구하지 않는다"*가 **맞고, 예상보다 더 맞다.**
목록 화면(`/projects`)이 **같은 넷을 같은 순서·같은 라벨·같은 아이콘·같은 색으로 이미 그린다.**

| 축 | 목록 화면의 현재 값 | 캔버스 `2a` | 일치? |
|---|---|---|---|
| 순서 | 유입 → 번역 → 검토 → 발송 (`project-list.tsx:248` 주석이 *"순서가 파이프라인이다"*) | 같음 | ✅ |
| 라벨 | `m.projects.summary.{newFromGithub,toTranslate,toReview,toSend}` | `New from GitHub` · `To translate` · `To review` · `To send` | ✅ **문구 재사용** |
| 글리프 | `ArrowDownToLine` · `Languages` · `Eye` · `GitPullRequestArrow` | `arrow-down-to-line` · `languages` · `eye` · `git-pull-request-arrow` | ✅ |
| 색 | 첫 칸 `text-blue-600`(값>0일 때만) · `To review` `text-amber-700` | 첫 칸 파랑 · `To review` 글리프 `#b45309` | ✅ (`amber-700` = `#b45309`) |
| 수 | `summaryQueue()` (`lib/projects/list.ts:329`) | — | ✅ **함수 재사용** |
| 0 갈래 | `+n` / `0`, 값 0이면 tone 없음 | 수치·글리프 `#737373` | ⚠️ 미묘하게 다르다 (§5.2) |
| 형 | 구분선 띠 (`flex gap-6 border-y py-3.5`), 라벨 위·수치 아래 | **카드** radius 12 · padding 14 · hover · 전체가 링크 · **보조 줄** | ❌ **다른 프리미티브** |

**결론**: 데이터·문구·아이콘·색은 전부 재사용하고, **새로 만드는 것은 카드 프리미티브 하나와
보조 줄 문구뿐이다.** 목록의 띠는 그대로 둔다 (`spec.md` §4 — 안 본 화면을 움직이지 않는다).

### 2.1 ⚠️ `summaryQueue`를 그대로 쓸 수 없는 자리 하나

```
const active = new Set(input.projects.filter((p) => !p.archived).map((p) => p.projectId));
```

**보관된 프로젝트를 네 값 모두에서 뺀다** (2026-09-13 사용자 판정 — "지금 내가 할 일"의 합계라서).
그런데 캔버스 `2d`는 **보관에서도 값을 유지하고 보조 줄만 `frozen at archive`로 바꾼다.**
단일 프로젝트로 부르면 보관 시 넷이 전부 0이 되어 시안과 어긋난다.

**대안 둘 중 하나를 고른다** (열린 결정 아님 — 구현 판단):
- (권장) 호출부가 `archived: false`를 **고정으로 넘긴다.** 함수를 안 건드리고, Home은 이미 보관을
  알고 있다(`requireProjectAccess`가 `archived`를 돌려준다). 주석으로 "보관 필터는 계정 합계의
  것이고 Home은 프로젝트 하나라 그 축이 없다"를 남긴다.
- 함수에 필터를 옵션으로 여는 것 — **하지 않는다.** 요청하지 않은 설정 가능성이다.

## 3. 데이터 원천 — 화면 요소별

### 3.1 카드 넷

| 카드 | 원천 | 단위 |
|---|---|---|
| `New from GitHub` | `loadProjectSummaries` raw ④ — `StringKey.createdAt > Project.lastPulledAt`, `orphaned=false`, 표면·프로젝트 미보관 | **keys** |
| `To translate` | `summaryQueue`: `키 수 × 로케일 수 − (done + review)` | cells |
| `To review` | `Translation.needsReview = true`, `value ≠ ''`, `stringKey.orphaned = false` | cells |
| `To send` | raw ⑤ — `updatedBy IS NOT NULL AND updatedAt > lastPulledAt` (**`isUnpublished`·`countUnpublished`와 같은 술어의 세 번째 자리**) | cells |

⚠️ **넷째 벌을 만들지 않는다.** `lib/keys/query.ts:565`의 주석이 술어가 이미 셋임을 적어 뒀고,
`pnpm test:projects:postgres`가 "셋이 같은 행을 세나"를 재는 유일한 자리다 (CLAUDE.md).

### 3.2 보조 줄 — **여기가 진짜 신규다**

캔버스는 보조 줄이 *"그 수의 단위와 기준"*을 든다고 정했고, 상태마다 문장이 갈린다
(`spec.md` §10). 필요한 재료:

| 문장 | 재료 | 있나 |
|---|---|---|
| `keys · synced {time}` | 표면별 `lastCommitAt`의 최댓값 | ✅ `page.tsx`가 이미 그렇게 만든다 |
| `cells · across {n} surfaces` | `surfaces.length` | ✅ |
| `cells · {n} en, {m} ja` | `rowReviewCounts`의 로케일별 분해 | ⚠️ **로케일별 분해가 없다** — `rowReviewCounts`는 프로젝트 단위로 접는다. `foldCells`의 중간값을 로케일별로 남기는 순수 함수가 하나 필요하다 |
| `cells · last publish {time}` | `Project.lastPublishedAt` | ✅ |
| `keys · last good sync {time}` | 위와 같음 (실패해도 `lastCommitAt`은 성공 시각) | ✅ |
| `cells · {n} keys all filled` | `keyTotals` | ✅ |
| `frozen at archive` · `never sent` · `as of …` · `cannot be sent while paused` | 상태만 | ✅ 정적 |

### 3.3 `Needs your attention` 항목 세 종

| 항목 | 원천 | 시각(정렬 키) | 있나 |
|---|---|---|---|
| 파서 실패 | `TranslationSurface.lastImportError` + `failing()` | **`lastImportFailedAt`** (§6.1 신규) | ✅ 표면별이라 시안의 `{surface} · {locale} file`과 맞는다. ⚠️ **로케일은 모른다** — 컬럼이 표면 단위다. **문장을 표면까지로 낮춘다** |
| 검토 대기 | 로케일별 `needsReview` 카운트 + 그 로케일의 최근 편집자 | 그 로케일의 `max(updatedAt)` | ⚠️ **로케일별 최근 편집자 조회가 없다** — 아래 참조 |
| 미채움 로케일 | `localeProgress`의 `translated = 0` | **`Locale.createdAt`** (§6.2 신규) | ✅ `activeLocaleProgress`가 이미 센다 |

✅ **정렬은 시간순(최신), 3행 + `+2 more`(상한 5)** (`spec.md` §9.1).
동점은 `surfaceSlug` → 로케일 코드 **유닛 비교** — `compareEdit`과 같은 규칙이다.
⚠️ **캔버스 `2a`의 행 순서와 어긋나는 것이 의도다** — `spec.md` §9.1에 근거가 있다.

### 3.3.1 ⚠️ 시각이 셋 다 필요하다 — 남은 구멍 둘

| 구멍 | 무엇 |
|---|---|
| **로케일별 최근 편집자·시각** | `loadRecentEdits`는 프로젝트 전체 최근 N건이라 그 로케일이 빠질 수 있다. **렌더되는 항목(최대 5)에 대해서만** 그 로케일의 `max(updatedAt)` + 그 행의 `updatedBy`를 뽑는 조회가 하나 필요하다 — `page.tsx`의 기존 관용구(*"렌더되는 행만 지난다 — 903키 리포에서 전 행의 편집자를 조회하지 않는다"*)를 그대로 따른다. 인덱스는 `@@index([projectId, surfaceId, localeCode, needsReview])`와 `[projectId, surfaceId, updatedAt]`가 있다 |
| **미채움 로케일의 시각** | ✅ **`Locale.createdAt` 추가로 닫혔다** (§6.1). `Locale`에 시각 컬럼이 하나도 없었다(`code`·`name`·`isBase`·`orphaned`뿐) |

⚠️ **폴백 판정을 `actorLabel`의 `null`에 걸지 않는다** (`spec.md` §9.11) — 그 함수는 못 찾으면
`updatedBy` 원문(cuid일 수 있다)을 준다. **`actors` 맵에 키가 있는지를 호출부가 직접 본다.**

### 3.4 `Recent logs`

현재 `recentActivity`는 갈래 셋(`edit`·`push`·`publish`)이고 상한이 건수다.
시안이 요구하는 갈래는 **다섯**:

| 시안의 줄 | 현재 갈래 | 원천 |
|---|---|---|
| `CI synced {n} new keys into {surface}` | `push` | ✅ `lastCommitAt`. ⚠️ **`{n} new keys`가 없다** — `push` 항목이 시각만 든다 |
| `{who} edited {key} in {locale} · {surface}` | `edit` | ✅ |
| `Published pull request #{n} · {n} files changed` | `publish` | ✅ `lastPublishedAt`·`lastPrUrl`. ⚠️ `{n} files changed`는 `SyncRun.changed`(**파일 수**)이고, 지금 `recentActivity`는 `SyncRun`을 안 읽는다 |
| `Sync failed · {surface} could not be read` | **없음** | ✅ **`lastImportFailedAt`으로 닫혔다** (§6.1). ⚠️ **마지막 하나뿐이라 7일 창에 실패가 둘이면 하나만 보인다** — 이력이 아니다 (PRODUCT §4.1) |
| `{who} added the {surface} surface` | **없음** | ❌ **이 줄을 뺀다** — 출처가 아예 없고 사건 테이블을 만드는 것은 additive가 아니다 (§6.3). 캔버스와의 **의도된 이탈**이다 |

⚠️ **`ACTIVITY_LIMIT = 8` → 지난 7일 · 최대 20건**으로 바꾸는 것은 `recentActivity`의 시그니처
변경이다(`limit: number` → 기간 + 상한). **순수 함수라 테스트가 먼저다.**

⚠️ **배너가 선 세 상태(`2b`·`2c`·`2d`)에서 로그가 4~3줄로 줄어든다** — 캔버스 근거 열이
*"잘리는 것은 바닥의 `All logs` 링크부터인데, 그것이 잘리면 전체 목록으로 갈 길이 사라진다"*를
적었다. **패널이 `overflow:hidden`이므로 이것은 실측으로만 확인된다** → `/design-sync` 4단계.

### 3.5 오른쪽 `Project` 메타 열 아홉 행

| 행 | 원천 | 있나 |
|---|---|---|
| `Repository` | `repoOwner/repoName` → GitHub 링크 | ✅ |
| `Branch` | `Project.baseBranch` | ✅ |
| `Surfaces` | `surfaces.length` (미보관) | ✅ |
| `Locales` | 활성 로케일 + **국기 16×11** | ✅ 데이터. ⚠️ 국기 SVG는 `assets/flags/`에 셋뿐이다(kr·us·jp) — **로케일이 59개인 리포**(`i18n-many-locales`)에서 무엇을 그릴지 정해지지 않았다 |
| `Keys` | `keyTotals` | ✅ |
| `Members` | `ProjectMember` count | ✅ |
| `Last sync` | 표면별 `lastCommitAt` 최댓값 (+ `2b`는 `lastImportFailedAt`) | ✅ §6.1로 닫혔다 |
| `Last publish` | `lastPublishedAt` + `lastPrUrl` | ✅ |
| `Created` | `Project.createdAt` | ✅ |
| (`Archived`) | `archivedAt` **만** | ✅ 실행자를 **안 적는다** (`spec.md` §9.4) — 캔버스의 `· by …`를 뺀 **의도된 이탈** |

## 4. 순수 함수로 분리 — `/tdd` 진입점

**여기가 이 설계의 중심이다.** I/O 없이 판정되는 것을 전부 끌어낸다.

| 함수 | 자리 | 무엇을 판정하나 |
|---|---|---|
| `planHomeState` | `lib/home/state.ts` (신규) | 여섯 상태 중 하나로 접는다 — `archivedAt` → 연결(`planConnectionHealth`) → `failing()` → 기본. **순서가 곧 우선순위다** |
| `attentionItems` | `lib/home/attention.ts` (신규) | 항목 세 종을 만들고 **시간순으로 정렬 + 3행/상한 5로 자른다**. ⚠️ `2b`에서 파서 항목을 **뺀다**(배너가 소유자가 됐다) · 동점은 `surfaceSlug` → 로케일 코드 유닛 비교 |
| `countCards` | `lib/home/cards.ts` (신규) | `SummaryQueue` + 상태 → 카드 넷의 `{ value, tone, subline }`. **보조 줄이 상태마다 갈리는 규칙이 여기 하나에 든다** |
| `reviewByLocale` | `lib/projects/list.ts` (확장) | `foldCells`의 중간값을 로케일별로 남긴다 (§3.2의 `{n} en, {m} ja`) |
| `recentActivity` (개정) | `lib/home/overview.ts` | 건수 상한 → **기간(7일) + 상한(20)** + 갈래 `sync_failed` 하나 추가(`lastImportFailedAt`). ⚠️ `surface_added`는 **안 만든다**(§3.4) |
| `metaRows` | `lib/home/meta.ts` (신규) | 메타 아홉(+1)행의 값·링크 여부. `2c`에서 리포 링크가 사라지는 규칙이 여기 든다 |

**전부 I/O가 없다.** 페이지는 조회 → 이 여섯을 부름 → 렌더 셋으로 얇아진다.

⚠️ **`recentActivity`의 결정적 정렬을 깨지 않는다** — 현재 주석이 *"같은 DB 상태가 같은 화면을
내야 하고, 안 그러면 새로고침마다 순서가 바뀌는 목록이 된다 — export 결정성과 같은 축"*을 적었고
`RANK`와 `compareEdit`이 그것을 진다. **갈래를 둘 늘리면 `RANK`에 자리를 주고 그 테스트를 늘린다.**

## 5. 새 컴포넌트

### 5.1 카운트 카드 — `components/ui/`가 아니라 `components/home/`

**프리미티브로 올리지 않는다.** 소비자가 Home 하나이고, 목록 화면은 띠 형으로 이미 서 있다.
`components/ui/`에 올리면 "안 본 화면의 표현을 바꾸지 않는다"의 반대편으로 압력이 생긴다.

- 카드 `padding:14` · gap 12 · hover `rgba(10,10,10,0.02)` · **전체가 링크**
- 1행: 제목 14/500 + `margin-left:auto` 글리프 16
- 2행: 수치 24/500 + 보조 줄 13 `#737373`
- 0일 때: 수치·글리프 `#737373`

✅ **목적지는 `routes.translations(slug, { state })`** (`spec.md` §9.7) — 기본 표면으로 redirect되며
쿼리가 보존된다. 카드 전체가 `<a>`이고 **접근 이름은 제목 + 수치 + 보조 줄의 name-from-content**로
선다 — 2026-09-13에 `role="combobox"`가 **빈 접근 이름**이 된 자리와 같은 부류이므로
`/design-sync` 4단계에서 CDP로 잰다.

### 5.2 ⚠️ 0 갈래가 목록 화면과 어긋난다

목록: `+n` / `0`, 값 0이면 tone 없음(글리프도 기본색).
캔버스: 0이면 **수치·글리프 둘 다 `#737373`**.

목록은 라벨이 `text-muted-foreground`라 글리프가 그 색을 이미 상속하지만, 카드는 수치가 크고
`#0a0a0a`가 기본이라 **0을 흐리는 규칙이 새로 필요하다.** 목록을 따라 움직이게 하지 않는다.

### 5.3 재사용하는 것

`Alert`(danger·amber 둘 다 있다) · `Badge`(pill) · `EmptyState`(칩 48 규격 그대로) ·
`Button`/`ButtonLink`(primary 비활성은 `25d3a9e`가 이미 muted 면으로 고쳤다) ·
`app/(edit)/projects/loading.tsx`의 펄스 타이밍.

## 6. 스키마 변경 — **컬럼 둘. 둘 다 additive.**

**둘 다 `spec.md` §9.1의 시간순 정렬이 끌고 온 것이다** — 항목 세 종을 한 축에 세우려면 셋 다
시각이 있어야 하는데 둘이 없었다.

### 6.1 ✅ `TranslationSurface.lastImportFailedAt DateTime?`

```prisma
/// 마지막 임포트가 **실패한** 시각. 성공은 이 값을 건드리지 않는다 —
/// 성공 시각은 `lastCommitAt`이 이미 든다.
lastImportFailedAt DateTime?
```

`spec.md` §9.10. **세 자리를 한 컬럼이 답한다** — 항목의 시간순 정렬 · 메타의 `failed 10m ago` ·
로그의 `Sync failed` 줄.

- `importOutcomeFields(code)`가 이미 적재와 **같은 트랜잭션**에서 `lastImportError`를 쓰므로
  거기에 필드를 하나 더한다. ⚠️ **성공 경로에서는 `null`로 비운다** — 안 비우면 성공한 뒤에도
  항목·배너가 옛 실패를 말한다.
- **backfill 없음.** 기존 행은 `null`이고, 읽는 쪽이 그것을 **"모른다"**로 그린다.
  ⚠️ 에러는 있는데 시각이 `null`인 행은 **마이그레이션 이전 행뿐**이다 — 시간순 정렬에서
  **가장 오래된 것으로 취급한다**(임의 순서를 만들지 않는다).

### 6.2 ✅ `Locale.createdAt DateTime @default(now())` — ⚠️ **backfill을 손으로 쓴다**

`spec.md` §9.12. `Locale`에 시각 컬럼이 하나도 없어 미채움 로케일 항목을 시간순에 못 세웠다.

⚠️ **`@default(now())`만 두면 마이그레이션이 거짓을 만든다** — 기존 로케일 **전부**가
"마이그레이션 시각"을 들고, 배포 직후 미채움 항목이 전부 "방금"으로 목록 맨 위를 점령한다.
그리고 그 거짓은 **한 번 쓰면 되돌릴 수 없다**(진짜 시각이 어디에도 없다).

**그래서 `--create-only`로 만들고 SQL에 backfill 한 줄을 손으로 넣는다:**

```sql
-- 기존 행은 프로젝트 생성 시각으로 되돌린다. 로케일이 프로젝트보다 먼저 생길 수는 없고,
-- "마이그레이션 시각"보다 이쪽이 덜 틀리다. TranslationSurface에는 createdAt이 없다.
UPDATE "Locale" l SET "createdAt" = p."createdAt"
  FROM "Project" p WHERE p."id" = l."projectId";
```

- 이 리포가 `--create-only` + `db:deploy`로 쪼개는 습관을 유지하는 이유가 정확히 이것이다
  (CLAUDE.md — *"생성한 SQL을 프로덕션에 보내기 전에 눈으로 본다"*).
- ⚠️ **같은 프로젝트의 로케일 여럿이 같은 시각이 되어 동점이 된다** — 동점 규칙
  (`surfaceSlug` → 로케일 코드 유닛 비교)이 그것을 결정적으로 받는다.

### 6.3 ❌ 넣지 않는 것

| 후보 | 왜 안 넣나 |
|---|---|
| `Project.archivedBy String?` | **`spec.md` §9.4가 닫았다** — 메타 행이 시각만 든다 |
| `TranslationSurface.lastImportDropped Int?` | 시안이 문장을 *"읽지 못했다"*로 이미 낮춰 그렸다. 수를 안 쓰므로 컬럼이 필요 없다 |
| `SyncRun.changedCells Int?` | 로그가 `3 files changed`로 나간다 — `SyncRun.changed`가 파일 수인 것을 문장이 그대로 말한다 |
| 표면 추가 사건 | ❌ additive가 아니다. `SyncRun`은 Publish 전용이고 `trigger`/`status` enum이 그 가정 위에 선다 — **로그에서 그 줄을 뺀다**(§3.4) |

### 6.2 ❌ 넣지 않는 것

| 후보 | 왜 안 넣나 |
|---|---|
| `Project.archivedBy String?` | **`spec.md` §9.4가 닫았다** — 메타 행이 시각만 든다 |
| `TranslationSurface.lastImportDropped Int?` | 시안이 문장을 *"읽지 못했다"*로 이미 낮춰 그렸다. 수를 안 쓰므로 컬럼이 필요 없다 |
| `SyncRun.changedCells Int?` | 로그가 `3 files changed`로 나간다 — `SyncRun.changed`가 파일 수인 것을 문장이 그대로 말한다 |
| 표면 추가 사건 | ❌ additive가 아니다. `SyncRun`은 Publish 전용이고 `trigger`/`status` enum이 그 가정 위에 선다 — **로그에서 그 줄을 뺀다**(§3.4) |

### 6.4 배포

⚠️ **destructive가 없다.** 지우는 컬럼이 없으므로 배포를 2단계로 쪼갤 이유가 없다 (ARCHITECTURE §7).
`/db` → `/push`(dev) → `/merge` 1단계(`db:deploy`) 순서다.
⚠️ **`/db` 5단계 — 새 마이그레이션 뒤 `anon` 권한이 0인지 확인한다.**
⚠️ **`pnpm test:projects:postgres`를 손으로 돌린다** — 복합 FK와 표면 backfill을 검사하는 유일한 자리다.

## 7. 새 환경변수

**없다.** `.env.example` 갱신 불필요.

## 8. 불변식 영향

| 불변식 | 영향 |
|---|---|
| §0-1 소스 키는 코드가 진실 | 없음 — 읽기만 한다 |
| **§0-2 push가 리포 값으로 덮고 저자를 비운다** | ⚠️ **[Sync] 실행 경로를 만들면 직결된다** (`spec.md` §6). 편집 손실 창을 화면 버튼으로 여는 것이므로, (b)를 고르면 **확인 Dialog와 그 문구가 이 스펙의 일부가 된다** |
| §0 키 삭제 없음 / `orphaned` | 없음. `activeLocaleProgress`가 orphaned를 빼는 규칙은 그대로 |
| export 결정성 | 없음 — export를 안 만든다. 단 **`recentActivity`의 결정적 정렬은 같은 축의 요구**이고 그것은 지킨다 (§4) |
| blob SHA | 없음 |
| **인증 경계 (§6)** | ⚠️ **페이지 최상단 `requireProjectAccess`를 유지한다.** 조건부 렌더는 차단이 아니다 — `2c`·`2d`에서 버튼을 감추는 것은 **편의**이고, 차단은 진입점과 `/settings` 페이지가 든다 |
| **테넌트 격리** | ⚠️ 모든 조회를 `projectId`로 좁힌다. `summaryQueue`를 단일 프로젝트로 부르므로 입력 배열이 그 프로젝트 하나인지 호출부가 보증한다 |

## 9. POSTMORTEM에서 소환한 것

`grep -n "Home\|recentActivity\|revalidatePath\|text-mono" docs/POSTMORTEM.md`

### 9.1 2026-09-09 + 🔁 2026-09-11 — 무효화 범위

> **앞으로 깨질 것 하나**: `app/(edit)/actions.ts:86`의 `saveTranslation`이
> `/projects/{slug}/translations` **하나만** 무효화한다. 6b-6의 Home이 같은 행에서 …
> 그 화면이 서는 순간 이 인자가 부족해진다.

✅ **이미 갚혔다** — 지금은 `revalidatePath('/projects/${slug}', "layout")`이라 Home을 덮는다.

⚠️ **그런데 축이 하나 늘어난다.** 재발 항목의 재발 방지가 이렇게 적었다:

> 무효화 범위를 물을 때 "이 Action이 쓰는 컬럼을 읽는 화면"이 아니라
> **"그 컬럼에서 파생되는 판정 함수를 부르는 화면"**을 센다.

**Home이 `summaryQueue`·`projectStatus`·`planConnectionHealth`·`failing`의 새 소비자가 된다.**
착수 시 다시 돌린다:
`grep -rn "revalidatePath(" app lib | grep -v __tests__` → 각 자리가 **Home도 덮나**를 묻는다.
특히 `runFirstIngest`·`connectRepository`·`disconnectGithub`·`archiveProject`·`restoreProject`.

### 9.2 2026-09-11 — `text-mono`와 여러 줄

시안이 mono를 0으로 만드므로 이 함정은 Home에서 **사라진다.** 다만 재발 방지 grep은 그대로 돈다:
`grep -rn "text-mono" $(find components app -name "*.tsx" -not -path "*__tests__*")` → Home 그래프 0건 확인.

### 9.3 2026-09-08·09 — 프로토타입 오염

`lastImportError`는 **DB 컬럼에서 읽은 문자열**이다. `importFailureMessage`가 이미
`Object.hasOwn` + 폴백으로 막고 있다 — **그 함수를 우회해 사전을 직접 인덱싱하지 않는다.**
로케일 코드로 국기 SVG를 고르는 자리(§3.5)도 같은 부류다.

### 9.4 2026-09-05 — 함수 리전

번역 화면 첫 착지가 24키 프로젝트에서도 3.29초였고 병목이 **행 수가 아니라 함수 리전**이었다.
Home은 조회가 늘어난다(카드 넷 + 항목 + 로그 + 메타) — **`Promise.all`로 병합하고 순차 왕복을
만들지 않는다.** 현재 `page.tsx`가 이미 그 관용구를 쓴다(`counts`·`edits` 병렬 → `actors`).
⚠️ `actors`가 두 번째 라운드인 것은 **첫 라운드 결과에 의존해서**다 — 그 구조는 유지한다.

## 10. 라우트·URL

**변경 없다.** `routes.project(slug)`가 그대로 착지점이고 `?e=` 슬롯도 그대로 없다.

⚠️ **§9.7이 닫히면 `TranslationsQuery`에 `state`가 는다.** 그 타입의 주석이 지금
*"`state`가 없다 (8-4 — spec Q3)"*를 **의도로** 적어 두었으므로, 뒤집을 때 **그 주석 자리에
뒤집는 근거를 남긴다** — 지우기만 하면 다음 사람이 같은 결정을 다시 한다.

## 11. 테스트 — 새로 필요한 것과 깨질 것

### 깨질 것

| 파일 | 왜 |
|---|---|
| `lib/home/__tests__/overview.test.ts` | `recentActivity`의 시그니처가 바뀐다(건수 → 기간). `activeLocaleProgress`는 **소비자가 사라지지만 로케일 화면이 쓰므로 함수는 남는다** |
| `app/__tests__/screens.test.ts` | Home의 소스 구조를 센다 |
| `app/(edit)/__tests__/shell-layout.test.ts` | 오른쪽 320 열이 새로 생긴다 |
| `components/__tests__/focus-ring.test.ts` | 카드·행이 전부 링크라 포커스 링 대상이 는다 |
| `components/__tests__/client-graph.test.ts` | `+2 more`가 `"use client"`를 만들면(§9.9) 그 그래프가 는다 |

### 새로 필요한 것

| 파일 | 무엇을 |
|---|---|
| `lib/home/__tests__/state.test.ts` | 여섯 상태의 우선순위 — 보관 ∧ 미연결이면 보관이 이긴다 등 |
| `lib/home/__tests__/attention.test.ts` | 우선순위·상한·**`2b`에서 파서 항목이 빠지고 카운트가 준다** |
| `lib/home/__tests__/cards.test.ts` | 보조 줄이 상태마다 갈리는 규칙 · 0 갈래 · **세 셀 구간의 겹침 0** |
| `lib/home/__tests__/meta.test.ts` | `2c`에서 리포 링크가 사라진다 · `Archived` 행이 는다 |
| 소스 스캐너 3 | `pull`/`push` 낱말 0 · mono 0 · 파랑 5 (`spec.md` §3.3) |
| `pnpm test:projects:postgres` | 미발송 술어가 **넷째 벌이 되지 않았나** (손으로 돌린다) |

⚠️ **스캐너는 일부러 깨뜨려 red를 확인한다.** 매칭이 0인 스캐너는 방어선이 아니라 장식이다.

## 12. 구현 뒤 `/design-sync`

**이 스펙은 픽셀을 확정하지 않는다.** 캔버스가 px 단위 정본이고, 구현이 끝나면
`/design-sync project-home`이 computed style + CDP 접근성 트리로 대조한다.
2026-09-13에 새 프로젝트 모달이 **29곳** 어긋난 채 테스트 3,000개가 green이었다.

**브라우저로 밟기 어려운 갈래를 미리 적어 둔다** (밟지 못한 것을 "검증했다"고 쓰지 않기 위해):

| 상태 | 어떻게 밟나 |
|---|---|
| `2a` 기본 | dev의 `bugshot-i18n-test-qa` ✅ |
| `2a` 빈 | 전부 발송된 프로젝트가 필요하다 — ⚠️ **만드는 방법이 정해지지 않았다** |
| `2b` Sync 실패 | `lastImportError`를 세운 표면 — `i18n-format-check`에 일부러 깨진 파일을 넣는 경로 |
| `2c` 미연결 | GitHub App 설치 목록에서 리포를 빼면 된다 ⚠️ **되돌리는 절차를 같이 적는다** |
| `2d` 보관 | 설정 화면에서 보관 → 복원 ✅ |
| `2e` 로딩 | 네트워크 스로틀 |
