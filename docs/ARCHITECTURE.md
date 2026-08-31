# ARCHITECTURE

**코어 로직(`lib/adapters/`·`lib/githash.ts`·`lib/github.ts`·`lib/scan/`·`lib/push/`)을 건드리기 전에 읽는다.** 무엇을 만드는지는 [MVP.md](./MVP.md), 어떻게 작업하는지는 [../CLAUDE.md](../CLAUDE.md). 이 문서는 **불변식과 함정**만 다룬다.

> 코드가 아직 서지 않은 항목은 `(미구현)` 표시. 구현하면서 실제 동작과 어긋난 부분을 갱신한다.

## 1. 적재·export와 결정성 (`lib/adapters/`)

**어댑터가 양방향이다** — 리포의 로케일 파일을 읽어 키를 적재하고, 편집된 값을 **같은 포맷으로** 되돌려준다. 크롬 `messages.json`으로 통일하지 않는 이유는 그게 불가능하기 때문이다: `chrome.i18n`은 키에 `[A-Za-z0-9_@]`만 허용하는데 조사한 4개 리포 중 3개가 점 표기를 쓴다.

| 어댑터 | 경로 | 리프 | write | 덮는 리포 |
|---|---|---|---|---|
| `chrome-locales` | `<root>/_locales/{locale}/messages.json` | `{message, description?}` | 재생성 | bugshot-2 (4키 × ko/en/fr) |
| `json-catalog` | `<dir>/{locale}.json` (flat 또는 중첩) | `string` | 재생성 | bugshot-web (104키 × 2, 중첩·배열), skillflo (**1446키 × 6**) |
| `ts-dict` | `<dir>/*.ts` (글롭 — 한 파일에 로케일 여러 개) | 문자열 리터럴 | **수술적 치환** | bugshot-2 (**903키 × ko/en/fr** — 실제 UI 번역) |

**`layout`이 둘로 갈린다.** `per-locale`은 `pathTemplate`의 `{locale}`을 치환해 로케일당 파일 하나를 만들고, `multi-locale`(`ts-dict`)은 한 파일에 로케일이 여러 개라 `pathTemplate`이 글롭이고 **write를 파일별로 부른다.** 페이로드 검증이 `{locale}` 포함을 요구하지 않는 것은 이 때문이다.

### 1.1 재생성 writer가 지키는 불변식 (`lib/adapters/shared.ts`)

**같은 입력 → 언제나 바이트 단위로 같은 출력.** 깨지면 blob SHA 비교(§2)가 매번 "변경됨"을 뱉어 야간 cron이 무의미한 커밋을 쌓고 PR diff가 노이즈로 덮인다 — 조용히 망가지고 며칠 뒤에 발견되는 종류다.

⚠️ **아래 표는 재생성 방식(`chrome-locales`·`json-catalog`)에만 적용된다.** 수술적 치환(`ts-dict`)은 원본의 순서·빈 줄·주석을 보존하는 것이 요지라 정렬·재조립을 하지 않고 `usableEntries`를 지나지 않는다 — §1.4를 따른다.

| 규칙 | 값 | 깨지는 방식 |
|---|---|---|
| 키 정렬 | **`<` 비교** (UTF-16 코드 유닛) | `localeCompare`는 Node ICU 빌드·로케일에 따라 순서가 달라져 불변식이 실행 환경에 묶인다 |
| 재조립 | 정렬한 순서로 객체를 새로 만든다 | `JSON.stringify`는 삽입 순서를 따르고, Postgres는 `ORDER BY` 없는 쿼리의 순서를 보장하지 않는다 |
| 들여쓰기 | 2칸 | `JSON.stringify(v, null, 2)` |
| 끝 개행 | 정확히 1개 | `JSON.stringify`는 개행을 안 붙인다. 2개면 SHA가 달라진다 |
| `orphaned` | 제외 | DB엔 남는다 — export에서만 빠진다. **`usableEntries`가 유일한 관문이라 모든 재생성 writer가 이걸 지나야 불변식에 주인이 생긴다** |
| 미번역 | 제외 (빈 문자열 포함) | 남기면 크롬이 빈 값을 그대로 렌더한다. 빼면 폴백한다 |
| 낼 것 0개 | `null` — 파일을 내지 않는다 | 빈 `{}`는 "이 로케일 지원함"으로 읽혀 빈 UI를 보인다 |

**중첩 구조는 write에서 복원한다.** 평탄화만 하고 복원하지 않으면 읽은 포맷과 다른 모양으로 되돌려주게 되어 왕복이 깨진다. 배열은 인덱스 키(`hero.subcopy.0`)로 펼치고, `0..n`이 빈틈없이 채워진 객체만 배열로 되돌린다 — 빈틈이 있으면 객체로 남긴다(배열로 만들면 구멍이 `null`로 직렬화되어 원본에 없던 값이 파일에 나타난다).

**`description`은 base 로케일에만, 지원하는 어댑터에서만.** 원문 메타데이터라 번역 파일마다 복제하면 바이트만 늘고 읽는 쪽이 없다. `json-catalog`은 담을 곳이 없어 DB엔 남지만 파일로 나가지 않는다.

### 1.2 왕복의 판정 기준은 바이트가 아니라 의미다

**바이트 차이는 정상이다** — 원본 파일이 우리 정렬 규칙을 따르고 있을 이유가 없다. 실제로 조사한 3개 리포 11개 파일 전부 바이트가 다르고 **의미는 전부 같다.** 첫 pull에서 한 번 정규화되고 그 뒤로는 안정된다.

**의미가 다르면 데이터 손실이므로 실패다.** `pnpm ingest <dir>`가 두 판정을 따로 보고한다.

### 1.3 포맷 탐지는 경로만으로 안 된다

`detect`는 리포 파일 경로 목록에서 포맷을 찾는다. **경로 사전순으로 후보를 고르면 틀린다** — bugshot-web에서 `public/search/{locale}.json`(검색 인덱스, 최상위가 배열)이 `src/lib/i18n/{locale}.json`보다 먼저 잡혔다.

- 후보를 **i18n 계열 경로 신호 → 로케일 개수 → 경로순**으로 순위 매긴다
- **로케일이 2개 이상**인 후보만 인정한다 (하나뿐이면 `config/en.json` 같은 우연일 수 있다)
- `probe` 콜백을 주면 후보 파일 하나를 읽어 카탈로그 모양인지 확인한다. **GitHub API에서는 블롭 읽기가 요청 비용**이라 경로로 좁힌 뒤 그 후보만 확인하도록 콜백으로 받는다
- **`nested`는 `detect`가 알 수 없다** — 내용의 성질이므로 `read`가 관측해 `ReadResult.nested`로 돌려주고, 호출부가 write 전에 `DetectedFormat.nested`에 실어준다

**base 로케일은 아직 추정이다** — `en`이 있으면 `en`, 없으면 사전순 첫 번째. 어느 로케일이 기준인지는 리포의 관례라 미결이다 (MVP §10).

### 1.4 수술적 치환 (`ts-dict`) — 규칙이 반대다

**값만 바꾸고 나머지 소스를 그대로 둔다.** TS 딕셔너리를 재생성하면 사람이 의미 단위로 넣은 빈 줄(bugshot-2에 120개)과 주석(23개)이 첫 pull에서 사라진다 — JSON에선 한 번의 재정렬이지만 TS에선 **구조 파괴**이고, 번역 도구가 남의 코드를 훼손하는 것으로 읽힌다.

| | 재생성 | 수술적 치환 |
|---|---|---|
| write의 입력 | DB 상태 | DB 상태 **+ 원본 파일 내용**(`DetectedFormat.currentFiles`) |
| 결정성의 근거 | 정렬·재조립 규칙 | 원본 보존 — 바뀐 값이 없으면 **원본을 그대로 돌려준다** |
| `orphaned` 키 | 파일에서 뺀다 | **파일에 남긴다**(값을 안 바꾼다). 지우면 코드가 참조하는 키가 사라진다 |
| 낼 것 0개 | `null` | 원본 그대로(파일을 지우지 않는다). `null`은 원본이 없을 때만 |

**함정 둘:**

- **`setLiteralValue`를 쓰면 안 된다** — 이스케이프를 하지 않아 백슬래시·개행·따옴표가 재파싱에서 깨진다(실측: `a"b\c\nd` → `a"bcd`). `JSON.stringify(next)`로 따옴표까지 포함한 유효한 JS 리터럴을 만들고 `replaceWithText`로 갈아끼운다. 비ASCII는 그대로 남아 한글이 유니코드 이스케이프로 바뀌지 않는다.
- **`export`된 선언은 로케일 객체가 아니다.** `export const ai = { ko, en, fr }` 같은 묶음 객체의 이름이 2~3자 소문자면 `looksLikeLocale`을 통과한다(bugshot-2의 `ai`·`app`이 0키 "로케일"로 잡혔다). 묶음은 항상 export되고 로케일 객체는 항상 파일 내부용이라 그 한 줄로 갈린다.

**미결**: 빈 문자열(`value=""`)을 어떻게 쓸지 정하지 않았다. 재생성은 키를 빼서 폴백을 유도하지만 TS 딕셔너리엔 폴백이 없어 빈 값이 그대로 렌더된다 (MVP §10).

## 2. blob SHA 로컬 계산 (`lib/githash.ts`)

```
sha1("blob " + byteLength + "\0" + content)
```

**`byteLength`는 문자 수가 아니라 UTF-8 바이트 수다.** 한국어·프랑스어 번역이 들어가므로 `content.length`를 쓰면 즉시 틀린다 — `Buffer.byteLength(content, "utf8")`.

이 함수의 목적은 **API 호출을 건너뛰는 것**이다. base 트리의 blob SHA와 비교해 전부 같으면 GitHub API를 한 번도 더 부르지 않는다. 변경 없는 날이 대부분이라 이게 기본 경로다.

⚠️ **`ts-dict` 프로젝트에서는 이 최적화가 그대로 성립하지 않는다.** write가 원본 내용을 요구하므로(§1.4) 로컬 SHA를 계산하려면 **먼저 파일별로 blob을 읽어야** 한다 — 변경이 없는 날도 파일 수만큼 호출이 든다. 어떻게 다룰지는 6단계 착수 시 정한다 (MVP §10 — 유력한 답은 DB 측 스킵: 마지막 pull 이후 `Translation.updatedAt` 최대값이 안 움직였으면 GitHub을 아예 부르지 않는다. 그러면 재생성 어댑터도 같이 싸진다).

검증: `lib/__tests__/githash.test.ts`가 골든 5건(빈 문자열·ASCII·한글·이모지·실제 `messages.json` 형태)을 박고 있고, **마지막 블록이 골든 자체를 `git hash-object --stdin` 실측과 매 실행마다 재대조한다.** 박제된 상수는 대조 대상이 바뀌어도 계속 통과하므로, 이 앵커가 없으면 골든이 낡는 것을 아무도 모른다.

한글 `안녕하세요`는 문자 5개·**바이트 15개**, `🎉`는 UTF-16 코드 유닛 2개·**바이트 4개**다. `content.length`를 쓴 구현은 정확히 이 두 케이스에서 깨진다.

앵커는 `git` **바이너리**만 요구하고 저장소는 필요 없다(`git hash-object --stdin`은 리포 밖에서도 동작한다). CI에는 `actions/checkout`이 있으므로 문제없다.

## 3. GitHub Git Data API 흐름 (미구현 — `lib/github.ts`)

clone하지 않는다. 순서:

1. `GET /repos/{o}/{r}/git/ref/heads/{base}` → base head SHA
2. `GET /repos/{o}/{r}/git/trees/{sha}?recursive=1` → 기존 로케일 파일의 blob SHA. 경로는 `Project.pathTemplate`이 정한다(`per-locale`은 `{locale}` 치환, `multi-locale`은 글롭 매칭 — §1.1)
2.5 **`ts-dict`면 여기서 파일별 blob을 읽는다** (`GET /git/blobs/{sha}`) — write에 원본이 필요하다 (§1.4). 재생성 어댑터는 이 단계를 건너뛴다
3. 로컬 export + blob SHA 계산 → 비교. **전부 같으면 종료** (`multi-locale`은 write를 파일별로 부른다)
4. 변경분마다 `POST /git/blobs`
5. `POST /git/trees` — **`base_tree`를 반드시 넘긴다.** 빼면 트리가 새로 만들어져 리포의 나머지 파일이 전부 삭제된 커밋이 된다
6. `POST /git/commits` — `parents: [baseHeadSha]`, 메시지에 `[skip-l10n]`
7. `PATCH /git/refs/heads/l10n%2Fsync` — `force: true`

### 함정

- **`l10n/sync`의 `/`는 URL 인코딩이 필요하다.** ref 경로에 슬래시가 그대로 들어가면 404가 난다.
- **브랜치가 없으면 `PATCH`가 아니라 `POST /git/refs`다.** 첫 실행 경로를 반드시 다뤄야 한다.
- **parents는 항상 base head다.** `l10n/sync`의 기존 head를 parent로 쓰면 누적 히스토리가 되고, base가 앞서 나간 뒤엔 3-way merge가 필요해진다 — 코어 원칙 위반.
- **force update는 의도된 것이다.** `l10n/sync`는 히스토리가 아니라 "현재 DB 상태의 스냅샷"이다.
- **`[skip-l10n]` 마커가 없으면 무한 루프**: pull이 만든 커밋이 main에 머지되면 push가 돌아 다시 DB에 쓰고, 그게 pull을 트리거한다.
- **PR은 하나를 재사용한다.** `GET /pulls?head=l10n/sync&state=open`으로 먼저 조회. PoC 리포에 PR 수십 개가 쌓이면 사람이 안 본다.

## 4. 사용처 스캔 (`lib/scan/`) — 진실이 아니다

**출력은 `refs`뿐이다.** `ScanResult`에 `errors` 필드가 **없는 것이 이 층의 요지다** — 키의 존재·원문·키 이름 합법성은 전부 §1의 적재 층이 로케일 파일을 읽어 정한다. 이 층은 편집 UI의 컨텍스트("이 문자열이 어디 나오는지")만 만든다.

`pnpm scan`은 **항상 exit 0이다.** CI를 실패시킬 수 있는 건 `pnpm ingest`뿐이다.

bugshot-2 실측: 이름 기반 매칭 시절 **0키 / 에러 1391건** → 지금 **115키 / 참조 273건 / 경고 9건 / exit 0**. 경고 9건은 전부 그 리포의 실제 동적 키다.

**따라서 실패가 경고다.** 스캐너가 못 찾은 키는 동적으로 조립됐거나 아직 안 쓰이는 키다 — 컨텍스트가 빠질 뿐 적재는 정상이다. 남의 리포 CI를 우리 규칙으로 실패시킬 근거가 없다.

**AST를 쓰는 이유**: 정규식은 주석 속 호출·문자열 리터럴 안의 `t(`·템플릿 조립을 구분하지 못한다. ts-morph는 주석을 AST 노드로 만들지 않으므로 주석 속 호출은 애초에 순회 대상이 아니다. 이 프로젝트에서 리뷰 grep이 두 번 그 오탐을 냈다(주석 속 `content.length`, `echo`의 이스케이프 해석).

### 4.0 ⚠️ 훅 기반 i18n을 아직 못 잡는다

import 기반 매칭이라 **`import { t } from "<module>"` 패턴만** 본다. 실측 3개 리포 중 둘이 훅 기반이고 그쪽 `refs`가 0건이다:

- `const { t } = useI18n()` (skillflo) — `t`가 import가 아니라 훅 반환값의 구조분해다
- `const t = await getTranslations({ namespace: "meta" })` (bugshot-web, next-intl) — 위와 같고, 게다가 **키가 namespace 상대**라 `t("title")`의 실제 키는 `meta.title`이다

**next-intl·react-i18next가 전부 훅 기반이라 "범용적"이라는 목표와 어긋난다.** 고치려면 훅 import를 찾고 그 반환값의 지역 바인딩을 추적해야 한다(TASKS §3b).

### 4.1 래퍼 매칭은 이름만으로 하지 않는다

대상 리포에 이미 다른 `t()`가 있을 수 있다. bugshot-2가 정확히 그렇고(`t(key, params?)`), 이름만 보고 매칭했을 때 기존 호출 **1391건이 오탐**으로 잡혔다.

- **모듈 경로 + export 이름**으로 식별한다. `import { t } from "<module>"`이 있는 파일만 검사하고, 별칭(`t as translate`)도 따라간다
- **모듈 경로도 충돌한다** — bugshot-2의 래퍼가 하필 `@/i18n#t`다. 그래서 호출부가 값을 넘기고 CLI는 `--wrapper <module>#<export>`로 받는다. 대상 리포의 관례를 스캐너가 알 수 없다
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

**판정과 I/O를 나눈다.** `plan.ts`가 순수 함수로 계획을 세우고(`toInsert`/`toUpdate`/`toOrphan`/`toUnorphan`/`staleKeyIds`), `apply.ts`가 그것만 실행한다. `PushPlan`에 **`toDelete`가 없는 것이 요지다** — 코드에서 사라진 키는 `orphaned`로 표시만 한다.

### 5.5.1 pooler가 구현을 규정한다

- **대화형 트랜잭션을 쓸 수 없다.** 런타임이 transaction 모드 pooler(6543)라 `$transaction(async tx => …)`은 문장마다 다른 백엔드로 갈 수 있다. **배열형 `$transaction([...])`** 은 한 번에 배치로 보내므로 pgbouncer에서도 원자적이다.
- **키마다 왕복하면 타임아웃이다.** skillflo가 1446키다. `unnest()`로 배열을 넘겨 문장 하나가 전체를 처리한다. 실측 1446키 + 2892번역 + 1446refs가 **약 1.6초**(라우트 한도 60초).
- **키 id를 JS에서 만든다.** 스키마의 `@default(cuid())`는 Prisma 클라이언트가 적용하는 값이라 raw SQL에는 오지 않는다. 현재 `randomUUID()`를 쓰고, 형식 혼재를 통일할지는 미결(TASKS §4).

### 5.5.2 번역값은 strict 덮어쓰기다

**`INSERT ... ON CONFLICT DO UPDATE`.** 리포 파일의 값이 push마다 DB를 덮는다 — 변경 감지도, 병합도, 예외도 없다 (MVP §3.1). base 로케일 행도 같이 쓴다.

> **⚠️ 2026-08-31 정책 반전.** 이전 구현은 `DO NOTHING`(없을 때만 채우는 콜드 스타트)이었고, 그전 스펙은 "번역 값을 어떤 경로로도 건드리지 않는다"였다. **문서에서 이 둘 중 하나를 서술한 대목을 보면 낡은 것이다.** 반전 이유는 MVP §3.1에 있다 — 진실의 방향을 한 번에 하나로 두는 것이 "병합 없음"을 지키는 가장 단순한 형태다.

**대가는 편집 손실 창이다.** 번역자의 편집은 pull PR이 머지되기 전까지 리포에 없으므로, 그 사이 push가 오면 사라진다. 이 위험을 코드에서 지우려 하면 곧 변경 감지·병합이 되어 코어 원칙을 깬다 — 완화는 pull 주기를 줄이는 쪽에서만 한다.

**따라서 `Translation.value`의 쓰기 주체는 둘이다**: 편집 UI의 `saveTranslation`과 push. 셋째가 생기면 어느 쪽이 이기는지 다시 판정해야 하므로 늘리지 않는다.

### 5.5.3 보고값은 실제 영향 행수다

`$executeRaw`가 돌려주는 영향 행수를 배열형 트랜잭션 결과에서 읽는다. 후보 수를 보고하면 실제로 쓰이지 않은 행까지 세어 CI 로그에 거짓이 남는다 — `DO NOTHING`이던 시절 재전송마다 "번역 2892건 채움"이 찍혔다. strict에서는 재전송도 전 행을 갱신하므로 두 수가 대개 같지만, 보고 경로는 그대로 실측을 읽는다.

### 5.5.5 대상 프로젝트를 페이로드가 정하지 않는다 (미해결)

라우트가 `ACTIVE_PROJECT_SLUG`로 대상 프로젝트를 정하고 페이로드엔 식별자가 없다. **리포가 둘 이상 CI를 붙이면 한쪽 페이로드가 다른 프로젝트에 적용된다** — 그쪽 키는 전부 orphan되고 이물 키가 삽입되는데, `PushPlan`에 `toDelete`가 없고 번역이 달리면 FK가 `RESTRICT`라 지울 수도 없다. 실 DB에 프로젝트가 이미 둘이므로 **7단계(Actions 배선) 전에 정해야 한다** (MVP §10).

**`commitSha` 순서 검사도 없다.** 오래된 run을 Re-run하면 strict가 그 시점 상태로 DB를 되돌린다. 순서 검사는 병합이 아니라 거부라서 코어 원칙과 충돌하지 않는다.

### 5.5.4 `applyPush`는 클라이언트를 주입받는다

`lib/db.ts`를 직접 import하면 그 파일의 `server-only` 때문에 스크립트·테스트가 이 모듈을 **열 수조차 없다** — `lib/env.ts`에서 이미 밟은 함정이다. 라우트가 `getPrisma()`를 넘긴다.

## 6. 인증 경계

**두 GitHub 자격증명을 섞지 않는다.**

| 용도 | 자격증명 | 이유 |
|---|---|---|
| 편집 UI 로그인·인가 | GitHub OAuth (Auth.js) + 허용 핸들 목록 | GitHub 계정이 곧 신원. org 멤버십은 개인 계정 리포에서 성립하지 않는다 |
| `l10n/sync` 쓰기 | GitHub App installation token | OAuth 토큰으로 커밋하면 커밋이 개인 명의가 되고 그 사람이 org를 떠나면 깨진다 |
| `/api/push` 호출 | Bearer `PUSH_TOKEN` | Actions는 사람이 아니다. **fail-closed** — 환경변수가 비었으면 500이고, 거부 응답은 어느 쪽이 틀렸는지 알려주지 않는다(토큰 존재 여부를 탐색할 단서를 주지 않는다) |
| `/api/pull` cron 호출 | `CRON_SECRET` | 공개 엔드포인트면 아무나 커밋을 유발할 수 있다 |

### 6.1 ⚠️ 차단은 미들웨어에만 의존한다

**레이아웃의 조건부 렌더는 차단이 아니다.** App Router는 레이아웃과 페이지를 병렬로 렌더하므로, 레이아웃이 `children`을 쓰지 않아도 페이지는 이미 실행돼 DB를 조회하고 RSC 페이로드를 응답에 싣는다. 실측으로 세션 없는 `/keys` 응답 **1.3MB에 1446키가 노출**됐다 — 화면엔 로그인 버튼만 보이므로 눈으로는 안 보인다 (`docs/POSTMORTEM.md` 2026-08-31).

- **1차: `middleware.ts`** — 렌더 전에 막는다. JWT 세션이라 DB 없이 토큰만 확인하면 되므로 Edge 제약을 타지 않는다. **새 보호 라우트를 추가하면 `matcher`에 추가한다.**
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
