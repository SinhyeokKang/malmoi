# ui-locales — 설계

## 0. 이름: 화면 언어와 프로젝트 로케일을 섞지 않는다

이 리포에서 `Locale`은 **번역 대상 언어**다(`Locale` 모델 · `Locale.code` · `localeCode` · `pathTemplate`의 `{locale}`).
이 기능이 다루는 것은 **Malmoi 화면 자체의 언어**라 축이 다르다. 식별자는 전부 `uiLocale`·`UiLocale`로 쓰고 맨 `locale`을
쓰지 않는다 — grep 한 번으로 두 축이 섞인 코드를 찾을 수 있어야 한다.

| 무엇 | 식별자 |
|---|---|
| 지원 집합 | `UI_LOCALES = ["en", "ko", "es"] as const`, `type UiLocale` |
| DB 컬럼 | `User.uiLocale String?` |
| 쿠키 | `malmoi-ui-locale` |
| Action 디렉터리 | `app/ui-locale/` (맨 `locale`이 아니다) |
| 화면 라벨 | Preferences의 `Language`. 설명문에 "프로젝트의 언어는 바뀌지 않는다"를 적는다(번역 화면의 언어 열과 혼동하지 않도록) |

## 1. 영향 받는 흐름

- **push / pull / export: 영향 없다.** 어댑터·적재·Publish의 판정은 바뀌지 않는다. 바뀌는 것은 그 결과를 **어떤 언어 문장으로 보이느냐**뿐이다.
- **편집 UI 전체 + 공개 셸**: 문구를 읽는 방식이 상수 import에서 요청별 사전으로 바뀐다(§3).
- **새 화면 1**: `/preferences`(사용자 축 — `/account`·`/mcp`와 같은 층).
- **새 Server Action 1**: `setUiLocale`(공개 푸터와 Preferences가 같이 쓴다).
- **가이드(`/docs`)**: 원고가 언어별 세 벌이 된다(§6.1).

## 2. 순수 함수 (= `/tdd` 진입점)

| 함수 | 위치 | 계약 |
|---|---|---|
| `parseUiLocale(raw: unknown): UiLocale \| null` | `lib/i18n/locales.ts` (잎) | 지원 집합 안의 문자열만 통과시킨다. **`Object.hasOwn`으로 판정한다** — `__proto__`·`constructor`·`toString`이 통과하면 안 된다(CLAUDE.md "남이 정한 키" — 쿠키 값은 남이 정한 값이다). 대소문자·공백을 정규화하지 않는다(쓰는 쪽이 우리뿐이다) |
| `resolveUiLocale({ account, cookie }): UiLocale` | 같은 파일 | `parseUiLocale(account) ?? parseUiLocale(cookie) ?? "en"`. **`Accept-Language`는 입력에 없다** — 받을 자리가 없어서 읽을 수도 없게 한다 |
| `planUiLocaleWrite({ locale, signedIn }): { cookie: true; account: boolean }` | 같은 파일 | 쿠키는 항상 쓰고, 계정은 로그인했을 때만 쓴다(spec 결정). 로그아웃 뒤에도 그 기기가 같은 언어를 보게 하려고 로그인 중에도 쿠키를 쓴다 |
| `UI_LOCALE_NAMES: Record<UiLocale, string>` | 같은 파일 | 언어 이름은 **그 언어 자체의 표기(endonym)**로 쓰고 번역하지 않는다 — `English` · `한국어` · `Español`. ko 화면에서 영어를 찾는 사람도 `English`를 읽을 수 있어야 한다 |
| `utcDay(at, locale)` · `utcMinute(at, locale)` · `utcMonth(at, locale)` | `lib/utc-time.ts` (잎 유지) | 언어별 형식을 **손으로 만든다** — `Intl` 날짜 포맷터를 쓰지 않는 근거는 `lib/utc-time.ts:9-10` 머리 주석이고, POSTMORTEM 2026-09-20은 그 위에 "UTC 라벨 없는 `toLocaleDateString`·`toLocaleTimeString` 금지"를 더했다. 둘 다 그대로 따른다. en `Sep 27, 2026 16:34 UTC` · ko `2026년 9월 27일 16:34 UTC` · es `27 sept 2026 16:34 UTC`. **UTC 표기는 세 언어 모두 남긴다** |
| `relativeTime(then, now, locale)` | `lib/relative-time.ts` | `Intl.RelativeTimeFormat(locale, { numeric: "auto" })`. 지금도 `Intl`을 쓰는 자리이고 언어 인자만 늘린다 |
| 언어명 | `lib/onboarding/language-name.ts` | 지금 `Intl.DisplayNames(["en"])` 고정이라 ko 화면에 `Korean`·`French`가 나온다. `uiLocale` 인자를 받아 `Intl.DisplayNames([uiLocale])`로 바꾼다(숫자 형식은 `en-US` 그대로 — spec 비목표) |
| `type Messages` | `lib/i18n/index.ts` | `messages/en.tsx`는 바깥 `as const`(`:3840`)라 **값이 리터럴 타입**이다(`"Search"`). 그대로 두면 ko가 `satisfies`를 통과할 수 없다. **먼저 바깥 `as const`를 지울 수 있는지 본다** — 리터럴이 필요한 자리가 안쪽 `as const`(`:470`·`:489`)뿐이면 `Widen`이 필요 없다. 안 되면 `Widen<T>`를 두되 **문자열·배열·객체만 재귀하고 함수 값은 그대로 둔다**(`ReactNode` 반환형에 재귀를 걸면 `ReactElement` 구조를 매핑해 버린다). 그리고 **영어 고정 네임스페이스를 `Omit`으로 뺀다** — `Messages = Omit<…typeof en, "mcp" \| "seo" \| 초대 메일 \| "crash" \| 방침 본문>`(정확한 키는 구현 때 en의 최상위 절로 확정). ko·es는 그 절을 갖지 않고, 소비자는 `en`에서 직접 읽는다(§3.2). `expectTypeOf`로 고정한다 |

사전 정합성 검사 둘(테스트):

- **키·시그니처 정합**은 `messages/ko.tsx`·`es.tsx`의 `satisfies Messages`가 컴파일 시점에 든다(빠진 키·남는 키·인자 다른 함수가 전부 red).
- **번역 누락 탐지**: 사전을 재귀로 펼쳐 문자열 값이 en과 **같으면** 그 **키 경로**가 허용 목록에 있어야 한다(`Malmoi`·`GitHub`·`Google`·`MCP`·`OAuth`·`URL`·`YAML`·코드 예시 등).
  값이 아니라 키 경로로 허용한다 — es에는 en과 철자가 같은 단어(`Error`·`General`·`Total`·`Local`)가 많아 값으로 허용하면 다른 키의 누락까지 통과한다.
  함수 값은 대표 인자로 호출해 비교한다. 대표 인자 표는 `Record<FunctionPaths<Messages>, Parameters<…>>`로 타입을 걸어 en에 함수가 늘면 typecheck가 항목 누락을 잡게 하고, JSX를 돌려주는 함수는 `renderToStaticMarkup`으로 비교한다.
- **용어 일관성**: §6 용어집(DESIGN §10.1 개념 표의 ko·es 열)의 "쓰지 않는 말"이 ko·es 사전에 0건이다(예: ko에 `발행` 0건, `게시`만). 기존 `terminology.test.ts`의 금지어 검사와 "링크 라벨이 버튼 이름을 값으로 포함한다" 검사(POSTMORTEM 2026-09-24)를 사전 셋 모두에 돌린다.

## 3. 사전을 읽는 방식 — 상수 `m`을 없앤다

### 3.1 왜 `m`을 유지할 수 없나

`m`은 모듈 상수다. 서버는 요청 여럿을 한 프로세스에서 동시에 렌더하므로, "지금 요청의 언어"를 모듈 상수에 담으면 요청끼리 섞인다.
⚠️ **루트 레이아웃이 언어를 정해서 아래로 흘려보내는 방식도 쓰지 않는다** — App Router는 레이아웃과 페이지를 **병렬로** 렌더한다
(POSTMORTEM 2026-08-31 "레이아웃 인증 검사가 데이터 노출을 막지 못했다"와 같은 사정). 그래서 **각 서버 소비자가 직접 묻는다.**

PRODUCT §10의 "소비자의 import 자리는 안 바뀐다"는 틀린 전망이었다 — 그 문장도 이 기능에서 고친다.

### 3.2 형태

| 소비자 | 읽는 법 | 비고 |
|---|---|---|
| 서버 컴포넌트·페이지·레이아웃·Server Action | `const m = await getMessages()` (`lib/i18n/server.ts`, `server-only`) | `getUiLocale()`이 React `cache`로 요청당 한 번 정한다. 입력은 `readSession()`의 `uiLocale` + `cookies()`의 `malmoi-ui-locale`이고 판정은 `resolveUiLocale` |
| 클라이언트 컴포넌트 | `const m = useMessages()` · `const uiLocale = useUiLocale()` (`components/i18n/messages-provider.tsx`, `"use client"`) | 루트 레이아웃이 언어별 provider 하나를 렌더한다(§3.3). **사전 객체를 prop으로 넘기지 않는다** — 함수·ReactNode 값이 있어 RSC 경계를 넘지 못한다. `useUiLocale()`은 날짜·상대 시각·언어명 헬퍼에 넘길 코드다 |
| `"use client"` 없는 공용 컴포넌트(약 30개 — 서버·클라이언트 양쪽에서 import된다) | **부모가 `m`이나 필요한 문자열을 prop으로 넘긴다** | async `getMessages()`도 훅 `useMessages()`도 쓸 수 없다. 서버에서 렌더될 때는 RSC 경계를 넘지 않으므로 함수 값도 넘길 수 있다 |
| `lib/`의 문구 조립 모듈(약 40곳) | **`m: Messages`를 인자로 받는다** | 모듈 최상위에서 `m.…`로 상수를 만드는 파일은 상수를 `m`을 받는 함수로 바꾼다. 전수(2026-10-04 실측): `lib/` 16곳(`mcp`·`seo` 포함 — 그 둘은 아래 영어 고정 행으로 간다) — `lib/settings/message.ts`·`lib/auth/message.ts`·`lib/onboarding/message.ts`·`lib/upload/message.ts`·`lib/i18n/adapter-errors.ts`·`lib/events/view.ts`·`lib/links.ts:37`(푸터 링크 라벨)·`lib/github-connect/message.ts:72`·`lib/login-link/message.ts:11`·`lib/onboarding/detect.ts:67` 등. `app/`·`components/` 17곳 — `app/not-found.tsx:8`, 정적 `metadata` 8곳(영어 고정), 클라이언트 컴포넌트 `sidebar`·`project-list`·`log-filters`·`publish-button.tsx:145`·`landing/mockup/*`·`onboarding/steps/files.tsx:108`. 정확한 목록은 E 배치 착수 때 `grep`으로 다시 뽑는다 |
| **영어로 고정되는 표면** | `import { en } from "@/messages/en"`로 **명시한다** | `lib/mcp/**`(MCP 도구 응답 — 에이전트가 읽는다) · `lib/invitation-email/**`(받는 사람의 언어를 모른다) · `lib/seo/**`(크롤러는 쿠키가 없다) · 정적 `export const metadata`(`app/layout.tsx:30-34` 등 8곳 — 탭 제목은 크롤러와 같은 축) · cron 응답 JSON·서버 로그(`lib/pull/trigger.ts:53`) · `scripts/push-local.ts`·`ingest.ts`·`guide-check.ts`(CLI) · `app/global-error.tsx`(루트 레이아웃 밖이라 provider가 없다, `lang="en"` 유지). 테스트(`m`을 import하는 133개 파일)도 `en` 명시 import로 기계 전환한다. 이름이 `m`이 아니라 `en`이라 "일부러 영어"가 코드에 보인다. ⚠️ **공유 코어(MCP 도구가 부르는 `planPublishView`·`loadEvents` 등)는 `getMessages()`를 부르지 않고 `m`을 인자로만 받는다** — 코어가 스스로 언어를 물으면 MCP 응답이 요청자의 언어를 따라간다. 소스 검사로 고정한다(tasks B1⑧) |

`useMessages()`의 **기본값(provider 없음)은 en**이다 — 그래서 provider 밖에서 렌더되는 `global-error.tsx`와, 컴포넌트만 렌더하는 기존 DOM 테스트가
그대로 돈다. 대가는 "provider를 빠뜨리면 조용히 영어"라는 것이고, 루트 레이아웃 테스트가 provider 존재를 고정해 막는다.

### 3.3 클라이언트 번들 — 언어별 provider, 렌더된 언어의 청크만

실측(2026-10-04): `messages/en.tsx`를 minify하면 102KB, gzip하면 30KB다. **지금도 `m`을 읽는 클라이언트 컴포넌트가 있어서 en 전체가 이미 번들에 들어 있다.**
세 사전을 한 클라이언트 모듈이 모두 정적으로 import하면 모든 사용자가 사전 셋을 받는다(+60KB 이상).

- **언어별 `"use client"` provider 셋**: `components/i18n/en-messages-provider.tsx`·`ko-…`·`es-…`가 각자 자기 사전 하나만 정적으로 import하고, 공용 context에 `{ m, uiLocale }`를 싣는다.
  루트 레이아웃(서버)이 `uiLocale`로 그중 **하나만** 렌더한다. Next는 렌더된 client reference의 청크만 HTML에 싣고 미리 받으므로 ko·es 사용자도 하이드레이션 중 멈추지 않고, en 사용자는 ko·es 청크를 받지 않는다.
- 기각한 안: provider 하나가 `use(loadMessages(uiLocale))` + 동적 `import()`로 읽는 형. ko·es 청크가 manifest에 없어 Next가 미리 받지 않으므로 HTML → main JS → 루트에서 하이드레이션 정지 → 청크 요청 → 재개의 폭포가 생기고 그동안 화면 전체가 반응하지 않는다. 클라이언트 동적 `import()`의 선례도 이 리포에 없다.
- ⚠️ **청크 크기를 눈으로 잰다** — `pnpm build`의 라우트 표는 청크 크기를 말하지 않는다. 7.2MB가 그렇게 나갈 뻔했다(POSTMORTEM 2026-09-07).
  완료 조건 10을 착수 전 기준선(tasks A0)과 `.next/static/chunks` 실측으로 비교하고, ko·es 사전이 en 페이지의 client-reference-manifest에 걸리지 않는지 **청크 이름으로** 본다(grep 패턴으로 재지 않는다).
- ⚠️ **`messages/ko.tsx`·`es.tsx`를 import하는(정적·동적 불문) 비테스트 소스는 각 언어의 provider 파일 하나뿐이다** — 다른 클라이언트 모듈이 import하면 그 순간 모든 사용자 번들에 실린다. 소스 검사 테스트로 고정한다(사전 정합성 테스트 파일은 예외).
- `lib/i18n/index.ts`·`locales.ts`는 **잎으로 남는다**. `components/__tests__/client-graph.test.ts`는 클라이언트 그래프가 `lib/i18n`에서 닿는 파일을 정확히 고정하므로(`:373-380`, `CLIENT_LIB_FILES` `:96`·`:536`) 그 목록에 `locales.ts`를 등재한다. ARCHITECTURE의 잎 명부에도 `lib/i18n/locales.ts`를 더한다.

### 3.4 이행 순서 (green을 유지하며)

1. 새 입구(`getMessages`·`useMessages`·`useUiLocale`·`Messages`)를 먼저 세우고, **`m`은 en 별칭으로 잠시 남긴다.**
2. 영역별로 소비자를 옮긴다. 배치마다 `pnpm gate`가 green이고, **그 배치 경로에서 `m` import가 0**이다(별칭이 남아 있는 동안 gate green은 "옮겼다"를 증명하지 못한다).
   테스트·스크립트·정적 `metadata`는 첫 배치(E1)에서 `en` 명시 import로 기계 전환한다 — 안 하면 마지막 배치에서 typecheck가 수백 건 red를 낸다.
3. 마지막 배치에서 **`export { en as m }`을 지운다** — 남은 소비자는 typecheck가 이름을 대며 red로 잡는다. 이게 "옮기지 않은 파일 0"의 증명이다.

## 4. 언어 바꾸기 — `setUiLocale` Server Action

- 위치: **`app/ui-locale/actions.ts`** — 라우트가 없는 Action 전용 디렉터리다(§0 — 맨 `locale`을 쓰지 않는다). 공개 셸이 부르는 읽기 Action `app/search/actions.ts`가 선례다.
  `/preferences` 아래에 두지 않는 이유는 **공개 푸터(비로그인)가 같은 Action을 부르기** 때문이다 — 보호 경로 아래 이름이면 경계가 헷갈린다.
- 입력: `uiLocale` 하나. `parseUiLocale`을 지나지 못하면 아무것도 안 쓰고 실패를 돌려준다.
- 처리 순서(고정): ①`readSession()`이 `ok`이면 **세션의 `userId`로** `User.uiLocale`을 갱신한다(입력에 userId를 받지 않는다) → ②쿠키를 쓴다 → ③`revalidateAfterCommit`.
  - 세션 읽기가 `unavailable`이거나 ①이 실패하면(행 없음·DB 오류) **아무것도 쓰지 않고 `failed`**다. 쿠키만 쓰면 다음 렌더에서 세션이 살아날 때 계정의 옛 값이 쿠키를 이겨 화면이 조용히 되돌아간다 — "이 기기에만 적용됐다"는 문장이 거짓이 된다. 그래서 `device-only` 갈래를 두지 않는다.
  - 비로그인이면 ①을 건너뛰고 쿠키만 쓴다(`planUiLocaleWrite`).
  - ③은 저장이 끝난 뒤의 무효화라 `revalidateAfterCommit`으로 감싼다 — 날 `revalidatePath`가 던지면 저장은 됐는데 `failed`가 나간다(POSTMORTEM 2026-09-20 "소스 추가 커밋 뒤 캐시 오류"의 형).
- 쿠키: `malmoi-ui-locale` · `httpOnly` · `SameSite=Lax` · `Secure`(https) · `Path=/` · `Max-Age` 1년. **http-only로 둬서** 방침의 "All of them are http-only" 문장을 참으로 유지한다 — 클라이언트는 쿠키를 읽을 필요가 없다(provider가 서버에서 받은 코드를 쓴다).
- 무효화 대상은 `("/", "layout")` — 루트 레이아웃이 언어를 읽으므로 전 화면이다. 이 Action은 성공 시 돌려줄 결과 문구가 없어서 POSTMORTEM 2026-09-07(`revalidatePath`가 결과 문구를 씻었다)의 형에 걸리지 않는다. **실패는 revalidate하지 않는 갈래에서만 돌려준다**(실패면 바뀐 것이 없다).
  ⚠️ **Action은 문장이 아니라 코드를 돌려준다**(`ok` · `invalid` · `failed`). 클라이언트 상태에 코드만 들고 `useMessages()`로 그린다. ⚠️ **provider에 `key={uiLocale}`을 걸지 않는다** — 걸면 언어가 바뀔 때 트리가 다시 마운트되어 컨트롤의 포커스와 상태가 사라진다(POSTMORTEM 2026-09-07과 같은 형). 언어별 provider를 갈아 끼우면 그 아래 트리도 다시 마운트되므로, 세 provider는 **같은 컴포넌트 하나에 사전만 다르게 넘기는 얇은 껍데기**로 두어 React가 같은 타입으로 보게 한다(구현 때 재마운트 여부를 DOM 테스트로 확인).
- 진행 중 표시는 **`busy` 형**이다 — 진짜 `disabled`로 끄면 Radix가 메뉴를 닫으며 포커스를 트리거로 돌려줄 때 그 트리거가 꺼져 있어 포커스가 `body`로 빠진다(POSTMORTEM 2026-09-24 "포커스가 `body`로 빠지는 자리"). `aria-disabled` + `aria-busy`로 클릭만 막고(`components/ui/button.tsx:192-196`), 끝나면 `useLandAfter(pending, [triggerRef])`로 마무리한다.
- `ProjectEvent`를 남기지 않는다 — 프로젝트 상태가 아니다.

## 5. 화면

### 5.1 공개 푸터 — `LocaleSwitcher`

- 소비자: `components/public-shell/footer.tsx`(공개 셸)와 `AuthLayout`(`/signin`·초대·계정 병합). 푸터 자체는 서버 컴포넌트로 남고 스위처만 클라이언트다.
- 형: **텍스트 버튼**(`Globe` 14 + 현재 언어의 endonym + `ChevronsUpDown` 14) → 기존 `DropdownMenu`의 **`DropdownMenuItem selected` 세 줄**(`components/ui/dropdown-menu.tsx:72-98` — `menuitemradio` + `aria-checked` + `bg-muted` + `Check`, 선례 `project-switcher.tsx:141`). 새 프리미티브는 만들지 않는다. 사용자가 말한 "콤보박스"를 이 조합으로 읽는다 —
  항목이 셋이라 검색 입력이 필요 없고, `components/ui/`에 콤보박스 프리미티브가 없으며, 새로 만들면 소비자 없는 기능(검색)을 선반영하게 된다.
  - 아이콘: 지구본은 `Globe`로 고정한다. `Languages`는 Translations의 글리프라 쓰지 않는다. 화살표는 위로 열리는 메뉴에 방향이 맞지 않는 `chevron-down` 대신 프로젝트 스위처와 같은 `ChevronsUpDown`이다.
  - 위치: 가운데 정렬 한 줄의 **마지막 항목**(바닥 띠 40에 좌우 분리를 들이지 않는다).
  - 트리거는 `Button`이 아니라 **날 `<button>`에 푸터 링크 클래스**(`footer.tsx:6,17` — 13 · 400 · muted)를 쓴다. `Button`은 `label-weight.test.ts`가 500을 강제해 이웃 링크와 무게가 갈린다.
  - 접근 이름: `aria-label`을 쓰지 않고 `<span class="sr-only">{Language}: </span><span lang="en">English</span>` 구조로 보이는 글자를 이름에 포함한다(WCAG 2.5.3). 메뉴라는 사실은 `aria-haspopup`이 알린다.
  - 언어 이름(트리거·메뉴 항목·Select 옵션)에는 각각 **`lang={code}`**를 단다 — ko 화면에서 `English`·`Español`이 한국어 음성으로 읽히지 않게 한다.
- 고르면 `setUiLocale` → 같은 페이지가 새 언어로 다시 그려진다. 진행 중에는 트리거가 `busy`이고 지구본 자리를 `Loader2`로 **교체**한다(DESIGN §6.4).
- 실패(`invalid`·`failed`)는 **sonner 오류 토스트**로 알린다 — 푸터는 40px 한 줄이라 Alert 자리가 없다. 이 갈래만 토스트이고 Preferences는 카드 안 Alert다.

### 5.2 `/preferences`

- IA: **사용자 축**(`/account`·`/mcp` 옆). `routes.preferences()` · `isProtectedPath` 정규식 1줄(`/mcp`와 같은 모양) · robots `disallow`(`lib/seo/crawl.ts:19` — `isProtectedPath`와 따로 하드코딩된 목록이라 두 곳을 각각 고친다. 지금 그 목록에 `/mcp`가 없는 것은 이 기능 범위 밖이다) · 사용자 메뉴 항목. 검색 `Pages` 행은 `navWorkItems`에서 자동으로 나온다(`lib/search/nav-index.ts:21`).
- 구성: 페이지 제목 `Preferences` + **Language 카드 하나**. `/account`의 `Card` 껍데기를 쓴다.
  - 카드 머리 설명은 한 문장(DESIGN §6.67 한 줄 규칙)이고, "프로젝트의 번역 언어는 바뀌지 않는다"는 Select 아래 도움말로 내린다.
  - 본문은 기존 `Select` 하나(옵션 셋, endonym, `lang={code}`)이고 라벨 열을 두지 않는다. 접근 이름은 `aria-labelledby`로 카드 제목(`Language`)을, `aria-describedby`로 도움말을 가리킨다. 폭은 Profile 이름 필드와 같은 320이다.
  - **고르는 즉시 적용한다(저장 버튼 없음)** — 푸터와 같은 Action·같은 동작이고, 화면 전체가 새 언어로 다시 그려지는 것 자체가 피드백이라 성공 토스트를 띄우지 않는다. 앱의 다른 Select는 전부 [Save]·Dialog로 확정하므로 **이 예외를 DESIGN §6.4에 등재한다.**
  - ⚠️ **닫힌 트리거의 typeahead를 막는다** — 닫힌 Radix Select 트리거에 포커스를 두고 글자를 치면 메뉴가 열리지 않은 채 값이 바뀐다(POSTMORTEM 2026-09-19의 두 번째 경로). 즉시 적용이라 Tab으로 지나가다 `e`를 치면 앱 전체가 Español이 된다. 닫힌 트리거는 Enter·Space·방향키·Tab만 받는다.
  - 진행 중에는 Root `disabled`가 아니라 `RoleSelect` 가드(`member-list.tsx:300-316`)를 그대로 쓴다(§4 `busy` — 포커스 유지).
  - 실패는 `Card`의 `notice` 슬롯(`components/ui/card.tsx:8`)에 `Alert danger`. 손으로 조립하지 않는다.
  - 타임존·테마 자리는 만들지 않는다(spec 비목표).
- 사용자 축 내비(`navWorkItems` — 사이드바 사용자 구역과 사용자 메뉴가 같은 목록)에 `Account` 다음으로 `Preferences`를 넣는다. 아이콘은 `SlidersHorizontal`(`Settings` 톱니는 Project settings, `CircleUser`는 Account와 구별). 랜딩 목업의 LNB도 `navZones`에서 뽑으므로 함께 바뀐다.
- 인가: 페이지 최상단 `requireUser`. Action은 §4.
- 시안: **Claude Design 핸드오프를 먼저 만든다**(2026-10-04 사용자). 입력은 `design-brief.md`이고, 새 페이지의 초기 구현이므로 `/design-sync` 대상이다. 푸터 스위처도 같은 핸드오프에 넣는다.

### 5.3 `<html lang>`

루트 레이아웃이 `getUiLocale()`로 `lang`을 정한다. 루트 레이아웃은 이미 CSP nonce 때문에 동적이라 새로 동적이 되는 페이지는 없다.
`force-static`인 것(`/sitemap.xml`·`/llms*.txt`·`/api/search-index`)은 레이아웃을 지나지 않거나 영어 고정 표면이라 영향이 없다.

### 5.4 글꼴

es는 라틴 확장(á é í ñ ó ú ü ¿ ¡)이고 Geist가 덮는다(2026-10-04 Geist v1.7.2 글리프 실측 — 전부 있다). ko는 지금 폴백인 Pretendard가 맡는다. 글꼴 스택 변경은 없다.

### 5.5 한국어 줄바꿈

`app/globals.css`에 `:lang(ko) { word-break: keep-all; overflow-wrap: anywhere; }` 한 줄을 더한다 — 지금 `keep-all`·`:lang(` 규칙이 0이라 ko Alert·카드 설명·Dialog 본문이 음절 사이에서 끊긴다. `<html lang>`이 이 규칙을 켜고, 기존 `break-all`·`wrap-anywhere` 클래스는 그대로 이 규칙을 덮는다. `globals-css.test.ts`로 고정한다.

### 5.6 길이 넘침

es 문장이 가장 길다. 미리 알려진 위험 자리 — `PanelFacts` 라벨 열 96px(`Correo electrónico`는 13px에서 약 120px), 실측 폭이 박힌 버튼(DESIGN §6.644 `Sync from repository` 184.9) — 는 시안 단계가 아니라 **`/runtime-test`(tasks H4)에서 잡는다**(2026-10-04 사용자).

## 6. 번역 원고

- ko·es 초안은 에이전트가 쓴다(3,840줄 × 2). **ko는 사용자가 검수한다. es는 에이전트 초안 그대로 내보낸다**(2026-10-04 사용자 확정) — 원어민 검수 없이 나가는 품질 위험을 감수한다.
- 문체: en은 DESIGN §10(sentence case · 라벨 마침표 없음 · "please/sorry" 금지 · 오류는 다음 행동을 말한다 · 편집자 화면에 git 어휘 금지). ko·es도 같은 규칙을 따르고, 언어별 규칙을 DESIGN §10에 더한다.
  - ko: **합니다체**(2026-10-04 확정). 버튼·라벨은 명사형 또는 동사 원형.
  - es: **tú**. 라벨은 동사 원형(`Guardar`·`Publicar`).
- 용어집(2026-10-04 확정 — 기능 이름은 번역한다): 고유명사(`Malmoi`·`GitHub`·`Google`·`MCP`·`OAuth`)는 그대로. 기능 이름은 번역한다.
  아래 8행은 시작점이고, **DESIGN §10.1 개념 표(약 30개)에 ko·es 열(쓰는 말 · 쓰지 않는 말)을 더해 그것을 정본으로 삼는다** — 에이전트 초안 7,680줄에서 `로케일/언어`·`재시도/다시 시도`·`원본/소스` 같은 낱말이 갈리는 것을 §2의 용어 일관성 검사가 잡는다.

  | en | ko | es |
  |---|---|---|
  | Sync | 동기화 | Sincronizar |
  | Publish | 게시 | Publicar |
  | Sources | 소스 | Fuentes |
  | Translations | 번역 | Traducciones |
  | Logs | 로그 | Registros |
  | Members | 멤버 | Miembros |
  | Needs review | 검토 필요 | Por revisar |
  | Preferences | 환경설정 | Preferencias |

  가이드 원고도 같은 용어집을 쓴다 — `terminology.test.ts`(가이드 ↔ 사전)를 **언어별로** 돌려 `guide/ko/`는 ko 사전 라벨과 대조한다(§6.1). 금지어 검사는 사전 셋으로 넓힌다(§2).
- `brand-spelling.test.ts`: ko·es 화면에서도 제품 이름은 `Malmoi`다. 이 테스트는 이미 `messages/` 전체를 훑으므로(`:28`) 새 사전이 자동으로 대상이 된다 — 바꿀 것이 없다.
- `no-korean-ui.test.ts`: **`messages/ko.tsx` 한 파일만** 예외로 둔다. 다른 소스의 한글 리터럴 0은 그대로 유지된다 — 사전 밖으로 한글이 새는 것을 막는 검사의 목적은 변하지 않는다.

## 6.1 가이드 원고 — 언어별 세 벌, 이미지는 공유

2026-10-04 사용자 범위 수정: 가이드는 언어별로 준비한다. 스크린샷 이미지만 en을 공유하고 문구는 언어별이다.

- **배치: `guide/en/` · `guide/ko/` · `guide/es/` 대칭 트리.** 지금의 독자용 원고(`README.md`·`SUMMARY.md`·`account.md`·장 디렉터리 다섯 — 31파일)를 `guide/en/`으로 옮기고, ko·es를 같은 모양으로 둔다. 비서빙 매뉴얼 `AUTHORING.md`·`SHOOTING.md`는 `guide/` 루트에 남는다.
- **이미지는 그대로 `public/guide/*.webp` 한 벌**이다. 원고의 이미지 참조는 이미 `/guide/<name>.webp` 절대경로만이라(`lib/guide/collect.ts:69`) 세 언어가 같은 줄을 쓴다. SHOOTING의 에셋 매핑 표와 `pnpm guide:check`는 en 원고만 기준으로 본다.
- **로더**: `lib/guide/load.ts`의 `guideDir()`(`:20`)이 `uiLocale`을 받아 `guide/<uiLocale>/`을 읽는다. `/docs/[[...slug]]`는 이미 동적이라(레이아웃이 세션을 읽는다) `getUiLocale()`로 고른다. URL은 언어와 무관하다(로케일 URL 비목표). `next.config.ts:29`의 `outputFileTracingIncludes` 글롭 `./guide/**/*.md`는 하위 디렉터리를 이미 포함한다 — 바꿀 것이 없는지 빌드 산출물로 확인한다.
- **폴백 없음**: ko·es 원고에 페이지가 없으면 en으로 떨어지지 않고 테스트가 red다(아래 구조 동형). 세 벌이 항상 같은 페이지 집합이다.
- **구조 동형 검사**(`lib/guide/__tests__/`): 세 언어의 파일 집합 · SUMMARY 항목 순서 · 절 id(`{#anchor}` — 앱 안 가이드 링크와 `legacy-anchors.ts`가 언어와 무관하게 성립해야 한다) · 이미지 참조 목록 · 번호 단계 수가 같다. 기존 원고 게이트(상한·포맷·action 넷·마커의 정본 상수 대조)는 세 언어 모두에 돈다.
- **용어**: `terminology.test.ts`가 가이드의 화면 라벨을 그 언어 사전과 대조한다(ko 가이드의 `게시` = ko 사전의 Publish 값). 그림 속 라벨은 en이다 — 수용한 대가(spec 비목표).
- **검색 색인**: `/api/search-index`(`force-static`, `:4`)는 쿠키로 갈라질 수 없으므로 **언어별 정적 파일 셋**(`/api/search-index/[uiLocale]` + `generateStaticParams` 셋, 또는 경로 셋)으로 둔다. 클라이언트 검색이 `useUiLocale()`로 골라 받는다. Docs 로더의 "성공 Promise를 탭 수명 재사용" 캐시는 언어별 키다.
- **영어 고정**: `llms.txt`·`llms-full.txt`·sitemap·SEO 메타는 `guide/en/`만 읽는다(크롤러는 쿠키가 없다).
- **작성 규칙**: `guide/AUTHORING.md`는 "원고는 영어"를 "en이 원문, ko·es는 같은 구조의 번역"으로 고치고 ko(합니다체)·es(tú) 톤 절을 더한다. `/guide`·`/guide-shots` 스킬은 en을 고칠 때 ko·es를 **같은 커밋에서** 고친다. 검수: ko 사용자, es 에이전트 초안 그대로(사전과 같다).

## 7. 스키마 변경 — additive

```prisma
model User {
  // …
  /// 화면 언어(ui-locales). null = 정하지 않음 → 쿠키 → en 순으로 넘어간다. **읽을 때 `parseUiLocale`을 지난다** —
  /// 언어를 지원 목록에서 빼도 남은 값 때문에 화면이 깨지지 않는다. enum으로 두지 않는 이유가 이것이다(enum이면 값 하나를 빼는 것이 destructive 마이그레이션이 된다).
  uiLocale String?
}
```

- 마이그레이션 1개, `ALTER TABLE "User" ADD COLUMN "uiLocale" TEXT` — additive라 배포를 쪼개지 않는다. dev는 `/push` 전에, prod는 `/merge` 1단계에서 반영한다.
- 마이그레이션 뒤 dev·prod 모두 `has_schema_privilege`가 `false`인지 확인한다(`/db` 5단계).
- **봉투를 지나지 않는다** — 사람을 식별하는 값이 아니다(`name`·`image`와 다르다). `encodeUserFields`의 루프에 넣지 않는다.
- 세션: `lib/auth/public-session.ts` 허용 목록에 `uiLocale`을 더해 `readSession()`이 싣게 한다 — **추가 쿼리는 0이다**(`getSessionAndUser`가 이미 User 행을 돌려준다).
  타입 넷을 함께 넓힌다: `publicSession`의 입력 타입(`lib/auth/public-session.ts:21`) · Auth.js `AdapterUser` · `types/next-auth.d.ts`의 `Session.user` · `SessionRead`의 `ok` 갈래(`lib/auth/read-session.ts:21`). `read-session.test.ts:30`은 `toEqual`로 모양을 비교하므로 같이 바뀐다.
  대가로 `/api/auth/session` 응답 본문에 `uiLocale`이 실린다(식별 정보가 아니다).

## 8. 개인정보 방침

- `lib/privacy/collected.ts`: `User.uiLocale` → `collected`. 쿠키 `malmoi-ui-locale` → `cookies` 절의 표에 한 줄 추가.
- 방침 본문의 **"Every cookie Malmoi sets is needed to sign you in or to finish a round trip to GitHub or Google"**이 거짓이 된다 — 고친다.
  "추적·광고 쿠키가 없다", "http-only다", "동의할 것이 없다"는 그대로 참이다(사용자가 고른 언어를 기억하는 기능 쿠키다).
- 개정 이력 한 줄 + 시행일(`policy-gate.test.tsx`가 요구한다). 새 목적(화면 언어 기억)·새 쿠키 둘 다 `/push` 4단계 개인정보 점검 항목이다.
- 방침 본문은 영어로만 둔다(spec 비목표).

## 9. 새 환경변수

없다.

## 10. 불변식 영향

- **export 결정성·blob SHA(ARCHITECTURE §1·2)**: 영향 없다. 어댑터 오류 문구(`adapterErrorMessage`)가 `m`을 인자로 받게 바뀌지만 **오류는 코드로 실리고 문장은 화면에서 조립한다**(§1.4 계약) — 파일 출력에는 문장이 들어가지 않는다.
  ⚠️ PR 본문·커밋 메시지처럼 **리포에 남는 문장**이 사전을 읽는다면 영어로 고정한다 — 누가 Publish했느냐에 따라 같은 DB 상태에서 다른 PR 본문이 나오면 안 된다. 2026-10-04 확인: PR 제목·본문·커밋 메시지·`ProjectEvent`에 사전 문구는 0건이다.
  ⚠️ **단 `lib/pull/run.ts`는 사전을 읽는다** — `:3`이 `adapterErrorMessage`를 import하고 `:277`이 경고 **문장**을 만들어 `PullOutcome.warnings`에 싣는다. 그 문장은 cron JSON·Action 결과·Publish 모달(`components/publish-button.tsx:555`)·`console.warn`(`lib/pull/trigger.ts:53`)으로 간다. cron에는 누구의 언어로 쓸지 정할 사용자가 없다.
  **수정: `warnings`가 `{ surfaceSlug, path, code }`를 싣고 문장은 화면에서 조립한다**(§1.4 계약과 같은 형). cron JSON·서버 로그는 `en`을 명시해 조립한다. 그 뒤에 `lib/pull/**`·`lib/push/**`의 사전 import 0을 소스 검사로 고정한다(tasks B1⑦).
  같은 형이 하나 더 있다: `app/(edit)/projects/actions.ts:563`의 `summarizeCandidates`가 `label`(`lib/onboarding/detect.ts:67`, `m.newProject.formats`)을 반환 데이터에 싣는다 — 이것도 코드로 바꾸고 화면이 조립한다. 그 밖의 Server Action은 이미 문장이 아니라 코드를 돌려준다(2026-10-04 실측).
- **인증 경계(§6·§8)**: `setUiLocale`은 공개 Action이지만 계정에 쓰는 대상은 **세션이 정한다**(입력 userId 없음). 쿠키 값은 서버에서만 읽고 `parseUiLocale`을 지난다.
  `/preferences`는 `isProtectedPath` + `requireUser` 두 층이다.
- **MCP의 쿠키 비사용(§6.45)**: `/api/mcp`는 계속 쿠키를 읽지 않는다 — 도구 응답은 en 고정이라 언어를 물을 일이 없다.
- **Analytics 허용 목록**: `/preferences`를 추가하지 않는다(앱 페이지). 공개 페이지 집계는 쿠키와 무관하다.
- **CSP**: 인라인 스크립트를 더하지 않는다.

## 11. 소환한 과거 함정 (POSTMORTEM)

| 일자 | 무엇 | 이 설계에서 |
|---|---|---|
| 2026-08-31 | 레이아웃과 페이지가 병렬로 렌더된다 | 언어를 레이아웃이 흘려보내지 않고 소비자마다 `getMessages()`(요청 `cache`) — §3.1 |
| 2026-09-07 | 클라이언트 번들 7.2MB, grep 패턴이 틀려 "안전"으로 읽었다 | 청크 실측 + ko·es 정적 import 금지 소스 검사 — §3.3 |
| 2026-09-07 · 09-08 | `revalidatePath`·`router.refresh`가 결과 문구를 씻었다 | `setUiLocale`은 성공 시 돌려줄 문구가 없고 Preferences는 성공 토스트를 띄우지 않는다 — §4·§5.2 |
| 2026-09-08 (code-review) | `DICT[key] ?? fallback`이 프로토타입 키에서 함수를 돌려줬다 | `parseUiLocale`은 `Object.hasOwn`. `pick()`은 사전 인자를 받는 지금 형태 그대로 쓴다 |
| 2026-09-19 | 꺼진 Radix Select가 마우스로 열렸다 | Preferences Select는 `RoleSelect` 가드 + 닫힌 트리거 typeahead 차단 — §5.2 |
| 2026-09-20 | 라벨 없는 `toLocaleDateString` 날짜(UTC를 말하지 않음) | 날짜는 언어별로 손으로 만들고 세 언어 모두 `UTC`를 남긴다 — §2 |
| 2026-09-20 | 커밋 뒤 캐시 오류가 전체 실패로 보고됐다 | `setUiLocale`은 `revalidateAfterCommit` — §4 |
| 2026-09-24 | 포커스가 `body`로 빠지는 자리 | 진행 중 `busy` 형 + `useLandAfter` — §4 |
| 2026-09-14 · 09-24 | 화면에 없는 버튼 이름을 불렀다 | ko·es 사전에도 링크↔버튼 이름 검사 — §2. 가이드는 en 라벨(수용한 대가) — §6 |
