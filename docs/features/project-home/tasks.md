# Project Home 재편 — tasks

**결정은 2026-09-15에 전부 닫혔다** (`spec.md` §9의 여덟 + §9.5의 시안 기본값 넷).
차단 지점은 하나만 남았다 — **T1의 선과제**.

커밋 경계는 `───` 로 표시한다. `/ship`이 이 분리를 지킨다.

## 닫힌 결정 요약

| # | 결정 |
|---|---|
| 9.6 | [Sync] 재적재 경로를 **만든다 — 별도 `/feature`의 선과제** |
| 9.7 | 카드 목적지 = `state=new\|untranslated\|review\|unsent` + 기존 공가 라우트(기본 표면) |
| 9.1 | 항목 정렬 = **시간순(최신)** + 3행 + `+2 more`(상한 5). 동점은 `surfaceSlug` → 로케일 코드 |
| 9.10 | `TranslationSurface.lastImportFailedAt DateTime?` **추가** |
| 9.12 | `Locale.createdAt DateTime @default(now())` **추가 + backfill SQL 손으로** |
| 9.4 | 보관 실행자 **안 적는다** — `Archived` 행은 시각만 |
| 9.9 | `+2 more`는 **`<details>`/`<summary>`** — 클라이언트 상태 0 |
| 9.11 | `last edited by` 폴백 = **절을 통째로 뺀다** |

**캔버스와의 의도된 이탈 셋** — `/design-sync`가 결함으로 잡지 않도록 `docs/DESIGN.md`에 남긴다:
① 항목 행 순서(종류 순 → 시간순) ② 메타 `Archived`의 `· by …` 제거 ③ 로그의
`added the {surface} surface` 줄 제거(출처 없음).

---

## T1. 선과제 — [Sync] 재적재 경로 `/feature` (⚠️ **차단 지점**)

별도 `/feature`를 돌려 스펙을 쓴다. **이 문서의 범위 밖이다.**

- 그 스펙이 **불변식 2를 정면으로 다룬다** — push가 리포 값으로 번역을 덮고 저자를 비우므로,
  편집 손실 창을 번역 편집자가 버튼으로 열 수 있게 된다. **확인 Dialog와 그 문구는 그쪽 몫.**
- **T2~T7은 이것과 병렬로 갈 수 있다** — Home은 `[Sync]` 버튼을 §8 표대로 **그리기만** 하고
  `onClick` 배선만 선과제를 기다린다.
- **검증**: `docs/features/<선과제>/`가 서고, Home의 `[Sync]`가 부를 Action 시그니처가 정해졌다.

---

## T0. 문서 정정 (코드 없음)

`docs/PRODUCT.md` §7.7 결정 2 정정 — *"다른 화면의 지표를 복제하지 않는다"*가 표면이 여럿이 되면서
성립하지 않는다. **합계는 표면별 값의 합으로만 만든다**는 제약을 함께 적는다.

- **검증**: 정정 문장이 있고 `page.tsx`의 같은 주장 주석이 T6에서 함께 바뀐다.
- ⚠️ **코드보다 앞서가지 않는다** — T6과 **같은 PR**에 들어간다.

`─── docs(PRODUCT): correct the "no duplicated metrics" rule for multi-surface projects ───`

---

## T2. 마이그레이션 — `/db` (⚠️ **backfill SQL을 손으로 쓴다**)

`design.md` §6. **먼저 하는 이유**: T3의 순수 함수가 `lastImportFailedAt`·`Locale.createdAt`을
입력 타입으로 든다.

1. `pnpm db:migrate --create-only`로 두 컬럼을 만든다.
2. **생성된 SQL을 열어 `Locale` backfill 한 줄을 넣는다**:
   ```sql
   UPDATE "Locale" l SET "createdAt" = p."createdAt"
     FROM "Project" p WHERE p."id" = l."projectId";
   ```
   ⚠️ **안 넣으면 기존 로케일 전부가 "마이그레이션 시각"을 들고 배포 직후 미채움 항목이 목록
   맨 위를 점령한다.** 그 거짓은 되돌릴 수 없다 — 진짜 시각이 어디에도 없다.
3. dev에 적용.

- **검증**: `pnpm db:status`(dev) green · `pnpm test:projects:postgres` green ·
  **`/db` 5단계 — `anon` 권한이 0인지 확인**.

`─── feat(db): record when an import failed and when a locale first appeared ───`

---

## T3. 순수 함수 테스트 먼저 — `/tdd interface` (red)

`design.md` §4의 여섯.

1. `lib/home/__tests__/state.test.ts` — `planHomeState`의 우선순위 여섯.
   보관 ∧ 미연결 → 보관이 이긴다. 미연결 ∧ import 실패 → 미연결이 이긴다.
2. `lib/home/__tests__/cards.test.ts` — 상태별 보조 줄 · 0 갈래 ·
   **세 셀 구간(`To translate`·`To review`·`To send`)의 겹침 0**.
   ⚠️ `New from GitHub`은 단위가 keys라 이 단언에서 **뺀다** (`spec.md` §7.1).
3. `lib/home/__tests__/attention.test.ts` — **시간순 정렬** · 3행 + `+2 more`(상한 5) ·
   동점 기울이기(`surfaceSlug` → 로케일 코드 **유닛 비교**, `localeCompare` 아님) ·
   **`2b`에서 파서 항목이 빠지고 카운트가 준다** ·
   **`lastImportFailedAt`이 `null`인 옛 행은 가장 오래된 것으로 취급** ·
   **`actors` 맵에 없으면 `— last edited by …` 절이 통째로 빠진다**.
4. `lib/home/__tests__/meta.test.ts` — `2c`에서 리포 링크 소실 · `2d`에서 `Archived` 행 추가
   (**시각만, 사람 없이**).
5. `lib/home/__tests__/overview.test.ts` (개정) — `recentActivity`가 **기간(7일) + 상한(20)**.
   ⚠️ **결정적 정렬을 다시 단언한다** — 같은 시각·같은 갈래에서 순서가 고정이다.

- **검증**: `pnpm test` → 다섯 다 **red**.

`─── test: pin the pure home judgements before implementing them ───`

---

## T4. 순수 함수 구현 (green)

`lib/home/{state,cards,attention,meta}.ts` 신규 + `lib/home/overview.ts` 개정 +
`lib/projects/list.ts`에 `reviewByLocale` 추가.

- ⚠️ **`summaryQueue`를 고치지 않는다.** 호출부가 `archived: false`를 고정으로 넘기고
  그 이유를 주석으로 남긴다 (`design.md` §2.1) — 안 그러면 `2d`에서 카드 넷이 전부 0이 된다.
- ⚠️ **미발송 술어의 넷째 벌을 만들지 않는다** — 기존 셋 중 하나를 부른다.
- ⚠️ **폴백 판정을 `actorLabel`의 `null`에 걸지 않는다** — 그 함수는 못 찾으면 `updatedBy`
  원문(cuid일 수 있다)을 준다. `actors` 맵에 키가 있는지를 직접 본다.
- ⚠️ **`server-only`를 붙이지 않는다** (테스트가 직접 import하는 순수 모듈).
- **주석은 한국어로 "왜"만.** 시안 값을 옮겨 적지 말고 **그 값이 아니면 무엇이 깨지는지**를 적는다.

- **검증**: `pnpm test` green · `pnpm typecheck` green.

`─── feat(home): add the pure judgements behind the reworked project home ───`

---

## T5. 조회 — 로케일별 최근 편집자

`design.md` §3.3.1. **렌더되는 항목(최대 5)에 대해서만** 그 로케일의 `max(updatedAt)`과
그 행의 `updatedBy`를 뽑는다.

- ⚠️ **`page.tsx`의 기존 관용구를 따른다** — *"렌더되는 행만 지난다 — 903키 리포에서 전 행의
  편집자를 조회하지 않는다."*
- ⚠️ **`projectId`로 좁힌다** (테넌트 격리). 인덱스 `[projectId, surfaceId, updatedAt]`을 탄다.

- **검증**: `pnpm test` green (조회는 얇은 껍데기라 판정 테스트는 T3이 이미 든다).

`─── feat(home): read the last editor per locale for attention items ───`

---

## T6. 화면 — 페이지 재작성

`app/(edit)/projects/[slug]/page.tsx` 전면 재작성 + `components/home/` 신규
(카운트 카드 · 항목 카드 · 로그 카드 · 메타 열).

- **블록 셋 + 메타 열.** `Languages` 블록과 `[Open translations]` primary가 사라진다.
- **`[Sync]`는 그리되 `onClick`은 T1의 산출물을 기다린다.**
- **`2d`가 전면 교체에서 배너로 바뀐다** → `ProjectArchived`의 소비자가 하나 준다.
  ⚠️ **그 컴포넌트를 지우지 않는다** — 번역 화면이 계속 쓴다.
- **`+2 more`는 `<details>`/`<summary>`** — `"use client"`를 만들지 않는다.
  기본 marker 제거(`::-webkit-details-marker`) + chevron 회전은 CSS로.
- **`page.tsx`의 "다른 화면의 지표를 복제하지 않는다" 주석을 T0과 같은 문장으로 정정한다.**
- ⚠️ **조건부 렌더로 차단하지 않는다.** 최상단 `requireProjectAccess`를 유지하고,
  `[Reconnect]`·`[Project settings]`를 감추는 것은 편의일 뿐임을 주석에 남긴다.
- ⚠️ **`Promise.all`로 병합한다** — 조회가 늘어나므로 순차 왕복을 만들지 않는다
  (POSTMORTEM 2026-09-05 · 병목은 행 수가 아니라 함수 리전이었다).

- **검증**: `pnpm build` green (RSC 경계는 `tsc`가 못 본다) + 로컬에서 `2a`가 실제로 그려진다.

`─── feat(home): rebuild project home as four counts, attention and logs ───`

---

## T7. 카드 목적지 — `state=` 파라미터

`lib/routes.ts`의 `TranslationsQuery`에 `state?: "new" | "untranslated" | "review" | "unsent"`를
늘리고, 번역 화면이 그것으로 좁힌다.

- ⚠️ **그 타입의 주석이 *"`state`가 없다 (8-4 — spec Q3)"*를 의도로 적어 뒀다.**
  **뒤집는 근거를 그 주석 자리에 남긴다** — 지우기만 하면 다음 사람이 같은 결정을 다시 한다.
- 카드는 `routes.translations(slug, { state })`를 가리킨다 (기본 표면으로 redirect, 쿼리 보존).
- ⚠️ **남이 정한 키다** — `searchParams`에서 읽으므로 `state` 값 검증은 배열 `includes`로 한다
  (`isImportFailureCode`와 같은 관용구, POSTMORTEM 2026-09-08·09).

- **검증**: `pnpm test` green + 카드를 눌러 좁혀진 화면에 착지한다.

`─── feat(translations): narrow the table by pipeline state ───`

---

## T8. 문구

`messages/en.tsx` — `spec.md` §10.

- ⚠️ **카드 넷의 제목은 새로 만들지 않는다** — `m.projects.summary.*` 넷이 이미 있고 목록 화면과
  **같은 키를 쓴다**. 두 벌이 되면 하나가 낡는다.
- ⚠️ **`m.home.progress.*`·`m.home.activity.title`이 사라진다** — 남기면 죽은 키가 된다.
- ⚠️ **로그에서 `added the {surface} surface` 줄을 뺀다** — 출처가 없다.
- ⚠️ 한글 UI 리터럴 금지 (`no-korean-ui.test.ts`) · 제품 이름은 소문자 `malmoi`
  (`brand-spelling.test.ts`). 캔버스 배너가 이미 `malmoi could not read …`로 소문자다.

- **검증**: `pnpm test` green (두 스캐너 포함).

`─── feat(i18n): add the copy the reworked home needs ───`

---

## T9. 방어선 — 소스 스캐너 셋

`spec.md` §3.3의 완료 조건 7·8·9.

1. Home 그래프에 `pull`/`push` **화면 낱말** 0 (대상을 `messages/en.tsx`의 Home 구역으로 좁힌다 —
   코드 식별자는 대상이 아니다).
2. Home 그래프에 `text-mono` 0.
3. Home 그래프의 파랑 리터럴이 **정확히 다섯 자리**.

- ⚠️ **값이 아니라 구조를 센다.** 클래스 문자열을 박으면 스타일을 바꾸는 순간 green인 채 결함만 돌아온다.
- ⚠️ **셋 다 일부러 깨뜨려 red를 확인한다.** 매칭이 0인 스캐너는 장식이다.

`─── test: pin the home vocabulary, mono and blue rules in source ───`

---

## T10. 무효화 범위 재점검 (POSTMORTEM 2026-09-09 🔁 2026-09-11)

Home이 `summaryQueue`·`projectStatus`·`planConnectionHealth`·`failing`의 **새 소비자**가 된다.

```
grep -rn "revalidatePath(" app lib | grep -v __tests__
```

각 자리에 **"이 경로가 Home도 덮나"**를 묻는다. 특히 `runFirstIngest`·`connectRepository`·
`disconnectGithub`·`archiveProject`·`restoreProject`.

- ⚠️ **"이 Action이 쓰는 컬럼을 읽는 화면"이 아니라 "그 컬럼에서 파생되는 판정 함수를 부르는
  화면"을 센다** — 2026-09-11의 재발이 정확히 그 축에서 났다.
- ⚠️ **`revalidatePath`의 인자는 단언 대상이다** — 부족한 자리는 그 Action의 테스트가 인자를 보게 한다.

`─── fix(cache): widen invalidation for the screens home now reads ───`

---

## T11. 게이트 → `/push`

- `pnpm typecheck` · `pnpm test` · `pnpm build` **셋 다 green**.
- `pnpm test:projects:postgres` **손으로 돌린다** (T2가 스키마를 건드렸으므로 필수).
- **`/db`가 `/push`보다 먼저**다 (T2에서 이미 했다면 확인만).
- `/push` → dev · preview 배포. **프로덕션은 `/merge`가 따로 받는다.**

---

## T12. `/design-sync project-home` — 시안 대조 (⚠️ 생략 금지)

**T11까지는 "동작하나"이고 여기가 "시안과 같은가"다.** 2026-09-13에 새 프로젝트 모달이
핸드오프와 **29곳** 어긋난 채 `pnpm test` 3,000개가 green이었다.

- 실측은 눈이 아니라 **computed style + CDP 접근성 트리**다.
- **의도된 이탈 셋**(문서 머리)을 먼저 입력하고 시작한다 — 안 그러면 그것이 결함으로 올라온다.
- **`<details>`의 브라우저 기본 스타일이 남았는지 실측한다** — marker·chevron 회전.
- **스크롤·hover 상태를 실제로 만들어서 잰다** — 배너가 선 상태의 로그 줄 수(`design.md` §3.4)는
  **패널이 `overflow:hidden`이라 실측으로만 확인된다.**
- **밟지 못한 갈래는 "검증했다"고 적지 않는다** (`design.md` §12의 표).

---

## T13. 정본 반영 + 디렉터리 정리

1. `docs/DESIGN.md` — 카운트 카드의 측정값과 근거 + **의도된 이탈 셋**.
   **새 raw 색을 늘렸으면 §6.2에 등재.**
2. `docs/ARCHITECTURE.md` — 스키마 절에 컬럼 둘. ⚠️ **`Locale.createdAt`의 backfill이
   "프로젝트 생성 시각으로 되돌린 값"이라는 사실을 적는다** — 그것을 진짜 시각으로 믿는 코드가
   나중에 생기면 안 된다.
3. `docs/DIRECTORY.md` — `lib/home/`·`components/home/`이 늘었다.
4. `docs/PRODUCT.md` — T0에서 이미 했다면 확인만.
5. **`docs/features/project-home/`을 지운다** — 결론이 정본으로 올라갔으면 근거 기록을 쌓아 두지
   않는다 (CLAUDE.md). 되살릴 일이 생기면 `git log`가 답한다.

`─── docs(DESIGN): …` / `─── docs(ARCHITECTURE): …` / `─── docs(DIRECTORY): …` (문서별 별도 커밋)

---

## 안 하는 것 (`spec.md` §4 재확인)

표면 목록 블록 부활 · 요약 줄 복원 · 항목의 미루기/지우기 · Home의 필터 · `pull`/`push` 낱말 복원 ·
`Stat` 프리미티브 · `/logs` 개편 · 파랑 규칙의 화면 밖 확장 · `Project.archivedBy` ·
`lastImportDropped` · `SyncRun.changedCells` · 표면 추가 사건 · primary 비활성(이미 `25d3a9e`).
