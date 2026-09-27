# design — composite action v2

## 영향 받는 흐름

**push**(대상 리포 CI → `/api/push`)의 앞단 — composite action의 셋업 스텝. 서버는 안 바뀐다. v2 태그에는 HEAD의 `scripts/push-local.ts`가 같이 나가 v1과 red 조건이 다르다(아래 "v2가 v1과 다른 것").

사용자에게 보이는 표면:
- 생성 워크플로 YAML — 온보딩 ④ **와** 설정 화면 Workflow file 모달(`app/(edit)/projects/[slug]/settings/page.tsx`) — 둘 다 `renderProjectWorkflowYaml`(`lib/onboarding/workflow.ts`)을 쓴다. Add surface 결과 화면은 step만 보여 영향 없음.
- 공개 가이드 `guide/setup/workflow.md`(기존 소비자 안내 한 문단) · `allowed-actions.md`(`@*` 패턴이라 변경 없음).
- 대상 리포 run 로그의 새 경고(영어).
- 가이드 스크린샷: `pnpm guide:check`가 매핑 소스(`workflow.ts`·`action.yml`) 변경으로 `workflow-file`·`actions-policy`·`push-token-secret` 셋을 stale로 띄운다. **픽셀 변화가 없다**(checkout 줄은 `workflow-file.webp`의 스크롤 아래, 허용 목록 넷 그대로, 나머지는 GitHub 화면) — 재촬영 없이 `guide/SHOOTING.md`의 blob SHA만 갱신한다.

## 결정: 새 태그 v2

v1을 옮기면 HEAD 스크립트의 새 red(ACTIONS §3의 다섯: JSON 중첩·점 키 충돌 · YAML 점 키 충돌 · `api-url` https 거부 · 읽기 실패 `prepare-failed` · 실패 보고 `executionId`, 그리고 `requestedFormat`의 exit 1/2 분기 — T0.2가 diff로 전수 확정)가 기존 소비자에게 예고 없이 도착한다. **v2를 새로 끊으면** 기존 소비자는 v1 그대로이고, 새 온보딩·재복사한 리포만 v2다(ACTIONS.md "호환이 깨지면 `-v2`를 새로 끊는다"의 경로).

⚠️ **순서**: 생성 YAML이 `@…-v2`를 가리키는 배포가 나가기 **전에** 태그가 있어야 한다 — 없으면 그 사이 온보딩한 리포의 첫 run이 `unable to resolve action`이다. 같은 squash 커밋에 action 코드와 생성기 변경이 같이 들어가므로 **`/merge` 8단계 squash 직후 · Vercel 배포 완료 전**에 태그를 그 SHA로 만든다(T8). v2 태그는 v1과 같은 규칙으로 **수정 릴리스만 옮긴다**.

v2가 새 태그라 `actions/cache`를 써도 v1 소비자는 안 깨지지만, 새로 붙이거나 재복사하는 조직의 허용 목록은 늘어난다 — 넷 유지 판단은 그대로다.

## 결정: 캐시는 `pnpm/action-setup`의 내장 `cache`

| 후보 | 허용 목록 | 판정 |
|---|---|---|
| `actions/cache` 직접 | 다섯 | ✗ — 허용 목록을 쓰는 조직이 재복사 때 목록을 고쳐야 한다 |
| `actions/setup-node`의 `cache: pnpm` | 넷 | ✗ — 같은 hashFiles 함정 + 키 이름공간 `node-cache-…` |
| **`pnpm/action-setup`의 `cache: true`** (v6.1.0) | 넷 | ✓ |

upstream 확인(2026-09-27, CTO 검수): `src/index.ts`가 `installPnpm` → `addPath` → 캐시 복원 순이라 복원 시점에 pnpm이 PATH에 있다. post(`src/cache-save/run.ts`)는 `getState`만 쓰고 해시를 다시 계산하지 않는다.

### ⚠️ 함정 1: 캐시 키가 워크스페이스 밖 파일을 못 본다

`src/cache-restore/run.ts`가 `hashFiles(cacheDependencyPath)`로 키를 만들고 **빈 해시면 던진다**. `@actions/glob` `internal-hash-files.js`는 `GITHUB_WORKSPACE` 밖 파일을 조용히 무시한다. 말모이 lockfile은 `${{ github.action_path }}/../../../pnpm-lock.yaml` — 워크스페이스 밖이다. 그대로 넘기면 **스텝 실패 → run red**다. 같은 뿌리의 함정이 이미 한 번 있었다(`action.yml` "버전 읽기" 주석 — `package_json_file`·`node-version-file`).

**해법**: 셋업 직전 `mktemp -d "$GITHUB_WORKSPACE/.malmoi-i18n-cache.XXXXXX"`로 만든 디렉터리에 lockfile을 복사하고 그 경로를 스텝 출력으로 넘겨 `cache_dependency_path`에 준다. 셋업 직후 **그 출력 경로만** `rm -rf`한다(`if: always()` + 가드). `hashFiles`는 경로가 아니라 **내용**만 해시하므로 랜덤 경로여도 키가 안정하고, 대상 리포 파일과 충돌할 수 없다 — "이미 있으면" 갈래가 필요 없다.

- 상대 경로의 기준은 `process.cwd()`(`internal-pattern.js`) — `uses` 스텝의 cwd가 워크스페이스라 같지만, 절대경로(`${{ github.workspace }}/…` 또는 mktemp 출력)로 준다.
- 복사 위치는 `target` 입력이 아니라 `GITHUB_WORKSPACE` 루트다(`target`이 하위 디렉터리일 수 있다).

### ⚠️ 함정 2: `pnpm store path`가 대상 리포 설정을 읽는다

복원의 `getCacheDirectory()`가 `pnpm store path --silent`를 **대상 리포 워크스페이스**에서 돈다.
- 대상 리포의 `packageManager`가 pnpm이 아니면(yarn/npm) `ERROR This project is configured to use yarn` exit 1 → `setFailed` → **red**(로컬 재현). 지금 v1(캐시 없음)은 green인 리포들이다.
- 대상 리포 `pnpm-workspace.yaml`/`.npmrc`에 `storeDir`/`store-dir`가 있으면 그 경로가 캐시 경로가 된다 — 우리 install(`action_path`에서 돈다)은 다른 store에 쓰므로 복원이 엉뚱한 곳에 풀리고, post 저장에서 경로가 없으면 `@actions/cache` `saveCacheV2`의 `Path Validation Error`가 try 밖에서 던져져 **red**다. `npm_config_store_dir` env는 `pnpm-workspace.yaml`의 `storeDir`를 이기지 못했다(로컬 실측).

**해법(감지해서 끈다)**: 복사 스텝(bash)이 `$GITHUB_WORKSPACE/package.json`의 `packageManager`가 `pnpm@`으로 시작하지 않으면서 비어 있지도 않거나, `pnpm-workspace.yaml`의 `storeDir` / `.npmrc`의 `store-dir`가 있으면 `cache=false`를 출력하고 경고 한 줄을 낸다. 그 리포는 지금 속도 그대로다(회귀 없음).

### ⚠️ 함정 3: `setup-node` v7의 자동 캐시

`actions/setup-node@v7.0.0`은 `package-manager-cache`(기본 `true`)가 켜져 있으면 `src/main.ts`의 `getNameFromPackageManagerField()`로 **`GITHUB_WORKSPACE/package.json`(대상 리포 파일)**을 읽는다. npm이면 npm 캐시가 켜지고 대상 리포의 `package-lock.json`을 해시하며, 없으면 throw → red. **`package-manager-cache: false`를 명시한다**(계약 테스트 단언).

### fail-open — 무엇이 던지고 무엇이 삼켜지나 (upstream 확인)

| 갈래 | 동작 | 우리 처리 |
|---|---|---|
| 캐시 서비스 불가(`isFeatureAvailable` — v2 서비스는 `ACTIONS_RESULTS_URL`을 본다) | action-setup이 `warning` 후 진행 | 없음 |
| `pnpm store path` 실패 · hashFiles 빈 해시 | **던짐 → red** | 함정 1·2의 해법으로 도달 불가 |
| post `Path Validation Error`·`ValidationError` | **던짐 → red** | 함정 2의 감지로 도달 불가 |
| post `ReserveCacheError`(같은 키 동시 저장 — 표면 둘 job) · 그 밖의 네트워크 오류 | `info`/`warning` 후 -1 | 없음 — **표면 둘 job도 red가 안 난다**. "첫 호출만 캐시" 분기는 필요 없다 |

새 경고 문구(영어 — run 로그 독자는 공개 서비스의 대상 리포 개발자다. 기존 한국어 로그 셋은 범위 밖):
- `::warning title=Malmoi dependency cache skipped::This repository uses <yarn|npm|a custom pnpm store dir>, so Malmoi installs its dependencies without cache. Results are unchanged, only slower.`

### 키 이름공간 — 속도·용량 위험

복원 키 접두사 `pnpm-cache-<RUNNER_OS>-<arch>-`가 **고정**이다(`restoreKeys`). 대상 리포가 자기 job에서 같은 action의 캐시를 쓰면 같은 이름공간이다. 정확 키(lockfile 내용 해시)는 달라 적중은 안 섞이지만, **미스 때 그 이름공간의 최신 항목이 복원된다** — 대상 리포의 GB급 store가 풀리면 미스 run이 콜드 설치보다 **느려질 수 있고**, 저장도 합집합이 올라가 대상 리포의 10GB LRU를 밀어낸다(`run_install`이 비어 prune도 안 돈다). T1에서 대상 리포 자체 pnpm 캐시가 있는 경우를 잰다. 위험이 크면 B(캐시)를 끈다.

### 보안 — 캐시가 `PUSH_TOKEN` 스텝의 코드를 공급한다

- **위협**: 캐시에 쓸 수 있는 것은 이 워크플로만이 아니다 — 대상 리포의 **다른 워크플로**(기본 브랜치 run · `pull_request_target` · 그 의존성의 postinstall)도 같은 이름공간에 쓸 수 있고, prefix 복원은 그중 최신 항목을 가져온다. 그 store의 코드가 `PUSH_TOKEN`이 env에 있는 `push:local` 스텝에서 실행된다.
- **pnpm 무결성 검사는 방어선이 아니다** — `verify-store-integrity`는 store index와 파일을 대조할 뿐 독이 든 store의 자기일관적 index를 못 막는다.
- **수용 근거**: 폭발 반경이 그 프로젝트의 push 토큰 하나다(토큰이 곧 프로젝트, ACTIONS.md) — 그 토큰은 그 프로젝트의 소스 키 적재만 한다. 대상 리포의 다른 워크플로를 쓸 수 있는 공격자는 이미 그 리포의 secret(`PUSH_TOKEN` 포함)을 자기 워크플로에서 읽을 수 있다 — 권한이 새로 는 것이 아니라 경로가 하나 는다.
- ARCHITECTURE §8·ACTIONS.md에 이 위협과 근거를 적는다(T5).

## v2가 v1과 다른 것 (T0.2가 확정)

`git diff malmoi-i18n-push-v1..HEAD -- scripts/ lib/cli/ lib/push/ lib/adapters/ .github/actions/`로 소비자 체감 변화를 전수로 뽑아 ACTIONS.md에 표로 둔다. 지금 아는 것: §3의 다섯 + `requestedFormat` exit 코드 분기 + lockfile 575→673.

## 순수 함수로 분리 가능한 부분

**없다 — 이 변경은 YAML과 셸이다.** `/tdd` 대상은 계약 테스트:

- `scripts/__tests__/action-cache.test.ts`(신규) — `action.yml`을 `yaml`로 파싱해:
  - **전제 단언**: 스텝을 1개 이상 찾았고 `pnpm/action-setup`·`actions/setup-node` 스텝이 각각 정확히 하나다(POSTMORTEM 2026-09-10 "돌지 않는 스위트의 거짓 green" — `workflow-pins.test.ts:46-48` 관례).
  - `pnpm/action-setup` `with.cache`가 복사 스텝 출력을 받고 `cache_dependency_path`가 그 스텝의 경로 출력이다.
  - 복사 스텝이 셋업 **앞**, 삭제 스텝이 셋업 **뒤**이고 삭제가 `always()`를 든다.
  - 새 스텝 전부가 가드 `steps.guard.outputs.skip != 'true'`를 든다.
  - `setup-node` `with.package-manager-cache`가 `false`다.
  - `pnpm install`에 `--frozen-lockfile`이 남아 있다.
- `lib/onboarding/__tests__/workflow.test.ts` — 생성 YAML에 `/@[0-9a-f]{40} # v7\./`(checkout)와 `@malmoi-i18n-push-v2`가 있다는 단언을 **새로** 넣는다(지금은 ACTIONS.md와 줄 대조만 하고 주석을 벗긴다 — 판을 안 본다).
- `scripts/__tests__/workflow-pins.test.ts`에 `action.yml`의 두 `uses:`가 기대 SHA라는 단언을 넣는다(지금은 40자·`# vN` 존재만 본다).
- 기존 `lib/guide/__tests__/content.test.ts`(허용 넷) · `app/(edit)/__tests__/onboarding.test.ts:1845`(생성 YAML 스냅샷)는 기대값만 바뀐다.

셸 감지 분기(packageManager·storeDir)는 단위로 못 잰다 — T1이 run으로 잰다.

## 스키마 변경 · 새 환경변수

없음. 없음.

## 불변식 영향

§0 없음 — export 결정성·blob SHA·인증 경계를 안 건드린다. 페이로드 생산자는 여전히 `lib/push/payload.ts` 하나다. `PUSH_TOKEN` 스텝의 **의존성 공급 경로**가 하나 는다 — 위 "보안".

## POSTMORTEM 인용

- **2026-08-31** — action이 페이로드를 셸로 조립하던 사고. 조립 스텝은 안 건드린다.
- **2026-09-03**(:281) — 권한 누락으로 열린 PR 조회 실패가 "PR 없음"으로 삼켜졌다. 이번 fail-open은 속도만 걸린 자리지만 **경고가 원인을 말해야** run 시간 회귀가 진단된다.
- **2026-09-10** — 돌지 않는 스위트의 거짓 green → 계약 테스트 전제 단언.
- **2026-09-17**(:2135) — 루프 마커는 커밋 메시지·PR 제목 둘 다. 가드 스텝은 그대로 첫 스텝이다.
