# 8-4 번역 화면 — design

시안 [`212:937`](https://www.figma.com/design/cuMNHY0Cn5ei9Szjqfz0tm/bugshot?node-id=212-937)의
`tab body`(`212:993`, 1328×1008). 셸·사이드바·오른쪽 패널은 **8-2가 이미 세웠고 이 배송은 안 건드린다**.

## 셀 밀도 보정 — 아래 초기 설계의 메타·높이 규칙을 대체한다

2026-09-11 사용자 재확인: 입력 전체가 셀 표면을 채운다. 위아래 padding 12px(`py-3`), 한 줄 높이 46px, 모서리 0,
포커스 링은 색상은 기존 `ring` 토큰을 쓰고 두께는 2px이다. textarea 대신 값 셀 래퍼의 `::after`가 링을 그려 펼친 메타까지 포함한 셀 가장자리에 맞춘다. 링은 셀 경계 중앙에 걸쳐 안쪽 1px·바깥쪽 1px로 그린다(`::after inset-px` + 2px 외곽 링). 셀 자체에는 stacking context를 만들지 않고 링 레이어만 `z-20`으로 헤딩(`z-10`) 위에 올려 첫 행의 윗변도 보이게 한다. `pointer-events-none`으로 편집을 방해하지 않는다(사용자 스크린샷은 위치 참고이며 색·두께 지정이 아니다). `field-sizing: content`를 유지하여 평소에도 전체 값을 표시한다.
메타는 셀의 `focus-within`에서만 아래에 보인다. 미검토·미배포 표시와 저장 진행 표시는
절대 위치로 두고 입력 우측 여백을 항상 확보하여 타이핑 중 폭이 바뀌지 않게 한다.
실패만 입력 아래에 계속 남긴다. 로케일은 기본 행의 중앙에 고정한다.

## 0. 영향 받는 흐름

**편집 UI 하나다.** push·pull은 한 줄도 안 바뀐다 — 이 화면이 읽는 것이 `Translation` 행이고 쓰는 것이
`saveTranslation` 하나인데 둘 다 그대로다. Publish가 이 화면에 남으므로(spec Q1) `triggerPullAction`
경로도 그대로다.

⚠️ **그래서 코어 원칙(병합 없음·결정성·blob SHA)에 닿는 자리가 0이다.** 이 배송에서 red가 나면
원인은 반드시 URL 계약이나 렌더 쪽이다.

## 1. 시안의 좌표 — 읽은 그대로

```
tab body 1328×1008
├ fixed        y=0   1328×160        ← 제목·필터·칩 셋의 높이다 (아래 ⚠️)
│  ├ 제목행    x=16 y=24  1296×24    "Translations" + SolidBadge(1134)
│  ├ 필터행    x=16 y=64  1296×36    Dropdown 164 · gap 8 · Dropdown 133 ┊ Input 260(우측 정렬)
│  └ 칩행      x=16 y=116 1296×32    Chip ×3 (gap 4) ┊ IconButton 28(우측)
└ scroll area  y=160 1328×848
   ├ 섹션 헤딩 x=16 y=12  1296×43    {{namespaceName}} + DotBadge(12)   ← 좌 padding 8
   └ 키 그룹   x=16       1296×124   (로케일 3개 기준)
      ├ 키 셀   0    320×123          키 이름 x=8 y=12
      └ 값 열   320  976×123
         └ 로케일 행 976×41 × 3
            ├ 로케일 칸  68×41        SolidBadge 45×19 (flag 16×11 + 코드), 중앙 정렬
            └ 값 칸      908×41       텍스트 x=12 y=12
```

**치수 매핑** (규약 6 — 시안 값이 아니라 기존 스케일에서 가장 가까운 것):

| 시안 | 쓰는 값 | 비고 |
|---|---|---|
| 컨트롤 높이 36 | `h-9`(36) | 2026-09-11에 프리미티브가 36으로 올라갔다 — 그대로 맞는다 |
| 네임스페이스 드롭다운 164 | `w-40`(160) | |
| 로케일 드롭다운 133 | `w-32`(128) | |
| 검색 입력 260 | `w-64`(256) | |
| 키 열 320 | `w-80`(320) | |
| 로케일 칸 68 | **`w-20`(80)** | ⚠️ 아래 §4가 orphaned 표시를 배지 안으로 접어 68→80이면 충분하다. `w-16`(64)은 배지 45 + 좌우 여백이 안 남는다 |
| 행 높이 41 | `px-3 py-2` + `text-sm` | 값이 여러 줄이면 늘어난다(고정 높이가 아니다) |
| 배지 19 | `Badge`(§6.4, 알약) | 8-3이 이미 알약으로 바꿨다 |
| 초기화 IconButton 28 | **`Button variant="ghost" size="sm"`**(h-7 = 28) + 정사각 `className` | ⚠️ `size="icon"`은 **존재하지 않는다**(md·sm·lg 셋뿐이고 `button.tsx:63` 주석이 "넷으로 늘리지 않는다"를 못 박았다). 관용구는 `user-menu.tsx:46`의 `variant="ghost"` + 정사각 유틸이다 |

⚠️ **`fixed` 160은 "제목·필터·칩 셋"의 높이이고 배너·`Alert`는 그 아래에서 스크롤한다.**
Publish 결과 `Alert`(`rounded-lg border p-4`)와 배너 둘이 동시에 서면 고정 영역이 400px을 넘어
1008px 뷰포트의 40%를 먹는다. **무조건 렌더와 스크롤 여부는 별개 축이다** — 스크롤 영역 안에 두어도
언마운트되지 않으므로 POSTMORTEM 2026-09-07의 조건은 그대로 지켜진다.

⚠️ **표 헤더가 없다.** 로케일이 열이 아니므로 `sticky top-0` 헤더가 사라지고, 그래서 "헤더가 셀
포커스 링 위로 그려진다"는 `z-10` 함정도 함께 사라진다.

⚠️ **1280px에서 값 열이 ≈368px까지 준다** (spec 「1280px」). 키 셀 320은 고정이고 값 열이 줄어드는
것을 받아들인다 — 키 이름이 잘리는 쪽이 더 나쁘다.

## 1.5 마크업 — shadcn Table (2026-09-12 사용자 결정)

`components/ui/table.tsx`의 공식 shadcn 기반 구성 요소를 사용한다. 네임스페이스별 table 안에
키별 tbody·로케일별 tr을 두고, 키 셀은 `scope="rowgroup"`·`rowSpan`으로 보이는 로케일 행을 묶는다.
여러 줄 값의 높이는 브라우저가 계산한다. 기존의 "rowSpan이 다른 행 높이 때문에 정렬을 어긋나게 한다"는
판단은 철회한다. colgroup은 키 320px·로케일 68px·가변 값 열을 유지한다.

숨긴 열 헤더·네임스페이스 h2와 연결한 표 이름·기존 입력 aria-label을 함께 둔다.
translations는 `scrollable={false}`로 PanelBody의 스크롤을 사용하며 섹션 제목은 sticky다.
언어·이력·멤버의 기존 Table API와 스크롤은 유지한다. 검증은 `translation-table.test.tsx`와 1280px 실측이다.

## 2. URL 계약 — `TranslationsQuery`가 바뀐다

```ts
// lib/routes.ts
export type TranslationsQuery = {
  ns?: string;      // 그대로. "*"가 전체
  locales?: string; // ⚠️ 신설 — "ko,ja". `focus`를 대체한다
  q?: string;       // 그대로
  // ⚠️ `state`가 사라진다 (spec Q3) — 시안의 칩 행이 정확히 세 종류다
};
```

⚠️ **`state`를 지우는 것은 URL 키 하나가 아니라 `filterRows`의 분기 하나까지다.** 집계
(`untranslated`·`needsReview`)는 **남는다** — 드롭다운의 `pending/total`과 §3.8의 pending 우선
정렬이 둘 다 그 위에 선다.

⚠️ **`focus`를 남겨 두고 `locales`를 더하지 않는다.** 둘이 공존하면 "집계가 어느 로케일을 보나"의
답이 둘이 되고, 그중 하나가 URL에 안 보이는 상태로 남는다 — 6b-3이 `baseLocale`/`declaredBaseLocale`을
**일부러** 둘로 둔 것과 반대 부류다(그쪽은 현실과 선언이라 축이 진짜 둘이다).

⚠️ **칩이 아닌 컨트롤은 나머지 쿼리를 보존한다.** 네임스페이스 드롭다운이 `{ ...query, ns }`를,
검색이 `{ ...query, q }`를 낸다 — 지금 `{...query}` 전파가 하던 일이고 새 구조가 그것을 잃으면
**ns를 바꾸는 순간 로케일 선택이 날아간다.** `activeFilters`의 `next`는 "칩을 뗀 뒤"라 이 축을
안 덮는다.

⚠️ **`?locales=`는 주소창 값이다.** 파싱은 배열 `includes`로 하고 객체 조회를 쓰지 않는다 —
프로토타입 키가 갈래로 새는 부류이고 이 리포가 두 번 밟았다(CLAUDE.md · POSTMORTEM 2026-09-08 ·
`lib/projects/list.ts`의 `parseProjectFilter`가 같은 관용구다).

### 2.1 `entry-points.test.ts`가 실제로 검사하는 것 — 안전망의 범위

⚠️ **초안은 이 검사를 "이 변경의 안전망"이라고 적었는데 절반만 참이다** (POSTMORTEM 2026-09-07
"방어선이 검사한다고 주장한 것을 못 검사"와 같은 부류). 실측:

| 자리 | 무엇을 보나 | 이 배송에서 |
|---|---|---|
| `:472` | `queryKeysOf(ROUTES_SOURCE, "TranslationsQuery")`를 **리터럴 배열**과 대조 | **red가 난다.** 고쳐야 green — T3의 항목이다 |
| `:476` | routes의 키 ⊆ 페이지 `Search` 키 (**단방향**) | 페이지에 `focus`가 남아도 **green이다** |
| `:487` | `page.source.includes("searchParams")` 하나 | 키 이름을 **대조하지 않는다** |
| `EMITTED` 스캔(`:119`) | `app/` 아래만 | `components/translations/filters.tsx`의 링크 생성은 **검사 밖** |

**→ 생산자 쪽의 진짜 방어선은 `tsc`다** — `TranslationsQuery`에서 `focus`를 지우면 그것을 쓰는
자리가 전부 컴파일 에러다. `entry-points`가 보는 것은 **선언 두 벌의 동기화**뿐이고, 페이지 쪽
잔존은 spec 완료 조건의 **파일 셋 눈 확인**이 담당한다(전역 grep은 OAuth `state`를 문다).

## 3. 순수 함수로 분리 가능한 부분 — `/tdd` 대상

**여덟이고, 셋은 기존 함수의 시그니처 변경이다.**

⚠️ **시그니처를 바꾸는 셋은 "새 이름 병행 추가 → 호출부 이관 → 옛 이름 제거" 순서다.** 유일한
프로덕션 호출부가 `translations/page.tsx` 하나뿐이라 한 커밋에서 바꿔도 되지만, 그러면 T1 커밋이
typecheck red가 되고 검증줄(`pnpm test`)이 vitest라 그것을 못 본다. 병행 추가면 **커밋마다 green이
유지된다.**

### 3.1 `parseLocaleSelection(param, locales)` — 신설, `lib/keys/view.ts`

`?locales=ko,ja` → 보일 로케일 코드 배열. **프로젝트의 실제 로케일 목록으로 걸러낸다.**

- 빈 값·미지정·전부 걸러짐 → **살아 있는 로케일 전체**(폴백이 "아무것도 안 보임"이면 화면이 죽는다)
- ⚠️ **폴백에서 orphaned 로케일을 뺀다. 명시 선택(`?locales=xx`)은 허용한다** — 안 그러면 리포에서
  사라진 로케일의 빈 셀이 전부 `untranslated`로 잡혀 `defaultNamespace`가 **행이 전부 disabled인
  네임스페이스**에 착지한다(`cellState`는 키의 orphaned만 보고 로케일의 것을 모른다).
  `activeLocaleProgress`(`lib/home/overview.ts:16`)가 같은 이유로 이미 orphaned를 뺐다
- 그래서 인자는 코드 배열이 아니라 **`readonly { code: string; orphaned: boolean }[]`**이다
- 순서는 **입력 순서가 아니라 `columns` 순서**(base 먼저, 나머지 코드순) — URL이 순서를 정하면
  같은 선택이 두 링크에서 다르게 보인다
- 중복은 접는다

⚠️ **시안의 행 순서가 `ko · en · ja`라 base 우선이 아니다.** 목업 데이터로 읽고 **base를 맨 앞에
유지한다** — 원문이 위에 있어야 그 아래를 채운다(지금 표에서 base가 맨 왼쪽인 것과 같은 이유,
MVP §3.2).

### 3.2 `namespaceCountsFor(rows, locales)` — 신설(옛 `namespaceCounts` 대체)

한 키가 **선택된 로케일 중 하나라도** untranslated면 `untranslated`, 아니고 하나라도 needsReview면
`needsReview`다.

⚠️ **키 단위로 한 번만 센다** — 로케일마다 세면 `total`과 합이 안 맞아 `pending/total`이 1을 넘는다.
우선순위는 `cellState`의 것을 그대로 쓴다(orphaned > untranslated > needsReview).

⚠️ **누산기는 `Map`이다** — 네임스페이스 이름이 리포의 키에서 온다(남이 정한 값). 옛
`namespaceCounts`가 이미 `Map`을 쓰고 있고 그 성질을 잃으면 안 된다.

### 3.3 `filterRows(rows, { q, locales })` — 인자가 바뀐다

`state`가 없어지고(spec Q3) `locale` 하나가 `locales` 배열이 된다.

⚠️ **`q`의 대상을 선택된 로케일로 좁힌다** (2026-09-11 결정 — 초안은 "모든 로케일 값"을 유지하려
했다). 좁히지 않으면 `?locales=ko`에서 **fr 값에 맞은 키가 아무 표시 없이 나타난다** — 옛 축에서는
전 로케일이 보여서 어디가 맞았는지 눈에 띄었지만 이제는 안 보인다. 대상은 **키 + 선택된 로케일의
값**이다.

⚠️ **`RowFilter` 타입이 작아져도 함수를 지우지 않는다** — 호출부가 인라인 `filter`를 쓰면 그 규칙이
화면 코드로 내려가고, 그 규칙은 테스트 9건이 붙어 있는 판정이다.

### 3.4 `defaultNamespace(counts)` — 시그니처 그대로

`counts`가 이미 선택된 로케일 기준이라 이 함수는 안 바뀐다. **6a T2의 판정("pending>0인 첫 ns")이
축 변경을 그대로 통과한다** — 로케일을 인자로 안 받게 만들어 둔 것이 여기서 값을 한다.
*(정확히는 프로덕션 호출부가 `resolveNamespace` 내부 하나이고, 그 이득을 가져가는 것도 그쪽이다.)*

### 3.5 `activeFilters(query, ctx)` — 신설, `lib/keys/filters.ts`(잎)

칩 행의 유일한 출처. `{ key, label, next }[]`를 낸다 — `next`가 **그 칩을 뗀 뒤의 쿼리**다.

- 네임스페이스 칩: `ns`가 `*`도 미지정도 아닐 때만. 떼면 `ns: ALL_NAMESPACES`
- 로케일 칩: **선택이 기본이 아닐 때만, 그리고 코드마다가 아니라 하나로 묶는다**
  (`Languages: ko, ja`). 떼면 `locales: undefined`(기본으로 복귀)
- 검색 칩: `q`가 있을 때. 떼면 `q: undefined`
- **초기화 버튼은 `activeFilters().length > 0`일 때만 보인다** — 누를 것이 없으면 죽은 컨트롤이다

⚠️ **로케일 칩을 코드마다 내지 않는 이유가 둘이다** (2026-09-11 결정):
1. **마지막 하나를 떼면 폴백이 걸려 전체로 돌아간다** — 제거가 "좁힘 해제"가 아니라 **넓힘**이
   되어 다른 두 칩과 방향이 반대다
2. 6로케일에서 4개를 고르면 칩이 여섯이라 **시안의 32px 한 줄을 넘는다**

⚠️ **칩은 종류가 셋이고 개수도 셋이다** — 시안의 `namespaceName` · `localeName` · `searchKeyword`와
같다. 넷째를 더하려면 시안 개정이 먼저다.

⚠️ **잎이어야 한다** — 칩 행이 클라이언트 컴포넌트이고, `lib/keys/view.ts`는 잎이 아니다
(`compareKeys` → `lib/adapters/shared`). 값으로 import하면 그 그래프가 번들에 따라온다
(POSTMORTEM 2026-09-07 — 7.2MB 청크. `lib/relative-time.ts`·`lib/pull/ref-slug.ts`가 같은 이유로
내려온 것들이고 **재수출도 하지 않는다**). import는 `lib/routes.ts`(그쪽도 잎)까지만 허용한다.

⚠️ **그 "잎"을 강제하는 검사가 지금 없다** — `client-graph.test.ts`는 **패키지 이름만** 보는데
(`:238`) `lib/keys/view.ts`가 무는 것은 전부 리포 안 모듈이라 npm 패키지가 하나도 안 나온다.
즉 클라이언트가 그 파일을 값으로 읽어도 **지금 green이다.** `client-graph.test.ts:227`의 `lib/i18n`
단언(파일 목록을 `toEqual`로 정확 일치 고정)과 같은 형을 `lib/keys/filters.ts`·`lib/keys/flag.ts`에
붙인다(T10).

### 3.6 `groupByNamespace(rows, counts)` — 신설, `lib/keys/view.ts`

`?ns=*`의 섹션 렌더용. `{ namespace, rows }[]`를 낸다.

⚠️ **순서를 `counts`에서 받는다** (2026-09-11 정정 — 초안은 인자가 `rows`뿐이었다). `rows`만 받으면
순서의 출처가 `loadKeys`의 `orderBy: { key: "asc" }`(Postgres collation)인데
`namespaceCountsFor`가 쓰는 `compareKeys`는 **UTF-16 코드 유닛 비교**(`lib/adapters/shared.ts:13`)라
둘이 같다는 보장이 없다 — **섹션 헤딩 순서 ≠ 드롭다운 순서**가 될 수 있고 그것이 이 문단이 막으려던
바로 그 결과다. 정렬 규칙은 한 벌로 남는다.

⚠️ **누산기가 `Object.create(null)` 또는 `Map`이다** — 네임스페이스 이름이 남이 정한 키다.
평범한 `{}`에 `out["__proto__"] = v`를 하면 그 그룹이 조용히 사라진다(POSTMORTEM 2026-09-09).

### 3.7 `flagFor(code)` — 신설, `lib/keys/flag.ts`(⚠️ **잎, import 0**)

로케일 코드 → 국기 파일 id 또는 `null` (spec Q4).

```
"ko"     → "kr"
"en"     → "gb"     ← 시안의 선택이다. 알고리즘이 낼 수 있는 답이 아니라 표에만 담긴다
"zh-CN"  → "cn"     ← 하위태그가 이긴다
"zh_CN"  → "cn"     ← ⚠️ `_`와 `-`를 같게 본다 (`planBaseLocaleChange`가 이미 겪은 자리다)
"ar"     → null     ← 국가가 없다. **폴백은 코드만이고 물음표·지구본을 그리지 않는다**
"weird"  → null     ← 리포에서 오는 코드는 임의 문자열이다
```

- **판정 순서**: 하위태그 정규화 → 그 alpha-2가 **보유 국기 목록**에 있으면 그것 → 없으면 언어→국가
  명시 표 → 없으면 `null`
- ⚠️ **"보유 국기 목록"은 코드 상수다**(fs 스캔이 아니다) — 순수 함수여야 하고, 목록과 실제 파일이
  어긋나는 것은 **T0/T10의 대조**가 잡는다. 표에 `cn`이 있는데 파일이 없으면 배경이 조용히 빈다
- ⚠️ **잎이어야 한다** — 로케일 배지가 표 안에서 2,709번 렌더되고 그 트리가 클라이언트다

⚠️ **렌더는 `<img>`가 아니라 CSS `background-image`다** (2026-09-11 결정 — 초안은 `<img>` 하나짜리
컴포넌트였다). `?ns=*`에서 배지가 2,709개 서는데 `<img>`면 요소·레이아웃 오브젝트가 그만큼 늘고,
그것이 이 배송이 실제로 더하는 렌더 비용의 대부분이다. **로케일 종류만큼(보통 3~6) CSS 규칙이 있고
요소는 배지 안의 `<span>` 하나**이며, 치수는 클래스가 든다(CLS 없음, `<img>` 치수 단언도 불필요).

- `next/image`를 쓰지 않는 이유도 여기 적는다 — 정적 import한 SVG가 `data:` URI로 인라인되면
  `next/image`가 그것을 거부한다(POSTMORTEM 2026-09-10). 이 리포는 반대 방향의 단언도 갖고 있어
  (`signin-screen.test.ts:103` — 키비주얼은 `next/image`여야 한다) 근거를 안 적으면 다음 사람이
  통일하려 든다
- 새 국기를 더하려면 **표(코드)와 CSS 둘을 함께** 고쳐야 한다 — 그 대가를 T10의 대조가 받는다

### 3.8 `pendingFirst(rows, locales)` — 신설, `lib/keys/view.ts` (spec Q3)

각 섹션 안에서 pending 키(untranslated 또는 needsReview)를 위로 올린다. **상태 필터를 뺀 대가를
갚는 유일한 수단이다.**

- 안정 정렬이다 — 같은 통 안에서는 `compareKeys` 순서를 **보존한다**(`Array.sort`가 안정이라
  입력 순서가 유지된다). 정렬을 두 벌로 만들지 않는다
- orphaned 키는 pending으로 치지 않는다 — 편집할 수 없으므로 위로 올리면 거짓이다
- ⚠️ **URL 상태가 아니다** — 칩이 넷째가 되지 않고 `?state=`가 되살아나지도 않는다

## 4. 시안에 없는 열 — 어디로 가나

| 지금 | 판정 | 자리 |
|---|---|---|
| 셀 상태 배지 3종 | **둘만 남긴다** | 로케일 행의 **우측 고정 폭 슬롯**. `Untranslated`는 값 칸이 비어 있는 것이 이미 말하므로 **뗀다**(§6.1 "가장 흔한 상태가 조용하다"의 연장) → `Needs review` · `Not yet sent` |
| 값이 빈 셀의 `placeholder` | ⚠️ **반드시 남긴다** | 배지·필터·입력 테두리가 **같은 배송에서 동시에** 사라지므로 미번역의 유일한 시각 신호다 |
| `Edited by {name}` | **남긴다** | 같은 우측 슬롯, 배지 뒤 `text-xs text-muted-foreground` |
| 셀 저장 상태 4종 | **남긴다 — 입력 아래 줄에** | ⚠️ **우측 슬롯이 아니다**(아래) |
| 키 `description` | **남긴다** | **키 셀로 간다** — 320×123이 열려 있고 키 이름 아래가 그 자리다 |
| 코드 참조 permalink | **남긴다** | 같은 키 셀. `text-blue-600` + `ExternalLink` 12 (§6.3, 밑줄 없음) |
| Orphaned 배지 (키) | **남긴다** | 키 셀, 이름 옆 |
| Orphaned 배지 (로케일) | **로케일 배지 자체를 `danger`로** | ⚠️ 별도 배지를 옆에 못 붙인다(아래) |
| `Base` 라벨 (로케일 배지) | **뺀다** (2026-09-11 사용자) | 이 표에서 base 행은 **키마다 맨 위 한 줄**이고(위 §의 "base를 맨 앞에 유지한다") 같은 사실을 903키 × 로케일 수만큼 반복하면 68px 칸 예산만 먹는다 — §6.1 "가장 흔한 상태가 조용하다"의 연장이다. 그 라벨이 값을 하는 곳은 로케일이 **목록**으로 서서 순서가 단서가 못 되는 `/locales`·Home이고 `m.locales.base`는 거기 남는다. ⚠️ **대가: 이 표가 base를 말하는 수단이 순서 하나가 된다** — base 셀을 비우면 그 키가 base 파일에서 빠져 다음 push가 전 로케일에서 orphan하는데(`lib/pull/plan.ts`) 그 앞에 라벨이 없다. `translations-screen.test.ts`가 배지·`key-group`에 `isBase`가 없는 것과 사전 키가 두 화면에 살아 있는 것을 양방향으로 센다 |
| Publish + 결과 `Alert` | **남긴다** (Q1) | 제목 행 우측(버튼) + 칩 행 아래(`Alert`, 스크롤 영역) |
| 배너 둘(편집 손실 · base 대기) | **남긴다** (Q1) | 칩 행 아래, base 대기가 위 |
| breadcrumb | **뺀다 — 화면 다섯에서 함께** (Q5) | 위로 가는 길은 사이드바가 든다. `components/ui/breadcrumb.tsx`는 `/projects/new`가 계속 쓰므로 **지우지 않는다** |

🔴 **STALE — 아래 "우측 고정 폭 슬롯"은 2026-09-11 실물 검증에서 뒤집혔다** (malmoi#33).
1280px(규약 3의 최소 폭)에서 값 열이 366이고 그 안의 고정 폭(로케일 칸 80 · 메타 160 · padding·gap
36)을 빼면 **입력이 28px**였다 — 값이 한 글자씩 세로로 쌓이고 행 높이가 210px이 됐다. 이 문단의 계산은
**"메타는 렌더마다 안 변한다"만 보고 폭 예산을 안 봤다.** 지금은 **배지 둘과 `Edited by`도 입력 아래
줄**이고(셋 다 없으면 렌더되지 않는다), 정본은 DESIGN §6.1이다. 아래 문단이 든 *저장 상태를 옆에 두지
않는 이유*(타이핑 중 폭 재계산)는 **그대로 유효하다.**

⚠️ **저장 상태 4종만 입력 아래 줄에 남기는 이유** (2026-09-11 결정 — 초안은 넷을 전부 우측에
몰았다): `Not saved yet — leave the cell to save`가 약 230px이고 이 문구는 **타이핑 중에 나타났다
사라진다.** 우측에 두면 `field-sizing-content` textarea의 폭이 그때마다 바뀌어 줄바꿈과 커서 위치가
재계산된다. **배지 둘과 `Edited by`는 렌더마다 변하지 않으므로 우측 고정 폭 슬롯에 들어간다** —
그 슬롯은 빈 상태에서도 폭을 차지한다(`shrink-0`).

⚠️ **orphaned 로케일을 별도 배지로 못 붙인다** — 로케일 칸이 80px이고 로케일 배지(45)가 이미 거의
다 쓴다. `Badge`는 `px-2 py-0.5 text-xs`라 "Orphaned" 하나가 최소 70px이다. **로케일 배지 자체를
`danger` variant로 바꾼다** — 사유 문장은 `disabled` 입력의 placeholder(`Not editable — removed
from the code`)가 이미 든다. 로케일 헤더가 사라져 그 표시가 살 자리가 여기뿐이다.

⚠️ **실제 삭제는 셋이다** — `Untranslated` 배지 · breadcrumb · **로케일 배지의 `Base` 라벨**(2026-09-11에 더해졌다). 나머지 여덟은 자리가 바뀐다.
"시안에 안 보인다"를 "지운다"로 읽으면 이 화면의 정보 밀도가 통째로 무너진다.

⚠️ **왼쪽 `NamespacePanel`·`NsLink`는 지운다** — 드롭다운이 그 역할을 가져간다. 남겨 두면 같은
필터가 두 곳이고 하나가 낡는다(`invite-form.tsx` 삭제와 같은 판정).

## 5. 성능 — 재는 자가 행 수가 아니다

| | 지금(`?ns=*`, 903키·3로케일) | 축 변경 뒤 |
|---|---|---|
| `<Textarea>` | 2,709 | **2,709 (같다)** |
| 표 행 | 903 | 2,709 |
| 로케일 배지 | 3 (헤더) | 2,709 |
| 국기 요소 | 0 | **0** (Q4 — CSS `background-image`라 요소가 안 는다) |

**게이트는 SAAS §8 원문 그대로 `?ns=*` 첫 착지 2초다.** 초안이 그것을 "기본 착지 2초"로 내렸는데
되돌렸다 — 기본 착지는 이미 0.44~0.54초라 4배 여유이고, **여유가 0.8초뿐인 쪽(`?ns=*` 1.20초)이
정확히 이 배송이 노드를 얹는 쪽**이다.

- 늘어나는 것은 행 래퍼와 배지이고 입력보다 싸다. 그래서 **가상화를 선반영하지 않는다**
- ⚠️ **미달이면 T11이 그 자리에서 가상화를 판정한다** — 다음 사이클로 넘기지 않는다.
  넘기면 게이트가 게이트가 아니다
- ⚠️ **2026-09-09 리전 변경이 내린 1.20초는 서버 시간이 아니라 FCP다**
  (`translation-ui/tasks.md:233-240`의 열 제목). 남은 것은 클라이언트 렌더다
- ⚠️ **TTFB를 서버 시간으로 읽지 않는다** — 그 오독이 정확히 2026-09-09의 오진이었다.
  `responseEnd`와 `transferSize`를 함께 본다
- **측정 방법을 6a T7과 같게 고정한다**: 같은 프로젝트·같은 머신·DevTools Performance, **FCP 3회**.
  기준선(4.66 → 1.20)이 그 방법으로 잡혔으므로 비교하려면 같아야 한다

## 6. 스키마 변경 · 환경변수

**둘 다 없다.** 읽는 것도 쓰는 것도 기존 컬럼이고, `loadKeys`·`loadActors`·`countUnpublished`의
쿼리가 안 바뀐다. `public/flags/`는 `.gitignore`에 `public/fonts/`만 있으므로 **커밋된다**
(`public/brand/`와 같은 부류).

## 7. 불변식 영향

| 불변식 | 영향 |
|---|---|
| export 결정성 (§1.1) | **없다** — 이 화면은 export 경로를 지나지 않는다 |
| blob SHA 2층 비교 | **없다** |
| 인가 경계 (§6.1) | **없다** — 최상단 `requireProjectAccess({ permission: "translation:write" })`가 그대로다. ⚠️ **조건부 렌더로 바꾸지 않는다**(POSTMORTEM 2026-08-31, RSC 페이로드 1.3MB 노출) |
| SAAS 불변식 5 (`projectId` 좁힘) | **없다** — 조회를 안 건드린다 |
| SAAS 불변식 9 (버린 값이 화면에 닿는다) | ⚠️ **유지된다** — Publish 결과 `Alert`가 이 화면에 남는다(Q1). **`router.refresh()`가 바꾸는 조건부 분기 밖**이어야 한다는 조건이 그대로 따라온다 (POSTMORTEM 2026-09-07) |

## 8. POSTMORTEM에서 소환한 것 — 아홉

착수 전 grep의 결과다. **전부 이 화면 또는 이 화면의 조각에서 실제로 났던 것**이다.

1. **2026-09-05 — 페이지 안의 링크 생성기가 옛 경로를 하드코딩해 사이드바가 전부 404였다.**
   `?focus=` → `?locales=` 이관이 정확히 그때와 같은 모양이다(문자열이라 타입도 테스트도 못 본다).
   방어선은 **`lib/routes.ts` 한 곳 + `tsc`**이고, `entry-points`가 보는 것은 선언 두 벌의
   동기화뿐이다(§2.1).
2. **2026-09-07 — `revalidatePath`가 결과 컴포넌트를 언마운트했다.** 헤더를 무조건 렌더하는 이유이고,
   Q1이 어떤 답이 되든 이 조건은 따라간다. **무조건 렌더와 "고정 영역인가"는 별개 축이다**(§1).
3. **2026-09-08 — 실패한 Publish 뒤의 `router.refresh()`가 오류 문구를 씻고 로그인 화면으로
   데려갔다.** `header.tsx:110`의 `if (next.status !== "failed")` 가드가 그 답인데
   **지금 그것을 지키는 단언이 0건이다** — `translations-screen.test.ts:50`은 `router.refresh()`가
   **있는지만** 본다. T10이 "실패 갈래 밖"을 소스로 센다.
4. **2026-09-08 — 제출 버튼 없는 `<form>`은 Enter로 submit되지 않는다.** 검색 입력이 `onKeyDown`으로
   Enter를 직접 받는다. **재작성에서 `<form>`으로 되돌리지 않는다.** 그 규칙을 지키는 스캐너가
   `filters.tsx`에는 없다(초대 다이얼로그만 이름으로 고정돼 있다) — T10이 넓힌다.
5. **2026-09-07 — 클라이언트가 판정 모듈을 값으로 읽어 7.2MB 청크가 나갔다.** §3.5가 칩 판정을
   **잎 파일**로 새로 만드는 이유다. ⚠️ **`client-graph`가 그것을 강제하지 못한다**(§3.5) —
   T10이 파일 목록 정확 일치 단언을 붙인다.
6. **2026-09-09 — 화면을 옮겼는데 무효화 경로가 따라가지 않았다.** `saveTranslation`의 무효화는
   이미 `/projects/<slug>` **서브트리**(`app/(edit)/actions.ts:89`)라 이 배송에서 안 바뀐다 —
   **그 상태를 유지하는 것**이 판정이다.
7. **2026-09-11 — 표 갈래에 본문 랜드마크가 없었다.** `translations/page.tsx:143`의 `<main>`이
   실측으로 붙은 것이고, 그 aside가 사라지고 트리를 다시 쓴다. ⚠️ **`shell-layout.test.ts:189`가
   스스로 "렌더 경로를 못 본다"고 적어 뒀다** — `Centered`의 `<main>`만 남아도 green이다.
   새 구조의 어디가 그것을 드는지 §1.5에 적고 T10이 이름으로 고정한다.
8. **2026-09-09 — `asChild` 자식 옆에 형제를 붙여 Radix Slot이 던지고 셸이 죽었다.** 칩의 제거
   버튼이 링크 안에 들어가면 같은 모양이 된다. **칩은 링크와 버튼을 형제로 둔다**(칩 전체가 링크가
   아니다) — 중첩 상호작용 요소는 접근성으로도 금지다. ⚠️ **런타임 Slot 예외는 메뉴를 열어야
   난다** — 다중 선택 드롭다운 검증에 "실제로 열어 선택·해제 두 방향을 누른다"가 있어야 한다.
9. **2026-09-10 — 테스트가 green이었던 이유가 우연이었다(SVG 치수 단언).** 국기를 CSS
   `background-image`로 그리면 그 부류가 아예 안 생긴다(§3.7) — 치수를 클래스가 든다.

## 9. 새 프리미티브 — `DropdownMenuCheckboxItem`

**다중 선택 컨트롤이 `components/ui/`에 없다.** native `<select multiple>`은 이 밀도에서 쓸 수 없고,
지금 `DropdownMenuItem`으로는 안 된다 — Radix `Item`은 **선택 시 메뉴를 닫고**(`onSelect`에서
`preventDefault()`를 부르지 않는 한), `selected`가 `bg-muted` + `<Check>` **시각 표시만** 붙여
`aria-checked`가 없다.

**→ `radix-ui`의 `DropdownMenu.CheckboxItem`을 `components/ui/dropdown-menu.tsx`에서 감싼다.**

- `role="menuitemcheckbox"` + `aria-checked`를 Radix가 준다
- ⚠️ **`onSelect` `preventDefault()`를 프리미티브가 든다** — 소비자마다 기억하게 하면 하나가 빠진다
- ⚠️ **`{children}`을 `Slot.Slottable`로 감싼다** — `DropdownMenuItem`이 이미 그렇고 같은 이유다
  (POSTMORTEM 2026-09-09)
- ⚠️ **포커스 링 셋을 여는 태그에 리터럴로** — cva 베이스에 모으면 스캐너가 그 파일을 못 본다
- **프리미티브가 16 → 17이 된다.** DESIGN §6.4 등재가 같은 커밋이다

## 10. 문서 갱신

이 배송이 끝나면 **DESIGN §6.1의 "표 자체" 절이 전부 거짓이 된다**(열 순서 · `sticky top-0` 헤더 ·
`bg-muted/50` · 네임스페이스 패널 · 툴바 필터 셋).

⚠️ **§6.1을 통째로 지우지 않는다** — 다른 절 아홉(`:352`·`:359`·`:461`·`:462`·`:480`·`:489`·`:507`·
`:537`·`:680`)이 §6.1을 가리키고, 그중 다수가 인용하는 것은 표 규칙이 아니라 **"가장 흔한 상태가
가장 조용하다"** 원칙 문장이다. **원칙 문장은 §6.1이 계속 소유하고 표 규칙만 다시 쓴다.**

T12가 드는 나머지: §6.4(프리미티브 17 · `Table | §6.1` 포인터 · Button size 정정) · §5(radius
정정) · §6.64(Home의 `?focus=` 링크) · SAAS §8(체크박스 넷 + 완료 게이트) · SAAS §7.7(폐기될 쿼리
키 둘) · `ui-rework/README.md`(배송 표 + 규약 8 예외) · `features/README.md` · CLAUDE.md(디렉터리
구조 · breadcrumb 이관 문장 정정 · 가상화 절의 실측 숫자).
