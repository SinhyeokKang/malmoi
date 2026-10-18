# locale-change-formats — 태스크

브리프 없음: 신규 표면이 없다. 기존 카드에서 버튼을 숨기고, 문구와 드롭다운 높이를 바꾼다. 다만 A는 어댑터 계약을 넓히므로 실리포 왕복(T14)이 필요하다.

⚠️ **의도된 red**: T1·T2·T3·T5의 red 단계에서 `lib/adapters/`·`lib/pull/` 편집마다 PostToolUse 훅이 `pnpm test`를 돌려 exit 2로 실패 tail을 주입한다.
편집은 막히지 않는다 — 브리프에 "의도된 red"라고 적어 훅 실패로 오진하지 않게 한다.

## 커밋 1 — `feat(adapters): create new yaml-catalog and code-dict locale files`

- [x] T1. `Adapter.create?` 타입 + 새 오류 코드 `write-create-unsupported`(types.ts 목록·kind `failure` · `lib/survey/one.ts` 매핑 · 세 사전 writer 경고 문구) +
  `shared.ts`의 `nestEntries`·키 구조 관측(design §2.2·§2.2.1) + 계약 매트릭스에 "수술적만 `create`를 가진다", "새 파일 → 다음 write diff 0" 행 (red).
  검증: `pnpm exec vitest run lib/adapters` — 두 어댑터 행이 red, `nestEntries`(접두 충돌·정수 키 순서·`__proto__`·평평/중첩/혼합) green, 기존 "수술적 write는 원본 없으면 null" 행 green.
- [x] T2. `createYamlCatalogFile` — 루트 키(base 코드와 같을 때만) · 루트 오인 방어 · 키 구조 관측 · `flowString` 조립(`toString` 금지) · 표현(들여쓰기·CRLF·BOM) · 고정점 · `read` 왕복 (design §2.3).
  검증: `pnpm exec vitest run lib/adapters/__tests__/yaml-catalog.test.ts lib/adapters/__tests__/create.test.ts` green — Rails형·misskey형 고정점, 루트 불일치·루트 오인(`nav:` 하나) 실패,
  `no:` 루트·키 `"yes"`·값 `No`·`12:30`이 따옴표로 나감, 개행 값 큰따옴표, CRLF+들여쓰기 4. `rg -n 'doc\.toString|setIn\(' lib/adapters --glob '!**/__tests__/**'` 0건.
- [x] T3. `createCodeDictFile` — export 형태(default·같은 이름 named·언어 든 이름 실패·`const` 경유) · 키 구조 · 키 표기 · `__proto__` 실패 · 표현(BOM 없음·세미콜론 고정) · 고정점 · 왕복 (design §2.4).
  검증: `pnpm exec vitest run lib/adapters/__tests__/code-dict.test.ts lib/adapters/__tests__/create.test.ts` green.

## 커밋 2 — `feat(locales): add and remove languages for yaml-catalog and code-dict`

T4~T6은 한 커밋이다 — T4만 들어가면 Publish가 새 파일을 조용히 빠뜨리면서 "create 전달"로 기록한다.

- [x] T4. `SUPPORTED_ADAPTERS`에 두 포맷 + 주석 갱신 (design §2.1). 비지원 예시 픽스처를 `ts-dict`로 교체(`add-plan.test.ts`·`change-plan.test.ts`·`components/__tests__/source-languages.test.tsx`).
  `mcp` 네임스페이스 `unsupported-format` 거부 문구와 `add_locale` 도구 설명(en만)을 네 포맷으로.
  검증: `pnpm exec vitest run lib/locales lib/mcp components/__tests__/source-languages.test.tsx` green(`write-tools.test.ts` 거부 갈래·ASCII 요구 포함).
- [x] T5. `renderLocaleFiles` 갈래 — ADD create·revive 언어 + surgical + 원본 없음 → `create`(early return 앞, `tagged`) (design §2.5).
  `lib/publish/read.ts` 미리보기 갈래 — create·revive 언어를 `withoutFile`에서 뺀다 (design §2.5.1). **미리보기 = 실행 행을 먼저 쓴다.**
  검증: `pnpm exec vitest run lib/pull lib/publish` green — 생성(create·revive) · 비-ADD 원본 없음은 `missingOriginal` 유지 · base 없음·create 실패는 `undeliverable` `blocking` ·
  yaml·code-dict ADD 미리보기 == 실행(`read.test.ts`) · 값 0개 ADD 파일 없음(A6).
- [x] T6. 만료 관측 — `observeLocaleFiles`(`lib/pull/locales.ts`)가 yaml·code-dict 템플릿(`{locale}.yml` · `{locale}/common.yml` · `src/locales/{locale}.ts`)에서
  `observed`를 낸다는 **직접 테스트를 새로 만든다**(지금 직접 테스트가 없다 — 코드 변경은 없을 것으로 예상).
  검증: `pnpm exec vitest run lib/pull/__tests__/locale-publish.test.ts lib/import/__tests__/observe.test.ts` + 새 테스트 green. 커밋 전 `pnpm gate` green(`lib/locales`·`lib/pull`이 `test:projects:postgres`를 트리거한다).

## 커밋 3 — `feat(sources): hide language actions for formats that can't change languages`

- [ ] T7. `planLanguageRow` `action: … | null` · `"format"` 블록 제거 · 비지원 base 행 `null` · Inactive 복구 문장·카드 설명 선택 함수(포맷 > 권한) (design §2.7).
  검증: `pnpm exec vitest run components/__tests__/source-languages.test.tsx` + `language-row` 순수 함수 테스트 — 비지원 × OWNER/EDITOR에서 새 추가·제거(base 행 포함) `null`,
  남은 Adding·Removing 취소는 켜짐, 띠·설명 선택 표 전수.
- [ ] T8. `SourceDetail.languageChangesSupported`(`loadSource`, 모든 역할) + 픽스처 6곳 · `languages-card.tsx` — `supported` 출처 일원화, 비지원이면 머리·행 동작 미렌더,
  EDITOR·지원은 `aria-disabled` 유지, `Card titleId`로 제목 포커스 착지 · 비지원이면 카드 설명 미렌더 + `languagesHelp` 키 세 사전에서 삭제 (design §3).
  검증: DOM 테스트 — ① ts-dict 소스에서 `[data-language-add]`·행 Remove·Inactive Add·카드 설명이 0개 ② json EDITOR의 머리·행 버튼, OWNER의 base·unconfirmed 차단 행은
  클릭·Enter 뒤 `[role=dialog]` 없음·Action 미호출(속성만 세지 않는다 — POSTMORTEM 2026-09-19) ③ ts-dict + Adding 취소 뒤 `document.activeElement`가 카드 제목 h2. `pnpm gate` green.
- [ ] T9. `SelectContent` 높이 상한 300 (design §3).
  검증(자동): `components/__tests__/select-contract.test.tsx`에 `max-h-[min(300px,…)]` 클래스 단언 green(`combobox.test.tsx`의 선례).
  검증(수동 — T15에서): Chrome 소스 추가 Dialog의 Select·시간대 Select·온보딩 기준 언어 Select가 300에서 스크롤, 짧은 Select 높이 불변(computed style).

## 커밋 4~ — 문서 (문서별 커밋)

- [ ] T10. `docs(PRODUCT)`: §7.2 "지원 포맷"을 넷으로, `ts-dict`만 비지원. 비지원 포맷 동작 숨김 한 줄.
  검증: `rg -n "json-catalog.*chrome-locales|JSON catalog.*Chrome" docs/PRODUCT.md`에 낡은 "둘뿐" 문장 0건.
- [ ] T11. `docs(ARCHITECTURE)`: §1.4 "`null`은 원본이 없을 때만"에 `create` 갈래 · §5.10 머리 포맷 목록 · "ADD의 새 파일 표현"에 수술적 `create`(빌리는 규약 넷 — 루트 키·키 구조·export 형태·표현,
  "구조는 빌리지 않는다"의 예외로 명시 · 값은 빌리지 않는다 · 실패는 blocking).
  검증: `rg -n "구조는 빌리지 않는다" docs/ARCHITECTURE.md` 히트 문장에 예외가 함께 있다. 같은 rg의 "둘뿐" 문장 0건.
- [ ] T12. `docs(DESIGN)`: §6.66 "꺼진 동작은 숨기지 않는다" → B6 판정 기준 한 문장(§2.4 행 후보) · 우선순위 포맷 > 권한 · Inactive 띠 · 입력 선택 행에 yaml·code-dict ·
  §6.4 Select 행에 높이 상한 · §6.675 시간대 행의 "고정 상한이 아니다" 정정.
  검증: `rg -n "고정 상한이 아니다" docs/DESIGN.md` 0건, `rg -n "available-height" docs/DESIGN.md` 히트가 300 상한과 함께.
- [ ] T12-1. `docs: CLAUDE.md` 언어 삭제 절의 "`json-catalog`·`chrome-locales`뿐" 정정 + `pnpm sync:agents`. 코드 주석 `lib/adapters/types.ts`(`representationSource`)·`lib/pull/locales.ts`(관측 주석)는 커밋 1·2에서 함께.
  검증: `pnpm sync:agents:check` green.
- [ ] T13. `/guide` — `setup/languages.md`(지원 포맷 목록 · "buttons are turned off too, and the card's description says why" 문장 정정)·`reference/formats.md`·
  `faq.md#languages`("keep their comments"에 새 파일 단서 · 새 파일 대가 둘)(en·ko·es 같은 커밋) · `guide/AUTHORING.md` · README에 언어 추가·제거 문장 새로 추가.
  검증: `pnpm test`(가이드 게이트) green. `rg -n "turned off too" guide` 0건. `pnpm guide:check` — `languages-card.webp`는 매핑 소스(`languages-card.tsx`·`language-row.ts`) SHA가 바뀌어
  stale로 뜬다: 지원 포맷 컷이라 화면이 같으면 SHA만 갱신, 다르면 `/guide-shots` 재촬영. `preferences-time-zone.webp`는 매핑에 `ui/select.tsx`가 없어 stale로 안 잡히므로
  열린 목록 높이가 컷에 보이는지 눈으로 보고 재촬영을 판단한다.

## 실물 검증

- [ ] T14. `/roundtrip` — 폐기용 리포에서 추가 → Publish 미리보기(MCP `preview_publish`)와 실행 비교 → PR의 새 파일 → 머지 → 재적재 diff 0 →
  **둘째 Publish에서 새 파일에 없는 부모 아래 키 추가**(평평한 삽입이 런타임 조회에서 어떻게 보이는지 기록) → 제거 → Publish → 파일 삭제.
  픽스처: yaml Rails형(루트 = base 코드) · 루트 없는 yaml · `no:`/`"yes"` 값이 든 yaml · 중첩 code-dict · 평평한 점 키 code-dict · named export code-dict.
- [ ] T15. `/runtime-test` — ts-dict 소스(OWNER·EDITOR)에서 버튼·설명 없음, json EDITOR는 꺼진 버튼(클릭해도 안 열림), 비지원 Adding 취소 뒤 포커스가 카드 제목,
  동작 없는 행과 있는 행의 [Open] 정렬 동일, 설명·동작 없는 카드 헤더 높이, Select 높이 300(Chrome·시간대·온보딩 기준 언어)·짧은 Select 불변.
