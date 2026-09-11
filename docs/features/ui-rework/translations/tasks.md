# 8-4 번역 화면 — tasks

✅ **T1~T11·T13이 dev까지 갔다** (2026-09-11, `/ship bypass`). **남은 것 둘은 T0(국기 에셋 — 사용자가
준다)와 T12(903키 실측)**이고 둘 다 blocker가 아니다. ⚠️ **커밋 경계는 문서의 것과 갈렸다** —
T3/T4는 한 커밋에서만 typecheck가 green이고(페이지가 `type Search`를 바꾸는 순간 조립이 따라와야
한다), 그래서 `refactor(routes)`와 서버 조립을 `feat(translations)` 하나로 합쳤다. 옛 함수 제거는
그 뒤 `refactor(keys)`가 했다.

**순서 원칙**: 순수 판정 → URL 계약 → 서버 배선 → 프리미티브 → **문구** → 화면 → 방어선 → 문서.
**커밋 경계는 `—— commit ——`로 표시한다.**

⚠️ **커밋마다 `pnpm typecheck && pnpm test`가 green이다.** 시그니처를 바꾸는 셋은 **새 이름으로
병행 추가**하고 T4에서 옛 이름을 지운다 — 한 커밋에서 바꾸면 유일한 호출부(`translations/page.tsx`)가
T4까지 red인데 **검증줄이 `pnpm test`뿐이면 vitest가 타입을 안 봐서 green으로 보인다**
(POSTMORTEM 2026-09-07 "검사가 자기 대상의 일부만 본다").

⚠️ **`[manual]`이 붙은 줄은 사람이 눈으로 보는 것이다** — 이 리포엔 e2e가 없다. 자동 검증과 같은
줄에 섞어 쓰지 않는다(SAAS §8 2단계가 쓰는 관용구).

✅ **spec의 결정 다섯이 닫혔다** (2026-09-11 사용자 + `/feature-review`): Publish·배너는 **이 화면
머리에 남기고**(규약 8 한시 예외), `?focus=`는 **`?locales=` 다중**, 상태 필터는 **빼되 pending 우선
정렬로 갚고**, 국기는 **에셋 + CSS `background-image`**, breadcrumb은 **화면 다섯에서 함께 지운다**.

⚠️ **T0(에셋 요청)은 blocker가 아니다** — 국기가 없어도 폴백(코드만)으로 화면이 선다.

---

## T0. 에셋 요청 — 국기 SVG (⚠️ 병렬, blocker 아님)

- [x] 사용자에게 요청한다 (규약 2 — 에셋은 에이전트가 Figma에서 임의로 뽑지 않는다)
      - 시안의 `flag/KR`·`flag/GB`·`flag/JP`를 포함한 **국기 SVG 세트**, 16×11
      - 파일명 제안: ISO 3166-1 alpha-2 소문자 (`kr.svg`·`gb.svg`·`jp.svg`)
      - 둘 자리: **`public/flags/`** — ⚠️ `public/fonts/`(생성물, gitignore)와 반대로 **커밋된 원본**
        이다. `public/brand/`가 8-1a에 같은 이유로 열렸고 그 구별이 DESIGN에 등재돼 있다
- [x] **어느 로케일 코드에 어느 국기를 붙일지의 첫 목록**도 함께 받는다 — `en → gb`는 알고리즘이
      낼 수 있는 답이 아니다 (design §3.7)
      - ✅ **2026-09-11에 받았다**: alpha-2 **전 세트 253개**(`GE-AB`·`GE-OS`는 뺐다 — 하위태그로
        올 수 없다) + 규칙 셋 — `en`→GB는 **국가가 특정되지 않았을 때의 폴백**이고,
        `en-GB`→GB·`en-US`→US는 **하위태그가 그 표를 이기는** 기존 순서가 그대로 낸다
      - ✅ **언어 표를 넓혔다** (2026-09-11 사용자 — "언어명과 나라가 사실상 1:1인 것만"). 유럽·
        아시아·아프리카의 그 부류를 더해 **쉰여섯**이 됐다. ⚠️ **뺀 쪽이 경계다**: `es`·`pt`·`ar`·
        `sw`·`ta`·`ca`·`eu`·`gl`·`cy`는 주요 사용국이 둘 이상이라 하나를 고르면 **절반에게 틀린
        국기**가 되고 그건 없는 것보다 나쁘다 — `null`로 떨어져 코드만 그린다. 다만 `es-MX`·
        `pt-BR`처럼 **하위태그가 붙으면 표를 안 지나고 정확히 선다**
- **검증**: `[manual]` 파일 목록과 `lib/keys/flag.ts`의 보유 목록이 일치한다. **T11의 대조 테스트가
  그것을 상시로 센다**(에셋 도착 전에는 목록이 비어 있고 그 상태로도 green이다)

## T1. 순수 판정 — 로케일 선택 · 집계 · 정렬 · 국기

⚠️ **전부 새 이름으로 추가한다. 옛 `namespaceCounts`·`filterRows`는 T4까지 그대로 산다.**

- [x] `lib/keys/view.ts` — `parseLocaleSelection(param, locales)` 신설 (design §3.1)
      - 인자는 **`readonly { code, orphaned }[]`** — 코드 배열이 아니다
      - 미지정·빈 값·전부 걸러짐 → **살아 있는 로케일 전체**. ⚠️ 폴백이 빈 배열이면 화면이 통째로 빈다
      - ⚠️ **폴백에서 orphaned를 빼고 명시 선택은 허용한다** — 안 그러면 `defaultNamespace`가
        행이 전부 disabled인 ns에 착지한다
      - 순서는 **인자 순서**(base 먼저), 중복은 접는다
      - ⚠️ **배열 `includes`로 검증한다** — 주소창 값이라 객체 조회는 프로토타입 키가 샌다
        (`parseProjectFilter`와 같은 관용구)
- [x] `namespaceCountsFor(rows, locales)` 신설 (design §3.2)
      - ⚠️ **키 단위로 한 번만 센다** — 로케일마다 세면 `pending`이 `total`을 넘는다
      - ⚠️ 누산기는 `Map` (네임스페이스 이름이 리포의 키다)
- [x] `filterRows`에 `{ q, locales }` 갈래 추가 (design §3.3, spec Q3)
      - ⚠️ **`q`의 대상을 선택된 로케일로 좁힌다** — 안 좁히면 숨긴 로케일 값에 맞은 키가 이유 없이 난다
      - ⚠️ **함수를 지우지 않는다** — 인라인 `filter`로 내리면 그 규칙이 화면 코드가 된다
- [x] `pendingFirst(rows, locales)` 신설 (design §3.8, spec Q3)
      - ⚠️ **안정 정렬** — 같은 통 안에서 `compareKeys` 순서를 보존한다. 정렬을 두 벌로 만들지 않는다
      - orphaned 키는 pending으로 치지 않는다 (편집할 수 없다)
- [x] `groupByNamespace(rows, counts)` 신설 (design §3.6)
      - ⚠️ **순서를 `counts`에서 받는다** — `rows`만 받으면 출처가 Postgres collation이라
        `compareKeys`와 갈릴 수 있다
      - ⚠️ 누산기는 `Object.create(null)` 또는 `Map`
- [x] `lib/keys/flag.ts` 신설 — `flagFor(code)` (design §3.7)
      - ⚠️ **잎(import 0)** — 2,709번 렌더되는 클라이언트 트리가 읽는다
      - `_`/`-` 정규화 · 하위태그 우선 · 명시 표(`en → gb`) · **보유 목록에 없으면 `null`**
      - **보유 목록은 코드 상수다** (fs 스캔이 아니다 — 순수 함수여야 한다)
- [x] ⚠️ **`untranslated`·`needsReview` 집계를 지우지 않는다** — 상태 필터가 사라져 드롭다운의
      `pending/total`과 `pendingFirst`가 **둘 다 그 위에 선다** (spec Q3)
- [x] `defaultNamespace`는 **손대지 않는다**
- **검증**: `pnpm typecheck && pnpm test`. 케이스로 **반드시** 있어야 하는 것:
  - `parseLocaleSelection`: 전체 폴백 · **폴백이 orphaned를 뺀다** · **명시 선택은 orphaned를 허용** ·
    중복 · 미지의 코드 · 빈 문자열 · **`__proto__`** · 선택 0개
  - `namespaceCountsFor`: **pending 합계 ≤ total** · 로케일 둘 중 하나만 미번역 · `__proto__` 네임스페이스
  - `filterRows`: 선택 밖 로케일 값에 맞아도 **안 걸린다**
  - `pendingFirst`: 같은 통의 순서 보존 · orphaned 키는 안 올라온다
  - `groupByNamespace`: **`.map(g => g.namespace)`가 `namespaceCountsFor(...).map(c => c.namespace)`와
    같다**(T8의 목측을 단위 테스트로 내린 것이다) · 빈 배열
  - `flagFor`: `null` 갈래 셋(국가 없는 언어 · 임의 문자열 · 표엔 있는데 보유 목록에 없는 코드) ·
    `zh_CN` = `zh-CN`

—— commit —— `feat(keys): make locale selection an axis instead of a focus column`

## T2. 잎 판정 — 칩

- [x] `lib/keys/filters.ts` 신설 — `activeFilters(query, ctx)` (design §3.5)
      - ⚠️ **잎이다** — import는 `lib/routes.ts`(그쪽도 잎)까지만. `lib/keys/view.ts`를 값으로 읽으면
        `compareKeys` → `lib/adapters/shared` 그래프가 번들에 온다 (POSTMORTEM 2026-09-07).
        **재수출도 하지 않는다**
      - **로케일 칩은 하나로 묶는다**(`Languages: ko, ja`) — 코드마다 내면 마지막 하나를 떼는 순간
        폴백이 걸려 **전체로 넓어지고**, 6로케일에서 칩 행 32px 한 줄을 넘는다
      - 로케일 칩은 **선택이 기본이 아닐 때만** 낸다
      - `next`가 **그 칩을 뗀 뒤의 쿼리**다 — 화면이 쿼리 조립을 다시 하지 않는다
- **검증**: `pnpm typecheck && pnpm test` — 칩 0개(기본 상태) · 셋 다 있는 상태 · 개별 제거 결과 ·
  **로케일 칩 제거가 `locales: undefined`를 낸다**

—— commit —— `feat(keys): derive filter chips from the URL query`

## T3. URL 계약 — `focus`·`state` 폐기

⚠️ **이 커밋이 red를 만드는 자리가 여섯이다. 전부 같은 커밋에서 고친다.**

- [x] `lib/routes.ts` — `TranslationsQuery`에서 **`focus`와 `state` 둘 다 제거**, `locales?: string` 추가
- [x] `translations/page.tsx`의 `type Search`를 맞춘다 (조립은 T4)
- [x] **`app/__tests__/entry-points.test.ts:472`** — `["ns","focus","q","state"]` 리터럴을 갱신한다.
      ⚠️ 이 줄이 이 배송에서 red를 내는 유일한 자동 검사이고, **무엇을 고쳐야 green인지가 여기 있다**
- [x] **`lib/__tests__/routes.test.ts:130·149`** — `focus`·`state` 값을 갱신
- [x] **`components/__tests__/home-screen.test.ts:41·46`** — `?focus=`를 **요구하는** 단언을 `?locales=`로
- [x] **`lib/keys/__tests__/view.test.ts`** — `filterRows({locale,state})`·`namespaceCounts(rows,"ko")` 갱신
- [x] `components/translations/filters.tsx`의 `query.state`·`query.focus` 참조 제거 (컨트롤 재작성은 T9)
- [x] `projects/[slug]/page.tsx:137`(진행률 행)·`:193`(활동 항목)의 `?focus=` → `?locales=`
      - ⚠️ **`locales/page.tsx`에는 대상이 없다** — `routes.translations` 호출이 0건이다
- **검증**: `pnpm typecheck && pnpm test` green.
  `[manual]` **파일 셋**(`lib/routes.ts` · `translations/page.tsx` · `components/translations/filters.tsx`)을
  `grep -n 'focus\|state'`로 눈 확인 — **식별자 형태도 0건**이어야 한다.
  ⚠️ 전역 grep을 쓰지 않는다: OAuth CSRF `state` 셋(`api/github/callback` · `account/actions` ·
  `session-revocation/http`)과 React 어휘를 물어 **잔존 여부를 못 가른다**.
  `[manual]` `lib/routes.ts`를 건드렸으므로 `lib/credentials/__tests__/postgres.integration.ts`의
  경로 단언 여섯과 무관함을 확인한다 (그 스위트는 `pnpm test` 밖이다 — POSTMORTEM 2026-09-10)

—— commit —— `refactor(routes): replace ?focus= with ?locales= on the translations screen`

## T4. 서버 페이지 — 조립 교체 + 옛 함수 제거

- [x] `page.tsx`가 `parseLocaleSelection` → `namespaceCountsFor(rows, selected)` → `resolveNamespace`
      → `filterRows({ q, locales })` → `pendingFirst` 순으로 조립
- [x] `?ns=*`면 `groupByNamespace(visible, counts)`로 섹션 배열을 만든다
- [x] **옛 `namespaceCounts`·`filterRows`의 옛 갈래를 지운다** — 호출부가 0인지 grep으로 확인
- [x] **`NamespacePanel`·`NsLink`를 지운다** (`page.tsx:307-365`) — 드롭다운이 그 역할을 가져간다.
      ⚠️ 남기면 같은 필터가 두 곳이고 하나가 낡는다 (`invite-form.tsx` 삭제와 같은 판정).
      `grep -rn 'NamespacePanel\|NsLink' app components` → 0건
- [x] ⚠️ **`{...query}` 전파를 유지한다** — ns를 바꿀 때 `locales`·`q`가 URL에 남아야 한다 (design §2)
- [x] ⚠️ **`requireProjectAccess`는 최상단 `await`로 유지한다** — 조건부 렌더로 바꾸면 RSC 페이로드에
      키가 실린다 (POSTMORTEM 2026-08-31, 실측 1.3MB)
- [x] ⚠️ **`maxDuration = 60`을 지운다는 생각을 하지 않는다** — 없으면 기본값 300이
      `STALE_AFTER_SECONDS`와 같아져 정상 실행이 스스로를 stale로 본다 (7단계)
- [x] ⚠️ **`countUnpublished`·`loadActors` 호출을 유지한다** — Publish·배너·`Edited by`의 소비자가
      이 화면에 그대로 있다 (spec Q1)
- [x] ⚠️ **로케일 0개 프로젝트의 조기 반환**(`page.tsx:83`)을 유지한다
- **검증**: `pnpm typecheck && pnpm test`.
  `[manual]` `pnpm dev`로 `?ns=`·`?ns=*`·`?locales=`·`?q=` 네 조합이 서버 렌더로 반영되고,
  **모르는 `?locales=` 값과 옛 `?focus=`가 기본 선택으로 떨어진다**(404도 빈 화면도 아니다).
  ns를 바꿔도 `?locales=`·`?q=`가 URL에 남는다

—— commit —— (T7과 묶는다 — 화면 없이 검증할 것이 표시 층뿐이다)

## T5. 프리미티브 — `DropdownMenuCheckboxItem` (design §9)

- [x] `components/ui/dropdown-menu.tsx`에 `radix-ui`의 `DropdownMenu.CheckboxItem`을 감싼다
      - `role="menuitemcheckbox"` + `aria-checked`를 Radix가 준다. ⚠️ 지금 `DropdownMenuItem`의
        `selected`는 `bg-muted` + `<Check>` **시각 표시만**이라 접근성 트리에 상태가 없다
      - ⚠️ **`onSelect` `preventDefault()`를 프리미티브가 든다** — Radix `Item`은 선택 시 메뉴를 닫고,
        소비자마다 기억하게 하면 하나가 빠진다
      - ⚠️ **`{children}`을 `Slot.Slottable`로 감싼다** (POSTMORTEM 2026-09-09)
      - ⚠️ **포커스 링 셋을 여는 태그에 리터럴로** — cva 베이스에 모으면 스캐너가 못 본다
- [x] 프리미티브가 **16 → 17**이 된다 — DESIGN §6.4 등재가 T13이 아니라 **이 커밋**이다
- **검증**: `pnpm typecheck && pnpm test`(`focus-ring` green) + `[manual]` 임시 소비자에서 열어
  선택·해제 두 방향을 누른다 — **메뉴가 안 닫히고 체크가 토글된다**

—— commit —— `feat(ui): add a checkbox item to the dropdown menu primitive`

## T6. 문구 — 화면보다 먼저

⚠️ **T9(툴바)보다 앞이다** — `messages/en.tsx`가 `as const`라 없는 키 접근이 곧 typecheck 실패다.

- [x] **폐기**: `columnKey` · `baseColumn` · `untranslated`(배지) · `filters.state*` 셋 ·
      **`filters.focus`("Language to track")** · **`noMatch.description`**(현재 문구가 "Clear the search
      or the state filter…"라 상태 필터가 사라지면 **거짓이 된다**)
- [x] **신설**: `All namespaces` · `Select locales` · 초기화 버튼의 접근 이름 · 칩 셋의 라벨
      (`Languages: {codes}` 포함) · 섹션 헤딩의 건수 포맷 · **네임스페이스 옵션 라벨의
      `{name} ({pending}/{total})` 포매터**(native `<select>`라 옵션 안에 배지를 못 그린다 —
      숫자가 라벨 문자열에 들어갈 수밖에 없다) · 로케일 배지의 접근 이름
- [x] `needsReview`는 **남는다** (배지가 유일한 신호다)
- **검증**: `pnpm typecheck && pnpm test` — `no-korean-ui` green,
  `satisfies Record<Union, string>`이 갈래 누락을 잡는다

## T7. 표 — 키 그룹 + 로케일 행

- [x] `components/translations/key-group.tsx` 신설 — 키 셀(320) + 로케일 행들
      - **`div` + `grid`다** — `<table>`/`rowSpan`이 아니다 (design §1.5, 결정 완료)
      - 키 셀: 키 이름(`text-mono`) · Orphaned 배지 · `description` · 코드 참조 (design §4)
      - 로케일 행: `LocaleBadge` · `TranslationInput` · **우측 고정 폭 메타 슬롯**
        (배지 둘 + `Edited by`, `shrink-0`)
      - 🔴 **STALE — 우측 슬롯이 malmoi#33에서 뒤집혔다** (2026-09-11 실물): 1280px에서 그 고정 폭
        160이 입력을 28px로 눌렀다. **배지 둘과 `Edited by`도 입력 아래 줄**이고 정본은 DESIGN §6.1이다
      - ⚠️ **저장 상태 4종은 우측이 아니라 입력 아래 줄이다** — `Not saved yet …`가 약 230px이고
        타이핑 중에 나타났다 사라져서, 우측에 두면 `field-sizing-content` textarea의 폭이 그때마다
        재계산된다 (design §4)
      - ⚠️ **`<main>`을 이 트리 또는 T10의 머리가 든다** — `shell-layout.test.ts:189`가 스스로
        "렌더 경로를 못 본다"고 적어 뒀으므로 `Centered`의 것만 남아도 green이다 (design §8-7)
      - ⚠️ **서버 컴포넌트다** — 클라이언트는 `TranslationInput`뿐. `lib/keys/view.ts`를 값으로 읽는
        `"use client"` 파일이 0건이라는 POSTMORTEM 2026-09-07의 상시 grep을 유지한다
- [x] `components/translations/locale-badge.tsx` — **국기(있으면) + 코드** + `(base)`
      - ⚠️ **CSS `background-image`다, `<img>`가 아니다** — `?ns=*`에서 2,709개의 요소가 생기는 것을
        피한다. 로케일 종류만큼 CSS 규칙이 있고 요소는 `<span>` 하나, 치수는 클래스가 든다 (design §3.7)
      - ⚠️ **국기가 없으면 아무것도 안 그린다** — 물음표·지구본을 쓰지 않는다 (spec Q4)
      - ⚠️ **orphaned 로케일은 배지 자체를 `danger` variant로** — 로케일 칸 80px에 별도 배지가
        안 들어간다. 사유 문장은 `disabled` 입력의 placeholder가 든다 (design §4)
- [x] `translation-input.tsx` — 시안대로 **테두리 없는 표면**으로. 포커스·hover에서 드러난다
      - ⚠️ **`placeholder`를 반드시 유지한다** — 배지·필터·테두리가 같은 배송에서 사라지므로
        미번역의 **유일한** 시각 신호다 (spec Q3)
      - ⚠️ **포커스 링 셋은 여는 태그에 리터럴로** (`focus-ring.test.ts`가 소스를 스캔한다)
      - ⚠️ `aria-label`은 `{키} · {로케일}` 그대로 — placeholder는 값이 차면 안 읽힌다
      - ⚠️ 저장 상태 4종은 **셀 안 시각 전용**이고 `role="status"`를 두지 않는다. 알림은 표 하나의
        `Announcer`가 든다 (2,709행이면 live region이 그만큼이다)
- [x] `Announcer`가 그룹 목록 전체를 감싼다 — 지금과 같다
- **검증**: `pnpm typecheck && pnpm test && pnpm build` green.
  `[manual]` 키 하나가 한 그룹이고 선택된 로케일 수만큼 행이 난다. orphaned 키·orphaned 로케일 둘 다
  `disabled`이고 사유가 화면에 있다. **값이 빈 셀에 placeholder가 보인다.**
  **타이핑 중에 입력 폭이 안 변한다**

—— commit —— `feat(translations): stack locales as rows under each key`

## T8. 섹션 헤딩 + pending 우선

- [x] `?ns=*`에서 네임스페이스마다 **`<h2>`** 헤딩 + 건수 배지. 단일 선택이면 헤딩 하나
      - ⚠️ **실제 `<h2>`여야 한다** — `div`+grid로 가면서 네임스페이스 간 이동이 heading 탐색으로만
        가능해졌다 (design §1.5)
- [x] 각 섹션 안에서 `pendingFirst` 순서로 렌더 (spec Q3)
- [x] ⚠️ **sticky로 만들지 않는다** — 시안이 스크롤 영역 안의 보통 블록이고, sticky는 스크롤 컨테이너
      기준이라 이 레이아웃에서 자리가 애매하다. 필요해지면 실측 뒤에 붙인다
- **검증**: `pnpm test`(T1의 순서 대조 케이스가 이미 든다) +
  `[manual]` `?ns=*`에서 pending 키가 각 섹션 위에 온다

## T9. 툴바 — 드롭다운 · 검색 · 칩

- [x] `components/translations/filters.tsx` 재작성
      - 네임스페이스 `Select`(단일 + `All namespaces`, 옵션 라벨에 `({pending}/{total})`) ·
        로케일 **다중 선택**(T5의 `DropdownMenuCheckboxItem`). ⚠️ **상태 `Select`는 만들지 않는다**
      - 검색 `Input w-64` + `Search` 아이콘. ⚠️ **`<form>`을 쓰지 않는다** — 제출 버튼 없는 폼은
        Enter로 submit되지 않아 검색이 조용히 무효였다 (POSTMORTEM 2026-09-08). `onKeyDown`으로 받는다
      - ⚠️ **칩이 아닌 컨트롤은 `{...query}`를 보존한다** (design §2)
      - ⚠️ 네임스페이스가 52개면 검색 없는 native 목록이다 — **감수 항목**이고 이 배송에서 안 고친다
- [x] `components/translations/filter-chips.tsx` 신설 — `activeFilters`를 그린다
      - ⚠️ **칩 전체를 링크로 만들지 않는다** — 안에 제거 버튼이 들어가 상호작용 요소가 중첩된다.
        라벨은 평문, 제거만 `<button>` (POSTMORTEM 2026-09-09 + 접근성)
      - 초기화 `Button variant="ghost" size="sm"`(정사각)은 **칩이 하나라도 있을 때만**.
        ⚠️ `size="icon"`은 존재하지 않는다 (design §1)
- **검증**: `pnpm typecheck && pnpm test`(`focus-ring`·`client-graph` green) +
  `[manual]` 칩 개별 제거·전체 초기화가 URL을 바꾸고 서버 렌더가 따라온다.
  **검색 Enter가 실제로 동작한다.**
  **로케일 드롭다운을 열어 선택·해제 두 방향을 누른다** — 체크가 붙은 항목과 안 붙은 항목 각각.
  ⚠️ 포털 안 내용은 열기 전까지 DOM에 없어 런타임 Slot 예외는 열어야 난다 (POSTMORTEM 2026-09-09).
  **검색 결과 0건에서 칩과 초기화가 보인다** — 빠져나갈 길이 그것뿐이다

—— commit —— `feat(translations): move filters to a toolbar with removable chips`

## T10. 머리 — 제목 + 배지 + Publish, 그리고 breadcrumb 다섯

- [x] `components/translations/header.tsx` 재작성 — `h1` + 총계 `Badge neutral`
      - ⚠️ **총계는 필터 전의 값이다** — `/projects` 목록과 같은 규칙(§6.63). 필터를 걸 때마다
        흔들리면 "이 프로젝트에 키가 몇 개인가"에 답하지 못한다. 섹션 헤딩의 배지가 필터 후 값이다
- [x] Publish 버튼을 제목 행 우측에, 결과 `Alert`와 배너 둘을 **칩 행 아래**에 (spec Q1)
      - ⚠️ **조건부 분기 밖의 형제여야 한다** — 안에 두면 `router.refresh()`·`revalidatePath`가 방금
        받은 결과를 언마운트한다 (POSTMORTEM 2026-09-07). 지금 구조가 그렇고 **유지하는 것**이 판정이다
      - ⚠️ **고정 영역(160)이 아니라 스크롤 영역 안이다** — 셋이 동시에 서면 400px을 넘는다.
        무조건 렌더와 스크롤 여부는 별개 축이다 (design §1)
      - ⚠️ 실패에는 `router.refresh()`를 부르지 않는다 (POSTMORTEM 2026-09-08). **지금 그 가드를
        지키는 단언이 0건이다** — T11이 붙인다
      - 코드에 **"8-P가 이것을 패널로 가져간다"**를 주석으로 남긴다 — 안 남기면 다음 배송이 중복으로 만든다
- [x] **breadcrumb을 화면 다섯에서 지운다** (spec Q5) — 번역(`header.tsx`) · `locales` · `logs` ·
      `members` · `settings`
      - ⚠️ **`components/ui/breadcrumb.tsx`는 지우지 않는다** — `/projects/new`가 계속 쓴다
        (프로젝트 컨텍스트 밖이라 사이드바가 길을 못 준다)
      - 위로 가는 길은 사이드바가 든다
- **검증**: `pnpm typecheck && pnpm test` +
  `[manual]` Publish를 실제로 눌러 결과 `Alert`가 저장 한 번에 안 사라진다.
  `grep -rln 'Breadcrumb' app components` → `components/ui/breadcrumb.tsx`와 `projects/new` **둘뿐**

—— commit —— `feat(translations): rebuild the screen header from the Figma frame`

## T11. 상시 방어선

- [x] `components/__tests__/translations-screen.test.ts` — **계약 넷은 남긴다**(`<Textarea`,
      live region 1개, 셀 `aria-label`, 헤더 무조건 렌더). ⚠️ **열·`sticky` 헤더에 대한 단언은
      애초에 없다** — 초안이 "사라진다"고 적은 대상이 없다. 파일 경로 6개를 `readFileSync`로
      하드코딩하므로 **리네임하면 ENOENT로 red**다(조용하지 않다 — 그 성질을 근거로 쓴다)
- [x] **새로 필요한 단언 여섯**:
      1. `router.refresh()`가 **실패 갈래 밖**이다 (POSTMORTEM 2026-09-08 — 지금 단언 0건)
      2. `filters.tsx`에 `<form>`이 없다 (POSTMORTEM 2026-09-08 — 지금 초대 다이얼로그만 고정돼 있다)
      3. 칩의 제거 `<button>`이 링크 안에 없다 (형태 + 이름 고정 두 축, `slottable-item.test.ts` 관용구)
      4. 로케일 배지가 orphaned 표시를 든다 (로케일 헤더가 사라져 유일한 자리가 됐다)
      5. 값이 빈 셀의 `placeholder`가 살아 있다 (미번역의 유일한 신호)
      6. `<main>`을 **새 구조의 어느 자리**가 드는지 이름으로 고정
- [x] `flagFor`의 보유 목록과 `public/flags/`의 파일 목록을 대조한다 (T0)
- [x] `lib/keys/filters.ts`·`lib/keys/flag.ts`가 **잎**인지 — ⚠️ `client-graph.test.ts`는 **패키지
      이름만** 보므로(`:238`) 지금 상태로는 못 잡는다. `:227`의 `lib/i18n` 단언과 같은 형으로
      **파일 목록을 `toEqual`로 정확 일치** 고정한다
- [x] ⚠️ **새 스캐너마다 메타 테스트를 붙인다** — "이 검사가 red를 낼 수 있는가"를 반례로 확인한다
      (POSTMORTEM 2026-09-07의 재발 방지 항목. 이 배송이 스캔을 여섯 더한다)
- **검증**: `pnpm typecheck && pnpm test` green

—— commit —— `test(translations): move the source-scan guards onto the new structure`

## T12. 실측 — 목측 + 성능

- [x] `[manual]` 1920×1080에서 시안 좌표와 대조한다(키 열 320 · 로케일 칸 80 · 행 41 · 고정 160)
- [x] `[manual]` **1280px**에서 값 열이 ≈368px이어도 성립하는지 본다 (규약 3)
- [x] `[manual]` **903키 프로젝트**에서 잰다 — 방법은 6a T7과 같게 고정한다:
      같은 프로젝트·같은 머신·DevTools Performance, **FCP 3회**
      - **`?ns=*` 첫 착지 — 2초 이내여야 한다** (SAAS §8 완료 게이트 원문. 기준선 1.20초)
      - 기본 착지도 함께 기록한다 (기준선 0.44~0.54초)
      - ⚠️ **미달이면 이 자리에서 가상화를 판정한다** — 다음 사이클로 넘기지 않는다.
        넘기면 게이트가 게이트가 아니다
      - ⚠️ **TTFB를 서버 시간으로 읽지 않는다** — `responseEnd`와 `transferSize`를 함께 본다
        (POSTMORTEM 2026-09-09). 1.20초는 **FCP**이지 서버 시간이 아니다
      - ⚠️ dev DB에 903키 프로젝트가 없다 — `push:local`로 적재하고 **로컬 프로덕션 빌드**에서 잰다
        (`features/README.md`의 그 방법). preview는 Vercel SSO 뒤라 자동화가 못 간다
- [x] `[manual]` `?locales=`로 로케일 하나만 남겼을 때 **행 수**가 준다.
      ⚠️ 그룹 **높이**는 키 셀(이름 + description + 코드 참조 ≈ 3줄)이 정하므로 세로 절감이
      행 수만큼은 아니다 — "행 수가 준다"를 "높이가 준다"로 읽지 않는다
- **검증**: 숫자를 이 파일 아래에 표로 남긴다 (체크리스트 밖의 기록이라 tasks가 닫혀도 남긴다 —
  `features/README.md`의 다섯 예외와 같은 부류)

### 실측 기록

| 회차 | 무엇 | 기본 착지 | `?ns=*` | 비고 |
|---|---|---|---|---|
| 2026-09-07 | 열 축, 필터 없음 | — | 12.7초 | `/bugshot-qa` 실측 (903키 · `<input>` 2,711) |
| 2026-09-08 | 기본 착지 도입 | 3.30초 | 4.66초 | **24키 프로젝트도 3.29초** — 약 1.9초가 키 수와 무관한 고정 비용 |
| 2026-09-09 | `regions: ["hnd1"]` | 0.44~0.54초 | **1.20초** | 원인이 함수 리전이었다(FCP 3회, PR #24) — **이것이 8-4의 기준선이다** |
| 2026-09-11 | **행 축 (8-4)** | **0.34초** | **0.31초** | ✅ **게이트 통과.** preview(Vercel 빌드 · `hnd1` · dev DB), 1920×1080, FCP 3회 |

**2026-09-11 실측 상세** (`?ns=*` = 2,709 셀):

| | FCP 3회 | 중앙값 | `responseEnd` | 전송량 | 셀 |
|---|---|---|---|---|---|
| 기본 착지 | 364·340·328 | **340ms** | 314ms | 14KB | 93 |
| **`?ns=*`** | 312·280·328 | **312ms** | **739ms** | 181KB | 2,709 |

⚠️ **FCP만 보면 안 된다** — POSTMORTEM 2026-09-09이 경고한 그대로다. 같은 화면을 **로컬 dev 서버**로
재면 FCP가 688ms인데 `responseEnd`가 **10,086ms**이고 본문이 **1MB**다: 헤더와 셸이 먼저 나가고 서버가
표를 10초 붙들고 있다. **dev 오버헤드이지 이 화면의 비용이 아니다**(같은 코드가 Vercel 빌드에서
0.74초·181KB다) — 그래서 절대값 판정에 dev 서버를 쓰지 않는다. 대조군으로 잰 24키 `?ns=*`도
dev에서 `responseEnd` 1,307ms였다.

⚠️ **측정 조건이 기준선과 한 가지 다르다** — 이 프로젝트는 `KeyRef`와 `description`이 **없다**
(아래 재현 절차가 키·값만 심는다). 둘 다 키 셀의 내용이라 노드를 늘리므로 실제는 이보다 무겁다.
여유가 1.26초(`responseEnd` 기준)라 판정이 뒤집힐 폭은 아니라고 봤다.

✅ **가상화를 넣지 않는다** — spec 비목표의 조건("게이트를 통과하면 넣지 않는다")이 충족됐다.

**재현 절차** (dev DB에 903키가 없다 — 이 라운드는 `.scratch/` 일회용 스크립트로 심었다):
1. `pnpm --silent ingest ~/code/bugshot-2 --adapter ts-dict --base en --json > /tmp/b2.json`
   (⚠️ `ts-dict`는 자동 탐지 제외라 `--adapter`가 필수다 — ADAPTER-COVERAGE §4.1)
2. 그 JSON의 `result.locales[].entries`를 `Project`+`Locale`+`StringKey`+`Translation`으로 심는다.
   ⚠️ **`/api/push`를 지나지 않는다** — 재는 것이 렌더 비용이고, dev의 두 프로젝트가 ts-dict가
   아니라 `pathTemplate` 대조에서 오배송 409다.
   ⚠️ `StringKey`는 `sourceText`·`sourceHash`가 **필수**이고 순서 컬럼은 `sortIndex`다.
3. 세션은 `hashSessionToken`(`lib/credentials/crypto.ts`)으로 `Session` 행을 만들고 원문을 쿠키로
   심는다 — https면 이름이 `__Secure-authjs.session-token`이다.
4. **preview에서 잰다** — dev DB를 보므로 3의 세션이 그대로 통하고, 기준선과 같은 Vercel 빌드·리전이다.
   ⚠️ **로컬 `next start`로는 못 쟀다**: `AUTH_TRUST_HOST`를 줘야 auth가 돌기 시작하고, 그 뒤에도
   세션 조회가 `Unavailable`로 떨어진다(같은 세션이 `pnpm dev`에서는 정상이다). 원인 미규명 —
   로컬 prod 빌드 특유의 문제이고 Vercel에서는 안 난다.

✅ **2026-09-11에 쟀고 통과했다.** 예측("재는 자가 행 수가 아니라 노드 수다 — `<Textarea>`는
2,709개로 그대로이고 늘어난 것은 행 래퍼와 배지이며 국기는 CSS 배경이라 요소가 0개 는다")이
맞았다: 8-4 **전** 기준선이 `?ns=*` 1.20초였는데 지금 0.31초다. 다만 **그 둘은 조건이 다르다**
(기준선은 프로덕션+prod DB, 이번은 preview+dev DB에 refs·description 없음) — 비교가 아니라
**게이트 통과 여부**가 이 측정의 결론이다.

## T13. 문서

- [x] `docs/DESIGN.md`
      - **§6.1** — 표 축 · 툴바 · 칩 · 배너 자리 · 빈 상태 · **시안에 없는 열의 행선지**를 다시 쓴다.
        ⚠️ **통째로 지우지 않는다** — 다른 절 아홉이 §6.1을 가리키고 그중 다수가 인용하는 것은
        **"가장 흔한 상태가 가장 조용하다"** 원칙 문장이다. 원칙은 §6.1이 계속 소유한다
      - **§6.4** — 프리미티브 17(T5에서 이미 등재) · **`Table | §6.1` 포인터가 끊긴 것** ·
        Button size(`h-9`/`h-7`/`h-10`)와 radius 정정
      - **§5** — radius 정정 (코드가 `d6a636a`에서 앞섰다)
      - **§6.64** — Home의 `?focus=` 링크 셋(`:486`·`:487`·`:488`)
- [x] `docs/SAAS.md`
      - **§8** — 표 축·`?focus=` 🔒·국기 🔒·네임스페이스 드롭다운 넷을 닫는다.
        **완료 게이트 문장은 그대로 둔다**(이 배송이 원문을 지켰다)
      - **§7.7** — 폐기된 쿼리 키 둘(`?state=`·`?focus=`)을 이름으로 든 자리
- [x] `docs/features/ui-rework/README.md` — 배송 표에 8-4 행 + 갈린 것 +
      **규약 8에 "Publish 결과는 8-P까지 인라인 `Alert`" 한시 예외 등재** (spec Q1)
- [x] `docs/features/README.md` — ui-rework 행의 "남은 것"
- [x] `CLAUDE.md`
      - 디렉터리 구조의 `translations/page.tsx`·`components/translations/` 주석
      - `lib/keys/view.ts` 시그니처, `lib/keys/flag.ts`·`lib/keys/filters.ts` 신설
      - `components/ui/`의 프리미티브 16 → **17**
      - `public/flags/`(커밋된 원본 — `public/brand/` 옆)
      - 가상화 절의 실측 숫자
      - ⚠️ **"8-3 이후가 breadcrumb·Publish를 `[slug]/layout.tsx`로 옮긴다"의 breadcrumb 절반을
        정정한다** — 옮기지 않고 지웠다 (spec Q5). Publish 쪽은 그대로다
- **검증**: `[manual]` `/push` 4단계 문서 트라이아지에서 남은 stale이 0건

—— commit —— `docs(DESIGN): rewrite the translations screen rules for the row axis`

## 셀 밀도 보정 (2026-09-11)

- [x] 값 셀 위아래 padding 12px·전체 값 상시 노출·포커스 시 메타·높이를 늘리지 않는 저장 표시
- [x] IME 조합 중 저장/복구 명령 차단 회귀 테스트
- [x] 전체 테스트·typecheck·브라우저 시각 확인
