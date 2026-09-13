# design — Projects 목록 재설계

`spec.md`의 완료 조건을 코드 사실 위에 얹는다. **값은 소스에서 인용했고, 인용할 소스가 없는 값은
"데이터 없음"으로 표시하고 §9 열린 결정으로 보냈다.**

## 0. 영향 받는 흐름

**목록 조회와 임포트 상태 기록 경로를 변경한다.** pull의 export 계약은 유지한다.

- 목록은 `app/(edit)/projects/page.tsx` → `loadProjectList` → `components/projects/project-list.tsx`와 신규 집계를 사용한다.
- `scripts/push-local.ts` → **신규 Route Handler `POST /api/push/failure`**가 CI 파싱 실패를 기록한다.
  외부 진입점이므로 Route Handler이며, 기존 `/api/push`의 성공·실패 기록과 함께 연결한다.
- 첫 적재·재시도는 기존 `runFirstIngest` Server Action에서 공통 저장 함수를 직접 호출한다.
  내부 처리를 새 Route Handler로 우회하지 않는다. OWNER 설정 화면에도 저장된 실패를 표시한다.
- ⚠️ **`/projects/new`가 같은 본문을 모달 뒤에 그린다**(`project-list.tsx:30` 주석). `ProjectList`의
  props가 바뀌면 그 라우트도 같은 커밋에서 움직인다.

## 1. 제거 명세

### 1.1 지워지는 것

| 무엇 | 어디 | 소비자 |
|---|---|---|
| `PROJECT_FILTERS` · `ProjectFilter` · `parseProjectFilter` · `filterProjects` | `lib/projects/list.ts:26-61` | `project-list.tsx`뿐 |
| `filterLabel()` | `project-list.tsx:68` | 같은 파일 |
| `<SegmentedLinks>` 호출 | `project-list.tsx:131-145` | 같은 파일 |
| `m.projects.filter.{label,all}` | `messages/en.tsx` | 위 둘 |
| `m.projects.narrowed.byFilter` | `messages/en.tsx` | `project-list.tsx:192` |
| `?filter=` | `routes.projects()` · `routes.newProject()` 인자 | 아래 §1.2 |

**`PROJECT_STATUSES`·`ProjectStatus`·`projectStatus`는 남는다** — 배지와 그룹 판정이 그것을 쓴다.
⚠️ **`projectStatus`의 순서 규칙(보관 → readiness → `repositoryId`)은 손대지 않는다**
(ARCHITECTURE §6.36 — 뒤집으면 보관된 신규 프로젝트가 `Setup`으로 보인다).

### 1.2 `routes` 시그니처

```ts
// before
projects:   (query: { filter?: string; q?: string } = {}) => withQuery("/projects", query)
newProject: (query: { filter?: string; q?: string } = {}) => withQuery("/projects/new", query)
// after
projects:   (query: { q?: string } = {}) => withQuery("/projects", query)
newProject: (query: { q?: string } = {}) => withQuery("/projects/new", query)
```

**`filter`를 읽거나 전달하는 목록·복귀 경로가 같은 커밋에서 움직인다:**
`components/projects/search-input.tsx` · `components/projects/project-list.tsx` ·
`app/(edit)/projects/page.tsx` · `app/(edit)/projects/new/page.tsx`(`RepoLoader` 포함) ·
`components/onboarding/new-project.tsx`(`backQuery`) · `app/api/github/callback/route.ts` ·
`lib/github-connect/state.ts`의 새 프로젝트 복귀 상태.
예전 OAuth state에 들어 있는 `filter`는 무시하고 `q`는 보존한다. state 서명·nonce 검증은 유지한다.

⚠️ **`withQuery`를 계속 지난다.** 문자열 연결로 만들면 `app/__tests__/entry-points.test.ts`의
"쿼리 파라미터 수신자" 검사를 통째로 회피한다(`lib/routes.ts:68` 주석 · POSTMORTEM 2026-09-06).

⚠️ **`?filter=`는 조용히 무시한다** — 404도 리다이렉트도 아니다. `?focus=`를 폐기했을 때와 같은
관용구다(`lib/routes.ts:36`: *"옛 `?focus=`는 무시된다 — 더 넓게 보일 뿐이다"*).

### 1.3 `SegmentedLinks`는 프리미티브에 남는다

소비자가 **0이 된다**(실사용은 이 화면 하나였다). 그래도 파일은 지우지 않는다.

- `components/__tests__/focus-ring.test.ts:146`이 렌더 픽스처로 그것을 든다 — 지우면 그 검사가 죽는다.
- `SegmentedControl`(버튼판)은 계속 셋이 쓴다: `components/shell/project-panel.tsx` ·
  `components/onboarding/steps/files.tsx` · `segmented-control.test.tsx`.
- 이는 기존 dead code 예외의 적용이 아니라 **공용 프리미티브의 링크 변형과 그 테스트를 유지하는 결정**이다.
  이번 변경으로 화면 소비자가 사라진다는 사실은 남기고, 삭제를 태스크에 넣지 않는다.

### 1.4 빈 상태 문구의 갈래가 하나로 준다

`m.projects.narrowed`는 `bySearch(q)` 하나만 남는다. `byFilter`가 쓰이지 않으므로 키를 지운다
(남겨 두면 "탭이 있던 시절"의 화석이 사전에 남는다).
**`reset` 라벨 판정**: `Clear filters` → **`Clear search`**로 바꾼다. 되돌릴 축이 질의 하나뿐이고,
`3a`의 결과 줄도 같은 낱말(`Clear search`)을 쓴다 — 한 화면에서 같은 동작이 두 이름을 갖지 않는다.
글리프는 `RotateCcw` 그대로다(`FilterX`가 아닌 이유는 기존 결정 — 다만 근거가 "둘 다 비운다"에서
"질의를 되돌린다"로 바뀌므로 주석을 고친다).

## 2. 화면 구조

```
ContentPanel
├ PanelHeader  (px-6 pt-6 pb-3)
│  ├ 제목 줄: h1 + Badge(총계) ── margin-left:auto ─→ Search(220~256×36) + [New project]
│  ├ [?e=] Alert danger            ← 제목 줄 **아래** · Summary **위**
│  └ Summary 넷                     ← 위아래 hairline #f0f0f0 · padding 14 0 · 칸 200 고정
└ PanelBody    (px-6 pt-3 pb-5, flex flex-col)
   ├ 검색 없음: 그룹 셋 (헤더 + 카운트 배지 + 목록 카드) · 그룹 사이 20
   └ 검색 있음: 결과 줄 한 줄 + **평평한 목록 하나**
```

⚠️ **머리 구조가 두 줄에서 한 줄 + Summary로 바뀐다.** 지금은 `flex flex-col gap-4` 안에
제목 줄과 (탭+검색) 줄 둘이다(`project-list.tsx:98`). 검색이 제목 줄로 올라가면서 둘째 줄이
Summary로 대체된다.

**프로젝트 0건(`1a`)일 때 머리에 남는 것은 제목 + 배지 `0`뿐이다** — 검색·Summary·[New project]를
그리지 않는다. 지금 코드의 `hasProjects` 분기(`project-list.tsx:94`)가 그 자리를 이미 갖고 있고,
**Summary가 그 분기 안으로 들어간다.**

## 3. 목록 데이터 — 멤버십 1회 + 집계 5회

### 3.0 지금 무엇이 있나

`loadProjectList`(`lib/keys/query.ts:241`)는 `projectMember.findMany` **한 방**이고 행마다
`slug · name · role · installationId · lastCommitSha · archivedAt · repoOwner · repoName ·
repositoryId · memberCount`를 준다. **진행률·미발송·PR·사건은 하나도 없다.**

⚠️ **`ProjectListRow`에 `id`가 없다.** 집계를 프로젝트별로 묶으려면 `Project.id`가 필요하다 —
**서버 안에서만 쓰고 `ProjectListRow`에는 싣지 않는다**(화면이 아는 식별자는 slug 하나로 남긴다.
PRODUCT §7.7: *"URL을 안다는 사실은 접근 권한이 아니다"*의 반대편 — 내부 id를 화면에 흘리지 않는다).

**변경 후 오케스트레이션:** `loadProjectList`의 멤버십 조회에서 서버 내부의 `id`와 집계·원격 판정에
필요한 `baseBranch`·`lastPrUrl`·`lastPulledAt`·`adapterName`·`pathTemplate`·임포트 상태 컬럼을 함께 읽는다.
원격 경로 판정에 필요한 전체 저장 로케일 code도 이 서버 입력에 포함한다(Meter의 3개 제한을 적용하지 않음).
그 인가된 ID 집합으로 `loadProjectListAggregates`와 원격 조회를 병렬 실행한 뒤 slug 기준 화면 DTO로 합친다.
`loadMemberships`는 확장하지 않는다. 멤버십 0건이면 집계·GitHub 요청 없이 빈 결과를 반환한다.

### 3.1 로케일별 진행률 (행의 Meter)

**필요한 모양**

```ts
type RowLocaleProgress = { code: string; isBase: boolean; total: number; done: number; review: number; percent: number };
// 행당 **정렬 후 최대 3개**. 정렬은 base 먼저 → 코드순 (localeProgress와 같은 규칙)
```

**출처**: `Locale`(살아 있는 것 = `orphaned: false`) + `StringKey`(`orphaned: false`) 수 +
`Translation`(`value != ""`, `stringKey.orphaned = false`)의 `needsReview`별 개수.

**쿼리 왕복 셋 — 프로젝트 수와 무관하게 상수다.**

```
① Locale.findMany     where { projectId: { in: ids }, orphaned: false }  select { projectId, code, isBase }
② StringKey.groupBy   by [projectId]  where { projectId: { in: ids }, orphaned: false }  _count
③ Translation.groupBy by [projectId, localeCode, needsReview]
                      where { projectId: { in: ids }, value: { not: "" }, stringKey: { orphaned: false } }  _count
```

- ⚠️ **`in: ids`가 테넌트 경계다** — `ids`는 `loadProjectList`가 이미 인가한 내 멤버십 집합이다
  (ARCHITECTURE §0 불변식 5). 다른 출처에서 만들지 않는다.
- ③은 `@@index([projectId, localeCode, needsReview])`를 그대로 탄다(`prisma/schema.prisma:269`).
- ②는 `@@index([projectId, orphaned])`를 탄다(`:204`).
- **③은 orphaned 로케일의 번역을 포함할 수 있다.** 순수 접기에서 ①의 전체 활성
  `(projectId, code)` 집합에 없는 셀 그룹을 먼저 버린다. Meter와 Summary 모두 이 필터를 거친다.
  활성 로케일·키가 0이면 분자·분모·비율도 0이며 0으로 나누지 않는다.
- ⚠️ **`value`를 select하지 않는다** — `loadLocaleCounts`가 같은 이유로 `{ localeCode, needsReview }`
  둘만 뽑는다(`lib/keys/query.ts:281` 주석). `groupBy`는 애초에 행을 안 가져오므로 이 위험이 없고,
  **그래서 `loadLocaleCounts`를 재사용하지 않는다**(그쪽은 프로젝트 하나 전용 + 셀을 전부 가져온다).
- **순수 함수**: `rowLocaleProgress(locales, keyTotals, cells)` → 프로젝트별 배열. 정렬·자르기가
  거기서 끝난다. `localeProgress`(`lib/keys/view.ts:427`)와 **합치지 않는다** — 저쪽은
  `untranslated`·`percent`(내림)·orphaned 꼬리까지 드는 화면 계약이고, 여기 필요한 것은
  두 구간 비율뿐이다. ⚠️ 다만 **`percent`의 내림 규칙은 그대로 쓴다**(902/903이 100%로 보이면 안 된다).
  `percent = total === 0 ? 0 : Math.floor(done / total * 100)`이며 검토 대기는 완료에 포함하지 않는다.
  바의 두 폭은 각각 `done / total`과 `review / total`이다(분모 0이면 둘 다 0).

**Summary는 전체 활성 로케일로 계산한 뒤 Meter만 최대 셋으로 자른다.** Meter용 결과를
Summary의 입력으로 재사용하지 않는다. **화면 DTO의 Meter는 정렬 후 `slice(0,3)`만 준다.** 근거: 폭 축소를 CSS가 하므로
(§6) 클라이언트가 더 줄일 수는 있어도 늘릴 일이 없고, 로케일 59개짜리 리포(`i18n-many-locales`)에서
쓰이지 않을 배열을 행마다 직렬화하는 것은 RSC 페이로드에 그대로 실린다.

### 3.2 Summary 큐 넷 (내 멤버십 중 보관 제외 전체)

**보관 프로젝트는 Summary 네 항목 모두에서 제외한다**(2026-09-13 사용자).
`summaryQueue`는 검색 전의 전체 멤버십에서 `archivedAt === null`인 프로젝트만 합산한다.
①②③은 보관 행의 Meter에도 필요하므로 전체 멤버십으로 조회하고, Summary를 접을 때만 보관을 제외한다.
④⑤는 Summary·활성 행의 사건에 쓰므로 SQL에서도 보관을 제외한다. 역할이나 검색어로 집계 범위를 줄이지 않는다.
보관 행·Meter·제목 총계·Archived 그룹 카운트는 유지한다. 보관 프로젝트만 남으면 Summary는 네 값 모두 0이고
기존 목록 화면을 유지한다. 프로젝트 0건용 빈 화면의 조건은 여전히 전체 멤버십 0건이다.

| 칸 | 정의 | 출처 | 상태 |
|---|---|---|---|
| `New from GitHub` | **마지막 pull 이후 추가된 활성 키** = `orphaned = false AND (lastPulledAt IS NULL OR createdAt > lastPulledAt)` | **`StringKey.createdAt` 신설**(§8) + 신규 키 raw 집계 ④ | 정의·첫 pull 전 처리·backfill 확정 |
| `To translate` | 살아 있는 키 × 살아 있는 로케일 − 값이 있는 셀 | §3.1의 ①②③에서 **그대로 파생** | ✅ |
| `To review` | `Translation.needsReview = true` (값 있음 · 키와 로케일 살아 있음) | §3.1 ③을 전체 활성 로케일로 거른 뒤 `needsReview: true` 합 | ✅ |
| `To send` | 안 보낸 편집 수 | `countUnpublished`의 술어(`lib/keys/query.ts:155`)를 적용한 raw 집계 ⑤ | ✅ |

**2026-09-13 검수 결정:** `New from GitHub`의 기준은 임포트가 아니라 **pull**이다.
`lastPulledAt`은 성공한 pull이 처리한 번역 스냅샷의 기준 시각이며, 변경 없는 pull에서도 전진한다.
따라서 그 기준 시각 이하의 키는 신규 집계에서 빠지고, `createdAt`이 같은 키도 세지 않는다.
**첫 pull 전(`lastPulledAt = null`)에는 활성 키 전체를 센다.** 키가 없으면 0이며 orphaned 키는 제외한다.
기존 프로젝트라도 pull 이력이 없으면 같은 규칙을 적용한다.
기존 키는 §8의 `COALESCE(Project.lastPulledAt, Project.createdAt)`으로 backfill한다.

**`To translate`·`To review` 둘만 §3.1의 결과에서 파생한다.** 새 키와 미발송 수는 프로젝트별
`lastPulledAt`을 비교해야 하므로 raw 집계 두 개를 추가한다. ①②③④⑤는 `Promise.all`로 실행한다.
키와 번역을 직접 JOIN해 개수를 곱으로 늘리지 않는다. 집계에 없는 프로젝트의 수치는 0으로 채운다.

**④ 신규 키 수**

```sql
SELECT k."projectId", COUNT(*)::int AS n
FROM "StringKey" k JOIN "Project" p ON p.id = k."projectId"
WHERE k."projectId" = ANY($1::text[]) AND k."orphaned" = false AND p."archivedAt" IS NULL
  AND (p."lastPulledAt" IS NULL OR k."createdAt" > p."lastPulledAt")
GROUP BY k."projectId";
```

**⑤ 미발송 수** — 기존 `countUnpublished`와 같은 술어다.

```sql
SELECT t."projectId", COUNT(*)::int AS n
FROM "Translation" t JOIN "Project" p ON p.id = t."projectId"
WHERE t."projectId" = ANY($1::text[]) AND t."updatedBy" IS NOT NULL AND p."archivedAt" IS NULL
  AND (p."lastPulledAt" IS NULL OR t."updatedAt" > p."lastPulledAt")
GROUP BY t."projectId";
```

두 SQL의 `$1`은 멤버십에서 얻은 ID 배열이다. 구현은 Prisma의 파라미터화된 `$queryRaw`를 사용한다.
문자열 연결·`$queryRawUnsafe`는 쓰지 않는다. **⑤에는 ③의 활성 로케일 필터를 덧붙이지 않는다** —
미발송의 기존 계약과 진행률의 분모는 다른 문제다. `p.archivedAt IS NULL`은 목록 Summary의 프로젝트
선택 조건이며 `countUnpublished`의 셀 술어를 바꾸지 않는다. 술어 동일성은 보관하지 않은 프로젝트에서 대조한다.

- ⚠️ **`updatedBy IS NOT NULL`이 빠지면 안 된다.** push가 전 행의 `updatedAt`을 올리므로
  (strict 덮어쓰기 — ARCHITECTURE §0 불변식 2, `lib/push/apply.ts:229` 주석) 조건이 없으면
  **code push 직후 903키 전부가 "안 보낸 편집"**이 된다. `countUnpublished`·`isUnpublished`가
  같은 술어를 쓰는 이유가 그것이다.
- **술어를 세 벌로 만들지 않는다.** 지금 두 벌(`isUnpublished` 값 판정 / `countUnpublished` 집계)이고
  **세 번째가 SQL이 된다** — 주석에 서로를 가리키고, 단위 테스트가 같은 픽스처로 세 결과를 맞춘다.

**사이드바 배지와의 관계** — ⚠️ **맞출 대상이 지금은 없다.** `lib/shell/nav.ts:154`의 배지는
`context.projectCount`(= `memberships.length`) **하나뿐**이고 미발송 배지는 존재하지 않는다.
따라서 "셸과 본문이 어긋난다"는 위험은 현재 성립하지 않는다. 지키는 것은 **술어 일치**다 —
언젠가 셸이 그 숫자를 들게 되면 같은 함수를 부른다. **사이드바에 카운트를 새로 달지 않는다**
(PRODUCT §7.7 결정 5 — 그것은 모든 화면에 왕복을 더한다).

### 3.3 행 아래 띠의 사건들

| 사건 | 필요한 값 | 출처 | 상태 |
|---|---|---|---|
| 검토 대기 | 검토 대기 셀 수 | §3.1 ③ | ✅ |
| 안 보낸 편집 | 미발송 수 + 내 역할 | §3.2 raw + `row.role` | ✅ |
| 열린 PR | PR 번호 + **열려 있나** | 번호는 `Project.lastPrUrl`에서 파싱, 상태는 **`GET /pulls/{n}`**(§3.4) | ✅ (B) |
| 원격이 앞섬 | "마지막 임포트 뒤 base가 움직였나" + 바뀐 로케일 파일 수 | **`GET /compare/{lastCommitSha}...{base}`**(§3.4) | ✅ (C·C′) |
| 첫 적재 대기 | — | `projectStatus` | ✅ |
| 임포트 진행 중 | "지금 돌고 있나" | **`Project.lastImportStartedAt` 신설**(§8) | ✅ (D) |
| 임포트 실패 | 실패 사유 | **`Project.lastImportError` 신설**(§8) — `SyncRun`은 pull 전용이라 쓸 수 없다 | ✅ (D) |
| 연결 끊김 | — | `projectStatus` = `needs_reconnect` | ✅ |
| 설정 미완 | — | `projectStatus` = `setup` | ✅ |

⚠️ **`SyncRun`이 임포트를 모른다.** PRODUCT §4.1이 그것을 명시한다 — *"idempotency는 여기 없다…
**push를 이 테이블에 넣을 때** 의미가 생긴다"*. `/api/push`가 쓰는 것은 `Project.lastCommitSha`·
`lastCommitAt`뿐이고(`lib/push/apply.ts:269`), 실패는 **CI 응답으로만** 나가고 저장되지 않는다.

### 3.35 임포트 실패 보고 — CI 파싱 실패 포함 (2026-09-13 사용자)

**새 외부 계약은 `POST /api/push/failure` 하나다.** 정상 push 페이로드와 실패 보고를 섞지 않는다.

```ts
type ImportFailureReport = {
  projectSlug: string;
  commitSha: string;
  commitAt: string;
  code: "parse-failed" | "parse-crashed" | "invalid-locale-data" | "prepare-failed";
};
```

- **인증이 먼저다.** 기존 `PUSH_TOKEN`의 Bearer 원문을 해시해 프로젝트를 찾고, 그 뒤 제한된 본문을
  읽어 Zod로 검증한다(본문 최대 4 KiB, 알려지지 않은 필드 거부). SHA·시각·slug는 기존 push 계약과
  같은 제약을 쓴다. 유효하지 않은 토큰은 401, 본문 오류는 400, 오배송·보관·오래된 커밋은 409다.
  middleware의 세션 인증으로 대체하지 않는다. 실패 보고에는 포맷·키·번역 페이로드가 필요 없다.
- **저장은 토큰이 정한 projectId로만 한다.** `lastImportError`에 허용된 코드만 기록하고
  키·번역·`lastCommitSha`·`lastCommitAt`·`lastPulledAt`은 바꾸지 않는다.
  실제 UPDATE 조건에도 `id`·인증에 사용한 토큰 해시·`archivedAt:null`·
  `(lastCommitAt IS NULL OR lastCommitAt <= commitAt)`을 넣고 갱신 건수를 확인한다.
  선조회에서 `checkCommitOrder`만 통과시키고 무조건 UPDATE하지 않는다. 성공 응답은 204다.
- **의미는 마지막으로 수신한 실패 보고다.** 실행 이력이나 CI 전체의 상태를 복원하지 않는다.
  같은 커밋의 재실행 실패도 표시하며, 더 오래된 커밋이 새 성공을 실패로 덮는 것은 거부한다.
  같은 커밋의 성공 뒤 늦게 도착한 실패는 표시될 수 있다. 실패 전용 보고는 다른 서버 적재의
  `lastImportStartedAt`을 임의로 비우지 않는다.
- **생산자는 `scripts/push-local.ts`다.** 토큰·slug·커밋 정보를 확보한 뒤 탐지·적재 준비 구간을
  감싸고, `read.errors` 및 `assemblePushInput`의 실패를 종료 전에 보고한다. `parse-failed`와
  `parse-crashed`는 기존 어댑터 분류를 유지한다. 다른 read 오류는 `invalid-locale-data`,
  탐지·조립 단계 실패는 `prepare-failed`다. 혼합 오류의 대표 코드 판정은 순수 함수로 고정한다.
  구문 오류가 탐지 단계에서 후보 탈락으로 나타나는 경우도 `prepare-failed`로 보고해 무음으로 남기지 않는다.
- **보고 실패가 원래 실패를 가리지 않는다.** 요청은 5초 타임아웃·재시도 없이 한 번만 보내고,
  비정상 응답·네트워크 실패는 별도 경고로 남긴 뒤 기존 진단과 exit 1을 유지한다.
  실패 경로에서 `/api/push`를 호출하지 않으며, 성공 경로는 기존 push 한 번이다.
  토큰 부재·CLI 사용법 오류·스크립트 시작 전 실패는 인증된 보고를 만들 수 없다.
- **진행 표시는 서버가 실제 처리 중인 구간만 말한다.** `/api/push`는 인증·가드 통과 뒤 적재 시작에,
  `runFirstIngest`는 인가·준비 상태 확인 뒤 스냅샷 읽기 전에 시작을 기록한다.
  실패 종료는 시작 시각을 대조하는 조건부 갱신으로 자기 진행 표시만 정리하고 실패 코드를 남긴다.
  스냅샷·다운로드·형식 검증의 조기 반환도 기록한다. 첫 적재의 `result.failed > 0`은
  throw가 없어도 `partial-import`다. 성공한 일부 데이터는 기존 계약대로 보존한다.
- **데이터 적재와 결과 표시는 같은 트랜잭션에서 확정한다.** 완전 성공이면 이전 실패를 비우고,
  부분 실패면 `partial-import`를 남긴다. `applyPush` 뒤 별도 UPDATE로 오류를 비워
  데이터는 적재됐는데 목록은 실패로 남는 창을 만들지 않는다. 상태만 쓰는 실패 보고가
  키·번역 갱신용 `applyPush`를 호출해서는 안 된다.
- **표시는 코드 기반이다.** 예: `Locale files could not be parsed. Check the import details.`
  `AdapterError`는 모든 포맷에 행 번호를 제공하지 않으므로 `line 41`이나 파일 수를 지어내지 않는다.
  파서 원문·소스 문자열·로컬 절대경로는 보고 본문과 DB에 저장하지 않는다. 상세 진단은 기존 CI 로그에 남는다.
  설정은 안전한 사유와 복구 안내를 표시한다. `View details`도 `project:settings` 권한에 따라
  OWNER에게만 보이고 EDITOR에게는 OWNER에게 연락하라는 문장을 표시한다.
- **기존 두 컬럼을 사용한다.** 순수 계약·코드 판정은 신규 `lib/projects/import-status.ts`,
  상태 쓰기는 신규 `lib/projects/import-status-store.ts`에 두고 Route Handler와 Server Action이 공유한다.
  저장 경로의 경쟁·종료 정리 조건은 상태 전이 테스트로 고정한다. 신규 실패 기록 후 목록 두 경로와
  해당 설정의 캐시를 무효화한다. 브라우저를 실시간 구독시키는 기능은 추가하지 않는다.
- **서버를 먼저 릴리스한다.** 기존 Action은 새 endpoint를 몰라도 정상 push가 계속된다.
  새 스크립트가 옛 서버의 404를 받으면 보고 경고와 원래 CI 실패를 유지한다.
  대상 리포가 쓰는 `@l10n-push-v1`은 서버 배포만으로 새 코드를 받지 않는다. `docs/ACTIONS.md` 갱신과
  Action 릴리스·대상 참조 적용을 태스크로 남긴다. 원격 브랜치·태그 변경은 Claude Code가 맡는다.

### 3.4 GitHub 조회 — 보관 제외 전부, 동시 프로젝트 최대 3개 (B·C·⊕)

```
인가된 목록에서 보관 프로젝트를 제외하고 전부 처리한다.
프로젝트 작업은 최대 3개가 동시에 진행되고, 하나가 끝나면 다음 프로젝트를 시작한다.
각 프로젝트 안에서 필요한 신호 조회 둘은 병렬이다:
① GET /repos/{owner}/{repo}/compare/{lastCommitSha}...{baseBranch}
     → status(`ahead`/`identical`/…) + files[].filename
     → changedLocaleFileCount(format, layout, files) = 띠의 숫자 (아래 경로 판정 계약)
② GET /repos/{owner}/{repo}/pulls/{n}      n = lastPrUrl에서 파싱
     → state === "open" 일 때만 PR 띠를 그린다
프로젝트별로 클라이언트 생성 → 존재하는 입력에 해당하는 신호 조회 → 결과 반환까지가 작업 하나다.
목록의 DB 집계와 원격 조회 작업 전체는 병렬로 시작하고, 페이지는 둘 다 끝난 뒤 렌더한다.
```

- **자격증명은 installation 토큰이다**(`lib/github.ts`의 `createGitClient`). ⚠️ **user-to-server
  토큰을 쓰지 않는다** — 경계가 셋이고 섞지 않는다(ARCHITECTURE §0 불변식 6,
  `credential-separation.test.ts`가 소스에서 상시로 센다).
- **변경 파일 판정은 신규 순수 모듈 `lib/projects/remote-plan.ts`의 `changedLocaleFileCount`가 맡는다.**
  `resolveLocalePaths`의 반환 길이를 세지 않는다. 그 함수는 per-locale에서 입력 경로를 무시하고,
  multi-locale에서 일치 0개를 오류로 보는 export 계약이다.
  기존 `templatePaths`(`lib/onboarding/confirm.ts`)로 변경 경로 중 탐지 규칙에 맞는 파일을 찾는다.
  per-locale은 추가로 **전체 저장 로케일**을 `pathTemplate.replaceAll("{locale}", code)`로 치환한
  정확한 경로 집합을 합친다. 그래야 탐지 정규식이 제외하는 저장 로케일 `es-419`·`zh-Hant-TW`도 빠지지 않는다.
  저장되지 않은 새 로케일은 기존 탐지 규칙에 맞는 경우 포함한다. 이름만으로 파일 내용까지 읽지는 않는다.
  multi-locale은 기존 `matchGlobPaths` 규칙이며 **일치 0은 정상 0**이다.
- compare의 `filename`을 보고, `status === "renamed"`일 때만 `previous_filename`도 본다.
  둘 중 하나가 매칭되면 **파일 레코드당 한 번** 센다. 추가·삭제·로케일 경로로의 이동·밖으로의 이동을
  포함하되 rename을 두 번 세지 않는다. README만 바뀌면 0이며 `repo_ahead` 띠를 만들지 않는다.
  실제 base 브랜치 이름을 문구에 넣고 `main`을 하드코딩하지 않는다.
  `remote-plan.ts`는 서버의 `remote.ts`와 테스트만 읽는다. 어댑터 그래프를 읽는 `templatePaths`를
  `list.ts`에서 import·재수출하지 않아 목록 판정의 잎 경계를 유지한다.
- **현재 `GitClient`에는 compare·단일 PR 상태 조회 메서드가 없다.** `lib/pull/client.ts`의 타입,
  `lib/github.ts`의 구현 및 fake를 함께 확장한다. 프로젝트당 클라이언트 하나를 두 신호가 공유하고,
  클라이언트 생성 과정의 토큰 발급·리포 identity 확인도 동시 프로젝트 제한 안에서 수행한다.
- **보관 제외 전부**는 앞의 3개만 조회한다는 뜻이 아니다. `slice(0,3)`이나 3개 단위 일괄 대기는
  쓰지 않는다. 완료될 때마다 다음 작업을 시작하며, 모든 결과를 원래 프로젝트에 결합한다.
  완료 순서가 목록의 `slug asc` 정렬을 바꾸지 않는다. 별도 라이브러리·사용자 설정은 추가하지 않는다.
- ⚠️ **`repositoryId`로 좁혀 만든다** — 불변식 11(리포의 정체성은 이름이 아니라 id). `repositoryId`가
  `null`인 프로젝트는 이미 `needs_reconnect`라 **호출 자체를 건너뛴다**(§4의 덮개 규칙이 그 띠를 이긴다).
- `installationId`가 없으면 클라이언트를 만들지 않는다. `lastCommitSha`가 없으면 compare를,
  유효한 `lastPrUrl`의 PR 번호가 없으면 PR 조회를 건너뛴다. 두 신호 모두 입력이 없으면 요청은 0이다.
  이 프로젝트들도 목록에는 남고 DB 상태로 표시된다.
- ⚠️ **실패는 띠를 생략한다 — 화면을 죽이지 않는다.** `lib/failure.ts`의 관용구로 값으로 흐르게 하고,
  목록은 DB만으로 완성된다. 근거: 이 호출은 **행동을 권하는 부가 정보**이고, GitHub이 느린 날
  `/projects`가 로그인 직후의 착지점이라는 사실은 안 바뀐다.
- ⚠️ **불변식 9와 충돌하지 않는다** — "버린 값을 성공으로 숨기지 않는다"는 **sync 결과**에 대한 것이고,
  여기서 생략되는 것은 판정이 아니라 표시다. 다만 **실패를 성공처럼 그리지도 않는다**: 호출이 실패하면
  `pr_open`·`repo_ahead` 둘 다 안 그리고, 다른 띠(발송·검토)는 DB만으로 서므로 그대로 남는다.
- **목록 전체에는 프로젝트 3개 상한이 없다.** 그 제한은 OWNER의 활성 프로젝트 생성에만 적용된다.
  보관 제외 N개에 신호 입력이 모두 있으면 신호 조회는 2N회이고, 토큰 발급·리포 확인 요청은 별도다.
  **3은 동시 프로젝트 수**이며 전체 요청 수나 전체 프로젝트 수가 아니다. 대상이 늘면 렌더 대기도
  길어진다는 대가를 유지한다. 프로젝트 하나가 실패해도 작업 자리를 반환해 나머지를 끝까지 처리한다.
- **사용자별 조회에 공유 캐시나 주기적 재검증을 추가하지 않는다.** 쓰기 후 `revalidatePath`는
  별개이며 새 소비자인 `/projects`·`/projects/new`까지 포함한다. 번역 저장·Publish·push·
  첫 적재·임포트 실패의 상태 변경 뒤 복귀/새로고침에서 최신 값을 검증한다.

## 4. 순수 함수 — `/tdd` 진입점

전부 `lib/projects/list.ts`(잎 모듈)에 둔다. ⚠️ **판정을 오케스트레이션 파일에 두지 않는다**
(ARCHITECTURE §0 말미 — 클라이언트 번들이 그 그래프를 따라온다).

```ts
// ① 그룹 판정
export type ProjectGroup = "needs_attention" | "all_set" | "archived";
export function projectGroup(row: ProjectStatusInput & ProjectEvents): ProjectGroup;

// ② 띠 판정 — 겹치면 하나만
export type RowBanner =
  | { kind: "needs_reconnect" }      // 덮개
  | { kind: "import_failed"; reason: string }  // 덮개
  | { kind: "setup" }
  | { kind: "awaiting_first_sync" }
  | { kind: "unsent"; count: number }              // F: 역할로 갈리지 않는다
  | { kind: "pr_open"; number: number; url: string }
  | { kind: "repo_ahead"; files: number }          // C′: 로케일 **파일** 수
  | { kind: "review"; count: number }
  | null;
export function rowBanner(row: ProjectStatusInput & ProjectEvents): RowBanner;

// ③ Meter 자리 — 바를 그릴지 문장을 둘지
export function meterSlot(row): { kind: "meters"; locales: RowLocaleProgress[] } | { kind: "note"; note: NoteKind };

// ④ 진행률 접기 (§3.1)
export function rowLocaleProgress(...): Map<string, RowLocaleProgress[]>;

// ⑤ 계정 합계 (§3.2)
export function summaryQueue(...): { newFromGithub: number; toTranslate: number; toReview: number; toSend: number };

// ⑥ 그룹 나누기 — 검색 중에는 평평하게
export function groupProjects(rows, q): { flat: true; rows } | { flat: false; groups: [group, rows][] };
```

**띠 우선순위** (`rowBanner`의 계약):

```
0. archived               ← 항상 null (어떤 사건이 겹쳐도 보관 행에 액션 없음)
1. needs_reconnect        ← 모든 것을 덮는다
2. import_failed          ← 모든 것을 덮는다
3. setup / awaiting_first_sync   ← 이 상태에서는 아래 사건이 성립할 수 없다
4. 발송:  unsent  >  pr_open     ← E: 안 보낸 편집이 있는 PR은 최신이 아니다
5. 충돌:  repo_ahead
6. 검토:  review
```

⚠️ **`rowBanner`가 역할을 받지 않는다** (F). 시안의 Editor 갈래
(*"24 edits are waiting for an owner to send them."*)는 **버린다** — PRODUCT §3이
**EDITOR에게도 Publish를 허용**하므로 그 문구는 화면이 권한을 실제보다 좁혀 말하는 것이다.

⚠️ **시안의 의도("눌러서 거절당하지 않게")는 다른 자리에서 지켜진다** — `needs_reconnect`의
[Reconnect]와 `setup`의 [Continue setup]은 **실제로 OWNER 전용**(`project:settings`)이라
`View details`도 같은 설정 권한이 필요하므로 **셋**의 링크가 역할로 갈린다.
그 판정은 띠가 아니라 **호출부**가 `row.role`로 한다 —
`rowBanner`를 순수하게 유지하는 것이 `/tdd` 매트릭스를 반으로 줄인다.

## 5. 상태 표 — 칩 · Meter 자리 · 띠 · 그룹

캔버스 `1c`의 순서 그대로다. 띠 문구는 캔버스에서 그대로 인용했다(영문 그대로 `messages/en.tsx`로 간다).

| # | 상태 | 칩 | Meter 자리 | 띠 (링크) | 그룹 |
|---|---|---|---|---|---|
| 1 | active · all set | `Active` 초록 | 바 | — | All set |
| 2 | active · translating | `Active` | 바 | — | All set |
| 3 | review pending | `Active` | 바 | `88 strings are translated and waiting for review.` (`Review`) · `eye` | All set |
| 4 | unsent edits | `Active` | 바 | `24 edits have not been sent to GitHub yet.` (`Send changes`) · `git-pull-request-arrow` | **Needs attention** |
| 6 | pull request open | `Active` | 바 | `Pull request #142 is open — merge it to finish.` (`View on GitHub`) · `git-pull-request` — ⚠️ **`state === "open"`을 확인하고 그린다**(B) | All set |
| 7 | repo moved ahead | `Active` | 바 | `3 locale files changed on main after your last import.` (`Review changes`) · `git-merge` — **C′: 키가 아니라 파일 수다** | **Needs attention** |
| 8 | awaiting first sync | `Pending` | `Waiting for the first import.` | — | **Needs attention** |
| 9 | awaiting first sync · 진행 중 | `Pending` | `Importing locale data.` | — | **Needs attention** |
| 10 | awaiting first sync · 실패 | `Pending` | `No data imported.` | 실패 코드에 맞는 안전한 문구(§3.35). 파싱 실패는 `Locale files could not be parsed. Check the import details.` (`View details`, OWNER만) · `triangle-alert` **#991b1b** | **Needs attention** |
| 11 | setup | `Setup` 무색 | `Connect the GitHub App to continue.` | `Finish setup to start translating.` (`Continue setup`) · `circle-dashed` | **Needs attention** |
| 12 | needs reconnect | `Disconnected` amber | 바 | `GitHub App access was revoked — pushes and pull requests stop until it is reconnected.` (`Reconnect`) · `unplug` **#92400e** | **Needs attention** |
| 13 | archived | `Archived` 무색 · 이름도 `#737373` | 바 | — | **Archived** |

번호는 시안의 참조 번호여서 삭제한 5번은 비워 둔다. 중첩 사건은 별도로 검증한다:
보관이면 다른 사건이 있어도 띠가 없고, 적재된 프로젝트의 실패·부분 실패는 기존 Meter를 유지하면서
`import_failed` 띠로 표시한다. `No data imported.`는 실제 첫 적재 전 상태에만 쓴다.

**칩 다섯은 `STATUS_VARIANT`와 1:1 그대로다**(`project-list.tsx:56`) — 맵 + `satisfies` 형을 유지한다
(`projects-screen.test.ts:88`가 그것을 센다). **빨강·파랑 칩은 없다.**

**띠 링크의 목적지**

| 액션 | 목적지 | 주의 |
|---|---|---|
| `Review` | `routes.translations(slug)` | ⚠️ `?state=`는 **8-4가 폐기했다**(`lib/routes.ts:36`) — 검토 대기만 걸러 보내는 쿼리가 없다 |
| `Send changes` | `routes.translations(slug)` | ⚠️ **Publish는 라우트가 아니다**(PRODUCT §7.7) — 번역 화면 툴바의 버튼으로 데려갈 뿐이다 |
| `View on GitHub` | `Project.lastPrUrl` | 외부 링크 — DESIGN §6.3의 `ExternalLink` 12 규칙 |
| `Review changes` | base 브랜치의 compare 화면 — `https://github.com/{owner}/{repo}/compare/{lastCommitSha}...{baseBranch}` | ①이 이미 그 범위를 계산한다. 외부 링크 |
| `View details` | `routes.settings(slug)` | **OWNER만**. 저장된 실패 코드의 안전한 문구와 복구 안내를 새로 표시한다. 첫 적재 대기면 기존 재시도, 이미 적재됐다면 CI 수정·재실행 안내다. 파서 원문 로그를 이 화면에 복제하지 않는다 |
| `Continue setup` | `routes.settings(slug)` | `project:settings` 뒤라 EDITOR에게는 링크를 빼야 한다 |
| `Reconnect` | `routes.settings(slug)` | 같음(OWNER 전용 — PRODUCT §3) |

## 6. 폭 축소 — 컨테이너 쿼리를 권고한다

| 컨테이너 폭 | Meter |
|---|---|
| ≥ 1120 | 셋 |
| < 1120 | 둘 |
| < 940 | 하나 — **`baseLocale`** |
| < 760 | 0 |

**결정: Tailwind v4의 `@container` + 서버는 정렬된 셋만 준다** (2026-09-13 사용자).

**대기·설정 안내 문장도 폭 축소 대상이다**(2026-09-13 검수 결정).
Meter 대체 문장은 기준 폭 332px을 유지하되 `min-w-0 shrink truncate`로 남은 폭까지 줄어들 수 있다.
이름 칸 420px·글리프·우측 상태 배지와 화살표의 폭을 먼저 보존한다. 공간이 충분하면 문장은 332px,
부족하면 축소되며 한 줄 말줄임한다. 문구를 JS로 자르거나 DOM에서 제거하지 않는다.
이 규칙은 `setup`·첫 적재 대기·진행·실패의 모든 대체 문장에 동일하게 적용한다.
컨테이너 840·680px에서 행의 가로 overflow가 없고 우측 배지·화살표·포커스 링이 카드 안에 온전히
보이는지 실측한다. Meter 개수만 줄여 놓고 대체 문장의 `shrink-0`을 남기는 구현은 실패다.

- 근거 ①: 패널 폭 = 뷰포트 − 사이드바 240 − 바깥 padding 8 − gap 8 − 패널 padding이라
  **뷰포트 기준과 60~300px 어긋난다.** 게다가 프로젝트 화면은 오른쪽 패널 320을 더 뺀다
  (`shell-layout.test.ts:160`) — 같은 뷰포트가 두 폭을 만든다.
- 근거 ②: 셸이 `min-w-[1280px]`를 든다(`shell-layout.test.ts:120`). **뷰포트 브레이크포인트로는
  1120·940·760이 영영 안 밟힌다** — 가로 스크롤이 먼저 생긴다. 컨테이너 폭만이 실제로 변한다.
- 근거 ③: 정렬이 base 먼저이므로(§3.1) **앞에서부터 자르면 "하나일 때 base"가 공짜로 성립한다.**
  CSS는 `nth-child(n+2)`·`nth-child(n+3)`을 숨기기만 하면 된다.
- ⚠️ **`tailwind.config.js`가 없다**(CLAUDE.md). 컨테이너 이름·크기는 `app/globals.css`의 `@theme`
  또는 유틸리티 그대로 쓴다.

⚠️ **1120/940/760은 캔버스의 값이고 `app/globals.css`에 그 이름의 토큰이 없다** — **DESIGN §6.63의
치수표에 등재한다**(G).

## 7. 문구 — `messages/en.tsx`

**재사용**: `m.common.nav.projects`(제목) · `m.common.nav.newProject` · `m.projects.search.*` ·
`m.projects.memberCount` · `m.projects.role` · `m.projects.status.*` · `m.projects.empty.title`
(`No projects yet` — 캔버스와 같다) · `m.projects.narrowed.{title,bySearch}`.

**바뀜**: `m.projects.narrowed.reset` `Clear filters` → `Clear search`(§1.4) ·
`m.projects.empty.description`(KV 시안의 46ch 문장으로 교체).

**지움**: `m.projects.filter.{label,all}` · `m.projects.narrowed.byFilter`.

**신규**

```
projects.summary.newFromGithub / toTranslate / toReview / toSend
projects.group.needsAttention "Needs attention" / allSet "All set"
   ⚠️ archived는 기존 m.projects.archived 재사용
projects.searchResult(n, total, q)  "1 of 3 projects match chrome"
projects.clearSearch "Clear search"          ← narrowed.reset과 같은 값이어야 한다(§1.4)
projects.banner.review(n) / unsent(n) / prOpen(n) / repoAhead(n, baseBranch)
   / awaitingFirstSync / importing / importFailed(reason) / setup / needsReconnect
projects.banner.action.{review,send,viewPr,reviewChanges,viewDetails,continueSetup,reconnect}
projects.importFailure.{parseFailed,parseCrashed,invalidLocaleData,prepareFailed,partialImport,importFailed,contactOwner}
projects.meter.note.{waiting,importing,failed,setup}
```

⚠️ **소스에 한글 UI 리터럴 금지**(`lib/i18n/__tests__/no-korean-ui.test.ts`) — 위 문구는 전부 영문이다.

## 8. 스키마 · 환경변수 · 불변식

- **스키마 변경: additive 셋** (A·D — `/db`가 받는다, 배포 순서는 additive-first).

  | 컬럼 | 타입 | 쓰는 자리 | backfill |
  |---|---|---|---|
  | `StringKey.createdAt` | `DateTime @default(now())` | `applyPush`의 `toInsert` | **확정:** 기존 키는 `COALESCE(Project.lastPulledAt, Project.createdAt)`으로 채운다. pull 이력이 있으면 초기 신규 집계에서 제외하고, 이력이 없으면 §3.2에 따라 활성 키 전체를 센다 |
  | `Project.lastImportStartedAt` | `DateTime?` | 인가된 서버 적재 시작·종료에서 갱신(§3.35). CI 실패 보고는 건드리지 않는다 | 불필요(null이 "서버 적재 진행 표시 없음") |
  | `Project.lastImportError` | `String?` | CI 실패 보고·서버 적재 실패·부분 실패에서 코드 기록, 완전 성공 트랜잭션에서 비움(§3.35) | 불필요 |

  - **backfill은 기존 키의 실제 생성 시각을 복원하지 않는다.** 기존 키를 초기 기준으로 취급하는 정책이다.
    `lastCommitAt > lastPulledAt`이어도 기존 키를 신규로 세지 않는다. pull 이력이 없는 프로젝트에서
    활성 키 전체가 신규로 잡히는 것은 승인된 정의이며 backfill 실패가 아니다.
  - ⚠️ **`applyPush`는 한 트랜잭션이다**(ARCHITECTURE §5.5.15) — StringKey의 별도 `UPDATE`문에
    `createdAt`을 넣지 않는다. 신규 키 `INSERT`에서만 채우고, 재push·orphaned 복구에도 보존한다.
  - ⚠️ **`lastImportError`에 원문 오류를 그대로 넣지 않는다** — `/api/push`의 500 본문 규칙과 같은
    계보다(ARCHITECTURE §6.0: 500 본문은 우리 메시지만 담는다). 화면에 나가는 문장이므로 코드로 저장하고
    문구는 `messages/en.tsx`가 든다.
  - ⚠️ **이것은 `SyncRun` 확장이 아니다** — PRODUCT §4.1이 예고한 "push를 `SyncRun`에 넣는 것"은
    idempotency 판정이 딸린 별도 feature이고, 여기서는 **마지막 하나**만 든다. 이력이 필요해지면 그때 옮긴다.
- **새 환경변수 없음.**
- **불변식 보존 검증 필요** — 새 외부 쓰기의 토큰 인증·projectId 제한과 성공 결과의 원자성을 확인한다.
  **§0-5**(집계·실패 기록을 인가된 프로젝트로 좁힘), **§0-2**(실패 보고는 키·번역을 덮지 않고
  미발송 술어의 `updatedBy IS NOT NULL` 유지), **§0-9**(부분 실패·보고 실패를 성공으로 숨기지 않음)를 검증한다.
  export·blob SHA 계약은 바꾸지 않는다.

## 8.5 POSTMORTEM — 이 영역이 이미 밟은 지뢰

- **2026-09-05 라우트를 옮겼는데 링크 생성기가 옛 경로를 하드코딩해 사이드바가 전부 404였다** →
  §1.2의 목록·복귀 경로를 **한 커밋**에서 옮기고 `entry-points.test.ts`를 돌린다.
- **2026-09-06 실패 사유를 쿼리로 넘겨놓고 읽는 쪽을 안 만들어 거부가 통째로 무음이었다** →
  `?e=`는 `isAccessError`·`isConnectError` **둘 다** 본다(`page.tsx:39`). 머리 구조를 바꾸면서
  이 분기를 잃지 않는다.
- **2026-09-08 제출 버튼이 없는 `<form>`이라 검색창의 Enter가 조용히 무효였다** →
  검색은 `SearchInput` 프리미티브를 그대로 쓴다(`onKeyDown` + IME 가드). **`<form>`을 만들지 않는다.**
- **2026-09-12 필터 툴바만 잠가 칩이 이전 쿼리를 다시 제출할 수 있었다** → URL을 바꾸는 컨트롤이
  검색 하나로 줄어 이 부류가 구조적으로 사라진다(탭을 지우는 부수 효과).
- **2026-09-11 게이트 셋과 소스 스캔 여섯이 green인데 번역 입력이 28px였다** → Meter·띠·그룹은
  **소스 검사로는 안 보이는 시각 축**이다. `/bugshot-qa`가 완료 조건에 들어가는 근거.
- **2026-09-09 실측이 고정 3.3초를 "순차 DB 왕복"으로 진단했고 원인은 함수 리전이었다** →
  집계 다섯(§3)을 **`Promise.all`로 병렬**로 보낸다. 순차로 보내면 도쿄 왕복이 그대로 쌓인다.

## 9. 결정된 것 (2026-09-13 사용자)

기존 시안 결정과 검수에서 확정한 내용을 함께 기록한다. 각 항목의 대가는 마지막 열에 적는다.

| | 질문 | 결정 | 받아들인 대가 |
|---|---|---|---|
| A | `New from GitHub`의 데이터가 없다 | **`StringKey.createdAt` 추가**(additive) | 기존 키는 `COALESCE(lastPulledAt, Project.createdAt)`으로 backfill해 초기 기준으로 취급한다. 첫 pull 전에는 활성 키 전체를 센다 |
| B | PR이 열려 있는지 모른다 | **compare 호출에 `GET /pulls/{n}`을 얹는다** | 입력이 있는 프로젝트당 신호 조회가 2회다. 토큰 발급·리포 확인 요청은 별도다 |
| C | `repo moved ahead`의 데이터가 없다 | **GitHub API로 실제 head 비교** — `GET /compare/{lastCommitSha}...{base}` | 목록 렌더가 GitHub에 의존한다(§3.4) |
| C′ | 비교 수준 | **바뀐 로케일 파일 수**를 낸다 — 변경 경로를 `changedLocaleFileCount`로 판정한다(§3.4) | 시안의 `12 keys`가 `3 locale files`가 된다. **키 수는 지어내지 않는다** |
| D | 임포트 진행·실패 이력이 없다 | **`Project`에 컬럼 둘** — `lastImportStartedAt` · `lastImportError`. **CI 파싱 실패도 포함**(§3.35) | 서버·CI 실패 보고 경로와 Action 릴리스가 필요하다. 마지막 수신 결과만 남기며 `SyncRun` 이력은 추가하지 않는다 |
| E | `unsent` vs `pr_open` 순서 | **`unsent`가 먼저** | 머지만 남은 프로젝트도 편집이 남아 있으면 그 사실을 먼저 본다 |
| F | Editor 띠 문구 | **역할 무관으로 통일** — 둘 다 `24 edits have not been sent to GitHub yet.` + 링크 | 시안 문구 하나를 버린다. PRODUCT §3(EDITOR도 Publish)이 이긴다 |
| G | 시안 치수의 집 | **DESIGN §6.63에 표로 등재** | 문서 커밋 하나가 는다 |
| H | 검색창 폭 220 vs `w-64`(256) | **`w-64` 유지** | **"px 하나까지 동일"의 유일한 예외**다. 프리미티브를 열어 툴바마다 폭이 갈리는 것보다 36px 차이가 싸다 |
| I | 좁은 화면에서 대기·설정 문장이 우측 배지를 밀어낸다 | **기준 332px + 남은 폭에 맞춰 축소·말줄임** | 넓은 시안 치수는 유지하고 좁은 화면에서 문구 전체를 한눈에 읽는 대신 상태 배지·포커스 표시를 보존한다 |
| J | Meter에 완료율·검토 대기율을 함께 읽는 스크린리더 설명을 추가할 것인가 | **추가하지 않는다**(2026-09-13 사용자) | 해당 접근성 설명과 전용 검증을 이번 구현 태스크에 넣지 않는다 |
| ⊕ | GitHub 호출을 어디서 기다리나 | **보관 제외 전부 조회하며 동시에 최대 3개 프로젝트를 처리하고 페이지가 전체 완료를 기다린다** | 대상이 늘면 목록 렌더 대기도 길어진다. 띠가 나중에 붙어 행이 밀리는 일은 없다 |

**검수에서 확정한 정의:** `New from GitHub`는 **마지막 pull 이후 추가된 활성 키**다(§3.2).
**첫 pull 전에는 활성 키 전체를 센다.** 기존 키 backfill은 **`COALESCE(Project.lastPulledAt, Project.createdAt)`**으로 확정했다(§8).
**Summary 네 항목은 보관 프로젝트를 제외한다.** 보관 행·Meter·목록 총계는 유지한다(§3.2).

**기존 열린 결정 둘 — 둘 다 이번 범위 밖이다.**

1. **계정 단위 큐 화면** — 생기면 Summary 칸이 링크가 된다. 그때까지 표시 전용.
2. **보관이 5건 이상 쌓였을 때** — 접기를 배제했다. 그때 `All / Archived` 둘로만 되살린다.

## 10. 영향받는 테스트

⚠️ **핸드오프가 지목한 `app/(edit)/__tests__/screens.test.ts`는 존재하지 않는다.** 실제 파일은 아래다.

| 파일 | 무엇이 깨지나 | 어떻게 |
|---|---|---|
| `lib/projects/__tests__/list.test.ts` | `parseProjectFilter`·`filterProjects` 블록 전체(:16-82) | 지우고 `projectGroup`·`rowBanner`·`meterSlot`·`rowLocaleProgress`·`summaryQueue` 테스트로 대체. **`projectStatus`·`searchProjects` 블록은 그대로 남긴다** |
| `components/__tests__/projects-screen.test.ts` | `:44` `parseProjectFilter` 단언 · `:52` "탭 링크를 `routes.projects`가 만든다" | 앞은 삭제, 뒤는 **검색 링크**가 그것을 지나는지로 바꾼다. `:67`(`projectStatus` 하나) · `:88`(맵+`satisfies`) · `:104`(색 다섯) · `:123`(역할 평문) · `:141`(`shrink-0`) · `:157`(`PanelBody`)는 **그대로 통과해야 한다** — 통과 못 하면 시안을 잘못 옮긴 것이다. **추가**: Summary 안에 링크 0 · 그룹 헤더 셋 · 띠가 `rowBanner`를 지남 |
| `app/(edit)/__tests__/projects-query.test.tsx` | `:26` "`q`·`filter`가 뒤 목록에 실려 넘어간다" | `filter`를 빼고 `q`만 본다 |
| `app/__tests__/entry-points.test.ts` | `:430` 주석이 `routes.projects({ filter, q })`를 인용 | 쿼리 인자 축소 반영 |
| `lib/__tests__/routes.test.ts` | `:11` `routes.projects()` | 인자 축소 반영 |
| `components/__tests__/focus-ring.test.ts` | — | **깨지지 않는다.** `SegmentedLinks` 픽스처는 프리미티브를 직접 렌더한다(§1.3) |
| `app/(edit)/__tests__/shell-layout.test.ts` | — | **깨지지 않아야 한다.** 패널은 페이지가 계속 하나만 든다. `:127`(헤더의 `routes.projects()`)은 인자 없는 호출이라 무사 |
| `components/__tests__/skeleton.test.tsx` | 목록 스켈레톤 골격 | Summary 줄 + 그룹 헤더를 더한다 |
| `lib/i18n/__tests__/no-korean-ui.test.ts` | — | 신규 문구가 전부 영문이면 통과 |
| `components/__tests__/client-graph.test.ts` | 새 판정을 클라이언트가 읽으면 red | 판정은 `lib/projects/list.ts`(잎)에 둔다 |
| **신규** `lib/keys/__tests__/list-aggregates.test.ts` | — | 멤버십 1+집계 5, 신규 키 경계값, 전체 활성 로케일 접기, 검색과 Summary 독립을 고정한다 |
| **신규** `lib/projects/__tests__/remote-plan.test.ts` | — | 변경 파일만 셈, 추가·삭제·rename, 일치 0, 저장된 긴/숫자 로케일 경로 |
| **신규** `lib/projects/__tests__/remote.test.ts` | — | 동시 프로젝트 최대 3, 대상 전수 처리, 실패 후 진행, 입력 없는 신호 무호출 |
| **신규** `lib/keys/__tests__/list-aggregates.integration.ts` | — | 격리 Postgres에서 raw 집계와 기준 count·행 판정의 실제 결과 비교(T3) |

## 11. 픽셀 명세 — 시안이 정본이다 (`1b`·`1c`)

**요구는 "복붙 수준"이다. 그래서 이 절은 서술이 아니라 대조표다** — 아래 값은
`Projects.dc.html`의 **인라인 스타일에서 그대로 인용**했고, 오른쪽 열이 그것을 만드는 유일한 방법이다.
값이 어긋나면 구현이 틀린 것이지 시안이 융통성 있는 것이 아니다.

⚠️ **이전 사이클(`new-project-modal`)에서 같은 캔버스를 주고도 구현이 시안과 갈렸다.**
원인은 "비슷한 유틸리티로 옮긴 것"이다 — `gap-2.5`(10)로 `gap 16`을, `rounded-sm`(8)으로 `radius 4`를
옮기면 `tsc`도 `pnpm test`도 조용하다. **그래서 §11.5의 소스 검사와 실측을 게이트로 박는다.**

### 11.1 토큰이 이미 맞는 것 — 임의 값을 쓰지 마라

| 시안 값 | 토큰/유틸 | 근거 |
|---|---|---|
| `#0a0a0a` | `--foreground` = `hsl(0 0% 3.9%)` | 같은 색 |
| `#737373` | `--muted-foreground` = `hsl(0 0% 45.1%)` | 같은 색 |
| `#171717` / `#fafafa` | `--primary` / `--primary-foreground` | 같은 색 |
| `#e5e5e5` | `--border` · `--input` = `hsl(0 0% 89.8%)` | 같은 색 |
| `#e9ecef` (패널) | `--border-subtle` | `ContentPanel`이 이미 든다 |
| `#2563eb` | `blue-600` | DESIGN §6.2 등재됨 |
| `rgba(220,252,231,0.8)` / `#166534` | `Badge variant="success"` = `bg-green-100/80 text-green-800` | 값이 정확히 같다 |
| `rgba(254,243,199,0.8)` / `#92400e` | `Badge variant="warning"` = `bg-amber-100/80 text-amber-800` | 값이 정확히 같다 |
| `rgba(10,10,10,0.05)` | `Badge variant="neutral"` = `bg-foreground/5` | 같은 색 |
| `#f59e0b` | `amber-500` | Meter 검토 구간 |
| `#f0f0f0` | **`foreground/[0.06]`** | 흰 위 6% = `rgb(240.3)` ≈ `#f0f0f0`. **새 raw 색을 만들지 않는다**(DESIGN §6.2) |
| 30 / 24 / 20 / 18 / 15 / 14 / 13 | `text-3xl` / `2xl` / `xl` / `lg` / `base` / `sm` / `xs` | ⚠️ `--text-base`는 **15px**, `--text-xs`는 **13px**로 이미 덮여 있다 |
| 자간 `0.005em` / `0.015em` / `0.02em` | `--text-xl--` / `--text-base--` / `--text-sm·xs--letter-spacing` | 크기 토큰이 자간을 데리고 온다 — `tracking-*`를 따로 쓰지 않는다 |
| radius 10 / 12 / 16 | `rounded-md` / `rounded-lg` / `rounded-xl` | `--radius: 0.75rem` 파생 |
| 버튼 36 · radius 10 · px 12 · 14 · gap 8 | `<Button size="md" variant="primary">` 기본값 | `h-9 rounded-md px-3 text-sm gap-2` — **그대로 맞는다** |
| 검색 36 · radius 10 · border `#e5e5e5` · pl 32 | `SearchInput` 그대로 | ⚠️ **폭만 예외다** — 시안 220, 코드 `w-64`(256). **`w-64`를 유지한다**(H): 프리미티브가 폭을 소유하는 이유가 "두 툴바가 같아야 한다"이고, 36px 때문에 그것을 열지 않는다. **"px 하나까지 동일"의 유일한 예외이고, 그래서 여기 적는다** |

### 11.2 시안 ↔ **현재 코드가 다른** 자리 — 전부 고친다

| # | 자리 | 시안 | 현재 코드 | 채택 |
|---|---|---|---|---|
| P1 | 행 글리프 radius | **4** | `rounded-sm` = **8** (`--radius-sm` = `calc(0.75rem - 4px)`) | `rounded-[4px]` |
| P2 | 행 요소 gap | **16** | `gap-2.5` = 10 | `gap-4` |
| P3 | 이름 칸 | **`width:420` + `flex-shrink:0`** | `flex-1 min-w-0` | `w-[420px] min-w-0 shrink-0` |
| P4 | 행 hover 배경 | `rgba(10,10,10,0.02)` | `hover:bg-foreground/[0.03]` | `hover:bg-foreground/[0.02]` |
| P5 | 본문 아래 여백 | **20** | `pb-8` = 32 | `pb-5` |
| P6 | 상태 칩 좌우 padding | **8** | `Badge`가 `px-1.5` = 6 | 호출부에서 `className="px-2"` (⚠️ **총계·그룹 카운트 배지는 `px-1.5` 그대로다** — `min-w-5`가 이겨야 원형이 된다, `badge.tsx:20` 주석) |
| P7 | 목록 카드 radius | **12** | `rounded-lg` = 12 ✅ | 그대로 |
| P8 | 행 사이 구분선 | `#e5e5e5` | `divide-border` ✅ | 그대로 (⚠️ 띠가 들어가면 `divide-y`가 **띠와 행 사이에도** 선을 넣는다 — §11.3) |

### 11.3 새로 그리는 것 — 인라인 스타일 그대로의 명세

**머리**

```
PanelHeader  px-6 pt-6 pb-3  flex flex-col gap-4          (24 24 12 · gap 16)
└ 제목 줄     flex items-center gap-3                      (gap 12)
   ├ 왼쪽     flex items-center gap-2                      (gap 8)
   │   ├ h1   text-xl font-medium                          (20 / 500 / 0.005em)
   │   └ Badge neutral                                      (min-w-5 px-1.5 py-0.5 text-xs font-medium · radius 999)
   ├ 검색     ml-auto                                       (margin-left:auto)
   └ Button   primary md                                    (36 · radius 10)
└ Summary    flex items-stretch gap-6 border-y border-foreground/[0.06] py-3.5
             (gap 24 · 위아래 hairline #f0f0f0 · padding 14 0)
   ├ 칸       w-50 flex flex-col gap-1                      (200 고정 · gap 4)
   │   ├ 라벨  flex items-center gap-1.5 text-xs text-muted-foreground   (gap 6 · 13 · #737373)
   │   │   └ 아이콘 size-3.5                                 (14)
   │   └ 값    text-xl font-medium                           (20 / 500 / 0.005em)
   └ 구분선   w-px shrink-0 self-stretch bg-border           (**별개 요소** · 1px · #e5e5e5 · gap 24 안)
```

**본문 · 그룹**

```
PanelBody  px-6 pt-3 pb-5  flex flex-col gap-5             (12 24 20 · 그룹 사이 20)
└ 그룹      flex flex-col gap-2                             (헤더↔카드 8)
   ├ 헤더    flex items-center gap-2
   │   ├ h2  text-sm font-medium                            (14 / 500 / 0.02em)
   │   └ Badge neutral                                       (카운트)
   └ 카드    rounded-xl? **아니다 → `rounded-lg`(12)** + `border border-border` + `overflow-hidden` + `bg-background`
```

⚠️ **카드 radius는 12이고 패널의 16이 아니다.** `rounded-lg`.

**행**

```
<a> flex items-center gap-4 py-3.5 pr-3.5 pl-14? **아니다 → pl-3**   (14 14 14 12)
    hover:bg-foreground/[0.02]
    focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-inset focus-visible:outline-none
├ 글리프   size-7 shrink-0 rounded-[4px] + toneFill(name) + text-white  → <Box className="size-4"/>   (28 · 4 · 16)
├ 이름칸   w-[420px] min-w-0 shrink-0 flex flex-col gap-0.5             (420 · gap 2)
│   ├ 이름  truncate text-base font-medium                              (15 / 500 / 0.015em)
│   └ 메타  truncate text-sm text-muted-foreground                      (14 · #737373)
│           ⚠️ **`owner/repo`로 줄인다** — 시안이 `https://github.com/`를 뗐다
├ Meter묶음 flex gap-4 shrink-0                                          (gap 16)
│   └ 칸    w-25 flex flex-col gap-1.5                                   (100 · gap 6)
│      ├ 라벨 flex items-center gap-1.5 text-xs                          (gap 6 · 13 / 0.02em)
│      │   ├ 국기 **`<LocaleFlag code={code}/>`를 그대로 쓴다**            (16×11 · radius 2)
│      │   │      = `h-[11px] w-4 shrink-0 rounded-xs bg-cover bg-center` — 시안과 이미 같다
│      │   ├ 코드 (상속 색)
│      │   └ 퍼센트 ml-auto text-muted-foreground
│      └ 바   flex h-1 overflow-hidden rounded-full bg-foreground/[0.08] (높이 4 · radius 999 · 트랙 8%)
│          ├ 완료 h-1 bg-foreground/85        style={{width}}            (rgba(10,10,10,0.85))
│          └ 검토 h-1 bg-amber-500            style={{width}}            (#f59e0b)
└ 우측     ml-auto flex shrink-0 items-center gap-3                      (gap 12)
    ├ Badge (상태 · px-2)
    └ <ChevronRight className="size-4 text-muted-foreground"/>
```

⚠️ **`ml-auto`가 우측 묶음에만 붙는다.** 이름 칸 420 고정 + Meter 좌측 정렬 + 우측 `ml-auto`가
"흔들리는 것은 빈 공간뿐"을 만드는 장치다 — 셋 중 하나만 빠져도 칩의 x가 행마다 달라진다.

**Meter 자리의 문장**(값이 없는 상태)

```
<span class="w-[332px] min-w-0 shrink truncate text-sm text-muted-foreground">  (기준 332 = 100*3 + 16*2)
```

폭이 부족하면 이 문장만 축소한다(§6). 넓은 화면에서의 332px 실측과 좁은 화면에서의 잘림 방지를
함께 검증한다. `shrink-0`으로 되돌리지 않는다.

**띠**

```
<div class="flex items-center gap-2 border-t border-foreground/[0.06] bg-foreground/[0.02]
            py-2 pr-3.5 pl-14 text-xs text-muted-foreground">              (8 14 8 56 · 13)
├ 아이콘 size-3.5 (+ 색: 실패 red-800 · 끊김 amber-800 · 그 외 상속)        (14)
├ 문장
└ <Link class="ml-1 text-blue-600">                                        (margin-left 4)
```

⚠️ **띠는 행의 형제이고 `<a>` 안이 아니다** — 링크를 중첩할 수 없다(`project-list.tsx:285` 주석과 같은 제약).
⚠️ **`divide-y`를 쓰면 띠와 행 사이에도 `#e5e5e5` 선이 생긴다.** 시안은 거기가 `#f0f0f0`이고 행 사이만
`#e5e5e5`다 → **`divide-y`를 버리고 행마다 `border-t`를 직접 준다**(첫 행 제외). `projects-screen.test.ts`가
`<ul className=...>`에서 `shrink-0`만 보므로 이 변경은 그 검사와 충돌하지 않는다.

### 11.35 국기는 이미 리포에 있다 — 새로 만들지 않는다

⚠️ **`public/flags/`에 ISO 3166-1 alpha-2 소문자 253개가 커밋돼 있다**(2026-09-11 사용자 에셋).
캔버스의 `assets/flags/{kr,us,jp,de}.svg` 넷은 **프리뷰용 사본**이지 이 화면이 쓸 목록이 아니다.

| 무엇 | 어디 | 그대로 쓴다 |
|---|---|---|
| 코드 → 파일 id | `lib/keys/flag.ts`의 `flagFor(code)` — **잎 모듈**(import 0) | 매핑을 다시 짜지 않는다 |
| 보유 목록 | 같은 파일의 `FLAG_INVENTORY` (fs 스캔이 아니라 상수, `flag-assets.test.ts`가 실제 파일과 양방향 대조) | — |
| 렌더 조각 | `components/translations/locale-badge.tsx`의 **`LocaleFlag`** | `h-[11px] w-4 shrink-0 rounded-xs bg-cover bg-center` + 인라인 `backgroundImage` |

- ⚠️ **`rounded-xs`(2px)가 리포 radius 삼분의 밖에 있는 것은 의도다** — 높이 11px에 `rounded-sm`(8)을
  주면 국기가 타원이 된다(`locale-badge.tsx:55` 주석). **`rounded-[2px]`를 새로 쓰지 않는다.**
- ⚠️ **`<img>`도 `next/image`도 아니다** — `background-image`인 이유가 그 파일에 적혀 있다
  (요소 수 · `data:` URI 거부 — POSTMORTEM 2026-09-10). Meter가 그 판정을 뒤집지 않는다.
- ⚠️ **매핑이 없으면 국기 자리가 통째로 빈다**(`flagFor` → `null`). `es`·`pt`·`ar` 등은 일부러 뺐고
  **틀린 국기는 없는 것보다 나쁘다**가 근거다. 그래서 Meter 라벨은 **국기 폭을 예약하지 않는다** —
  `gap-1.5`로 코드가 왼쪽으로 붙는다(캔버스의 `kr`·`us`·`jp`·`de`는 전부 매핑되는 넷이라 이 갈래가
  시안에 안 나온다).
- ⚠️ **`LocaleFlag`가 `components/translations/`에 산다** — 목록이 그것을 읽어도 클라이언트 그래프가
  따라오지 않는다(그 파일에 `"use client"`가 없고 `flagFor`가 잎이다). ⚠️ `LocaleBadge`(알약) 쪽은
  **쓰지 않는다** — 배경 알약과 orphaned 갈래가 Meter 라벨에 따라온다.

### 11.4 미등재 색 둘 — DESIGN §6.2 등재가 선행이다

| 색 | 자리 | 매핑 |
|---|---|---|
| `#991b1b` | 임포트 실패 띠의 `triangle-alert` | `red-800` — **리포 전수 0건.** `--destructive`는 red-600이라 다른 값이다 |
| `#b45309` | Summary `To review`의 `eye` 아이콘 | `amber-700` — 배지의 amber-800과도 다르다 |

⚠️ **알파를 쓰지 않는다** — lucide는 다중 요소라 색 알파가 획 접점에서 누적된다
(`project-list.tsx:250` 실측). 연하게 할 일은 요소 `opacity`.

### 11.5 이탈을 잡는 장치 — 이번엔 게이트로 박는다

1. **소스 검사**(`components/__tests__/projects-screen.test.ts`에 추가): §11.2·§11.3의 **치수 리터럴을
   전수로 센다** — `w-[420px]` · `rounded-[4px]` · `gap-4` · `w-25` · `h-1` · `pl-14` · `py-3.5` ·
   `w-[332px]` · `bg-foreground/[0.02]` · `border-foreground/[0.06]`. 이 리포가 이미 쓰는 관용구다
   (`focus-ring.test.ts`·`no-korean-ui.test.ts`가 주석을 벗기고 소스를 센다).
   ⚠️ **주석을 벗기고 센다** — 주석이 자기를 설명하며 같은 리터럴을 적는 부류라
   (`projects-screen.test.ts:15` 주석), 안 벗기면 주석만으로 green이 된다.
2. **실측 대조**(`/bugshot-qa`): 1440×900 로컬에서 행 하나의 `getBoundingClientRect`를 읽어
   **이름 칸 420 · Meter 칸 100 · 바 높이 4 · 행 높이 · 띠 좌측 들여쓰기 56**을 캔버스 값과 대조한다.
   ⚠️ **소스 검사만으로는 부족하다** — 클래스가 맞아도 부모의 flex 규칙이 그것을 이긴다
   (POSTMORTEM 2026-09-11: 게이트 셋과 소스 스캔 여섯이 green인데 입력이 28px였다).
3. **시안을 나란히 연다**: `Projects.dc.html`을 브라우저로 띄워 같은 배율에서 겹쳐 본다.
   캔버스는 `AppShell` 1440×900 기준이다.
4. **좁은 화면의 대체 문장**: 컨테이너 840·680px에서 대기·설정·진행·실패 행을 각각 확인한다.
   행의 `scrollWidth <= clientWidth`, 우측 배지·화살표의 경계가 카드 안에 있는지와
   키보드 포커스 링이 잘리지 않는지를 검사한다. 치수 리터럴의 존재만으로 통과시키지 않는다.
