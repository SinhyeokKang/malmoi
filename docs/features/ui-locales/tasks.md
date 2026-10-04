# ui-locales — 태스크

> 2026-10-05 상태: H5(prod 반영, `/merge` 1단계)와 ko 원고 셋(사전·가이드·방침) 사용자 일괄 검수(orch D1), feature 디렉터리 정리만 남았다. 진행 기록은 orch.md.

순서: 기준선 → 순수 함수 → 사전 → 스키마 → 서버·클라이언트 입구 → 소비자 이행 → 화면 → 문서.
`[커밋]` 표시가 커밋 경계다. **모든 커밋에서 `pnpm gate`가 green이다** — red 테스트를 먼저 박는 태스크도 그 커밋 안에서 green으로 끝난다.
`[수동]` 표시는 jsdom·typecheck로 판정할 수 없는 항목이고, 전부 H4(`/runtime-test`) 체크리스트로 모은다.

## 0. 기준선

- [x] **A0** 착수 전 dev SHA에서 `pnpm build` → en 사전이 든 청크를 **client-reference-manifest의 청크 이름으로** 특정하고 그 gzip 크기와 측정 명령을 이 파일 아래에 기록한다(grep 패턴으로 재지 않는다 — POSTMORTEM 2026-09-07). `[수동]`
  검증: 수치·명령·SHA가 기록돼 있다. E8이 같은 명령으로 비교한다.

## A. 순수 함수 (`/tdd interface` 대상)

- [x] **A1** `lib/i18n/locales.ts`(잎) — `UI_LOCALES`·`UiLocale`·`parseUiLocale`·`resolveUiLocale`·`planUiLocaleWrite`·`UI_LOCALE_NAMES`.
  테스트: 지원 값 셋 통과 · `fr`·`""`·`__proto__`·`constructor`·`toString`·`EN`·숫자·`null` 거부 · account>cookie>en 여섯 조합 · 쓰기 계획 2갈래.
  검증: `pnpm test` green. `client-graph.test.ts`의 `lib/i18n` 도달 목록(`:373-380`)·`CLIENT_LIB_FILES`(`:96`·`:536`)에 `locales.ts`를 등재하고 green.
- [x] **A2** `type Messages` — 먼저 `messages/en.tsx:3840`의 바깥 `as const`를 지울 수 있는지 본다(안쪽 `:470`·`:489`만 리터럴이 필요한가). 안 되면 `Widen<T>`(문자열·배열·객체만 재귀, 함수 값은 그대로).
  영어 고정 네임스페이스(`mcp`·`seo`·초대 메일·`crash`·방침 본문 — 정확한 키는 en 최상위 절로 확정)를 `Omit`으로 뺀다. `expectTypeOf`로 리터럴이 `string`으로 넓어지고 함수 시그니처·중첩 키가 보존되며 빠진 네임스페이스가 없음을 고정.
  검증: `pnpm typecheck` green.
- [x] **A3** `utcDay`·`utcMinute`·`utcMonth`에 `locale` 인자 — 세 언어 × 세 함수 기댓값 표, `UTC` 표기 유지, 자정·월말 경계. 기존 호출부는 `"en"`을 넘겨 출력이 같다.
  기존 테스트 갱신 대상: `lib/__tests__/utc-time.test.ts:17-33` · `utc-time-consumers.test.ts`(소스 패턴 검사) · `lib/keys/__tests__/view.test.ts:54-77`.
  검증: `pnpm test` green, `toLocaleDateString`·`toLocaleTimeString`·`Intl.DateTimeFormat` grep 0(`__tests__` 제외).
- [x] **A4** `relativeTime(then, now, locale)` — 세 언어의 초·분·시간·일 경계. 기존 호출부는 `"en"`. 언어명 `lib/onboarding/language-name.ts`에 `uiLocale` 인자(`Intl.DisplayNames([uiLocale])`) — 세 언어 기댓값.
  검증: `pnpm test` green.
- [x] `[커밋] feat(i18n): add UI locale resolution and locale-aware date helpers`

## B. 사전

- [x] **B1** 정합성 테스트 — **검사 대상은 "존재하는 사전"이다**(ko만 있으면 ko만, 둘 다 있으면 둘 다). 사전이 하나도 없는 이 커밋에서는 대상이 비어 green이다.
  ①en과 같은 문자열은 허용 목록(**키 경로** 기준)에만 ②함수 값은 대표 인자로 호출해 비교 — 대표 인자 표는 `Record<FunctionPaths<Messages>, Parameters<…>>`로 타입을 걸고 JSX 반환은 `renderToStaticMarkup`으로 비교 ③빈 문자열 금지
  ④용어 일관성 — design §6 용어집(DESIGN §10.1 ko·es 열)의 "쓰지 않는 말" 0건, 금지어·링크↔버튼 이름 검사를 사전 셋으로 확장
  ⑥`@/messages/ko`·`@/messages/es`를 import(정적·동적 불문)하는 비테스트 소스는 각 언어의 provider 파일뿐이고 `@/messages/ko-privacy`는 `/privacy` 페이지뿐(소스 검사 — 사전 정합성 테스트 파일은 예외)
  ⑦`lib/pull/**`·`lib/push/**`가 사전을 import하지 않는다(소스 검사 — design §10. **B1′ 뒤에야 green이다**)
  ⑧`lib/mcp/**`·`lib/invitation-email/**`·`lib/seo/**`가 `getMessages`·`useMessages`를 import하지 않고, `lib/**` 전체가 `lib/i18n/server`를 import하지 않는다(소스 검사 — 공유 코어는 `m`을 인자로만 받는다).
  (`brand-spelling.test.ts`는 이미 `messages/` 전체를 보므로 바꿀 것이 없다.)
  검증: `pnpm test` green.
- [x] **B1′** `lib/pull/run.ts:277`의 경고를 코드로 — `PullOutcome.warnings`가 `{ surfaceSlug, path, code }`를 싣고, Publish 모달(`components/publish-button.tsx:555`)은 화면에서 조립, cron JSON·`console.warn`(`lib/pull/trigger.ts:53`)은 `en`으로 조립. `summarizeCandidates`의 `label`(`app/(edit)/projects/actions.ts:563` · `lib/onboarding/detect.ts:67`)도 코드로.
  테스트: `run`·`trigger`·onboarding 기존 테스트를 코드 기댓값으로 갱신 + 화면 조립 함수 단위 테스트.
  검증: `pnpm test` green(B1⑦ 포함).
- [x] `[커밋] refactor(pull): carry warning codes instead of sentences`(B1′ — **먼저** 커밋) → `[커밋] test(i18n): dictionary consistency checks`(B1)
- [x] **B2** DESIGN §10에 ko·es 문체 규칙(ko 합니다체 · es tú)과 §10.1 개념 표의 ko·es 열(쓰는 말 · 쓰지 않는 말 — design §6 용어집이 시작점)을 올린다. Preferences 즉시 적용 Select 예외를 §6.4에 등재.
  검증: B1④가 읽는 표가 DESIGN과 같은 값이다(테스트가 표를 들고 있으면 DESIGN 행과 대조).
- [x] **B3** `messages/ko.tsx` (`satisfies Messages`) — 에이전트 초안 → 사용자 검수. 검수는 en 최상위 절(약 30개) 단위 하위 체크리스트로 나누고 커밋은 하나다.
  같은 커밋에서 `no-korean-ui.test.ts` 허용 목록에 `messages/ko.tsx` **한 파일만** 추가한다 — 그 테스트는 목록의 파일이 실제로 한글을 담는지도 보므로(`:130-141`) 사전보다 먼저 넣으면 red다.
  검증: `pnpm typecheck` green(키·시그니처 정합), B1 ①~④ ko 쪽 green.
- [x] `[커밋] feat(i18n): add Korean dictionary`
- [x] **B4** `messages/es.tsx` — 에이전트 초안 그대로(원어민 검수 없음, 사용자 확정).
  검증: 같은 두 게이트(B1이 es를 대상으로 넣는다).
- [x] `[커밋] feat(i18n): add Spanish dictionary`

## C. 스키마 (`/db`)

- [x] **C1** `User.uiLocale String?` + 마이그레이션(`--create-only`로 SQL을 눈으로 본 뒤 dev 적용). `lib/privacy/collected.ts`에 등재(`Record<FieldPath, …>`라 안 하면 typecheck가 red).
  검증: `pnpm db:status` 깨끗함, dev `has_schema_privilege` false, `pnpm typecheck` green.
- [x] `[커밋] feat(db): add User.uiLocale` (스키마 + 마이그레이션 + `collected.ts` — typecheck가 셋을 한 커밋으로 묶는다)
- [x] **C2** `readSession()`의 `ok` 갈래에 `uiLocale` — 타입 넷: `publicSession` 입력(`lib/auth/public-session.ts:21`) · `AdapterUser` · `types/next-auth.d.ts`의 `Session.user` · `SessionRead`(`lib/auth/read-session.ts:21`).
  검증: `read-session.test.ts:30`(`toEqual`) 갱신 + 새 케이스 green. 로컬에서 `/api/auth/session` 본문에 값이 보임 `[수동]`.
- [x] `[커밋] feat(auth): expose uiLocale on the session`

## D. 입구 (서버·클라이언트)

- [x] **D1** 언어별 provider 셋 — `components/i18n/{en,ko,es}-messages-provider.tsx`(`"use client"`, 각자 자기 사전 하나만 정적 import) + 공용 `components/i18n/messages-provider.tsx`(context · `useMessages()` · `useUiLocale()`, provider 없으면 en). 세 provider는 같은 내부 컴포넌트에 사전만 다르게 넘기는 껍데기다(design §4).
  DOM 테스트: provider 없음 → en · ko provider → ko 문자열과 `useUiLocale()==="ko"` · provider를 en→ko로 바꿔 렌더해도 자식 상태·포커스가 유지된다(재마운트 없음).
  `components/__tests__/helpers/dom.tsx`의 `render`에 `{ uiLocale }` 옵션 하나를 더한다.
- [x] **D2** `lib/i18n/server.ts`(`server-only`) — `getUiLocale()`(React `cache`, `readSession` + `cookies()` → `resolveUiLocale`) · `getMessages()`.
  테스트: `next/headers`·`readSession`을 mock해 세 층 판정, 세션 `unavailable`이면 쿠키 → en.
- [x] **D3** 루트 레이아웃: `<html lang={uiLocale}>` + 언어별 provider 하나. **`m`은 en 별칭으로 남긴다.**
  테스트: async 루트 레이아웃은 jsdom 렌더가 어려우므로 **소스 검사**로 "레이아웃이 `getUiLocale`을 읽고 provider를 렌더한다"를 고정.
  검증: `pnpm gate` green. 쿠키 `malmoi-ui-locale=ko`를 손으로 심으면 `lang="ko"` `[수동]`.
- [x] `[커밋] feat(i18n): request-scoped messages for server and client`

## E. 소비자 이행 (배치마다 `pnpm gate` green + 커밋)

각 배치: 서버는 `await getMessages()`, 클라이언트는 `useMessages()`·`useUiLocale()`, `lib/`는 `m: Messages` 인자, `"use client"` 없는 공용 컴포넌트는 부모가 prop으로.
날짜·상대 시각·언어명 호출부(27개 파일 44곳)는 같은 배치에서 언어를 넘긴다.
**배치마다 검증 줄: `pnpm gate` green + `git grep -l "import { m\b\|import { m," <배치 경로>` = 0** — 별칭이 남아 있는 동안 gate green만으로는 옮겼다는 증명이 안 된다.

- [x] **E1** 영어 고정 표면을 `en` 명시 import로: `lib/mcp/**` · `lib/invitation-email/**` · `lib/seo/**` · `app/global-error.tsx` · 정적 `metadata` 8곳(`app/layout.tsx:30-34` 등) · `scripts/push-local.ts`·`ingest.ts`·`guide-check.ts` ·
  **`m`을 import하는 테스트 133개 파일**(DOM 91 포함)과 `lib/i18n/__tests__/terminology.test.ts:13`·`lib/guide/__tests__/content.test.ts`·`lib/privacy/__tests__/policy-gate.test.tsx` — 기계 전환.
  검증: 위 공통 줄 + `git grep -l "from \"@/lib/i18n\"" -- '*__tests__*' scripts` 중 `m`을 쓰는 파일 0. `[커밋]`
- [x] **E2** `lib/` 문구 모듈 — 최상위 상수(design §3.2 전수 목록)를 함수로 + 나머지 `m` 인자화. 단위 테스트는 en을 넘겨 기존 기댓값 유지. `[커밋]`
- [x] **E3** 공개 셸·인증: `app/page.tsx`·`signin`·`signin/link`·`invite`·`oauth/authorize`·`docs`·`changelog`·`privacy`·`not-found`·`error` + `components/public-shell`·`signin`·`landing`·`docs`·`changelog`·`privacy`·`oauth` + `lib/links.ts`(푸터 라벨). `[커밋]`
- [x] **E4** 앱 셸·프로젝트 목록·온보딩·검색: `components/shell`·`projects`·`onboarding`·`search` + `lib/shell/nav.ts`·`lib/search/**`. `[커밋]`
- [x] **E5** 프로젝트 화면: Home·Sources·Translations·Members·Logs·Settings(`app/(edit)/projects/**` + 해당 `components/**`). `[커밋]`
- [x] **E6** 계정·MCP 화면·`components/ui`(사전을 읽는 프리미티브 8곳). `[커밋]`
- [x] **E7** **`export { en as m }` 삭제.** 검증: `pnpm typecheck` green = 옮기지 않은 소비자 0. `[커밋] refactor(i18n): remove the static m export`
- [x] **E8** 번들 실측: A0과 같은 명령으로 en 페이지 사전 청크 gzip이 +2KB 이내, ko·es 청크가 별도이고 en 페이지 manifest에 걸리지 않음(청크 이름으로). 수치를 PR 본문에 남긴다. `[수동]`

## S. 시안 (F2·G2 전에 — `/design-sync` 입력)

- [x] **S1** `design-brief.md`로 Claude Design 핸드오프를 만든다(사용자). 아트보드 목록·상태는 브리프 §4가 정본이다.
- [x] **S2** 핸드오프가 브리프의 결정(즉시 적용·성공 토스트 없음·`DropdownMenuItem selected`·`busy` 진행 표시)과 어긋나면 design.md를 먼저 고친다 — 시안이 결정을 뒤집으면 그것은 변경 요청이다.
  검증: 핸드오프 경로를 design.md §5에 기록. ✅ 2026-10-04 — <https://claude.ai/design/p/b99d54cd-3034-44f1-8446-0a864da9d767?file=UI+Locales.dc.html> (`design_handoff_ui_locales/`), 차이는 design §5.1·§5.2에 반영.

## F. 언어 바꾸기 + 방침 (한 커밋 — 쿠키가 생기는 커밋에서 방침이 참이어야 한다)

- [x] **F1** `app/ui-locale/actions.ts` — `setUiLocale`. 테스트:
  잘못된 값이면 아무것도 안 씀(`invalid`) · 비로그인이면 쿠키만 · 로그인이면 세션 userId의 계정 → 쿠키 순 · 세션 `unavailable`이면 아무것도 안 씀(`failed`) · 로그인 중 User 갱신 실패(행 없음·DB 오류)면 쿠키도 안 씀(`failed`) ·
  **성공 갈래에서만** `revalidateAfterCommit` 호출 · 쿠키 속성(httpOnly·SameSite=Lax·Secure(https)·Path=/·1년).
- [x] **F2a** `components/ui/text-trigger.tsx`(`TextTrigger`, design §5.1 계약) — 테스트 먼저: 13/400 muted · 글리프 슬롯 · `busy`면 `aria-disabled`·`aria-busy`이고 클릭이 안 먹으며 포커스 유지 · `asChild` 트리거로 ref 전달. `focus-ring.test.ts` 프리미티브 표·`label-weight.test.ts`에 등재.
- [x] **F2** `LocaleSwitcher`(`TextTrigger` + `DropdownMenu`, design §5.1) → `PublicFooter`·`AuthLayout`. 국기 매핑 상수(en GB · ko KR · es ES) 단위 테스트. DOM 테스트(포커스 fixup observer 포함):
  현재 언어 endonym 표시 · 메뉴 항목에 국기 + `lang={code}` · 같은 값을 고르면 Action을 부르지 않음 · 접근 이름 "Language: English" · 고르면 Action 호출 · 진행 중 `aria-busy`·`aria-disabled`이고 **포커스가 트리거에 남는다** · 실패면 오류 토스트.
  검증: 로컬 브라우저에서 `/`·`/signin`·`/docs`가 ko·es로 바뀌고 새로고침해도 유지, 첫 화면에 영어가 비치지 않음 `[수동]`.
- [x] **H1** `/privacy` en 본문(`messages/en.tsx`의 방침 절): "Every cookie Malmoi sets is needed to …" 문장 수정 + 쿠키 표 1줄 + `User.uiLocale` + 개정 이력·시행일.
  검증: `policy-gate.test.tsx` green.
- [x] **H1k** ko 방침 `messages/ko-privacy.tsx` — H1을 반영한 en 본문의 번역(에이전트 초안 → **사용자 검수 필수**) + `/privacy`가 ko 화면에서만 ko 본문 + `no-korean-ui` 허용 목록에 이 파일 추가 + 두 본문 동형 검사(design §8).
  테스트: 동형 검사 · `policy-gate`를 ko 본문에도 · 페이지 선택(ko→ko, en·es→en) · `ko-privacy` import는 `/privacy` 페이지뿐.
  검증: `pnpm test` green. ⚠️ 이 커밋 시점에 ko UI가 이미 있어야 의미가 있으므로 B3 뒤다 — F 커밋에 함께 넣어 쿠키 고지가 두 본문에서 동시에 참이 되게 한다.
- [x] **F3** `app/globals.css`에 `:lang(ko) { word-break: keep-all; overflow-wrap: anywhere; }`. 검증: `globals-css.test.ts`에 규칙 고정, green.
- [x] `[커밋] feat(i18n): language switcher in the public footer and disclose the UI language cookie`

## G. `/preferences`

- [x] **G1** `routes.preferences()` · `isProtectedPath`에 정규식 1줄 · robots `disallow`(`lib/seo/crawl.ts:19` — 별도 목록) · `navWorkItems`에 `MCP connector`와 `Account` 사이 항목(`SlidersHorizontal`, exact, 사이드바·사용자 메뉴·랜딩 목업 LNB 공통 — 검색 `Pages` 행은 자동).
  테스트: 보호 경로 표에 `/preferences`·`.rsc`·`_next/data` 변형 추가, robots 테스트 갱신, nav 목록 테스트 갱신.
- [x] **G2** `app/(edit)/preferences/{page,loading}.tsx` — 핸드오프 기준. `requireUser` + Language 카드(design §5.2).
  DOM 테스트(포커스 fixup observer 포함): `aria-labelledby`·`aria-describedby` · 옵션 `lang` · 고르면 Action 호출 · 옵션·트리거 값에 국기 · 진행 중 `RoleSelect` 가드이고 고른 값을 먼저 보이며 포커스 유지 · 실패면 원래 값으로 복귀 · 같은 값이면 Action을 부르지 않음 · **닫힌 트리거에서 글자 키로 값이 바뀌지 않는다** · 실패면 카드 `notice`의 `Alert danger inset`.
  검증: 로컬에서 es 선택 → 앱 전체 es, 다른 브라우저로 로그인해도 es, 로그아웃 뒤 그 기기는 마지막 값 `[수동]`. revalidate 뒤 Alert 유지 여부는 jsdom이 못 본다 → H4 `[수동]`.
- [x] **G3** `/design-sync` — 푸터 스위처·Preferences를 핸드오프와 프레임 단위로 대조(computed style + 접근성 트리). `[수동]`
  ⚠️ **선행: D(입구) · F2a·F2(푸터 스위처) · G1·G2(`/preferences`)가 구현돼 있어야 한다** — 대조할 화면이 없으면 돌릴 수 없다(2026-10-04 시도 시 `uiLocale` 코드 0건으로 중단).
  ko·es 아트보드(A5·A6·B6·B7)는 B3·B4(사전)와 E(소비자 이행) 뒤에야 대조된다. 시안 대조를 앞당기려면 F2a·F2·G1·G2만 먼저 구현해 en 아트보드만 대조하고, ko·es는 E 뒤에 다시 돌린다.
- [x] `[커밋] feat(preferences): add the Preferences page with language`

## I. 가이드 언어별 원고 (design §6.1)

- [x] **I1** 구조 동형 테스트 먼저 — 세 언어의 파일 집합 · SUMMARY 순서 · 절 id · 이미지 참조 · 번호 단계 수 대조. **대상은 존재하는 언어 트리**(B1과 같은 규칙 — 커밋마다 green).
  그리고 독자용 원고 31파일을 `git mv`로 `guide/en/`으로 옮긴다(`AUTHORING.md`·`SHOOTING.md`는 루트 유지). `lib/guide/load.ts:20` `guideDir(uiLocale)`, `/docs/[[...slug]]`가 `getUiLocale()`로 고름, `llms*.txt`·sitemap은 `"en"` 명시, `scripts/guide-check.ts`·`lib/guide/summary.ts`의 루트 비서빙 판정 경로 갱신.
  검증: `pnpm test` green(기존 원고 게이트가 `guide/en/`에서 그대로 green), `pnpm build` 산출물의 `/docs` 함수에 `guide/en/**`가 실린다(`outputFileTracingIncludes`) `[수동]`, `pnpm guide:check` 출력이 이동 전과 같다.
- [x] **I2** 검색 색인 언어별 — `/api/search-index`를 언어별 정적 파일 셋으로, 클라이언트 Docs 로더가 `useUiLocale()`로 골라 받고 캐시는 언어별 키. 테스트: 세 언어 색인 생성 · 로더 캐시 키.
- [x] `[커밋] refactor(guide): move the guide under guide/en and load by UI language`
- [x] **I3** `terminology.test.ts`를 언어별로 — `guide/<lang>/`의 화면 라벨을 그 언어 사전과 대조, 기존 원고 게이트(상한·포맷·action 넷·마커)를 세 언어에 돌린다. 존재하는 언어 트리만 대상.
- [x] **I4** `guide/ko/` 31파일 — 에이전트 초안 → 사용자 검수(장 단위 하위 체크리스트). 검증: I1·I3 ko 쪽 green. `[커밋] docs(guide): add the Korean guide`
- [x] **I5** `guide/es/` 31파일 — 에이전트 초안 그대로. 검증: 같은 게이트. `[커밋] docs(guide): add the Spanish guide`
- [x] **I6** `guide/AUTHORING.md` — "en이 원문, ko·es는 같은 구조의 번역" · ko·es 톤 절 · 세 언어 같은 커밋 규칙. `guide/SHOOTING.md` — 매핑 표가 `guide/en/` 기준이라는 것과 "촬영 계정은 en". `.claude/commands/{guide,guide-shots}.md`에 세 언어 동시 수정 규칙.
  검증: 다음 `/guide` 실행 전에 사용자 확인.
- [x] 의존: I1은 D2(`getUiLocale`) 뒤, I3은 B3·B4(사전) 뒤, I4는 B3 뒤, I5는 B4 뒤.

## H. 문서·검증

- [x] **H2** 정본 갱신(문서별 별도 커밋, `/implement`·`/push` 신선도 단계에서):
  - PRODUCT — §10 "UI를 ko로 여는 시점" 해소(결정·폴백 순서·사용자 판단으로 연다) · `:754-755` "§10을 선행해 정하게 된다" · §4.1에 화면 언어 · §7.7 IA에 `/preferences` · "소비자의 import 자리는 안 바뀐다" 정정. `/docs` 절에 "가이드는 언어별 세 벌, 이미지는 en 공유" · `:754-755` "방침은 en 단일" → "en·ko 두 벌, es 화면은 en"(2026-09-19 결정 갱신).
  - ARCHITECTURE — "화면 문구는 영어 단일" 줄 교체(§3 입구 · 영어 고정 표면 목록 · 언어별 provider 청크 규칙) · 잎 명부에 `lib/i18n/locales.ts` · 스키마 절에 `User.uiLocale` · pull 경고가 코드라는 계약. 가이드 로더·검색 색인의 언어 축(§6.37).
  - DESIGN — §10 ko·es 문체·§10.1 ko·es 열(B2) · `:2146`·`:2224` "문자열은 `messages/en.tsx`에서 오고 `m`으로 읽는다" · Preferences 화면 · 푸터 스위처 · §6.4 즉시 적용 Select 예외(B2) · `:lang(ko)` 규칙.
  - DIRECTORY — `app/ui-locale/` · `app/(edit)/preferences/` · `components/i18n/` · `messages/ko.tsx`·`es.tsx` · `guide/en·ko·es/`.
  - CLAUDE.md 문서 지도 — `guide/AUTHORING.md` 행의 "en 단일" 표현, 워크플로 절의 "`/guide`(본문, en 단일)".
  - CLAUDE.md — 코드 컨벤션 "화면 문구는 `messages/en.tsx`를 지난다" → 사전 셋 + `getMessages`/`useMessages` + `no-korean-ui` 예외 한 파일. 데이터 변경 경로 표에 `setUiLocale` 행. (미러 재생성은 훅이 한다)
  - `.claude/commands/{implement,ux-audit,push,doc-check}.md`의 `messages/en.tsx` 언급(미러는 `pnpm sync:agents`).
  - `guide/AUTHORING.md:53`(`dictionaryStrings(m)`)·`:147-159`(사실 대조 소스 표) — I6과 같은 커밋.
  - README — 지원 화면 언어 en·ko·es.
- [x] **H3** 가이드: `/guide`로 Preferences·언어 변경 페이지(en·ko·es 세 벌 — I 뒤) + `/guide-shots`로 그 페이지 샷만(en). 기존 셸·공개 페이지 샷의 stale은 이번 범위 밖이다(spec 비목표).
- [x] **H4** `/runtime-test` — 위 `[수동]` 항목 전부 + ko·es 전 화면 순회:
  긴 es 문장의 넘침·잘림(특히 `PanelFacts` 라벨 96 · 실측 폭이 박힌 버튼 — design §5.6) · ko 줄바꿈 · 날짜·상대 시각·언어명 표기 · 토스트 언어 ·
  `/docs`가 ko·es 원고·목차·검색 결과로 바뀜 · ko 첫 진입 hydration 경고 0 · 다른 탭 혼합이 새로고침으로 풀림(spec 비목표 — 확인만) · revalidate 뒤 Preferences 실패 Alert 유지.
- [ ] **H5** prod 반영(`/merge` 1단계): `pnpm db:status:prod` → `pnpm db:deploy` → prod `has_schema_privilege` false 확인.
- [ ] 끝나면 결론을 정본으로 올리고 `docs/features/ui-locales/`를 지운다.
