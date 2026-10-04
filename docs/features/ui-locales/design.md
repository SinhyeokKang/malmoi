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
| 화면 라벨 | Preferences의 `Language`. 설명문에 "프로젝트의 언어는 바뀌지 않는다"를 적는다(번역 화면의 언어 열과 혼동하지 않도록) |

## 1. 영향 받는 흐름

- **push / pull / export: 영향 없다.** 어댑터·적재·Publish의 판정은 바뀌지 않는다. 바뀌는 것은 그 결과를 **어떤 언어 문장으로 보이느냐**뿐이다.
- **편집 UI 전체 + 공개 셸**: 문구를 읽는 방식이 상수 import에서 요청별 사전으로 바뀐다(§3).
- **새 화면 1**: `/preferences`(사용자 축 — `/account`·`/mcp`와 같은 층).
- **새 Server Action 1**: `setUiLocale`(공개 푸터와 Preferences가 같이 쓴다).

## 2. 순수 함수 (= `/tdd` 진입점)

| 함수 | 위치 | 계약 |
|---|---|---|
| `parseUiLocale(raw: unknown): UiLocale \| null` | `lib/i18n/locales.ts` (잎) | 지원 집합 안의 문자열만 통과시킨다. **`Object.hasOwn`으로 판정한다** — `__proto__`·`constructor`·`toString`이 통과하면 안 된다(CLAUDE.md "남이 정한 키" — 쿠키 값은 남이 정한 값이다). 대소문자·공백을 정규화하지 않는다(쓰는 쪽이 우리뿐이다) |
| `resolveUiLocale({ account, cookie }): UiLocale` | 같은 파일 | `parseUiLocale(account) ?? parseUiLocale(cookie) ?? "en"`. **`Accept-Language`는 입력에 없다** — 받을 자리가 없어서 읽을 수도 없게 한다 |
| `planUiLocaleWrite({ locale, signedIn }): { cookie: true; account: boolean }` | 같은 파일 | 쿠키는 항상 쓰고, 계정은 로그인했을 때만 쓴다(spec 결정). 로그아웃 뒤에도 그 기기가 같은 언어를 보게 하려고 로그인 중에도 쿠키를 쓴다 |
| `UI_LOCALE_NAMES: Record<UiLocale, string>` | 같은 파일 | 언어 이름은 **그 언어 자체의 표기(endonym)**로 쓰고 번역하지 않는다 — `English` · `한국어` · `Español`. ko 화면에서 영어를 찾는 사람도 `English`를 읽을 수 있어야 한다 |
| `utcDay(at, locale)` · `utcMinute(at, locale)` · `utcMonth(at, locale)` | `lib/utc-time.ts` (잎 유지) | 언어별 형식을 **손으로 만든다** — `Intl` 날짜 포맷터를 쓰지 않는 규칙(POSTMORTEM 2026-09-20)을 그대로 따른다. en `Sep 27, 2026 16:34 UTC` · ko `2026년 9월 27일 16:34 UTC` · es `27 sept 2026 16:34 UTC`. **UTC 표기는 세 언어 모두 남긴다** |
| `relativeTime(then, now, locale)` | `lib/relative-time.ts` | `Intl.RelativeTimeFormat(locale, { numeric: "auto" })`. 지금도 `Intl`을 쓰는 자리이고 언어 인자만 늘린다 |
| `type Messages` | `lib/i18n/index.ts` | `typeof en`은 `as const`라 **값이 리터럴 타입**이다(`"Search"`). 그대로 두면 ko가 `satisfies`를 통과할 수 없다. 리터럴 문자열을 `string`으로 넓히고 함수 시그니처·중첩 구조는 그대로 두는 `Widen<T>` 타입을 둔다. `expectTypeOf`로 고정한다 |

사전 정합성 검사 둘(테스트):

- **키·시그니처 정합**은 `messages/ko.tsx`·`es.tsx`의 `satisfies Messages`가 컴파일 시점에 든다(빠진 키·남는 키·인자 다른 함수가 전부 red).
- **번역 누락 탐지**: 사전을 재귀로 펼쳐 문자열 값이 en과 **같으면** 허용 목록에 있어야 한다(`Malmoi`·`GitHub`·`Google`·`MCP`·`OAuth`·`URL`·`YAML`·코드 예시 등).
  함수 값은 대표 인자로 호출해 비교한다(대표 인자 표는 테스트가 든다). 복붙만 하고 번역하지 않은 문장은 이 검사가 잡는다.

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
| 클라이언트 컴포넌트 | `const m = useMessages()` (`components/i18n/messages-provider.tsx`, `"use client"`) | 루트 레이아웃이 `<MessagesProvider uiLocale={…}>`를 렌더한다. **사전 객체를 prop으로 넘기지 않는다** — 함수·ReactNode 값이 있어 RSC 경계를 넘지 못한다. 넘기는 것은 언어 코드 하나다 |
| `lib/`의 문구 조립 모듈(약 40곳) | **`m: Messages`를 인자로 받는다** | 모듈 최상위에서 `m.…`로 상수를 만드는 파일(`lib/settings/message.ts`·`lib/auth/message.ts`·`lib/onboarding/message.ts`·`lib/upload/message.ts`·`lib/i18n/adapter-errors.ts`·`lib/events/view.ts` 등 12곳)은 상수를 `m`을 받는 함수로 바꾼다 |
| **영어로 고정되는 표면** | `import { en } from "@/messages/en"`로 **명시한다** | `lib/mcp/**`(MCP 도구 응답 — 에이전트가 읽는다) · `lib/invitation-email/**`(받는 사람의 언어를 모른다) · `lib/seo/**`(크롤러는 쿠키가 없다) · `app/global-error.tsx`(루트 레이아웃 밖이라 provider가 없다). 이름이 `m`이 아니라 `en`이라 "일부러 영어"가 코드에 보인다 |

`useMessages()`의 **기본값(provider 없음)은 en**이다 — 그래서 provider 밖에서 렌더되는 `global-error.tsx`와, 컴포넌트만 렌더하는 기존 DOM 테스트가
그대로 돈다. 대가는 "provider를 빠뜨리면 조용히 영어"라는 것이고, 루트 레이아웃 테스트가 provider 존재를 고정해 막는다.

### 3.3 클라이언트 번들 — en만 정적으로, ko·es는 별도 청크

실측(2026-10-04): `messages/en.tsx`를 minify하면 102KB, gzip하면 30KB다. **지금도 `m`을 읽는 클라이언트 컴포넌트가 있어서 en 전체가 이미 번들에 들어 있다.**
세 사전을 모두 정적으로 import하면 모든 사용자가 사전 셋을 받는다(+60KB 이상).

- `lib/i18n/load.ts`: `loadMessages(locale)` — en은 정적 import, ko·es는 `import("@/messages/ko")` 동적 import. 언어별 Promise를 모듈 Map에 하나만 둔다(`use()`에 넘길 Promise가 렌더마다 같아야 한다).
- provider는 `use(loadMessages(uiLocale))`로 읽는다. en이면 이미 resolve된 값이라 멈추지 않는다. ko·es는 SSR에서는 서버가 바로 resolve하고, 하이드레이션 때 그 청크 하나를 받는다.
- ⚠️ **청크 크기를 눈으로 잰다** — `pnpm build`의 라우트 표는 청크 크기를 말하지 않는다. 7.2MB가 그렇게 나갈 뻔했다(POSTMORTEM 2026-09-07).
  완료 조건 10을 `.next/static/chunks` 실측으로 검증하고, ko·es 사전이 en 페이지의 client-reference-manifest에 걸리지 않는지 본다.
- ⚠️ **`messages/ko.tsx`·`es.tsx`를 정적으로 import하는 곳은 `lib/i18n/load.ts` 하나뿐이다** — 다른 곳에서 정적으로 import하면 그 순간 모든 사용자 번들에 실린다. 소스 검사 테스트로 고정한다.
- `lib/i18n/index.ts`·`locales.ts`는 **잎으로 남는다**(`components/__tests__/client-graph.test.ts`). `load.ts`는 `@/messages/*` 외에 import이 없다. ARCHITECTURE의 잎 명부에 `lib/i18n/locales.ts`를 더한다.

### 3.4 이행 순서 (green을 유지하며)

1. 새 입구(`getMessages`·`useMessages`·`Widen`)를 먼저 세우고, **`m`은 en 별칭으로 잠시 남긴다.**
2. 영역별로 소비자를 옮긴다. 배치마다 `pnpm gate`가 green이다.
3. 마지막 배치에서 **`export { en as m }`을 지운다** — 남은 소비자는 typecheck가 이름을 대며 red로 잡는다. 이게 "옮기지 않은 파일 0"의 증명이다.

## 4. 언어 바꾸기 — `setUiLocale` Server Action

- 위치: **`app/locale/actions.ts`** — 라우트가 없는 Action 전용 디렉터리다. 공개 셸이 부르는 읽기 Action `app/search/actions.ts`가 선례다.
  `/preferences` 아래에 두지 않는 이유는 **공개 푸터(비로그인)가 같은 Action을 부르기** 때문이다 — 보호 경로 아래 이름이면 경계가 헷갈린다.
- 입력: `uiLocale` 하나. `parseUiLocale`을 지나지 못하면 아무것도 안 쓰고 실패를 돌려준다.
- 처리: `planUiLocaleWrite` 대로 ①쿠키를 쓰고 ②`readSession()`이 `ok`이면 **세션의 `userId`로** `User.uiLocale`을 갱신한다. 입력에 userId를 받지 않는다.
  세션 읽기가 `unavailable`이면 쿠키만 쓰고 그 사실을 돌려준다(화면 언어는 바뀌고, 다른 기기에는 안 퍼진다).
- 쿠키: `malmoi-ui-locale` · `httpOnly` · `SameSite=Lax` · `Secure`(https) · `Path=/` · `Max-Age` 1년. **http-only로 둬서** 방침의 "All of them are http-only" 문장을 참으로 유지한다 — 클라이언트는 쿠키를 읽을 필요가 없다(provider가 서버에서 받은 코드를 쓴다).
- 갱신 후 `revalidatePath("/", "layout")` — 루트 레이아웃이 언어를 읽으므로 전 화면이 대상이다. 이 Action은 성공 시 돌려줄 결과 문구가 없어서 POSTMORTEM 2026-09-07(`revalidatePath`가 결과 문구를 씻었다)의 형에 걸리지 않는다. **실패 문구는 revalidate하지 않는 갈래에서만 돌려준다**(실패면 바뀐 것이 없다).
  ⚠️ **Action은 문장이 아니라 코드를 돌려준다**(`ok` · `invalid` · `failed` · `device-only`). `device-only`는 revalidate **뒤에** 화면에 서야 하는 유일한 갈래이고, 그 문장은 **새 언어로** 나와야 한다 —
  문장을 Action이 만들면 옛 언어로 고정된다. 클라이언트 상태에 코드만 들고 `useMessages()`로 그린다. ⚠️ **provider에 `key={uiLocale}`을 걸지 않는다** — 걸면 언어가 바뀔 때 트리가 다시 마운트되어 그 상태가 사라진다(POSTMORTEM 2026-09-07과 같은 형).
- `ProjectEvent`를 남기지 않는다 — 프로젝트 상태가 아니다.

## 5. 화면

### 5.1 공개 푸터 — `LocaleSwitcher`

- 소비자: `components/public-shell/footer.tsx`(공개 셸)와 `AuthLayout`(`/signin`·초대·계정 병합). 푸터 자체는 서버 컴포넌트로 남고 스위처만 클라이언트다.
- 형: **텍스트 버튼**(지구본 아이콘 + 현재 언어의 endonym) → **기존 `DropdownMenu`의 라디오 목록** 세 줄. 사용자가 말한 "콤보박스"를 이 조합으로 읽는다 —
  항목이 셋이라 검색 입력이 필요 없고, `components/ui/`에 콤보박스 프리미티브가 없으며, 새로 만들면 소비자 없는 기능(검색)을 선반영하게 된다.
- 고르면 `setUiLocale` → 같은 페이지가 새 언어로 다시 그려진다. 진행 중에는 트리거를 비활성으로 둔다.

### 5.2 `/preferences`

- IA: **사용자 축**(`/account`·`/mcp` 옆). `routes.preferences()` · `isProtectedPath` 정규식 1줄(`/mcp`와 같은 모양) · robots `disallow` · 사용자 메뉴 항목 · 검색 `Pages` 행.
- 구성: 페이지 제목 `Preferences` + **Language 카드 하나**. 카드 안은 기존 `Select` 프리미티브(옵션 셋, endonym) + 설명 한 줄. `/account`의 `Card` 껍데기를 쓴다.
  **고르는 즉시 적용한다(저장 버튼 없음)** — 푸터와 같은 Action·같은 동작이고, 화면 전체가 새 언어로 다시 그려지는 것 자체가 피드백이라 토스트를 띄우지 않는다. 진행 중에는 `Select`가 비활성이다.
  타임존·테마 자리는 만들지 않는다(spec 비목표).
- 사용자 축 내비(`navWorkItems` — 사이드바 사용자 구역과 사용자 메뉴가 같은 목록)에 `Account` 다음으로 `Preferences`를 넣는다.
- 인가: 페이지 최상단 `requireUser`. Action은 §4.
- 시안: **Claude Design 핸드오프를 먼저 만든다**(2026-10-04 사용자). 입력은 `design-brief.md`이고, 새 페이지의 초기 구현이므로 `/design-sync` 대상이다. 푸터 스위처도 같은 핸드오프에 넣는다.

### 5.3 `<html lang>`

루트 레이아웃이 `getUiLocale()`로 `lang`을 정한다. 루트 레이아웃은 이미 CSP nonce 때문에 동적이라 새로 동적이 되는 페이지는 없다.
`force-static`인 것(`/sitemap.xml`·`/llms*.txt`·`/api/search-index`)은 레이아웃을 지나지 않거나 영어 고정 표면이라 영향이 없다.

### 5.4 글꼴

es는 라틴 확장(á é í ñ ó ú ü ¿ ¡)이고 Geist가 덮는다 — 구현 단계에서 실제 렌더로 확인한다. ko는 지금 폴백인 Pretendard가 맡는다. 글꼴 스택 변경은 없다.

## 6. 번역 원고

- ko·es 초안은 에이전트가 쓴다(3,840줄 × 2). **ko는 사용자가 검수한다. es는 에이전트 초안 그대로 내보낸다**(2026-10-04 사용자 확정) — 원어민 검수 없이 나가는 품질 위험을 감수한다.
- 문체: en은 DESIGN §10(sentence case · 라벨 마침표 없음 · "please/sorry" 금지 · 오류는 다음 행동을 말한다 · 편집자 화면에 git 어휘 금지). ko·es도 같은 규칙을 따르고, 언어별 규칙을 DESIGN §10에 더한다.
  - ko: **합니다체**(2026-10-04 확정). 버튼·라벨은 명사형 또는 동사 원형.
  - es: **tú**. 라벨은 동사 원형(`Guardar`·`Publicar`).
- 용어집(2026-10-04 확정 — 기능 이름은 번역한다): 고유명사(`Malmoi`·`GitHub`·`Google`·`MCP`·`OAuth`)는 그대로. 기능 이름은 번역한다.

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

  ⚠️ 가이드(`guide/**.md`)는 영어 그대로라 ko 화면의 `게시` 버튼을 가이드는 `Publish`라고 부른다. `terminology.test.ts`(가이드 ↔ en 사전)는 en 기준으로 그대로 돈다.
- `brand-spelling.test.ts`: ko·es 화면에서도 제품 이름은 `Malmoi`다. 사전 셋을 모두 검사 대상에 넣는다.
- `no-korean-ui.test.ts`: **`messages/ko.tsx` 한 파일만** 예외로 둔다. 다른 소스의 한글 리터럴 0은 그대로 유지된다 — 사전 밖으로 한글이 새는 것을 막는 검사의 목적은 변하지 않는다.

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
  ⚠️ PR 본문·커밋 메시지처럼 **리포에 남는 문장**이 사전을 읽는다면 영어로 고정한다 — 누가 Publish했느냐에 따라 같은 DB 상태에서 다른 PR 본문이 나오면 안 된다. 2026-10-04 확인: `lib/pull/**`·`lib/push/**`는 사전을 읽지 않는다(`lib/publish/plan.ts`는 화면용 미리보기 문구다). 이 상태를 소스 검사 테스트로 고정한다.
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
| 2026-09-07 · 09-08 | `revalidatePath`·`router.refresh`가 결과 문구를 씻었다 | `setUiLocale`은 성공 시 돌려줄 문구가 없고 Preferences는 토스트를 띄우지 않는다 — §4·§5.2 |
| 2026-09-08 (code-review) | `DICT[key] ?? fallback`이 프로토타입 키에서 함수를 돌려줬다 | `parseUiLocale`은 `Object.hasOwn`. `pick()`은 사전 인자를 받는 지금 형태 그대로 쓴다 |
| 2026-09-20 | 로케일 날짜 포맷터 금지(ICU·TZ 의존) | 날짜는 언어별로 손으로 만든다 — §2 |
