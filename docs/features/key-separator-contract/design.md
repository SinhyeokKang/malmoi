# 키 구분자를 계약으로 뺀다 — design

## 1. 계약

```ts
// lib/adapters/types.ts
export type KeyTreeStyle = "flat" | "nested";

export type KeyTree = {
  /**
   * 세그먼트를 잇는 문자. **포맷 단위로 하나다.**
   * 파일마다 다르면 같은 문자열이 파일마다 다른 키가 되어 로케일이 서로 안 붙는다.
   */
  separator: string;
  /** 포맷 기본 구조. `styleByPath`에 없는 경로에 쓴다. */
  style: KeyTreeStyle;
  /** 파일별 관측값 — `nestedByPath`의 자리다. */
  styleByPath?: Record<string, KeyTreeStyle>;
};

// DetectedFormat
tree?: KeyTree;            // detect는 못 채운다(내용의 성질). read가 관측해 호출부가 싣는다
nested?: boolean;          // ⚠️ 레거시 폴백 — 이번 단계에서 지우지 않는다
nestedByPath?: Record<string, boolean>;   // ⚠️ 같음

// ReadResult
tree: KeyTree;             // **required.** 공급 계약을 optional로 두지 않는다(POSTMORTEM 2026-09-02)
nested: boolean;           // 레거시 — read가 계속 채운다
nestedByPath?: ...;        // 레거시
```

`ReadResult.tree`를 required로 두는 것이 이 설계의 유일한 컴파일 타임 방어선이다. 어댑터 5개가
전부 채워야 통과하고, 새 어댑터를 추가할 때 "이 포맷의 구분자는 무엇인가"를 묻게 만든다.

## 2. 구분자 선출 — 이 기능의 전부

```
KEY_SEPARATOR_CANDIDATES = [".", "/", ":", "|", U+001F]   // 순서 고정 = 결정성

electSeparator({ nestedSegmentNames, hasFlatFile }): string
  1. hasFlatFile이면 "." 고정 — 선출하지 않는다 (아래 가드)
  2. 아니면 후보 중 **어떤 세그먼트 이름에도 나타나지 않는** 첫 문자
  3. 전부 막히면 마지막 후보(U+001F) — 그때는 접두 충돌 보고가 계속 그물이다
```

**후보 소진은 가정이 아니다 — 다만 아직 아무 데서도 일어나지 않는다.** musicblocks 전체 키의
구분자 실측이 `dot` 4,189 · `colon` 151 · `slash` 14 · `none` 1,160이라 **후보 앞의 셋이 전부 그
리포 데이터에 실재한다.** 3번 갈래는 그래서 반드시 서 있어야 한다. 거기까지 가면 키가 사람이
읽기 나쁜 제어 문자를 품고, **그것이 손실보다 낫다는 판단**이다.

**그런데 그 대가를 무는 리포는 아직 관측되지 않았다** (2026-09-04 실측):

| 리포 | 선출 결과 | 근거 |
|---|---|---|
| **siyuan** — 유일한 선출 대상 | **`/`** | 세그먼트 2,631개 중 점 포함 15 → `.` 탈락. `/`·`:`·`\|`·U+001F 포함 **0** (리포 전체 키에도 `slash` 0) |
| musicblocks | 선출 안 함 (`.` 유지) | 스타일 혼재 가드 |

즉 **U+001F 갈래는 존재해야 하지만 지금 코퍼스에서는 타지 않는다.** 제어 문자가 편집 UI의 키에
노출되는 시나리오는 관측 0건이고, 그 사실이 이 설계를 받아들일지의 판단 재료다.

**선출은 `read`가 파일 전체를 본 뒤 한 번 한다.** `read(format, files)`가 파일 목록을 통째로
받으므로 포맷 단위 관측이 가능하다.

네 가지가 이 규칙의 전부이고, 넷 다 이유가 있다:

- **포맷 단위다, 파일 단위가 아니다.** 파일마다 다른 구분자를 고르면 **같은 문자열이 파일마다
  다른 키가 되어 로케일이 서로 안 붙는다.** musicblocks가 그 모양의 실측이다 — 84로케일 중
  **중첩은 1개**이고 나머지는 flat인데(`entry-order.test.ts:163`), 그 한 파일과 형제 flat
  파일들의 키가 같은 것을 가리켜야 한다. **이 리포의 손실 자체는 7차에 이미 해소됐다**(파일
  단위 `nestedByPath`) — 여기서 쓰는 것은 손실 근거가 아니라 **"구분자를 파일마다 고르면 안
  되는 이유"의 실측 사례**다.
- **중첩 파일의 세그먼트 이름만 본다.** flat 파일은 **조인이 일어나지 않는다** — 키가 곧 리프
  이름이라 구분자와 무관하다. 여기에 flat 파일 이름까지 넣으면 skillflo(점 표기 flat 1446키)
  같은 리포가 전부 `/` 선출을 유발해, 정작 손실이 없는 곳에서 키 텍스트만 갈아엎는다.

  **⚠️ "세그먼트"의 정의가 판정을 뒤집는다 — 여기서 못 박는다:**

  > **세그먼트 = `flatten`이 경로를 만들며 지나는 모든 이름이고, 최상위 키를 포함한다.**
  > `{"문장.": {"kanji": …}}`의 경로는 `["문장.", "kanji"]`이고 **둘 다** 세그먼트다.

  최상위 키를 빼면 판정이 반대로 나온다. musicblocks `ja.json` 실측(메인 세션, 2026-09-04):
  최상위 키 **1,827개 전부가 객체 값**이고 그중 **656개가 점을 품는데**, 2단 세그먼트 이름은
  `kanji`·`kana` 둘뿐이다. 2단만 보면 `.`이 안전하다고 판정하고, 최상위를 포함하면 `.`이
  탈락한다. **후자가 맞는 정의이고, 그래서 이 리포에서 가드가 실제로 일을 한다** — 가드가
  없으면 `/`가 뽑혀 `ja.json`의 2단 키가 `문장./kanji`가 되고, 같은 문자열을 flat으로 들고 있는
  **형제 83개(644키 공유)와 키 공간이 갈린다.** 오늘 없어진 손실을 되살리는 경로다.
- **스타일이 섞인 포맷은 선출하지 않는다** — flat 파일과 중첩 파일이 함께 있으면 `.` 고정.
  아래 가드 항목이 이유다.
- **`.`가 안전하면 `.`이다.** 이 규칙이 다른 답을 내는 리포는 학습 코퍼스에서 siyuan 하나이고,
  나머지는 키 텍스트가 오늘과 바이트 동일하다 (완료 조건 ③).

### 왜 이것이 손실을 없애나

| 리포 | 오늘 (7차) | 선출 후 |
|---|---|---|
| **siyuan** — 유일하게 남은 손실 | 세그먼트 `task.database`가 점을 품어 `_taskAction.task.database`(문자열)가 `…database.index`의 접두가 된다 → 얕은 쪽을 버리고 `writeErrors` 21로 보고 | **구분자 `/` 선출**(21파일 전부 중첩 → 가드 통과, `/` 포함 0) → `_taskAction/task.database`와 `_taskAction/task/database/index`. 접두 관계가 성립하지 않는다 |
| musicblocks — **이미 해소** | 파일 단위 `nestedByPath`가 flat 파일을 안 쪼갠다. `keyCollisions` 324는 관측치이고 왕복은 의미 동일 | 중첩 파일이 1개뿐이라 선출이 그 파일의 세그먼트만 본다 → **깨지 않는 것**이 조건이다 (회귀 방지) |

### ⚠️ 가드 하나가 더 필요하다 — flat 파일이 섞여 있으면 선출하지 않는다

**선출이 musicblocks를 다시 깰 수 있는 경로가 있다.** 그 포맷의 중첩 파일 세그먼트에 점이 있으면
구분자가 `/`로 뽑히고, 그러면 **중첩 파일의 2단 이상 키만** `/`로 이어져 flat 형제 파일의 같은
문자열(`"grp.a"`)과 갈린다. 오늘의 flat↔중첩 등가(`{"a":{"b":…}}` ≡ `{"a.b":…}`)가 **`.`에
의존하고 있기 때문**이다.

```
스타일이 섞인 포맷(flat 파일과 중첩 파일이 함께 있다) → 선출하지 않고 "."을 쓴다.
그 경우 접두 충돌은 오늘처럼 보고된다(에러 통로 유지).
```

이 가드가 사는 이유:

- **회귀를 원천 차단한다.** 7차에 통과한 리포가 이 기능 때문에 깨질 경로가 사라진다 —
  "고친 것이 다른 것을 깬다"가 이 리포의 반복 실패 유형이다 (POSTMORTEM 2026-09-02 홀드아웃 회귀 2건).
- **siyuan은 그대로 풀린다.** 그 포맷은 전 파일이 중첩이라 가드에 걸리지 않는다.
- **대가는 "혼재 + 점 세그먼트" 조합의 손실이 남는 것**이고, 그건 **오늘과 같다**(보고된다).
  관측 0건이라 지금 풀 근거가 없다.

⚠️ **실측 musicblocks가 그 조합인지는 원본 파일을 안 읽었으므로 모른다.** 가드가 있으면 그
질문에 답하지 않아도 안전하고, 재측정이 사후에 확인한다.

**남는 손실 계열 하나**: 로케일 파일 사이에 **구조가 갈리는** 경우. `en.json`이 `a`를 문자열로,
`ko.json`이 `a`를 객체로 들면 DB에 `a`와 `a/b`가 함께 생기고 write에서 한쪽이 자리를 잃는다.
어떤 구분자를 골라도 성립하지 않는 요구라 **보고 통로가 그대로 답이다** (완료 조건 ④).

### 대가 — 구분자가 흔들리면 키가 통째로 바뀐다

선출은 현재 파일 집합의 순수 함수다. 문제의 키가 리포에서 **사라지면** 구분자가 `.`으로 돌아오고
그 프로젝트의 키가 전부 새로 적재된다(옛 키는 `orphaned`, 번역은 DB에 남는다 — 코어 원칙).

**PoC에서 이 값을 받아들인다.** 막으려면 `Project.tree.separator`를 push 페이로드로 되돌려
"아직 안전하면 유지"하는 홉이 필요한데, read가 도는 곳은 대상 리포의 CI라 DB를 모른다 —
그 홉을 만드는 비용이 관측 2건의 이득을 넘는다. tasks.md에 후속으로 남긴다.

## 3. 영향 받는 흐름 — 5홉 (`nestedByPath`의 선례를 그대로 따른다)

| # | 위치 | 나르는 것 |
|---|---|---|
| a | `json-catalog.read` · `yaml-catalog.read` · `code-dict.read` · `chrome-locales.read` · `ts-dict.read` | `ReadResult.tree` (선출 + 파일별 style) |
| b | `buildPushPayload` | `format.tree` — 없으면 **필드를 만들지 않는다**(빈 객체는 "전부 flat"으로 읽힌다) |
| c | `applyPush` | `Project.tree Json?` |
| d | `loadPullState`의 `select` → `formatFromProject` | `DetectedFormat.tree`. **Json 컬럼이라 모양을 검증해 걸러 쓴다** |
| e | 세 어댑터의 `write` | `treeFor(format, path)`로 조회 → 조인/분해 |

`ProjectFormatColumns.tree`를 **optional로 두지 않는다** — 껍데기가 `select`에서 빼면 컴파일러가
막는다 (POSTMORTEM 2026-09-02 "공급 계약은 optional로 두지 않는다").

**레거시 폴백은 `treeFor` 한 곳에만 있다**: `format.tree`가 없으면 `nestedByPath`/`nested` +
구분자 `.`으로 조립한다. 이게 없으면 **이 배포와 다음 push 사이에 bugshot-2가 flat으로 취급돼
중첩 파일이 평평하게 나간다.** 폴백을 어댑터마다 따로 쓰면 그 순간 세 갈래가 갈린다.

## 4. 순수 함수 (= `/tdd` 진입점)

**새 파일 `lib/adapters/key-path.ts`에 모은다.** `shared.ts`에 넣지 않는 이유는 둘이다:
동시 진행 중인 **원본 포맷 보존** 기능이 그 파일을 만지고, 이 규칙은 "결정성 규칙"이 아니라
"키 문자열의 대수"라 성격이 다르다.

| 함수 | 계약 |
|---|---|
| `electSeparator(input: { names: Iterable<string>; hasFlatFile: boolean }): string` | 후보 순서 고정. `hasFlatFile`이면 `.` 고정, 아니면 어떤 이름에도 없는 첫 문자 |
| `joinKey(segments: readonly string[], sep: string): string` | 세그먼트 1개면 그대로(조인 없음) |
| `splitKey(key: string, sep: string): string[]` | `joinKey`의 역. `sep`이 빈 문자열이면 던지지 않고 `[key]` |
| `treeFor(format: DetectedFormat, path: string): KeyTree` | `tree` → `nestedByPath` → `nested` → 기본값 순 폴백. **레거시 폴백의 유일한 자리** |
| `shadowedKeys(keys: Iterable<string>, sep: string): Set<string>` | 접두 충돌 판정. 오늘 `json-catalog.writeWithErrors`에 인라인된 이중 루프를 옮긴다 |
| `treeFromColumns(raw: unknown, legacy): KeyTree \| undefined` | Json 컬럼 검증 (`lib/pull/plan.ts`가 쓴다). style은 두 리터럴만, separator는 비지 않은 문자열만 |

`shadowedKeys`를 옮기는 것은 리팩터가 아니라 **필요**다 — 구분자를 인자로 받아야 하고,
세 어댑터가 같은 판정을 써야 한다.

## 5. 스키마 변경 — additive, 컬럼 하나

```prisma
model Project {
  nested       Boolean?   // ⚠️ 레거시 — 다음 단계에서 삭제
  nestedByPath Json?      // ⚠️ 레거시 — 다음 단계에서 삭제
  tree         Json?      // { separator, style, styleByPath }
}
```

- 마이그레이션: `ALTER TABLE "Project" ADD COLUMN "tree" JSONB;` **하나뿐이다.**
- **배포 순서**: `db:deploy`(스키마 넓히기) → 코드 배포. 이 워크트리에서는 `--create-only`로
  **파일까지만** 만든다 (사용자 지시 — dev DB가 곧 prod DB다).
- **삭제는 별 마이그레이션**이다. 코드에서 레거시 폴백이 사라진 뒤에만 돈다 — 순서를 어기면
  배포 순간 프로덕션이 없는 컬럼을 조회한다.
- **전환 동안 `nested`·`nestedByPath`도 계속 쓴다.** 두 줄이고, 롤백 경로가 다음 배포뿐인
  구조(CLAUDE.md 브랜치 정책)에서 그 두 줄이 유일한 안전망이다.

zod(`lib/push/plan.ts`): `tree`는 **optional**로 넣고 `nested`는 required로 남긴다 — 옛
composite action이 보내는 페이로드가 계속 통과해야 한다.

## 6. 불변식 영향

| 불변식 | 영향 | 보존 방법 |
|---|---|---|
| **export 결정성** (같은 DB 상태 → 같은 바이트) | 구분자가 DB(`Project.tree`)에 있으므로 뜻이 바뀌지 않는다 | 선출은 **read 시점 1회**, write는 저장된 값을 읽기만 한다. write가 다시 선출하면 그 순간 결정성이 원본 내용에 묶인다 — **금지** |
| **blob SHA 비교** | 키 텍스트가 바뀌는 프로젝트에서 첫 pull이 파일 하나를 다시 쓴다 | 그 프로젝트는 오늘 값을 잃고 있다. 한 번의 정규화이고 그 뒤로 안정된다 (ARCHITECTURE §1.2) |
| **병합 없음** | 없다 — 값을 고르는 분기를 만들지 않는다 | 구분자는 **키의 표기**만 정한다. 값은 전부 DB에서 온다 |
| **키 삭제 없음** | 없다 | 재키잉된 프로젝트의 옛 키는 `orphaned`이고 DB에 남는다 |
| **인증 경계** | 없다 | |

## 7. 과거 함정 (착수 전 grep 결과)

- **POSTMORTEM 2026-09-02 "구분자가 데이터에도 있어서…"** — 이 기능의 출발점. 남긴 규칙 셋을
  그대로 지킨다: ① 구분자로 합치는 코드는 그 구분자가 키 안에 있다고 가정한다 ② 못 넣는 값은
  버리되 보고한다 ③ **파일 단위로 관측할 것을 포맷 단위 boolean으로 들지 않는다.**
  ⚠️ ③의 짝이 하나 더 있다 — **포맷 단위로 정할 것을 파일 단위로 들지 않는다**(구분자가 그렇다).
- **POSTMORTEM 2026-09-02 "껍데기가 파일을 안 골라 어댑터가 존재하지 않았다"** — 어댑터를
  고칠 때 **"그 값을 누가 날라 오는가"** 를 함께 묻는다. 5홉 표가 그 답이다.
- **POSTMORTEM 2026-09-03 (인용 부호)** — 값이 맞으면 지표 넷이 전부 통과하고 실물 PR에서야
  드러나는 계열이 있다. 구분자는 **값이 아니라 키 텍스트**라 왕복 의미 비교가 본다(키를 비교
  대상에 넣으므로) — 그래서 이 기능은 지표가 답할 수 있다.
- **ARCHITECTURE §1.35 홉 5개** — `nestedByPath`가 어댑터·survey에만 살아 있고 프로덕션은 옛
  동작을 하던 상태. 같은 구조를 그대로 반복하므로 **같은 함정에 같은 그물**(진입점 테스트)을 건다.

## 8. 측정 층도 함께 고친다

`lib/survey/`가 프로덕션과 다른 것을 재면 안 된다.

- `one.ts` — `duplicateCount(loc, read1.nested)` → tree 기반. write에 넘기는 포맷에 `tree`를 싣는다
  (오늘 `nested`/`nestedByPath`를 싣는 자리와 같다).
- `json-shape.ts` — `dottedWithNested` 원인 판정은 **원본 키 이름의 점**을 본다. 판정을 "**선출된
  구분자가** 세그먼트 이름에 있는가"로 옮긴다 — 그래야 선출이 푼 리포에서 카운터가 내려간다.
  ⚠️ **가드에 걸린 포맷(스타일 혼재)은 `.`을 유지하므로 카운터도 유지된다.** 그게 옳은 값이다 —
  그 리포는 여전히 그 원인으로 diff가 난다. 0을 목표로 두지 않는다 (spec 완료 조건 ⑥).
- `types.ts`의 `SeparatorCounts`는 그대로 둔다 — 관측치이고 선출의 근거다.

## 9. 대안과 기각 이유

| 안 | 내용 | 기각 이유 |
|---|---|---|
| **A. 이스케이프** | 세그먼트 안의 `.`을 `\.`로 이스케이프해 조인 | **지금 건강한 리포를 깬다.** flat 파일은 조인이 없어 이스케이프도 없으므로 `"Clear workspace."`가 flat 파일에선 그대로, 중첩 파일에선 `Clear workspace\.`가 되어 **같은 문자열이 두 키로 갈린다** — musicblocks가 7차에 통과 상태인데 이 안을 쓰면 다시 깨진다. flat 파일까지 이스케이프하면 점 표기 flat 카탈로그(skillflo 1446키)의 키가 전부 바뀐다. §2의 가드는 이 함정을 선출 쪽에서 닫는 것이고, 이스케이프는 그 가드를 놓을 자리가 없다(세그먼트 단위 결정이라 포맷 전체를 볼 지점이 없다) |
| **B. 구조를 키마다 나른다** (`LocaleEntry.path: string[]` + `StringKey.pathSegments`) | 조인을 아예 안 한다 | **정체성 충돌이 남는다.** `["a.b"]`와 `["a","b"]`가 같은 키 문자열을 만드는데 `UNIQUE(projectId, key)`가 한 행만 허용해 한쪽 구조가 진다. 컬럼도 하나 더 늘고 홉도 그대로다 |
| **C. 파일 단위 구분자** | `styleByPath`처럼 구분자도 파일별 | 로케일 파일 사이에 키가 안 붙는다 (§2 첫 항목) |
| **D. 지금처럼 두고 보고만** | 현행 | 완료 조건 ②가 요구하는 것이 "잃지 않는 것"이다. 보고는 이미 있다 |

## 10. 동시 작업과 겹치는 파일

**원본 포맷 보존**(들여쓰기·한 줄 컨테이너·이스케이프) 세션과 겹치는 파일:
`lib/adapters/types.ts` · `json-catalog.ts` · `__tests__/contract.ts`.
(`shared.ts`는 §4의 새 파일 결정으로 **안 만진다.**)

셋 다 변경을 최소로 유지한다 — `types.ts`는 필드 추가만, `json-catalog.ts`는 `read`의 관측부와
`write`의 분해부만, `contract.ts`는 `tree` 불변식 검사 추가만.
