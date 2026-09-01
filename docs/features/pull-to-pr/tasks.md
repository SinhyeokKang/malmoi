# tasks — pull

순수 함수 → 껍데기 → 배선 순서. 역순이면 테스트 못 하는 코드를 먼저 쌓는다.

---

## 0. 선행 — GitHub App (사람이 하는 작업, 코드 아님) ✅ 2026-09-01

**이게 없으면 1c 스모크부터 아무것도 검증할 수 없다.** 로컬 `.env.local`에서 셋 다 비어 있다. **단 1a·1b(순수 함수)는 0단계 없이 진행 가능하다** — App 생성·설치가 늘어지는 동안 병렬로 간다.

- [x] GitHub App 생성 — 권한 **Contents: Read & write**, **Pull requests: Read & write** (App ID `4787722`, Only on this account)
- [x] 대상 리포(`SinhyeokKang/bugshot-2`)에 설치 — `installationId = 158107153`, 설치 범위가 그 리포 하나뿐임을 `GET /installation/repositories`로 확인
- [x] `.env.local`에 `GITHUB_APP_ID`·`GITHUB_APP_PRIVATE_KEY`(PEM 전문)·`CRON_SECRET` 채우기 — PEM은 개행을 `\n`으로 접은 한 줄(Vercel env와 같은 형식). ⚠️ `re.sub`류 치환은 `\n`을 실제 개행으로 해석해 파일을 깨뜨린다 — 실제로 한 번 밟았다
- [x] `Project.installationId` 채우기 — `bugshot-2` 행만. **컬럼 타입이 `String?`이다**(Int로 넣으면 Prisma가 거부한다)
  - 검증: 임시 스모크로 App JWT → installation 토큰 → `GET /git/ref/heads/dev` = `baf494ee`(DB의 `lastCommitSha`와 일치), `ts-dict` 8파일 blob SHA 획득까지 확인. 정식 스모크는 1c
- [x] **base 브랜치 `dev` 반영** — `Project.baseBranch` `main` → `dev` (bugshot-2 행만). MVP §10·TASKS §7의 🔒도 해소했다 (`db0158f`·`e0c872f`)

—— 커밋 없음 (환경 설정)

---

## 1. 순수 함수 (`/tdd interface` → `/implement`)

### 1a. 판정·경로·entries ✅ (`a62b675`·`251238a`)

- [x] `shouldSkipPull(maxUpdatedAt: Date | null, lastPulledAt: Date | null): boolean`
  - 검증: 편집 있음→false / 없음→true / **첫 pull(`lastPulledAt=null`)→false** / 편집 0건(`maxUpdatedAt=null`)→true / 같은 시각→true
- [x] `formatFromProject(project): DetectedFormat`
  - 검증: `adapterName`·`pathTemplate`·`nested`·`baseLocale` 4컬럼에서 재조립. 컬럼이 `null`이면(push가 아직 안 돌았다) 명시적 에러 — pull 경로엔 `read`가 없어 여기가 유일한 포맷 출처다
- [x] `resolveLocalePaths(format, layout, treePaths): {locale?, path}[]`
  - 검증: `per-locale`은 `{locale}` 치환 (`i18n/{locale}.json` → `i18n/ko.json`). **`multi-locale`은 글롭을 `treePaths`(base 트리 경로 목록)와 매칭** (`src/i18n/namespaces/*.ts` → 8파일). 글롭이 디렉터리를 넘어가지 않는지(`*`가 `/`를 안 먹는지). **글롭이 0파일 매칭이면 명시적 에러**(경로 이동 신호 — 조용히 빈 PR을 내면 안 된다)
- [x] `buildWriteEntries(rows): LocaleEntry[]` — **writer에 넘길 entries의 유일한 관문**
  - 검증: **빈 문자열 제외(재생성·치환 공통)** — `ts-dict`는 `usableEntries`를 지나지 않아 `""`가 새면 원문이 `""`로 치환된다 (MVP §4.1, ARCHITECTURE §1.4). orphaned는 재생성이면 제외, 치환이면 **entries에서 빼서 값을 안 바꾼다**(파일엔 남는다)
- [x] `planPullChanges(local, baseTree): {path, content}[]`
  - 검증: SHA 같으면 제외 / 다르면 포함 / **base 트리에 없는 경로는 신규로 포함** / **base에만 있는 경로는 삭제하지 않는다**(pull은 파일을 지우지 않는다) / **write가 `null`(낼 것 0개)인 경로는 스킵** — 기존 파일 유지

### 1b. 페이로드 조립 ✅ (`a62b675`)

- [x] `buildTreePayload(changes, baseTreeSha)`
  - 검증: **`base_tree`가 들어간다** (빠지면 리포의 나머지 파일이 전부 삭제된 커밋이 된다). mode `100644`, type `blob`
- [x] `buildCommitPayload(treeSha, parentSha, summary)`
  - 검증: `parents`가 **base head 하나** (`l10n/sync`의 기존 head가 아니다). 메시지에 **`[skip-l10n]`** 포함
- [x] `encodeRefPath(branch): string`
  - 검증: `l10n/sync` → `l10n%2Fsync`. 슬래시가 그대로면 404다
- [x] 페이로드 함수에 **반환 타입 명시**
  - 근거: POSTMORTEM 2026-08-31 — 리터럴로 조립하면 필드가 늘어도 컴파일러가 침묵한다

—— 커밋: `test:` (red) → `feat:` (순수 함수)

**리뷰가 추가로 잡은 것** (`251238a`):

- per-locale인데 `pathTemplate`에 `{locale}`이 없고 로케일이 여럿이면 **던진다** — 안 던지면 모든 로케일이 같은 경로를 받아 마지막 것이 조용히 이긴다. `detect`는 항상 토큰을 넣으므로 DB를 손으로 고쳤을 때만 열리는 구멍이다. multi-locale은 정의상 치환하지 않아 검사 제외 (ARCHITECTURE §1.1)
- 정렬 비교자를 `compareKeys` 하나로 통일 (`lib/adapters/index.ts`가 re-export) — 세 곳이 각자 다른 표현이었고, 결과는 같지만 결정성 규칙의 주인이 넷이 되면 한 곳이 `localeCompare`로 바뀌어도 게이트가 잡지 못한다

### 1c. GitHub 껍데기 (`lib/github.ts`)

- [ ] App installation 토큰 — `octokit`의 `App` (`@octokit/auth-app` 별도 설치 불필요)
  - ⚠️ **지연 생성.** 모듈 최상위·기본값 인자에서 env를 읽지 않는다 (POSTMORTEM 2026-08-31, 재발 1회)
  - ⚠️ `parsePrivateKey`로 PEM 개행 복원 — 안 하면 JWT 서명이 **조용히** 실패한다
- [ ] Git Data API 래퍼 — ref 조회/생성/갱신, 트리 조회, blob 읽기/쓰기, 커밋, PR 조회/생성
  - **오케스트레이션은 이 래퍼(클라이언트)를 인자로 주입받는다** — `applyPush`가 `getPrisma()`를 주입받는 선례와 동형. 테스트가 fake로 대체해 호출을 기록한다. 이게 없으면 2단계의 테스트 전부와 spec 완료 조건 4가 검증 불가다
- [ ] **스모크**: `scripts/smoke-github.ts` — 토큰으로 bugshot-2의 base head SHA를 읽는 일회성 tsx 스크립트 (**`pnpm test` 밖** — 실 API를 부른다. 커밋에 포함해 0단계 설정 오류 재진단에 쓴다)
  - 검증: 실제 SHA가 나오면 0단계 설정이 전부 맞은 것이다

—— 커밋: `feat:` (github 래퍼)

---

## 2. pull 오케스트레이션 ✅ (`f77bb38`·`f917612`)

**마이그레이션 커밋이 먼저다** — 오케스트레이션 코드가 `Project.lastPulledAt`을 참조하는 순간 스키마·클라이언트가 없으면 typecheck red라, `chore(db)`가 앞서야 커밋마다 `/push` 게이트를 통과한다.

- [x] 마이그레이션 — `Project.lastPulledAt` (additive, nullable) — `36b5245`, `db:deploy` 적용 완료
- [x] DB 로딩 — `max(Translation.updatedAt)` 집계(**`projectId`로 좁힌다** — 신규 쿼리, 리포에 선례 없음), `Project` 조회에 pull 필수 컬럼(`adapterName`·`pathTemplate`·`nested`·`baseLocale`·`baseBranch`·`installationId`·`lastPulledAt`) 포함, `Translation` 행 → `LocaleEntry[]` 변환(→ 1a `buildWriteEntries`)
  - 검증: **`installationId`가 `null`이면 명시적 에러** — 조용히 빈 PR을 내지 않는다
- [x] 1층 DB 측 스킵 → 2층 blob SHA 비교 → 커밋 → PR
  - ⚠️ **base 브랜치 조회가 `null`이면 즉시 던진다** — GitHub은 권한 없는 리소스에 404를 주므로
    `null`이 "브랜치 없음"이 아니라 "권한 없음"일 수 있다. 그걸 진행시키면 `createRef`가 실패할
    때까지 오진이 이어진다. `l10n/sync`의 `null`만 정상 입력이다 (1c 리뷰 발견)
- [x] **write가 원본을 요구하면(수술적 치환) blob 내용을 읽어 `currentFiles`에 싣는다** (재생성 어댑터는 건너뜀)
  - **파일 × 로케일 이중 루프다** (2026-09-01 정정 — 문서가 로케일 축을 빠뜨렸다). `write`가 `input.locale`로 로케일 객체 하나를 고르므로 파일마다 로케일 수만큼 부르고 **직전 결과를 다음 호출의 원본으로 넘긴다**. 파일 축만 돌면 나머지 로케일이 조용히 원본으로 남는다
- [x] 브랜치 없으면 `POST /git/refs`, 있으면 `PATCH` + force
- [x] 열린 PR 재사용 — 조회 `head`는 **`{owner}:l10n/sync` 형식** (브랜치명만 넘기면 필터가 조용히 무시돼 중복 생성된다)
- [x] `Project.lastPulledAt` 갱신 — **2층 전부-동일 스킵과 커밋·PR 성공 양쪽에서** 갱신하고, 값은 **1층 판정 시점에 캡처한 `max(updatedAt)`** (design.md 갱신 규칙 표)
  - ⚠️ **중간 실패 시엔 쓰지 않는다.** 먼저 쓰면 실패한 pull이 다음 실행을 스킵시켜 편집이 영영 안 나간다
- [x] **fake 클라이언트 기반 단위 테스트** (1c의 주입 계약 사용) — 5건 전부 통과 (`lib/pull/__tests__/run.test.ts`):
  - 검증: 1층 스킵 시 **GitHub 호출 0회** (spec 완료 조건 4의 판정 수단)
  - 검증: 커밋/PR 단계에서 throw하는 fake → **`lastPulledAt` 미갱신**
  - 검증: 2층 전부-동일 종료 → **`lastPulledAt` 갱신** (캡처 값으로)
  - 검증: `multi-locale` 8파일 fake 트리 → **write가 파일별로 8회 호출**되고 각각 자기 원본을 받는다
  - 검증: `""` 값이 포함된 행 → **writer에 도달하지 않는다** (`buildWriteEntries` 경유 확인)

—— 커밋: `chore(db):` (마이그레이션) → `feat:` (pull 오케스트레이션)

---

## 3. 진입점 ✅ (`a5bff4d`·`cf1905f`)

- [x] `/api/pull` Route Handler — **cron 전용**. `CRON_SECRET` 검증(`lib/push/auth.ts`의 `checkBearer` 재사용 — fail-closed 기존 구현), `maxDuration 60`
  - 검증: 시크릿 없이·틀린 시크릿 모두 **401**이고 응답이 구별되지 않는다 ✅ (dev 서버 실측). 미설정은 `checkBearer`가 500 — 기존 테스트가 덮는다
  - ⚠️ **Vercel Cron은 `GET`으로 부른다** — 부수효과가 있는데도 `GET`인 유일한 이유다
  - ⚠️ `middleware.ts` matcher에 넣지 않는다 — cron은 세션이 없다 (현재 matcher는 `/keys/:path*`뿐이라 기본값이 안전)
- [x] 편집 UI의 pull 버튼 — **Server Action이 pull 로직을 직접 부른다**
  - 근거: 내부 쓰기에 Route Handler를 새로 만들지 않는다 (MVP §5). 어느 경로든 커밋 작성자는 App 토큰이다 (ARCHITECTURE §6)
  - **반환 유니온**: `{ok: true, prUrl} | {ok: true, skipped: true} | {ok: false, error}` — `saveTranslation`의 기존 관용과 동형
  - **상태 표시는 인라인 1줄** (토스트 도입 안 함 — sonner는 설치만 되고 사용처 0, 기존 관용은 `translation-input.tsx`의 인라인): pending은 버튼 `disabled` + `text-muted-foreground`, 실패는 `text-destructive`, **no-op은 "이미 최신 상태예요" 표시**(기본 경로라 무반응이면 고장으로 읽힌다. PR URL 재표시를 위해 스키마를 늘리지 않는다)
  - **레이블은 편집자 어휘** — "PR"이 아니라 예: "변경 내보내기" / 성공: "반영 요청이 만들어졌어요" + 링크
  - ⚠️ 버튼이 놓일 헤더는 `keys/page.tsx`가 높이 2.5rem을 하드코딩하고 있다 — `size="sm"`(h-8) 이하. `<Button>` 첫 사용처가 된다
  - 검증(자동): `pullMessage`가 4상태를 exhaustive switch로 덮고 git 어휘를 쓰지 않는다 ✅ (7케이스)
  - 검증(수동, **남았다**): 버튼을 눌러 링크가 뜨는지 / 직후 한 번 더 눌러 "이미 최신 상태"가 뜨는지 / 헤더 정렬이 깨지지 않았는지 — 로그인이 필요해 눈으로 봐야 한다
  - **헤더 높이 하드코딩을 제거했다** (CDO 검수가 예고한 함정을 실제로 밟았다): `keys/page.tsx`의 `min-h-[calc(100svh-2.5rem)]`이 "텍스트만 든 헤더"를 전제했고 `h-8` 버튼이 49px로 만들었다. 레이아웃을 flex 컬럼으로 바꿔 계산 자체를 없앴다

—— 커밋: `feat:` (진입점)

---

## 4. 실물 검증 ✅ 2026-09-01 (7회차 루프)

**대상 리포를 `bugshot-2`가 아니라 일회용 private 리포(`bugshot-i18n-test`)로 두고 돌렸다** —
`Project.repoName`만 바꿔 쓰고 검증 후 되돌리는 방식이라, 실 DB의 편집 4건을 그대로 쓸 수 있고
남의 리포에 커밋이 남지 않는다. `l10n/sync` 브랜치만 리셋하면 초기 상태가 되므로 매 회차가 1초다.

### ❌ 검증하지 않은 것 — 왕복의 절반

- [ ] PR 머지 → `pnpm push:local` → **DB가 리포 값과 일치**
  - **사용자 결정으로 범위 밖이 됐다** (2026-09-01): PR을 머지하지 않고 품질만 보고 닫았다.
  - **따라서 "편집 손실 창이 닫혔다"는 것은 실증되지 않았다.** 근거는 strict 정책의 논리와
    단위 테스트뿐이다 — 실제로 머지 후 push가 같은 값을 덮는지는 확인된 바 없다.
- [ ] **재생성 어댑터(`chrome-locales`·`json-catalog`)의 실물 pull** — bugshot-2의 `Project`가
  `ts-dict`를 가리키고, 한 프로젝트가 두 표면을 다루는 것은 MVP §7 비범위다. 표면마다 프로젝트를
  나눠야 검증할 수 있다.

### ✅ 통과한 것

- [x] pull 1회 → **PR이 열린다** — 편집 4건 중 3건이 diff에. `actionLog.empty` ko는 **원본 값과
  같아서** `logs.ts`가 안 바뀌었다(2층 SHA 비교가 정확히 걸렀다 — 8파일 중 1개만 커밋)
- [x] **PR diff에 바뀐 줄만 뜬다** — 기본 편집 `+3/-3`
- [x] **파일별 write 루프** — 2개 네임스페이스 동시 편집 시 `issue.ts +4/-4`, `logs.ts +1/-1`
- [x] **로케일 축 이중 루프** — 한 파일 안 ko/en/fr 세 블록이 모두 바뀐다. 파일 축만 돌면 ko만 바뀐다
- [x] **이스케이프** — `a"b\c\nd\te` → `"a\"b\\c\nd\te"`. 백틱·`${}`는 큰따옴표 안이라 그대로,
  이모지·中文·émoji가 유니코드 이스케이프로 바뀌지 않는다(파일 스타일 보존)
- [x] **400자 값이 한 줄로** — ts-morph가 줄바꿈을 삽입하지 않는다
- [x] **orphaned 키는 값을 바꾸지 않는다** — diff에서 사라지고 원본이 남는다
- [x] **빈 값이 writer에 도달하지 않는다** — `attachment.remove [ko]=""` → 원본 `"첨부 삭제"` 유지
- [x] **최대 부하: 907키 × 3로케일** — 8파일 **`+2745/-2745`**, 21초.
  **`+N/-N` 대칭이 핵심 증거다** — 2745줄이 바뀌었는데 줄이 하나도 추가·삭제되지 않았다.
  재생성이라면 정렬로 줄이 이동해 비대칭이 나온다
- [x] **그 상태에서 대상 리포 `pnpm typecheck` 통과** — 치환된 파일이 유효한 TS다.
  이스케이프가 깨졌으면 여기서 잡힌다. **단위 테스트가 원리적으로 못 보는 층이다**
- [x] **어댑터가 되읽는다** — `pnpm ingest`로 903키 × 3로케일 전부 채워짐(값 손실 0)
- [x] **주석 3개·빈 줄 10개·파일 끝 개행 1개 보존** (bulk 상태에서 확인)
- [x] **pull 2회차가 1층 no-op** — `{"status":"skipped","reason":"no-edits"}`, head 불변
- [x] **결정성** — ⚠️ **판정 기준을 정정했다.** "2회차가 no-op"은 **1층** 이야기다. 2층은
  base(`dev`)와 비교하므로 **PR이 머지되기 전까지 매번 "변경됨"을 낸다** — 설계상 정상이다.
  결정성의 실제 판정은 **두 커밋의 tree SHA 동일성**이고, 기본 상태(`2817ce475f2f`)와
  최대 부하 상태(`72b4bce4eac2`) 양쪽에서 확인했다
- [x] **첫 실행 경로** — `l10n/sync` 삭제 후 재실행이 `POST /git/refs`를 탄다.
  ⚠️ **브랜치를 삭제하면 GitHub이 그 head를 가진 PR을 자동으로 닫는다** — 그 뒤 pull은 닫힌 PR을
  재사용하지 않고 새로 만든다(정상: `state=open` 필터)
- [x] **PR 하나 재사용** — 열린 PR이 있으면 `createPr`을 부르지 않는다
- [x] **`base_tree` + `parents` + `[skip-l10n]`** — `parents=baf494ee`(base head),
  메시지 `l10n: sync translations (1 file) [skip-l10n]`
- [x] **`CRON_SECRET` fail-closed** — 없음·틀림 모두 401이고 응답이 구별되지 않는다
- [x] **편집 없는 상태에서 API 0회** — fake 테스트가 판정 수단이다(실물에선 계측 불가)

### 정리

`Project.repoName`·`lastPulledAt` 원복, `push:local`로 DB를 리포 값 재적재 후 편집 4건 복원,
PR 8개 전부 CLOSED, 임시 스크립트 삭제. **검증용 리포 삭제는 `delete_repo` 스코프가 없어 남았다.**

—— 커밋: `docs(TASKS): ...` (6단계 체크)

---

## 문서 갱신 (구현과 같은 커밋 또는 `/push` 신선도 단계)

- [ ] **CLAUDE.md 코어 원칙의 pull 항목** — "읽는 것은 오직 blob SHA뿐"이 `ts-dict`와 어긋난다. **원본에서 가져오는 것은 구조이지 값이 아니다**로 고친다 (design.md 불변식 §1)
- [ ] CLAUDE.md 디렉터리 구조 — `api/pull/route.ts`·`lib/github.ts`의 `(미구현)` 표기 제거
- [ ] ARCHITECTURE §3 — `(미구현)` 표시 제거, 실제 동작으로 갱신 (파일별 write 호출, `lastPulledAt` 갱신 규칙 포함). §1.4의 "빈 값은 호출부가 걸러서" 서술도 정밀화 — 재생성 어댑터는 `usableEntries`가 내부에서 이중으로 거른다
- [ ] TASKS §6 체크 + 6단계 `⬜` → `✅`, 현재 단계 표시를 7로 이동. **§7의 왕복 검증 항목(6단계로 당겨온 것)과 §5d의 pull 버튼 항목(3단계가 흡수) 중복 정리**
- [ ] MVP §10 — base 브랜치 항목(**dev로 결정**)을 본문으로 올리고 목록에서 뺀다
- [ ] `/l10n-roundtrip` 스킬 추가 검토 — MVP §9가 "이 단계에 들어가면 추가한다"고 적었다
