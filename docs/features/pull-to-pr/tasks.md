# tasks — pull

순수 함수 → 껍데기 → 배선 순서. 역순이면 테스트 못 하는 코드를 먼저 쌓는다.

---

## 0. 선행 — GitHub App (사람이 하는 작업, 코드 아님)

**이게 없으면 1단계부터 아무것도 검증할 수 없다.** 로컬 `.env.local`에서 셋 다 비어 있다.

- [ ] GitHub App 생성 — 권한 **Contents: Read & write**, **Pull requests: Read & write**. 그 둘이면 된다
- [ ] 대상 리포(`SinhyeokKang/bugshot-2`)에 설치
- [ ] `.env.local`에 `GITHUB_APP_ID`·`GITHUB_APP_PRIVATE_KEY`(PEM 전문)·`CRON_SECRET` 채우기
- [ ] `Project.installationId` 채우기 — 현재 두 행 모두 `null`이다. 설치 후 URL이나 API에서 얻는다
  - 검증: 아래 1c의 스모크가 통과하면 셋 다 맞은 것이다

- [ ] 🔒 **base 브랜치 결정** (design.md 마지막 절) — `Project.baseBranch`는 `main`인데 적재된 `lastCommitSha`는 `dev`에만 있다. **`dev` 권장.** 결정 후 DB의 `baseBranch`를 그 값으로 갱신하고 MVP §10에서 항목을 뺀다

—— 커밋 없음 (환경 설정)

---

## 1. 순수 함수 (`/tdd interface` → `/implement`)

### 1a. 판정·경로

- [ ] `shouldSkipPull(maxUpdatedAt: Date | null, lastPulledAt: Date | null): boolean`
  - 검증: 편집 있음→false / 없음→true / **첫 pull(`lastPulledAt=null`)→false** / 편집 0건(`maxUpdatedAt=null`)→true / 같은 시각→true
- [ ] `resolveLocalePaths(format, locales): {locale, path}[]`
  - 검증: `per-locale`은 `{locale}` 치환 (`i18n/{locale}.json` → `i18n/ko.json`). **`multi-locale`은 글롭을 트리 경로 목록과 매칭** (`src/i18n/namespaces/*.ts` → 8파일). 글롭이 디렉터리를 넘어가지 않는지(`*`가 `/`를 안 먹는지)
- [ ] `planPullChanges(local, baseTree): {path, content}[]`
  - 검증: SHA 같으면 제외 / 다르면 포함 / **base 트리에 없는 경로는 신규로 포함** / **base에만 있는 경로는 삭제하지 않는다**(pull은 파일을 지우지 않는다)

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
- [ ] **스모크**: 토큰으로 bugshot-2의 base head SHA를 읽는다
  - 검증: 실제 SHA가 나오면 0단계 설정이 전부 맞은 것이다

—— 커밋: `feat:` (github 래퍼)

---

## 2. pull 오케스트레이션

- [ ] 1층 DB 측 스킵 → 2층 blob SHA 비교 → 커밋 → PR
- [ ] **`multi-locale`이면 blob 내용을 읽어 `currentFiles`에 싣는다** (재생성 어댑터는 건너뜀)
  - 검증: `ts-dict`의 write가 원본을 받아 값만 치환한다
- [ ] **빈 값은 writer에 넘기지 않는다** — 재생성·치환 양쪽 동일
  - 근거: MVP §4.1. 실 DB에 `auth.accountInfo` ko = `""`가 있다 — 이 키의 원본 리터럴이 보존돼야 통과다
- [ ] `orphaned` 키: 재생성은 파일에서 빼고, **`ts-dict`는 남긴다**(값을 안 바꾼다)
- [ ] 브랜치 없으면 `POST /git/refs`, 있으면 `PATCH` + force
  - 검증: 첫 실행과 두 번째 실행을 모두 돈다
- [ ] 열린 PR 재사용
  - 검증: 두 번 돌려 PR이 하나만 남는다
- [ ] 성공 시 `Project.lastPulledAt` 갱신
  - ⚠️ **커밋·PR이 실제로 나간 뒤에 쓴다.** 먼저 쓰면 실패한 pull이 다음 실행을 스킵시켜 편집이 영영 안 나간다
- [ ] 마이그레이션 — `Project.lastPulledAt` (additive, nullable)
  - `/db`로 만들고 `/push` **전에** `db:deploy`

—— 커밋: `feat:` (pull 오케스트레이션) / `chore(db):` (마이그레이션)

---

## 3. 진입점

- [ ] `/api/pull` Route Handler — **cron 전용**. `CRON_SECRET` 검증, fail-closed
  - 검증: 시크릿 없이 호출하면 거부. 미설정도 거부(빈 문자열 포함)
- [ ] 편집 UI의 pull 버튼 — **Server Action이 pull 로직을 직접 부른다**
  - 근거: 내부 쓰기에 Route Handler를 새로 만들지 않는다 (MVP §5). 어느 경로든 커밋 작성자는 App 토큰이다 (ARCHITECTURE §6)
  - 검증: 버튼을 눌러 PR URL이 화면에 뜬다

—— 커밋: `feat:` (진입점)

---

## 4. 왕복 검증 (bugshot-2 실물)

**여기가 이 기능의 진짜 완료 지점이다.** 단위 테스트는 결정성을 증명하지 못한다.

- [ ] pull 1회 → **PR이 열린다**
  - 검증: DB의 편집 6건(`auth.change`·`actionLog.empty`·`attachment.download` ko/en/fr)이 diff에 있다
- [ ] **PR diff를 눈으로 본다 — 바뀐 줄만 떠야 한다**
  - 검증: `ts-dict` 8파일의 빈 줄·주석·키 순서가 보존됨. 파일 전체가 재정렬돼 나오면 **실패**다(수술적 치환이 재생성으로 퇴화한 것)
  - `auth.accountInfo` ko(빈 문자열)는 **원본 값이 그대로 남아 있어야** 한다
- [ ] **pull 2회차가 no-op**
  - 검증: 커밋이 안 쌓이고 PR이 하나로 유지된다. **이게 export 결정성의 실전 시험이다** — 깨지면 야간 cron이 매일 무의미한 커밋을 만들고 며칠 뒤에나 발견된다
- [ ] **편집 없는 상태에서 API 0회**
  - 검증: 1층 스킵이 걸린다. 호출 카운트로 확인
- [ ] PR 머지 → 대상 리포에서 push → **DB가 리포 값과 일치**
  - 검증: strict가 덮어도 **값이 같다.** 이것이 손실 창이 닫혔다는 의미다
- [ ] `[skip-l10n]`이 커밋 메시지에 있다
  - 검증: 7단계에서 이 마커로 무한 루프를 막는다

—— 커밋: `docs(TASKS): ...` (6단계 체크)

---

## 문서 갱신 (구현과 같은 커밋 또는 `/push` 신선도 단계)

- [ ] **CLAUDE.md 코어 원칙의 pull 항목** — "읽는 것은 오직 blob SHA뿐"이 `ts-dict`와 어긋난다. **원본에서 가져오는 것은 구조이지 값이 아니다**로 고친다 (design.md 불변식 §1)
- [ ] ARCHITECTURE §3 — `(미구현)` 표시 제거, 실제 동작으로 갱신
- [ ] TASKS §6 체크 + 6단계 `⬜` → `✅`, 현재 단계 표시를 7로 이동
- [ ] MVP §10 — base 브랜치 항목 결정되면 본문으로 올리고 목록에서 뺀다
- [ ] `/l10n-roundtrip` 스킬 추가 검토 — MVP §9가 "이 단계에 들어가면 추가한다"고 적었다
