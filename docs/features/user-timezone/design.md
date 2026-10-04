# user-timezone — 설계

전제: **ui-locales가 dev에 통합된 뒤 착수한다.** 이 문서가 기대는 그 기능의 산출물 — `/preferences` 페이지(Language 카드)·`User.uiLocale`과
세션 배선(`readSession().uiLocale`)·`getUiLocale()`(`lib/i18n/server.ts`)·`MessagesProvider`/`useUiLocale()`·`lib/utc-time.ts`의 `uiLocale` 인자
(E7이 기본값 `"en"`을 지운 상태)·ko·es 사전·`messages/ko-privacy.tsx`·`guide/{en,ko,es}/`. 착수 때 이 목록이 dev에 있는지 먼저 본다(tasks 0).

## 0. 뒤집는 규칙과 그 근거

지금 규칙 셋이 "절대 시각은 UTC로 말한다"를 든다. 각각이 **무엇을 막으려고** 섰는지 보면, 이 기능은 막으려던 것을 다시 열지 않는다.

| 규칙 | 막으려던 것 | 이 기능에서 |
|---|---|---|
| CLAUDE.md 코드 컨벤션 "절대 날짜·시각도 UTC로 말한다" | 라벨 없는 로컬 시각 — 보는 사람이 어느 시간대인지 모른다 | **라벨은 그대로 단다**(`UTC+9`). 시간대는 보는 사람이 **고른** 것이다 — 서버 TZ도 브라우저 TZ도 아니다 |
| `lib/utc-time.ts` 머리 "`Intl` 날짜 포맷터를 쓰지 않는다 — ICU 빌드와 런타임 TZ에 기댄다" | ① 서버(Vercel UTC)와 브라우저(로컬)가 다른 TZ로 같은 값을 다르게 찍음 ② ICU 빌드마다 다른 월 이름·구두점 | ① **`timeZone`을 항상 명시**해 런타임 TZ를 읽을 길을 없앤다 ② `Intl`은 **숫자 부품 추출**(`formatToParts`, `en-US`·`h23`·numeric)에만 쓰고 월 이름·어순·라벨은 지금처럼 손으로 조립한다. 로케일 문자열 출력은 여전히 0이다 |
| POSTMORTEM 2026-09-20 "라벨 없는 `toLocaleDateString`" | `toLocaleDateString("en-US", { timeZone: "UTC" })`가 라벨 없는 날짜를 냈고, KST 사용자가 하루 어긋나게 읽었다 | 그 사고의 뿌리는 "UTC 날짜를 로컬 날짜로 읽었다"이다 — 보는 사람의 시간대로 날짜를 내면 **그 어긋남 자체가 사라진다**. `toLocale*` grep 0 규칙은 그대로 둔다 |

**바뀐 규칙(정본 갱신 문안 — tasks H1):** "날짜는 UTC로 저장한다. 절대 날짜·시각은 **보는 사람이 고른 시간대(기본 UTC)**로 말하고, 시각에는 그 오프셋을 라벨로 단다
(`Sep 27, 2026 16:34 UTC` · `Oct 5, 2026 08:10 UTC+9`). 생산자는 `lib/date-format.ts` 하나이고 `<time dateTime>`은 UTC ISO다.
`Intl.DateTimeFormat`은 그 파일에서 `timeZone`을 명시한 숫자 부품 추출에만 쓴다. `toLocale*`은 쓰지 않는다."

**하이드레이션**: 서버(Node ICU)와 브라우저가 같은 `timeZone` 문자열로 같은 순간의 부품을 뽑는다. 출력이 갈리는 것은 두 런타임의 tzdata가
**그 시간대의 규칙 변경 직후 시점**을 서로 다르게 알 때뿐이다 — 선별 목록이라 범위가 작고, 갈리면 하이드레이션 경고 한 번이 나고 클라이언트 값이 이긴다.
수용한다(`suppressHydrationWarning`을 달지 않는다 — 다른 불일치까지 숨긴다).

## 1. 이름

| 무엇 | 식별자 |
|---|---|
| 지원 집합 | `TIME_ZONES`(IANA id 배열 `as const`) · `type TimeZone` — `lib/time-zone/zones.ts`(잎) |
| 기본값 | `DEFAULT_TIME_ZONE = "UTC"` |
| DB 컬럼 | `User.timeZone String?` |
| 포맷 모듈 | `lib/utc-time.ts` → **`lib/date-format.ts`**(git mv). 함수 `formatDay`·`formatMinute`·`formatMonth` |
| 포맷 입력 | `type DateStyle = { readonly uiLocale: UiLocale; readonly timeZone: TimeZone }` |
| Action | `setTimeZone` — `app/(edit)/preferences/actions.ts` |
| 화면 라벨 | Preferences의 `Time zone` |

`utc-time`·`utcDay` 이름을 남기지 않는 이유: 그 이름이 "UTC로 말한다"를 약속하는데 이제 거짓이다. 호출부는 ui-locales E가 이미 한 번 건드렸고 이 기능이 시간대 인자를 넣으려 어차피 다시 건드린다 — 같은 손에서 이름을 바꾼다.
`components/logs/log-filters.tsx`의 지역 `utcDay(offset)`·`lib/events/filter.ts`의 지역 `utcDay(raw)`는 ISO 날짜 키를 만드는 다른 함수다 — 시간대 인자를 받게 되면서 각각 `dayKeyAt`·`parseDayKey`로 이름을 바꾼다(§2).

## 2. 순수 함수 (= `/tdd` 진입점)

| 함수 | 위치 | 계약 |
|---|---|---|
| `TIME_ZONES` · `parseTimeZone(raw: unknown): TimeZone \| null` | `lib/time-zone/zones.ts` (잎, import 0) | 선별 목록 안의 문자열만 통과. **`Object.hasOwn`으로 판정**(표를 `Record`로 든다) — `__proto__`·`constructor`·`toString`·`""`·공백 붙은 값·대소문자 다른 값(`asia/seoul`) 거부. 런타임 `Intl`에 유효성을 묻지 않는다(ICU마다 다르다) |
| `resolveTimeZone(account: unknown): TimeZone` | 같은 파일 | `parseTimeZone(account) ?? "UTC"`. 쿠키 입력이 없다(spec 결정) |
| `zonedParts(at: Date, timeZone): { y; mo; d; h; mi }` | `lib/date-format.ts` (잎 — `UiLocale`·`TimeZone` 타입만 import) | `Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year·month·day·hour·minute: "numeric" }).formatToParts`에서 **숫자만** 읽는다. `timeZone === "UTC"`면 `getUTC*`로 직행한다(기본 경로에 Intl이 없다 — 완료 조건 1의 바이트 동일성을 구조로 보장). 포맷터는 시간대별로 모듈 `Map`에 캐시한다 |
| `utcOffsetMinutes(at, timeZone): number` | 같은 파일 | `Date.UTC(zonedParts…) - floor(at, 분)` → 분. `UTC`는 0 |
| `offsetLabel(minutes): string` | 같은 파일 | `0 → "UTC"` · `540 → "UTC+9"` · `330 → "UTC+5:30"` · `345 → "UTC+5:45"` · `-180 → "UTC-3"` · `-570 → "UTC-9:30"`. ASCII `-`(복사·검색에서 갈리지 않는다). 시는 0 채움 없음, 분은 0이 아닐 때만 `:mm` |
| `formatDay(at, style)` · `formatMinute(at, style)` · `formatMonth(at, style)` | 같은 파일 | 지금 `utcDay`·`utcMinute`·`utcMonth`의 언어별 손 형식 그대로, 부품만 `zonedParts`에서 읽는다. `formatMinute`의 꼬리는 `offsetLabel(utcOffsetMinutes(at, tz))` — `UTC`면 지금과 같은 ` UTC`. `formatDay`·`formatMonth`는 라벨을 달지 않는다(지금과 같다) |
| `dayKeyAt(at, timeZone): string` | 같은 파일 | 그 시간대의 달력 날짜 `YYYY-MM-DD`. Logs 그룹 키·프리셋의 오늘 |
| `addDays(dayKey, n): string` | 같은 파일 | 달력 날짜 산술(UTC 자정 `Date`로 계산 — 시간대와 무관). `Yesterday`·`Last 7 days`는 `now - 24h`가 아니라 이것이다(서머타임 날 23·25시간) |
| `startOfDay(dayKey, timeZone): Date` | 같은 파일 | 그 시간대에서 그날 0시의 순간. `Date.UTC(y,mo,d) - offset(guess)`를 두 번 반복해 전환일 오프셋을 맞춘다. 0시가 없는 날(전환이 자정에 걸린 과거 사례)은 그날 첫 순간 — 선별 목록에 대해 2026–2027 전환일 표로 고정한다 |
| `parseDateRange(from, to, timeZone)` | `lib/events/filter.ts` (기존 함수에 인자 추가) | `from`은 `startOfDay(from, tz)`, `to`는 **`startOfDay(addDays(to, 1), tz)`**(배타 상한 — `+DAY_MS`를 지운다). 역전 쌍은 지금처럼 둘 다 버린다. `"UTC"`면 지금과 같은 순간을 낸다 |
| `groupByDay(rows, now, style)` | `lib/events/view.ts` (기존 함수에 인자) | 키 `dayKeyAt(occurredAt, tz)` · 머리 `formatDay(startOfDay(key, tz), style)` · `today = dayKeyAt(now, tz)` · `yesterday = addDays(today, -1)` |
| 프리셋 범위 `presetRange(key, now, timeZone)` | `lib/events/filter.ts`(순수로 옮김) | `components/logs/log-filters.tsx`의 `PRESETS`·지역 `utcDay(offset)`를 대체. `today = dayKeyAt(now, tz)`에서 `addDays`로 |
| `timeZoneOptions(now): { value; label }[]` | `lib/time-zone/options.ts` | Preferences Select의 옵션 — `UTC`가 첫 줄, 나머지는 **`now` 기준 오프셋 오름차순, 같은 오프셋은 id 순**. 라벨 `UTC+9 · Asia/Seoul`(id는 번역하지 않는다 — 세 언어 공통이고 `lang` 무관). `now`를 인자로 받는다(`relativeTime`과 같은 이유 — 서버·클라이언트 기준이 갈리지 않게) |

`zonedParts`가 `Intl`을 쓰므로 **`lib/date-format.ts`는 클라이언트 그래프의 잎이지만 값 import 0은 유지된다**(Intl은 전역이다). `client-graph.test.ts`의 등재 이름만 바꾼다.

### 2.1 선별 목록 (초안 — 구현 때 확정, 사용자 확인 대상)

`UTC` + 아래 41개. 기준: 대륙별 대표 도시 · 30·45분 오프셋 대표 · 서머타임 유무가 다른 같은 오프셋(Denver/Phoenix) · es 화면 사용자가 많을 중남미·스페인.

`Pacific/Honolulu` · `America/Anchorage` · `America/Los_Angeles` · `America/Denver` · `America/Phoenix` · `America/Chicago` · `America/Mexico_City` ·
`America/New_York` · `America/Bogota` · `America/Lima` · `America/Halifax` · `America/Santiago` · `America/Sao_Paulo` · `America/Argentina/Buenos_Aires` ·
`Atlantic/Azores` · `Europe/London` · `Europe/Lisbon` · `Africa/Lagos` · `Europe/Madrid` · `Europe/Paris` · `Europe/Berlin` · `Africa/Cairo` · `Africa/Johannesburg` ·
`Europe/Athens` · `Europe/Istanbul` · `Europe/Moscow` · `Asia/Riyadh` · `Asia/Tehran` · `Asia/Dubai` · `Asia/Karachi` · `Asia/Kolkata` · `Asia/Kathmandu` ·
`Asia/Dhaka` · `Asia/Bangkok` · `Asia/Jakarta` · `Asia/Shanghai` · `Asia/Singapore` · `Asia/Seoul` · `Asia/Tokyo` · `Australia/Sydney` · `Pacific/Auckland`

테스트: 목록의 모든 id가 Node에서 `Intl.DateTimeFormat`으로 생성되고(`RangeError` 없음), **id별 기대 오프셋 표**(2026-01-15·2026-07-15 정오 UTC 두 순간)와 `utcOffsetMinutes`가 같다.
⚠️ `resolvedOptions().timeZone`으로 "정규 이름"을 검사하지 않는다 — Node 26 ICU는 `Asia/Kolkata`→`Asia/Calcutta` · `Asia/Kathmandu`→`Asia/Katmandu` · `America/Argentina/Buenos_Aires`→`America/Buenos_Aires`로 돌려준다(2026-10-04 실측).
그래서 저장·비교·표시는 **우리 목록의 id 문자열**만 쓰고 `resolvedOptions()`를 읽지 않는다.
⚠️ 목록에서 id를 **빼면** 그 값을 저장한 사용자는 UTC로 떨어진다(완료 조건 12) — 빼기는 마이그레이션 없이 되지만 사람의 설정이 조용히 바뀐다. 빼기 전에 `SELECT count(*) WHERE "timeZone" = …`를 본다(OPERATIONS에 한 줄).

## 3. 영향 받는 흐름

- **push / pull / export: 영향 없다.** 파일·PR 본문·커밋 메시지에 날짜 문장이 없다(ui-locales design §10 2026-10-04 확인과 같다).
- **편집 UI**: 절대 시각을 그리는 자리 전부 + Logs 날짜 경계·필터.
- **MCP**: `list_events`가 Logs와 같은 `loadEvents`·`parseDateRange`를 지난다 — **`timeZone: "UTC"`를 명시해 넘긴다**(§5). 응답의 시각은 지금처럼 ISO다.
- **공개 셸**: 바뀌지 않는다. changelog·privacy는 `{ uiLocale, timeZone: "UTC" }`를 명시한다.

## 4. 시간대를 읽는 방식

ui-locales §3.1과 같은 이유로(레이아웃·페이지 병렬 렌더 — POSTMORTEM 2026-08-31) **소비자가 직접 묻는다.**

| 소비자 | 읽는 법 |
|---|---|
| 서버 컴포넌트·페이지·Server Action | `await getDateStyle()` — `lib/i18n/server.ts`에 둔다(`getUiLocale` 옆, React `cache`). 입력은 같은 `readSession()`의 `timeZone` → `resolveTimeZone`. 세션 `unavailable`·비로그인이면 `UTC`(화면 표시라 거부가 아니다) |
| 클라이언트 컴포넌트 | `useDateStyle()` — `components/i18n/messages-provider.tsx`의 context 값에 `timeZone`을 더한다. 루트 레이아웃이 `getDateStyle()`의 `timeZone`을 provider prop으로 넘긴다(문자열이라 RSC 경계를 넘는다). provider 없음 → `UTC` |
| `"use client"` 없는 공용 컴포넌트 | 부모가 `style` prop으로 넘긴다(ui-locales와 같은 규칙) |
| `lib/` 순수 모듈 | `style: DateStyle`·`timeZone: TimeZone` 인자. **`getDateStyle()`을 부르지 않는다** — 공유 코어가 스스로 물으면 MCP 응답이 요청자의 시간대를 따라간다(ui-locales B1⑧과 같은 소스 검사에 `getDateStyle`을 더한다) |
| **UTC로 고정되는 표면** | `{ uiLocale, timeZone: "UTC" }`를 **명시**한다 — 공개 셸(`/changelog`·`/privacy`·`components/changelog/**`·`components/privacy/**`) · `/signin/link/:challenge`(세션 없는 흐름 — `utcMonth` 자리) · MCP · 초대 메일 · cron·로그 |

**provider에 더하는 이유(별도 provider가 아닌)**: 클라이언트 날짜 호출부는 이미 `useUiLocale()`을 읽는다 — 둘을 한 훅 `useDateStyle()`이 주면 호출부가 한 줄이다.
`MessagesProvider`의 청크 로직(언어별 운반체·슬롯)은 건드리지 않고 `Inner`의 context 값에 필드 하나만 더한다. ⚠️ 그 파일의 "언어별 껍데기로 자식을 감싸지 않는다" 규칙 그대로 — 시간대가 바뀌어도 트리가 다시 마운트되지 않는다(DOM 테스트로 확인).

**공개 셸 고정의 그물**: 공개 셸 경로(`app/{page,changelog,privacy,docs}/**` · `components/{public-shell,changelog,privacy,landing,docs}/**`)가 `getDateStyle`·`useDateStyle`을 import하지 않는다 — 소스 검사(tasks A4).

## 5. 호출부 (ui-locales E가 언어를 넘긴 자리와 같다 — 착수 때 grep으로 다시 뽑는다)

`git grep -l "utcDay\|utcMinute\|utcMonth"` 2026-10-04 기준 비테스트 18파일 + Logs 경계 3파일:

| 자리 | 바뀌는 것 |
|---|---|
| `components/publish-button.tsx` · `components/translations/sync-lock.tsx` · `components/sources/{source-detail-modal,source-status,sources-archived}.tsx` · `components/logs/{event-row,event-detail}.tsx` · `components/mcp/{token-card,connected-apps-card}.tsx` · `components/members/{invite-modal,pending-invitations}.tsx`(`retryAtLabel`) | `useDateStyle()`/부모 prop → `formatMinute`·`formatDay` |
| `app/(edit)/projects/[slug]/{logs,settings}/page.tsx` · `app/oauth/authorize/page.tsx`(기존 연결일 — 로그인 필수 화면이라 사용자 시간대) | `getDateStyle()` |
| `lib/invitation-email/retry-at.ts` | `retryAtLabel(iso, style)` — 분 올림은 그대로 |
| `lib/events/view.ts`(`groupByDay`) · `lib/events/filter.ts`(`parseDateRange`·프리셋) · `lib/events/query.ts`(`loadEvents`가 `timeZone` 필수 인자) · `components/logs/log-filters.tsx`(프리셋·칩 날짜 라벨) | §2 |
| `lib/mcp/tools/project.ts`(`list_events`) | `loadEvents(…, { timeZone: "UTC" })` 명시 |
| `components/changelog/release-entry.tsx` · `components/privacy/privacy-doc.tsx` · `app/signin/link/[challenge]/page.tsx` | `timeZone: "UTC"` 명시(§4 고정 표면) |
| `lib/sync/plan.ts` 주석 | 이름만(`utcMinute` → `formatMinute`) |

**사전 문구**(en·ko·es — ui-locales 사전 셋): `logs.filters.range.custom`·`customOpen`·`from`·`to`의 `(UTC)`가 **함수**가 된다 — `custom: (zone: string) => \`Custom range (${zone})\``.
호출부는 `offsetLabel(utcOffsetMinutes(now, tz))`를 넘긴다(지금의 오프셋 — 범위 중간에 서머타임이 바뀌어도 라벨은 하나다. 조회 구간은 §2가 날마다 정확히 계산한다).
`changelog.intro`의 `Dates are in UTC.`는 그대로 참이다(공개 셸 고정).

## 6. 화면 — `/preferences` Time zone 카드

- Language 카드 **아래** 둘째 카드. 껍데기·폭·즉시 적용·`busy`·실패 Alert·**닫힌 트리거 typeahead 차단**은 Language 카드와 같다(ui-locales design §5.2) — 그 카드가 쓰는 Select 조립을 그대로 쓴다. ui-locales 구현에서 그 조립이 컴포넌트로 빠져 있지 않고 두 번째 소비자가 이 카드라면, **이 기능에서 공용 컴포넌트로 뽑고 Language 카드를 같은 배치에서 이관한다**(CLAUDE.md "실재하는 손 사본을 같은 배치에서 새 프리미티브로").
- 본문: `Select` 하나, 옵션은 `timeZoneOptions(now)`(§2). 국기·아이콘 없음. 옵션 42개라 열린 목록은 **높이 상한 + 스크롤**(Radix `SelectContent`의 기본 동작 — 새 스타일을 만들지 않는다).
- 도움말 한 줄(Select 아래): 기본이 UTC라는 것과 **공개 페이지는 UTC로 남는다**는 것. 예: `Dates and times in projects use this time zone. Public pages stay in UTC.`
- 지금 값과 같은 값을 고르면 요청하지 않는다. 낙관적 표시 → 실패면 복귀.
- **시안**: 새 페이지가 아니라 기존 페이지에 카드 하나를 같은 형으로 더하는 것이라 Claude Design 핸드오프·`/design-sync`를 두지 않는다(CLAUDE.md — `/design-sync`는 신규 페이지 초기 구현 전용). 카드 형은 DESIGN의 Preferences 절(ui-locales H2가 올린다)을 따른다. 사용자가 시안을 원하면 tasks S로 넣는다(확인 필요 목록).

### 6.1 `setTimeZone` Server Action

- 위치 `app/(edit)/preferences/actions.ts` — 로그인 전용이라 보호 경로 아래가 맞다(`setUiLocale`이 `app/ui-locale/`에 있는 이유는 공개 푸터였다 — 여기엔 해당 없다).
- 입력 `timeZone` 하나. `parseTimeZone`을 못 지나면 아무것도 안 쓰고 `invalid`.
- `requireUser` 대신 `readSession()`이 `ok`가 아니면 `failed`(ui-locales `setUiLocale`과 같은 형 — Action은 redirect하지 않고 코드를 돌려준다). **세션의 `userId`로** `User.timeZone`을 쓴다(입력에 userId 없음).
- 성공 뒤 `revalidateAfterCommit` + `("/", "layout")` — 루트 레이아웃이 provider에 시간대를 싣는다. 실패는 revalidate하지 않는 갈래에서만 돌려준다.
- `ProjectEvent`를 남기지 않는다. 쿠키를 쓰지 않는다.
- **UTC를 고르면 `"UTC"`를 저장한다**(null로 되돌리지 않는다) — 판정 결과가 같고, "고른 적 있음"을 지우는 갈래를 하나 덜 만든다.

## 7. 스키마 — additive

```prisma
model User {
  // …
  /// 보는 사람의 시간대(user-timezone) — 절대 날짜·시각과 Logs 날짜 경계. null = 고르지 않음 → UTC.
  /// **읽을 때 `parseTimeZone`을 지난다**(선별 목록 밖 값은 UTC). enum이 아닌 이유는 `uiLocale`과 같다 — 목록에서 빼는 것이 destructive가 되면 안 된다.
  /// ⚠️ **봉투를 지나지 않는다** — 사람을 식별하는 값이 아니다(`uiLocale`과 같다). 대략의 지역을 말하므로 방침에는 적는다.
  timeZone String?
}
```

- 마이그레이션 1개(`ALTER TABLE "User" ADD COLUMN "timeZone" TEXT`) — 배포를 쪼개지 않는다. dev는 `/push` 전(`/db`), prod는 `/merge` 1단계. 마이그레이션 뒤 dev·prod `has_schema_privilege` false 확인.
- 세션: `lib/auth/public-session.ts` 허용 목록에 `timeZone` — 추가 쿼리 0(`getSessionAndUser`가 User 행을 돌려준다). 타입 넷은 ui-locales C2가 `uiLocale`을 넓힌 자리 그대로(`publicSession` 입력 · `AdapterUser` · `types/next-auth.d.ts` · `SessionRead` ok 갈래). `/api/auth/session` 본문에 `timeZone`이 실린다.

## 8. 개인정보 방침

- `lib/privacy/collected.ts`: `"User.timeZone": "collected"`(`Record<FieldPath, …>`라 안 하면 typecheck red).
- 본문 **en·ko 두 벌**(ui-locales 이후의 상태 — `messages/en.tsx` 방침 절 + `messages/ko-privacy.tsx`): 수집 항목에 "고른 시간대 — 날짜·시각 표시용" + 개정 이력 한 줄 + 시행일. 두 본문 동형 검사가 한쪽만 고치면 막는다.
- **새 쿠키·새 전송처 없음.** `/push` 4단계 개인정보 점검의 "새 목적"(표시 시간대)에 해당한다.

## 9. 새 환경변수

없다.

## 10. 불변식 영향

- **export 결정성·blob SHA(ARCHITECTURE §1·2)**: 영향 없다. 날짜 문장은 화면에서만 조립되고 파일·PR·커밋·`ProjectEvent`에 들어가지 않는다. `ProjectEvent.occurredAt`은 계속 UTC `timestamptz`다.
- **인증 경계(§6·§8)**: `setTimeZone`은 세션 userId만 쓴다. `/preferences`는 ui-locales가 세운 `isProtectedPath` + `requireUser` 두 층 그대로.
- **MCP 쿠키·세션 비사용(§6.45)**: 공유 코어가 `getDateStyle`을 부르지 않고 MCP가 `"UTC"`를 명시한다 — 소스 검사.
- **잎 명부**: `lib/time-zone/zones.ts` 추가, `lib/utc-time.ts` → `lib/date-format.ts` 개명(ARCHITECTURE 잎 명부·`client-graph.test.ts` `CLIENT_LIB_FILES`).
- **CSP·Analytics**: 바뀌지 않는다.

## 11. 소환한 과거 함정 (POSTMORTEM)

| 일자 | 무엇 | 이 설계에서 |
|---|---|---|
| 2026-08-31 | 레이아웃과 페이지가 병렬로 렌더된다 | 시간대도 소비자마다 `getDateStyle()`(요청 `cache`) — §4 |
| 2026-09-19 계열(`lib/events/filter.ts` 주석) | `new Date(y, m, d)` 로컬 자정으로 KST 하루가 9시간 어긋났다 | 런타임 TZ를 읽는 API를 쓰지 않는다 — 구간은 `startOfDay(day, 명시 tz)` — §2 |
| 2026-09-20 | 라벨 없는 `toLocaleDateString` 날짜 | 시각엔 오프셋 라벨, `toLocale*` grep 0 유지, `Intl.DateTimeFormat`은 `lib/date-format.ts`에서만(소스 검사) — §0 |
| 2026-09-07 · 09-08 | `revalidatePath`가 결과 문구를 씻었다 | 성공 시 돌려줄 문구가 없고 성공 토스트도 없다 — §6.1 |
| 2026-09-08 (code-review) | `DICT[key] ?? fallback`이 프로토타입 키에서 값을 돌려줬다 | `parseTimeZone`은 `Object.hasOwn` — §2 |
| 2026-09-19 | 꺼진 Radix Select가 열렸다 · 닫힌 트리거 typeahead | Language 카드의 가드 그대로 — §6 |
| 2026-09-20 | 커밋 뒤 캐시 오류가 전체 실패로 보고됐다 | `revalidateAfterCommit` — §6.1 |
| 2026-09-07 | `key`로 트리를 갈아 끼워 포커스·상태가 사라졌다 | provider 값에 필드만 더하고 `key`를 걸지 않는다 — §4 |
