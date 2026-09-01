# design — pull

## 영향 받는 흐름

**pull 하나.** push와 편집 UI는 읽기만 당한다(`Project` 설정·`Translation` 값). 다만 **pull이 서는 순간 push의 의미가 바뀐다** — 지금까지 편집 손실 창의 방어가 0이었는데, 이제 "PR을 머지한 뒤 push"라는 운영 규칙이 실제로 성립한다 (MVP §3.1).

## 판정이 두 층이다

```
1층  DB 측 스킵 ── max(Translation.updatedAt) <= Project.lastPulledAt ?
                    └─ 예 → 종료. **GitHub API 0회**  ← 편집 없는 날의 기본 경로
2층  blob SHA  ── 로컬 export의 SHA == base 트리의 SHA ?
                    └─ 전부 같으면 → 커밋·PR 경로로 가지 않음
```

**1층이 있는 이유**: `ts-dict`는 write에 원본 내용이 필요해(§1.4) 2층에 도달하려면 이미 blob을 파일 수만큼 읽어야 한다. 1층이 없으면 "변경 없는 날 API 0회"가 재생성 어댑터에서만 참이 된다. 1층은 어댑터와 무관하게 성립하고, 재생성 쪽도 트리 조회 한 번을 덤으로 아낀다.

**1층의 대가**: 리포 파일을 직접 고치고 push를 안 돌린 경우를 놓친다. 정상 흐름에선 push가 strict로 DB에 반영하므로 `updatedAt`이 움직인다.

**2층을 없애지 않는 이유**: 1층은 "DB가 변했다"만 알고 "파일이 달라진다"는 모른다. 편집이 미번역→미번역(빈 문자열 유지)이면 DB는 변했지만 export 결과는 같다. 2층이 없으면 그때 빈 커밋이 나간다.

## API 호출 순서

ARCHITECTURE §3의 순서에 `ts-dict` 갈래를 넣은 것이다.

1. `GET /git/ref/heads/{base}` → base head SHA
2. `GET /git/trees/{sha}?recursive=1` → 로케일 파일들의 blob SHA
3. **`multi-locale`이면** 파일별 `GET /git/blobs/{sha}` → `DetectedFormat.currentFiles` 채움 *(재생성 어댑터는 건너뜀)*
4. 로컬 write + blob SHA 계산 → 비교. **전부 같으면 종료**
5. 변경분마다 `POST /git/blobs`
6. `POST /git/trees` — **`base_tree` 필수**
7. `POST /git/commits` — `parents: [baseHead]`, 메시지에 `[skip-l10n]`
8. `PATCH /git/refs/heads/l10n%2Fsync` (`force: true`) — **없으면 `POST /git/refs`**
9. `GET /pulls?head=…&state=open` → 있으면 재사용, 없으면 `POST /pulls`

## 순수 함수로 분리 가능한 부분 (= `/tdd` 대상)

**여기가 이 설계의 검증 가능성 전부다.** GitHub 호출은 얇은 껍데기로 감싸고 판정은 전부 아래로 내린다.

| 함수 | 입력 → 출력 | 왜 순수해야 하나 |
|---|---|---|
| `shouldSkipPull(maxUpdatedAt, lastPulledAt)` | 두 시각 → boolean | 1층 판정. null 조합(첫 pull·편집 0건)이 경계다 |
| `resolveLocalePaths(format, locales)` | 포맷 → 경로 목록 | `per-locale`은 `{locale}` 치환, `multi-locale`은 **글롭을 트리 경로와 매칭**. 여기가 틀리면 엉뚱한 파일을 덮는다 |
| `planPullChanges(local, baseTree)` | `{path, content}[]` + `{path, sha}[]` → 변경분 | 2층 판정. **삭제는 내지 않는다** — 파일을 지우는 pull은 없다 |
| `buildTreePayload(changes, baseTreeSha)` | 변경분 → 트리 요청 본문 | **`base_tree` 누락이 리포 전체를 지운다.** 순수 테스트로 못 박는 이유가 이것 하나다 |
| `buildCommitPayload(treeSha, parentSha, summary)` | → 커밋 요청 본문 | `parents: [baseHead]` 고정, 메시지에 `[skip-l10n]` |
| `encodeRefPath(branch)` | `l10n/sync` → `l10n%2Fsync` | 슬래시가 그대로 가면 404 |

`lib/github.ts`는 이 함수들이 만든 페이로드를 보내기만 한다.

## 스키마 변경

**additive 1건** — `Project.lastPulledAt DateTime?`.

nullable이라 기존 2행과 현재 배포된 코드 양쪽에 무해하다. 첫 pull은 `null`이라 1층을 통과한다(스킵하지 않는다). `/db`로 만들고 `/push` **전에** `db:deploy` — §4b에서 밟은 순서 그대로.

## 새 환경변수

**없다.** `GITHUB_APP_ID`·`GITHUB_APP_PRIVATE_KEY`·`CRON_SECRET` 셋 다 `.env.example`에 이미 등재돼 있다.

⚠️ **다만 로컬 `.env.local`에서 셋 다 값이 비어 있다.** GitHub App이 아직 존재하지 않는다 — 이건 코드가 아니라 **사람이 GitHub에서 하는 선행 작업**이다 (`tasks.md` 0단계).

## 불변식 영향

### 1. CLAUDE.md 코어 원칙의 pull 서술이 낡았다 — 갱신 필요

현재:

> **pull은 파일을 편집하지 않고 생성한다.** … 읽는 것은 오직 **변경 여부 판정**을 위한 blob SHA뿐이다.

**`ts-dict`가 이걸 정면으로 위반한다.** MVP §4.1이 수술적 치환을 승인하면서 "write가 원본을 필요로 한다"를 대가로 명시했는데, CLAUDE.md 코어 원칙 절은 아직 안 고쳐졌다. 2026-08-31 정합 복구에서 push 항목만 고치고 이 항목을 놓쳤다.

**핵심은 "읽지 않는다"가 아니라 "병합하지 않는다"이다.** 원본에서 가져오는 것은 **구조**(빈 줄·주석·키 순서)이지 **값**이 아니다 — 값은 전부 DB에서 온다. 이 구분이 서면 §2의 "병합 없음"은 그대로 지켜진다.

### 2. blob SHA·export 결정성 (ARCHITECTURE §1.1·§2)

건드리지 않는다. 오히려 **이 기능이 그 불변식의 첫 실사용자다** — 지금까지 결정성은 단위 테스트로만 확인됐고, 두 번째 pull이 no-op인지가 실전 검증이다(spec 완료 조건 3).

### 3. 인증 경계 (ARCHITECTURE §6)

**두 자격증명을 섞지 않는다.** 리포 쓰기는 **GitHub App installation 토큰**뿐이고 사용자 OAuth 토큰이 이 경로에 들어오면 안 된다. 편집 UI의 pull 버튼은 Server Action → `/api/pull` 내부 호출이 아니라, **Server Action이 직접 pull 로직을 부른다**(Route Handler는 cron 전용 진입점). 어느 쪽이든 커밋 작성자는 App이다.

## POSTMORTEM 소환

착수 전 grep 결과 셋이 걸린다:

1. **모듈 로드 시점 환경변수** (2026-08-31, 재발 1회) — `lib/github.ts`가 `GITHUB_APP_ID`·PEM을 읽는다. **모듈 최상위·기본값 인자에서 평가하지 않는다.** 재발 항목이 명시하듯 `f(x, requireEnv(...))`도 최상위 평가다. App 클라이언트는 지연 생성한다(`getPrisma()`와 같은 형태).
2. **PEM 개행 복원** — `parsePrivateKey`가 이미 있고 테스트도 있다. 안 쓰면 JWT 서명이 **조용히** 실패한다.
3. **외부 계약 페이로드를 리터럴로 조립** (2026-08-31) — 트리·커밋 요청 본문이 정확히 그 부류다. 페이로드 조립 함수에 **반환 타입을 명시**해 필드 누락을 컴파일 에러로 만든다.

## ⚠️ 미결 — base 브랜치 (설계를 바꾸는 지점)

**실측한 사실이 서로 어긋난다:**

| | 값 |
|---|---|
| `Project.baseBranch` (DB) | `main` |
| `Project.lastCommitSha` | `baf494ee` |
| 그 커밋이 있는 곳 | **`dev`에만.** `origin/main`에는 없다 |

즉 지금 적재된 키 집합은 `dev` 기준인데 pull은 `main`에서 트리를 딴다. 그대로 돌리면:

- `main`의 ts-dict 파일 내용이 `dev`와 다를 수 있고, 치환 대상 키가 없으면 **조용히 아무것도 안 바뀐다**(수술적 치환은 없는 키를 만들지 않는다).
- PR이 `main`을 향해 열리는데 개발자의 작업 브랜치는 `dev`다.

TASKS §7의 🔒 "대상 리포 base 브랜치 결정"이 6단계에서 이미 걸린 것이다. **`dev`로 통일하는 쪽을 권한다** — bugshot-2의 실제 작업 브랜치이고, 적재된 커밋도 거기 있으며, `main`은 보호 브랜치라 PR을 열어도 머지 흐름이 한 겹 더 생긴다.
