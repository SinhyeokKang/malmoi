# translation-tree-range — tasks

순서: 테스트 선행 → 순수 함수 → 페이지 껍데기 → 화면 → 링크 → 문서. **T1–T8은 통합 커밋 하나**다. `treeQuery`·`emptyActions`·`translationsHref`는
기존 export의 동작도 바꾸므로, 순수 함수만 먼저 커밋하면 아직 옛 계약을 쓰는 소비자·테스트가 깨진다. T1–T7의 검증은 작업 중 해당 범위의 확인이고,
소비자 전환이 끝난 **T8에서 `pnpm gate --base <작업 시작 커밋>` green을 확인한 뒤 커밋**한다. 중간 red를 완료로 보고하거나 그대로 커밋하지 않는다.
**고아 삭제는 T6에서 소비자 수정과 함께 한다.** 정본 문서는 이후 문서별 별도 커밋이다.
라벨: **[자동]** `pnpm test`·`pnpm typecheck`·`pnpm test:projects:postgres` · **[수동]** 사람이 브라우저로 판정. 조건 번호는 spec 완료 조건이다.
spec·design의 결정은 2026-10-01 리뷰에서 모두 정해졌다 — 열린 확인 항목이 없다.

## A. 화면 URL 층 (순수)

- **T1** `lib/translations/query.ts` — design §2.1의 함수들 + `listGenerationKey`(§2.3). **기존 export는 지우지 않는다**(T6). 테스트 먼저(`lib/translations/__tests__/query.test.ts`):
  - `statusOf`·`withStatus` 진리표(옛 `missing`·`complete` 포함, 한 축만 남김).
  - `screenQuery(raw)`: 원본 URL 입력을 받아 검색어 없으면 `scope` 무시·파생 · 검색어 있으면 기본 `project`, `source|namespace`는 위치 · 옛 주소 접기(조건 11 — 로케일 없는
    `missing`, `completion` 없는 `missingLocale` 포함) · 정규화된 `x`의 **왕복 고정점**(`screenQuery(serializeScreenQuery(x)) === x`) · 화면 `cursor` 제거.
    같은 `completion=missing` 입력이 화면에서는 `incomplete`, 기존 MCP 파서에서는 `all`인 것을 함께 단언한다.
  - `serializeScreenQuery`·`translationsHref`: `scope`는 위치로 좁힌 검색일 때만 · `translationsHref`가 옛 형 입력을 정규화한다.
  - `treeQuery`·`allSourcesQuery`·`selectQuery`(전 소스에서 항상 선택 키의 소스·네임스페이스로 위치 이동 — 조건 7). `ns=ALL_NAMESPACES`에서 같은 소스 키 선택도 포함한다.
  - `searchQuery`: 새 검색어 → `project`(조건 5) · **같은 검색어 → 쿼리 그대로**(조건 5) · **공백만 → 지우기**(위치 복귀, 새 전 소스 검색이 아님).
  - `isAllSources`·`hasConditions`(재정의) 진리표.
  - `emptyActions`·`applyEmptyAction`: design §2.1 표 다섯 행 + "버튼 쿼리 = `applyEmptyAction`" 대칭(조건 13). `kind`는 `clear-filters`.
  - `listGenerationKey`: 전 소스 범위에서 `ns`·경로가 바뀌어도 같은 키 · 위치 범위에서 `ns`가 바뀌면 다른 키 · Status·`q`가 바뀌면 다른 키 · `__proto__` ns.
  - **MCP 동결 단언**(조건 15): `DEFAULT_TRANSLATION_QUERY.scope === "project"` · `completion=missing&missingLocale=ja`·`completion=complete`가
    `parseTranslationQuery`에서 지금과 같은 값 · 로케일 없는 `missing`은 `all`, cursor 보존 · `parseTranslationQuery`·`serializeTranslationQuery` 기존 테스트 **무수정 green**.
  검증 [자동]: `pnpm exec vitest run lib/translations` green.
- **T2** `lib/translations/tree-narrow.ts` — `rangeOf`·`inRange`·`tallyRows`·`countTree` 추가, `firstRowAt` 유지. **`countRows`·`narrowTree`·`nodeKey`는 T6에서 지운다.**
  테스트 먼저(`lib/translations/__tests__/tree-narrow.test.ts`에 추가): `inRange` 세 갈래(전 소스 · 소스 · 네임스페이스 — 다른 소스의 같은 이름 제외) ·
  `tallyRows` 합 = 행 수, `__proto__` 이름 · `countTree` `null` → 같은 참조 · 0 노드 유지 · `__proto__` 네임스페이스의 수 · `projectKeyCount` 불변.
  검증 [자동]: `pnpm exec vitest run lib/translations` green.
- **T3** `lib/home/cards.ts` — `firstSurfaceWith(perSurface, order)`(design §5). 테스트 먼저: 일치 있는 첫 소스(트리 순서) · 전부 0이면 `null`(호출부가 기본
  소스) · 비활성 소스 제외 · `__proto__` slug.
  검증 [자동]: `pnpm exec vitest run lib/home lib/translations` green. 커밋 경계의 `pnpm gate`가 `lib/home/` 트리거로 postgres 스위트를 붙인다 —
  `translationsHref`를 쓰는 `translationLinkFor`(`lib/keys/`)의 링크 단언(`translation-list.integration.ts`)이 T8의 통합 게이트에서 돈다.

## B. 페이지 (껍데기)

- **T4** `surfaces/[surfaceSlug]/translations/page.tsx` — design §3. `screenQuery(raw)` → 인가된 소스·선택 키로 목적지 경로/네임스페이스·언어 보정 →
  redirect 판정(§3.1) → **늘 `scope: "project"`로 로드** → `inRange` 자르기 → `counts`. 공가 라우트 `translations/page.tsx`도 원본 URL 입력을 받아 같은 직렬화.
  workspace의 `counts` prop 추가와 소비는 T6까지 같은 통합 커밋에서 마친다.
  테스트(`app/(edit)/projects/[slug]/translations/__tests__/landing.test.tsx`) 갱신·추가:
  - 로더가 조건과 무관하게 `scope: "project"`로 불린다 · 화면 `list.rows`는 범위 행뿐이고 `matchedKeyCount`·`selectedInResult`가 자른 행 기준 ·
    조건 있을 때만 `counts`가 전 소스 행의 수(조건 1·9).
  - 옛 주소 redirect(조건 11): `completion=missing&missingLocale=ja` · 로케일 없는 `missing` · `completion` 없는 `missingLocale` · `completion=complete` ·
    검색어 없는 `scope=project` · `incomplete`+`state` · **검색어 없이 `keySurface ≠ route`** → 그 소스 경로와 선택 키의 실제 네임스페이스 · 비활성 `keySurface` → 버림 · cursor 제거.
    A/checkout에서 B/common 키를 고른 옛 주소가 B/common으로 도착하고, 같은 소스의 다른 네임스페이스 키 링크도 바로잡히는지 검사한다.
    `ns=*`인 같은 소스 링크는 범위를 유지하고, 없는 키·`@first`의 기존 부재·첫 키 처리도 유지한다.
  - **루프 없음**: 정규형마다 redirect 없이 렌더 — `q`만, `q`+`scope=source`, `q`+`scope=namespace`, `ns`만, Status만, Status+`q`.
  - `language`가 상세 대상 소스에 없는 로케일이면 **정규 URL과 prop 모두**에서 제거된다. `undefined`·`@missing`은 보존한다(조건 12).
    소스 redirect가 있으면 목적지 기준으로 검사하고, 보정된 주소를 다시 열면 redirect하지 않는다.
  - `@first`는 자른 행의 첫 키 · 검색 중 노드의 `@first`는 그 노드의 첫 일치 키.
  - 기존 단언을 새 규칙으로 고친다 — props의 `scope: "project"`(`:63`·`:122`), 검색어 없는 `scope=namespace` redirect(`:95`), "scope 없는 옛 cursor
    주소…All sources"(`:143-144`).
  검증 [자동]: `pnpm exec vitest run 'app/(edit)/projects/[slug]/translations/__tests__/landing.test.tsx'` green. 전체 게이트는 T8.

## C. 화면

- **T5** `tree-panel.tsx` — `countTree` 결과를 그리고 숨김 없음, 0 노드 `disabled`(범위·위치 노드·소스 토글 제외), 검색 중 · 활성 소스 둘 이상이면
  `All sources` 노드(`Filter namespaces` 입력 아래 맨 위 · `Search` 아이콘 `text-neutral-600` · 합계 수), 범위 `aria-current="true"` / 위치
  `aria-current="location"` + 글자 강조(면 없음 — design §4.3), 위치가 바뀌면 소스 펼침·`Filter namespaces` 통과·`scrollIntoView`.
  DOM 테스트 먼저(`components/__tests__/translation-workspace-scope.test.tsx`를 이 계약으로 다시 쓰고 `…-range.test.tsx`로 이름을 바꾼다):
  검색어 없음 → `All sources` 노드 없음 · 검색 중 → 맨 위에 선택으로 · 활성 소스 하나 → 노드 없음, `All namespaces`가 선택(조건 4) · 전 소스에서 키 선택 →
  그 네임스페이스 행이 `location`이고 배경 클래스가 없다(조건 7) · 조건 켜짐 → 모든 노드가 남고 0은 `disabled`, 범위 노드는 0이어도 활성(조건 9) ·
  접혀 있던 소스의 위치 → 펼쳐진다 · 접두 규칙(조건 10) · `aria-current` 덮어쓰기 순서.
  검증 [자동]: T6 배선까지 연결한 뒤 `pnpm exec vitest run components/__tests__/translation-workspace-range.test.tsx` green.
- **T6** `workspace.tsx` — Status 콤보 하나 · Scope/Completeness/State/툴바 Clear filters/`substituted`/`surfaceLocales` 제거 · 검색 = `searchQuery`(label·placeholder
  분리) · 트리 = `treeQuery` · `All sources` = `allSourcesQuery` · 키 선택 = `selectQuery`(다른 소스면 경로 이동) · `ListState.seen` 제거 · 세대 키 =
  `listGenerationKey` · 빈 상태 표 · 접힌 레이아웃 breadcrumb = 범위 라벨. **고아 삭제를 소비자 수정과 함께 한다**: `clearFilters`·`isNarrowed`·`countRows`·
  `narrowTree`·`nodeKey`와 그 테스트, `messages/en.tsx`의 Scope·Completeness·State·`missingIn`·`missingMenu`·`complete`·`substituted` 문구.
  같은 커밋에서 깨지는 기존 소비자를 고친다:
  - `components/landing/mockup/translations.tsx`(Scope·Completeness 문구) + `landing-mockup.test.tsx`.
  - `lib/__tests__/visual-system.test.ts` — `{w.filters.clear}`+`<RotateCcw` 쌍과 `RotateCcw` 소비자 목록(빈 상태의 `Clear filters`로 옮긴다).
  - `guide/translate/edit.md` 필터 문단 본문(굵은 라벨이 사전에 있어야 하는 `lib/guide/__tests__/content.test.ts` 때문 — gate green이 "문서별 커밋"보다
    먼저다) + SHOOTING의 `state-filter.webp` `dict:` 키가 사전에 남는지.
  테스트: 툴바 트리거 하나와 선택지 다섯(조건 3) · 트리 클릭이 `completion`·`state`·`q`를 안 바꾼 주소로 `push`(조건 2) · 검색 입력이 `scope` 없는 주소(=전 소스)로 ·
  위치로 좁힌 검색에서 재검색 → 전 소스, 같은 검색어 재제출 → 범위 유지(조건 5) · 전 소스에서 같은 소스 다른 ns 키 선택이 목록 세대를 유지(행 참조 동일 +
  **행 렌더 수**를 `translation-workspace-render.test.tsx` 형으로) · 두 소스에 같은 이름의 키가 있을 때 선택이 keyId로 정확 · 검색 지우기 → 키의 위치(조건 8) ·
  **`ns=*`에서 전 소스 검색 → 같은 소스 키 선택 → 그 키의 네임스페이스 표시 → 검색 지우기 → 해당 네임스페이스 목록** ·
  빈 상태 버튼(조건 13) · 검색 입력의 접근 이름이 `Search keys`. 기존 `translation-workspace*.test.tsx` 중 Scope·Completeness 트리거를 잡던 단언을 이 계약으로 고친다.
  `language=@missing`이 키·트리 이동과 새로고침 후 유지되고, 서버 정규화로 제거된 잘못된 언어가 URL에서 되살아나지 않는 DOM 단언도 추가한다.
  검증 [자동]: T8의 Home 링크 소비자·테스트까지 전환한 뒤 `pnpm exec vitest run components lib/translations lib/guide` green. 전체 게이트는 T8.
- **T7** 재마운트 착지(design §4.4) — 모듈 변수 표식을 `proceed` 안에서, 경로 소스가 바뀔 때만 쓰고, 마운트에서 한 번 읽고 지운다.
  하네스: `helpers/dom.tsx`에 언마운트가 없으므로 `createRoot` → unmount → 새 root(또는 `key={routeSurfaceSlug}`)로 재마운트를 만들고, body 프레임은
  `FocusProbe`로 잡는다(fixup observer — POSTMORTEM 2026-09-20·09-24).
  테스트: **언마운트 → 다른 `routeSurfaceSlug`로 새 마운트**에서 트리 노드 · 선택 행 · 검색 입력에 포커스 · 표식의 소스가 마운트 경로와 다르면 **읽고 폐기하며 포커스는 옮기지 않음**(이후 해당 소스로 마운트해도 재사용 안 됨) ·
  취소된 이동은 표식을 안 남김 · 앱 안 소스 전환 뒤 세션 복구 문구(malmoi#100)가 뜨지 않음.
  접힌 레이아웃에서 오버레이로 다른 소스를 고른 뒤 재마운트하면 **트리 열기 버튼**에 착지한다. 최초 마운트 뒤 `ResizeObserver`가 트리를 접는 경우도
  버튼으로 포커스가 이어지며, 그 전에 사용자가 다른 컨트롤로 옮긴 포커스는 뺏지 않는다. 넓은 화면에서는 대상 소스를 펼친 뒤 노드로 착지한다.
  검증 [자동]: 재마운트·폭 변경 DOM 테스트 green + **착지 코드를 지우면 이 테스트가 red인지 뮤테이션으로 한 번 확인**(09-20 — 아무것도 안 재던 포커스 테스트).
  전체 게이트는 T8.

## D. Home 링크 · MCP 문장

- **T8** `components/home/attention-card.tsx` — 빈 로케일 행(`neverFilled`) → `{ ns: ALL_NAMESPACES, completion: "incomplete", language: code }`(조건 12).
  `components/home/count-cards.tsx`·Home `page.tsx`·Home 로더 — 카드마다 `firstSurfaceWith`로 고른 소스 경로(조건 16, design §5). `cardQuery`의
  "범위도 All sources다" 주석을 고친다.
  `components/__tests__/state-links.test.tsx`의 href 단언 갱신(`:47`의 `completion: "missing"` → `incomplete`+`language`, `:35`의 카드 경로가 카드별 소스).
  `messages/en.tsx` `list_keys` 설명을 도구가 받는 축으로 다시 쓴다(design §2.4) · `lib/mcp/tools/keys.ts` 머리 주석 갱신. MCP 테스트(`lib/mcp/**/__tests__`)는
  **무수정으로 green**이어야 한다(조건 15).
  검증 [자동]: **T1–T8 전체 변경**에 `pnpm gate --base <작업 시작 커밋>` green(`lib/home/`·`lib/mcp/`는 gate가 postgres 스위트를 스스로 붙인다 — `scripts/gate-plan.ts`).
  `[commit] feat(translations): unify tree ranges, status filters, and cross-source search` (T1–T8)

## E. 수동 확인

- **T9** [수동] 로컬(`/runtime-test` — dev DB 상주 `bugshot-i18n-test-qa`, 소스 2), 확장 없는 프로필(ARCHITECTURE §1.95 #157):
  - 조건 1·4·6·7·8·14 — 특히 다른 소스 키 선택 → 재마운트 → 선택 행 포커스·스크롤, 검색 지우기 → 키의 소스로 착지(스크롤은 jsdom이 spy로만 잰다).
    좁은 폭의 트리 오버레이에서 다른 소스 선택 → 닫힘·재마운트 → 트리 열기 버튼 착지, 마운트 뒤 폭 측정으로 접히는 경우도 확인한다.
  - 조건 9 — 0 노드가 흐리고 눌리지 않음(육안).
  - 조건 11 — 옛 북마크 주소를 주소창에 직접 열어 정규 주소로 도착(교차 소스와 같은 소스의 다른 네임스페이스 키 링크·cursor 제거 포함).
  - 조건 12·16 — Home 빈 로케일 행·카운트 카드를 눌러 상세 언어·소스 착지. `@missing` 유지와 잘못된 언어의 URL 제거도 확인한다.
  - 조건 13 — 빈 상태 버튼 `busy` → 목록 제목 착지의 실제 포커스.
  조건 2·3·5·10은 자동으로 충분하다.
  검증 [수동]: 위 시나리오별 기대 목록·URL·포커스 대상과 실제 결과를 대조해 전부 일치한다.

## F. 문서 (정본 — 문서별 별도 커밋, `/push` 4단계 신선도 게이트 전에)

- **T10** `docs(PRODUCT)` · `docs(DESIGN)` · `docs(ARCHITECTURE)` · `docs(DIRECTORY)` — design §11 목록. 뒤집은 판정(09-30 → 10-01)과 근거, spec "잃는 것" 표를 남긴다.
  검증 [수동]: design §11의 갱신 대상마다 구현과 정본 문구를 대조해 누락이 없고, 옛 판정은 현행 규칙으로 서술되지 않는다.
- **T11** `/guide` 마무리 — 본문은 T6에 들어갔다. `pnpm guide:check`로 스크린샷 stale 확인 + design §11의 손 판정 넷(`translation-editor.webp` 추적
  소스 · README `hero.webp`·`translation-editor.webp` · `state-filter.webp` · SHOOTING 촬영 절차의 `?scope=source`) → 필요하면 `/guide-shots`.
  검증 [수동]: `pnpm guide:check` 출력과 손 판정 네 항목을 대조하고, 변경 화면과 가이드 본문·이미지·촬영 절차가 일치한다.
- **T12** 기능 종료 — 결론이 정본에 올라갔는지 대조하고 `docs/features/translation-tree-range/`를 지운다.
  검증 [수동]: T10·T11 반영 확인 후 삭제 diff가 해당 feature 문서만 포함하고, 삭제된 경로를 현행 문서 링크가 가리키지 않는지 확인한다.
