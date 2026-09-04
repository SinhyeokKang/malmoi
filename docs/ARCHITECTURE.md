# ARCHITECTURE

**코어 로직(`lib/adapters/`·`lib/githash.ts`·`lib/github.ts`·`lib/scan/`·`lib/push/`·`lib/pull/`·`lib/keys/`·`lib/auth/`·`lib/survey/`)을 건드리기 전에 읽는다.** 무엇을 만드는지는 [MVP.md](./MVP.md), 어떻게 작업하는지는 [../CLAUDE.md](../CLAUDE.md). 이 문서는 **불변식과 함정**만 다룬다.

> 코드가 아직 서지 않은 항목은 `(미구현)` 표시. 구현하면서 실제 동작과 어긋난 부분을 갱신한다.

## 1. 적재·export와 결정성 (`lib/adapters/`)

**어댑터가 양방향이다** — 리포의 로케일 파일을 읽어 키를 적재하고, 편집된 값을 **같은 포맷으로** 되돌려준다. 크롬 `messages.json`으로 통일하지 않는 이유는 그게 불가능하기 때문이다: `chrome.i18n`은 키에 `[A-Za-z0-9_@]`만 허용하는데 조사한 4개 리포 중 3개가 점 표기를 쓴다.

| 어댑터 | 경로 | 리프 | `layout` | `writeStrategy` | 덮는 대상 |
|---|---|---|---|---|---|
| `chrome-locales` | `<root>/_locales/{locale}/messages.json` | `{message, description?}` | per-locale | regenerate | bugshot-2 (4키 × ko/en/fr), 오픈소스 34개 |
| `json-catalog` | `<dir>/{locale}.json` (flat 또는 중첩) | `string` | per-locale | regenerate | bugshot-web (104키 × 2, 중첩·배열), skillflo (**1446키 × 6**), 오픈소스 38개 |
| `ts-dict` | `<dir>/*.ts` (글롭 — 한 파일에 로케일 여러 개) | 문자열 리터럴 | **multi-locale** | surgical | bugshot-2 (**903키 × ko/en/fr**). ⚠️ **자동 탐지 제외 — 명시 지정 전용** |
| `yaml-catalog` | `<dir>/{locale}.y(a)ml` | 문자열 스칼라 | per-locale | **surgical** | 오픈소스 17개 (mastodon·decidim·directus·redmine·misskey) |
| `code-dict` | `<dir>/{locale}.{ts,tsx,js,mjs}` | 문자열 리터럴 | per-locale | **surgical** | 오픈소스 12개 (ant-design·element-plus·vuetify·payload) |

### ⚠️ `layout`과 `writeStrategy`는 별개 축이다 (2026-09-02 분리)

전에는 `layout` 하나가 둘을 겸했다 — `multi-locale`이면 수술적, `per-locale`이면 재생성. `yaml-catalog`·`code-dict`가 **`per-locale` + 수술적**이라 그 겸용이 깨졌다.

| 축 | 정하는 것 | 갈리는 지점 |
|---|---|---|
| `layout` | **경로 모양** | `resolveLocalePaths`(`{locale}` 치환 vs 글롭 매칭), `renderLocaleFiles`(로케일당 1회 vs 파일 × 로케일 이중 루프) |
| `writeStrategy` | **write 기계** | `run.ts`가 **blob 내용을 받는지**, 빈 값 필터를 호출부가 지는지, 결정성 규칙(§1.1)을 적용받는지 |

**`layout`으로 "원본이 필요한가"를 판단하는 코드가 남아 있으면 낡은 것이다.** 그렇게 두면 YAML·코드 딕셔너리 프로젝트가 원본 없이 write에 들어가 `null`을 받고 **PR이 조용히 비어 나간다.**

**`layout`이 둘로 갈린다.** `per-locale`은 `pathTemplate`의 `{locale}`을 치환해 로케일당 파일 하나를 만들고, `multi-locale`(`ts-dict`)은 한 파일에 로케일이 여러 개라 `pathTemplate`이 글롭이고 **write를 파일별로 부른다.** 페이로드 검증이 `{locale}` 포함을 요구하지 않는 것은 이 때문이다.

### 1.1 재생성 writer가 지키는 불변식 (`lib/adapters/shared.ts`)

**같은 입력 → 언제나 바이트 단위로 같은 출력.** 깨지면 blob SHA 비교(§2)가 매번 "변경됨"을 뱉어 야간 cron이 무의미한 커밋을 쌓고 PR diff가 노이즈로 덮인다 — 조용히 망가지고 며칠 뒤에 발견되는 종류다.

⚠️ **아래 표는 `writeStrategy === "regenerate"`(`chrome-locales`·`json-catalog`)에만 적용된다.** 수술적 치환(`ts-dict`·`yaml-catalog`·`code-dict`)은 원본의 순서·빈 줄·주석을 보존하는 것이 요지라 정렬·재조립을 하지 않고 `orderedEntries`를 지나지 않는다 — §1.4를 따른다. **`layout`이 아니라 `writeStrategy`로 갈린다** — `yaml-catalog`은 `per-locale`인데도 이 표를 지나지 않는다.

계약 테스트(`lib/adapters/__tests__/contract.ts`)가 `ADAPTERS`를 순회하며 이 매트릭스를 그대로 검사한다. 어댑터를 추가하면 검사가 자동으로 늘고, 규칙을 어기는 가짜 어댑터를 잡는 네거티브 테스트가 검사기 자체를 지킨다.

| 규칙 | 값 | 깨지는 방식 |
|---|---|---|
| 키 정렬 | **`LocaleEntry.order` 오름차순, 없으면 `<` 비교** (UTF-16 코드 유닛). 동률은 키로 가른다 | 세 가지로 깨진다. ① `localeCompare`는 Node ICU 빌드·로케일에 따라 순서가 달라져 불변식이 실행 환경에 묶인다. ② 동률을 배열 위치로 가르면 **DB 조회 순서가 바이트에 샌다**. ③ `if (e.order)`로 보면 **0이 falsy라 파일의 첫 키가 맨 뒤로 밀린다** |
| 재조립 | 정렬한 순서로 객체를 새로 만든다. **중첩은 각 층이 `setDeep`의 삽입 순서를 그대로 쓴다** | `JSON.stringify`는 삽입 순서를 따르고, Postgres는 `ORDER BY` 없는 쿼리의 순서를 보장하지 않는다. **각 층을 마지막에 다시 정렬하면 최상위를 고쳐도 하위 층이 통째로 재정렬된다** — diff 비율은 낮은데 hunk가 수십 개가 되는 모양이라 지표로는 안 잡힌다 |
| 들여쓰기 | **원본 폭**, 없으면 2칸 | 2026-09-04 개정 (§14). `observeJsonStyle`이 원본 첫 들여쓴 줄에서 읽고 `serializeJson`이 그 폭으로 낸다. **원본이 없으면 2칸** — 재생성은 원본 없이도 파일을 만들어야 한다(신규 로케일). 고정점이 이 축의 안전 근거다: 우리가 낸 파일을 재관측하면 같은 폭이 나온다 |
| 한 줄 컨테이너 | **원본에서 한 줄이던 경로만** 한 줄 | 2026-09-04 추가 (§14, 태스크 1b). chrome `_locales`의 `"k": { "message": … }`가 흔한 관례라 펼치면 **순서가 완벽해도 파일 전체가 diff**다(button-stealer 실측 0.964). `JsonStyle.compactPaths`가 그 경로를 든다 — **키는 세그먼트 배열이다**: `.` 조인이면 `{"a.b": [...]}`와 `{"a": {"b": [...]}}`가 같은 키가 되어 엉뚱한 컨테이너가 한 줄로 나간다 |
| 비ASCII | **원본이 `\uXXXX`였으면 그대로** | 2026-09-04 추가 (§14, 태스크 1b). `JSON.stringify`는 비ASCII를 풀어 쓰므로 그 줄 전부가 diff였다. ⚠️ **관측이 문자열 리터럴 안에서 일어나야 한다** — 전역 정규식으로 보면 DB 값이 담은 리터럴 `\u00e9`(여섯 글자)를 이스케이프로 오독하고, 재관측이 `false` → `true`로 뒤집혀 **2차 write가 1차와 달라진다**. 대문자 헥사는 소문자로 한 번 정규화되고 그다음이 고정점이다 |
| 엔트리 필드 순서 | **원본 다수결**, 동률·관측 불가면 `message`→`description`→`placeholders` | 2026-09-04 추가 (§16, chrome 전용). Midnight-Lizard가 전 엔트리를 `description` 먼저 쓰는데 우리가 반대로 내 diff **0.456**이었다. `dominantFieldOrder`가 원본 텍스트의 함수이고 우리 출력이 균일해지므로 2차 관측이 같은 답을 낸다 — `dominantQuote`와 같은 논증(§1.4) |
| 슬래시 | **원본이 `\/`였으면 그대로** | 2026-09-04 추가 (§16). 합법이지만 **선택적인** JSON 이스케이프라 `JSON.stringify`가 절대 안 낸다. 관측은 비ASCII 축과 같은 문자열 리더 안에 있고 같은 함정을 공유한다 — 값이 리터럴 백슬래시-슬래시를 담으면 재관측이 뒤집힌다 |
| 끝 개행 | 정확히 1개 | `JSON.stringify`는 개행을 안 붙인다. 2개면 SHA가 달라진다 |
| `orphaned` | 제외 | DB엔 남는다 — export에서만 빠진다. **`orderedEntries`가 유일한 관문이라 모든 재생성 writer가 이걸 지나야 불변식에 주인이 생긴다** |
| 미번역 | 제외 (빈 문자열 포함) | 남기면 크롬이 빈 값을 그대로 렌더한다. 빼면 폴백한다 |
| 낼 것 0개 | `null` — 파일을 내지 않는다 | 빈 `{}`는 "이 로케일 지원함"으로 읽혀 빈 UI를 보인다 |

**⚠️ 정렬 지점보다 먼저 볼 것은 값이 흐르는 경로 넷이다** (2026-09-03). `StringKey.sortIndex`가
`LocaleEntry.order`까지 가려면 이 넷을 지나고, **하나만 끊겨도 `orderedEntries`가 코드 유닛
폴백으로 떨어져 전 계층의 단위 테스트가 green인 채 기능만 멎는다:**

| # | 위치 | 나르는 것 |
|---|---|---|
| a | `lib/pull/load.ts`의 `select` | `sortIndex` + `translations`의 `description`·`placeholders` |
| b | `lib/pull/render.ts`의 `RenderKey` | 같은 셋 (`cells`에 로케일별 두 필드) |
| c | `lib/pull/plan.ts`의 `PullRow` | 같은 셋 |
| d | `buildWriteEntries` | `sortIndex → order`. **writer에 넘길 entries의 유일한 관문**이다 |

**`lib/pull/__tests__/entry-order.test.ts`가 이 넷을 한꺼번에 지킨다** — `runPull`이 커밋에 실은
파일 바이트를 보므로 어느 홉이 끊겨도 red다. 픽스처를 **일부러 코드 유닛 순이 아니게** 둔 것이
그 판별력의 조건이다: 코드 유닛 순이면 폴백이 정답을 내서 배선이 끊겨도 통과한다.

**⚠️ 순서를 고칠 때 봐야 할 지점이 여섯이다** (2026-09-03, `docs/features/key-order-preservation/`). 한 곳만 고치면 조용히 무효가 된다:

| # | 위치 | 성질 |
|---|---|---|
| 1 | `lib/pull/load.ts` `orderBy` | DB 조회 순서. 결정성의 근거가 아니라 **가독성**이다 — `orderedEntries`가 전순서를 만든다 |
| 2 | `lib/adapters/shared.ts` `orderedEntries` | 재생성 writer 전부가 지나는 **유일한 관문** |
| 3 | `lib/adapters/json-catalog.ts` `normalizeArrays`의 마지막 줄 | 중첩 **각 층**. 여기서 다시 정렬하면 #2를 고쳐도 하위 층이 재정렬된다 |
| 4 | 같은 함수의 `isDense` 분기 | 배열 인덱스. **#3은 #4와 별개가 아니라 그 본문 안에 있다** |
| 5 | `yaml-catalog.ts` · `code-dict.ts`의 `missing.sort(compareKeys)` | 수술적 어댑터가 **없는 키를 삽입할 때**. `orderedEntries`를 안 지나지만 정렬 규칙을 공유한다 — **닿으면 회귀다** |
| 6 | 정수형 키 hoisting | `"0"`·`"10"`은 JS 객체가 앞으로 끌어올린다. `.sort(`로 grep해도 안 나오고 **직렬화를 직접 짜지 않는 한 보존 불가**다 |

**그리고 `orderBy: { key: "asc" }`가 리포에 두 곳이다** — `lib/pull/load.ts`(바꾼다)와 `lib/keys/query.ts`(**편집 UI 행 순서의 유일한 출처, 절대 바꾸지 않는다**). grep하면 둘 다 잡히므로 어느 쪽인지 이름으로 확인한다.

```
grep -n "orderBy\|compareKeys\|\.sort(" lib/pull/*.ts lib/adapters/*.ts lib/keys/*.ts
```

**이 여섯을 지키는 테스트가 셋이다** (`docs/features/key-order-preservation/` 태스크 5). 순서를 고칠 때 셋 다 red가 아니면 **고친 층이 프로덕션 경로가 아니었을 가능성**을 먼저 의심한다:

| 층 | 파일 | 잡는 것 |
|---|---|---|
| **L1 진입점** | `lib/pull/__tests__/entry-order.test.ts` | `runPull`이 **커밋에 실은 파일 내용**. 값 전달 4홉 중 하나만 끊겨도 red다 — 어댑터·render 단위 테스트는 전부 green인 채 기능만 멎는 층이다. `orderBy` 두 곳도 여기서 갈린다 |
| **L2 골든 픽스처** | `lib/adapters/__tests__/key-order-golden.test.ts` | 실측 리포 모양에서 첫 write가 **바이트 동일**인지. `lib/survey/diff.ts`의 **프로덕션 함수**로 재므로 코퍼스 지표와 같은 자다 |
| **L3 재측정** | 규칙 (CLAUDE.md 문서 신선도 + `/push` 4d) | 일반화 — 처음 보는 리포에서도 그런가. 네트워크 ~4분이라 게이트가 아니라 판단 지점이다 |

⚠️ **L2가 없으면 완료 조건의 diff 수치가 한 번 재고 끝난다.** `pnpm adapter-survey`는 캐시가 없어 `pnpm test`에도 CI에도 못 들어가므로, 그 수치를 오프라인 단언으로 내리지 않으면 다음 날 `orderedEntries`를 되돌려도 아무 게이트도 안 빨개진다.

**중첩 구조는 write에서 복원한다.** 평탄화만 하고 복원하지 않으면 읽은 포맷과 다른 모양으로 되돌려주게 되어 왕복이 깨진다. 배열은 인덱스 키(`hero.subcopy.0`)로 펼치고, `0..n`이 빈틈없이 채워진 객체만 배열로 되돌린다 — 빈틈이 있으면 객체로 남긴다(배열로 만들면 구멍이 `null`로 직렬화되어 원본에 없던 값이 파일에 나타난다).

**`description`은 로케일마다 그 파일이 실제로 갖고 있던 값을 되돌린다** (2026-09-03 개정 — MVP §4.2. 지원하는 어댑터는 `chrome-locales`뿐이고 `json-catalog`은 담을 곳이 없어 DB엔 남지만 파일로 나가지 않는다). 전엔 base에만 냈고 그건 chrome 리포 33개 중 **20개**에서 손실이었다(비-base `description` 실측).

두 값은 **다른 것이다**: `StringKey.description`(소스 키 메타데이터, base 파일에서 온다)과 `Translation.description`(그 로케일 파일이 갖고 있던 값). 합치면 base 값을 비-base에 복제하게 되고 그건 병합이다. **base만** `Translation.description`이 없을 때 `StringKey.description`으로 폴백한다 — `value ?? sourceText`와 같은 축이고, 그 판정은 `lib/pull/render.ts`의 `rowsForLocale(keys, locale, { isBase })`에 있다. ⚠️ 그 `isBase`가 `renderLocaleFiles`에서 빠져 있어 폴백이 **테스트에서만 켜지고 프로덕션에서는 죽어 있었다** (2026-09-04 audit #2 — `rowsForLocale` 단위 테스트가 `{ isBase: true }`를 직접 넘겨 이 홉을 못 봤다. 지금은 `render.test.ts`가 `renderLocaleFiles`를 통째로 지난다).

**`placeholders`는 chrome에서 그대로 왕복한다** (2026-09-03). `LocaleEntry.placeholders`가 원본 JSON을 **해석하지 않고** 나르고 write가 그대로 되돌린다. 모양이 이상해도 버리지 않는다 — 거르면 원본에 있던 것이 우리 PR에서 조용히 사라지고, 에러로 보고하면 read 에러가 `push:local`을 막아 남의 리포가 우리 규칙으로 실패한다. ⚠️ **왕복 의미 게이트가 이 필드를 원리적으로 못 본다** — 바이트 비교만이 그물이다.

**실물 검증 (2026-09-01)**: bugshot-2 사본에 907키 × 3로케일을 전면 편집해 pull을 돌린 결과 8파일 **`+2745/-2745`** — 줄이 하나도 추가·삭제되지 않았다. `+N/-N` 대칭이 수술적 치환의 증거다: 그 방식에서는 빈 줄·주석이 사라지면 **줄 수가 줄어** 비대칭이 나므로, 대칭이면 잉여가 살아남았다는 뜻이다.

⚠️ **이 신호를 재생성 어댑터로 옮겨오지 않는다.** JSON에는 그 잉여가 없어서 재정렬이 줄을 *이동*시킬 뿐 추가·삭제하지 않는다 — 300키를 값 변경 0으로 전면 재정렬해도 `270 insertions(+), 270 deletions(-)`가 나온다(실측). 재생성에서 순서 보존을 확인하려면 **편집 0건으로 pull해 `0 files changed`를 보고**, 그다음 **키 몇 개만 편집해 변경 줄 수와 hunk 수가 그 키 수와 맞는지** 본다. 그 상태에서 **대상 리포의 `tsc`가 통과**하고 주석·빈 줄·파일 끝 개행이 보존됐다 — 이스케이프가 깨졌으면 여기서 잡힌다. **단위 테스트가 원리적으로 못 보는 층이므로 이 확인을 대체할 수단이 없다.**

### 1.2 왕복의 판정 기준은 바이트가 아니라 의미다

**바이트 차이는 정상이다** — 원본 파일이 우리 정렬 규칙을 따르고 있을 이유가 없다. 실제로 조사한 3개 리포 11개 파일 전부 바이트가 다르고 **의미는 전부 같다.** 첫 pull에서 한 번 정규화되고 그 뒤로는 안정된다.

**의미가 다르면 데이터 손실이므로 실패다.** `pnpm ingest <dir>`가 두 판정을 따로 보고한다.

### 1.3 포맷 탐지는 경로만으로 안 된다

`detect`는 리포 파일 경로 목록에서 포맷을 찾는다. **경로 사전순으로 후보를 고르면 틀린다** — bugshot-web에서 `public/search/{locale}.json`(검색 인덱스, 최상위가 배열)이 `src/lib/i18n/{locale}.json`보다 먼저 잡혔다.

- 후보를 **i18n 계열 경로 신호 → 예제·픽스처 디렉터리 감점 → 로케일 개수 → 경로 모양 → 얕은 경로 → 경로순**으로 순위 매긴다. 비교 함수는 `shared.compareTemplates` **하나**이고 어댑터 내부와 어댑터 간이 그것을 공유한다
- **로케일이 2개 이상**이고 **강한 로케일 코드가 하나 이상**인 후보만 인정한다 (하나뿐이면 `config/en.json` 같은 우연일 수 있다)
- `probe` 콜백을 주면 후보 파일 **여러 개**를 읽어 카탈로그 모양인지 확인한다. **GitHub API에서는 블롭 읽기가 요청 비용**이라 경로로 좁힌 뒤 그 후보만 확인하도록 콜백으로 받는다
- **`detectCandidates`가 후보 전부를 순위순으로 낸다.** `detect`는 그 `[0]`이다 — 두 함수가 같은 관문을 지나므로 어긋날 수 없고, 1순위가 틀렸을 때 정답이 몇 순위였는지를 관측할 수 있는 것은 이쪽뿐이다. **예외는 `ts-dict` 하나**(아래 — 자동 탐지 제외라 `detectCandidates`는 `[]`, 명시 지정용 `detect`만 내용 탐지를 돈다). 예외가 둘로 늘면 `detect-candidates.test.ts`가 red다

#### ⚠️ 예제·픽스처 디렉터리가 진짜 카탈로그를 가린다 (2026-09-02 실측)

오픈소스 109개에서 오탐 4건 중 **2건이 `examples/` 아래**였다:

| 리포 | 1순위로 잡은 것 | 진짜 |
|---|---|---|
| lokalise/i18n-ally | `examples/by-frameworks/chrome-extension/_locales/…` | `locales/{locale}.json` (2순위) |
| payloadcms/payload | `examples/localization/src/i18n/messages/{locale}.json` | `packages/translations/src/languages/{locale}.ts` |

`examples`·`example`·`fixtures`·`__fixtures__`·`demo`·`playground`·`sample(s)`·`test(s)`·`__tests__`·`docs`·`.dumi`·`storybook`·`node_modules`를 경로에 포함하는 후보는 **뒤로 밀린다.** 배제가 아니라 감점이다 — 진짜로 그 디렉터리에만 카탈로그가 있는 리포(예제 모음 자체가 산출물인 경우)를 못 잡으면 안 된다.

#### ⚠️ `looksLikeCatalog`은 샘플 하나로 리포 전체를 버렸다 (2026-09-02 실측)

지원 포맷인데 탐지 실패한 4건 중 **셋이 같은 구조**에서 나왔다. probe가 **정렬상 첫 로케일 하나**만 읽는데, 그 첫 로케일이 체계적으로 **가장 덜 관리된 파일**이다:

| 리포 | 샘플 | 떨어진 이유 |
|---|---|---|
| esmBot/esmBot (26로케일) | `locales/bg.json` | 내용이 `{}` — 빈 스텁 |
| jsxc/jsxc (30로케일) | `locales/ar.json` | 최상위에 `"Notifications": null` |
| scratchblocks (78로케일) | `locales/ab.json` | 최상위에 `percentTranslated`(숫자) |

세 규칙으로 완화한다:

1. **샘플을 최대 3개 본다** — base 후보(`en`)를 먼저, 그다음 정렬순. **하나라도** 카탈로그면 통과다. 로케일이 많은 카탈로그에 빈 스텁이 섞이는 건 정상이다.
2. **빈 객체는 판정 보류**다 — "카탈로그 아님"이 아니라 "정보 없음"이다. 다음 샘플을 본다.
3. **최상위 비문자열·비객체 값을 소수 허용**한다(`null`·숫자·불린). `percentTranslated`·`Notifications: null` 같은 메타데이터가 섞이는 건 흔하다. **문자열·객체 리프가 하나라도 있고 그것이 과반이면** 카탈로그로 본다.

`read`는 그대로 엄격하다 — 그 값들은 여전히 `errors`(leaf-type)로 보고된다. 완화한 것은 **탐지 관문뿐**이다.
- **`nested`는 `detect`가 알 수 없다** — 내용의 성질이므로 `read`가 관측해 `ReadResult.nested`로 돌려주고, 호출부가 write 전에 `DetectedFormat.nested`에 실어준다

#### ⚠️ `ts-dict`는 자동 탐지 후보에서 빠져 있다 (2026-09-02)

`ADAPTERS`에는 남아 있지만 `detectCandidates`가 항상 빈 배열을 낸다. 오픈소스 109개에서 후보에 **0회** 올랐고, 코드 딕셔너리를 쓰는 12개 리포는 **전부 로케일당 파일 하나**(`code-dict`)였다 — "한 파일에 로케일 여러 개"는 bugshot-2의 관례이지 생태계의 관례가 아니다. 남겨두는 대가가 `.ts` 디렉터리마다 ts-morph를 돌리는 probe 비용뿐이라 뺐다.

**`--adapter ts-dict` / `Project.adapterName = "ts-dict"` 명시 지정은 그대로 동작한다** — bugshot-2가 실전 검증 대상이므로 이 경로가 그 리포의 공식 온보딩 경로다. `read`·`write`는 아무것도 바뀌지 않았다.

**base 로케일은 아직 추정이다** — `en`이 있으면 `en`, 없으면 사전순 첫 번째. 어느 로케일이 기준인지는 리포의 관례라 미결이다 (MVP §10).

#### ⚠️ 경로 모양이 셋이고, `layout`·`writeStrategy`와 또 다른 축이다 (2026-09-02 3차 실측)

홀드아웃 20개 중 **9개**가 아래 두 새 모양이었다. **read·write가 완전히 같고 `pathTemplate`만 다르므로 어댑터를 새로 만들지 않았다** — `json-catalog`·`yaml-catalog`의 **탐지만** 넓혔다.

| 모양 | 어댑터 | `localeFromPath` |
|---|---|---|
| `{dir}/{locale}.<ext>` | 전부 | 접두 `{dir}/`, 접미 `.<ext>` |
| `{dir}/{locale}/<name>.json` | `json-catalog` | 접두 `{dir}/`, 접미 `/<name>.json` |
| `{dir}/<prefix><sep>{locale}.<ext>` | `json-catalog`·`yaml-catalog` | 접두 `{dir}/<prefix><sep>`, 접미 `.<ext>` |

`localeFromPath`가 템플릿의 `{locale}` 앞뒤를 접두·접미로 쪼개는 방식이라 **세 모양 모두 코드 변경 없이 역산된다**(`/`를 품으면 거부하므로 로케일 디렉터리 형태도 안전하다). `chrome-locales`가 애초에 둘째 모양의 특수 사례(`_locales/{locale}/messages.json`)이고, 리프가 `{ message, description }` 객체라 별 어댑터로 남는다.

세 가지 함정:

1. **로케일 디렉터리 형태만 경로에 i18n 신호를 요구한다.** 디렉터리 이름이 로케일처럼 보이는 일이 파일 이름보다 훨씬 흔하다 — n8n의 `packages/@n8n/{ai,di,db}/package.json`이 4로케일 후보로 1순위가 됐다. 실측에서 이 형태의 진짜 카탈로그 7개는 **전부** 경로에 `locale(s)`·`i18n`을 갖는다. 편향이 한 방향이라 과소 탐지일 뿐 오탐을 만들지 않는다.
2. **로케일 디렉터리에 파일이 여럿이면 디렉터리당 하나만 낸다** (`PRIMARY_NAMES` = `translation`·`translations`·`common`·`messages`·`default`, 그다음 로케일 수, 그다음 알파벳순). 알파벳순만 쓰면 zulip이 `legacy_stream_translations.json`을, automa가 `blocks.json`을 집는다. `Project`가 포맷을 하나만 들기 때문이고, Ghost의 네임스페이스 5개 중 1개만 덮는 것은 그 대가다.
3. **접두사는 오른쪽 구분자부터 시도한다** (`shared.splitLocaleSuffix`). `client.bs_BA`는 마지막 `_`에서 자르면 `BA`(대문자라 탈락)이고 그다음 `.`에서 `bs_BA`가 나온다 — 왼쪽부터 자르면 `bs_BA`를 `_`로 다시 쪼갠다.

#### ⚠️ 맨 3글자 이름은 로케일 앵커가 되지 못한다 (2026-09-02 3차 실측)

`looksLikeLocale`이 `[a-z]{2,3}`을 받는데 3글자 영단어와 정면으로 충돌한다. 홀드아웃 오탐 4건 중 2건이 이것이었다:

| 리포 | 1순위로 잡은 것 | "로케일" |
|---|---|---|
| grafana/grafana | `public/app/plugins/datasource/azuremonitor/dashboards/{locale}.json` (대시보드 정의, read 에러 1,799) | `adx`·`arg` |
| n8n-io/n8n | `packages/nodes-base/nodes/Jira/__schema__/v1.0.0/issueAttachment/{locale}.json` (JSON 스키마) | `add`·`get` |

**후보 그룹은 `hasStrongLocale`을 통과해야 한다** — 2글자(`en`)·지역 서브태그(`zh-CN`·`fil-PH`)·camelCase(`koKR`) 중 하나가 그룹에 있어야 한다. 3글자 로케일(`fil`·`ceb`)을 버리는 게 아니라 **강한 것 옆에 있을 것**만 요구한다: 실제 카탈로그는 거의 항상 `en` 옆에 있고, 우연히 모인 3글자 영단어 디렉터리에는 그게 없다. **모든 어댑터의 그룹 필터가 이 규칙을 지난다.**

#### ⚠️ 순위 픽스는 파이프라인의 **마지막** 층에 넣어야 한다 (2026-09-02 3차)

`detectCandidatesAcross`(`lib/adapters/index.ts`)가 어댑터가 낸 순서를 **전부 버리고 다시 정렬한다.** 그래서 어댑터 안(`rankTemplateCandidates`)에만 넣은 픽스는 명시 지정 경로에서만 살아 있고 자동 탐지에서는 죽는다 — `liftAncestors`가 정확히 그 상태로 단위 테스트만 통과했다 (POSTMORTEM 2026-09-02).

두 규칙이 그 파이프라인에 있다:

- **`templateShapeRank`** — 다른 신호가 같으면 맨 로케일 파일 > 로케일 디렉터리 > 접두사. rubygems.org의 `config/locales/avo.{locale}.yml`이 앱 카탈로그를 이긴 것이 근거다(마지막 tiebreak인 경로 사전순에서 `a` < `{`). **로케일 수보다 뒤에 둔다** — 앞에 두면 discourse의 1키 테마 카탈로그가 진짜를 이긴다.
- **`liftAncestors`** — 1순위의 **조상 디렉터리**에 있는 후보를 앞으로 끌어올린다. DMPRoadmap/roadmap의 `config/locales/contact_us/contact_us.{locale}.yml`(17로케일 · 11키)이 `config/locales/{locale}.yml`(15로케일)을 이겼고, 자손 쪽 로케일 수가 실제로 더 많아 수 신호로는 안 뒤집힌다. **비교 함수가 아니라 정렬 뒤 후처리다** — "조상이 이긴다"가 추이적이지 않아 `sort`에 넣으면 결과가 구현 정의가 된다. 버킷별로 적용하므로 크롬 최우선은 그대로다.

**고치지 못한 것 하나**: discourse의 `plugins/discourse-cakeday/config/locales/client.{locale}.yml`(27키)이 정본을 누른다. 플러그인 쪽 로케일 파일이 하나 더 많고(50 vs 49) 다른 서브트리라 두 규칙 모두 닿지 않는다. `plugins/` 감점을 넣으면 잡히지만 **관측 1건이라 만들지 않았다** — Ghost·payload가 `packages/`에 진짜 카탈로그를 두므로 "하위 디렉터리 감점"으로 일반화할 수도 없다.

### 1.35 ⚠️ 키에 `.`이 들어 있으면 중첩 복원이 값을 삼킨다 (2026-09-02 실측)

**`json-catalog`의 유일한 데이터 손실 경로다.** 오픈소스 109개에서 왕복 의미 불일치 2건이 났고, 둘 다 **`read` 에러가 0**이었다 — CI 게이트도, 에러 카운터도 잡지 못하고 값만 사라진다.

| 리포 | 손실 | 형태 |
|---|---|---|
| siyuan-note/siyuan | 2,636키 중 1키 | 중첩 객체 안의 키가 점을 품어 `_taskAction.task.database`(문자열)와 `…database.index`가 공존 |
| sugarlabs/musicblocks | 84로케일 중 **81개**에서 각 4키 | `"Clear workspace"`와 `"Clear workspace."`(끝점)가 나란히 있다 |

**뿌리는 하나다: `.`가 우리 조인 구분자이면서 실제 키에 들어 있는 문자다.** `flatten`/`setDeep` 쌍이 단사가 아니라, 한 키가 다른 키의 점 경계 접두이면 복원에서 문자열 자리가 객체로 덮인다.

증폭 요인 둘을 함께 고쳤다:

- **`ReadResult.nested`가 포맷 단위 boolean이었다.** musicblocks의 `th.json`은 최상위가 전부 문자열인데 **다른 로케일 파일** 하나에 객체가 있어서 포맷 전체가 nested로 판정되고, th.json의 평평한 키까지 `.`으로 쪼개졌다. → **파일 단위로 관측한다** (`ReadResult.nestedByPath`).
  - ⚠️ **이 수정이 프로덕션 경로에 닿기까지 홉이 넷 더 있었다** (2026-09-04 해소). 고친 직후엔 어댑터·survey만 `nestedByPath`를 썼고 push 페이로드·`Project`·`formatFromProject`는 포맷 단위 boolean만 날라서 **프로덕션 pull이 옛 동작이었다** — `json-catalog.write`가 `nestedByPath` 부재 시 그 boolean으로 폴백하므로 조용했다. 지금은 다섯 지점이 이어져 있고, **하나만 끊겨도 진입점 테스트가 red다**:

| # | 위치 | 나르는 것 |
|---|---|---|
| a | `json-catalog.read` | `ReadResult.nestedByPath` (파일별 관측) |
| b | `buildPushPayload` | `format.nestedByPath` — 없으면 **필드를 만들지 않는다**(빈 객체는 "전부 flat"으로 읽힌다) |
| c | `applyPush` | `Project.nestedByPath Json?` (마이그레이션 `_add_project_nested_by_path`) |
| d | `loadPullState`의 `select` → `formatFromProject` | `DetectedFormat.nestedByPath`. Json 컬럼이라 **boolean이 아닌 값은 버린다** |
| e | `json-catalog.write` | 경로로 조회, 없으면 `nested` 폴백 |

    `ProjectFormatColumns.nestedByPath`를 **optional로 두지 않았다** — 껍데기가 `select`에서 빼면 컴파일러가 막는다 (POSTMORTEM 2026-09-02 "공급 계약은 optional로 두지 않는다"). `lib/pull/__tests__/entry-order.test.ts`가 진입점에서 musicblocks 모양을 단언하고 `lib/push/__tests__/flow.test.ts`가 b→c 홉을 SQL 인자로 본다.
- **`setDeep`이 문자열 자리를 빈 객체로 조용히 갈아끼웠다.** → **에러로 보고하고 그 키를 건너뛴다.** 값을 잃더라도 **어느 키에서 잃었는지 알려주는 것**이 최소 조건이다.
  - **키 단위 스킵도 같은 통로로 보고한다** (2026-09-04). 수술적 어댑터 셋이 값을 넣지 못하고 건너뛰는 자리가 있다 — `code-dict`의 비리터럴 자리·구조 변경이 필요한 삽입, `yaml-catalog`의 알리아스·맵·시퀀스 자리, `ts-dict`의 **로케일 객체 부재**(그 로케일 번역이 통째로 반영되지 않는데 호출부가 "변경 없음"으로 읽었다). 건너뛰는 판단 자체는 옳다(구조를 바꾸는 일이고, 알리아스는 값의 출처가 앵커 쪽이다) — 틀린 것은 **조용한 것**이었다.
  - `lib/adapters/__tests__/contract.ts`가 그 계약을 `ADAPTERS` 순회로 고정한다: 수술적 어댑터는 `writeWithErrors`를 **구현해야 하고**, 값이 안 바뀌면 **원본 바이트를 그대로** 내야 하고, 정상 입력에 에러를 내지 않아야 하고, `writeWithErrors`의 `content`가 `write`와 갈라지지 않아야 한다. 마지막 항목이 있는 이유는 한쪽만 고치면 프로덕션(pull)과 측정(survey)이 서로 다른 함수를 부르게 되기 때문이다.
  - 그 에러가 닿는 곳은 `Adapter.writeWithErrors`다. **pull이 이쪽을 우선 쓴다** (2026-09-04 — 전에는 survey만 썼고 프로덕션에서는 아무 데도 보고되지 않았다): `renderLocaleFiles`가 `LocalFile.errors`에 싣고 `runPull`이 `PullResult.warnings`(`파일: 메시지`, 있을 때만)로 올린다. 편집 UI 문구는 건수와 "개발자에게 알려 주세요"만 덧붙이고(`lib/pull/message.ts`), 어느 키인지는 그 결과를 받은 쪽(cron 응답 JSON·Action 반환)에 있다. 수술적 어댑터 셋도 같은 계약으로 **파싱 실패·default export 부재를 에러로 낸다** — 전엔 원본을 그대로 돌려줘 "변경 없음"으로 읽혔고, 그 파일이 PR에서 조용히 빠졌다.

**⚠️ 이 손실 계열은 "에러 건수" 지표로는 원리적으로 안 잡힌다.** 실측에서 충돌 카운터가 *정확히 같은 키*만 봤기 때문에 0을 냈다 — **접두 충돌**(`a.b`와 `a.b.c`)을 세도록 고친 뒤에야 345건이 드러났고, 그 리포 집합이 왕복 실패 리포와 정확히 일치했다. **왕복 검증이 없으면 이 계열은 통째로 안 보인다.**

### 1.4 수술적 치환 (`ts-dict`·`yaml-catalog`·`code-dict`) — 규칙이 반대다

**값만 바꾸고 나머지 소스를 그대로 둔다.** TS 딕셔너리를 재생성하면 사람이 의미 단위로 넣은 빈 줄(bugshot-2에 120개)과 주석(23개)이 첫 pull에서 사라진다 — JSON에선 한 번의 재정렬이지만 TS에선 **구조 파괴**이고, 번역 도구가 남의 코드를 훼손하는 것으로 읽힌다.

| | 재생성 | 수술적 치환 |
|---|---|---|
| write의 입력 | DB 상태 | DB 상태 **+ 원본 파일 내용**(`DetectedFormat.currentFiles`) |
| 결정성의 근거 | 정렬·재조립 규칙 | 원본 보존 — 바뀐 값이 없으면 **원본을 그대로 돌려준다** |
| `orphaned` 키 | 파일에서 뺀다 | **파일에 남긴다**(값을 안 바꾼다). 지우면 코드가 참조하는 키가 사라진다 |
| 낼 것 0개 | `null` | 원본 그대로(파일을 지우지 않는다). `null`은 원본이 없을 때만 |
| 원본에 **없는** 키 | 그냥 쓴다 | `yaml-catalog`·`code-dict`는 **삽입한다**. `ts-dict`는 무시한다 (아래) |
| 값의 **표현** | 우리 규칙대로 낸다 | **원본에서 읽는다** — 인용 부호는 그 리터럴이 쓰던 것, YAML 블록 스타일은 그 노드가 쓰던 것 (아래) |

#### 값은 DB에서, 표현은 원본에서 (2026-09-03)

**같은 값이라도 그것을 소스에 적는 방법이 여러 가지면, 고르는 주체는 원본이다.** 값만 맞추면 편집한 줄이 주변과 다른 스타일로 남아 diff가 번지고, 대상 리포의 Prettier·ESLint가 그 PR을 거부한다.

- **인용 부호** (`code-dict`·`ts-dict`) — `lib/adapters/quote-style.ts`. 이스케이프 안전성은 계속 `JSON.stringify`가 지고, `quoteLiteral`이 그 결과를 원본의 부호로 옮긴다. **대응하는 원본 리터럴이 없는 삽입 키만** 파일의 다수 부호(`dominantQuote`)를 따른다 — 삽입 줄만 튀면 맞춘 의미가 없다.
  - 결정성: `dominantQuote`를 삽입 **전에** 세지만 삽입은 항상 다수 쪽을 늘리므로 판정이 진동하지 않는다. 진동하면 2차 write가 1차와 달라져 blob 비교가 매번 "변경됨"을 뱉는다 — `code-dict.test.ts`의 삽입 바이트 고정점 케이스가 이걸 고정한다.
- **YAML 블록 스타일** (`yaml-catalog`) — CST 노드가 스타일을 들고 있어 값만 갈아끼우면 저절로 보존된다. **단 값 자체가 그 스타일과 모순되면 `yaml`이 지시자를 바꾼다** — 접힌 스칼라 `>`(clip)는 끝 개행을 함의하므로, 개행 없는 값으로 편집하면 `>-`(strip)가 된다. 값을 정확히 표현하기 위한 변경이라 정상이다 (실물 PR `i18n-format-check#1`).

**왜 별도 규칙이 필요한가**: `JSON.stringify`처럼 이스케이프와 표현을 한 덩어리로 정하는 API는 안전성만 보고 고르면 스타일까지 함께 정해버린다. 값이 맞으니 왕복 테스트·바이트 고정점·실측 코퍼스가 전부 통과하고, **실물 PR에서야 드러난다** (POSTMORTEM 2026-09-03).

#### 없는 키를 삽입한다 (2026-09-02 — `yaml-catalog`·`code-dict`)

값 교체만 하면 **그 로케일 파일에 아직 없는 키**는 번역해도 리포에 도달하지 못한다. base에 100키가 있고 `ko.yml`에 60키만 있으면 나머지 40키는 치환할 대상이 없다 — 재생성 어댑터는 그냥 쓰므로, 이 격차가 "수술적이면 번역이 반영되지 않는다"로 읽힌다.

- 없는 키는 **그 키가 속할 맵/객체의 끝에** 넣는다. 중간 경로가 없으면 만든다.
- **결정성**: 추가되는 키를 코드포인트 정렬 순서로 넣으므로 `같은 DB 상태 + 같은 원본` → 같은 바이트다.
- **`ts-dict`는 예외다.** bugshot-2가 세 로케일을 한 파일에 나란히 두어 키 격차가 구조적으로 생기지 않고, 삽입 지점을 고르는 규칙(어느 로케일 객체의 어디)이 파일 형태에 의존해 이득 없이 위험만 늘어난다.

#### `yaml-catalog` 고유

- **`yaml` 패키지의 `parseDocument`로 CST를 들고 스칼라만 갈아끼운다.** 실측으로 주석(독립·줄끝)·빈 줄·앵커·인용 스타일·`---` 문서 마커가 전부 보존된다.
- ⚠️ **`doc.toString()`은 문서 전체를 다시 찍는다 — 편집이 하나라도 있으면 수술적이 아니다** (2026-09-04 7차 측정, ADAPTER-COVERAGE §13.3). 값이 안 바뀌면 원본을 그대로 돌려주므로 왕복·바이트 고정점·diff 0.000이 전부 통과했고, 실물 PR도 픽스처가 작아 드러나지 않았다. redmine의 `ko.yml`(1,585줄)에 **키 하나**를 편집하면 816줄이 달라진다. **옵션으로 되돌릴 수 있는 축은 원본에서 관측해 맞춘다** — 들여쓰기 폭·줄 접기·시퀀스 들여쓰기(`indentSeq`, Rails는 부모와 같은 열에 `-`를 쓴다)·플로우 컬렉션 여백(`flowCollectionPadding`). **콜론 뒤 정렬 공백처럼 AST에 남지 않는 축은 이 방식으로 못 닫는다** — 편집된 스칼라의 `range`로 원본 문자열을 갈아끼우는 별 기능이 필요하다. `code-dict`·`ts-dict`는 ts-morph가 원본을 스플라이스해 이 문제가 없다(1키 편집 → 1 hunk 실측).
- ⚠️ **들여쓰기 폭과 줄 접기는 CST가 보존하지 않는다** (2026-09-04 audit #4). `doc.toString()`은 기본 2칸·`lineWidth: 80`으로 다시 찍으므로, 4칸 리포에서 값 하나를 바꾸면 파일 전체가 재들여쓰기되고 편집하지 않은 80자 넘는 plain 스칼라가 접혀 나갔다. 들여쓰기는 원본 첫 들여쓴 줄에서 관측하고(`indentOf`) 접기는 끈다(`lineWidth: 0`). 픽스처가 전부 2칸·80자 미만이라 보이지 않았던 축이다 — `yaml-catalog.test.ts` "표현은 원본에서"가 양쪽을 고정한다.
- **알리아스 노드(`*ref`)는 리프로 세지 않는다.** 편집하면 앵커 관계가 깨지고, 애초에 값의 출처가 앵커 쪽이다.
- **Rails식 로케일 루트 키**(`ko:` 하나가 최상위)를 `read`가 관측해 `rootKeyedByPath`(파일별)로 돌려주고 `write`는 **원본에서 다시 관측해** 되돌린다. mastodon·redmine·decidim이 이쪽이고 misskey·directus는 루트에 바로 키가 온다.
- 블록 리터럴(`|`)의 값을 바꾸면 인디케이터가 `|-`로 바뀔 수 있다 — 값 의미는 유지되므로 훼손이 아니다.

#### `code-dict` 고유

- **모듈의 default export 객체 리터럴**을 찾는다. `export default { … }`(element-plus·vuetify·quasar)와 `export default <식별자>` → 그 `const`의 초기화식(ant-design `const localeValues: Locale = { … }`) **한 단계까지** 따라간다.
- 문자열 리터럴이 아닌 프로퍼티(import 참조 shorthand, 템플릿 리터럴, spread)는 **건너뛰고 `errors`에 남긴다** — ant-design의 `Pagination`·`DatePicker`가 그렇다.
- `.ts`·`.tsx`·`.js`·`.mjs`를 받는다. quasar가 `.js`다.
- ⚠️ **`ts-dict`와 다른 어댑터다.** 같은 ts-morph를 쓰지만 `ts-dict`는 "한 파일 안의 로케일 객체 여러 개"를, `code-dict`는 "파일 하나 = 로케일 하나"를 전제한다.

**함정 둘:**

- **`setLiteralValue`를 쓰면 안 된다** — 이스케이프를 하지 않아 백슬래시·개행·따옴표가 재파싱에서 깨진다(실측: `a"b\c\nd` → `a"bcd`). `JSON.stringify(next)`로 따옴표까지 포함한 유효한 JS 리터럴을 만들고 `replaceWithText`로 갈아끼운다. 비ASCII는 그대로 남아 한글이 유니코드 이스케이프로 바뀌지 않는다.
- **`export`된 선언은 로케일 객체가 아니다.** `export const ai = { ko, en, fr }` 같은 묶음 객체의 이름이 2~3자 소문자면 `looksLikeLocale`을 통과한다(bugshot-2의 `ai`·`app`이 0키 "로케일"로 잡혔다). 묶음은 항상 export되고 로케일 객체는 항상 파일 내부용이라 그 한 줄로 갈린다.

**빈 값은 호출부가 걸러서 넘기지 않는다** (2026-08-31 결정). `write`가 `orderedEntries`를 지나지 않으므로 빈 문자열이 오면 그대로 치환돼 소스에 `""`가 박히고, TS 딕셔너리엔 폴백이 없어 그대로 렌더된다. **"미번역 제외"만은 두 방식에 똑같이 적용한다** — 그래야 지우기가 원본 값을 남기는 쪽으로 떨어진다 (MVP §3.2·§4.1).

## 2. blob SHA 로컬 계산 (`lib/githash.ts`)

```
sha1("blob " + byteLength + "\0" + content)
```

**`byteLength`는 문자 수가 아니라 UTF-8 바이트 수다.** 한국어·프랑스어 번역이 들어가므로 `content.length`를 쓰면 즉시 틀린다 — `Buffer.byteLength(content, "utf8")`.

이 함수의 목적은 **API 호출을 건너뛰는 것**이다. base 트리의 blob SHA와 비교해 전부 같으면 GitHub API를 한 번도 더 부르지 않는다. 변경 없는 날이 대부분이라 이게 기본 경로다.

⚠️ **이 층만으로는 부족하다 — 이제 모든 어댑터가 그렇다** (2026-09-04). write가 원본 내용을 요구하므로 로컬 SHA를 계산하려면 **먼저 파일별로 blob을 읽어야** 한다. 이유가 방식마다 다르다: 수술적은 **치환 대상**이 필요하고(§1.4), 재생성은 **표현**(들여쓰기)을 거기서 읽는다(§1.1). 전에는 재생성이 그 읽기를 건너뛰어 파일당 1회를 아꼈고, **그 대가가 재생성 리포 71개 중 30개에서 "값 편집 0건인데 모든 줄이 바뀌는" diff였다** (§14).

`writeStrategy`가 가르는 것은 이제 **원본이 없을 때**뿐이다 — 수술적은 파일을 안 내고, 재생성은 기본값으로 계속 낸다. `layout`으로 가르면 `per-locale` + 수술적인 `yaml-catalog`·`code-dict`가 그 판정을 틀려 조용히 빈 PR을 만든다 (§1).

**그래서 판정이 두 층이다** (2026-08-31 결정 — MVP §3.3):

| 층 | 무엇을 보는가 | 통과 못 하면 |
|---|---|---|
| **1. DB 측 스킵** | `Translation.updatedAt` 최대값 vs `Project.lastPulledAt` | **GitHub을 한 번도 부르지 않고 종료** |
| **2. blob SHA 비교** | 로컬 export vs base 트리 | 커밋·PR 경로로 가지 않음 |

⚠️ **2층으로는 "변경 없음"을 관측할 수 없다** (2026-09-01 실측). 2층은 **base 브랜치**와 비교하므로 pull PR이 머지되기 전까지 매번 "변경됨"을 낸다 — `l10n/sync`와 비교하지 않는 것이 "parents는 항상 base head"(§3)의 결과다. 따라서 **export 결정성의 판정은 두 커밋의 tree SHA 동일성**이고, "두 번째 pull이 no-op"은 1층 이야기다. 실측: 3줄 변경 상태와 2745줄 변경 상태 양쪽에서 tree SHA가 같았다.

1층이 어댑터 방식과 무관하게 성립하는 것이 요지다 — 편집이 없는 날이 대부분이므로 기본 경로가 여기서 끝나고, 재생성 어댑터도 트리 조회 한 번을 아낀다. **대가**: 리포 파일을 직접 고치고 push를 안 돌린 경우를 놓친다(정상 흐름에선 push가 strict로 DB에 반영하므로 `updatedAt`이 움직인다).

검증: `lib/__tests__/githash.test.ts`가 골든 5건(빈 문자열·ASCII·한글·이모지·실제 `messages.json` 형태)을 박고 있고, **마지막 블록이 골든 자체를 `git hash-object --stdin` 실측과 매 실행마다 재대조한다.** 박제된 상수는 대조 대상이 바뀌어도 계속 통과하므로, 이 앵커가 없으면 골든이 낡는 것을 아무도 모른다.

한글 `안녕하세요`는 문자 5개·**바이트 15개**, `🎉`는 UTF-16 코드 유닛 2개·**바이트 4개**다. `content.length`를 쓴 구현은 정확히 이 두 케이스에서 깨진다.

앵커는 `git` **바이너리**만 요구하고 저장소는 필요 없다(`git hash-object --stdin`은 리포 밖에서도 동작한다). CI에는 `actions/checkout`이 있으므로 문제없다.

## 3. GitHub Git Data API 흐름 (`lib/github.ts`)

clone하지 않는다.

**판정과 I/O를 나눈다** (`lib/push/`와 같은 형태): `lib/pull/plan.ts`가 무엇을 낼지 정하고(1층 스킵·경로·entries·2층 SHA 비교), `lib/pull/render.ts`가 파일 내용을 만들고(어댑터 `write`도 I/O가 없어 이 층까지 순수하다), `lib/pull/payload.ts`가 요청 본문을 조립하고, `lib/pull/run.ts`가 순서를 잡고, `lib/github.ts`는 **보내기만** 한다. DB 조회는 `lib/pull/load.ts`다. 오케스트레이션이 클라이언트를 **인자로 주입받으므로**(`lib/pull/client.ts`의 `GitClient`) 테스트가 fake로 호출 수를 셀 수 있다 — "편집이 없으면 API 0회"를 판정할 다른 방법이 없다. `lib/github.ts`에 `server-only`를 붙이지 않은 것은 `scripts/smoke-github.ts`가 그 모듈의 실제 코드 경로를 검증해야 하기 때문이다(§5.5.4와 같은 축).

순서:

1. `GET /repos/{o}/{r}/git/ref/heads/{base}` → base head SHA
2. `GET /repos/{o}/{r}/git/trees/{sha}?recursive=1` → 기존 로케일 파일의 blob SHA. 경로는 `Project.pathTemplate`이 정한다(`per-locale`은 `{locale}` 치환, `multi-locale`은 글롭 매칭 — §1.1)
2.5 **여기서 파일별 blob을 읽는다** (`GET /git/blobs/{sha}`) — 어느 방식이든 write에 원본이 필요하다. 수술적은 **치환 대상**이(§1.4), 재생성은 **표현**(들여쓰기·한 줄 컨테이너·이스케이프)이 거기서 온다(§1.1). **2026-09-04까지 재생성은 이 단계를 건너뛰었고**, 그 대가가 재생성 리포 71개 중 30개의 "값 편집 0건인데 모든 줄이 바뀌는" diff였다 (§14)
3. 로컬 export + blob SHA 계산 → 비교. **전부 같으면 종료** (`multi-locale`은 write를 파일별로 부른다)
4. `POST /git/trees` — **`base_tree`를 반드시 넘긴다.** 빼면 트리가 새로 만들어져 리포의 나머지 파일이 전부 삭제된 커밋이 된다. **항목의 `content`가 blob을 암묵 생성하므로 `POST /git/blobs`를 따로 부르지 않는다** — 파일 8개면 호출 9회가 1회로 줄고, `buildTreePayload`가 이미 `content`를 싣는다
5. `POST /git/commits` — `parents: [baseHeadSha]`, 메시지에 `[skip-l10n]`
6. `PATCH /git/refs/heads/{l10n/sync}` — `force: true`

결과 `PullResult`에 writer가 버린 항목이 `warnings`로 실린다(있을 때만 — §1.35). 커밋이 없어도(2층 스킵) 실린다.

### 함정

- **⚠️ ref의 슬래시를 직접 인코딩하지 않는다 — `octokit`이 담당한다.** `heads/dev`를 그대로 넘기면 octokit이 `.../git/ref/heads%2Fdev`를 만든다. 우리가 먼저 `heads%2Fdev`로 바꾸면 `%252F`가 되어 **조용한 404**다(실측). 이 항목은 원래 raw `fetch` 전제로 쓰여 있었고, 그대로 따르다 함정을 스스로 만들었다 (`docs/POSTMORTEM.md` 2026-09-01). **`Project.baseBranch`가 슬래시를 포함하지 않는 것과 무관하게** `l10n/sync`가 있으므로 이 층은 항상 걸린다.
- **브랜치가 없으면 `PATCH`가 아니라 `POST /git/refs`다.** 첫 실행 경로를 반드시 다뤄야 한다.
- **parents는 항상 base head다.** `l10n/sync`의 기존 head를 parent로 쓰면 누적 히스토리가 되고, base가 앞서 나간 뒤엔 3-way merge가 필요해진다 — 코어 원칙 위반.
- **force update는 의도된 것이다.** `l10n/sync`는 히스토리가 아니라 "현재 DB 상태의 스냅샷"이다.
- **`[skip-l10n]` 마커가 없으면 무한 루프**: pull이 만든 커밋이 main에 머지되면 push가 돌아 다시 DB에 쓰고, 그게 pull을 트리거한다.
- **PR은 하나를 재사용한다.** `GET /pulls?head={owner}:l10n/sync&state=open`으로 먼저 조회. **`head`가 `owner:branch` 형식이어야 필터가 걸린다** — 브랜치명만 넘기면 GitHub이 조용히 무시해 전체 목록이 오고 PR이 중복 생성된다. PoC 리포에 PR 수십 개가 쌓이면 사람이 안 본다.
- **⚠️ `multi-locale`의 write는 파일 × 로케일 이중 루프다** (2026-09-01 발견 — 그전 서술은 "파일별"까지만 말했다). `ts-dict.write`는 `currentFiles[0]`만 보고 **`input.locale`로 로케일 객체 하나를 고르므로**, 파일 하나를 완성하려면 로케일마다 한 번씩 부르며 **직전 결과를 다음 호출의 원본으로 넘겨야** 한다. 파일 축만 돌면 나머지 로케일이 조용히 원본으로 남아 PR에 ko만 바뀐 채 나간다.
- **⚠️ `l10n/sync`를 삭제하면 GitHub이 그 head를 가진 PR을 자동으로 닫는다** (2026-09-01 실측). 첫 실행 경로를 재현하려고 브랜치를 지우면 닫힌 PR이 남고, 다음 pull은 그것을 재사용하지 않고 새로 만든다(`state=open` 필터라 정상). PR 번호가 늘어나는 것을 버그로 오진하지 않는다.
- **base 브랜치 조회가 `null`이면 던진다.** GitHub은 권한 없는 리소스에 404를 주므로 설치 취소·권한 누락도 `null`로 온다. `l10n/sync`의 `null`만 정상 입력이다(첫 실행 경로).

## 4. 사용처 스캔 (`lib/scan/`) — 진실이 아니다

**출력은 `refs`뿐이다.** `ScanResult`에 `errors` 필드가 **없는 것이 이 층의 요지다** — 키의 존재·원문·키 이름 합법성은 전부 §1의 적재 층이 로케일 파일을 읽어 정한다. 이 층은 편집 UI의 컨텍스트("이 문자열이 어디 나오는지")만 만든다.

`pnpm scan`은 **항상 exit 0이다.** CI를 실패시킬 수 있는 건 `pnpm ingest`뿐이다.

bugshot-2 실측: 이름 기반 매칭 시절 **0키 / 에러 1391건** → 지금 **115키 / 참조 273건 / 경고 9건 / exit 0**. 경고 9건은 전부 그 리포의 실제 동적 키다. 훅 기반 두 리포의 실측은 §4.0.2.

**따라서 실패가 경고다.** 스캐너가 못 찾은 키는 동적으로 조립됐거나 아직 안 쓰이는 키다 — 컨텍스트가 빠질 뿐 적재는 정상이다. 남의 리포 CI를 우리 규칙으로 실패시킬 근거가 없다.

**AST를 쓰는 이유**: 정규식은 주석 속 호출·문자열 리터럴 안의 `t(`·템플릿 조립을 구분하지 못한다. ts-morph는 주석을 AST 노드로 만들지 않으므로 주석 속 호출은 애초에 순회 대상이 아니다. 이 프로젝트에서 리뷰 grep이 두 번 그 오탐을 냈다(주석 속 `content.length`, `echo`의 이스케이프 해석).

### 4.0 호출 형태는 둘이다 — `kind`가 가른다 (2026-09-03)

`WrapperId.kind`가 **호출 형태**를 가른다. 이 축이 없던 동안 실측 3개 리포 중 둘의 `refs`가 0건이었다.

| kind | 형태 | 실측 |
|---|---|---|
| `direct` | `import { t } from "@/i18n"` → `t("k")` | bugshot-2 |
| `hook` | export를 부른 **반환값**이 호출자다 | skillflo, bugshot-web |

`hook`이 인식하는 것:

- **구조분해** `const { t } = useI18n()` — 별칭(`{ t: tr }`)도 따라간다. 찾는 프로퍼티 이름은 `t` 고정이고, 이건 실측 관례다(vue-i18n·react-i18next·skillflo가 전부 그렇다). 다른 이름을 쓰는 리포가 나오면 그때 옵션이 된다
- **직접 대입** `const t = useTranslations("hero")` / `const t = await getTranslations({ locale, namespace: "meta" })` — `await`를 벗기고, 객체 인자의 `namespace` 프로퍼티를 읽는다
- **namespace 상대 키를 절대 키로 되돌린다** — `useTranslations("hero")` 스코프의 `t("title")`은 `hero.title`이다. next-intl의 키 체계가 그렇다

⚠️ **바인딩은 스코프를 안다.** 한 파일에 컴포넌트가 여럿이면 같은 이름의 `t`가 서로 다른 namespace를 갖는다(bugshot-web 실측). 호출 위치를 담는 **가장 좁은** 바인딩을 고르고, 스코프 밖의 같은 이름은 남의 것으로 둔다(props로 받은 `t`).

⚠️ **namespace가 리터럴이 아니면 경고를 내고 그 바인딩의 호출을 버린다.** 접두사를 모르는 채 잡으면 **존재하지 않는 키가 `refs`에 실린다** — 0건이 낫다. 훅 반환을 인식할 수 없는 형태(배열 구조분해 등)로 받아도 같다. `lib/scan`이 "실패는 경고"인 층이라 조용한 0건이 가장 나쁜 결과다.

### 4.0.1 래퍼는 여럿이다

`scanSources`는 **wrapper 목록**을 받는다. bugshot-web이 한 리포에서 `next-intl#useTranslations()`(클라이언트)와 `next-intl/server#getTranslations()`(서버)를 함께 쓴다 — 하나만 받으면 절반이 0건이 된다. CLI는 `--wrapper`를 여러 번 받고, 끝의 `()`가 hook을 뜻한다.

**스펙 파싱은 `lib/scan/wrapper.ts` 하나다.** 전에는 `scripts/scan.ts`와 `scripts/push-local.ts`가 각자 파싱했고, 형식이 늘어나면 한쪽만 못 읽는 상태가 조용히 생긴다.

⚠️ **CLI가 `--wrapper` 값 자리를 소비한다.** 값이 `--`로 시작하지 않아, "플래그가 아닌 첫 인자"를 대상 디렉터리로 삼으면 `pnpm scan --wrapper @/i18n#t ./dir`이 래퍼 스펙을 디렉터리로 읽는다.

### 4.0.2 실측 (2026-09-03)

세 리포 모두 **오탐 0**이다. 오탐 판정은 스캔이 낸 키를 그 리포의 로케일 파일 키와 대조한 것이다.

| 리포 | 형태 | 전 | 후 | 로케일 키 대비 | 오탐 |
|---|---|---|---|---|---|
| bugshot-2 | direct | 115키 / 273건 | **변화 없음** | 903키 중 111 (12.3%) | 0 |
| skillflo | hook (구조분해) | **0** | 1144키 / 1643건 | 1446키 중 1144 (**79.1%**) | 0 |
| bugshot-web | hook + namespace, 래퍼 2개 | **0** | 30키 / 46건 | 104키 중 30 (28.8%) | 0 |

**커버리지가 낮은 쪽은 스캐너 결함이 아니라 그 리포의 키 구성이다.** bugshot-web의 미검출 74건은 전부 동적 조립(`t(\`faq.items.${id}.q\`)`)이거나 배열 인덱스(`hero.subcopy.0`)이고, 경고 13건이 그 자리를 신고한다. 원리적으로 못 잡으며 답은 대상 리포의 `// @l10n-keys`다. bugshot-2의 12.3%도 같은 이유이고, 그 리포는 포맷이 둘이라(`_locales` 4키 + ts-dict 903키) 대조 대상을 잘못 고르면 오탐 96.5%로 보인다.

### 4.1 래퍼 매칭은 이름만으로 하지 않는다

대상 리포에 이미 다른 `t()`가 있을 수 있다. bugshot-2가 정확히 그렇고(`t(key, params?)`), 이름만 보고 매칭했을 때 기존 호출 **1391건이 오탐**으로 잡혔다.

- **모듈 경로 + export 이름**으로 식별한다. `import { t } from "<module>"`이 있는 파일만 검사하고, 별칭(`t as translate`)도 따라간다
- **모듈 경로도 충돌한다** — bugshot-2의 래퍼가 하필 `@/i18n#t`다. 그래서 호출부가 값을 넘기고 CLI는 `--wrapper <module>#<export>[()]`로 받는다. 대상 리포의 관례를 스캐너가 알 수 없다
- **래퍼 지원은 선택사항이다.** 적재가 래퍼에 의존하지 않으므로, 래퍼가 없는 리포도 `__MSG_` 토큰과 `chrome.i18n.getMessage("k")`로 사용처를 얻는다. `getMessage` 직접 호출은 import 게이트를 타지 않는다 — 전역 `chrome` API라 import가 없다
- **같은 `path:line`이 두 경로에서 잡히면 접는다.** `manifest.config.ts`의 토큰이 AST·정규식 양쪽에 걸릴 수 있다

### 4.2 두 경로는 독립이다

`__MSG_key__` 토큰 훑기는 **파일 종류와 무관하게** 돈다. `manifest.config.ts`는 `.ts`인데 토큰을 문자열 리터럴로 담고 있어서, AST 경로에만 보내면 AST가 문자열이라 무시하고 토큰이 전부 누락된다 — 실전 스캔에서 발견됐다.

**`namespace` 파생은 이 층이 아니라 어댑터 층(`lib/adapters/shared.ts`)에 있다.** 로케일 파일에서 읽은 키에 대한 판정이고, 구분자가 둘이다 — chrome은 `[A-Za-z0-9_@]` 제약 때문에 밑줄(`popup_title`), json-catalog은 점(`common.viewAll`)을 쓴다. 먼저 나오는 구분자 앞이 namespace이고, 없거나 맨 앞이면 `_root`다.

**`refs`는 push마다 전체 교체한다.** 증분 갱신은 삭제 케이스를 놓치기 쉽고, 스캔이 전수라 교체가 더 정확하고 단순하다.

**출력은 정렬한다** (키·refs 모두, §1과 같은 `<` 비교). 스캔 결과가 push 페이로드라 결정적이지 않으면 서버 쪽 diff가 노이즈가 된다.

## 5. 스키마 결정 (`prisma/schema.prisma` — `20260831012453_init`)

테이블 정의는 [MVP.md](./MVP.md) §6. 여기엔 *왜* 그렇게 했는지만.

- **`Project`는 경계이지 기능이 아니다.** 테넌트별 인증·권한·과금은 없다 — 그건 나중에 additive로 붙는다. 지금 넣은 이유는 `StringKey.key`의 복합 unique와 `Locale`의 복합 PK가 **나중에 바꾸면 실데이터 이관**이 되기 때문이다. 마이그레이션 시점의 행 수는 0이었다.
- **`Translation.projectId`는 테넌트 격리 장치다.** `keyId`·`localeCode`를 독립 FK로 두면 프로젝트 A의 키 + B의 로케일 조합을 DB가 허용한다. 두 FK가 같은 `projectId`를 공유하게 만들어 막았고(`StringKey`의 `@@unique([projectId, id])`가 그 복합 FK의 대상이다), 실제로 insert가 FK 위반으로 거부되는 것을 확인했다.
- **`KeyRef`엔 `projectId`가 없다.** FK가 하나뿐이라 테넌트 간 참조가 성립할 수 없고, 프로젝트 단위 삭제는 관계를 타면 된다. 쓰지 않을 비정규화는 하지 않는다.
- **`Project` 관계는 `onDelete: Restrict`.** Cascade면 프로젝트 삭제가 번역을 조용히 날린다. 프로젝트 삭제가 필요해지면 soft delete로 푼다.
- **`namespace`는 파생값인데도 컬럼으로 저장한다.** 사이드바 쿼리가 이 컬럼 하나로 끝나고, 키에서 매번 파싱하면 인덱스를 못 탄다.
- **`sourceHash`를 따로 둔다.** 원문 문자열 비교로도 stale을 감지할 수 있지만, 해시면 인덱스가 작고 비교가 싸다. 긴 원문이 많다.
- **`Translation`에 `UNIQUE(keyId, localeCode)`.** 이게 없으면 중복 행이 생겨 export가 비결정적이 된다 — §1 불변식이 스키마에 의존한다. **위생이 아니라 하중 부담 제약이라 지우면 안 된다.**
- **`Translation`의 외래키는 둘 다 `ON DELETE RESTRICT`.** "키를 삭제하지 않고 `orphaned`로 둔다"는 코어 불변식을 **DB가 강제**한다 — 번역이 달린 `StringKey`를 지우려 하면 Postgres가 거부한다. `Cascade`면 실수로 키를 지우는 코드가 번역까지 조용히 날린다. `Locale` 쪽도 같은 이유로 `Restrict`다(로케일을 지워 번역이 사라지는 걸 막는다).
- **`KeyRef`만 `ON DELETE Cascade`.** refs는 push마다 전체 교체되는 파생 데이터라 보존할 이유가 없다 — 여기서 `Restrict`를 쓰면 교체 자체가 막힌다.
- **`updatedBy`는 GitHub 핸들 문자열이다.** JWT 세션이라 사용자 테이블이 없어 외래키를 걸 대상이 없다 (§6).
- **`orphaned`는 `StringKey`에, `needsReview`는 `Translation`에.** 키의 존재 여부는 코드가, 번역의 신선도는 값마다 판정되기 때문이다.
- **인덱스는 전부 `projectId` 선두 복합이다.** 모든 조회가 프로젝트로 먼저 좁혀지므로 단독 컬럼 인덱스는 쓸 수 없다. `(projectId, namespace)`(사이드바), `(projectId, orphaned)`(orphaned 필터), `(projectId, localeCode, needsReview)`(검토필요 필터 — MVP §3.2의 필터 3개를 떠받친다), `KeyRef_keyId_idx`(키 상세의 참조 목록). `UNIQUE(keyId, localeCode)`가 키+로케일 단건 조회 인덱스를 겸한다.

## 5.5 push 적용 (`lib/push/`)

**판정과 I/O를 나눈다.** `payload.ts`가 로케일 파일에서 페이로드를 조립하고, `plan.ts`가 순수 함수로 계획을 세우고(`toInsert`/`toUpdate`/`toOrphan`/`toUnorphan`/`staleKeyIds`), `apply.ts`가 그것만 실행한다. `PushPlan`에 **`toDelete`가 없는 것이 요지다** — 코드에서 사라진 키는 `orphaned`로 표시만 한다.

### 5.5.0 페이로드 생산자는 하나다 (`payload.ts`, 2026-09-03)

`buildPushPayload`·`selectLocaleFiles`·`pickBaseLocale`이 **호출부가 아니라 `lib/`에 있다.** 전에는 `scripts/push-local.ts`의 리터럴이라 계약이 넓어져도 컴파일러가 붙잡을 지점이 없었고, 필수 필드 둘이 늘었는데 typecheck·test가 전부 green이었다 (POSTMORTEM 2026-08-31). **스키마(zod)와 소비자(`applyPush`)는 타입으로 이어져 있었는데 생산자만 끊겨 있었다.**

- **`selectLocaleFiles`가 "어댑터에게 무엇을 먹이는가"를 정한다.** 축은 `layout`이다(`writeStrategy`가 아니다 — 그쪽은 write에 원본이 필요한지를 정한다). 먹이지 않으면 어댑터는 없는 것과 같다 (POSTMORTEM 2026-09-02).
- **`pickBaseLocale`은 추정이다** — `en` 우선, 없으면 사전순 첫 번째. 리포 관례라 정본이 아니고 TASKS §3a의 🔒 항목이 그 자리다.
- `scripts/ingest.ts`는 이 함수를 그대로 import한다 (2026-09-04 — 전엔 바이트 동일한 복사본이었다). ⚠️ **`lib/survey/select.ts`엔 같은 층이 따로 있다** — survey가 측정 전용이고 요구가 다르기 때문이다. 새 어댑터를 추가하면 **둘 다** 고친다.
- **`multi-locale` 파일 선택은 `shared.matchGlobPaths` 하나다** (2026-09-04 통일). 전에는 셋이 각자 규칙을 들었다 — push·ingest가 `startsWith(dir) && /\.tsx?$/`(하위 디렉터리·`.tsx` 포함), pull의 글롭은 둘 다 제외, survey는 하위 제외·`.tsx` 포함. **그 차이에 걸린 파일은 키가 DB에 적재되고 편집 UI에 뜨는데 pull이 영영 쓰지 않았고 에러도 없었다.** 정본은 `pathTemplate`이다: `*.ts`는 `.ts`만 잡고 `*`는 `/`를 먹지 않는다 — `.tsx`를 담아야 하면 `detect`가 `*.tsx`를 내야 한다(선택 층에서 확장자를 넓히면 그 층만 아는 규칙이 다시 생긴다). `lib/adapters/__tests__/multi-locale-paths.test.ts`가 push·pull의 결과를 같은 집합인지 대조한다.

### 5.5.1 pooler가 구현을 규정한다

- **대화형 트랜잭션을 쓸 수 없다.** 런타임이 transaction 모드 pooler(6543)라 `$transaction(async tx => …)`은 문장마다 다른 백엔드로 갈 수 있다. **배열형 `$transaction([...])`** 은 한 번에 배치로 보내므로 pgbouncer에서도 원자적이다.
- **키마다 왕복하면 타임아웃이다.** skillflo가 1446키다. `unnest()`로 배열을 넘겨 문장 하나가 전체를 처리한다. 실측 1446키 + 2892번역 + 1446refs가 **약 1.6초**(라우트 한도 60초).
- **키 id를 JS에서 만든다.** 스키마의 `@default(cuid())`는 Prisma 클라이언트가 적용하는 값이라 raw SQL에는 오지 않는다. 현재 `randomUUID()`를 쓰고, 형식 혼재를 통일할지는 미결(TASKS §4).

### 5.5.15 적용은 한 트랜잭션이다 (2026-09-04)

**배열형 `$transaction` 하나가 Locale·StringKey·Translation·KeyRef·Project를 전부 커밋한다.**
전에는 둘이었다 — 키 id를 확보하려고 중간에 `stringKey.findMany`를 한 번 더 쳤기 때문이다. 두 번째가
실패하면 **키·`orphaned`·`needsReview`만 새 상태이고 번역·refs·`Project.lastCommit*`은 옛 상태인
혼합 DB**가 남는다.

- **삽입 id를 JS에서 만들어 들고 있으면 그 조회가 없어진다.** 이미 `randomUUID()`로 만들고 있었고
  (`@default(cuid())`는 Prisma 클라이언트가 적용해 raw SQL엔 오지 않는다) 그 값을 버렸을 뿐이다.
  `idByKey`는 `existing` + 생성한 id로 조립한다.
- **문장 순서가 곧 결과 인덱스다.** 보고값(`staleTranslations`·`translationsFilled`·
  `orphanedLocales`)을 꺼내려면 그 순서를 알아야 하므로 인덱스를 조건별로 세어 계산한다.
  문장을 끼워 넣으면 그 계산도 같이 고친다.
- ⚠️ **중복 키가 이 트랜잭션을 거부시킨다.** `json-catalog`의 `flatten`은 중복을 검사하지 않아
  `{"a.b": …, "a": {"b": …}}`가 같은 평탄화 키를 두 번 낸다(§1.35). 그 쌍이 한 `INSERT … ON CONFLICT
  DO UPDATE`에 들어가면 Postgres가 `cannot affect row a second time`으로 문장을 거부해 **지원 포맷
  리포가 push를 아예 못 끝낸다.** 생산자(`buildPushPayload`)와 `applyPush` **양쪽**이 접는다 —
  와이어 계약이 중복을 허용하므로 옛 CI의 페이로드도 받아야 한다. 규칙은 **마지막이 이긴다**(YAML
  로더·`read`와 같다)이고 접힌 수를 `duplicateKeys`로 보고한다.

### 5.5.16 사라진 로케일은 `orphaned`다, 삭제가 아니다 (2026-09-04)

**로케일 목록의 정본은 어댑터가 탐지한 파일 목록이다** (MVP §3.1). 사라진 로케일을 표시하지 않으면
DB에 영구 잔존하고 **pull이 그 파일을 되살린다** — 개발자가 지운 `fr.json`이 다음 PR에서 돌아온다.
행은 남아 있고 번역도 남아 있으므로 write가 내용을 만들어 커밋에 싣기 때문이다.

키의 `orphaned`와 같은 모양으로 푼다. **지우지 않는 이유가 둘이다**: 파일을 되살리면 번역이 그대로
돌아와야 하고, `Translation`의 FK가 `RESTRICT`라 지우려면 번역을 먼저 지워야 한다.

| 지점 | 무엇 |
|---|---|
| `applyPush`의 Locale upsert | 페이로드에 있는 로케일은 `"orphaned" = false`로 **되돌린다** |
| 같은 트랜잭션의 `UPDATE "Locale"` | 페이로드에 없는 로케일에 `orphaned = true`, **`isBase = false`** |
| `loadPullState`의 `select` | `where: { orphaned: false }` — pull이 그 경로를 아예 만들지 않는다 |
| `saveTranslation` | orphaned 로케일 저장을 거부한다 — 받으면 `updatedAt`만 올라 pull이 헛돈다 |

- **`isBase`를 함께 내리는 이유**: base 파일이 삭제되면 push가 남은 파일에서 새 base를 고르는데, 옛
  행의 `isBase`가 남으면 `true`인 행이 둘이 된다. `app/(edit)/keys/page.tsx`가 그 값으로 열을
  정렬하고 기본 열을 고르므로 **화면이 사라진 로케일을 base로 세운다.**
- ⚠️ **목록이 비면 표시 문장을 내지 않는다.** `<> ALL('{}')`은 전 로케일을 orphan시킨다.
- **편집 UI는 여전히 그 열을 보여준다** — 동결이라(MVP §8.3) 배지·비활성 처리를 새로 만들지 않았고,
  저장 거부가 실제 손실을 막는다. 그 어긋남은 MVP §10에 있다.

### 5.5.2 번역값은 strict 덮어쓰기다

**`INSERT ... ON CONFLICT DO UPDATE`.** 리포 파일의 값이 push마다 DB를 덮는다 — 변경 감지도, 병합도, 예외도 없다 (MVP §3.1). base 로케일 행도 같이 쓴다.

> **⚠️ 2026-08-31 정책 반전.** 이전 구현은 `DO NOTHING`(없을 때만 채우는 콜드 스타트)이었고, 그전 스펙은 "번역 값을 어떤 경로로도 건드리지 않는다"였다. **문서에서 이 둘 중 하나를 서술한 대목을 보면 낡은 것이다.** 반전 이유는 MVP §3.1에 있다 — 진실의 방향을 한 번에 하나로 두는 것이 "병합 없음"을 지키는 가장 단순한 형태다.

**대가는 편집 손실 창이다.** 번역자의 편집은 pull PR이 머지되기 전까지 리포에 없으므로, 그 사이 push가 오면 사라진다. 이 위험을 코드에서 지우려 하면 곧 변경 감지·병합이 되어 코어 원칙을 깬다 — 완화는 pull 주기를 줄이는 쪽에서만 한다.

**따라서 `Translation.value`의 쓰기 주체는 둘이다**: 편집 UI의 `saveTranslation`과 push. 셋째가 생기면 어느 쪽이 이기는지 다시 판정해야 하므로 늘리지 않는다.

### 5.5.3 보고값은 실제 영향 행수다

`$executeRaw`가 돌려주는 영향 행수를 배열형 트랜잭션 결과에서 읽는다. 후보 수를 보고하면 실제로 쓰이지 않은 행까지 세어 CI 로그에 거짓이 남는다 — `DO NOTHING`이던 시절 재전송마다 "번역 2892건 채움"이 찍혔다. strict에서는 재전송도 전 행을 갱신하므로 두 수가 대개 같지만, 보고 경로는 그대로 실측을 읽는다.

### 5.5.4 `applyPush`는 클라이언트를 주입받는다

`lib/db.ts`를 직접 import하면 그 파일의 `server-only` 때문에 스크립트·테스트가 이 모듈을 **열 수조차 없다** — `lib/env.ts`에서 이미 밟은 함정이다. 라우트가 `getPrisma()`를 넘긴다.

### 5.5.5 오배송·역행을 페이로드로 막는다 (2026-08-31 결정, 구현됨)

**두 검사 모두 거부이지 병합이 아니다** — 어긋난 요청을 어떻게든 반영하려 들면 그게 diff 동기화가 되어 코어 원칙을 깬다. 둘 다 **409**로 떨어뜨린다.

| 검사 | 비교 대상 | 막는 것 |
|---|---|---|
| `projectSlug` ≠ `ACTIVE_PROJECT_SLUG` | 서버 env | **오배송.** 남의 프로젝트 키가 전부 orphan되고 이물 키가 삽입되는데, `PushPlan`에 `toDelete`가 없고 FK가 `RESTRICT`라 **지울 수 없다** |
| `commitAt` < `Project.lastCommitAt` | DB 컬럼 | **역행.** 오래된 run을 Re-run하면 strict가 그 시점으로 DB를 되돌린다(키 orphan + 번역값 회귀 + permalink가 옛 SHA) |

- **같은 커밋의 재전송은 통과시킨다.** strict라 결과가 같고, 스캐너를 고쳐 같은 커밋을 다시 올리는 것은 정당한 조작이다. 그래서 판정 기준이 `commitSha` 동일성이 아니라 **`commitAt` 역행**이다.
- **GitHub API로 조상 관계를 확인하지 않는다.** 더 정확하지만 지금 GitHub을 전혀 부르지 않는 push 라우트에 App 토큰과 네트워크 왕복이 들어온다. 커밋 시각은 Actions가 `git show -s --format=%cI`로 공짜로 얻는다.
- **프로젝트별 `PUSH_TOKEN`으로 가르지 않는다.** 토큰이 곧 라우팅이면 페이로드가 안 바뀌는 대신 토큰↔프로젝트 매핑을 DB나 env에 둬야 하고 시크릿이 프로젝트 수만큼 는다.

**7단계(Actions 배선) 전에 서 있어야 한다** — 실 DB에 프로젝트가 이미 둘이라 두 번째 리포를 붙이는 순간이 첫 사고 지점이다. `lib/push/guard.ts`가 두 판정을 들고 `app/api/push/route.ts`가 409로 떨어뜨린다.

### 5.5.6 흐름 검증은 SQL 인자를 캡처한다 (`__tests__/flow.test.ts`, 2026-09-03)

**홉마다 단위 테스트가 있어도 이어 붙인 것을 보는 테스트가 없으면 값이 홉 사이에서 사라진다** — 이 리포의 반복 실패 유형이다 (MVP §8.1의 B단계). `lib/push/__tests__/flow.test.ts`가 로케일 파일 → `detect` → `read` → `buildPushPayload` → `planPush` → **`$executeRaw`가 받은 값**까지를 한 테스트에서 단언한다.

- **실 DB를 치지 않는다.** prisma 스텁이 태그드 템플릿 인자를 캡처한다 — 실 DB 왕복은 재현 가능한 게이트가 아니고, 이 리포는 dev DB가 곧 prod DB다.
- **컬럼 이름 개수 = 값 배열 개수를 매번 검사한다.** `unnest` 인자 순서가 컬럼 목록과 어긋나면 값이 옆 컬럼으로 들어가는데, 타입이 같으면(`text[]`끼리) 런타임도 조용하다.
- 덮는 손실 지점: `sortIndex`의 0(falsy), 키 description과 로케일 description의 분리, `placeholders`의 JSON 직렬화, `refs`의 keyId 연결, 빈 값 번역 제외, orphan·unorphan·`needsReview` 전파.

## 6. 인증 경계

**두 GitHub 자격증명을 섞지 않는다.**

| 용도 | 자격증명 | 이유 |
|---|---|---|
| 편집 UI 로그인·인가 | GitHub OAuth (Auth.js) + 허용 핸들 목록 | GitHub 계정이 곧 신원. org 멤버십은 개인 계정 리포에서 성립하지 않는다 |
| `l10n/sync` 쓰기 | GitHub App installation token | OAuth 토큰으로 커밋하면 커밋이 개인 명의가 되고 그 사람이 org를 떠나면 깨진다 |
| `/api/push` 호출 | Bearer `PUSH_TOKEN` | Actions는 사람이 아니다. **fail-closed** — 환경변수가 비었으면 500이고, 거부 응답은 어느 쪽이 틀렸는지 알려주지 않는다(토큰 존재 여부를 탐색할 단서를 주지 않는다) |
| `/api/pull` cron 호출 | `CRON_SECRET` | 공개 엔드포인트면 아무나 커밋을 유발할 수 있다. **`checkBearer`를 재사용한다** — fail-closed가 이미 그 시그니처에 있다. 실측: 시크릿 없음·틀림 모두 401이고 응답이 구별되지 않는다 |

### 6.1 ⚠️ 차단은 미들웨어에만 의존한다

**레이아웃의 조건부 렌더는 차단이 아니다.** App Router는 레이아웃과 페이지를 병렬로 렌더하므로, 레이아웃이 `children`을 쓰지 않아도 페이지는 이미 실행돼 DB를 조회하고 RSC 페이로드를 응답에 싣는다. 실측으로 세션 없는 `/keys` 응답 **1.3MB에 1446키가 노출**됐다 — 화면엔 로그인 버튼만 보이므로 눈으로는 안 보인다 (`docs/POSTMORTEM.md` 2026-08-31).

- **1차: `middleware.ts`** — 렌더 전에 막는다. JWT 세션이라 DB 없이 토큰만 확인하면 되므로 Edge 제약을 타지 않는다. **새 보호 라우트를 추가하면 `matcher`에 추가한다.** ⚠️ **반대로 `/api/push`·`/api/pull`은 넣지 않는다** — 외부(CI·cron)가 부르는 진입점이라 세션이 없고, 넣으면 야간 pull이 조용히 리다이렉트된다. 그쪽 방어는 Bearer 토큰이다.
- **2차: 레이아웃의 `redirect()`** — 조건부 렌더가 아니라 `redirect`를 던져야 응답이 중단된다. matcher 누락 시의 안전망이다.
- **검증은 화면이 아니라 응답 본문으로 한다**: `curl -s <라우트> | grep <민감 데이터>`가 0건이어야 한다.

**Server Action도 같은 계열이다** — Action 호출은 레이아웃을 지나지 않으므로 Action이 스스로 인증·인가·테넌트 격리를 한다 (`app/(edit)/actions.ts`).

**인가는 fail-closed다.** `AUTH_ALLOWED_LOGINS`가 비어 있으면 **아무도 들어오지 못한다** — 빈 값을 "제한 없음"으로 해석하면 설정 누락이 곧 전면 공개가 된다.

핸들 비교는 **대소문자를 무시한다** (GitHub 핸들이 그렇다). 앞뒤 공백을 제거하고 빈 항목은 버린다 — `"a, ,b"` 같은 값이 빈 문자열을 허용 목록에 넣어 **빈 login을 통과시키는 구멍**이 되면 안 된다.

**GitHub App 개인키는 개행이 든 PEM이다.** Vercel env에 넣으면 개행이 `\n` 문자열로 이스케이프되므로 읽는 쪽에서 복원해야 한다. 안 하면 JWT 서명이 **조용히** 실패한다.

## 7. Supabase / Prisma

**Prisma 7은 접속 URL이 스키마에 없다.** `url`·`directUrl` 모두 제거됐고 두 곳으로 갈렸다 — 마이그레이션은 `prisma.config.ts`(`DIRECT_URL`, 5432 session), 런타임은 `lib/db.ts`의 driver adapter(`DATABASE_URL`, 6543 transaction). 클라이언트는 `generated/prisma/`로 생성되며 gitignore된 산출물이라 CI가 typecheck 전에 `db:generate`를 돌린다.

**⚠️ dev DB와 prod DB가 같다.** Supabase 인스턴스가 하나뿐이라 `migrate dev`가 프로덕션을 직접 바꾼다. 번역 데이터가 쌓인 뒤로는 `--create-only` + `db:deploy`로 쪼개고, `migrate dev`의 리셋 제안은 절대 승인하지 않는다. 상세는 `/db` 스킬.

**`prisma.config.ts`는 `.env.local`을 명시적으로 읽는다.** `dotenv`의 기본은 `.env`인데 이 프로젝트의 시크릿은 Next.js 관례에 따라 `.env.local`에 있다. 경로를 안 주면 URL이 `undefined`가 되고 `P1001 Can't reach database server`가 떠서 네트워크 문제로 오진하게 된다.

- **⚠️ 비밀번호의 특수문자는 URL 인코딩해야 한다.** 접속 문자열은 URI라서 비밀번호에 `@`가 들어가면 호스트 구분자와 충돌해 파서가 userinfo/host 경계를 잘못 잡는다 (`:pw@@host`가 된다). `@`→`%40`, `!`→`%21`, `#`→`%23`, `/`→`%2F`, `?`→`%3F`, `%`→`%25`. **이미 인코딩된 값을 두 번 인코딩하면 `%40`이 `%2540`이 되어 조용히 인증 실패한다** — 증상이 "비밀번호가 틀렸다"로만 나와 진단이 오래 걸린다. 애초에 **특수문자 없는 영숫자 비밀번호를 발급받는 게 이 함정을 없애는 방법이다.**
- **런타임 `DATABASE_URL`은 pooler(6543) + `?pgbouncer=true`.** 이 쿼리 파라미터가 없으면 prepared statement 충돌로 **간헐** 실패한다 — "가끔 되고 가끔 안 됨"이라 진단이 오래 걸린다.
- **마이그레이션 `DIRECT_URL`은 session 모드 pooler(5432).** transaction 모드 pooler(6543)는 advisory lock·DDL 세션을 못 잡아 마이그레이션이 실패한다. 직결 `db.<ref>.supabase.co`는 IPv6 전용이라 쓰지 않는다 (CLAUDE.md 스택 표).
- **배포 순서는 additive-first.** 스키마를 먼저 넓히고(`db:deploy`) 코드를 배포한다. 컬럼 삭제·타입 변경은 코드 배포 후 별도 마이그레이션. 순서를 어기면 배포 순간 프로덕션이 없는 컬럼을 조회한다.

## 8. Vercel

- **Cron은 Hobby 플랜에서 하루 1회.** 야간 pull 1회가 요구사항이라 지금은 맞다.
- **서버리스 함수 타임아웃**: 로케일이 많아지면 pull이 순차 API 호출로 시간을 먹는다. 지금은 3개라 문제없지만 늘어나면 blob 생성을 병렬화한다.
