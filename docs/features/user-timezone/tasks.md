# user-timezone — 태스크

순서: 선행 확인 → 순수 함수 → 스키마·세션 → 입구 → 호출부 → 화면·방침 → 문서·검증.
`[커밋]`이 커밋 경계이고 **모든 커밋에서 `pnpm gate`가 green**이다. `[수동]`은 전부 H3(`/runtime-test`)로 모은다.

**구현 순서 고정(사용자 2026-10-04): ui-locales → user-timezone → color-scheme.** 이 기능의 어떤 태스크도 ui-locales가 dev에 통합되기 전에 착수하지 않는다 —
아래 거의 모든 태스크가 ui-locales의 파일(`lib/utc-time.ts`·`lib/i18n/server.ts`·`components/i18n/messages-provider.tsx`·`messages/{en,ko,es}.tsx`·`messages/ko-privacy.tsx`·
`app/(edit)/preferences/**`·`guide/{en,ko,es}/**`)을 바꾼다. color-scheme은 이 기능이 dev에 들어간 뒤 같은 Preferences 페이지에 셋째 카드를 붙인다.

## 0. 선행 확인

- [x] **P0** dev에 ui-locales가 통합됐는지 확인한다: `lib/utc-time.ts`의 `uiLocale` 인자에 기본값이 없음(ui-locales `orch.md` D3 — E 배치) · `getUiLocale`·`useUiLocale` · `User.uiLocale` 마이그레이션 · `/preferences` Language 카드 · `messages/es.tsx`·`ko-privacy.tsx` · `guide/{en,ko,es}/sync/logs.md`.
  그리고 `git grep -l "@/lib/utc-time"`(비테스트)로 호출부를, **같은 grep을 테스트 파일에도** 돌려 갱신 대상 테스트를 다시 뽑아 design §5 표·A2 목록과 대조하고, 달라진 자리를 고친다. `loadEvents`·`parseDateRange` 호출부도 `git grep -n`으로 다시 본다.
  design §2.1의 id별 오프셋 표를 **Node 24(CI `.nvmrc`)로도** 실측한다(로컬은 Node 26).
  검증: 목록 전부 있음 · 두 Node에서 표 일치. 하나라도 어긋나면 착수하지 않는다.

## A. 순수 함수 (`/tdd interface` 대상)

- [x] **A1** `lib/time-zone/zones.ts`(잎) — `TIME_ZONES`(design §2.1 초안 → 사용자 확인 후 확정) · `TimeZone` · `DEFAULT_TIME_ZONE` · `parseTimeZone` · `resolveTimeZone`.
  테스트: 목록 값 통과 · `Mars/Base`·`""`·`__proto__`·`constructor`·`toString`·`asia/seoul`·`"Asia/Seoul "`·숫자·`null` 거부 · 모든 id가 `Intl.DateTimeFormat`으로 생성됨 · id별 1월·7월 기대 오프셋 표(design §2.1 — `resolvedOptions()` 정규명 검사는 하지 않는다).
  `client-graph.test.ts`의 `CLIENT_LIB_FILES`에 등재.
  ⚠️ **테스트 파일 머리에 프로세스 TZ를 고정한다** — vitest·CI 어디에도 TZ 설정이 없고 CI(ubuntu)는 사실상 UTC라, 런타임 TZ 누수가 있어도 CI에선 green이다. 지금 고정은 `lib/__tests__/utc-time.test.ts:2`(`process.env.TZ = "Asia/Seoul"`)와 `:12`의 가드뿐이다.
  A1·A2·A3·A5의 새·갱신 테스트 파일 전부에 같은 형(`process.env.TZ = "Asia/Kathmandu"` — UTC가 아니고 분 단위 오프셋 + 가드)을 둔다.
  검증: `pnpm test` green.
- [x] **A2** `lib/utc-time.ts` → `lib/date-format.ts`(`git mv`) — `DateStyle` · `zonedParts` · `utcOffsetMinutes` · `offsetLabel` · `formatDay`·`formatMinute`·`formatMonth` · `formatClock` · `formatDayKey` · `dayKeyAt` · `addDays` · `startOfDay`.
  테스트: ①`timeZone: "UTC"`에서 세 언어 × 세 함수가 **옛 `utcDay`·`utcMinute`·`utcMonth` 기댓값과 같은 문자열**(기존 `utc-time.test.ts` 표를 그대로 옮긴다 — 완료 조건 1)
  ②`Asia/Seoul`·`Asia/Kolkata`·`Asia/Kathmandu`·`America/New_York`(1월·7월) 기댓값. 음수 분 오프셋(`UTC-9:30`)은 목록에 없으므로 ③의 `offsetLabel` 단위 테스트로만 본다
  ③`offsetLabel` 표(0·540·330·345·-180·-570) ④날짜 경계 — `2026-10-04T23:10Z`가 Seoul에서 `Oct 5` ⑤`startOfDay` — New York 2026-03-08(23시간)·2026-11-01(25시간), `startOfDay(addDays(d,1)) - startOfDay(d)`가 그 길이.
  **0시가 없는 날**(design §2): `America/Santiago` 2026-09-06·2027-09-05 · `Atlantic/Azores` 2026-03-29·2027-03-28 · `Africa/Cairo` 2026-04-24·2027-04-30 — 결과가 그날 01:00이고 `dayKeyAt(결과) === 입력 키`(전날 23시가 아니다)
  ⑥`zonedParts`는 `UTC`에서 `Intl`을 부르지 않는다(spy) · `h === 24` 정규화
  ⑦`formatClock` — `09:42 UTC` · Seoul `08:10 UTC+9` · Kolkata `UTC+5:30`
  ⑧`formatDayKey` — 세 언어 × 키, 프로세스 TZ와 무관
  ⑨**TZ 교체 불변** — 같은 입력으로 `process.env.TZ`를 `UTC`·`Asia/Seoul`·`America/Santiago`로 바꿔 가며 `formatX`·`dayKeyAt`·`startOfDay` 출력이 같다(런타임 TZ를 읽지 않음을 구조로 고정 — 하이드레이션 완료 조건 10의 자동 대리. 테스트 끝에 원래 TZ 복원).
  ⚠️ `git mv` 때 `utc-time.test.ts:2`의 TZ 고정과 `:12` 가드를 살린다.
  호출부는 이 커밋에서 **이름만** 옮긴다: `formatX(at, { uiLocale, timeZone: "UTC" })` — 출력이 같아 기존 테스트가 그대로 green.
  기존 테스트 갱신 대상(P0에서 다시 뽑는다): `lib/__tests__/utc-time.test.ts`(→ `date-format.test.ts`) · `utc-time-consumers.test.ts` · `lib/invitation-email/__tests__/retry-at.test.ts` · `lib/events/__tests__/view.test.ts` · `lib/sync/__tests__/plan.test.ts` · `lib/i18n/__tests__/no-korean-ui.test.ts` ·
  `components/__tests__/{a11y-reasons,logs-custom-range,privacy-doc,settings-layout,logs-screen,sources-screen}`(`logs-screen.test.ts:82-89`는 소스 정규식 `aria-label={utcMinute(`이다).
  `client-graph.test.ts`: `CLIENT_LIB_FILES`의 이름 · Logs view 잎 목록 `:478`의 `lib/utc-time.ts` → `lib/date-format.ts`.
  검증: `pnpm test` green · `git grep -n "utc-time\|utcDay(\|utcMinute(\|utcMonth("` 비테스트 0(지역 함수 `utcDay`는 A3에서 개명) · `toLocaleDateString\|toLocaleTimeString` grep 0.
- [x] **A3** Logs 경계 — `parseDateRange(from, to, timeZone)`(배타 상한 = `startOfDay(addDays(to,1))`, `DAY_MS` 삭제 — 호출자는 `narrow` 하나) · 지역 `utcDay(raw)` → `parseDayKey` · **`parseLogFilter`의 유효성 판정을 `parseDayKey` + 키 문자열 비교로 떼어 시간대와 무관하게 둔다**(`filter.ts:53` — 시그니처 불변, MCP·Home 호출부 그대로) · `presetRange(key, now, timeZone)`를 `lib/events/filter.ts`로(지역 `utcDay(offset)` 삭제) · `groupByDay(rows, now, style)`(머리 `formatDayKey`) · `loadEvents`에 `timeZone` 필수 인자.
  테스트: UTC에서 기존 기댓값 그대로 · Seoul 구간 `[2026-10-04T15:00Z, 2026-10-05T15:00Z)` · 서머타임 날 23·25시간 · **0시가 없는 날**(Santiago 2026-09-06 — 구간 시작 01:00, 그 날 23시간, 카드 머리가 `Sep 6, 2026`) · Seoul `now=2026-10-04T23:10Z`의 Today=`2026-10-05`·Yesterday=`2026-10-04` · 그룹 머리·`label` ·
  기존 경계 케이스(역전 쌍·무효 날짜·월말·윤년 — `filter.test.ts:147-184`)를 Seoul·New York에서도 · `parseLogFilter`가 시간대 없이 같은 판정.
  이 커밋에서 `loadEvents` 호출부 셋은 `"UTC"`를 넘긴다(동작 불변): Logs 페이지 · Home(`(home)/page.tsx:151`) · MCP `list_events`.
  `client-graph.test.ts` Logs filter 잎 목록 `:484-488`에 `lib/date-format.ts` 추가.
  검증: `pnpm test` green.
- [x] **A4** 소스 검사 — ①`Intl.DateTimeFormat`은 `lib/date-format.ts`에서만(비테스트) ②공개 셸 경로(design §4)가 `getDateStyle`·`useDateStyle`을 import하지 않는다 ③`lib/**`(단 `lib/i18n/server.ts` 자신은 제외)가 `getDateStyle`을 import하지 않는다(ui-locales B1⑧ 확장) ④`lib/mcp/tools/project.ts`의 `loadEvents` 호출이 `timeZone: "UTC"` ⑤비테스트 `app/**`·`components/**`에서 `toISOString().slice(11` 0건(생산자 우회 시각 — event-row 같은 자리).
  ①·④는 A에서 바로 켠다(A3이 MCP에 `"UTC"`를 넘긴다). ⑤는 C2에서 event-row를 옮기며 켠다. ②·③은 부정 검사라 언제든 공허하게 green이다 — C1에서 **센티넬**("`lib/i18n/server.ts`가 `getDateStyle`을 export한다")을 같은 테스트에 더해 이름이 바뀌면 red가 되게 한다.
  검증: `pnpm test` green.
- [x] **A5** `timeZoneOptions(now)` — `lib/time-zone/options.ts`. 테스트: 첫 줄 `UTC` · 오프셋 오름차순·동률 id 순 · 1월과 7월 `now`에서 New York 라벨이 `UTC-5`/`UTC-4` · 오프셋 0 옵션 라벨이 `UTC+0 · Europe/London`(첫 줄 `UTC`와 다름). `client-graph.test.ts` `CLIENT_LIB_FILES`에 등재.
  검증: `pnpm test` green.
- [x] `[커밋] feat(time): zoned date formatting and time zone resolution` (A1–A5 — 출력 불변)

## B. 스키마·세션 (`/db`)

- [x] **B1** `User.timeZone String?` + 마이그레이션(`--create-only`로 SQL을 본 뒤 dev 적용) + `lib/privacy/collected.ts` 등재.
  ⚠️ `/db`는 스키마+마이그레이션만 커밋하지만 **이 커밋엔 `collected.ts`가 같이 들어간다** — 빠지면 `Record<FieldPath, …>` 때문에 typecheck가 red다.
  검증: `pnpm db:status` 깨끗 · dev `has_schema_privilege` false · `pnpm typecheck` green.
- [x] `[커밋] feat(db): add User.timeZone`
- [x] **B2** `readSession()` ok 갈래에 `timeZone` — 타입 넷(design §7). `read-session.test.ts`의 `toEqual` 갱신 + 새 케이스 · `lib/auth/__tests__/public-session.test.ts:24,41,51`(`:41`은 키 목록 정확 비교) · `lib/credentials/__tests__/adapter.test.ts:97-108`의 `uiLocale` 통과 케이스에 `timeZone` 짝.
  검증: `pnpm test` green · 로컬 `/api/auth/session` 본문에 값 `[수동]`.
- [x] `[커밋] feat(auth): expose timeZone on the session`

## C. 입구 + 호출부

- [x] **C1** `getDateStyle()`(`lib/i18n/server.ts`, React `cache`) · `MessagesProvider`에 `timeZone` prop → context · `useDateStyle()` · 루트 레이아웃이 넘긴다.
  테스트: 서버 — 세션 ok·값 있음/목록 밖/null · `unavailable` → UTC. DOM — provider 없음 → UTC · `timeZone` 바꿔 렌더해도 자식 상태·포커스 유지(재마운트 없음) · `useDateStyle()`이 같은 provider 값에서 같은 객체 참조를 돌려준다. 루트 레이아웃 소스 검사(`app/__tests__/root-layout-i18n.test.ts`)에 `timeZone` 전달 고정. A4 ②·③ 센티넬 추가.
  검증: `pnpm test` green(C1은 따로 커밋하지 않는다 — `pnpm gate`는 C2 커밋에서 판정).
- [x] **C2** 호출부 전환(design §5 표) — 사용자 시간대 자리는 `getDateStyle()`/`useDateStyle()`, 고정 표면은 `"UTC"` 명시. Logs 페이지·Home(`(home)/page.tsx:151` + `components/home/logs-card.tsx`)·필터·`list_events`. `retryAtLabel(iso, style)`.
  `event-row.tsx:69`의 보이는 시각을 `formatClock`으로(행마다 라벨 · `<time>` 폭 `w-12` 실측 조정) — A4 ⑤를 켠다. 필터 칩(`log-filters.tsx:357`)은 `formatDayKey`. 프리셋·Custom range의 `now`는 Logs 페이지가 내린 ISO prop(렌더 중 `Date.now()` 제거).
  사전 셋(en·ko·es — 실제 경로 `m.logs.range.*`)의 `custom`·`customOpen`·`from`·`to`에서 `(UTC)` 괄호를 빼고 Dialog 설명용 `zoneNote: (zone) => …` 하나를 더한다(design §5) — ko·es도 같은 커밋(`satisfies Messages`가 막는다). 사전 정합성 테스트의 대표 인자 표에 항목 추가.
  DOM 테스트(대표 셋): `event-row`의 보이는 시각·`aria-label`이 Seoul에서 `… UTC+9` · `publish-button` stamp · `log-filters` 칩이 Seoul **과 `America/New_York`**에서 고른 날짜 그대로(음수 오프셋에서 하루 밀리지 않음) · Custom range Dialog에 `Days are in Asia/Seoul.`. 모두 `<time dateTime>`이 UTC ISO.
  **H2(주석 갱신)를 이 커밋에서 한다** — 주석이 코드와 함께 거짓이 되지 않게.
  검증: `pnpm gate` green(출력을 파이프로 거르지 않는다 — POSTMORTEM 2026-09-30) · 시간대를 고르지 않은 로컬 화면이 이전과 같음 `[수동]`.
- [x] `[커밋] feat(time): render dates in the viewer's time zone`

## D. 화면 + 방침 (한 커밋 — 값을 고를 수 있게 되는 커밋에서 방침이 참이어야 한다)

- [x] **D1** `setTimeZone`(`app/(edit)/preferences/actions.ts`). 테스트: 목록 밖 값 → `invalid`·쓰기 0 · 세션 없음/`unavailable` → `failed`·쓰기 0 · 세션 userId로 갱신 · DB 실패 → `failed` · **성공 갈래에서만** `revalidateAfterCommit` · `"UTC"`를 고르면 `"UTC"` 저장. `app/__tests__/entry-points.test.ts`의 `USER_SCOPED_ACTIONS`에 등재.
  검증: `pnpm test` green.
- [x] **D2** Time zone 카드(design §6). Language 카드의 Select 조립이 공용 컴포넌트가 아니면 **먼저 공용으로 뽑고 Language 카드를 이관**(같은 커밋 — 테스트 먼저).
  `now`는 서버 페이지가 ISO prop으로 내린다(옵션 정렬·미리보기 공통).
  DOM 테스트(포커스 fixup observer 포함 — Radix Select 테스트는 POSTMORTEM 2026-09-13·09-19의 기존 패턴을 따른다): 옵션 = `timeZoneOptions(now)` · 고르면 Action · 같은 값이면 호출 없음 · 진행 중 가드·포커스 유지 · 낙관적 표시(트리거·**미리보기 `Now: …`**) → 실패 복귀 + `Alert danger inset` · 닫힌 트리거 글자 키로 값 불변 · 도움말 `aria-describedby`.
  사전 셋에 카드 문구(제목·설명·도움말·미리보기 `now`) — ko·es 같은 커밋.
  검증: `pnpm test` green.
- [x] **D3** 방침 en(`messages/en.tsx` 방침 절)·ko(`messages/ko-privacy.tsx`) — `User.timeZone` 수집 항목 + 개정 이력 + 시행일. ko는 에이전트 초안 → **사용자 검수**.
  검증: `policy-gate.test.tsx`·두 본문 동형 검사 green.
- [x] `[커밋] feat(preferences): choose a time zone for dates and times`

## E. 가이드

- [x] **E1** `guide/{en,ko,es}/sync/logs.md:12`의 "Dates and event times use UTC" → 기본 UTC + Preferences에서 바꿀 수 있음(세 언어 같은 커밋 — ui-locales I6 규칙). Preferences 가이드 페이지(ui-locales H3이 만든 것)에 Time zone 절.
  ko 초안 → 사용자 검수(ui-locales와 같은 방식), es 초안 그대로.
  검증: 원고 게이트·구조 동형·용어 검사 green. 스크린샷은 Preferences 샷만 `/guide-shots`(en) — `pnpm guide:check` stale 후보로 확인.
- [x] `[커밋] docs(guide): time zone preference`

## H. 문서·검증

- [x] **H1** 정본 갱신(문서별 별도 커밋):
  - CLAUDE.md 코드 컨벤션 "날짜는 UTC로 저장하고…" → design §0 "바뀐 규칙" 문안. 데이터 변경 경로 표에 `setTimeZone` 행. (미러는 훅)
  - ARCHITECTURE — 잎 명부(`lib/time-zone/zones.ts` 추가, `lib/utc-time.ts` → `lib/date-format.ts`) · 스키마 절 `User.timeZone` · Logs 구간이 보는 사람의 시간대이고 MCP는 UTC라는 계약 · 하이드레이션 수용 근거(design §0).
  - DESIGN — 날짜·시각 형 절(`UTC+9` 라벨) · `:1914`의 `aria-label="… UTC"` 예 · `:1930`·`:1954` `Custom range (UTC)` → 괄호 없는 라벨 + Dialog `Days are in <id>.` 줄 · Logs 행 시각 `08:10 UTC+9` · `:1719` `retryAtLabel` · Preferences Time zone 카드.
  - PRODUCT — Preferences 범위(§4.1·§7.7 IA)에 시간대 · `:710-711` "UTC를 말한다" 문장 갱신.
  - DIRECTORY — `lib/time-zone/` · `lib/date-format.ts`.
  - OPERATIONS — 선별 목록에서 id를 빼기 전 저장 건수 확인 한 줄(design §2.1).
  - POSTMORTEM 2026-09-20 항목의 재발 방지 grep은 append-only라 고치지 않는다 — 그 grep(`toLocale*` 0)은 여전히 참이다.
- [x] **H2** (C2에서 실행 — 여기는 참조) `lib/date-format.ts` 머리 주석·`lib/events/filter.ts`·`view.ts`·`messages/en.tsx`의 "UTC 자정으로 끊는다" 주석(`:1218-1220`)·`:1506`·`components/oauth/consent-panel.tsx:48`·`lib/sync/plan.ts:52`·`log-filters.tsx`의 `dateLabel` 머리 주석을 새 계약으로.
- [ ] **H3** `/runtime-test` — 완료 조건의 `[수동]` 전부: 기본 UTC 화면 불변 · Seoul·Kolkata·New York 선택 뒤 Logs 카드 경계·Today·프리셋·행 시각 라벨·칩 날짜(New York에서 하루 밀리지 않음) · Preferences 미리보기 · Sources·Publish·Sync 잠금·초대 재시도·토큰 시각 · ko·es × Kolkata에서 하이드레이션 경고 0 · 다른 기기 로그인 · 공개 페이지가 UTC · Preferences 실패 Alert(revalidate 뒤 유지).
- [ ] **H4** prod 반영(`/merge` 1단계): `pnpm db:status:prod` → `pnpm db:deploy` → prod `has_schema_privilege` false. ⚠️ ui-locales의 `User.uiLocale` 마이그레이션이 prod에 먼저 있어야 한다(순서 고정).
- [ ] 끝나면 결론을 정본으로 올리고 `docs/features/user-timezone/`를 지운다.

## 의존 요약

```
ui-locales (dev 통합) ─▶ P0 ─▶ A1–A5 ─▶ B1 ─▶ B2 ─▶ C1 ─▶ C2 ─▶ D1–D3 ─▶ E1 ─▶ H1·H3 ─▶ (/merge: H4)
                                                                               └─▶ color-scheme 착수
```
