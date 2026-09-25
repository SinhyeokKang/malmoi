# privacy-shell — 설계

## 선행 조건 — 시안

정본: Claude Design `b99d54cd-3034-44f1-8446-0a864da9d767`의 `Landing.dc.html` **1e** + `Landing Prototype.dc.html`의 `isPrivacy` 분기(2026-09-26 동결 — 추가 라운드 없음).
1h(`/docs` 페이지 구성)와 1e의 `/docs` 서술은 읽지 않는다(spec 비목표).

## 영향 받는 흐름

push·pull·편집 UI 어디에도 붙지 않는다. **공개 라우트 `/`·`/privacy`의 표현층**만 바뀐다. 인가 모델은 그대로다 — `/privacy`는 `entry-points.test.ts`의 `EXEMPT`이고 matcher 밖이다.

## 구조

```
components/public-shell/            ← components/landing/shell/ 에서 옮긴다 (소비자가 둘이 된다)
  public-shell.tsx                  PublicShell({ cta, current, children })  (옛 LandingShell)
  header.tsx · footer.tsx · scroller.tsx
components/privacy/                 privacy-doc(서버 — 그릇·타이포) · toc(클라이언트 잎 — 현재 절 추적)
components/public-doc-table.tsx     DocTable — /docs(PublicDoc)와 /privacy가 같은 표 규칙을 쓴다 (PublicDoc에서 추출)
lib/public-doc/toc.ts               currentSection (순수, 잎)
lib/auth/landing.ts                 publicCta (순수 — rootView 옆)
app/privacy/page.tsx                readSession → <PublicShell cta=… ><PrivacyDoc …/></PublicShell>
app/page.tsx                        <PublicShell cta=publicCta("none") current="home">
```

- **셸을 옮기고 이름을 바꾼다** — `LandingShell` → `PublicShell`, `data-landing-scroller` → `data-public-scroller`(스테이지 `components/landing/stage.tsx`의 `closest(...)`와 테스트 셋이 따라간다).
  DIRECTORY의 "공용 공개 셸이 아니다" 문장이 거짓이 되므로 같이 고친다.
- **헤더가 받는 것은 둘이다**: `cta: { href, label }`(세션 판정은 페이지가 한다 — 헤더는 서버 컴포넌트지만 세션을 직접 읽지 않는다) · `current?: "home"`(Home의 `aria-current`).
  선택 상태를 그리지 않는 규칙은 그대로다.
- ⚠️ **route group 레이아웃으로 만들지 않는다**(랜딩과 같은 판단) — 페이지마다 셸을 렌더해야 이동 때 스크롤러가 다시 마운트되어 스크롤이 맨 위로 간다.
- `PublicDoc`은 **`/docs` 전용**으로 남고 `signedIn`·복귀 링크·`m.publicDocs.back`을 그대로 든다. 표 렌더(`role="region"` 스크롤 래퍼 + `Table scrollable={false}` + `TableHead`/`Td` 혼용)만 `DocTable`로 뽑아 둘이 쓴다 —
  표 규칙(§6.61의 가장 긴 행)을 두 벌로 두지 않는다. `p`·`ul`은 두 그릇의 타이포가 달라 각자 든다.

### 문서 그릇 (시안 1e · Prototype `isPrivacy`)

| 요소 | 값 |
|---|---|
| 컨테이너 | `mx-auto max-w-[1120px] px-10 py-30` · grid `minmax(0,720px) 200px` · `justify-between` · gap 64 |
| h1 | 36 · 1.3 · 500 |
| 시행일 | 14 · 1.6 · muted · mt 12 · `<time dateTime>`(§6.61 규칙 유지) |
| 도입 | 16 · 1.75 · mt 24 · `text-wrap: pretty` |
| 구분선 | 1px `--border` · mt 40 |
| h2 | 24 · 1.4 · 500 · 첫 절 mt 48, 이후 56 · `id` 필수(§6.61) |
| 본문 p | 16 · 1.75 · mt 16 · foreground(muted 금지 — §6.61) |
| 목록 | `pl-[22px]` · 항목 간격 8 · 16/1.75 |
| 표 | mt 24 · 래퍼 `border rounded-xl overflow-auto` · 셀 14/1.6 · 머리 13/500 muted `--primary-foreground` 면 |
| 본문 링크 | blue-600 · 밑줄 없음(§6.3) — `[&_a]:` 변형 |
| TOC | `<nav aria-label="On this page">` sticky top 48(스크롤러 기준) · 제목 13/500 · 목록 좌측 선 `--border` · 항목 13/1.5 · 6/0/6/12 · 현재 = 선·글자 foreground, 나머지 muted · hover foreground |

- 라벨 `On this page`는 사전(`m.publicDocs.privacy.toc` — **`sections` 밖**에 둔다: `policy-gate.test.tsx`가 `sections`·`effectiveDate`를 해시하므로 그 안에 넣으면 개정 이력이 요구된다).
- 새 raw 색 0 — blue-600(등재)·토큰뿐. `max-w-[1120px]` 같은 임의 값이 `visual-system.test.ts`에 걸리면 등재 대신 토큰/유틸로 푼다(구현 시 확인).

### TOC 동작

- `currentSection(offsets, scrollTop, 96)` → index. 윗변(스크롤러 기준 `offsetTop`)이 `scrollTop + 96`을 넘지 않은 **마지막** 절, 없으면 0(시안 Prototype 식 — `offsetTop − 96 <= st`).
- 클라이언트 잎 `toc.tsx`: `closest("[data-public-scroller]")`로 스크롤러를 찾고 `scroll`(passive) → rAF → `currentSection` → 바뀔 때만 상태(항목 수 7 — setState 가능, 스테이지와 달리 DOM이 작다).
  절 offset은 `ResizeObserver`(스크롤러) + `document.fonts.ready`에서 다시 잰다.
- 클릭: `preventDefault` → `scroller.scrollTo({ top: offsetTop − 48, behavior: reduced ? "auto" : "smooth" })` + `history.replaceState(null, "", "#id")`. `matchMedia` reduced는 effect 안에서 읽는다(`dot-field.tsx:88` 형).
  JS 없이는 `href="#id"`가 브라우저 기본 이동을 한다(중첩 스크롤러도 fragment 대상으로 스크롤된다 — `[browser]`로 확인).
- ⚠️ 스크롤러의 마운트 포커스는 `preventScroll: true`라 하드 해시 착지를 되돌리지 않는다(랜딩 셸 그대로 — 확인만).

## 순수 함수 (`/tdd` 대상)

| 함수 | 위치 | 입력 → 출력 |
|---|---|---|
| `currentSection` | `lib/public-doc/toc.ts` | `offsets: readonly number[], scrollTop, offset` → index (빈 배열 → 0, NaN 방어) |
| `publicCta` | `lib/auth/landing.ts` | 세션 status → `{ href, label }` — 맵 + `satisfies Record<SessionRead["status"], …>`(`REJECT`·`ROOT`와 같은 관용구). `ok`만 `Open Malmoi` |

- `lib/public-doc/toc.ts`는 클라이언트가 값으로 읽는다 → `client-graph.test.ts`의 `CLIENT_LIB_FILES` 등재 + 잎 검사. `publicCta`는 서버(페이지)만 부른다.
- `publicCta`의 라벨은 `m.landing.shell.getStarted`와 새 `m.landing.shell.openMalmoi`를 쓴다 — `lib/auth/landing.ts`가 `m`을 import하게 되면 그 잎 주석("`lib/routes.ts`만 읽는다")이 거짓이 된다 → **라벨 키만 돌려주고(`label: "getStarted" | "openMalmoi"`) 헤더가 사전을 읽는다.** 잎을 지킨다.

## 스키마 · 환경변수

없음 · 없음.

## 불변식 영향

- ARCHITECTURE §0: 없음. 인증 경계: 라우트·matcher·`EXEMPT` 불변. `/privacy`가 세션을 읽는 이유가 "복귀 링크"에서 "헤더 primary"로 바뀐다(차단 아님 — 페이지 주석 갱신).
- 개인정보 방침: 본문 불변 → 개정 이력 불필요. 새 목적·전송처·쿠키 0.

## POSTMORTEM 인용

- **2026-09-19 (`scrollable={false}` 표 컨테이너)** — 표 래퍼는 `DocTable`로 옮기되 형을 바꾸지 않는다. 셸 안에서도 가로 스크롤은 표 자기 컨테이너가 든다.
- **2026-09-15 (이름 없는 `<section>`)** — 절마다 `aria-labelledby`(h2 id) 유지. TOC `nav`에 이름.
- **2026-09-05 (경로 문자열)** — CTA href는 `routes.*`.
- **2026-09-10 (SVG `next/image` stub)** — 셸 로고가 `/privacy` 테스트에도 렌더된다(기존 stub이 덮는다 — 확인).
- **2026-09-23 (스텁 없이 분기가 안 돈다)** — TOC jsdom 테스트는 `matchMedia`·`ResizeObserver`·rAF를 `vi.stubGlobal`로 세운다.
- **build-while-dev(메모리)** — 브라우저 확인 전 `pnpm build`를 dev와 겹치지 않는다.

## 문서 갱신 (구현 시)

- DESIGN §6.61: 제목을 `/docs` 전용으로 좁히고, `/privacy`는 새 절(또는 §6.615의 하위)로 — 공개 셸 + 문서 그릇 표 + TOC. **320px 규칙은 `/docs`에만.** §6.615의 셸 서술을 "랜딩 · `/privacy` 공용"으로.
- PRODUCT §7.7 `/privacy` 행(✅ 공개 셸) — 필요 시.
- DIRECTORY: `components/public-shell/`(옮김) · `components/privacy/` · `components/public-doc-table.tsx` · `lib/public-doc/` · `components/landing/`의 "공용 공개 셸이 아니다" 문장 삭제.
- 코드 주석: `app/privacy/page.tsx`(세션을 읽는 이유) · `components/public-doc.tsx`(`/privacy`·`/docs` 공유 → `/docs` 전용).
