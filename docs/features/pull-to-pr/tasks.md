# tasks — pull

순수 함수 → 껍데기 → 배선 순서. 역순이면 테스트 못 하는 코드를 먼저 쌓는다.

---

## 0. 선행 — GitHub App (사람이 하는 작업, 코드 아님)

**이게 없으면 1c 스모크부터 아무것도 검증할 수 없다.** 로컬 `.env.local`에서 셋 다 비어 있다. **단 1a·1b(순수 함수)는 0단계 없이 진행 가능하다** — App 생성·설치가 늘어지는 동안 병렬로 간다.

- [ ] GitHub App 생성 — 권한 **Contents: Read & write**, **Pull requests: Read & write**. 그 둘이면 된다
- [ ] 대상 리포(`SinhyeokKang/bugshot-2`)에 설치
- [ ] `.env.local`에 `GITHUB_APP_ID`·`GITHUB_APP_PRIVATE_KEY`(PEM 전문)·`CRON_SECRET` 채우기
- [ ] `Project.installationId` 채우기 — 현재 두 행 모두 `null`이다. 설치 후 URL이나 API에서 얻는다
  - 검증: 아래 1c의 스모크가 통과하면 셋 다 맞은 것이다
- [ ] **base 브랜치 `dev` 반영** (design.md 마지막 절 — 결정 완료) — `Project.baseBranch`를 `main` → `dev`로 갱신. MVP §10에서 항목을 빼는 것은 문서 갱신 단계에서

—— 커밋 없음 (환경 설정)

---

## 1. 순수 함수 (`/tdd interface` → `/implement`)

### 1a. 판정·경로·entries

- [ ] `shouldSkipPull(maxUpdatedAt: Date | null, lastPulledAt: Date | null): boolean`
  - 검증: 편집 있음→false / 없음→true / **첫 pull(`lastPulledAt=null`)→false** / 편집 0건(`maxUpdatedAt=null`)→true / 같은 시각→true
- [ ] `formatFromProject(project): DetectedFormat`
  - 검증: `adapterName`·`pathTemplate`·`nested`·`baseLocale` 4컬럼에서 재조립. 컬럼이 `null`이면(push가 아직 안 돌았다) 명시적 에러 — pull 경로엔 `read`가 없어 여기가 유일한 포맷 출처다
- [ ] `resolveLocalePaths(format, layout, treePaths): {locale?, path}[]`
  - 검증: `per-locale`은 `{locale}` 치환 (`i18n/{locale}.json` → `i18n/ko.json`). **`multi-locale`은 글롭을 `treePaths`(base 트리 경로 목록)와 매칭** (`src/i18n/namespaces/*.ts` → 8파일). 글롭이 디렉터리를 넘어가지 않는지(`*`가 `/`를 안 먹는지). **글롭이 0파일 매칭이면 명시적 에러**(경로 이동 신호 — 조용히 빈 PR을 내면 안 된다)
- [ ] `buildWriteEntries(rows): LocaleEntry[]` — **writer에 넘길 entries의 유일한 관문**
  - 검증: **빈 문자열 제외(재생성·치환 공통)** — `ts-dict`는 `usableEntries`를 지나지 않아 `""`가 새면 원문이 `""`로 치환된다 (MVP §4.1, ARCHITECTURE §1.4). orphaned는 재생성이면 제외, 치환이면 **entries에서 빼서 값을 안 바꾼다**(파일엔 남는다)
- [ ] `planPullChanges(local, baseTree): {path, content}[]`
  - 검증: SHA 같으면 제외 / 다르면 포함 / **base 트리에 없는 경로는 신규로 포함** / **base에만 있는 경로는 삭제하지 않는다**(pull은 파일을 지우지 않는다) / **write가 `null`(낼 것 0개)인 경로는 스킵** — 기존 파일 유지

### 1b. 페이로드 조립

- [ ] `buildTreePayload(changes, baseTreeSha)`
  - 검증: **`base_tree`가 들어간다** (빠지면 리포의 나머지 파일이 전부 삭제된 커밋이 된다). mode `100644`, type `blob`
- [ ] `buildCommitPayload(treeSha, parentSha, summary)`
  - 검증: `parents`가 **base head 하나** (`l10n/sync`의 기존 head가 아니다). 메시지에 **`[skip-l10n]`** 포함
- [ ] `encodeRefPath(branch): string`
  - 검증: `l10n/sync` → `l10n%2Fsync`. 슬래시가 그대로면 404다
- [ ] 페이로드 함수에 **반환 타입 명시**
  - 근거: POSTMORTEM 2026-08-31 — 리터럴로 조립하면 필드가 늘어도 컴파일러가 침묵한다

—— 커밋: `test:` (red) → `feat:` (순수 함수)

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

## 2. pull 오케스트레이션

**마이그레이션 커밋이 먼저다** — 오케스트레이션 코드가 `Project.lastPulledAt`을 참조하는 순간 스키마·클라이언트가 없으면 typecheck red라, `chore(db)`가 앞서야 커밋마다 `/push` 게이트를 통과한다.

- [ ] 마이그레이션 — `Project.lastPulledAt` (additive, nullable)
  - `/db`로 만들고 `/push` **전에** `db:deploy`
- [ ] DB 로딩 — `max(Translation.updatedAt)` 집계(**`projectId`로 좁힌다** — 신규 쿼리, 리포에 선례 없음), `Project` 조회에 pull 필수 컬럼(`adapterName`·`pathTemplate`·`nested`·`baseLocale`·`baseBranch`·`installationId`·`lastPulledAt`) 포함, `Translation` 행 → `LocaleEntry[]` 변환(→ 1a `buildWriteEntries`)
  - 검증: **`installationId`가 `null`이면 명시적 에러** — 조용히 빈 PR을 내지 않는다
- [ ] 1층 DB 측 스킵 → 2층 blob SHA 비교 → 커밋 → PR
- [ ] **write가 원본을 요구하면(수술적 치환) blob 내용을 읽어 `currentFiles`에 싣는다** (재생성 어댑터는 건너뜀)
  - **write는 파일별 호출** — 각 호출의 `currentFiles`에 그 파일 하나만 싣는다. `ts-dict`는 `currentFiles[0]`만 보고 나머지를 조용히 버린다
- [ ] 브랜치 없으면 `POST /git/refs`, 있으면 `PATCH` + force
- [ ] 열린 PR 재사용 — 조회 `head`는 **`{owner}:l10n/sync` 형식** (브랜치명만 넘기면 필터가 조용히 무시돼 중복 생성된다)
- [ ] `Project.lastPulledAt` 갱신 — **2층 전부-동일 스킵과 커밋·PR 성공 양쪽에서** 갱신하고, 값은 **1층 판정 시점에 캡처한 `max(updatedAt)`** (design.md 갱신 규칙 표)
  - ⚠️ **중간 실패 시엔 쓰지 않는다.** 먼저 쓰면 실패한 pull이 다음 실행을 스킵시켜 편집이 영영 안 나간다
- [ ] **fake 클라이언트 기반 단위 테스트** (1c의 주입 계약 사용):
  - 검증: 1층 스킵 시 **GitHub 호출 0회** (spec 완료 조건 4의 판정 수단)
  - 검증: 커밋/PR 단계에서 throw하는 fake → **`lastPulledAt` 미갱신**
  - 검증: 2층 전부-동일 종료 → **`lastPulledAt` 갱신** (캡처 값으로)
  - 검증: `multi-locale` 8파일 fake 트리 → **write가 파일별로 8회 호출**되고 각각 자기 원본을 받는다
  - 검증: `""` 값이 포함된 행 → **writer에 도달하지 않는다** (`buildWriteEntries` 경유 확인)

—— 커밋: `chore(db):` (마이그레이션) → `feat:` (pull 오케스트레이션)

---

## 3. 진입점

- [ ] `/api/pull` Route Handler — **cron 전용**. `CRON_SECRET` 검증(`lib/push/auth.ts`의 `checkBearer` 재사용 — fail-closed 기존 구현), `maxDuration 60`
  - 검증: 시크릿 없이 호출하면 거부. 미설정도 거부(빈 문자열 포함)
  - ⚠️ `middleware.ts` matcher에 넣지 않는다 — cron은 세션이 없다 (현재 matcher는 `/keys/:path*`뿐이라 기본값이 안전)
- [ ] 편집 UI의 pull 버튼 — **Server Action이 pull 로직을 직접 부른다**
  - 근거: 내부 쓰기에 Route Handler를 새로 만들지 않는다 (MVP §5). 어느 경로든 커밋 작성자는 App 토큰이다 (ARCHITECTURE §6)
  - **반환 유니온**: `{ok: true, prUrl} | {ok: true, skipped: true} | {ok: false, error}` — `saveTranslation`의 기존 관용과 동형
  - **상태 표시는 인라인 1줄** (토스트 도입 안 함 — sonner는 설치만 되고 사용처 0, 기존 관용은 `translation-input.tsx`의 인라인): pending은 버튼 `disabled` + `text-muted-foreground`, 실패는 `text-destructive`, **no-op은 "이미 최신 상태예요" 표시**(기본 경로라 무반응이면 고장으로 읽힌다. PR URL 재표시를 위해 스키마를 늘리지 않는다)
  - **레이블은 편집자 어휘** — "PR"이 아니라 예: "변경 내보내기" / 성공: "반영 요청이 만들어졌어요" + 링크
  - ⚠️ 버튼이 놓일 헤더는 `keys/page.tsx`가 높이 2.5rem을 하드코딩하고 있다 — `size="sm"`(h-8) 이하. `<Button>` 첫 사용처가 된다
  - 검증: 버튼을 눌러 PR URL이 화면에 뜬다 / 직후 한 번 더 누르면 "이미 최신 상태"가 뜬다

—— 커밋: `feat:` (진입점)

---

## 4. 왕복 검증 (bugshot-2 실물, 수동 — e2e 없음)

**여기가 이 기능의 진짜 완료 지점이다.** 단위 테스트는 실물 왕복을 증명하지 못한다. 아래는 전부 사람이 따라 하는 절차다.

- [ ] **빈 값 편집 준비**: 편집 UI에서 bugshot-2 키 하나의 번역을 지워 `""`로 만든다 (실 DB의 빈 값 케이스 `auth.accountInfo`는 skillflo 소속이라 이 왕복을 지나지 않는다)
- [ ] pull 1회 → **PR이 열린다**
  - 검증: DB의 bugshot-2 편집 4건(`actionLog.empty` ko, `attachment.download` ko/en/fr)이 diff에 있다. **편집이 걸치는 `ts-dict` 파일이 전부 diff에 있다** — 첫 파일만 갱신됐으면 파일별 write 루프 누락이다
- [ ] **PR diff를 눈으로 본다 — 바뀐 줄만 떠야 한다**
  - 검증: `ts-dict` 파일의 빈 줄·주석·키 순서가 보존됨. 파일 전체가 재정렬돼 나오면 **실패**다(수술적 치환이 재생성으로 퇴화한 것)
  - 위에서 지운 키는 **원본 값이 그대로 남아 있어야** 한다 (빈 값이 diff에 나타나면 `buildWriteEntries`가 새는 것)
- [ ] **pull 2회차가 1층 no-op**
  - 검증: `l10n/sync` head SHA가 그대로이고 PR이 하나로 유지된다 (판정: 실행 전후 `git ls-remote` SHA 비교)
- [ ] **결정성(2층) 검증** — `Project.lastPulledAt`을 과거(또는 `null`)로 되돌리고 재실행
  - 검증: 2층까지 진입해 blob SHA 전부-동일로 종료, 커밋이 안 쌓인다. **이게 export 결정성의 실전 시험이다** — 깨지면 야간 cron이 매일 무의미한 커밋을 만들고 며칠 뒤에나 발견된다
- [ ] **편집 없는 상태에서 API 0회** — 2단계의 fake 테스트가 판정 수단이다 (실물에선 계측 불가)
- [ ] **첫 실행 경로 재검증** — bugshot-2에서 `l10n/sync` 브랜치를 삭제하고 재실행
  - 검증: `POST /git/refs` 경로를 탄다 (첫 실행은 실물에서 1회뿐이라 재현 절차가 이것이다)
- [ ] PR 머지 → **`pnpm push:local ~/code/bugshot-2`** (7단계 배선 전이라 수동) → **DB가 리포 값과 일치**
  - 검증: `pnpm db:studio`(또는 SELECT)로 위 4건 + 빈 값 키의 DB 값이 리포 파일 값과 같은지 비교. strict가 덮어도 **값이 같다** — 이것이 손실 창이 닫혔다는 의미다
- [ ] `[skip-l10n]`이 커밋 메시지에 있다
  - 검증: 7단계에서 이 마커로 무한 루프를 막는다

—— 커밋: `docs(TASKS): ...` (6단계 체크)

---

## 문서 갱신 (구현과 같은 커밋 또는 `/push` 신선도 단계)

- [ ] **CLAUDE.md 코어 원칙의 pull 항목** — "읽는 것은 오직 blob SHA뿐"이 `ts-dict`와 어긋난다. **원본에서 가져오는 것은 구조이지 값이 아니다**로 고친다 (design.md 불변식 §1)
- [ ] CLAUDE.md 디렉터리 구조 — `api/pull/route.ts`·`lib/github.ts`의 `(미구현)` 표기 제거
- [ ] ARCHITECTURE §3 — `(미구현)` 표시 제거, 실제 동작으로 갱신 (파일별 write 호출, `lastPulledAt` 갱신 규칙 포함). §1.4의 "빈 값은 호출부가 걸러서" 서술도 정밀화 — 재생성 어댑터는 `usableEntries`가 내부에서 이중으로 거른다
- [ ] TASKS §6 체크 + 6단계 `⬜` → `✅`, 현재 단계 표시를 7로 이동. **§7의 왕복 검증 항목(6단계로 당겨온 것)과 §5d의 pull 버튼 항목(3단계가 흡수) 중복 정리**
- [ ] MVP §10 — base 브랜치 항목(**dev로 결정**)을 본문으로 올리고 목록에서 뺀다
- [ ] `/l10n-roundtrip` 스킬 추가 검토 — MVP §9가 "이 단계에 들어가면 추가한다"고 적었다
