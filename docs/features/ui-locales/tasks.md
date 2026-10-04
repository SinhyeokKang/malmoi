# ui-locales — 태스크

순서: 순수 함수 → 사전 → 스키마 → 서버·클라이언트 입구 → 소비자 이행 → 화면 → 문서.
`[커밋]` 표시가 커밋 경계다. 배치마다 `pnpm gate`를 green으로 유지한다.

## A. 순수 함수 (`/tdd interface` 대상)

- [ ] **A1** `lib/i18n/locales.ts`(잎) — `UI_LOCALES`·`UiLocale`·`parseUiLocale`·`resolveUiLocale`·`planUiLocaleWrite`·`UI_LOCALE_NAMES`.
  테스트: 지원 값 셋 통과 · `fr`·`""`·`__proto__`·`constructor`·`toString`·`EN`·숫자·`null` 거부 · account>cookie>en 여섯 조합 · 쓰기 계획 2갈래.
  검증: `pnpm test` green, `client-graph.test.ts` green(잎 유지).
- [ ] **A2** `Widen<T>`와 `type Messages` — `expectTypeOf`로 리터럴이 `string`으로 넓어지고 함수 시그니처·중첩 키가 보존되는지 고정.
  검증: `pnpm typecheck` green.
- [ ] **A3** `utcDay`·`utcMinute`·`utcMonth`에 `locale` 인자 — 세 언어 × 세 함수 기댓값 표, `UTC` 표기 유지, 자정·월말 경계. 기존 호출부는 `"en"`을 넘겨 출력이 같다.
  검증: `pnpm test` green, `Intl.DateTimeFormat`·`toLocaleDateString` grep 0.
- [ ] **A4** `relativeTime(then, now, locale)` — 세 언어의 초·분·시간·일 경계. 기존 호출부는 `"en"`.
  검증: `pnpm test` green.
- [ ] `[커밋] feat(i18n): add UI locale resolution and locale-aware date helpers`

## B. 사전

- [ ] **B1** 정합성 테스트 먼저(red로 시작): ①en과 같은 문자열은 허용 목록에만 ②함수 값은 대표 인자로 호출해 비교 ③빈 문자열 금지 ④`brand-spelling`을 사전 셋으로 확장
  ⑤`no-korean-ui`에서 `messages/ko.tsx` **한 파일만** 예외 ⑥`@/messages/ko`·`@/messages/es`를 정적 import하는 파일은 `lib/i18n/load.ts`뿐(소스 검사)
  ⑦`lib/pull/**`·`lib/push/**`가 사전을 import하지 않는다(소스 검사 — design §10).
  검증: ①~③은 ko·es가 없어 red, 나머지 green.
- [ ] **B2** DESIGN §10에 ko·es 문체 규칙(ko 합니다체 · es tú)과 용어집(design §6 — 확정)을 올린다.
- [ ] **B3** `messages/ko.tsx` (`satisfies Messages`) — 에이전트 초안 → 사용자 검수.
  검증: `pnpm typecheck` green(키·시그니처 정합), B1 ①~③ ko 쪽 green.
- [ ] `[커밋] feat(i18n): add Korean dictionary`
- [ ] **B4** `messages/es.tsx` — 에이전트 초안 그대로(원어민 검수 없음, 사용자 확정).
  검증: 같은 두 게이트.
- [ ] `[커밋] feat(i18n): add Spanish dictionary`

## C. 스키마 (`/db`)

- [ ] **C1** `User.uiLocale String?` + 마이그레이션(`--create-only`로 SQL을 눈으로 본 뒤 dev 적용). `lib/privacy/collected.ts`에 등재(안 하면 typecheck가 red).
  검증: `pnpm db:status` 깨끗함, dev `has_schema_privilege` false, `pnpm typecheck` green.
- [ ] **C2** `lib/auth/public-session.ts` 허용 목록에 `uiLocale` → `readSession()`의 `ok` 갈래에 `uiLocale` 추가.
  검증: 기존 세션 테스트 + 새 케이스 green. 로컬에서 `/api/auth/session` 본문에 값이 보임.
- [ ] `[커밋] feat(db): add User.uiLocale` (스키마 + 마이그레이션만 — `/db` 규칙)

## D. 입구 (서버·클라이언트)

- [ ] **D1** `lib/i18n/load.ts` — `loadMessages(locale)`: en 정적, ko·es 동적 import, 언어별 Promise 하나. 테스트: 같은 언어에 같은 Promise, 세 언어 resolve.
- [ ] **D2** `lib/i18n/server.ts`(`server-only`) — `getUiLocale()`(React `cache`, `readSession` + `cookies()` → `resolveUiLocale`) · `getMessages()`.
  테스트: `next/headers`·`readSession`을 mock해 세 층 판정, 세션 `unavailable`이면 쿠키 → en.
- [ ] **D3** `components/i18n/messages-provider.tsx` — `MessagesProvider`(`use(loadMessages(uiLocale))`) · `useMessages()`(provider 없으면 en). DOM 테스트: provider 없음 → en, ko provider → ko 문자열.
- [ ] **D4** 루트 레이아웃: `<html lang={uiLocale}>` + provider. **`m`은 en 별칭으로 남긴다.** 테스트: 레이아웃이 provider를 렌더한다.
  검증: `pnpm gate` green. 쿠키 `malmoi-ui-locale=ko`를 손으로 심으면 `lang="ko"`.
- [ ] `[커밋] feat(i18n): request-scoped messages for server and client`

## E. 소비자 이행 (배치마다 `pnpm gate` green + 커밋)

각 배치: 서버는 `await getMessages()`, 클라이언트는 `useMessages()`, `lib/`는 `m: Messages` 인자. 날짜·상대 시각 호출부(31곳)는 같은 배치에서 언어를 넘긴다.

- [ ] **E1** 영어 고정 표면을 `en` 명시 import로: `lib/mcp/**` · `lib/invitation-email/**` · `lib/seo/**` · `app/global-error.tsx`. `[커밋]`
- [ ] **E2** `lib/` 문구 모듈 — 최상위 상수 12곳을 함수로 + 나머지 `m` 인자화. 단위 테스트는 en을 넘겨 기존 기댓값 유지. `[커밋]`
- [ ] **E3** 공개 셸·인증: `app/page.tsx`·`signin`·`invite`·`oauth/authorize`·`docs`·`changelog`·`privacy`·`not-found`·`error` + `components/public-shell`·`signin`·`landing`·`docs`·`changelog`·`privacy`·`oauth`. `[커밋]`
- [ ] **E4** 앱 셸·프로젝트 목록·온보딩·검색: `components/shell`·`projects`·`onboarding`·`search` + `lib/shell/nav.ts`·`lib/search/**`. `[커밋]`
- [ ] **E5** 프로젝트 화면: Home·Sources·Translations·Members·Logs·Settings(`app/(edit)/projects/**` + 해당 `components/**`). `[커밋]`
- [ ] **E6** 계정·MCP 화면·`components/ui`(사전을 읽는 프리미티브 8곳) + Server Action들의 반환 문구. `[커밋]`
- [ ] **E7** **`export { en as m }` 삭제.** 검증: `pnpm typecheck` green = 옮기지 않은 소비자 0. `[커밋] refactor(i18n): remove the static m export`
- [ ] **E8** 번들 실측: `pnpm build` 뒤 `.next/static/chunks`에서 en 페이지의 사전 청크 크기를 이 기능 전과 비교(gzip +2KB 이내), ko·es 청크가 별도이고 en 페이지 manifest에 걸리지 않는지 확인. 수치를 PR 본문에 남긴다.

## S. 시안 (F2·G2 전에 — `/design-sync` 입력)

- [ ] **S1** `design-brief.md`로 Claude Design 핸드오프를 만든다(사용자). 아트보드 목록·상태는 브리프 §4가 정본이다.
- [ ] **S2** 핸드오프가 브리프의 결정(즉시 적용·토스트 없음·DropdownMenu 라디오)과 어긋나면 design.md를 먼저 고친다 — 시안이 결정을 뒤집으면 그것은 변경 요청이다.
  검증: 핸드오프 경로를 design.md §5에 기록.

## F. 언어 바꾸기

- [ ] **F1** `app/locale/actions.ts` — `setUiLocale`. 테스트: 잘못된 값이면 아무것도 안 씀 · 비로그인이면 쿠키만 · 로그인이면 쿠키 + 세션 userId의 계정 · 세션 `unavailable`이면 쿠키만 + 그 사실 반환 · 쿠키 속성(httpOnly·SameSite=Lax·Path=/·1년).
- [ ] **F2** `LocaleSwitcher`(핸드오프 기준 — 기본안은 텍스트 버튼 + `DropdownMenu` 라디오) → `PublicFooter`·`AuthLayout`. DOM 테스트: 현재 언어 endonym 표시, 고르면 Action 호출, 진행 중 비활성.
  검증: 로컬 브라우저에서 `/`·`/signin`·`/docs`가 ko·es로 바뀌고 새로고침해도 유지, 첫 화면에 영어가 비치지 않음.
- [ ] `[커밋] feat(i18n): language switcher in the public footer`

## G. `/preferences`

- [ ] **G1** `routes.preferences()` · `isProtectedPath`에 정규식 1줄 · robots `disallow` 추가 · `navWorkItems`에 `Account` 다음 항목(사이드바·사용자 메뉴 공통) · 검색 `Pages` 행. 테스트: 보호 경로 표에 `/preferences`·`.rsc`·`_next/data` 변형 추가, robots 테스트 갱신.
- [ ] **G2** `app/(edit)/preferences/{page,loading}.tsx` — 핸드오프 기준. `requireUser` + Language 카드(`Select` + 설명, 고르는 즉시 `setUiLocale`, 진행 중 비활성, 실패는 카드 Alert).
  검증: 로컬에서 es 선택 → 앱 전체 es, 다른 브라우저로 로그인해도 es, 로그아웃 뒤 그 기기는 마지막 값.
- [ ] **G3** `/design-sync` — 푸터 스위처·Preferences를 핸드오프와 프레임 단위로 대조(computed style + 접근성 트리).
- [ ] `[커밋] feat(preferences): add the Preferences page with language`

## H. 방침·문서

- [ ] **H1** `/privacy` 본문: 쿠키 문장 수정 + 쿠키 표 1줄 + `User.uiLocale` + 개정 이력·시행일. 검증: `policy-gate.test.tsx` green. 방침 본문이 `messages/en.tsx`에 있으므로 `[커밋] feat(privacy): disclose the UI language cookie`로 코드 커밋한다.
- [ ] **H2** 정본 갱신(문서별 별도 커밋, `/implement`·`/push` 신선도 단계에서):
  - PRODUCT — §10 "UI를 ko로 여는 시점" 해소(결정·폴백 순서) · §4.1에 화면 언어 · §7.7 IA에 `/preferences` · "소비자의 import 자리는 안 바뀐다" 정정.
  - ARCHITECTURE — "화면 문구는 영어 단일" 줄 교체(§3 입구 · 영어 고정 표면 목록 · 청크 규칙) · 잎 명부에 `lib/i18n/locales.ts` · 스키마 절에 `User.uiLocale`.
  - DESIGN — §10 ko·es 문체·용어집 · Preferences 화면 · 푸터 스위처.
  - DIRECTORY — `app/locale/` · `app/(edit)/preferences/` · `components/i18n/` · `messages/ko.tsx`·`es.tsx`.
  - CLAUDE.md — 코드 컨벤션 "화면 문구는 `messages/en.tsx`를 지난다" → 사전 셋 + `getMessages`/`useMessages` + `no-korean-ui` 예외 한 파일. 데이터 변경 경로 표에 `setUiLocale` 행. (미러 재생성은 훅이 한다)
  - README — 지원 화면 언어 en·ko·es.
- [ ] **H3** 가이드: `/guide`로 Preferences·언어 변경 페이지(en) + `/guide-shots`.
- [ ] **H4** `/runtime-test`: ko·es로 전 화면 순회 — 긴 es 문장의 넘침·잘림, ko 줄바꿈, 날짜·상대 시각 표기, 토스트 언어.
- [ ] 끝나면 결론을 정본으로 올리고 `docs/features/ui-locales/`를 지운다.
