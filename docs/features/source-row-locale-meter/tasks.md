# source-row-locale-meter — tasks

순서: 시안 수령 → 순수 함수 → 조회 → 화면 → 대조 → 정본. 커밋 경계는 `── 커밋 ──`.

- [x] **T0 — 시안 수령** (2026-10-17 — [`Source Row Locale Meter.dc.html`](https://claude.ai/design/p/b99d54cd-3034-44f1-8446-0a864da9d767?file=Source+Row+Locale+Meter.dc.html), 프레임 1–11 전부. 상한 5·`LocaleMeter` 모양은 그대로, `+N`은 평문 — design §4.1) — `design-brief.md`로 Claude Design 시안을 받는다(프레임 표 전부). 시안이 `LocaleMeter` 모양·상한·`+N` 형태를 바꾸자고 하면 spec "결정" 표·design §4를 먼저 고친다.
  검증: 핸드오프 파일이 있고 brief의 프레임 번호가 전부 아트보드로 대응한다.

- [ ] **T1 — `localeProgress` 퍼센트·입력 모양** (`lib/keys/view.ts`) — 분자를 `translated + needsReview`로, `cells`에 `count` 필수. 기존 테스트(`lib/keys/__tests__/view.test.ts` · `lib/sources/__tests__/state.test.ts`)의 기대값을 새 정의로 갱신하고, 검토 포함(84+8 → 92)·내림(902/903 → 99)·clamp·`count` 합산 케이스를 더한다.
  검증: `pnpm test` green.

- [ ] **T2 — `lib/sources/meters.ts`** — `LocaleMeterValue`·`meterValue`·`sourceRowMeters`. 테스트 먼저(`lib/sources/__tests__/meters.test.ts`): 폭 clamp 셋 · orphaned 제외 · 순서 보존(base → 코드순) · 경계 0·1·5·6·59 · `hidden` · 키 0이면 빈 결과. `server-only`를 붙이지 않는다(모달이 클라이언트에서 부른다).
  검증: `pnpm test` green · `client-graph.test.ts` green.

── 커밋: `feat(sources): count-based locale progress with filled percent` (T1·T2) ──

- [ ] **T3 — `loadLocaleCounts` → `groupBy`** (`lib/keys/query.ts`) — 같은 `where`, `by: ["localeCode", "needsReview"]`, `count`로 옮긴다. `loadProjectListAggregates` 머리 주석의 "셀을 행으로 전부 가져온다" 근거를 고친다. `lib/sources/__tests__/query.test.ts`의 mock을 `groupBy`로 바꾼다.
  검증: `pnpm test` green.

- [ ] **T4 — `loadSources`에 `meters`** (`lib/sources/query.ts`) — `locale.findMany`에 `isBase`, `translation.groupBy`의 `by`에 `localeCode`, `where`를 `loadLocaleCounts`와 맞춘다(`locale.orphaned` 조건 제거). 기존 `progress`는 살아 있는 로케일의 그룹만 더해 지금 값을 유지한다. 단위 테스트: 쿼리 넷·`Promise.all` 한 묶음(mock 호출 수) · `meters` 모양 · `progress` 불변.
  검증: `pnpm test` green.

- [ ] **T5 — 행↔모달 대조 (격리 PostgreSQL)** — `lib/keys/__tests__/sources-progress.integration.ts`에 같은 DB 상태에서 `loadSources(...).sources[i].meters.shown`과 `loadSource(...).languages`의 비-orphaned 앞 5개가 `meterValue`로 같은지, orphaned·검토 대기·키 0 소스를 섞어 대조하는 케이스를 더한다. 기존 기대값 `percent: 84`(210+12/248)는 `89`로 바뀐다.
  검증: `pnpm test:projects:postgres` green(`pnpm gate`가 `lib/keys/` 트리거로 붙인다).

── 커밋: `feat(sources): load per-locale meters for source rows` (T3·T4·T5) ──

- [ ] **T6 — 사전 키** — `sources.moreLanguages(n)`(`+${n}`) · `sources.moreLanguagesLabel(n)`(`${n} more languages`, n = 1이면 `1 more language`)를 en·ko·es 세 사전에 같은 커밋으로(`/translate` 모드 ①). `lib/i18n/__tests__/helpers/function-args.ts`에 인자를 등재한다. 문구는 시안 값이다.
  검증: `pnpm test` green(`dictionary-consistency` · `no-korean-ui` · `banned-terms`).

- [ ] **T7 — 화면** — ① `LocaleMeter` 입력을 `LocaleMeterValue`로, 루트 `<div>` → `<span>`, 머리 주석 정정 ② `sources-screen.tsx` 이름 칸 셋째 줄에 막대 묶음(`mt-2` · `gap-x-3 gap-y-1.5`) + 평문 `+N`(`aria-hidden` 글자 + `sr-only` 접근 이름 — design §4.1, `shown`이 비면 줄 자체가 없다) ③ `languages-card.tsx` 막대 폭을 `meterValue`로, 오른쪽 수치 분자를 `translated + needsReview`로, 진행률 칸 `w-[300px]` → `w-[200px]`, `translatedOfTotal` 주석 정정 ④ `sources/loading.tsx` 골격에 막대 자리 둘 — **라벨 `h-4`(실물 20보다 얇게) · 바 `h-2`(실물 4보다 두껍게)** · `gap-1.5` · 묶음 `mt-2`(design §4.1, 시안 프레임 9). `/projects` 골격의 `h-5`·`h-1`을 복사하지 않는다. DOM 테스트(`components/__tests__/sources-screen.test.tsx`): 막대 수 ≤ 5 · `+N` 텍스트와 접근 이름 · 키 0 소스에 막대 줄 없음 · `failed-after`에 막대 유지 · 행 버튼 안에 `<div>` 0. `source-detail-counts.test.tsx` 기대값 갱신. `hand-copies.test.ts`의 Meter 경로 목록이 여전히 참인지 본다.
  검증: `pnpm test` green · `pnpm build` green(RSC 경계).

── 커밋: `feat(sources): locale meters on source rows` (T6·T7) ──

- [ ] **T8 — `/design-sync`** — 시안 프레임마다 computed style·접근성 트리 대조(1280 · 1024+LNB · 375, 라이트·다크).
  검증: 실측 일치 · 리뷰 지적 0.

- [ ] **T9 — 정본 갱신** — DESIGN §6.66(행 시각에 막대 줄 · 언어 행 "percent는 완료만" → 완료+검토 · 오른쪽 수치 · Languages 진행 열 300 → 200 — DESIGN 2022행 근처) · §6.63 머리의 `LocaleMeter` 소비자 서술(`project-row-redesign`과 늦게 끝나는 쪽이 고친다 — design §6) · UI 프리미티브 표의 Meter 행(DESIGN 787 근처 — "표시 percent의 clamp/floor는 `localeProgress`") · DIRECTORY(`lib/sources/meters.ts`). ARCHITECTURE에 `localeProgress` 퍼센트 정의가 적혀 있으면 같이 고친다. 그 뒤 `docs/features/source-row-locale-meter/`를 지운다.
  검증: `pnpm gate` green · `grep -rn "percent는 완료만" docs/` 0건.

- [ ] **T10 — 가이드 영향 확인** — Sources 목록·상세 모달의 스크린샷과 퍼센트 서술(`guide/*/` 중 Sources 페이지)을 `pnpm guide:check`로 확인하고, stale이면 `/guide`·`/guide-shots`로 넘긴다(차단 아님).
  검증: `pnpm guide:check` 출력을 보고서에 인용.

── 커밋: `docs(DESIGN): source row locale meters` 등 문서별 ──
