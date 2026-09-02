# 키 순서 보존 — design

## 코어 원칙과의 관계 (먼저)

**병합이 아니다.** 원본 파일에서 가져오는 것은 **순서**이고 값은 전부 DB에서 온다 — `ts-dict`가
승인받은 것과 같은 축이다 (CLAUDE.md 코어 설계 원칙 4번째 항목, 2026-09-01 정정). 기존 값과 DB
값을 견줘 고르는 코드는 이 기능에 없다.

**결정성도 유지된다.** 순서를 **DB에 저장**하기 때문이다 — `같은 DB 상태 → 같은 바이트`가 그대로다.

## 채택안 — `StringKey.sortIndex` (순서를 DB에 둔다)

```
push:   base 로케일 파일의 키 순서를 관측 → StringKey.sortIndex에 저장
pull:   sortIndex 순으로 재조립 (원본 파일을 읽지 않는다)
편집UI: 변경 없음
```

**채택 근거는 하나다: 순서의 소유자를 DB로 못박아 `같은 DB 상태 → 같은 바이트`의 뜻을 안 바꾼다.**
원본 파일을 write 입력으로 받으면(대안 B) 그 불변식이 "같은 DB 상태 + 같은 리포 상태 → 같은
바이트"로 바뀐다. 불변식의 **뜻**이 바뀌는 것이지 성능이 문제가 아니다.

> ⚠️ **이전 판의 기각 근거는 코드와 어긋나 폐기했다.** "B를 택하면 blob SHA 사전 비교가 전
> 프로젝트에서 사라진다"고 적었었는데, "변경 없는 날 GitHub API 0회"를 주는 것은 blob SHA 비교가
> 아니라 **1층 DB 스킵**이다 (`lib/pull/run.ts:55-56`이 `createClient`(`run.ts:76`)보다 **먼저**
> 반환한다). 2층은 `getRefSha`(`run.ts:78`)·`getTree`(`run.ts:88`)가 이미 돈 뒤에 오고,
> `ARCHITECTURE.md:233`은 "2층으로는 '변경 없음'을 관측할 수 없다 — base와 비교하므로 머지 전까지
> 매번 '변경됨'"이라고 못박았다. B의 실제 대가는 **"편집이 있는 날에만 파일당 `getBlobText` 1회"**
> 이고, 그건 수술적 어댑터 3개가 이미 내는 값이다 (MVP §3.3).

### 대안과 기각 사유

| 안 | 내용 | 기각 사유 |
|---|---|---|
| **B** | 재생성 writer도 `currentFiles`를 입력으로 받는다 | `같은 DB 상태 → 같은 바이트` 불변식의 **뜻**이 바뀐다(리포 상태가 입력에 들어온다). 부수적으로 편집 있는 날 파일당 blob 1회가 는다 — 그건 대가일 뿐 기각 근거가 아니다 |
| **C** | 원본을 읽되 blob SHA 최적화를 유지 | 2층 한정으로는 성립하지 않는다 — SHA를 만들려면 내용이 필요하고 내용을 만들려면 원본이 필요하다(순환). 1층 스킵은 이와 무관하게 살아 있다 |
| **D** | 순서를 `Project`에 파일별 JSON으로 | 정규화가 아니라 키 삭제·리네임마다 손으로 정리해야 한다 |
| **E** | `Translation.sortIndex` — 로케일마다 순서 보존 | **보류다, 기각이 아니다.** 태스크 0이 로케일 간 순서 일치율을 재고 **중앙값 < 0.9면 이걸로 승격한다** |

## 영향 받는 흐름

### push — 순서를 관측해 저장한다

`read`가 **엔트리를 UTF-16 코드 유닛 순으로 정렬해서 돌려준다**(`chrome-locales.ts:111`,
`json-catalog.ts:173`). 파일 순서는 그 지점에서 이미 사라진다. 그래서 **`read`가 정렬 전에 위치를
기록**한다:

- `LocaleEntry.order?: number` — 그 파일에서의 위치. 중첩이면 **평탄화 순서(첫 등장)** 다
- `read`는 배열을 계속 정렬해서 돌려준다 (호출부가 이미 그걸 전제한다 — 바꾸면 회귀 범위가 커진다)
- 페이로드 `IncomingKey.order?: number` → `StringKey.sortIndex`

**`keys`는 base 엔트리에서 만들어지므로**(`scripts/push-local.ts:159`) 모든 키가 order를 갖는다.
편집 UI는 키를 추가하지 않으므로(MVP §7) `sortIndex`가 빈 키는 **마이그레이션 직후에만** 있다.

**`order`가 없는 페이로드는 `sortIndex`를 null로 남긴다 — 배열 인덱스로 채우지 않는다.**
`read`가 이미 정렬해 돌려주므로 **구 CI가 보내는 배열 인덱스 = 코드 유닛 순위**다. 그걸 박으면
"순서를 모른다"가 "코드 유닛 순이 진짜 파일 순서다"로 DB에 **굳고**, 바이트 결과가 같아 조용하다.
null은 "모름"이고 `orderedEntries`가 코드 유닛으로 폴백하니 동작은 같으면서 나중에 진짜 order가
오면 복구된다.

**drift가 안 생기는 이유**: `lib/push/plan.ts:145` 직전의 `toUpdate.push(planned)`가 **조건 없이**
모든 기존 키를 넣고(stale 판정은 `staleKeyIds`만 거른다), `lib/push/apply.ts:88-102`의 unnest
UPDATE가 전 키를 갱신한다. 즉 **매 push마다 전 키 순서가 새로 박힌다.** 코드가 키를 재정렬하거나
추가해도 다음 push가 덮으므로 DB와 파일이 갈라지지 않는다. orphaned 키는 export에서 빠지므로 낡은
index가 남아도 무해하고, un-orphan은 incoming에 있으니 `toUpdate`에서 갱신된다.

### pull — 순서대로 재조립한다

#### (가) 값이 흐르는 경로 — **여기가 이 기능의 실제 위험이다**

`sortIndex`가 `LocaleEntry.order`까지 도달하는 배선이 **넷**이다. 하나만 빠져도 `orderedEntries`가
`order === undefined`를 보고 코드 유닛 폴백으로 **조용히** 떨어진다 — 단위 테스트는 전부 green이고
기능만 죽는다. POSTMORTEM 2026-09-02 "만든 것이 실제로 호출되는지 묻지 않는다"의 정확한 재발
형태이므로 태스크에 체크박스로 박았다.

| # | 위치 | 지금 상태 |
|---|---|---|
| a | `lib/pull/load.ts:40-47` `select` | `sortIndex`가 없다 |
| b | `lib/pull/render.ts:13-21` `RenderKey` | 필드가 없다 |
| c | `lib/pull/plan.ts:131-137` `PullRow` | 필드가 없다 |
| d | `lib/pull/plan.ts:148-168` `buildWriteEntries` | `{key, message, description}`만 조립한다 |

**`buildWriteEntries`가 `order`를 실을 자연스러운 지점이다** — 스스로 "writer에 넘길 entries의
**유일한** 관문"이라고 문서화돼 있고 정렬을 하지 않는다(`plan.ts:147`).

#### (나) 정렬이 일어나는 지점 — **재생성 경로에 넷**

| # | 위치 | 무엇을 정렬하나 | 이 기능에서 |
|---|---|---|---|
| 1 | `lib/pull/load.ts:39` `orderBy: { key: "asc" }` | DB 조회 순서 | `[{ sortIndex: "asc" }, { key: "asc" }]`로 바꾼다 — **가독성·디버깅 목적이다** |
| 2 | `lib/adapters/shared.ts:26` `usableEntries` | 최상위 엔트리 | **`orderedEntries`로 교체** — 재생성 writer 전부가 지나는 유일한 관문이다 |
| 3 | `lib/adapters/json-catalog.ts:304` `sortedByKey` | 중첩 각 층 | **호출을 제거한다** (아래 참조) |
| 4 | `lib/adapters/json-catalog.ts:292` `normalizeArrays` | 배열 인덱스 | 안 건드린다. **단 #3은 #4와 별개가 아니라 그 본문의 마지막 줄(`:300`)이다** |

**#1은 결정성의 근거가 아니다.** `orderedEntries`가 "동률이면 코드 유닛으로 갈라 결정적"을
계약하므로 순수 함수가 전순서를 만들고, DB 순서는 바이트에 영향을 줄 수 없다. `orderBy`를 바꾸는
이유는 디버깅할 때 DB 조회 결과와 파일 순서가 눈으로 대응하기 때문이다. *(이전 판은 여기에
"컬레이션 때문에 환경마다 바이트가 달라진다"고 적었는데, 그건 위 계약과 모순이라 삭제했다.)*

⚠️ **리포 전체에 `orderBy: { key: "asc" }`가 정확히 두 곳이다.**

```
lib/pull/load.ts:39      ← 바꾼다
lib/keys/query.ts:56     ← 절대 바꾸지 않는다 (편집 UI 행 순서의 유일한 출처)
```

`grep`하면 둘 다 잡히므로 **어느 쪽인지 문서가 이름으로 말해야 한다.**

#### (다) 재생성 경로 **밖**의 정렬 — 닿으면 회귀

| # | 위치 | 성질 |
|---|---|---|
| 5 | `yaml-catalog.ts:274` · `code-dict.ts:300` `missing.sort(compareKeys)` | 수술적 어댑터가 **없는 키를 삽입할 때**의 순서. `usableEntries`를 안 지나지만 **정렬 규칙(`compareKeys`)은 공유한다.** 완료 조건 5가 감시한다 |
| 6 | 정수형 키 hoisting (`json-catalog.ts:242-244`, `chrome-locales.ts:125-129`, `json-catalog.ts:295`) | `"0"`·`"1"`·`"10"`은 JS 객체가 앞으로 끌어올려 숫자순으로 낸다. **`.sort(`로 grep해도 안 나오고 이 기능으로 보존 불가**다. 관련해 `json-catalog.ts:241`·`chrome-locales.ts:124`의 "JSON.stringify는 삽입 순서를 따른다" 주석이 부정확하다 |

### `levelOrder`를 만들지 않는다 — `sortedByKey` 호출 제거로 끝난다

**중첩 각 층의 순서를 계산하는 순수 함수가 필요 없다.** `setDeep`(`json-catalog.ts:259-268`)이
`usable` 순회 순서로 트리를 만들고, `normalizeArrays`가 `Object.keys` 순서로 `converted`를
재조립한 뒤(`:295-297`) **마지막에 `sortedByKey(converted)`로 다시 정렬한다**(`:300`). 즉
`orderedEntries`가 파일 순서를 주면 **각 층은 이미 "첫 등장 순"이다** — 계산할 것이 없다.

- `:300`의 정렬을 걷어내는 것으로 정렬 지점 #3이 끝난다
- `sortedByKey`는 호출부 0이 되어 삭제한다 (**내 변경이 만든 고아**이므로 제거 대상이 맞다)
- **`.` 구분자 함정이 통째로 사라진다** — 키를 다시 쪼개지 않기 때문이다. POSTMORTEM 2026-09-02가
  경고한 `a.b`/`a.b.c` 공존 케이스를 이 설계는 아예 지나지 않는다
- 부수로, "값 손실은 `writeErrors`로 보고된다"는 안심이 **pull 경로에서는 거짓**이라는 문제도
  사라진다 (`lib/pull/render.ts`는 `adapter.write`를 부르고 그 갈래는 에러를 버린다)

### 편집 UI — 변경 없음

행 순서는 **`lib/keys/query.ts:56`의 `orderBy: { key: "asc" }`** 하나에서 나온다. `lib/keys/view.ts`
에는 키 행을 정렬하는 코드가 없고(정렬은 `namespaceCounts` 안의 사이드바 목록뿐),
`app/(edit)/keys/page.tsx`도 재정렬하지 않는다. **`query.ts`를 건드리면 비목표 위반이다** —
자동 가드는 검증 루프 L1에 있다.

## 순수 함수로 분리 가능한 부분 (= `/tdd` 진입점)

| 함수 | 위치 | 계약 |
|---|---|---|
| `orderedEntries(entries)` | `lib/adapters/shared.ts` | `usableEntries`를 대체. `order`가 있는 것 먼저 `order` 오름차순, 없는 것은 뒤에 코드 유닛 순. orphaned·미번역 제외는 그대로. **동률이면 코드 유닛으로 갈라 결정적이다** |
| `observeOrder(top, sep)` | `lib/adapters/json-catalog.ts`(read 쪽) | 파싱된 객체 → `key → order` 맵. `flatten`이 이미 순회하므로 그 순회에 카운터를 얹는다 |
| `withSortIndex(planned, incoming)` | `lib/push/plan.ts` | 페이로드의 `order`를 `PlannedKey`에 실어 준다. **`order`가 없으면 null** (인덱스 폴백 없음) |
| `changedHunks(a, b)` | `lib/survey/diff.ts` | 이미 도는 LCS 순회에 비매칭 구간 카운터를 얹는다. 완료 조건 4의 측정 장치 |

**I/O 껍데기는 넷이다**: `lib/push/apply.ts`(컬럼 쓰기), `lib/pull/load.ts`(select + orderBy),
`lib/pull/plan.ts`·`render.ts`(값 전달), 마이그레이션.

## 스키마 변경 — additive

```prisma
model StringKey {
  /// base 로케일 **파일 안에서의** 키 위치. 파일 순서를 보존해 첫 pull PR이 읽을 수 있게 한다
  /// (MVP §4.1). null이면 순서를 모르는 키 — 코드 유닛 순으로 뒤에 붙는다.
  /// ⚠️ 파일 스코프다. 파일이 여럿인 레이아웃에서는 common.json의 3번째 키와 settings.json의
  ///    3번째 키가 둘 다 2다 — **파일 경계를 넘어 비교할 수 없다.**
  sortIndex Int?
}
```

- **additive다** — nullable 컬럼 하나. `@@unique([projectId, key])`·`@@unique([projectId, id])`·
  기존 인덱스 둘과 무관한 순수 `ADD COLUMN`이다 (`prisma/schema.prisma:90-124`)
- `pnpm db:deploy`를 push **전에** 돌린다 (CLAUDE.md DB 순서)
- **인덱스를 추가하지 않는다.** pull이 `projectId`로 좁힌 뒤 정렬하는 것이고, 이 프로젝트 규모에서
  키가 수천 개다. 정렬 인덱스는 필요해지면 그때 (`@@index([projectId, sortIndex])`)
- **`migrate dev`의 리셋 제안은 절대 승인하지 않는다** — dev DB가 prod DB다 (CLAUDE.md)

### 배포 순서 — 백필 전에 pull을 돌리지 않는다

마이그레이션 직후 `sortIndex`가 전부 null이라 pull 출력이 **오늘과 바이트 동일** = diff 0.784짜리
PR이다. 이 기능이 없애려던 바로 그 PR이 자동으로 나간다.

```
① 컬럼 배포 (db:deploy)  →  ② 코드 배포  →  ③ pnpm push:local 로 백필  →  ④ 그 다음에 첫 pull
```

`vercel.json`이 없어 야간 cron은 아직 등록돼 있지 않지만 **`PullButton`은 언제든 눌린다.**

## 새 환경변수

**없다.**

## 불변식 영향

| 불변식 | 영향 | 보존 방법 |
|---|---|---|
| **결정성** (같은 DB 상태 → 같은 바이트) | **유지.** 순서가 DB에 있다 | 완료 조건 6(바이트 고정점 100/100)이 게이트 |
| **§4.1 "키 정렬: `<` 비교"** | **개정된다** — 재생성 writer의 정렬 규칙이 "코드 유닛 순"에서 "`sortIndex` 순, 없으면 코드 유닛 순"으로 바뀐다 | MVP §4.1 · ARCHITECTURE §1.1 갱신을 태스크에 넣었다. `localeCompare` 금지는 그대로다(폴백 경로) |
| **blob SHA 사전 비교** (ARCHITECTURE §2) | **유지** — 채택안이 원본을 읽지 않는다 | 부수 효과일 뿐 채택 근거는 아니다 (위 인용 박스) |
| **1층 DB 스킵** | 유지. 단 **순서만 바뀐 push는 1층을 깨우지 않는다** — 1층은 `Translation.updatedAt` 최대값을 본다(`load.ts:51-54`)고, 순서 변경은 `StringKey`만 건드린다 | 무해하다(리포 파일이 이미 그 순서다). 재정렬은 **다음 번역 편집 때 함께** 나간다 — "왜 순서 수정이 바로 PR로 안 나오지"라는 오진을 막으려 적어 둔다 |
| **`usableEntries`가 유일한 관문** | 유지 — 이름만 `orderedEntries`로 바뀐다 | 계약 테스트가 `ADAPTERS` 전수로 검사한다 |
| **수술적 치환은 이 규칙을 지나지 않는다** | 유지 — **닿으면 회귀다**. 프로덕션 호출부는 `chrome-locales.ts:121`·`json-catalog.ts:232` 둘뿐이고 수술적 3개는 인라인으로 거른다 | 계약 테스트의 `writeStrategy` 분기 매트릭스 + 완료 조건 5(0.000 유지) |
| **데이터 변경 경로 경계** | 없음 — 새 진입점을 만들지 않는다 | — |
| **`projectId` 스코프** | 없음 — `load.ts:38`·`:52`·`:77`, `apply.ts` 전 쿼리가 이미 좁혀져 있다 | — |
| 인증 경계 | 없음 | — |

## 검증 루프 (구현 이후에도 도는 것)

완료 조건의 지표가 **1회성 측정으로 끝나면 다음 날 되돌아가도 아무것도 안 빨개진다.**
`pnpm adapter-survey`는 `scripts/adapter-survey.ts:74`가 `git clone`을 부르고 `:110`의 `rmSync`가
매번 지운다 — **캐시가 없어 재실행이 매번 129개 clone(~4분)**, 네트워크 필수라 `pnpm test`에도
CI에도 못 넣는다. 그래서 세 층으로 나눈다.

| 층 | 무엇 | 어디서 | 무엇을 잡나 |
|---|---|---|---|
| **L1** 진입점 회귀 | `runPull`(`run.ts:51`, deps 주입)에 순서 섞인 DB 상태를 넣어 **파일 바이트**를 단언. 겸해서 `load.ts`/`keys/query.ts`의 `orderBy`를 prisma 스텁으로 캡처해 단언 | `pnpm test` | **값 전달 경로 (가) a~d가 끊긴 채 green이 되는 유일한 방어선.** 어댑터·render 단위 테스트로는 원리적으로 못 본다 |
| **L2** 골든 픽스처 | 실측 리포 모양 4개를 인라인 픽스처로 박고 `lib/survey/diff.ts`의 **프로덕션 함수를 그대로 import**해 `diffRatio === 0` · `changedHunks` · 바이트 고정점을 단언 | `pnpm test`, 네트워크 0 | **네트워크 지표를 오프라인 상시 단언으로 번역한다.** 지금은 이 지표가 사람이 표를 볼 때만 관측된다 |
| **L3** 재측정 트리거 | `lib/adapters/**`·`lib/survey/**`를 바꾼 커밋은 survey를 **학습·홀드아웃 둘 다** 돌리고 `docs/ADAPTER-COVERAGE.md` 갱신 | 규칙 등재 (CLAUDE.md 문서 신선도 + `.claude/commands/push.md` 4단계) | 일반화 확인. §0 3차가 "둘 다 돌린 것이 회귀를 잡은 유일한 이유"라 적어 놨는데 그 규칙이 어디에도 강제돼 있지 않다 |

**L2 픽스처는 인라인 템플릿 리터럴로 쓴다** — 리포에 fixture 디렉터리가 하나도 없고
`yaml-catalog.test.ts:14-33`이 그 관례다. 남의 리포 파일을 통째로 커밋하지 않으므로 라이선스
문제도 피한다.

## POSTMORTEM에서 소환한 함정

- **2026-09-02 "순위 픽스가 자기 단위 테스트만 통과하고 실제 경로에서 죽어 있었다"** — 이 기능의
  대응은 §pull (가)의 **값 전달 경로 4곳**과 검증 루프 **L1**이다. 정렬 지점만 표로 세우고 값 전달
  경로를 안 본 것이 이전 판의 결함이었다.
- **2026-09-02 "어댑터를 추가하고 파일 선택 층에 먹이지 않았다"** — `orderedEntries`를 만들고
  `chrome-locales.write`가 여전히 `usableEntries`를 부르고 있으면 chrome은 안 고쳐진다. 태스크의
  `grep` 검증 줄이 그것이다.
  - 같은 부류가 **지금 살아 있다**: `metrics.configFileRepos`가 `adapter-survey.ts:85`의 구조 분해
    누락으로 **구조적으로 항상 0**인데 단위 테스트만 green이다. 태스크 0의 새 지표가 같은 함정을
    밟지 않도록 "알려진 리포에서 기대값이 나온다"를 검증 줄로 쓴다.
- **2026-09-02 "학습 코퍼스의 오탐 0.0%가 처음 보는 리포에서 40%였다"** — 완료 조건의 diff 목표를
  **두 코퍼스로 나눠** 보고하고, 합치지 않는다.
- **2026-09-02 "구분자가 데이터에도 있으면 flatten/unflatten이 단사가 아니다"** — `levelOrder`를
  만들지 않기로 해서 **이 기능은 그 함정을 아예 지나지 않는다.**
- **2026-09-02 "`not-run`이 성공/실패 어느 쪽으로도 안 세어져 지표가 조용했다"** — 완료 조건 7이
  `not-run` 리포 수와 분모를 함께 기록한다.
- **2026-08-31 "환경변수를 모듈 최상위에서 평가하지 않는다"** — 이 기능엔 새 환경변수가 없어 해당
  없음.
