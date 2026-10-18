# locale-change-formats — 설계

## 0. 경계 확인

- **범위 게이트**: PRODUCT §4.2에 걸리지 않는다. §7.2 "지원 포맷" 문장이 두 포맷을 명시적으로 빼고 있으므로 **그 문장을 고치는 것이 산출물**이다(태스크 T10).
- **불변식**(ARCHITECTURE §0):
  - 병합 없음 — 새 파일은 DB 값과 base 파일의 **규약**에서만 나온다. 빌리는 규약은 넷이다: 루트 로케일 키(base 언어 코드와 같을 때만) ·
    키 구조(평평/중첩) · code-dict 내보내기 형태(default / 같은 이름의 named) · 표현(들여쓰기·개행·따옴표). base 파일의 **값**은 읽지 않는다.
    기존 파일과 DB를 견줘 고르는 코드가 없다. ⚠️ 키 구조·export 형태는 ARCHITECTURE §5.10 "구조는 빌리지 않는다"의 예외로 새로 적는다(T11).
  - 결정성 — 새 파일 생성은 순수 함수이고, 정렬은 `compareKeys`, 끝 개행 1개다. 다음 Publish에서 그 파일이 원본이 되면 수술적 치환이 diff 0을 내야 한다(§1.4 · A3).
  - 수술적 계약 — `writeStrategy: "surgical"`은 그대로다. **원본이 있는 파일은 지금과 바이트가 같다.** 바뀌는 것은 "원본 없음 + 그 소스의 ADD create·revive 언어"라는 한 갈래뿐이다.
  - 인증 경계·스키마·환경변수 — 변화 없음.

## 1. 영향 받는 흐름

| 흐름 | 바뀌는 것 |
|---|---|
| 편집 UI — Languages 카드 | 비지원 포맷이면 머리 Add·행 Remove(base 행 포함)·Inactive Add를 숨김. 판정 우선순위 포맷 > 권한. 설명 문구 |
| 편집 UI — 추가 Dialog | yaml·code-dict는 json과 같은 `Combobox` 입력(이미 `chrome` 아니면 Combobox다 — 변경 없음). `Select` 프리미티브 높이 300 상한 |
| Server Action·MCP | 코어 판정이 두 포맷을 받는다(`SUPPORTED_ADAPTERS`). 껍데기 변경 없음(포맷 목록이 없다) |
| pull(Publish) | `renderLocaleFiles`의 surgical·원본 없음 갈래가 ADD create·revive 언어면 새 파일을 만든다 |
| Publish 미리보기 | `lib/publish/read.ts`의 수술적 per-locale "대상 파일 없음 → `withoutFile`" 갈래에서 계획의 create·revive 언어를 뺀다(A3-1) |
| 만료·관측 | Publish 직전 만료·야간·적재가 쓰는 `observeLocaleFiles`(`lib/pull/locales.ts`)가 `supportsLocaleChanges`를 보므로 두 포맷의 로케일 파일 관측이 자동으로 켜진다(만료가 보류에서 판정으로 바뀐다). CI push는 페이로드의 로케일을 관측값으로 쓴다(`lib/push/apply.ts`) — 변경 없음 |

## 2. 순수 함수 (= `/tdd` 진입점)

### 2.1 `supportsLocaleChanges` (`lib/locales/add-plan.ts`)
`SUPPORTED_ADAPTERS`에 `yaml-catalog`·`code-dict`를 더한다. 주석의 "수술적 포맷 … 범위 밖"을 `ts-dict`만 남기도록 고친다.
테스트: 넷 true · `ts-dict`·`null` false. ⚠️ 기존 테스트가 `yaml-catalog`을 비지원 예시로 쓴다 — `add-plan.test.ts`·`change-plan.test.ts`·
`components/__tests__/source-languages.test.tsx`의 그 픽스처를 `ts-dict`로 바꾼다(같은 커밋).

### 2.2 어댑터 계약 확장 — `Adapter.create?` (`lib/adapters/types.ts`)
```ts
/** 원본이 없는 새 언어 파일(ADD create·revive) — 수술적 어댑터만 갖는다. 재생성 어댑터는 `writeWithErrors`가 원본 없이도 만든다. */
create?(format: DetectedFormat, input: WriteInput & { baseLocale: string }): { content: string | null; errors: AdapterError[] };
```
- 입력 `format.representationSource` = 같은 소스의 **기준 언어 파일 내용**(기존 배선 `lib/pull/run.ts`의 `represent` 그대로). `baseLocale`은 `renderLocaleFiles`가 이미 가진 값을 넘긴다.
- **`content: null`은 늘 Publish를 막는 `failure` 오류를 싣는다**(spec A2-1, 2026-10-18 사용자). `original-file-missing`은 쓰지 않는다 —
  `lib/pull/undeliverable.ts`가 그 코드를 언어 보류로 분류하는데 create 효과는 렌더와 무관하게 캡처돼(`publish-plan.ts`) 전달 목록이 만들지 않은 파일을 "보냈다"고 기록한다.
  - `representationSource` 없음 → `write-parse-failed`가 아니라 새 코드 `write-create-unsupported`(detail로 사유).
  - base 파싱 실패 → `write-parse-failed`(경로는 새 파일 경로).
  - 접두 충돌 → `key-shadowed`.
  - 루트 키 불일치 · 루트 오인 · `__proto__`(code-dict) · 언어 든 export 이름 → `write-create-unsupported`.
  - 새 코드는 `types.ts` 코드 목록·kind 맵(`failure`) · `lib/survey/one.ts` 매핑 · 세 사전의 writer 경고 문구에 등재한다(`write-no-default-export`의 배선을 따른다).
- 값이 빈 엔트리·`orphaned`는 쓰지 않는다(A2). 쓸 엔트리가 0개면 `content: null`, 오류 없음(값 0개 ADD — 호출부 이전에 이미 걸러지지만 방어).
- 주석 갱신: `types.ts`의 `representationSource` 주석 "수술적 writer는 보지 않는다"·"값·키 구조는 읽지 않는다"를 `create`가 읽는 규약으로 고친다.

**왜 기존 `writeWithErrors`에 빈 골격을 원본으로 넣지 않나**: 두 writer의 삽입은 "가장 깊은 기존 맵에 남은 경로를 점 리터럴 한 키로" 넣는다
(yaml `locate`의 `missing.name`, code-dict `insert`). 빈 골격에서는 모든 키가 `"a.b.c": v` 평평한 리터럴이 돼 base의 중첩 규약과 갈린다.
read 왕복은 맞지만 사람이 리뷰할 파일이 아니다. 새 파일은 처음부터 구조를 만든다.

### 2.2.1 공유 헬퍼 (`lib/adapters/shared.ts`)
- **`nestEntries(entries, KEY_SEP)`** — `Map` 기반 중첩 트리. 접두 충돌(`a.b`와 `a.b.c`)은 json-catalog와 같은 규칙으로 깊은 쪽을 살리고
  얕은 쪽은 `key-shadowed`로 보고한다(조용히 버리지 않는다, §1.35). 순서는 `compareKeys`. ⚠️ `Object.create(null)`을 쓰지 않는다 — 정수처럼 생긴 키(`"1"`·`"10"`)를
  먼저 나열해 `compareKeys` 순서가 깨진다(실측). 두 `create`가 같이 쓴다. json-catalog의 기존 사본은 손대지 않는다(외과적 변경).
- **키 구조 관측** — base 파일(루트를 벗긴 뒤)의 최상위 리터럴 키에 `KEY_SEP`가 든 키가 있고 맵 값이 없으면 **평평**, 그 밖은 **중첩**(혼합은 중첩).
  평평이면 `nestEntries` 없이 `compareKeys` 순 한 층으로 쓴다(이 경우 접두 충돌이 생기지 않는다).
- 테스트: 접두 충돌 · 정수 키 순서 · `__proto__` 키 · 평평/중첩/혼합 판정.

### 2.3 `createYamlCatalogFile` (`lib/adapters/yaml-catalog.ts` — `yamlCatalog.create`)
- **루트 키**: base 문서의 `rootKeyOf(doc)`가 **`baseLocale`과 같으면** 새 파일을 `<locale>:` 한 키로 감싼다. 루트가 없으면 루트에 바로 키가 온다.
  루트가 있는데 `baseLocale`과 다르면 `write-create-unsupported`.
- **루트 오인 방어**: 감싸지 않는 경우, 만든 내용에 다시 `rootKeyOf`를 돌려 루트가 잡히면(최상위 키가 하나뿐이고 `looksLikeLocale` — `nav`·`app`·`no`)
  `write-create-unsupported`. 다음 read가 그 키를 벗겨 write마다 키가 중복되는 것(2026-09-17 부류)을 막는다.
- **키 구조**: §2.2.1 관측을 따른다.
- **직렬화 — `toString`을 쓰지 않는다**: 기존 삽입(`insertion`)처럼 줄마다 문자열을 조립하고 키·값 스칼라는 `flowString(…, baseDoc, insertionTypes(baseDoc, null))`로 쓴다.
  그래야 `isYaml11Ambiguous` 토큰(`yes`·`no`·`on`·`12:30` — 키·값 모두)에 따옴표가 붙고, 개행 든 값이 기존 B7a 규칙(큰따옴표)을 따른다.
  새 `Document#toString`은 이 둘을 어기고(실측 — `no`가 맨 글자, 개행 값이 `|-`), 2026-09-16 재발 방지 grep(`doc\.toString|setIn\(` 0건)도 깬다.
- **표현**(base에서 관측): 들여쓰기 폭 · 개행(CRLF) · BOM. 키는 `compareKeys` 순서. 끝 개행 1개.
- 테스트: Rails형(루트 = base 코드) · 루트 불일치(`en-US.yml`의 `en:`) · misskey형(루트 없음) · 루트 오인(`nav:` 하나) · 노르웨이어 루트 `no:` ·
  키 `"yes"`·값 `No`·`12:30` · 중첩·평평·접두 충돌 · `__proto__` 키 · 개행 값 · CRLF/BOM · 들여쓰기 4 + CRLF ·
  **생성 결과를 원본으로 `writeWithErrors`에 같은 엔트리를 넣으면 바이트가 같다**(고정점 — 단 writer는 같은 값을 건드리지 않으므로 이것만으로 스칼라 정책은 증명되지 않는다,
  모호 토큰은 별도 단언) · `read` 왕복.

### 2.4 `createCodeDictFile` (`lib/adapters/code-dict.ts` — `codeDict.create`)
- **내보내기 형태**(base에서 관측): `export default { … }`면 같은 형태. `export const <name> = { … }`면 **같은 이름**으로 내보낸다.
  `<name>`에 `baseLocale`이 들어 있으면(대소문자·구분자 무시 — `koTranslations`·`ko_KR`) `write-create-unsupported`.
  `const x = {…}; export default x`·`satisfies`/`as` 래핑은 새 파일에서 `export default { … }`로 쓴다(값 형태가 같다 — 타입 주석은 비목표).
  base에서 내보낸 객체를 못 찾으면 표현 관측만 기본값으로 떨어진다. base 구문 오류면 `write-parse-failed`.
- **키 구조**: §2.2.1 관측을 따른다.
- **키 표기**: base의 키 따옴표 습관은 기존 `quoteName`의 견본 선택 규칙을 재사용한다(식별자로 쓸 수 없는 키는 늘 따옴표).
  **`__proto__`는 쓰지 않고 `write-create-unsupported`** — 객체 리터럴에서 맨 이름이든 따옴표든 프로토타입을 설정하고, own 프로퍼티가 되는 계산된 키 `["__proto__"]`는
  `read`가 다른 키로 읽는다. 기존 `insert`·`quoteName`(`PLAIN_NAME`)의 같은 잠재 결함은 범위 밖이라 언급만 한다.
- **표현**(base에서 관측): 들여쓰기 · 개행 · 값 따옴표(`dominantQuote(valueLiterals(...))` 재사용) · trailing comma 유무. 리터럴 인코딩은 기존 `quoteLiteral`(이스케이프 안전).
  **BOM은 쓰지 않는다** — 기존 writer가 ts-morph `getFullText()`로 BOM을 떨어뜨리므로 쓰면 첫 편집 Publish에서 의미 없는 diff가 난다(실측). 세미콜론은 고정값(`;`)이다 — 기존 writer에 세미콜론 관측이 없다.
- 확장자는 `pathTemplate`이 정하고 내용은 확장자와 무관하게 같다(`export default`·`export const`는 `.js`·`.mjs`·`.ts`·`.tsx` 모두에서 유효).
- 테스트: 중첩·평평 · named export 같은 이름 · 언어 든 이름 실패 · `const` 경유 export · 키 표기(식별자·하이픈·숫자 시작·따옴표 습관) · `__proto__` 실패 ·
  작은/큰따옴표 base · trailing comma · BOM base에서 새 파일 BOM 없음 · 고정점 · `read` 왕복.

### 2.5 `renderLocaleFiles` 갈래 (`lib/pull/render.ts` — `missingOriginal` early return 앞)
```
original 없음 && surgical:
  represent.locales.has(locale) && adapter.create  → create(format + representationSource, { locale, entries, baseLocale })
  그 밖                                            → 지금처럼 missingOriginal
```
- 새 갈래는 지금 `missingOriginal`을 돌려주는 early return **보다 앞**에 둔다. `create`의 오류에도 `tagged(errors, locale)`로 언어를 붙인다.
- `represent.locales`는 create와 revive를 모두 담는다(`lib/pull/publish-plan.ts`) — 두 경우 모두 이 갈래를 지난다.
- `baseOwnedByOriginal`은 base 언어 전용이라 새 파일(비-base)에는 해당하지 않는다.
- 기존 json·chrome 갈래와 원본 있는 surgical 갈래는 손대지 않는다.
- 테스트: ADD create·revive 언어 + yaml/code-dict → 파일 생성 · ADD 아닌 원본 없는 언어 → 기존 `missingOriginal` 그대로 · `representationSource` 없음 → blocking 실패 ·
  create 실패 → `undeliverable` 분류가 `blocking`.

### 2.5.1 Publish 미리보기 (`lib/publish/read.ts`)
수술적 per-locale 셀의 대상 파일이 base 트리에 없으면 `withoutFile`로 세는 갈래에서, 계획(`localePlan`)의 create·revive 언어는 빼고 "보냄"으로 센다
(`excluded` 처리와 같은 자리). 미리보기와 실행이 같은 판정이어야 한다(POSTMORTEM 2026-10-14).
테스트: `read.test.ts`의 "미리보기 withoutFile == 실행 withheld, yaml" 꼴로 **yaml·code-dict ADD 미리보기 == 실행** 행을 먼저 쓰고,
`lib/pull/__tests__/locale-publish.integration.ts`에도 같은 행을 둔다.

### 2.6 계약 매트릭스 (`lib/adapters/__tests__/contract.ts`)
"ADD의 새 파일 표현 — 다음 Publish diff 0" 행이 재생성 어댑터에만 있다. 두 수술적 어댑터에 같은 행을 더하고, `create`의 유무가
`writeStrategy`와 맞는지(수술적만 `create`를 가진다 — `ts-dict`는 갖지 않는다)를 매트릭스가 센다.
기존 행 "수술적 `write`는 원본이 없으면 null"은 그대로 green이어야 한다.

### 2.7 Languages 카드 판정 (`components/sources/language-row.ts`)
- `planLanguageRow`의 `action`을 `… | null`로 바꾼다. **비지원 포맷 + 새 추가·제거(활성 Remove — base 행 포함 · Inactive Add) = `null`**(렌더 안 함).
  남은 Adding의 Remove(추가 취소)·Removing의 Cancel removal은 그대로다(B2).
- `ActionBlock`에서 `"format"`이 빠진다(숨김이 대신한다). 우선순위는 지원 포맷 안에서 `base > role > unconfirmed`.
- **포맷 지원 여부의 출처는 `detail.languageChangesSupported` 하나**다. 지금 카드는 `supported`를 두 번 계산한다(하나는 `canManage`를 포함, 하나는 `detail.connection` 기반) —
  둘 다 이 필드로 바꾸고 `canManage`와 합치지 않는다. 머리·설명·띠·행 넷이 같은 순서(포맷 > 권한)를 쓰는지 아래 선택 함수가 고정한다.
- Inactive 띠의 복구 문장 선택을 순수 함수로 꺼낸다(포맷 > 권한, B4 — 지금 띠의 순서는 권한 > 포맷이다):
  | | 지원 포맷 | 비지원 포맷 |
  |---|---|---|
  | OWNER | `orphanStripOwner(translations)`(기존) | `orphanStripUnsupported` `Restore the file in the repository, then sync.`(기존) |
  | EDITOR | `orphanStripEditor` `A project owner can add it again.`(기존) | **없음** — 보존 문장만(2026-10-18 사용자. 수동 Sync는 OWNER 전용이고, 기존 EDITOR 문장은 OWNER도 못 하므로 거짓) |
- 카드 설명 선택도 같은 순서다: `비지원 → 없음(설명 미렌더)` · `EDITOR → languagesHelpEditor` · `OWNER → languagesHelpOwner`.
  설명이 없으면 `aria-describedby`를 거는 대상도 없다 — 머리·행 동작이 미렌더라 맞물린다.
- 테스트: 기존 `language-row` 테스트의 `format` 기대를 `null`로 갱신 + EDITOR·비지원 조합 + 비지원 base 행 `null` + 띠·설명 선택 함수 표 전수.

## 3. 껍데기·UI

- **`SourceDetail.languageChangesSupported: boolean`** (`lib/sources/query.ts` — `loadSource` 반환에 둔다. `sourceView`는 소스 목록과 공유하므로 거기 두지 않는다) —
  `supportsLocaleChanges(source.adapterName)`을 **모든 역할에** 싣는다. 이름은 기존 `surface.localeChanges`(`SurfaceLocaleChanges`)와 겹치지 않게 골랐다.
  어댑터 이름·경로는 계속 `connection`(OWNER 전용)에만 있다. boolean 하나는 EDITOR가 이미 화면에서 알 수 있는 사실(버튼이 있나)이라 새 노출이 아니다.
  `SourceDetail` 리터럴 픽스처(`source-languages`·`remove-locale-dialog`·`add-locale-dialog`·`source-remove`·`sources-screen`·`action-commit` 테스트)에 필드를 더한다.
- **`languages-card.tsx`** — `headerBlocked`가 둘로 갈린다: 비지원 → 머리 버튼 미렌더, EDITOR·지원 → 지금처럼 `aria-disabled`. 행 동작 `null`이면 동작 칸을 비운다
  ([Open]은 그대로 — 동작 → Open 순서에서 동작만 빠진다. [Open]의 오른쪽 정렬은 동작 있는 행과 같다).
  **포커스 규칙**: 착지 대상 "머리 [Add language]"가 없으면 카드 제목으로 간다(비지원 포맷에서 남은 Adding·Removing을 취소한 경우·딥링크 —
  `header(card)`가 `null`을 돌려주는 경로를 막는다). 제목이 포커스를 받으려면 `Card`에 `titleId`를 넘긴다(`components/ui/card.tsx` — `titleId`가 있어야 h2에 `tabIndex=-1`).
- **`Select` 높이** — `components/ui/select.tsx` `SelectContent`의 `max-h-[var(--radix-select-content-available-height)]`를
  `max-h-[min(300px,var(--radix-select-content-available-height,300px))]`로 바꾼다(2026-10-18 사용자 — 프리미티브 전체).
  **프리미티브에서 바꾸는 이유**: 같은 상한이 `Combobox`에 이미 있고(`components/ui/combobox.tsx`), 같은 개념은 같은 형이다. 300px 폴백은 item-aligned 모드에서
  변수가 정의되지 않는 경우를 막는다. 짧은 Select는 300 아래라 렌더가 같다(D2). DESIGN §6.675 시간대 행의 "고정 상한이 아니다"를 뒤집는다(T12).
  소비자 수는 `grep -rln "SelectContent" components app | grep -v __tests__ | grep -v ui/select`로 다시 센다(DESIGN §6.4 Dialog 행의 교훈).
- **문구** — `m.sources.languagesHelp`(en·ko·es) 삭제(이 변경으로 소비자 0). 영어 고정 `mcp` 네임스페이스의 `unsupported-format`·`add_locale` 도구 설명을 네 포맷으로(en만 —
  `write-tools.test.ts`의 ASCII 요구를 지킨다). 새 키는 writer 경고 `write-create-unsupported` 하나(세 사전).

## 4. 스키마·환경변수

없음. 마이그레이션 없음 → SELF-HOSTING §3 체크리스트 해당 없음.

## 5. 과거 함정 (POSTMORTEM)

- **2026-09-04 audit #7** — 수술적 어댑터가 원본 없는 파일을 `null`로만 돌려 그 로케일이 흔적 없이 PR에서 빠졌다. 새 갈래도 **안 만드는 경우는 반드시 blocking 오류를 싣는다**(§2.2).
- **2026-09-02 "구분자가 데이터에도 있어서" · 2026-09-17 재발** — 조회와 삽입이 다른 규칙으로 걸으면 중복이 생긴다. 새 파일은 base의 키 구조대로 만들고,
  다음 write의 `locate`가 같은 키로 찾는지를 고정점 테스트가 본다. 루트 오인으로 read가 키를 벗기는 경우는 생성 단계에서 막는다(§2.3).
- **2026-09-16 yaml `toString` 금지** — 새 파일도 `toString`을 쓰지 않고 `flowString`으로 조립한다(§2.3).
- **수술적 치환의 표현 규칙**(POSTMORTEM의 code-dict·ts-dict 인용 부호 회고) — "대응물이 있는 것은 대응물에서, 없는 것은 파일 전체의 다수 스타일". 새 파일은 대응물이 없으므로 base 파일의 다수 스타일이다.
- **2026-10-14 전달 목록·미리보기 약속** — 미리보기와 실행이 같은 판정을 써야 한다. 지원 집합을 넓히면 `read.ts`의 수술적 `withoutFile` 갈래가 실행과 갈리므로
  §2.5.1에서 함께 고치고, 새 Publish 갈래의 "미리보기 = 실행" 행을 먼저 쓴다.
- **2026-09-19 꺼진 컨트롤 테스트** — 속성이 아니라 *열리지 않는다*를 센다(T8).

## 6. 확인된 대가

- 새 파일은 base의 주석·import·타입 주석이 없는 최소 형태다. ant-design형(`const x: Locale = {…}`) 리포는 새 파일만 타입이 없다 — 빌드는 깨지지 않지만 리뷰어가 다듬을 수 있다.
- 새 파일에는 값 있는 키만 들어간다. 그래서 이후 Publish가 새 파일에 부모 맵이 없는 키를 기존 수술적 삽입 규칙대로 점 리터럴 키(`"a.b.c": v`)로 넣는다 —
  read 왕복은 맞지만 중첩 조회 런타임(Rails i18n 등)이 그 키를 찾는지는 리포에 달렸다. T14가 둘째 Publish에서 확인한다.
- base의 규약을 추측할 수 없는 리포(루트 키 불일치·언어 든 export 이름·루트로 오인되는 키 하나)는 Publish가 막힌다. OWNER가 추가를 취소하거나 리포에 파일을 직접 만든다.
- 앱이 새 언어를 로드하는지는 앱 코드가 정한다(code-dict는 대개 import 등록이 필요). **PR 본문 안내는 삭제에만 붙인 채 둔다**(2026-10-18 사용자) —
  등록하지 않아도 앱이 깨지지 않고(새 파일을 안 읽을 뿐) 기존 json 추가와 같은 형이다. `lib/pull/payload.ts`는 바뀌지 않는다.
