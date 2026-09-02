# TASKS

**`docs/MVP.md` §8 구현 순서를 완료 조건이 붙은 체크리스트로 펼친 것이다.** 여기엔 *무엇이 되면 끝인가*만 있다 — 무엇을 만드는지는 [MVP.md](./MVP.md), 왜 그렇게 만드는지는 [ARCHITECTURE.md](./ARCHITECTURE.md).

**이 문서는 진행 상태를 담으므로 코드보다 먼저 낡는다.** `/push` 4단계 문서 신선도 검사가 이 파일을 트라이아지 대상에 포함한다 — 태스크를 완료했으면 체크하고 근거(커밋·테스트·산출물)를 남긴다. 체크되지 않은 항목은 "안 된 것"으로 취급한다.

규칙:
- 체크는 **검증 조건이 실제로 통과했을 때만** 한다. "코드를 썼다"는 완료가 아니다.
- `🔒` 표시는 **착수 전 사용자 결정이 필요한 항목**이다 (MVP.md §10과 연동). 결정 없이 진행하면 나중에 뒤집힌다.
- 커밋 경계(`——`)를 지킨다. `/ship`이 이 분리를 커밋 단위로 쓴다.

---

## 1. Prisma 스키마 + Supabase 연결 ✅

- [x] `prisma/schema.prisma` 4테이블 — `Locale`·`StringKey`·`KeyRef`·`Translation`
  - 검증: `npx prisma validate` 통과
- [x] 마이그레이션 생성·적용 — `20260831012453_init`
  - 검증: `pnpm db:status` → `Database schema is up to date!`
- [x] `Translation` 외래키 `ON DELETE RESTRICT`
  - 검증: `migration.sql`에 `ON DELETE RESTRICT` 2건 (키 삭제를 DB가 거부한다)
- [x] `UNIQUE(keyId, localeCode)`
  - 검증: `migration.sql`에 `Translation_keyId_localeCode_key`
- [x] 런타임 접속 (`lib/db.ts`, transaction pooler 6543)
  - 검증: 4테이블 `count()` 조회 성공
- [x] 마이그레이션 접속 (`prisma.config.ts`, session pooler 5432)
  - 검증: 위 `db:status`

---

## 1.5 Project 테넌트 경계 ✅ (2026-08-31 범위 추가)

MVP §7의 "다중 프로젝트/리포" 부분 해제. **스키마 경계만** — SaaS 기능은 없다.

- [x] `Project` 테이블 + `projectId` FK
  - 검증: `20260831033609_add_project_tenant_boundary` 적용, `pnpm db:status` up to date
- [x] `StringKey` 키 이름이 프로젝트 안에서만 유일
  - 검증: 두 프로젝트가 같은 `common.ok`를 갖는 것을 실 DB에서 확인
- [x] `Locale` 복합 PK, `Translation` 복합 FK
  - 검증: 위와 같은 마이그레이션
- [x] **테넌트 간 참조를 DB가 거부**
  - 검증: A의 키 + B의 로케일 insert가 `Foreign key constraint`로 거부되는 것을 실 DB에서 확인
- [x] 인덱스를 `projectId` 선두 복합으로 교체
  - 검증: `migration.sql`의 DropIndex 3건 + CreateIndex 3건
- [x] 리포 설정을 env → `Project` 컬럼으로 이전
  - 검증: `.env.example`에서 `TARGET_REPO_*`·`GITHUB_APP_INSTALLATION_ID` 제거, `ACTIVE_PROJECT_SLUG` 추가
- 커밋: `ab4ac2c` (schema+migration)

**여전히 비범위**: 테넌트별 인증·인가, 과금, 온보딩, 프로젝트 전환 UI. 아이디어 검증 후 인증·인가부터.

---

## 2. `lib/githash.ts` + 결정적 export ✅

> **2026-08-31**: `lib/export.ts`는 3a의 어댑터 writer로 흡수돼 삭제됐다. 결정성 규칙은 `lib/adapters/shared.ts`가, 테스트는 `lib/adapters/__tests__/adapters.test.ts`가 이어받았다 (커버리지 8건 이관).

**의존성 0의 순수 함수.** 이 둘이 틀리면 3~7단계가 전부 무의미해진다. `/tdd`로 테스트부터 쓴다.

### 2a. `lib/githash.ts` ✅

- [x] `blobSha(content: string): string` — `sha1("blob <byteLength>\0" + content)`
  - 검증: 골든 5건 (빈 문자열·ASCII·한글·이모지·실제 `messages.json` 형태) — `lib/__tests__/githash.test.ts`, 22 tests green
  - 추가: **골든 자체를 `git hash-object --stdin` 실측과 재대조하는 자기검증 앵커** (박제된 상수가 낡는 것을 잡는 유일한 장치)
- [x] 바이트 길이가 `Buffer.byteLength(content, "utf8")`이다
  - 검증: 한글(문자 5/바이트 15)·이모지(코드 유닛 2/바이트 4) 케이스 통과. `Buffer.from(content, "utf8").byteLength` 사용
- 커밋: `4f11488` (test, red) → `dfd13bf` (feat)

### 2b. 결정적 export ✅ → `lib/adapters/shared.ts` + 어댑터 writer로 이동

- [x] `exportLocale(keys, { isBase }): string | null` — DB 상태 → `messages.json` 문자열
  - 검증: 19 케이스 green (`lib/__tests__/export.test.ts`), 전체 41 tests
- [x] 키 정렬이 **환경에 의존하지 않는다** (`<` 비교 = UTF-16 코드 유닛 순서)
  - 검증: `a A ä _x B b z Z 1` 입력에서 `1 A B Z _x a b z ä` 고정. localeCompare는 `_x 1 a A ä b B z Z`로 **완전히 다르고** Node ICU 빌드에 의존한다
- [x] 정렬한 순서로 객체를 **재조립**한다 (DB 순서에 의존하지 않는다)
  - 검증: 입력 배열을 역순으로 넣어도 출력이 바이트 동일
- [x] 들여쓰기 2칸, 파일 끝 개행 **정확히 1개**
  - 검증: 마지막 3바이트가 `10 125 10`(LF·`}`·LF)임을 런타임으로 확인
- [x] `orphaned` 키 제외
  - 검증: orphaned가 출력에 없고, 남은 키가 orphaned뿐이면 `null`
- [x] **같은 입력 두 번 호출 → 바이트 단위 동일**
  - 검증: `Buffer.equals`로 비교
- [x] `description`이 있으면 포함, 없으면 필드 자체를 생략 (`null`도 생략)
  - 검증: 출력에 `undefined`가 새지 않음. **non-base에는 넣지 않는다**(원문 메타데이터)
- [x] **빈 로케일은 파일을 내지 않는다** (2026-08-31 결정 — 🔒 해소)
  - 검증: 번역 0건·빈 문자열·키 0개 각각 `null` 반환
- [x] 미번역 키는 non-base 파일에서 제외 (같은 원칙의 파생 — 크롬이 폴백한다)
  - 검증: 번역 없는 키가 non-base 출력에 없음
- [x] `exportLocale` + `blobSha` 조합이 `git hash-object`와 일치
  - 검증: export 출력을 `git hash-object --stdin`에 넣어 `blobSha`와 대조 (2a·2b 접점)
- [x] JSON 이스케이프 + 한글·이모지를 그대로 낸다 (`\u` 이스케이프 없음)
  - 검증: `JSON.parse` 왕복 + `\u` 부재 확인
- 커밋: `cf3ea2e` (test, red) → `fbccddc` (feat)

—— ARCHITECTURE §1·§2의 `(미구현)` 표시 제거 완료

---

## 3. 로케일 적재 + 사용처 스캔 ✅

> **2026-08-31 범위 전환.** "코드 스캔이 유일한 진실"에서 **"리포의 로케일 파일이 키의 진실, 코드 스캔은 `refs` 전담"** 으로 뒤집혔다 (MVP §3.1·§4·§5.1). 사용자 스토리의 시작이 "리포를 연동하면 키가 적재된다"이고, 코드 스캔을 진실로 두면 대상 리포의 전면 리팩터링이 선행 조건이 되기 때문이다.

### 3a. 양방향 어댑터 (`lib/adapters/`) ✅

- [x] 통합 인터페이스 — `detect` / `read` / `write`
  - 검증: 98 tests green
- [x] `chrome-locales` — `_locales/{locale}/messages.json`, 리프 `{message, description?}`
  - 검증: bugshot-2 적재 (4키 × ko/en/fr, description 3건)
- [x] `json-catalog` — `{dir}/{locale}.json`, flat·중첩 모두
  - 검증: bugshot-web (104키 × 2, 중첩·배열), skillflo (**1446키 × 6로케일, 36 네임스페이스**)
- [x] 중첩 평탄화(`.`) + write에서 복원, 배열은 인덱스 키(`hero.subcopy.0`)
  - 검증: `0..n` 빈틈없으면 배열로 복원, 빈틈 있으면 객체 유지(구멍이 `null`로 나가는 것을 막는다)
- [x] 결정성 규칙을 `shared.ts`로 모아 **모든 재생성 writer가 지나게** 한다
  - 검증: 정렬(`<` 비교)·재조립·2칸·끝 개행 1개·orphaned 제외·미번역 제외·0개면 `null`
  - ⚠️ **`ts-dict`는 이 관문을 지나지 않는다** — 수술적 치환이라 원본 순서·공백·주석을 보존하고 orphaned 키도 파일에 남긴다 (ARCHITECTURE §1.4). "모든 writer"라는 전칭 서술을 보면 낡은 것이다
- [x] `ts-dict` — 수술적 치환 writer (`src/i18n/namespaces/*.ts`, `multi-locale`)
  - 검증: 값만 바뀌고 빈 줄·주석이 보존됨. `JSON.stringify`로 이스케이프(`setLiteralValue`는 백슬래시·개행을 깨뜨린다), export된 묶음 객체를 로케일로 오인하지 않음
  - 근거: bugshot-2의 실제 UI 번역이 903키다 — `_locales` 4키만 다루면 §9 검증 대상을 0.4%로만 덮는다
- [x] **왕복 검증** — 읽고 쓰면 의미가 같다
  - 검증: 3개 리포 **11개 로케일 파일 전부 의미 동일**. 바이트 차이는 원본이 정렬돼 있지 않아서이고 첫 pull에서 한 번 정규화된다(재생성 어댑터에 한함 — `ts-dict`는 바이트도 보존된다)
- [x] 포맷 탐지 — 경로 신호 + 로케일 개수 + `probe` 내용 확인
  - 검증: `public/search/{locale}.json`(검색 인덱스)을 잡던 결함 회귀 테스트 4건
- [x] `pnpm ingest <dir>` CLI — 탐지·적재·왕복 판정
- [ ] 🔒 **base 로케일 판정** — 지금은 `en` 우선, 없으면 사전순 첫 번째. 리포 관례라 추정이다 (MVP §10)

### 3b. 사용처 스캔 (`lib/scan/`) ⬜ — `refs` 전담, 경고만 (**훅 기반 미지원**)

> **🔴 2026-08-31 실전에서 발견: 훅 기반 i18n을 못 잡는다.** import 기반 매칭이라 `import { t }` 패턴만 본다. 실측:
>
> | 리포 | 호출 형태 | refs |
> |---|---|---|
> | bugshot-2 | `import { t } from "@/i18n"` | 115키 / 273건 ✅ |
> | skillflo | `const { t } = useI18n()` | **0** ❌ |
> | bugshot-web | `const t = await getTranslations({ namespace: "meta" })` | **0** ❌ (키가 namespace 상대) |
>
> `refs`가 컨텍스트 기능의 전부다(MVP §3.2 "성패가 여기 달렸다"). 3개 중 2개가 0건이면 기능이 없는 것과 같다. next-intl·react-i18next가 전부 훅 기반이라 "범용적"이라는 목표와 정면으로 어긋난다.
>
> **영향 범위는 컨텍스트 축 하나다.** 층 분리(적재=진실, 스캔=`refs`) 덕분에 **적재·편집·pull은 3개 리포 모두 정상 동작한다** — 죽는 것은 permalink뿐이다. 즉 적재는 4/4, 컨텍스트는 1/3.
>
> **6단계를 막지 않는다**: §9 왕복 검증 대상인 bugshot-2는 `refs`가 이미 나온다. 데드라인은 skillflo 실사용 직전이다.
>
> **아래 두 항목은 한 세트다.** 훅 지원만 해소하면 skillflo만 살아나고, bugshot-web(next-intl)은 키가 namespace 상대라 `t("title")`을 잡아도 `meta.title`로 잇지 못해 여전히 0이다.

- [ ] 🔴 **훅 기반 호출 지원** — `const { t } = useI18n()` / `const t = useTranslations()`
  - 필요: 훅 import를 찾고 그 반환값의 지역 바인딩 이름(구조분해·직접대입)을 추적해 그 스코프 안의 호출을 매칭
- [ ] 🔒 **namespace 상대 키 지원 여부** — next-intl의 `getTranslations({ namespace: "meta" })` + `t("title")` → 실제 키 `meta.title`. 인자에서 namespace를 해석해야 하고 리터럴 케이스만 지원할지 결정 필요

- [x] AST 경로 (ts-morph) — 주석·문자열 안의 호출을 구분
  - 검증: 라인/블록 주석·문자열 리터럴 3케이스. 자기 리포 스캔이 0키(테스트 파일이 문자열로 `t(...)`를 담고 있다)
- [x] **래퍼를 모듈 경로 + export 이름으로 식별**
  - 검증: bugshot-2에서 이름만 매칭했을 때 오탐 1391건 → import 기반으로 0건. 별칭(`t as translate`)도 따라간다
- [x] `--wrapper <module>#<export>`로 설정 가능
  - 근거: bugshot-2의 래퍼가 하필 기본값 `@/i18n#t`와 같다. 대상 리포 관례를 알 수 없다
- [x] `__MSG_key__` 정규식 경로가 **파일 종류와 무관하게** 돈다
  - 검증: `manifest.config.ts`(`.ts`인데 토큰 5개)가 누락되던 결함 회귀 테스트
- [x] `refs`의 `path`·`line` 정확, 정렬 출력
- [x] `// @l10n-keys` 화이트리스트, `namespace` 파생, 키 문자셋 검증
- [x] **에러 → 경고로 격하** — `ScanResult`에 `errors` 필드가 아예 없고 `pnpm scan`은 항상 exit 0
  - 검증: bugshot-2에서 **0키/에러 1391건 → 115키/참조 273건/경고 9건/exit 0**. 경고 9건은 그 리포의 실제 동적 키
- [x] 출력을 `refs`로 좁힘 — `sourceText`·`namespace`·`description`을 돌려주지 않는다
  - 근거: 원문·키 존재·키 이름 합법성이 전부 어댑터 소관이 됐다. 스캔이 원문을 들면 진실이 둘이 된다
- [x] `chrome.i18n.getMessage("k")` 직접 호출 지원 (래퍼 없는 리포)
  - 검증: `EXT_NAME_SHORT`이 manifest 2곳 + `src/background/index.ts:47` 3곳에서 잡힘
- [x] `namespace` 파생을 어댑터 층으로 이동 (`namespaceOf` — 점·밑줄 둘 다)
- [x] 같은 `path:line` 중복 접기 (AST·정규식 양쪽에 걸릴 수 있다)
- 커밋: `3931164` `9ad8dbe` `7588ba6` `3c04660`

---

## 4. `/api/push` ✅

- [x] Bearer `PUSH_TOKEN` 검증, **fail-closed**
  - 검증: 헤더 없음·틀린 토큰·환경변수 미설정(빈 문자열 포함) 전부 거부. 미설정은 500(서버 설정 문제), 나머지는 401. 어느 쪽이 틀렸는지 응답에 노출하지 않는다
- [x] Zod로 페이로드 검증
  - 검증: 40자 hex 아닌 `commitSha`, `locales`에 없는 `baseLocale`, 미등록 어댑터, 미선언 로케일의 번역, 양의 정수 아닌 `line` 전부 400. **키 0개도 거부** — 스캔이 조용히 실패하면 전 프로젝트가 orphan된다
  - `pathTemplate`에 `{locale}`을 **요구하지 않는다** — `multi-locale` 어댑터(`ts-dict`)는 글롭이다 (ARCHITECTURE §1.1)
- [x] upsert — 키·원문·`sourceHash`·description·namespace
  - 검증: 실 DB 1446키 → insert 1446 / 재전송 시 insert 0, update 1446
- [x] 스캔에 없는 키 → `orphaned = true`, 돌아오면 `false`
  - 검증: 절반 제거 시 orphan 723 / **총키 1446 유지(삭제 안 됨)** / 번역 2892 살아있음 → 되돌리면 unorphan 723, 남은 orphaned 0
- [x] `sourceHash` 변경 → base 아닌 번역에 `needsReview = true`
  - 검증: 10키 원문 변경 → ko 10건, **en(base) 0건**. 판정은 `sourceHash`로만 — description·namespace 변경은 전파하지 않는다(필터가 노이즈가 된다)
- [x] `KeyRef` 전체 교체
  - 검증: refs 5건만 보냈을 때 DB 5건 (이전 1446건이 남지 않는다)
- [x] **번역값 strict 덮어쓰기** — 리포 값으로 DB를 갱신한다 (`ON CONFLICT DO UPDATE`, MVP §3.1)
  - 검증: 편집한 값이 변경 없는 리포 값으로 덮이고, 바뀐 리포 값이 전파되는 것을 실 DB로 확인 (커밋 `e7055c7`)
  - ⚠️ **2026-08-31 두 번 뒤집힌 자리다**: "값을 어떤 경로로도 안 건드림" → `DO NOTHING`(콜드 스타트) → strict. 앞의 둘을 서술한 문서를 보면 낡은 것이다
  - 대가: 편집 손실 창 (MVP §3.1). 방어는 pull 주기뿐이고 **6단계 전까지는 방어가 0이다**
- [x] `commitSha` + 어댑터 설정을 `Project`에 저장
  - 검증: `adapterName`·`pathTemplate`·`nested`·`baseLocale`·`lastCommitSha` 저장 확인. 마이그레이션 `20260831050156_add_project_locale_format` (additive)
- [x] 실제 영향 행수를 보고한다 (후보 수가 아니다)
  - 근거: 재전송에서 "번역 2892건 채움"으로 거짓 보고하던 것을 트랜잭션 결과에서 읽어 0으로 고침
- 성능: 1446키 + 2892번역 + 1446refs → **약 1.6초** (라우트 한도 60초)
- 구현 제약: transaction 모드 pooler라 대화형 트랜잭션 불가 → 배열형 `$transaction([...])` + `unnest()` 벌크
- [ ] 🔒 **키 id 형식** — raw SQL이라 `randomUUID()`로 만든다. 스키마의 `@default(cuid())`는 Prisma 클라이언트가 적용하는 값이라 raw에는 안 온다. 혼재해도 무해하지만 통일할지 결정 필요
- 커밋: `dbcfd10` (schema) → `1522544`(spec) → `b9c2e53` (test+feat) → `e7055c7` (strict 전환)

### 4b. 오배송·역행 거부 ✅ (2026-08-31 결정 — 🔒 해소, **7단계 전 필수**)

> 둘 다 **거부이지 병합이 아니다** — 어긋난 요청을 반영하려 들면 diff 동기화가 되어 §2를 깬다. 실 DB에 프로젝트가 이미 둘이라 두 번째 리포를 붙이는 순간이 첫 사고 지점이다.

- [x] 페이로드에 `projectSlug` — 서버의 `ACTIVE_PROJECT_SLUG`와 다르면 **409**
  - 근거: 대상 지정을 서버 env에만 맡기면 오배송된 페이로드가 남의 프로젝트 키를 전부 orphan시키고 이물 키를 삽입하는데, `toDelete`가 없고 FK가 `RESTRICT`라 **지울 수 없다**
  - 프로젝트별 `PUSH_TOKEN`은 쓰지 않는다 — 토큰↔프로젝트 매핑을 어딘가 둬야 하고 시크릿이 프로젝트 수만큼 는다
  - 검증: `checkProjectSlug` 8케이스(`lib/push/__tests__/guard.test.ts`) + **dev 서버 실측** — 불일치 `409 {"error":"project mismatch","expected":"bugshot-2","got":"not-this-project"}`. **미인증 요청은 401이고 프로젝트 정보가 새지 않는다**(가드가 인증 뒤에 있다)
  - 남은 것: Actions가 slug를 보내는지는 7단계에서 확인
- [x] 페이로드에 `commitAt` — `Project.lastCommitAt`보다 과거면 **409**
  - 근거: strict라 오래된 run의 Re-run이 DB를 그 시점으로 되돌린다(키 orphan + 번역값 회귀 + permalink가 옛 SHA)
  - **같은 커밋 재전송은 통과시킨다** — strict라 결과가 같고 스캐너를 고쳐 다시 올리는 건 정당하다. 그래서 기준이 `commitSha` 동일성이 아니라 시각 역행이다
  - GitHub API 조상 확인은 쓰지 않는다 — 지금 GitHub을 안 부르는 라우트에 App 토큰·왕복이 들어온다. Actions가 `git show -s --format=%cI`로 공짜로 얻는다
  - 검증: `checkCommitOrder` 7케이스(과거·1ms 과거·같은 시각·미래·null·타임존·Invalid Date) + 형식 위반이 **400**임을 실측(409와 구분된다 — 형식 오류는 상태 충돌이 아니다)
  - ⚠️ **역행 409의 라우트 실측은 못 했다.** `lastCommitAt`을 세우려면 200 경로를 한 번 돌려야 하고 strict라 그것이 실 DB의 편집을 리포 값으로 덮는다. 오배송 경로로 배선(같은 `guardStatus`)이 도는 것은 확인했고, **끝단 확인은 7단계 왕복 검증에서 한다**
- [x] 마이그레이션 — `Project.lastCommitAt` (additive, nullable)
  - 검증: `20260831080435_add_project_last_commit_at`, SQL은 `ADD COLUMN` 한 줄. `db:deploy` 적용 후 `db:status` up to date
- 커밋: `dc08503`(test) → `c5488db`(feat) → `ea5a565`(refactor) → `74b4d7d`(db)

---

## 5. Auth + 편집 UI ⬜ ← **현재 단계** (5a·5b·5c 완료 / 5d 남음)

### 5a. Auth ✅

- [x] **인가 모델 결정 — 허용 핸들 목록** (🔒 해소, 2026-08-31)
  - 근거: 대상이 개인 계정 리포(`SinhyeokKang/i18n-poc`)라 org 멤버십이 존재하지 않는다. 핸들 목록은 개인·org 양쪽에서 동작하고 org API 호출이 사라진다. 실제 org를 쓰면 OR로 더한다
- [x] Auth.js v5 GitHub provider, JWT 세션 `maxAge` 24h
  - 검증: `pnpm build`에 `/api/auth/[...nextauth]`·`/keys` 라우트 등록
- [x] `isLoginAllowed` — **`AUTH_ALLOWED_LOGINS`가 비면 전원 거부**
  - 검증: 13케이스. 미설정·빈 문자열·공백만 전부 거부. 대소문자 무시, 부분 일치 거부, **빈 항목을 이중으로 차단**(`"a, ,b"`가 빈 login을 통과시키는 구멍)
- [x] 인가를 `signIn` 콜백에 둔다
  - 근거: 레이아웃에만 두면 새 라우트가 상속을 잊을 수 있다. 세션 존재 자체가 "허용 목록 통과"를 뜻하게 만든다
- [x] 핸들을 토큰에 실어 `session.user.login`으로 노출 (`types/next-auth.d.ts`)
  - 근거: `Translation.updatedBy`가 쓰고, 사용자 테이블이 없어 문자열로 박는다
- [x] 보호된 셸 — 로그인 화면 / 헤더 + 로그아웃
  - 검증: DESIGN.md 체크리스트 8항 전부 통과 (`dark:` 0, `bg-destructive` 0, 임의값 0, 새 raw 색 0, 포커스 링 유지)
- [x] **차단은 `middleware.ts`가 한다** (레이아웃은 2차 방어로 `redirect()`)
  - ⚠️ 처음엔 반대로 갔다: "미들웨어는 Edge라 `lib/db.ts`를 못 문다"는 **틀린 근거**로 레이아웃 조건부 렌더에 의존했고, 세션 없는 `/keys` 응답 1.3MB에 1446키가 실렸다. 미들웨어는 DB를 물 필요가 없다(JWT 토큰만 본다) — `docs/POSTMORTEM.md` 2026-08-31
  - 검증: 응답 **본문**을 본다 — `curl -s <라우트> | grep <민감 데이터>`가 0건. 화면으로는 절대 안 보인다
  - **새 보호 라우트를 추가하면 `matcher`에 추가한다**

### 5b. UI — 편집 가능 테이블 ✅

> **2026-08-31 형태 변경**: 로케일별 화면 → **테이블** `| key | en(base) | ko | fr |`, 모든 셀 편집 가능. 원문과 번역을 나란히 봐야 하고 로케일마다 화면을 갈아타면 문맥이 끊긴다 (MVP §3.2).
> **base도 편집 가능하다** — 고정된 것은 키뿐이다. 화면의 base 값은 `sourceText`가 아니라 `Translation`이고, `sourceText`는 stale 판정 전용으로 좁혀졌다.

- [x] 로케일을 열로 펼침, base가 맨 앞
  - 검증: bugshot-2 `key | en(base) | fr | ko`, **907행 × 54 네임스페이스**
- [x] 전 로케일을 쿼리 1회로 (로케일별 6번 쿼리보다 낫다)
- [x] 사이드바 집계에 **기준 로케일** 도입
  - 근거: 로케일이 열이면 "남은 일"이 로케일마다 다르다. base는 대개 채워져 있어 기본값은 base가 아닌 첫 로케일
- [x] 헤더 글자를 `text-foreground/60`으로 (§2.2 — muted 표면 위 `text-muted-foreground`는 4.34:1 미달)
- [x] 넓은 표는 자기 컨테이너에서만 스크롤 (`overflow-x-auto`)

### 5b-old. UI 골격 (테이블로 대체됨)

- [x] shadcn 컴포넌트 추가 (`badge`·`select`·`button`·`input`)
  - 검증: `pnpm build` 통과, `/keys` 라우트 등록
- [x] 네임스페이스 사이드바 — 상태별 개수 포함
  - 검증: 실 데이터 **36 네임스페이스**. 총 개수만으로는 "어디에 일이 남았나"를 알 수 없어 미번역·검토필요 개수를 함께 낸다
- [x] 키 리스트 — 키(mono)·원문·description·번역값·작성자
  - 검증: **1446키 / 쿼리 1회 692ms**. 가상화·테이블 라이브러리 없이 순수 렌더
- [x] 배지 4상태 판정 + 우선순위
  - 검증: 실 DB에서 각 상태를 유도해 확인 — 행 삭제·`needsReview`·**빈 문자열**·`orphaned`. 빈 문자열은 미번역이고 `orphaned`가 전부를 이긴다
- [x] 코드 참조 GitHub permalink
  - 검증: `blob/<40자 SHA>/<path>#L<line>`. **SHA가 없으면 `null`** — 브랜치로 대체하면 코드가 움직여 줄 번호가 어긋난다
- [x] 로케일 전환 — base 로케일은 편집 대상에서 제외 (원문 자체다)
  - 검증: skillflo 6로케일 중 편집 가능 5개
- [x] 네임스페이스 필터를 SQL이 아니라 메모리에서
  - 근거: 사이드바가 전 네임스페이스 집계를 필요로 해 어차피 전체를 읽는다. 두 번 읽는 대신 한 번 읽고 나눈다
- [x] 번역을 `where`로 좁힌 1:1로 조회
  - 근거: 6로케일을 전부 싣고 JS에서 고르면 6배를 읽는다
- [x] DESIGN.md 체크리스트 8항 통과
  - 검증: `dark:` 0 / `bg-destructive` 0 / 임의값 0 / 새 raw 색 0 / muted 표면 대비 위반 0 / 키에 `text-mono`

### 5c. 인라인 편집·저장 ✅

- [x] blur 시 Server Action 저장, `updatedBy`에 GitHub 핸들
  - 검증: **브라우저 UI로 `attachment.download`의 en·ko·fr 3셀을 편집해 확인** — 값·`updatedBy`(GitHub 핸들)·`needsReview=false` 전부 반영. **유일한 사용자 mutation** (MVP §3.2)
  - base(en) 편집도 확인 — `sourceText`는 `"Download"`로 남고 `Translation`만 바뀐다 (§3.2 설계대로)
- [x] **⚠️ Server Action이 스스로 인증·인가·테넌트 격리를 한다** (4중 검증)
  - 근거: Action 호출은 페이지를 막는 레이아웃을 **지나지 않는다** — 공개 엔드포인트다
  - 검증: 세션 / zod 입력 / keyId의 프로젝트 소속 / localeCode의 프로젝트 소속
  - 5번째였던 **base 로케일 편집 차단은 설계 변경으로 제거됐다** — base도 편집 대상이다 (MVP §3.2)
  - keyId 소속 확인이 빠지면 **남의 테넌트 키를 수정할 수 있다**. RLS가 없고 인가가 단일 테넌트라 이게 유일한 방어선이다
- [x] **값 지우기는 행 삭제가 아니라 `value=""`**
  - 근거: 행을 지우면 export의 `sourceText` 폴백·미번역 판정이 갈린다. 빈 문자열은 "번역 없음"을 표현하면서 키를 남긴다
- **"지우기"는 미번역으로 되돌리는 조작이고 수명은 다음 push까지다** (2026-08-31 결정 — 🔒 해소, MVP §3.2)
  - export가 미번역을 파일에서 빼므로(§4.1) 빈 값은 리포에 도달하지 못하고, 리포의 옛 값이 다음 push의 `DO UPDATE`로 되살아난다. **코드 변경 없이 화면이 그 사실을 보이게 한다** (5d)
  - 빈 값을 리포까지 내보내는 안은 버렸다 — §4.1의 "미번역 제외"를 뒤집어야 하고, 크롬·TS 딕셔너리 양쪽에서 폴백을 잃어 빈 문자열이 그대로 렌더된다. 입력 거부도 버렸다 — 오역을 지워 비워두려는 정당한 의도까지 막는다
  - ⚠️ 이 항목의 옛 검증("실 DB에서 지운 뒤 push를 돌려 `value=""` 유지 확인")은 **`DO NOTHING` 시절 것이고 지금은 성립하지 않는다**
- [x] 저장 시 `needsReview` 해제 — 편집한 사람이 방금 검토했다
- [x] 같은 값이면 noop — 불필요한 쓰기·`updatedAt` 갱신을 막는다. 클라이언트에서도 왕복 자체를 아낀다
- [x] 공백만 입력은 빈 문자열로 정규화, **값 안의 앞뒤 공백은 보존**
  - 근거: 번역에 의미 있는 공백이 있을 수 있다
- [x] 낙관적 갱신을 쓰지 않는다 — 실패 롤백 복잡도를 MVP §5가 뺐다. 저장 중·실패 상태만 보여준다
- [x] **첫 클라이언트 컴포넌트** — `pnpm build` 게이트가 여기서 처음 일한다
- **`Translation.value`의 쓰기 주체는 둘이다** — 이 Server Action과 push(strict). 셋째가 생기면 어느 쪽이 이기는지 다시 판정해야 하므로 늘리지 않는다
- 커밋: `1184732`(test) → `233a88f`(feat) → `e7055c7`(strict·base 편집)

### 5d. 필터 ⬜

- [ ] 필터 3개 — 미번역 / 검토필요 / orphaned
  - 검증: 각 필터가 기대 집합을 반환. 판정은 `translationState`가 이미 한다. 기준 로케일(`?focus=`)에 따라 집합이 달라진다
- [x] pull 트리거 버튼 (Server Action) — **6단계 3번으로 이관해 구현했다** (`a5bff4d`)
  - 여기 남겨두면 5d가 미완인 채 6단계가 끝나 두 문서가 서로를 기다린다
- [ ] 손실 창 경고를 화면에 노출 (MVP §3.1)
  - 근거: 이 위험을 아는 문서는 MVP.md와 코드 주석뿐인데 **번역자는 둘 다 안 읽는다.** 배너 한 줄이라 §7 비범위를 건드리지 않는다
- [ ] **값을 지우면 "다음 push까지"임을 셀에 표시** (§5c 결정 — MVP §3.2)
  - 근거: 지우기는 리포에 도달하지 못하고 되살아난다. 조용히 되돌아오면 번역자가 도구를 못 믿는다
- [x] `server-only`가 클라이언트 유입을 막는지
  - 검증: `pnpm build` 통과 ✅ (`translation-input.tsx`·`pull-button.tsx` 둘 다 있는 상태에서)

—— 커밋: auth / UI 골격 / 편집·저장 / 필터로 쪼갠다

---

## 6. GitHub App + `/api/pull` ✅ (2026-09-01 — **왕복의 머지 이후 절반만 미검증**)

> 이 체크리스트는 원래 재생성 어댑터만 전제하고 쓰였는데, **§9 왕복 검증 대상인 bugshot-2의 실제 번역 표면이 `ts-dict`(903키)** 라 그 경로를 빼면 검증이 성립하지 않는다. 착수 전 필요했던 결정 둘은 2026-08-31에 났다(아래 두 항목).

- [x] **판정을 두 층으로 — 1층은 DB 측 스킵** (🔒 해소, MVP §3.3) — `lib/pull/run.ts` (`f77bb38`)
  - 그 프로젝트의 `Translation.updatedAt` 최대값이 `Project.lastPulledAt` 이후로 안 움직였으면 **GitHub을 한 번도 부르지 않고 종료**한다. 편집 없는 날이 대부분이라 이게 기본 경로다
  - 근거: `ts-dict`는 write가 원본을 요구해 blob SHA 비교만으로는 호출을 못 아낀다. 이 층은 어댑터 방식과 무관하게 성립하고 재생성 어댑터도 트리 조회를 아낀다
  - 대가: 리포 파일을 직접 고치고 push를 안 돌린 경우를 놓친다(정상 흐름에선 strict push가 DB에 반영해 `updatedAt`이 움직인다)
  - 검증: 편집 없이 두 번 돌려 두 번째가 API 0회. 마이그레이션 `Project.lastPulledAt` (additive)
  - 검증: fake 클라이언트로 **1층 스킵 시 호출 0회**를 확인 ✅ (`lib/pull/__tests__/run.test.ts`). 마이그레이션 `Project.lastPulledAt` 적용 완료 (`36b5245`, `db:deploy`)
- [x] **빈 값은 `ts-dict` write에 넘기지 않는다** (🔒 해소 — §5c와 같은 결정) — `buildWriteEntries`가 유일한 관문 (`a62b675`)
  - 근거: `write`가 `usableEntries`를 지나지 않으므로 빈 값이 오면 소스에 `""`가 박히는데 TS 딕셔너리엔 폴백이 없다. "미번역 제외"만은 호출부가 두 방식에 똑같이 적용해 원본 값이 남게 한다
  - 검증: `value=""`인 키가 있는 상태로 write를 불러 원본 리터럴이 보존됨
  - 검증: `value=""`인 키로 오케스트레이션을 돌려 **원본 리터럴이 보존됨**을 확인 ✅ (`run.test.ts`의 multi-locale 케이스)
- [x] GitHub App installation 토큰 (`octokit`의 `App`) — `lib/github.ts` (`05e4be6`)
  - 검증: 토큰으로 리포 읽기 성공 ✅ `pnpm smoke:github bugshot-2`. App 클라이언트는 **함수 안에서 지연 생성**한다 (POSTMORTEM 2026-08-31, 재발 1회)
- [x] PEM 개행 복원 (`parsePrivateKey`) — `lib/github.ts`가 호출 (`05e4be6`)
  - 검증: `\n`으로 접은 `.env.local` 값으로 JWT 서명 성공 ✅ (스모크가 통과하면 서명이 된 것이다)
- [x] base head SHA + 트리 조회 — `getRefSha`·`getTree` (`05e4be6`)
  - 검증: 로케일 파일의 blob SHA 획득 ✅ 스모크가 `dev` head `baf494ee`(DB `lastCommitSha`와 일치), 트리 1331 blob, **글롭이 `ts-dict` 8파일을 실물에서 매칭**하는 것까지 확인
  - ⚠️ **트리가 잘렸으면(`truncated`) 던진다** — 일부만 보면 base에 있는 파일을 "없다"고 판정해 신규로 올리고 SHA 비교 전체가 틀어진다
- [x] **`multi-locale`은 파일 × 로케일 이중 루프다** (2026-09-01 정정 — 문서가 로케일 축을 빠뜨렸다) — `lib/pull/render.ts` (`f77bb38`)
  - 검증: 두 파일이 각각 자기 원본을 받아 치환되고, 한 파일 안의 로케일 3개가 모두 바뀐다 ✅. 파일 축만 돌면 나머지 로케일이 조용히 원본으로 남는다
- [x] **blob SHA 비교 → 변경 없으면 커밋·PR 경로로 가지 않음** — `planPullChanges` + `run.ts` (`f77bb38`)
  - 검증: 호출 카운트를 세는 테스트 (이게 야간 cron의 기본 경로다)
  - 검증: 2층 전부-동일이면 호출이 `getRefSha`·`getTree` 둘로 끝난다 ✅. **그때도 `lastPulledAt`을 갱신한다** — 안 하면 값 불변 push 뒤 매일 밤 트리를 다시 읽는다
  - ⚠️ **이 층만으로 "API 0회"가 되는 것은 재생성 어댑터뿐이다** — `ts-dict`는 위 DB 측 스킵(1층)이 그 역할을 한다
- [x] `createTree`에 **`base_tree` 전달** — `buildTreePayload` (`251238a`)
  - 검증: 페이로드 조립 함수의 순수 테스트 ✅ 타입 필수 + 빈 문자열 throw (`lib/pull/__tests__/payload.test.ts`)
- [x] `parents: [baseHead]` — `buildCommitPayload` (`251238a`)
  - 검증: 페이로드 테스트 ✅ 반환 타입이 `[string]` 튜플이라 둘째 parent가 컴파일 단계에서 막힌다
- [x] 커밋 메시지에 `[skip-l10n]` — `SKIP_MARKER` 상수 (`251238a`)
  - 검증: 메시지 생성 함수 테스트 ✅ 빈 요약이어도 마커가 남는다
- [x] **ref 인코딩은 `octokit`이 담당한다 — 직접 하지 않는다** (2026-09-01 정정)
  - `encodeRefPath`를 만들어 호출부에서 썼다가 `%252F` 조용한 404를 스스로 만들었다. 실측으로 확인하고 함수를 제거했다 (`9c0cd03`, `docs/POSTMORTEM.md` 2026-09-01)
  - 검증: `pnpm smoke:github`가 `heads/dev`를 읽어 실제 SHA를 받는다 ✅
- [x] **GitHub 클라이언트를 인자로 주입받는다** — `lib/pull/client.ts`의 `GitClient` + `__tests__/fake-client.ts` (`05e4be6`)
  - 검증: fake가 호출을 기록해 `calls.length === 0`으로 "API 0회"를 판정할 수 있다 ✅ (17케이스). **이게 없으면 아래 호출 카운트 항목이 검증 불가다**
- [x] **브랜치 없을 때 `POST /git/refs`, 있을 때 `PATCH` + `force`** — `run.ts` (`f77bb38`)
  - 검증: 두 분기를 fake로 각각 태운다 ✅ (실물 첫 실행은 4단계)
- [x] 열린 PR 재사용, 없으면 생성 — `run.ts` (`f77bb38`)
  - 검증: `openPrUrl`이 있으면 `createPr`을 부르지 않는다 ✅. **조회 `head`는 `owner:branch` 형식**(브랜치명만 넘기면 필터가 조용히 무시된다). 실물 2회차는 4단계
- [x] `CRON_SECRET` 검증, fail-closed — `app/api/pull/route.ts` (`a5bff4d`)
  - 검증: 시크릿 없이·틀린 시크릿 모두 401이고 응답이 구별되지 않는다 ✅ (dev 실측). `checkBearer` 재사용 — 미설정 500은 기존 테스트가 덮는다

### 실물 검증 (2026-09-01, 7회차 루프)

일회용 private 리포(`bugshot-i18n-test`)를 대상으로 `Project.repoName`만 바꿔 돌리고 되돌렸다.
상세는 `docs/features/pull-to-pr/tasks.md` §4.

- [x] diff 품질 — 기본 `+3/-3`, **최대 부하(907키 × 3로케일) 8파일 `+2745/-2745`**.
  `+N/-N` 대칭이 수술적 치환의 증거다(줄 추가·삭제 0)
- [x] **그 상태에서 대상 리포 `pnpm typecheck` 통과** — 단위 테스트가 원리적으로 못 보는 층이다
- [x] 이스케이프(`a"b\c\nd\te`), 400자 값 한 줄 유지, 이모지·中文 보존
- [x] 주석 3개·빈 줄 10개·파일 끝 개행 1개 보존
- [x] orphaned 키 값 불변 / 빈 값이 writer에 도달하지 않음
- [x] 결정성 — **tree SHA 동일성으로 판정한다**(2층 no-op이 아니다. base와 비교하므로 머지 전엔 매번 변경을 낸다)
- [ ] ❌ **PR 머지 → push → DB 일치** — 사용자 결정으로 범위 밖. **손실 창이 닫혔다는 것은 실증되지 않았다**
- [ ] ❌ 재생성 어댑터(`chrome-locales`·`json-catalog`) 실물 pull — 한 프로젝트가 두 표면을 다루는 것은 MVP §7 비범위

—— 커밋: github 래퍼 / pull 엔드포인트로 쪼갠다

---

## 7. Actions 워크플로 + Vercel Cron ⬜

- [ ] **§4b(오배송·역행 거부)가 먼저 서 있어야 한다** — 리포가 둘 이상 CI를 붙이는 순간이 첫 사고 지점이다. Actions가 `projectSlug`와 `commitAt`(`git show -s --format=%cI`)을 보낸다
- [x] **대상 리포 base 브랜치 — `dev`** (2026-09-01 결정 — 🔒 해소, MVP §3.1). bugshot-2의 실제 작업 브랜치이고 `main`은 보호 브랜치다. 첫 실측(적재 커밋이 `dev`에만 존재)은 머지로 낡았고, 재실측 결과 양쪽 head가 같아 구조적 이유로 판정했다. **DB의 `Project.baseBranch` 갱신은 6단계 0번 태스크에 남아 있다**
- [ ] 🔒 **로케일 시드 방식 결정** — 로케일 파일 스캔 자동 생성인지 수동 등록인지 (MVP §10)
- [ ] 대상 리포에 Actions 워크플로 (스캔 → `/api/push`)
  - 검증: 대상 리포에서 run이 green
  - ⚠️ **어댑터를 명시 지정한다** — bugshot-2는 `_locales`(4키)와 `ts-dict`(903키)가 공존해 탐지 우선순위가 작은 쪽을 잡는다
- [ ] 커밋 메시지 `[skip-l10n]`이면 스킵
  - 검증: pull이 만든 커밋이 머지돼도 push가 돌지 않음 (무한 루프 차단)
- [ ] 워크플로가 **열린 `l10n/sync` PR을 감지하면 경고**
  - 근거: strict라 그 PR이 머지되기 전의 push가 편집을 지운다 (MVP §3.1). 차단이 아니라 경고 — 병합 로직이 아니고 개발자가 판단할 재료다
- [ ] **적재 실패만 CI를 red로 만든다** (스캔 실패는 경고)
  - 근거: 키의 진실은 로케일 파일이고 스캔은 `refs` 전담이다 — 남의 리포 CI를 우리 스캐너 규칙으로 실패시키지 않는다 (ARCHITECTURE §4). 옛 체크리스트의 "비리터럴 인자 발견 시 CI 실패"는 "코드 스캔이 진실"이던 시절 항목이라 삭제했다
  - 검증: 로케일 파일을 깨뜨리면 red, 동적 키만 있으면 green
- [ ] `vercel.json` Cron → `/api/pull` 야간 1회
  - 검증: Vercel 대시보드에서 cron 등록 확인
- [ ] 대상 리포 왕복 검증 (MVP §9) — push → 편집 → pull → PR 확인
  - 검증: `bugshot-2`의 ko/en/fr 3로케일로 PR이 정상 생성
- [ ] `/l10n-roundtrip` 스킬 추가
  - 검증: 스킬이 왕복을 재현

---

## 전역 미결 (단계에 묶이지 않은 것)

- [ ] 🔒 **dev/prod DB 분리** — Supabase 인스턴스가 하나뿐이라 `migrate dev`가 프로덕션을 직접 바꾼다. **번역 데이터가 쌓이기 전에** 두 번째 프로젝트를 만들지 결정한다 (MVP §10, `/db` 경고 섹션)
- [ ] **Vercel 프로젝트 연결** — 아직 미연결이라 main 푸시가 실제로는 배포하지 않는다. 연결하는 순간부터 `/push`가 진짜 배포가 된다
- [x] **`pnpm build`를 로컬 게이트에** (2026-08-31 해소 — CI가 아니라 `/push` 1단계)
  - 근거: `tsc`가 RSC 경계를 못 본다. CI에 넣으면 **배포 후에** 알게 되고, 로컬 게이트가 프로덕션 앞의 유일한 방어선이다. 콜드 5초 / 웜 2초

## 8. 어댑터 범용성 측정 ✅ + 어댑터 5종 완성 ✅ + 홀드아웃 검증 ✅ (2026-09-02)

**스펙·설계·태스크는 [features/adapter-generality/](./features/adapter-generality/)에 있고, 결과와 판정은 [ADAPTER-COVERAGE.md](./ADAPTER-COVERAGE.md)에 있다.**

- [x] 오픈소스 리포 **109개**에 `detect`+`read`+왕복을 돌려 `docs/ADAPTER-COVERAGE.md` 작성 (`pnpm adapter-survey`)
  - 진입 조건 완화: 6단계 완료로 충분했다 — 앱·DB·Actions를 쓰지 않고 지표 ④를 픽스처·대상 리포 파일만으로 계산한다
  - 검증 통과: 지표 4개가 숫자로 존재. **1차(어댑터 3개) → 2차(5개)** 두 번 측정했다
- [x] 판정 4개 기록 — 지원 선언 포맷 / MVP §4.1 "키 정렬" 개정 필요 여부 / `ts-dict` 자동 탐지 제외 / **자동 탐지의 무인 신뢰 가능 여부**(구 "SaaS 경로 개폐" — MVP에 없던 전략 전제라 제품 중립으로 재명명)
- [x] **판정대로 어댑터를 만들었다** — `yaml-catalog`(18개 리포) · `code-dict`(11개) 신규, `writeStrategy` 축 분리, `.`-키 손실 수리, 탐지 관문 완화, 어댑터 간 순위 도입, `ts-dict` 자동 탐지 제외
  - 최종: 탐지 **99.0%**(지원 포맷 100/101) / 오탐 **0.0%** / 바이트 고정점 **100%** / **조용한 손실 0**
  - ⚠️ **어댑터를 만들고 단위 테스트를 통과시킨 뒤에도 실물 코퍼스가 결함 7건을 더 잡았다** (ADAPTER-COVERAGE §4). 그중 둘은 검증 층 자체의 결함이었다
- [x] **홀드아웃 20개로 일반화를 검증했다** (2026-09-02 3차) — 겹치지 않는 새 리포, **손대기 전에 먼저** 측정
  - 결과: 수정 전 탐지 50.0% · 오탐 **40.0%** → 수정 후 탐지 80.0%(지원 포맷 16/17) · 오탐 **6.3%** · 왕복 **16/16 의미·바이트**
  - ⚠️ **학습 코퍼스의 오탐 0.0%는 과적합이었다.** 보고할 수치는 홀드아웃의 6.3%다 (ADAPTER-COVERAGE 판정 ④ 갱신)
  - 경로 모양 2개 추가: `{dir}/{locale}/<name>.json`(6/20) · `{dir}/<prefix><sep>{locale}.<ext>`(3/20). **어댑터는 새로 만들지 않았다** — read·write가 같고 `pathTemplate`만 다르다
  - 결함 4건 수리: 맨 3글자 로케일 오탐(`hasStrongLocale`) · 로케일 디렉터리 파일 이름 선택(`PRIMARY_NAMES`) · 접두사가 맨 파일을 누름(`templateShapeRank`) · 하위 카탈로그가 정본을 누름(`liftAncestors`)
  - ⚠️ **뒤 둘은 이 라운드의 수정이 만든 회귀다.** 매 라운드 홀드아웃과 학습 코퍼스를 **둘 다** 돌린 것이 그것을 잡은 유일한 이유다
  - ⚠️ 순위 픽스 하나가 자기 단위 테스트만 통과하고 실제 경로에서 죽어 있었다 — `detectCandidatesAcross`가 어댑터 순서를 전부 재정렬한다 (POSTMORTEM 2026-09-02)
  - 남긴 오탐 1건: discourse(플러그인 카탈로그가 정본을 누름). `plugins/` 감점은 **관측 1건이라 만들지 않았다**
- [ ] **키 구분자를 계약으로 뺀다** (`nested: boolean` → `tree: {style, separator}`) — 남은 손실 2건(siyuan·musicblocks)의 뿌리이고, 비-점 구분자 리포 8개도 같은 축이다. 별 `/feature`
- [x] **"원본 키 순서 보존" 모드** — 별 `/feature`로 분리했다 → **아래 §9** (판정 ②)
  - 근거: 수술적 치환 어댑터가 diff **0.000**을 내는 것이 대조군이다 — 같은 문제를 원본 보존으로 푸는 방식이 이미 코드베이스에 있다

---

## 9. 키 순서 보존 (진행 중)

**스펙·설계·태스크는 [features/key-order-preservation/](./features/key-order-preservation/)에 있다.**
재생성 어댑터가 첫 pull에서 파일을 통째로 재정렬해 **사람이 첫 PR을 리뷰할 수 없다** — 그 PR이
도구 도입을 판단하는 관문이라 임계 경로다 (§8 판정 ②의 실행).

- [x] **설계 4관점 검수 반영** (2026-09-02, `/feature-review`) — 배선 4곳 누락, `+N/-N` 대칭의
      판별력 부재, 코퍼스 출처 오기, 검증 루프 부재를 고쳤다
- [x] **태스크 0-1 — 측정 지표 구현** (2026-09-02) — `lib/survey/json-shape.ts` 신규.
      로케일 간 순서 일치율 · 들여쓰기 분포 · 잔여 diff 원인 · 비-base diff · 어댑터별 중앙값 ·
      `not-run` 수. `configFiles` 배선 결함도 함께 수리 (POSTMORTEM 2026-09-02)
  - 검증 통과: `pnpm test` 634건 green, 실물 2개 리포에서 지표가 0이 아닌 값을 낸다
- [ ] **태스크 0-2 — 실측 실행과 판정** ⬅️ **다음에 할 일.** 학습 109 + 홀드아웃 20을 따로 돌려
      **A안(`StringKey.sortIndex`) vs 대안 E(`Translation.sortIndex`)** 와 들여쓰기 별기능 여부를
      숫자로 닫는다. 경계값은 feature `tasks.md`의 🔒 표에 이미 못 박혀 있다
  - ⚠️ **이 판정 전에는 태스크 1 이후를 시작하지 않는다** — 스키마 모양이 여기서 정해진다
- [ ] 태스크 1~2 — `read`가 순서를 관측하고, 재생성 writer가 그 순서로 재조립
- [ ] 태스크 3~4 — `StringKey.sortIndex` 마이그레이션(additive) → push·pull 배선 4곳
- [ ] 태스크 5 — **검증 루프** (L1 진입점 회귀 / L2 골든 픽스처 / L3 재측정 트리거 규칙)
- [ ] 태스크 6~7 — 재측정 게이트, 실물 확인, MVP §4.1 · ARCHITECTURE §1.1 갱신
