# project-settings-rework — design

## 0. 영향 받는 흐름

| 흐름 | 닿는가 | 무엇 |
|---|---|---|
| push (`/api/push`) | ❌ | 적재 경로를 건드리지 않는다. 소스별 상태는 **이미 있는 컬럼**을 행 단위로 읽을 뿐이다 |
| pull (`/api/pull`) | ❌ | — |
| 편집 UI | ⚠️ 간접 | 이름·썸네일이 사이드바 스위처·목록·Home·초대 카드에 뜬다 — `revalidatePath` 범위가 그만큼 넓다 |
| 온보딩 | ⚠️ | `FilesStep`의 `selection` 모드를 두 번째 소비자가 쓴다. **모드 자체는 안 바꾼다** |
| 계정 (`/account`) | ⚠️ | 카드 프리미티브를 승격하면 그 화면이 함께 움직인다 (D1) |

**적재의 강제 순서는 그대로다** — 설정 화면은 여전히 읽기와 메타데이터 쓰기만 한다. 유일한 예외가
소스별 첫 적재(`runFirstIngest`)이고, 그것은 **이미 이 화면에 있던 동작**을 대상만 좁힌 것이다.

## 1. 순수 함수로 분리 가능한 부분 — `/tdd` 진입점

I/O 없는 함수만. 이 목록이 곧 `/tdd interface`의 대상이다.

| 함수 | 파일 | 입력 → 출력 |
|---|---|---|
| `planSurfaceImportStatus` | `lib/import/surface-status.ts` (신규) | `{ lastCommitSha, lastImportStartedAt, lastImportError, lastImportFailedAt, lastCommitAt }` → `{ state: "not-imported" \| "importing" \| "failed-first" \| "failed-after" \| "imported"; canRetry: boolean; at: Date \| null }` |
| `planSurfaceReadiness` | `lib/onboarding/readiness.ts` (기존 파일에 추가) | `{ installationId, surface }` → `"setup" \| "awaiting_first_sync" \| "ready"` |
| `planProjectName` | `lib/projects/plan.ts` (신규) | `string` → `{ ok: true; name: string } \| { ok: false; reason: "empty" \| "too-long" }` |
| `projectImageObjectKey` | `lib/upload/image.ts` (기존 파일) | `(projectId, ext, nonce)` → `projects/<projectId>/<nonce>.<ext>` |
| `planProjectImageDelete` | `lib/upload/image.ts` (기존 파일) | `string \| null` → Blob key `\| null` |
| `planAddSources` | `lib/surfaces/plan-add.ts` (신규) | `{ picked: CandidateSummary[]; existing: { pathTemplate }[] }` → `{ add: […]; locked: […] }` — 이미 소스인 파일을 **체크+잠금**으로 가르는 판정 |
| `summarizeAddResults` | `lib/surfaces/plan-add.ts` (신규) | `SurfaceAdded[]` → `{ surfaces: n; keys: n; failed: n; tone: "success" \| "warning" }` — **표면 성패가 아니라 적재의 부분 실패를 합산한다**(D4가 표면을 all-or-nothing으로 고정했다) |
| `planWorkflowStale` | `lib/onboarding/workflow.ts` (기존 파일) | `surfaces: { slug, lastCommitSha }[]` → `string[]`(아직 CI가 안 닿은 소스 이름) |
| `formatSourceCounts` | `lib/surfaces/plan-add.ts` (신규) | `{ keys: number; locales: number }` → 행 보조 줄 문자열. **집계 자체는 순수가 아니다**(D5 — §3.5) |

**설계 점검**: 여기가 비면 설계를 다시 본다는 게이트를 통과한다 — 여덟 개가 순수이고, 서버 쪽에
남는 것은 전부 얇은 껍데기(Blob put/del · Prisma update · `addSurfaceFromSnapshot` 반복 호출)다.

⚠️ **`planSurfaceImportStatus`가 이 기능의 심장이다.** 지금 `page.tsx`가 그 판정을 **인라인으로**
한다 — `surfaces.map(s => s.lastImportError).find(isImportFailureCode)` + `failing({...})`. 그것을
행 단위 순수 함수로 올리는 것이 C7의 전부이고, 나머지는 그 반환값을 그리는 일이다.

## 2. 스키마 변경 — **additive 하나**

```prisma
model Project {
  // 프로젝트 썸네일의 Blob 공개 URL. ⚠️ **PII 봉투를 지나지 않는다** — User.image는 URL이
  // 사용자 식별자를 담아서 봉인하지만(스키마 주석), 프로젝트 이미지 키는 projectId다.
  image String?
}
```

**끝이다.** 나머지는 전부 기존 컬럼을 다르게 읽는다:

- 소스별 상태 — `TranslationSurface.lastImportStartedAt` · `lastImportError` ·
  `lastImportFailedAt` · `lastCommitSha` · `lastCommitAt`가 **이미 표면에 있다.** 프로젝트 수준
  컬럼이 아니다. 지금 화면이 그것을 접어 쓰고 있었을 뿐이다.
- 이름 — `Project.name`이 이미 있다(`z.string().trim().min(1).max(200)`로 생성 시 검증).

배포는 **1단계**다(additive-only). `/push` 전에 `pnpm db:migrate`(dev), `/merge` 1단계에서
`pnpm db:deploy`(prod).

⚠️ **destructive가 하나도 없는 것이 이 설계의 조건이다.** `TranslationSurface.archivedAt` drop은
launch-readiness L3.11이 미뤄 뒀고 이번에도 건드리지 않는다.

## 3. API 변경

### 3.1 썸네일 — `uploadProjectImage` / `deleteProjectImage`

`app/(edit)/projects/[slug]/settings/actions.ts`. **Server Action이다** — 내부 쓰기이고 편집 UI가
부른다(CLAUDE.md 데이터 변경 경로 표).

```ts
uploadProjectImage(form: FormData): Promise<{ ok: true } | { ok: false; reason: UploadReject | AccessError }>
deleteProjectImage(slug: string): Promise<{ ok: true } | { ok: false; reason: "unavailable" | AccessError }>
```

**`app/(edit)/account/actions.ts`의 `uploadProfileImage`를 그대로 따른다** — 같은
`planImagePick`(클라) / `planImageUpload`(서버 시그니처 판정) / `normalizeImage`(192px webp 재인코딩,
EXIF 방향 적용 후 메타데이터 소멸) / `IMAGE_MAX_BYTES` 3 MB. 다른 것 셋:

1. **인가가 `project:settings`다** — `requireUser`가 아니라 `getProjectAccess`.
2. **PII 봉투를 안 지난다** — `validatePiiWriteKey`·`encodeUserFields`가 없다. 대신 `Project.image`를
   평문 URL로 쓴다.
3. **키 접두가 `projects/<projectId>/`다.** ⚠️ **`lib/upload/store.ts`의 `listImages`가
   `prefix: "avatars/"`로 하드코딩돼 있다** — 고치지 않으면 `pnpm smoke:blob`의 고아 탐지가 프로젝트
   썸네일을 **영영 못 본다.** 그 함수를 `listImages(prefix)`로 넓히고 스모크가 둘 다 훑는다.

**순서는 계정 쪽과 같다** — 네트워크 I/O를 트랜잭션 밖에 두고, `SELECT … FOR UPDATE`로 같은 행의
읽기·쓰기를 직렬화하고, **이전 이미지는 커밋 뒤에만** 지운다(롤백되면 그 URL이 계속 쓰여야 한다).

⚠️ **`next.config.ts`의 `bodySizeLimit`이 4 MB로 이미 올라가 있다** — 3 MB 상한이 프레임워크보다
먼저 걸리지 않는 것이 우리 거부 사유가 화면에 닿는 조건이다(`lib/upload/image.ts` 주석).

### 3.2 이름 — `updateProjectName`

```ts
updateProjectName(raw: { slug: string; name: string }):
  Promise<{ ok: true; name: string } | { ok: false; error: "empty" | "too-long" | AccessError | "invalid input" }>
```

- **상한은 `PROJECT_NAME_MAX_CHARS = 200`이다** — `createProject`의 `z.string().trim().min(1).max(200)`와
  같은 값을 `lib/projects/plan.ts`에 상수로 올리고 **양쪽이 그것을 쓴다.** ⚠️ 갈리면 생성이 통과시킨
  이름을 설정이 거부한다(`isValidBranchName`을 한 벌로 둔 것과 같은 근거).
- **중복을 허용한다** — 유일성은 `slug`가 든다(`@unique`). 이름은 표시용이다.
- **트림은 서버가 한다.** 화면은 트림 전 문자열을 유지한다 — `profile-name-form.tsx`가 그 함정을
  주석 셋으로 적어 뒀다(성공해도 `value`를 안 건드린다; 덮으면 전송 중 편집이 사라진다).
- `revalidatePath("/", "layout")` — 사이드바 스위처·목록·Home이 동시에 읽는다.

### 3.3 소스 다중 추가 — `addSurfaces` (**all-or-nothing** — D4 확정)

```ts
addSurfaces(raw: { slug: string; picks: { adapter: string; pathTemplate: string; baseLocale: string }[] }):
  Promise<{ ok: true; results: SurfaceAdded[]; yaml: string }
        | { ok: false; error: OnboardError | AccessError | "invalid input";
            conflicts?: { path: string; surfaceSlugs: string[] }[] }>

type SurfaceAdded = { pathTemplate: string; surfaceSlug: string; count: number; failed: number }
```

**하나라도 실패하면 아무것도 안 생긴다.** 사용자 결정(2026-09-20)이고, 화면이 부분 성공을 그릴 일이
없어진다. 대신 **트랜잭션 경계가 넓어지므로** 아래 넷이 이 결정의 대가다.

⚠️ **1. POSTMORTEM 2026-09-14의 면적이 N배가 된다.**
*"Add surface 구현 중 Surface 생성 tx 안에서 적재가 끝나지 않았다 — 별도 연결의 Locale FK가 아직
커밋되지 않은 Surface를 기다렸다."* 원인은 **런타임 client 오용**(tx 안에서 바깥 `prisma`를 썼다)이고,
그 항목의 재발 방지 grep이 `rg -n '\$transaction.*in|in.*\$transaction' lib app --glob '*.ts'`다.
표면이 N개면 그 오용의 자리가 N배이므로, **`addSurfacesFromSnapshot`은 `tx` 하나를 끝까지 넘긴다.**

⚠️ **2. 네트워크 I/O를 전부 tx 밖으로 뺀다.**
`openRepoReader` → `snapshot(baseBranch)` → 표면마다 `templatePaths` → `readFiles` →
`planConfirmedFormat`까지가 **tx 이전**이다. tx 안에 남는 것은 검증된 blob 맵 N개의 DB 쓰기뿐이다.
안 그러면 GitHub 지연이 그대로 트랜잭션 보유 시간이 된다.

⚠️ **3. Prisma 트랜잭션 타임아웃을 명시한다.**
예산이 표면당 파일 200 · 합계 10MB이므로 N개면 그만큼 곱해진다. `$transaction`의 `timeout`을
호출부에서 올리고(현행 `addSurfaceFromSnapshot`이 쓰는 값 기준), **상한을 넘는 선택 수를 화면이 막지
않는다** — 서버가 `resource-limit`으로 거부하고 사유가 모달에 선다.

⚠️ **4. 경로 충돌은 `Project` 행 잠금 안에서 본다.**
같은 항목의 재발 방지가 *"Project 잠금을 빼는 mutation은 안내 가능한 path-conflict 대신 P2002를 내며
red다"*이다. N개를 한 tx에서 만들면 **선택 안에서 서로 충돌하는 경우**도 새로 생긴다(같은
`pathTemplate`를 두 번 고르는 것은 `planAddSources`가 앞에서 막고, 템플릿이 달라도 같은 파일로
확장되는 경우는 tx 안에서 잡힌다).

⚠️ **불변식 9는 그대로 산다.** 표면 **생성**은 all-or-nothing이지만 **적재**는 아니다 —
`SurfaceAdded.failed`는 "그 표면에서 읽지 못한 파일 수"이고 0이 아니면 결과 문구가
`ingestHeadline`과 같은 형으로 warning이다. `summarizeAddResults`는 그 축을 합산하는 함수로 남는다
(표면 성패를 세는 함수가 아니다).

⚠️ **기존 `addSurface`는 지운다** — 소비자가 `components/onboarding/add-surface.tsx` 하나이고 그
화면이 모달로 대체된다. 남기면 같은 일에 Action이 둘이 된다.

### 3.4 소스별 첫 적재 — `runFirstIngest`에 `surfaceSlug` 추가

```ts
runFirstIngest(raw: { slug: string; surfaceSlug?: string }): Promise<FirstIngestResultView>
```

- `surfaceSlug`가 없으면 **현행 그대로** `defaultSurface`(온보딩 ④·기존 호출부 호환).
- 있으면 그 표면을 `projectId`로 좁혀 찾고, `planSurfaceReadiness`가 `awaiting_first_sync`가
  아니면 **`not-awaiting`이다.**
- ⚠️ **그 규칙을 완화하지 않는다.** 현행 주석: *"`ready`에서 돌리면 strict push라 번역자 편집을
  버튼 하나로 덮는다."* 표면 단위가 됐다고 그 위험이 줄지 않는다 — 오히려 "이 소스만 다시 받자"가
  더 자연스러워 보여 **누르기 쉬워진다.** 문구가 그것을 가른다(`importRetry` / `importRerun`).

⚠️ **`planProjectReadiness`는 남긴다** — 소비자가 이 화면 말고도 있다(`page.tsx` 외 Home·목록).
새 `planSurfaceReadiness`는 그것이 부르는 조각이 되고, 프로젝트 판정은 `surfaces.some(...)` 그대로다.

### 3.5 소스 행의 키·언어 수 (D5 확정 — 그린다, 성능을 잰다)

캔버스 `1a`대로 행마다 `{keys} keys · {locales} languages`를 그린다. ⚠️ **이 항목 하나가 이 기능의
유일한 성능 위험이다** — POSTMORTEM 2026-09-18이 같은 모양의 관계 필터 count에서 **적재 직후 5.5초**를
냈다(Prisma LEFT JOIN × 낡은 통계).

**그래서 셋을 강제한다:**

1. **새 관계 필터 count를 만들지 않는다.** `lib/keys/query.ts`가 이미 목록·Home용으로 같은 축을
   세고 있다(그 항목의 grep이 `413·415·452·518·524·535`를 후보로 적어 뒀다). **표면별로 한 번에
   집계하는 쿼리 하나**로 받고, 행마다 따로 부르지 않는다.
2. **`EXPLAIN`을 `ANALYZE` 전과 후로 둘 다 잰다.** *"대량 적재 직후가 실제로 요청이 오는 순간이다"* —
   같은 항목의 재발 방지 문장 그대로다. 측정은 `pnpm test:projects:postgres`가 도는 격리 PG에서.
3. **느리면 그 줄을 내리는 것이 1차 대응이다.** 비정규화 컬럼(`TranslationSurface.keyCount` 등)은
   적재 경로가 그것을 써야 하므로 **이 기능의 범위 밖이고**, 필요해지면 별도 판정이다.

⚠️ **`orphaned`를 뺀 수다** — `StringKey.orphaned`·`Locale.orphaned`는 export에서 빠지므로 "이 소스가
지금 담고 있는 것"이 아니다. 목록·Home의 기존 집계와 **같은 술어**를 써야 한다(갈리면 같은
프로젝트가 화면마다 다른 수를 말한다).

## 4. 새 환경변수

**없다.** `BLOB_READ_WRITE_TOKEN`이 세 환경에 이미 있고(2026-09-20 스토어 둘 생성), `.env.example`도
그것을 이미 든다.

## 5. 불변식 영향 (ARCHITECTURE §0 · §1 · §2 · §6)

| 불변식 | 영향 | 보존 방법 |
|---|---|---|
| export 결정성 | **없다** — export 경로를 건드리지 않는다 | — |
| blob SHA 비교 | **없다** | — |
| 불변식 8 (`lastCommitSha`가 첫 적재 성공의 유일한 증거) | **읽는 자리가 늘어난다** | `planSurfaceImportStatus`가 그 컬럼을 판정의 축으로 쓴다. 설정이 저장됐다는 것을 `imported`로 읽지 않는다 |
| 불변식 9 (부분 실패를 성공으로 접지 않는다) | **새 소비자 둘** — 다중 추가, 소스별 적재 | `summarizeAddResults`의 tone이 `failed`로 갈린다. `errors.length`(상위 5건)로 고르지 않는다 — POSTMORTEM 2026-09-08 |
| 인증 경계 | **새 Action 넷** | 전부 최상단 `getProjectAccess({ permission: "project:settings" })`. 페이지는 `requireProjectAccess`. ⚠️ **`entry-points.test.ts`가 가드를 이름이 아니라 호출로 세는지** 확인한다(POSTMORTEM 2026-09-18) |
| 테넌트 격리 | **새 쿼리 넷** | 전부 인가가 돌려준 `projectId`로 좁힌다. 클라이언트가 보낸 `slug`는 판정 입력일 뿐이다 |
| 보관 중 쓰기 | **새 Action 넷이 그 갈래를 지난다** | `project:settings`는 보관 중에도 통과한다(PRODUCT §7.9). `addSurfaces`·`runFirstIngest`는 현행대로 `archived`로 거부하고, **이름·썸네일은 허용한다** — 되돌릴 수 있는 표시값이고 막을 이유가 없다. ⚠️ **화면은 그 컨트롤을 끄고 사유를 붙인다**(`archive.lockedHint`) — 서버가 허용하는데 화면이 끄는 것은 이탈이 아니라 시안의 결정이다(핸드오프 §13) |
| PII 봉투 | **닿지 않는다** | `Project.image`는 봉투 밖이다. ⚠️ 이 판단이 틀리면 `decodeUser`가 아니라 **아무것도 안 죽고 URL이 그냥 평문으로 남는다** — 그래서 스펙에 근거를 적었다(spec 선행 사실 3) |

## 6. POSTMORTEM에서 소환한 함정

착수 전 `docs/POSTMORTEM.md`를 이 기능이 건드릴 영역으로 grep한 결과. **여섯이 직격이다.**

1. **2026-09-07 — `revalidatePath`가 방금 받은 결과를 언마운트한다.**
   `FirstIngestRetry`가 조건부 분기 **안**에 있으면 성공 직후 사라져 "N couldn't be read"가 아무에게도
   안 닿았다. ⚠️ **이번 설계가 그 구조를 소스 행마다 N개 만든다** — 행 자체가 서버 데이터로 그려지고
   성공하면 그 행의 상태가 바뀐다. **결과 문구를 행 안에 두지 않는다**: 재시도 결과는
   `Translation sources` **카드 수준**의 inset Alert로 올리고, 행은 서버 상태만 그린다.
2. **2026-09-06 — 거부 사유가 스크롤 밖으로 밀리면 버튼이 안 눌린 것으로 보인다.**
   페이지 수준 `?e=`는 **`PanelHeader` 안**에 남긴다(고정, 스크롤 안 함). 카드 안 실패만 본문이다.
3. **2026-09-03 — 조회 실패를 부재로 접으면 정보가 조용히 사라진다.**
   `openPrUrl` 삼상태를 그대로 든다(`string` / `null` / `undefined`). 새 자리 하나가 같은 부류다 —
   **썸네일 URL이 `null`인 것과 이미지 로드가 실패한 것**은 다르고, 후자는 `ProjectThumbnail`이
   폴백으로 접는다(현행 동작 유지, 늘리지 않는다).
4. **2026-09-13 — `malmoi` / `Malmoi`가 한 화면에 같이 섰다.** 같은 사전의 다른 절이라 리뷰로 안
   걸렸다. 신규 문구가 20개 넘게 들어오므로 `brand-spelling.test.ts`·`no-korean-ui.test.ts`가 계속
   전수로 돈다.
5. **2026-09-18 — 관계 필터 count가 대량 적재 직후 5.5초였다.** 캔버스 `1a`의 소스 행이 "키·언어"
   수를 보인다. ⚠️ **새 관계 필터 count를 만들지 않는다** — `lib/keys/query.ts`의 기존 집계를
   재사용하거나, 재사용할 수 없으면 **그 숫자를 안 그린다.** 그 항목의 grep이 이미
   `lib/keys/query.ts:413·415·452·518·524·535`를 "적재 직후 첫 화면이 느릴 수 있는 후보"로 적어 뒀다.
6. **2026-09-17 — 같은 pending이 화면마다 다르게 보였다 / 2026-09-19 — 꺼진 Radix Select가 마우스로
   열렸다.** 모달 안에 `Checkbox`(Radix)가 다수 서고 확정 중에 잠긴다. ⚠️ **`fieldset disabled`만으로
   Radix Portal 컨트롤이 안 잠긴다**(POSTMORTEM 2026-09-14) — `FilesStep`이 `selection` 모드에서
   그것을 어떻게 다루는지 확인하고, `add-surface.tsx`의 현행 `<fieldset disabled={pending}>`를
   그대로 복제하지 않는다.

추가로 **2026-09-15 🔁 (형제 프리미티브 둘을 옮기며 한쪽 소비자만 셌다)** — D1의 카드 승격이 정확히
그 부류다. 옮기기 전에 소비자를 **명령으로 다시 센다.**

## 7. 컴포넌트 · 프리미티브 변경

| 대상 | 무엇 | 소비자 |
|---|---|---|
| `components/ui/panel-card.tsx` (신규) | `AccountCard`·`AccountRows`·`AccountRow`·`AccountFacts`를 `components/account/account-section.tsx`에서 승격 + 개명(`PanelCard`·`PanelRows`·`PanelRow`·`PanelFacts`) | `/account` 4·3·3·1 + 이 화면. **DESIGN §6.67이 "중복이 셋이 되면 그때 뽑는다"고 적었고 이 화면이 셋째다** |
| `components/ui/card.tsx` | **삭제.** 남는 소비자가 `locales/page.tsx` 하나이고 그것도 `PanelCard`로 옮긴다 | 2 → 0 |
| `components/ui/alert.tsx` | `inset` boolean prop 추가 — 테두리·radius 없이 전폭 · padding 13/16 · 위 디바이더. 배경만 danger `destructive/4%` / warning `amber-50` | 새 소비자 둘(이 화면 · `/account`). **variant를 늘리지 않는다** — `danger`×`inset` 조합이 필요하므로 축이 따로여야 한다 |
| `components/ui/form-group.tsx` | `error`에 아이콘 14 추가 | 기존 소비자 전부(먼저 센다) |
| `components/onboarding/steps/files.tsx` | **안 바꾼다.** `selection` 모드가 이미 있다 | 1 → 2 |
| `components/onboarding/modal.tsx` | **안 바꾼다.** 1024는 `panelClassName`으로 준다 | — |
| `components/projects/project-thumbnail.tsx` | **안 바꾼다.** `src`를 이미 받고 테두리·`object-contain`·`rounded-sm`이 2026-09-17/09-20에 확정됐다 | — |
| `components/github-account.tsx` | 설정 화면의 import만 끊는다. **파일은 남는다** (`/account`가 쓴다) | 2 → 1 |
| `components/settings/repository-form.tsx` | 실패를 `FormGroup error`로 | — |
| `components/onboarding/add-surface.tsx` | **삭제** + `app/(edit)/projects/[slug]/surfaces/new/page.tsx` 처리는 D3 | — |

## 8. 라우트 · IA 영향

- `/projects/:slug/surfaces/new` — D3의 결정에 따른다. PRODUCT §7.7 IA 표의 그 행이 움직인다.
- `?add=sources` 쿼리 슬롯 — D3에서 결정.
- `?e=` — **남는다.** `startGithubConnect`의 `dest.kind === "settings"`가 이 화면으로 돌아오고,
  재연결 컨트롤이 여전히 이 화면에 있다(Repository 카드). ⚠️ `dest.kind === "add-surface"`가 D3에
  걸린다.
- `middleware.ts` matcher — **새 라우트가 없으면 안 건드린다.**

## 9. 접근성 (핸드오프 프롬프트 §7)

- 카드 넷 전부 `<section aria-labelledby>`. ⚠️ 없으면 Chrome이 `generic`으로 접어 **접근성 트리에서
  카드가 통째로 사라진다**(POSTMORTEM 2026-09-15 #2). 검사는 **개수를 센다** — "region이 있다"만
  세면 하나가 이름을 잃어도 지나간다(POSTMORTEM 2026-09-14 #1).
- 체크박스 목록의 `aria-label`은 `m.newProject.files.include(pathTemplate)` — `FilesStep`이 이미 준다.
- 모달 포커스 트랩 + 복귀 대상: YAML 모달은 `CI integration` 카드의 트리거 행, Add sources 모달은
  그 카드의 [Add sources] 버튼. ⚠️ **트리거를 `disabled`로 만들지 않는다** — Radix Dialog가 복귀
  대상을 잃는다(POSTMORTEM 2026-09-17). 2026-09-20 malmoi#64가 같은 축이고 *"그것을 재는 테스트가
  아무것도 안 재고 있었다"*이므로, 복귀 단언은 `members-focus.test.tsx`의 관용구를 따른다.
- 확인 Dialog의 초기 포커스는 **[Cancel]**.
- pending은 `aria-busy` + 스피너 14, **라벨을 바꾸지 않는다**(폭이 흔들린다).
- 진행 줄 `role="status"` · 실패 줄은 `Alert danger`가 이미 `role="alert"`. ⚠️ **live 영역의 보장은
  "내용이 바뀌면 알린다"까지다**(`alert.tsx` 주석) — 통째로 들어왔다 사라지는 자리는 첫 내용이 안
  읽힐 수 있고, 그것을 고치려 빈 래퍼를 세우면 `danger`가 assertive를 잃는다. **약속하지 않는다.**

## 10. 반응형

분기는 **카드 폭 container query 640**이다. 셸 최소가 1280이고 새 뷰포트 브레이크포인트를 만들지
않는다. 640 미만: 라벨이 값 위(간격 6) · 필드 `flex:1` · 사실 행 `align-items:flex-start` + 버튼이
본문의 마지막 줄 · 카드 머리 설명이 제목 아래 · [Copy]류가 36 정방 아이콘.

⚠️ **`@container`를 쓰려면 카드가 `container-type: inline-size`를 선언해야 한다** — `PanelCard`에
얹는다. POSTMORTEM 2026-09-15의 *"그 `@[672px]` 쿼리는 고쳐졌는데 패널 때문에 임계값을 한 번도 못
넘었다"*가 같은 부류이므로, **실제로 640을 넘나드는지 브라우저로 잰다.**

## 11. 결정 — **전부 확정** (2026-09-20 사용자)

| id | 무엇 | 결정 | 근거 / 대가 |
|---|---|---|---|
| **D1** | 카드 그릇 | **프리미티브 승격** | `Card` 소비자가 둘뿐이고 DESIGN §6.67이 "중복이 셋이 되면 뽑는다"를 미리 적었다 — 이 화면이 셋째다 |
| **D2** | `/account`·`/locales`가 함께 움직인다 | **같은 PR, 커밋 분리** | 프리미티브 이동과 화면 개편이 한 커밋이면 회귀 출처를 못 가른다. ⚠️ 두 화면을 **브라우저로 다시 밟는다**(POSTMORTEM 2026-09-15 🔁) |
| **D3** | `/surfaces/new` | **남기고 `/settings?add=sources`로 redirect + 그 쿼리가 모달을 연다** | GitHub 연결 왕복이 `dest.kind === "add-surface"`로 그 주소에 착지한다. 핸드오프 §9와 어긋나지만 `/projects/new` 모달이 이미 같은 이유로 딥링크다 |
| **D4** | 다중 추가의 부분 실패 | **전부 롤백 (all-or-nothing)** | ⚠️ **추천과 갈린 결정이다.** 화면이 단순해지는 대신 트랜잭션 경계가 N배가 된다 — 대가 넷을 §3.3이 든다 |
| **D5** | 소스 행의 키·언어 수 | **그린다 + 성능을 잰다** | ⚠️ **추천과 갈린 결정이다.** POSTMORTEM 2026-09-18의 부류라 §3.5가 강제 셋을 든다 |
| **D6** | 썸네일 재인코딩 규격 | **계정과 동일 — 192px 이내 WebP** | `normalizeImage`를 그대로 쓴다. 최대 소비가 56이라 충분하고, 가르면 `sharp` 경로가 두 벌이 된다 |
| **D7** | 보관 중 이름·썸네일 편집 | **서버는 허용, 화면만 끈다** | 되돌릴 수 있는 표시값이고, 서버에서 막으면 `archived` 거부 갈래가 넷 더 생긴다. ⚠️ **그 비대칭의 근거를 Action 주석에 남긴다** — 안 남기면 다음 사람이 "빠진 가드"로 읽고 더한다 |
| **D8** | 워크플로 최신 여부 | **근사 — `lastCommitSha === null`인 소스 이름** | 리포 파일을 읽으면 GitHub 왕복 하나 + 우리 `sources:` 스키마를 아는 파서가 하나 더 생긴다 |
| **D9** | "Saved"가 사라지는 시간 | **타이머 없음 — 다음 입력까지** | `profile-name-form.tsx`가 이미 그 형이다. 타이머를 만들면 같은 일에 형이 둘이 된다 |
| **A1** | `archive.archivedBy`의 `{name}` | **문구를 줄인다 — `Archived on {date}`** | `Project`에 `archivedBy` 컬럼이 없다. 지금 OWNER가 사실상 혼자라 "누가"가 답하는 질문이 없고, 필요해지면 `SyncRun`처럼 이력으로 다시 판정한다 |
| ~~D10~~ | ~~워크플로 파일명~~ | **결정 불필요** | 리포 전체가 이미 `malmoi-i18n.yml`이고 `l10n.yml`은 0건이다 |
| ~~D11~~ | ~~흰 로고 테두리~~ | **결정 불필요** | 2026-09-20에 `ProjectThumbnail`이 이미지·폴백 두 갈래에 똑같이 테두리를 붙였다 |
