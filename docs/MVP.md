# MVP 스펙

**이 문서가 i18n-poc의 기본 스펙이다.** 무엇을 만들고 무엇을 안 만드는지, 그리고 각 선택의 근거가 여기 있다. 설계 결정이 바뀌면 코드보다 먼저 이 문서를 고친다.

- 설계 상세·함정·불변식 → [ARCHITECTURE.md](./ARCHITECTURE.md)
- 작업 규칙·명령어·컨벤션 → [../CLAUDE.md](../CLAUDE.md)

## 1. 문제와 목표

크롬 확장의 번역 파일(`_locales/<locale>/messages.json`)을 비개발자 동료가 편집할 수 있게 만든다. 지금은 개발자가 JSON을 직접 고치거나, 동료가 스프레드시트에 적어주면 개발자가 옮겨 심는다.

- **개발자는 1명** (나)
- **번역 편집자는 사내 비개발자 동료**
- Crowdin/Tolgee 대체가 목표가 **아니다.** 학습·실험이고, 사내에서 실제로 한 번은 써볼 수 있는 수준이 목표다.

## 2. 코어 설계 원칙

**번역 값은 DB가 진실, 소스 키는 코드가 진실.**

두 종류의 데이터에 각각 소유자를 하나씩 배정한다. 소스 키는 코드만 안다. 각 축에 소유자가 하나뿐이므로 **머지 로직이 아예 존재하지 않는다** — export가 DB에서 결정적으로 재생성되므로 git 브랜치가 갈라져도 base에서 다시 따서 파일을 새로 뽑으면 끝난다. 3-way merge도, 충돌 해소 UI도, "누가 이겼나" 판정도 없다.

**번역 값의 진실은 시점에 따라 갈린다** (strict 정책 — §3.1): push 시점엔 리포가 DB를 덮고, 그 사이엔 DB가 진실이며 pull이 리포로 되돌려준다. 어느 순간에도 **두 쪽을 병합하지 않는다** — 이 원칙이 실제로 지키는 것은 "단일 소유자"가 아니라 **"병합 없음"** 이다.

이 원칙이 파생시키는 제약은 [ARCHITECTURE.md](./ARCHITECTURE.md)에, 요약은 CLAUDE.md 동명 섹션에 있다.

## 3. 세 가지 흐름

### 3.1 push (코드 → DB)

base 브랜치 푸시 시 GitHub Actions에서 리포의 로케일 파일을 올린다. **base는 `dev`다** (2026-09-01 결정 — 대상 리포 bugshot-2의 실제 작업 브랜치이고, `main`은 보호 브랜치라 PR 머지 흐름이 한 겹 더 생긴다). pull의 base도 같은 브랜치여야 어긋나지 않는다 (§3.3).

**번역 값 규칙 (strict): 리포 값으로 DB를 덮는다** (`INSERT ... ON CONFLICT DO UPDATE`).

리포가 선언한 값이 push마다 DB에 그대로 반영된다. 변경 감지도, 병합도, 예외도 없다 — **진실의 방향이 한 번에 하나**이고 그게 §2의 "병합 없음"을 가장 단순하게 지키는 형태다.

원래 스펙은 "번역 값은 어떤 경로로도 건드리지 않는다"였는데 그러면 **첫 pull이 대상 리포의 번역을 파괴한다.** skillflo로 짚으면: 연동 시 base(en) 1446키만 적재되고 `Translation`은 비어 있다 → 번역자가 ko 한 건을 고친다 → pull이 ko 파일을 **키 1개짜리로 덮는다**. 리포에 있던 1445개가 사라진다. DB가 진실이 되기 전에 기존 값을 물려받는 단계가 없었다.

### ⚠️ strict 정책의 대가 — 편집 손실 창

번역자가 편집한 뒤 **그 편집이 리포로 돌아가기 전에** 개발자가 코드를 푸시하면 **그 편집이 사라진다.** 리포엔 아직 옛 값이 있고 push가 그것으로 DB를 덮기 때문이다.

**경계는 pull 실행이 아니라 pull PR의 머지다.** PR이 열려 있어도 리포의 base 브랜치엔 아직 옛 값이 있으므로, 그 상태에서 push가 오면 DB가 덮이고 다음 pull이 `l10n/sync`를 force update하면서 PR에서도 편집이 사라진다. 즉 손실 창은 **마지막으로 머지된 pull 이후의 모든 편집**이다. 야간 cron 1회 기준으로 최악 하루치다.

줄이는 방법은 pull을 자주 돌려 머지하는 것뿐이고, 편집 즉시 pull(웹훅)은 §7 비범위다. **PoC에서 감수하는 대가로 명시한다** — 정책을 느슨하게 하면(변경 감지·병합) 코어 원칙이 요구하는 단순성이 무너진다.

> **⚠️ 지금은 방어가 0이다.** `/api/pull`도 cron도 아직 없는데(§8-6·7 미완) 실 DB엔 이미 편집이 들어 있다. **6단계가 서기 전까지 대상 리포의 push를 다시 돌리면 그 편집은 되돌릴 방법이 없다.** 위 "하루치"는 pull이 동작하기 시작한 뒤의 이야기다.

**운영 규칙**: 번역 작업을 한 날은 `/api/pull`을 눌러 PR을 만들고 **머지한 뒤에** 코드를 푸시한다.

**두 층으로 나뉜다.** 키 집합의 진실은 로케일 파일이고, 코드 스캔은 사용처만 보탠다:

| 층 | 읽는 것 | 주는 것 | 실패 시 |
|---|---|---|---|
| **적재 (ingest)** | `_locales/<locale>/messages.json` | 키 집합 + 원문 + `description` | **CI 실패** — 연동이 성립하지 않는다 |
| **사용처 (scan)** | 코드·HTML·manifest | `refs: [{path, line}]` | **경고** — 컨텍스트가 빠질 뿐 적재는 된다 |

1. Actions 트리거. 커밋 메시지에 `[skip-l10n]`이 있으면 스킵 (pull이 만든 커밋의 재업로드 루프 차단)
2. **적재**: base 로케일의 `messages.json`을 읽어 `{ key, sourceText, description?, namespace }`
3. **사용처 스캔**: `__MSG_key__` 토큰, `chrome.i18n.getMessage("key")`, (설정됐으면) 래퍼 호출에서 `refs` 수집
4. **CI 실패 조건**: base 로케일 파일이 없거나 JSON이 깨졌거나 `message` 필드가 없다, 키 이름이 `[A-Za-z0-9_@]` 밖이다(크롬이 조용히 무시한다)
5. **경고 조건 (실패 아님)**: 코드에서 못 찾은 키(= `refs` 없음), 로케일 파일에 없는 키를 코드가 참조
6. `POST /api/push` (Bearer `PUSH_TOKEN`), 페이로드에 `projectSlug`·`commitSha`·`commitAt` 포함

   **`projectSlug`를 페이로드가 싣고 서버가 대조한다** (2026-08-31 결정). 서버의 `ACTIVE_PROJECT_SLUG`와 다르면 **409**로 거부한다 — 대상 지정을 서버 env에만 맡기면 리포가 둘 붙는 순간 한쪽 페이로드가 남의 프로젝트에 적용되고, `toDelete`가 없고 FK가 `RESTRICT`라 삽입된 이물 키를 지울 수 없다. 프로젝트별 토큰으로 가르는 방법도 있지만 시크릿이 프로젝트 수만큼 늘고 토큰↔프로젝트 매핑을 어딘가 둬야 해서 PoC엔 과하다.

   **`commitAt` 역행을 거부한다** (2026-08-31 결정). Actions가 커밋 시각을 실어 보내고, `Project.lastCommitAt`보다 과거면 **409**다. strict라 오래된 run을 Re-run하면 DB가 그 시점으로 회귀하는데(키 orphan + 번역값 회귀 + permalink가 옛 SHA) 되돌릴 경로가 없다. **같은 커밋의 재전송은 통과시킨다** — strict라 결과가 같고, 스캐너를 고쳐 같은 커밋을 다시 올리는 것은 정당하다. GitHub API로 조상 관계를 확인하는 편이 정확하지만 그러면 지금 GitHub을 전혀 안 부르는 push 라우트에 App 토큰과 네트워크 호출이 들어온다.

   **`POST`인 이유**: 전체 키 집합을 보내므로 의미상 `PUT`에 가깝지만, 리소스 교체가 아니라 **부수효과 있는 RPC**다 — `orphaned` 표시·`needsReview` 전파 같은 파생 효과가 있고, 같은 URL에 `GET`하면 그 리소스가 나오지 않는다.

   **`PATCH`가 불가능한 이유**: 증분 전송으로는 사라진 키를 알 수 없다. `orphaned` 판정이 "페이로드에 없다"에 의존하므로 전체 집합이 필수다. CI가 이전 상태를 알게 만들면 그게 diff 동기화이고 코어 원칙(§2, 머지 로직 없음)과 충돌한다.

   **실측 규모**: skillflo base 1446키 → 페이로드 **144 KB** (Vercel 본문 한도 4.5MB 대비 여유). 전체 로케일 8676행.
7. 서버 처리:
   - `Locale` upsert (발견된 로케일 + `isBase`)
   - `StringKey` upsert (키·원문·`sourceHash`·description·namespace)
   - `Translation` **덮어쓰기** — 리포 파일의 값으로 DB를 갱신한다(strict). **base 로케일도 포함한다** (§3.2 — base도 편집 가능하다)
   - 적재 결과에 없는 키 → `orphaned = true`, 다시 나타난 키 → `false`. **삭제하지 않는다**
   - `sourceHash`가 바뀐 키 → base 아닌 모든 번역에 `needsReview = true` 전파
   - `KeyRef` 전체 교체 (증분 갱신보다 단순하고, 스캔이 전수라 정확하다)
   - `Project`에 `lastCommitSha`·`lastCommitAt`와 어댑터 설정(`adapterName`·`pathTemplate`·`nested`·`baseLocale`) 저장 — 포맷을 아는 시점이 push이고, pull이 파일을 쓰려면 필요하다

   **구현 제약**: 런타임이 transaction 모드 pooler(6543)라 대화형 `$transaction(async tx => …)`이 세션을 못 잡는다. 배열형 `$transaction([...])`과 `unnest()` 벌크 문장을 쓴다 — 1446키를 키마다 왕복하면 타임아웃이다. 진단·계획은 순수 함수(`lib/push/plan.ts`)로 분리해 테스트한다.

**왜 이렇게 나눴나** — 사용자 스토리의 시작이 "리포를 연동하면 키가 DB에 적재된다"다. 코드 스캔을 키 집합의 진실로 두면 대상 리포가 **우리 래퍼로 전면 리팩터링을 먼저** 해야 아무것도 안 나온다. 실제로 bugshot-2에 돌려보니 자기 `t(key, params?)`를 이미 갖고 있어 오탐 1391건이 나왔다. 로케일 파일은 크롬 확장이라면 이미 갖고 있는 것이므로 **리팩터링 0으로 오늘 동작한다.**

### 3.2 편집 UI

비개발자용. **이쪽 성패는 "이 문자열이 어디 나오는지"를 보여주는 컨텍스트 제공에 달려 있다.**

- 네임스페이스 사이드바 → 키 리스트 → 인라인 편집
- 키마다: 원문, description, **코드 참조 permalink**(스캔 당시 `commitSha` 고정), `needsReview`·`orphaned` 배지
- 필터 3개: 미번역 / 검토필요 / orphaned
- blur 시 저장, `updatedBy`에 GitHub 핸들 기록

컨텍스트는 **코드 참조 자동 수집 + 네임스페이스 그룹핑** 두 개까지다. 스크린샷·번역자 노트는 비범위(§7).

**유일한 사용자 mutation은 "번역값 수정"이다.** Server Action 하나(`saveTranslation`)뿐이고, 키 추가·삭제·로케일 추가·삭제 UI가 없다 — 키와 로케일은 리포가 정하고 적재로만 들어온다.

**값 지우기는 행 삭제가 아니라 `value=""`다** (행을 지우면 export가 `sourceText` 폴백·미번역 판정에서 갈린다).

**"지우기"는 미번역으로 되돌리는 조작이고 수명은 다음 push까지다** (2026-08-31 결정). §4.1이 미번역을 export에서 빼므로 빈 값은 리포에 도달하지 못하고, 리포 파일의 옛 값이 다음 push에서 `DO UPDATE`로 되살아난다. **화면이 그 사실을 보이면 된다** — 빈 값을 리포까지 내보내려면 §4.1의 "미번역 제외"를 뒤집어야 하는데, 그러면 크롬과 TS 딕셔너리 양쪽에서 폴백을 잃고 빈 문자열이 그대로 렌더된다. 오역을 지워 비워두려는 의도까지 막지 않으려면 입력 자체를 거부할 수도 없다.

**화면은 테이블이다** — `| key | en(base) | ko | fr |`. 번역자가 원문과 번역을 나란히 봐야 하고, 로케일마다 화면을 갈아타면 문맥이 끊긴다.

**base 로케일도 다른 로케일과 똑같이 수정 가능하다.** 고정된 것은 **키**뿐이다.

- `Translation`이 **base 포함 모든 로케일**의 값을 담는다. push가 base 번역 행도 만든다
- `StringKey.sourceText`는 **`sourceHash` 계산과 stale 판정 전용**이다. 화면의 base 값은 `Translation`이다
- export할 때 base 파일은 `Translation`(base) 값으로 쓰고, 행이 없으면 `sourceText`로 폴백한다
- strict 정책이라 개발자가 리포의 base 파일을 고치면 다음 push가 DB의 base 값을 그것으로 덮는다 — 코드 수정이 정상 반영된다

**대가**: base 편집도 다른 로케일과 같은 손실 창에 놓인다 (§3.1). 번역자가 원문 오타를 고쳐도 pull PR이 머지되기 전에 push가 오면 리포의 옛 원문으로 되돌아간다.

`/api/push`가 키를 추가하고 `orphaned`를 세우는 건 여기 해당하지 않는다. 그건 사용자 조작이 아니라 **리포 동기화**다.

### 3.3 pull (DB → PR)

고정 브랜치 `l10n/sync` 하나에 커밋을 얹고 열린 PR 하나를 재사용한다. **clone 없이 GitHub Git Data API로만** 구현한다.

1. 트리거: 편집 UI의 수동 버튼 + Vercel Cron 야간 1회 (웹훅 즉시 반영은 비범위)
1.5 **DB 측 스킵 — 여기서 대부분 끝난다** (2026-08-31 결정). 그 프로젝트의 `Translation.updatedAt` 최대값이 `Project.lastPulledAt` 이후로 움직이지 않았으면 **GitHub을 한 번도 부르지 않고 종료**한다. 편집이 없는 날이 대부분이라 이게 기본 경로이고, 어댑터 방식과 무관하게 성립한다 — `ts-dict`는 write가 원본을 요구해 blob SHA 비교만으로는 호출을 아낄 수 없기 때문에(§4.1) 이 층이 없으면 변경 없는 날도 파일 수만큼 호출이 든다.

   **대가**: 리포의 로케일 파일을 직접 고치고 push를 안 돌린 경우를 놓친다. 정상 흐름에선 push가 그 변경을 DB에 반영하므로(strict) `updatedAt`이 움직인다.
2. base 브랜치 head SHA와 트리 조회
3. **어댑터의 writer로** 로케일별 파일 결정적 생성 (§4) — 읽어온 포맷 그대로

   ⚠️ **수술적 치환 어댑터(`ts-dict`·`yaml-catalog`·`code-dict`)는 원본 내용을 필요로 한다.** 그 프로젝트에서는 blob SHA만으로 끝나지 않고 로케일 파일의 blob **내용**을 받아야 한다(파일당 API 호출 1회). 재생성 어댑터는 SHA만으로 충분하다. **판단 기준은 `Adapter.writeStrategy`다** — `layout`으로 가르면 `per-locale` + 수술적 조합(YAML·코드 딕셔너리)이 원본 없이 write에 들어가 파일을 못 만든다.
4. **로컬 blob SHA 계산 → base 트리와 비교. 전부 같으면 여기서 종료 — GitHub API를 한 번도 더 부르지 않는다.** 변경 없는 날이 대부분이라 이게 기본 경로다
5. 변경분만: createTree(`base_tree`, 항목에 `content`를 실어 blob을 암묵 생성) → createCommit(`parents: [baseHead]`, 메시지에 `[skip-l10n]`) → updateRef(`l10n/sync`, `force: true`)
6. 열린 PR 있으면 재사용, 없으면 생성

## 4. export 규칙 (결정적)

**읽어온 포맷 그대로 되돌려준다.** 어댑터가 양방향(read + write)이고, 리포가 이미 쓰는 파일 모양으로 쓴다.

크롬 포맷으로 통일하지 않는 이유는 그게 불가능하기 때문이다 — `chrome.i18n`은 키에 `[A-Za-z0-9_@]`만 허용하는데, 조사한 4개 리포 중 3개가 점 표기 키(`common.viewAll`)를 쓴다. 통일하려면 키를 변형해야 하고, 그러면 코드의 참조가 전부 깨진다.

### 4.1 모든 writer가 지켜야 하는 것

**불변식: 같은 입력 → 언제나 바이트 단위로 같은 파일.** 깨지면 pull의 blob SHA 비교가 매번 "변경됨"을 뱉어 야간 cron이 무의미한 커밋을 쌓는다.

"입력"이 writer 방식에 따라 다르다:

| 방식 (`Adapter.writeStrategy`) | 입력 | 어댑터 |
|---|---|---|
| **재생성** (`regenerate`) | DB 상태 | `chrome-locales`, `json-catalog` |
| **수술적 치환** (`surgical`) | DB 상태 **+ 원본 파일 내용** | `ts-dict`, `yaml-catalog`, `code-dict` |

**⚠️ `writeStrategy`는 `layout`과 별개 축이다** (2026-09-02 분리). 전에는 `layout`(경로 모양)이
write 방식까지 겸했는데 — `multi-locale`이면 수술적, `per-locale`이면 재생성 — 새 어댑터 둘이
**`per-locale` + 수술적**이라 그 겸용이 깨졌다. pull이 "원본 내용을 받아야 하나"를 판단하는 기준은
이제 `layout`이 아니라 `writeStrategy`다 (§3.3).

수술적 치환은 문자열 값만 바꾸고 나머지 소스를 보존한다. TS 딕셔너리에 재생성을 쓰면 사람이 의미 단위로 넣은 빈 줄(bugshot-2에 120개)과 주석(23개)이 첫 pull에서 사라진다 — JSON에선 한 번의 재정렬이지만 TS에선 **구조 파괴**이고, 번역 도구가 남의 코드를 훼손하는 것으로 읽힌다. YAML도 같다: Rails 로케일 파일은 주석·앵커·블록 리터럴을 담고 있어 재생성이 곧 훼손이다.

### ⚠️ 수술적 치환은 **누락 키를 삽입한다** (2026-09-02 결정)

`ts-dict`는 원본에 있는 문자열 리터럴만 갈아끼웠다. 그것만으로 부족한 경우가 있다: **어떤 로케일
파일에 아직 없는 키**다. base에 100키가 있고 `ko.yml`에 60키만 있으면, 번역자가 나머지 40키를
채워도 치환할 대상이 없어 **리포에 도달하지 못한다.** 재생성 어댑터는 그냥 쓰므로 이 격차가
"수술적이면 번역이 반영되지 않는다"로 읽힌다.

따라서 `yaml-catalog`·`code-dict`는 **없는 키를 그 키가 속할 맵/객체에 추가**한다. 결정성은
유지된다 — 추가 키를 **코드포인트 정렬 순서로 해당 맵 끝에** 넣으므로 `같은 DB 상태 + 같은 원본`
→ 같은 바이트다. `ts-dict`는 기존 동작을 유지한다(bugshot-2가 세 로케일을 한 파일에 나란히 두어
키 격차가 생기지 않는다).

**대가**: `write`가 원본을 필요로 하므로 pull이 blob SHA만이 아니라 **내용**을 받아야 한다 (§3.3). 이득은 정규화 diff가 아예 없다는 것 — 바뀐 줄만 diff에 뜬다.

아래 규칙은 **재생성 방식에만** 적용된다. 수술적 치환은 원본 순서·공백을 보존하므로 정렬·재조립을 하지 않는다. 다만 **"미번역 제외"만은 호출부가 양쪽에 똑같이 적용한다** — `ts-dict`에 빈 값을 넘기면 치환이 일어나 소스에 `""`가 박히고, TS 딕셔너리엔 폴백이 없어 그대로 렌더된다. 빈 값은 아예 넘기지 않아 원본 값이 남게 한다 (§3.2의 "지우기" 결정과 같은 축).

- 키 정렬: **`<` 비교** (UTF-16 코드 유닛). `localeCompare`는 Node ICU 빌드에 의존해 불변식이 실행 환경에 묶인다
- 정렬한 순서로 객체를 **재조립**한다 (`JSON.stringify`는 삽입 순서를 따르고, Postgres는 `ORDER BY` 없는 순서를 보장하지 않는다)
- 들여쓰기 **2칸**, 파일 끝 개행 **정확히 1개**
- `orphaned` 키 **제외** (DB엔 남으므로 되돌릴 수 있다)
- **미번역 키 제외**, 빈 문자열도 미번역으로 취급
- **낼 항목이 0개면 파일을 내지 않는다** (`null` 반환) — 빈 파일은 "이 로케일 지원함"으로 읽혀 빈 UI를 보인다
- 변경 감지: `sha1("blob <바이트수>\0" + content)` 로컬 계산

### 4.2 어댑터별로 갈리는 것

| | `chrome-locales` | `json-catalog` | `yaml-catalog` | `code-dict` | `ts-dict` |
|---|---|---|---|---|---|
| 경로 | `<root>/_locales/{locale}/messages.json` | `<dir>/{locale}.json` | `<dir>/{locale}.y(a)ml` | `<dir>/{locale}.{ts,tsx,js,mjs}` | `<dir>/*.ts` (글롭) |
| `layout` | per-locale | per-locale | per-locale | per-locale | **multi-locale** |
| `writeStrategy` | regenerate | regenerate | **surgical** | **surgical** | **surgical** |
| 리프 | `{ message, description? }` | `"..."` | 문자열 스칼라 | 문자열 리터럴 | 문자열 리터럴 |
| 구조 | flat | flat 또는 **중첩** | 중첩 (+ Rails식 **로케일 루트 키**) | 중첩 객체 리터럴 | flat 점 표기 |
| `description` | 지원 | 담을 곳 없음 | 담을 곳 없음 | 담을 곳 없음 | 담을 곳 없음 |
| 키 제약 | `[A-Za-z0-9_@]` (크롬 강제) | 없음 | 없음 | 없음 | 없음 |
| 자동 탐지 | ✅ | ✅ | ✅ | ✅ | **❌ 명시 지정만** |

**`yaml-catalog`의 루트 키 변형**: Rails 관례는 파일 최상위가 로케일 코드 하나(`ko:`)이고 그 아래가
내용이다(mastodon·redmine·decidim). 반대로 misskey·directus는 루트에 바로 키가 온다. `read`가
"최상위 키가 하나이고 그것이 로케일처럼 보이면 루트 키"로 관측해 `rootKeyed`로 돌려주고, `write`가
같은 모양으로 되돌린다 — `nested`와 같은 축의 값이다 (§5.1).

**`ts-dict`를 자동 탐지에서 뺀다** (2026-09-02, `docs/ADAPTER-COVERAGE.md` 판정 ③). 오픈소스 109개에서
후보에 **0회** 올랐고, 코드 딕셔너리를 쓰는 12개 리포는 **전부 로케일당 파일 하나**(= `code-dict`)였다.
"한 파일에 로케일 여러 개"는 bugshot-2의 관례이지 생태계의 관례가 아니다. 지우지는 않는다 —
bugshot-2가 실전 검증 대상이고, `--adapter ts-dict`·`Project.adapterName` 명시 지정으로 계속 쓴다.

**`description`은 base 로케일에만 넣는다** (지원하는 어댑터에서). 원문에 대한 메타데이터라 번역 파일마다 복제하면 바이트만 늘고 읽는 쪽이 없다.

## 5. 확정된 기술 선택

| 항목 | 선택 | 근거 |
|---|---|---|
| 앱 | Next.js 16 App Router, Vercel | UI·push/pull 라우트·cron이 한 배포 단위에 들어간다 |
| DB | Supabase Postgres | Auth·Storage를 나중에 쓸 여지가 있고 관리 부담이 없다 |
| DB 열쇠 | Prisma 7 + `pg` driver adapter (런타임 6543 / 마이그레이션 5432) | 스키마 파일 하나로 마이그레이션·타입. 쓰기가 전부 서버 라우트라 RLS 없이도 안전. v7은 접속 URL이 `prisma.config.ts`와 adapter로 갈린다 |
| 로그인 | GitHub OAuth **단독** + **허용 핸들 목록**(`AUTH_ALLOWED_LOGINS`) | 리포 기반 도구라 GitHub 계정이 곧 신원이다. org 멤버십 검사는 **개인 계정 리포에서 성립하지 않는다** — 대상이 `SinhyeokKang/i18n-poc`라 그렇다. 핸들 목록은 개인·org 양쪽에서 동작하고 동료 몇 명 규모에 맞으며 org API 호출이 사라진다. 실제 org를 쓰게 되면 org 검사를 OR로 더한다 |
| 리포 쓰기 | GitHub App installation token | 사용자 OAuth 토큰으로 커밋하면 커밋이 개인 명의가 되고 그 사람이 org를 떠나면 깨진다 |
| 키·원문 출처 | **base 로케일의 `messages.json`** (어댑터 구조 — §5.1) | 리포 연동만으로 적재가 되어야 한다. 코드 스캔을 진실로 두면 대상 리포의 전면 리팩터링이 선행 조건이 된다 |
| 사용처 수집 | ts-morph AST + 정규식, **`refs` 전담** | 컨텍스트 제공용이므로 실패가 경고다. 정규식 단독은 주석 속 호출·문자열 안의 호출을 구분 못 해 오탐이 섞이므로 AST를 쓴다 |
| 상태 모델 | `needsReview` 플래그만 | 미번역/번역됨/검토필요 3상태가 공짜로 생기고 필터링이 가능해진다 |
| 컨텍스트 | 코드 참조 자동 수집 + 네임스페이스 그룹핑 | 자동이라 유지보수가 0에 가깝다 |
| UI | shadcn/ui (`new-york`) + Tailwind 4, **라이트 단일** | 컴포넌트를 소스로 받아 직접 고칠 수 있다. Tailwind 4는 config 파일 없이 CSS의 `@theme`으로 끝난다. 팔레트는 **slate** — `components.json`의 `baseColor: neutral`은 CLI 시드일 뿐이고 값의 진실은 `app/globals.css`다 (DESIGN §2) |
| 폰트 | Pretendard Variable **동적 서브셋, 자사 호스트** | 단일 파일은 2.0MB. 서브셋은 브라우저가 `unicode-range`로 필요한 구간만 받아 150~450KB. CDN은 렌더 방해 외부 요청이 생긴다 |
| 내부 쓰기 | **Server Action** | 클라이언트 fetch 배선·중복 스키마·수동 revalidate가 사라진다. 외부 진입점(`/api/push`·`/api/pull`)만 Route Handler |
| 세션 | **JWT** (DB 어댑터 없음) | 사용자 테이블 4개가 필요 없어 스키마가 5테이블로 유지되고 요청마다의 DB 왕복이 없다. 대가는 권한 회수가 최대 24h 지연 |
| 리스트 렌더링 | 네임스페이스 필터 + 순수 렌더 (가상화 없음) | 필터 후 한 화면이 수십~수백 행. 인라인 편집과 가상 스크롤을 섞으면 스크롤 튐·포커스 유실이 붙는다 |

### 5.1 양방향 어댑터

키 집합의 진실은 리포의 로케일 파일이다. 포맷이 리포마다 다르므로 **통합 인터페이스 아래 어댑터**를 두고, **read와 write를 같은 어댑터가 갖는다** — 읽은 포맷으로 되돌려줘야 왕복이 성립한다 (§4).

```ts
// lib/adapters/types.ts
// orphaned는 read에선 항상 비어 있다 — 파일에 있는 키는 정의상 orphaned가 아니다.
export type LocaleEntry = { key: string; message: string; description?: string; orphaned?: boolean };

export type Adapter = {
  name: AdapterName;
  /**
   * 로케일 파일 **경로**를 만드는 방식. write 방식과는 별개 축이다.
   * - `"per-locale"` — 로케일당 파일 하나. `pathTemplate`의 `{locale}`을 치환한다
   * - `"multi-locale"` — 한 파일에 로케일이 여러 개(`ts-dict`). `pathTemplate`이 글롭이고
   *   치환하지 않는다. write도 파일별로 불러야 한다
   */
  layout: "per-locale" | "multi-locale";
  /**
   * write 방식 (§4.1). **pull이 원본 blob 내용을 받아야 하는지를 이 값이 정한다** — 전에는
   * `layout`으로 갈랐는데 `per-locale` + `surgical` 조합이 생겨 성립하지 않는다.
   */
  writeStrategy: "regenerate" | "surgical";
  /** 리포 파일 목록에서 이 포맷을 찾아낸다. `probe`로 후보 내용을 한 번 확인한다 */
  detect(paths: readonly string[], probe?: FileProbe): DetectedFormat | undefined;
  /**
   * `detect`와 같은 판정을 하되 **후보를 전부 순위순으로** 낸다. `detect`가 이 결과의 `[0]`이다.
   * 1순위가 틀렸을 때 정답이 몇 순위였는지를 관측하는 유일한 수단이다 (ADAPTER-COVERAGE §1②).
   */
  detectCandidates(paths: readonly string[], probe?: FileProbe): DetectedFormat[];
  /** 로케일 파일 → 키 목록 (중첩이면 평탄화) */
  read(format: DetectedFormat, files: readonly AdapterFile[]): ReadResult;
  /** 키 목록 → 파일 내용. 낼 것이 없으면 null (§4.1) */
  write(format: DetectedFormat, input: WriteInput): string | null;
};
```

**어댑터 5개.** 앞의 셋은 자기 리포 4개를 덮으려고 만들었고, 뒤의 둘은 **오픈소스 109개 실측에서
가장 큰 미지원 덩어리 두 개**를 덮으려고 추가했다 (`docs/ADAPTER-COVERAGE.md` §1①·§7).

| 어댑터 | write | 덮는 대상 | 규모 |
|---|---|---|---|
| `chrome-locales` | 재생성 | bugshot-2 (`public/_locales/`) + 오픈소스 34개 | 4키 × ko/en/fr — 스토어 메타데이터뿐이다 |
| `json-catalog` | 재생성 | bugshot-web (중첩), skillflo + 오픈소스 38개 | 102리프 × 2 / **1446키 × 6** |
| `ts-dict` | 수술적 치환 | bugshot-2 (`src/i18n/namespaces/*.ts`) — **명시 지정 전용** | **903키 × ko/en/fr** |
| **`yaml-catalog`** | 수술적 치환 | 오픈소스 **17개** (mastodon 106로케일·decidim 82·directus 69·redmine 50·misskey 42) | — |
| **`code-dict`** | 수술적 치환 | 오픈소스 **12개** (ant-design 73로케일·element-plus 67·vuetify 43·payload 40) | — |

**경로 모양은 어댑터와 별개 축이다** (2026-09-02 추가). `json-catalog`·`yaml-catalog`이 read·write를
그대로 쓰고 `pathTemplate`만 다르므로 어댑터를 새로 만들지 않았다 — 홀드아웃 20개 중 9개가 아래
두 새 모양이었다 (`docs/ADAPTER-COVERAGE.md` §0 3차):

| 모양 | 어댑터 | 예 |
|---|---|---|
| `{dir}/{locale}.<ext>` | 전부 | 원래 형태 |
| `{dir}/{locale}/<name>.json` — 로케일이 디렉터리 | `json-catalog` | grafana `public/locales/{locale}/grafana.json`, zulip `locale/{locale}/translations.json` |
| `{dir}/<prefix><sep>{locale}.<ext>` — 접두사 붙은 파일명 | `json-catalog`·`yaml-catalog` | discourse `config/locales/client.{locale}.yml`, gitea `options/locale/locale_{locale}.json` |

`chrome-locales`가 애초에 둘째 모양의 특수 사례(`_locales/{locale}/messages.json`)다 — 리프가
`{ message, description }` 객체라 read·write가 달라서 별 어댑터로 남는다.

**로케일 디렉터리에 파일이 여럿이면 디렉터리당 하나만 고른다.** `Project`가 포맷을 하나만 들기
때문이고(§6), 그래서 Ghost의 네임스페이스 5개 중 1개만 덮는다 — 표면을 나누려면 프로젝트를
나눈다 (§7).

미지원으로 남는 것: `.po`(gettext), `.arb`, `.strings`, `.properties`, Fluent(`.ftl`), 줄 단위 텍스트,
소스 코드 내장(primevue), 자체 포맷(darkreader `.config`), 빌드 시 외부 다운로드(home-assistant).
실측 129개(학습 109 + 홀드아웃 20)에서 각 1~3개였다.

**`ts-dict`를 범위에 넣은 이유**: bugshot-2의 `_locales` 4키는 스토어 메타데이터일 뿐이고 실제 UI 번역은 903키다 — MVP §9가 왕복 검증 대상으로 지정한 리포를 **0.4%로만 검증**하고 있었다. 8파일 구조가 완전히 규칙적이라(`const ko/en/fr` + `as const`/`satisfies Bundle` + `export const <ns> = { ko, en, fr }`, 값이 전부 문자열 리터럴·표현식 0건) 어댑터 하나로 끝난다 — "리포마다 형태가 달라 안 끝난다"던 앞선 판단이 실물 확인 전의 추측이었다.

**어댑터 설정은 `Project` 컬럼에 저장한다** (`adapterName`·`pathTemplate`·`nested`·`baseLocale` — 마이그레이션 `_add_project_locale_format`). `detect`는 순수 함수라 CLI가 매번 찾아내지만, pull이 파일을 쓰려면 포맷을 알아야 하고 그것을 아는 시점이 push다. **한 리포에 포맷이 둘 이상이면 탐지 우선순위가 큰 쪽을 놓칠 수 있으므로 명시 지정(`--adapter`)이 이긴다** — bugshot-2가 그렇다(`_locales` 4키 vs `ts-dict` 903키).

### 5.2 사용처 스캔은 진실이 아니다

코드 스캔의 출력은 **`refs`뿐**이다. 키가 존재하는지는 적재 층이 이미 정했다.

- 스캐너가 못 찾은 키는 **경고**다 — 동적으로 조립됐거나(`getMessage(\`k_${x}\`)`) 아직 안 쓰이는 키다. 컨텍스트가 빠질 뿐 적재는 정상이다
- 코드가 참조하는데 로케일 파일에 없는 키도 **경고**다 — 개발자가 파일에 추가하는 것을 잊었다는 신호지만, 우리가 남의 CI를 실패시킬 근거는 아니다
- **래퍼 함수 지원은 선택사항이다.** 대상 리포에 `t(key, ...)` 류가 있으면 `--wrapper <module>#<export>`로 알려줄 수 있다. **이름만으로 매칭하지 않는다** — bugshot-2가 하필 `@/i18n#t`를 쓰고 있어 기본값 추측이 오탐 1391건을 냈다

## 6. 스키마 (5테이블)

```
Project      id PK, slug UNIQUE, name,
             repoOwner, repoName, baseBranch, installationId?   -- 테넌트 경계
             adapterName?, pathTemplate?, nested?, baseLocale?  -- push가 저장, pull이 읽는다
             lastCommitSha?, lastCommitAt?                      -- 역행 거부 (§3.1)
             lastPulledAt?                                      -- DB 측 스킵 (§3.3)
Locale       (projectId, code) PK, name, isBase
StringKey    id PK, projectId FK, key, namespace, sourceText, sourceHash,
             description, orphaned, updatedAt
             -- UNIQUE(projectId, key) / UNIQUE(projectId, id)
KeyRef       id, keyId FK, path, line              -- push마다 전체 교체
Translation  id PK, projectId, keyId, localeCode, value, needsReview,
             updatedBy, updatedAt                  -- UNIQUE(keyId, localeCode)
             -- FK (projectId, keyId) → StringKey(projectId, id)
             -- FK (projectId, localeCode) → Locale(projectId, code)
```

`namespace`는 키에서 파생되는 값이지만 **컬럼으로 저장하고 인덱스를 건다** — 사이드바 쿼리가 이거 하나로 끝난다. 인덱스는 전부 `projectId` 선두 복합이다(모든 조회가 프로젝트로 먼저 좁혀진다).

**`Translation.projectId`는 비정규화가 아니라 테넌트 격리다.** `keyId`·`localeCode`를 독립 FK로 두면 프로젝트 A의 키에 B의 로케일을 붙인 행을 DB가 허용한다. 두 FK가 같은 `projectId` 컬럼을 공유해 그 조합을 불가능하게 만든다.

## 7. 명시적 비범위

**요청받아도 먼저 이 목록을 근거로 되묻는다.** PoC 범위를 지키는 게 이 프로젝트의 성패다.

원래부터 비범위: ICU 복수형·성별 변화, 동시 편집(락·CRDT), 세밀한 권한, in-context 편집(오버레이).

**다중 프로젝트/리포 — 2026-08-31 부분 해제.** SaaS를 염두에 두고 **스키마의 테넌트 경계만** 들였다 (`Project` 테이블 + `projectId` FK + 복합 unique·복합 PK). 근거는 비용 비대칭이다: 이 두 제약은 나중에 바꾸면 실데이터 이관이 되는데(그리고 dev DB가 곧 prod DB다), 나머지 SaaS 요소는 전부 additive로 붙는다.

**여전히 비범위인 것**: 테넌트별 인증·인가(멤버십·역할), 과금, 온보딩, 프로젝트 전환 UI, 테넌트별 GitHub App 설치 플로. 인증은 `AUTH_ALLOWED_LOGINS`(허용 GitHub 핸들 목록) 하나로 단일 테넌트로 남고, 운영 대상은 `ACTIVE_PROJECT_SLUG`가 가리키는 프로젝트 하나다. **아이디어 검증 후 인증·인가부터 고도화한다.**

⚠️ **그 단일 테넌트 가정이 push 라우팅에도 걸려 있다** — `/api/push`는 페이로드에 프로젝트 식별자가 없고 서버의 `ACTIVE_PROJECT_SLUG`로 대상을 정한다. 리포가 둘 이상 CI를 붙이면(§8-7) 한쪽 페이로드가 다른 프로젝트에 적용된다. 실 DB에 이미 프로젝트가 둘이라 7단계 전에 정해야 한다 (§10).

MVP 범위를 잡으면서 추가로 뺀 것: **편집 UI의 키 추가·삭제, 로케일 추가·삭제**(리포가 정한다 — §3.2), 스크린샷 첨부, 번역자 노트 필드, draft→reviewed 승인 워크플로(편집자가 한 명이라 오버엔지니어링), push 웹훅 즉시 반영, 번역 메모리·기계번역.

## 8. 구현 순서

**태스크 단위 체크리스트와 완료 조건은 [TASKS.md](./TASKS.md)에 있다.** 이 절은 순서와 그 근거만 담는다 — 단계 구성을 바꾸면 두 문서를 함께 고친다.

1. ~~**Prisma 스키마 + Supabase 연결**~~ ✅ 완료 (`20260831012453_init`, 리전 `ap-northeast-1`. `Project` 경계는 뒤이은 `_add_project_tenant_boundary`)
2. ~~**결정적 export + `lib/githash.ts`**~~ ✅ 완료 — 의존성 0의 순수 함수. export는 3단계에서 `lib/adapters/`의 writer로 흡수됐다(`lib/export.ts`는 삭제)
3. ~~**적재 어댑터 + 스캐너 CLI (`lib/adapters/`·`lib/scan/`)**~~ ✅ 완료 — 실제 리포에 돌려 결과를 눈으로 확인
4. ~~**`/api/push`**~~ ✅ 완료
5. **Auth + 편집 UI** — 5a·5b·5c 완료, 5d(필터) 남음
6. ~~**GitHub App + `/api/pull`**~~ ✅ 완료 (2026-09-01 — 실물 7회차 검증. **왕복의 머지 이후 절반은 미검증**)
7. **Actions 워크플로 + Vercel Cron** ← **현재 단계**

2번을 먼저 하는 이유: 결정적 export와 blob SHA가 틀리면 3~7번이 전부 무의미해지는데, 이 둘만은 순수 함수로 완전히 검증할 수 있다.

## 9. 실전 검증

셋업 완료 후 **`~/code/bugshot-2`** 리포로 push→편집→pull 왕복을 돌린다. 로케일이 ko/en/fr 3개라 다중 로케일 export 검증에 적합하다.

**2026-09-01 실행됨 — 다만 대상은 사본이다.** 남의 리포에 커밋을 남기지 않기 위해 일회용 private 리포(`bugshot-i18n-test`)에 `dev`를 그대로 push하고 `Project.repoName`만 바꿔 돌린 뒤 되돌렸다. `l10n/sync` 브랜치만 리셋하면 초기 상태가 되므로 회차당 1초다. 7개 시나리오(기본·다중 파일·이스케이프·긴 값·orphaned·907키 전면·base 로케일)를 돌려 diff 품질과 **대상 리포 `tsc` 통과**를 확인했다. 상세는 `docs/features/pull-to-pr/tasks.md` §4.

**미검증으로 남은 것**: PR 머지 → push → DB 일치(사용자 결정으로 범위 밖 — **손실 창이 닫혔다는 것은 실증되지 않았다**), 재생성 어댑터의 실물 pull.

`/l10n-roundtrip` 스킬은 아직 만들지 않았다 — 위 루프가 임시 스크립트로 돌아갔고, 반복할 일이 생기면 그때 스킬로 굳힌다.

## 10. 아직 안 정한 것

- **로케일 목록의 정본** — `Locale` 테이블 시드를 대상 리포의 `_locales/` 스캔으로 자동 생성할지, 수동 등록할지
- **테넌트별 인가로 넘어가는 시점** — 스키마 경계는 있지만 인증은 단일 테넌트다. 실제 고객이 둘 이상 되는 시점에 `Member`·`Role` 테이블과 DB 세션(`@auth/prisma-adapter`)이 필요해진다. JWT 세션 결정(§5)이 그때 뒤집힌다
- **dev/prod DB 분리** — Supabase 인스턴스가 하나뿐이라 `migrate dev`가 프로덕션을 직접 바꾼다. 번역 데이터가 쌓이기 전에 두 번째 프로젝트를 만들어 분리할지 결정해야 한다
