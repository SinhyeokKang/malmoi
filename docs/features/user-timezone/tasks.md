# user-timezone — 태스크

순서: 선행 확인 → 순수 함수 → 스키마·세션 → 입구 → 호출부 → 화면·방침 → 문서·검증.
`[커밋]`이 커밋 경계이고 **모든 커밋에서 `pnpm gate`가 green**이다. `[수동]`은 전부 H3(`/runtime-test`)로 모은다.

**구현 순서 고정(사용자 2026-10-04): ui-locales → user-timezone → color-scheme.** 이 기능의 어떤 태스크도 ui-locales가 dev에 통합되기 전에 착수하지 않는다 —
아래 거의 모든 태스크가 ui-locales의 파일(`lib/utc-time.ts`·`lib/i18n/server.ts`·`components/i18n/messages-provider.tsx`·`messages/{en,ko,es}.tsx`·`messages/ko-privacy.tsx`·
`app/(edit)/preferences/**`·`guide/{en,ko,es}/**`)을 바꾼다. color-scheme은 이 기능이 dev에 들어간 뒤 같은 Preferences 페이지에 셋째 카드를 붙인다.

## 0. 선행 확인

- [ ] **P0** dev에 ui-locales가 통합됐는지 확인한다: `lib/utc-time.ts`의 `uiLocale` 인자에 기본값이 없음(E7) · `getUiLocale`·`useUiLocale` · `User.uiLocale` 마이그레이션 · `/preferences` Language 카드 · `messages/es.tsx`·`ko-privacy.tsx` · `guide/{en,ko,es}/sync/logs.md`.
  그리고 `git grep -l "utcDay\|utcMinute\|utcMonth"`로 호출부를 다시 뽑아 design §5 표와 대조하고, 달라진 자리를 §5에 고친다.
  검증: 목록 전부 있음. 하나라도 없으면 착수하지 않는다.

## A. 순수 함수 (`/tdd interface` 대상)

- [ ] **A1** `lib/time-zone/zones.ts`(잎) — `TIME_ZONES`(design §2.1 초안 → 사용자 확인 후 확정) · `TimeZone` · `DEFAULT_TIME_ZONE` · `parseTimeZone` · `resolveTimeZone`.
  테스트: 목록 값 통과 · `Mars/Base`·`""`·`__proto__`·`constructor`·`toString`·`asia/seoul`·`"Asia/Seoul "`·숫자·`null` 거부 · 모든 id가 `Intl.DateTimeFormat`으로 생성됨 · id별 1월·7월 기대 오프셋 표(design §2.1 — `resolvedOptions()` 정규명 검사는 하지 않는다).
  `client-graph.test.ts`의 `CLIENT_LIB_FILES`에 등재.
  검증: `pnpm test` green.
- [ ] **A2** `lib/utc-time.ts` → `lib/date-format.ts`(`git mv`) — `DateStyle` · `zonedParts` · `utcOffsetMinutes` · `offsetLabel` · `formatDay`·`formatMinute`·`formatMonth` · `dayKeyAt` · `addDays` · `startOfDay`.
  테스트: ①`timeZone: "UTC"`에서 세 언어 × 세 함수가 **옛 `utcDay`·`utcMinute`·`utcMonth` 기댓값과 같은 문자열**(기존 `utc-time.test.ts` 표를 그대로 옮긴다 — 완료 조건 1)
  ②`Asia/Seoul`·`Asia/Kolkata`·`Asia/Kathmandu`·`America/New_York`(1월·7월) 기댓값. 음수 분 오프셋(`UTC-9:30`)은 목록에 없으므로 ③의 `offsetLabel` 단위 테스트로만 본다
  ③`offsetLabel` 표(0·540·330·345·-180·-570) ④날짜 경계 — `2026-10-04T23:10Z`가 Seoul에서 `Oct 5` ⑤`startOfDay` — New York 2026-03-08(23시간)·2026-11-01(25시간), `startOfDay(addDays(d,1)) - startOfDay(d)`가 그 길이
  ⑥`zonedParts`는 `UTC`에서 `Intl`을 부르지 않는다(spy).
  호출부는 이 커밋에서 **이름만** 옮긴다: `formatX(at, { uiLocale, timeZone: "UTC" })` — 출력이 같아 기존 테스트가 그대로 green. 기존 테스트 갱신 대상: `lib/__tests__/utc-time.test.ts`(→ `date-format.test.ts`) · `utc-time-consumers.test.ts` · `lib/keys/__tests__/view.test.ts`.
  검증: `pnpm test` green · `git grep -n "utc-time\|utcDay(\|utcMinute(\|utcMonth("` 비테스트 0(지역 함수 `utcDay`는 A3에서 개명) · `toLocaleDateString\|toLocaleTimeString` grep 0.
- [ ] **A3** Logs 경계 — `parseDateRange(from, to, timeZone)`(배타 상한 = `startOfDay(addDays(to,1))`, `DAY_MS` 삭제) · 지역 `utcDay(raw)` → `parseDayKey` · `presetRange(key, now, timeZone)`를 `lib/events/filter.ts`로(지역 `utcDay(offset)` 삭제) · `groupByDay(rows, now, style)` · `loadEvents`에 `timeZone` 필수 인자.
  테스트: UTC에서 기존 기댓값 그대로 · Seoul 구간 `[2026-10-04T15:00Z, 2026-10-05T15:00Z)` · 서머타임 날 23·25시간 · Seoul `now=2026-10-04T23:10Z`의 Today=`2026-10-05`·Yesterday=`2026-10-04` · 그룹 머리·`label`.
  이 커밋에서 호출부는 `"UTC"`를 넘긴다(동작 불변).
  검증: `pnpm test` green.
- [ ] **A4** 소스 검사 — ①`Intl.DateTimeFormat`은 `lib/date-format.ts`에서만(비테스트) ②공개 셸 경로(design §4)가 `getDateStyle`·`useDateStyle`을 import하지 않는다 ③`lib/**`가 `getDateStyle`을 import하지 않는다(ui-locales B1⑧ 확장) ④`lib/mcp/tools/project.ts`의 `loadEvents` 호출이 `timeZone: "UTC"`.
  ②~④는 B·C 뒤에야 대상이 생기므로 **존재하는 심볼만 검사하는 형**으로 쓰고 C에서 대상을 채운다(커밋마다 green).
  검증: `pnpm test` green.
- [ ] **A5** `timeZoneOptions(now)` — `lib/time-zone/options.ts`. 테스트: 첫 줄 `UTC` · 오프셋 오름차순·동률 id 순 · 1월과 7월 `now`에서 New York 라벨이 `UTC-5`/`UTC-4`.
- [ ] `[커밋] feat(time): zoned date formatting and time zone resolution` (A1–A5 — 출력 불변)

## B. 스키마·세션 (`/db`)

- [ ] **B1** `User.timeZone String?` + 마이그레이션(`--create-only`로 SQL을 본 뒤 dev 적용) + `lib/privacy/collected.ts` 등재.
  검증: `pnpm db:status` 깨끗 · dev `has_schema_privilege` false · `pnpm typecheck` green.
- [ ] `[커밋] feat(db): add User.timeZone`
- [ ] **B2** `readSession()` ok 갈래에 `timeZone` — 타입 넷(design §7). `read-session.test.ts`의 `toEqual` 갱신 + 새 케이스.
  검증: `pnpm test` green · 로컬 `/api/auth/session` 본문에 값 `[수동]`.
- [ ] `[커밋] feat(auth): expose timeZone on the session`

## C. 입구 + 호출부

- [ ] **C1** `getDateStyle()`(`lib/i18n/server.ts`, React `cache`) · `MessagesProvider`에 `timeZone` prop → context · `useDateStyle()` · 루트 레이아웃이 넘긴다.
  테스트: 서버 — 세션 ok·값 있음/목록 밖/null · `unavailable` → UTC. DOM — provider 없음 → UTC · `timeZone` 바꿔 렌더해도 자식 상태·포커스 유지(재마운트 없음). 루트 레이아웃 소스 검사(`app/__tests__/root-layout-i18n.test.ts`)에 `timeZone` 전달 고정.
- [ ] **C2** 호출부 전환(design §5 표) — 사용자 시간대 자리는 `getDateStyle()`/`useDateStyle()`, 고정 표면은 `"UTC"` 명시. Logs 페이지·필터·`list_events`. `retryAtLabel(iso, style)`.
  사전 셋(en·ko·es)의 `logs.filters.range.{custom,customOpen,from,to}`를 `(zone) => …` 함수로 — ko·es도 같은 커밋(`satisfies Messages`가 막는다). 사전 정합성 테스트의 대표 인자 표에 항목 추가.
  DOM 테스트(대표 셋): `event-row`의 `aria-label`이 Seoul에서 `… UTC+9` · `publish-button` stamp · `log-filters` 칩·Custom range 라벨 `(UTC+9)`. 모두 `<time dateTime>`이 UTC ISO.
  A4 ②~④ 대상 채움.
  검증: `pnpm gate` green · 시간대를 고르지 않은 로컬 화면이 이전과 같음 `[수동]`.
- [ ] `[커밋] feat(time): render dates in the viewer's time zone`

## D. 화면 + 방침 (한 커밋 — 값을 고를 수 있게 되는 커밋에서 방침이 참이어야 한다)

- [ ] **D1** `setTimeZone`(`app/(edit)/preferences/actions.ts`). 테스트: 목록 밖 값 → `invalid`·쓰기 0 · 세션 없음/`unavailable` → `failed`·쓰기 0 · 세션 userId로 갱신 · DB 실패 → `failed` · **성공 갈래에서만** `revalidateAfterCommit` · `"UTC"`를 고르면 `"UTC"` 저장.
- [ ] **D2** Time zone 카드(design §6). Language 카드의 Select 조립이 공용 컴포넌트가 아니면 **먼저 공용으로 뽑고 Language 카드를 이관**(같은 커밋 — 테스트 먼저).
  DOM 테스트(포커스 fixup observer 포함): 옵션 = `timeZoneOptions(now)` · 고르면 Action · 같은 값이면 호출 없음 · 진행 중 가드·포커스 유지 · 낙관적 표시 → 실패 복귀 + `Alert danger inset` · 닫힌 트리거 글자 키로 값 불변 · 도움말 `aria-describedby`.
  사전 셋에 카드 문구(제목·설명·도움말) — ko·es 같은 커밋.
- [ ] **D3** 방침 en(`messages/en.tsx` 방침 절)·ko(`messages/ko-privacy.tsx`) — `User.timeZone` 수집 항목 + 개정 이력 + 시행일. ko는 에이전트 초안 → **사용자 검수**.
  검증: `policy-gate.test.tsx`·두 본문 동형 검사 green.
- [ ] `[커밋] feat(preferences): choose a time zone for dates and times`

## E. 가이드

- [ ] **E1** `guide/{en,ko,es}/sync/logs.md:12`의 "Dates and event times use UTC" → 기본 UTC + Preferences에서 바꿀 수 있음(세 언어 같은 커밋 — ui-locales I6 규칙). Preferences 가이드 페이지(ui-locales H3이 만든 것)에 Time zone 절.
  ko 초안 → 사용자 검수(ui-locales와 같은 방식), es 초안 그대로.
  검증: 원고 게이트·구조 동형·용어 검사 green. 스크린샷은 Preferences 샷만 `/guide-shots`(en) — `pnpm guide:check` stale 후보로 확인.
- [ ] `[커밋] docs(guide): time zone preference`

## H. 문서·검증

- [ ] **H1** 정본 갱신(문서별 별도 커밋):
  - CLAUDE.md 코드 컨벤션 "날짜는 UTC로 저장하고…" → design §0 "바뀐 규칙" 문안. 데이터 변경 경로 표에 `setTimeZone` 행. (미러는 훅)
  - ARCHITECTURE — 잎 명부(`lib/time-zone/zones.ts` 추가, `lib/utc-time.ts` → `lib/date-format.ts`) · 스키마 절 `User.timeZone` · Logs 구간이 보는 사람의 시간대이고 MCP는 UTC라는 계약 · 하이드레이션 수용 근거(design §0).
  - DESIGN — 날짜·시각 형 절(`UTC+9` 라벨) · `:1914`의 `aria-label="… UTC"` 예 · `:1930`·`:1954` `Custom range (UTC)` → 시간대 라벨 · `:1719` `retryAtLabel` · Preferences Time zone 카드.
  - PRODUCT — Preferences 범위(§4.1·§7.7 IA)에 시간대 · `:710-711` "UTC를 말한다" 문장 갱신.
  - DIRECTORY — `lib/time-zone/` · `lib/date-format.ts`.
  - OPERATIONS — 선별 목록에서 id를 빼기 전 저장 건수 확인 한 줄(design §2.1).
  - POSTMORTEM 2026-09-20 항목의 재발 방지 grep은 append-only라 고치지 않는다 — 그 grep(`toLocale*` 0)은 여전히 참이다.
- [ ] **H2** `lib/date-format.ts` 머리 주석·`lib/events/filter.ts`·`view.ts`·`messages/en.tsx`의 "UTC 자정으로 끊는다" 주석(`:1218-1220` 등)을 새 계약으로 — C2와 같은 커밋에서 한다(주석이 코드와 함께 거짓이 되지 않게).
- [ ] **H3** `/runtime-test` — 완료 조건의 `[수동]` 전부: 기본 UTC 화면 불변 · Seoul·Kolkata·New York 선택 뒤 Logs 카드 경계·Today·프리셋 · Sources·Publish·Sync 잠금·초대 재시도·토큰 시각 · ko·es × Kolkata에서 하이드레이션 경고 0 · 다른 기기 로그인 · 공개 페이지가 UTC · Preferences 실패 Alert(revalidate 뒤 유지).
- [ ] **H4** prod 반영(`/merge` 1단계): `pnpm db:status:prod` → `pnpm db:deploy` → prod `has_schema_privilege` false. ⚠️ ui-locales의 `User.uiLocale` 마이그레이션이 prod에 먼저 있어야 한다(순서 고정).
- [ ] 끝나면 결론을 정본으로 올리고 `docs/features/user-timezone/`를 지운다.

## 의존 요약

```
ui-locales (dev 통합) ─▶ P0 ─▶ A1–A5 ─▶ B1 ─▶ B2 ─▶ C1 ─▶ C2 ─▶ D1–D3 ─▶ E1 ─▶ H1·H3 ─▶ (/merge: H4)
                                                                               └─▶ color-scheme 착수
```
