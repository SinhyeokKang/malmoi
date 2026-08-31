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

## 3. 로케일 적재 + 사용처 스캔 ⬜ ← **현재 단계** (적재·스캔 완료 / 나머지 TASKS 갱신 남음)

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
- [x] 결정성 규칙을 `shared.ts`로 모아 **모든 writer가 지나게** 한다
  - 검증: 정렬(`<` 비교)·재조립·2칸·끝 개행 1개·orphaned 제외·미번역 제외·0개면 `null`
- [x] **왕복 검증** — 읽고 쓰면 의미가 같다
  - 검증: 3개 리포 **11개 로케일 파일 전부 의미 동일**. 바이트 차이는 원본이 정렬돼 있지 않아서이고 첫 pull에서 한 번 정규화된다
- [x] 포맷 탐지 — 경로 신호 + 로케일 개수 + `probe` 내용 확인
  - 검증: `public/search/{locale}.json`(검색 인덱스)을 잡던 결함 회귀 테스트 4건
- [x] `pnpm ingest <dir>` CLI — 탐지·적재·왕복 판정
- [ ] 🔒 **base 로케일 판정** — 지금은 `en` 우선, 없으면 사전순 첫 번째. 리포 관례라 추정이다 (MVP §10)

### 3b. 사용처 스캔 (`lib/scan/`) ✅ — `refs` 전담, 경고만

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
  - 검증: 40자 hex 아닌 `commitSha`, `locales`에 없는 `baseLocale`, 미등록 어댑터, `{locale}` 없는 `pathTemplate`, 미선언 로케일의 번역, 양의 정수 아닌 `line` 전부 400. **키 0개도 거부** — 스캔이 조용히 실패하면 전 프로젝트가 orphan된다
- [x] upsert — 키·원문·`sourceHash`·description·namespace
  - 검증: 실 DB 1446키 → insert 1446 / 재전송 시 insert 0, update 1446
- [x] 스캔에 없는 키 → `orphaned = true`, 돌아오면 `false`
  - 검증: 절반 제거 시 orphan 723 / **총키 1446 유지(삭제 안 됨)** / 번역 2892 살아있음 → 되돌리면 unorphan 723, 남은 orphaned 0
- [x] `sourceHash` 변경 → base 아닌 번역에 `needsReview = true`
  - 검증: 10키 원문 변경 → ko 10건, **en(base) 0건**. 판정은 `sourceHash`로만 — description·namespace 변경은 전파하지 않는다(필터가 노이즈가 된다)
- [x] `KeyRef` 전체 교체
  - 검증: refs 5건만 보냈을 때 DB 5건 (이전 1446건이 남지 않는다)
- [x] **`Translation.value`를 어떤 경로로도 쓰지 않는다**
  - 검증: `INSERT ... ON CONFLICT DO NOTHING`만 존재. DB 값을 고친 뒤 push해도 보존됨을 실 DB로 확인. 네 파일 grep에서 `value` 쓰기 0건
- [x] **번역값 콜드 스타트** — 리포 파일의 값을 없을 때만 채운다 (MVP §3.1 수정)
  - 근거: 안 채우면 첫 pull이 대상 리포의 번역을 파괴한다(§3.1의 skillflo 시나리오)
- [x] `commitSha` + 어댑터 설정을 `Project`에 저장
  - 검증: `adapterName`·`pathTemplate`·`nested`·`baseLocale`·`lastCommitSha` 저장 확인. 마이그레이션 `20260831050156_add_project_locale_format` (additive)
- [x] 실제 영향 행수를 보고한다 (후보 수가 아니다)
  - 근거: 재전송에서 "번역 2892건 채움"으로 거짓 보고하던 것을 트랜잭션 결과에서 읽어 0으로 고침
- 성능: 1446키 + 2892번역 + 1446refs → **약 1.6초** (라우트 한도 60초)
- 구현 제약: transaction 모드 pooler라 대화형 트랜잭션 불가 → 배열형 `$transaction([...])` + `unnest()` 벌크
- [ ] 🔒 **키 id 형식** — raw SQL이라 `randomUUID()`로 만든다. 스키마의 `@default(cuid())`는 Prisma 클라이언트가 적용하는 값이라 raw에는 안 온다. 혼재해도 무해하지만 통일할지 결정 필요
- 커밋: `dbcfd10` (schema) → `1522544`(spec) → `b9c2e53` (test+feat)

---

## 5. Auth + 편집 UI ⬜

- [ ] 🔒 **GitHub org 결정** — 대상이 개인 계정 리포면 org 멤버십 검사가 성립하지 않는다 (MVP §10)
  - 결정 없이 착수하면 인가 모델을 다시 만든다
- [ ] Auth.js GitHub provider, JWT 세션 `maxAge` 24h
  - 검증: 로그인 → 세션에 GitHub 핸들
- [ ] org 멤버십 판정 함수, **`AUTH_ALLOWED_ORG`가 비면 전원 거부**
  - 검증: `isOrgAllowed` 테스트 (이미 있음) + 실제 콜백 배선
- [ ] Tailwind·shadcn 컴포넌트 추가 (`pnpm dlx shadcn@4.19.0 add ...`)
  - 검증: `pnpm build` 통과
- [ ] 네임스페이스 사이드바 (키 개수 표시)
  - 검증: `namespace` 인덱스를 타는 쿼리 하나로 조회
- [ ] 키 리스트 — 원문·description·번역 입력
  - 검증: 화면에 표시
- [ ] blur 시 Server Action 저장, `updatedBy`에 GitHub 핸들
  - 검증: 저장 후 재조회로 값·작성자 확인
- [ ] 필터 3개 — 미번역 / 검토필요 / orphaned
  - 검증: 각 필터가 기대 집합을 반환
- [ ] 코드 참조 GitHub permalink (스캔 당시 `commitSha` 고정)
  - 검증: 링크를 눌러 해당 줄로 이동
- [ ] pull 트리거 버튼 (Server Action)
  - 검증: 6단계 완료 후 동작
- [ ] `server-only`가 클라이언트 유입을 막는지
  - 검증: `pnpm build` 통과 (클라이언트 컴포넌트가 처음 생기는 단계다)

—— 커밋: auth / UI 골격 / 편집·저장 / 필터로 쪼갠다

---

## 6. GitHub App + `/api/pull` ⬜

- [ ] GitHub App installation 토큰 (`octokit`의 `App`)
  - 검증: 토큰으로 리포 읽기 성공
- [ ] PEM 개행 복원 (`parsePrivateKey`, 이미 테스트 있음)
  - 검증: Vercel env의 이스케이프된 값으로 JWT 서명 성공
- [ ] base head SHA + 트리 조회
  - 검증: 기존 `_locales/**/messages.json`의 blob SHA 획득
- [ ] **blob SHA 비교 → 변경 없으면 GitHub API를 한 번도 더 부르지 않음**
  - 검증: 호출 카운트를 세는 테스트 (이게 야간 cron의 기본 경로다)
- [ ] `createTree`에 **`base_tree` 전달**
  - 검증: 페이로드 조립 함수의 순수 테스트 (빼면 리포 나머지 파일이 삭제된 커밋이 된다)
- [ ] `parents: [baseHead]` — `l10n/sync`의 기존 head를 쓰지 않는다
  - 검증: 페이로드 테스트
- [ ] 커밋 메시지에 `[skip-l10n]`
  - 검증: 메시지 생성 함수 테스트
- [ ] ref URL 인코딩 (`l10n%2Fsync`)
  - 검증: 슬래시가 그대로 들어가면 404다
- [ ] **브랜치 없을 때 `POST /git/refs`, 있을 때 `PATCH` + `force`**
  - 검증: 첫 실행 경로를 반드시 다룬다
- [ ] 열린 PR 재사용, 없으면 생성
  - 검증: 두 번 돌려 PR이 하나만 남음
- [ ] `CRON_SECRET` 검증, fail-closed
  - 검증: 시크릿 없이 호출하면 거부

—— 커밋: github 래퍼 / pull 엔드포인트로 쪼갠다

---

## 7. Actions 워크플로 + Vercel Cron ⬜

- [ ] 🔒 **대상 리포 base 브랜치 결정** — main인지 dev인지 (MVP §10)
- [ ] 🔒 **로케일 시드 방식 결정** — `_locales/` 스캔 자동 생성인지 수동 등록인지 (MVP §10)
- [ ] 대상 리포에 Actions 워크플로 (스캔 → `/api/push`)
  - 검증: 대상 리포에서 run이 green
- [ ] 커밋 메시지 `[skip-l10n]`이면 스킵
  - 검증: pull이 만든 커밋이 머지돼도 push가 돌지 않음 (무한 루프 차단)
- [ ] 비리터럴 인자 발견 시 **CI 실패**
  - 검증: 일부러 깨뜨린 브랜치에서 run이 red
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
- [ ] **CI에 `pnpm build` 추가 여부** — 현재 로컬 게이트도 CI도 `next build`를 돌지 않아 RSC 경계·`"use client"` 누락은 Vercel 빌드 실패로만 드러난다 (CLAUDE.md 브랜치 섹션). 5단계에서 클라이언트 컴포넌트가 생기면 재검토
