# tasks — composite action v2

⚠️ **대상 리포는 태그를 본다** — main 머지만으로는 아무 소비자도 안 바뀐다. v1은 옮기지 않고 v2를 새로 끊는다(spec 결정). 검증은 폐기용 리포에서 **일회용 브랜치 SHA 참조**로 돌린다. (수동)은 `gh`·브라우저 실측이고 `pnpm test` 밖이다.

## T0 — 조회 (코드 없음, 수동)

- [ ] **T0.1** 판 셋의 태그 → 40자 커밋 SHA(주석 태그는 벗긴다): `pnpm/action-setup` v6.1.0(`ea17c68d…`) · `actions/setup-node` v7.0.0(`82076278…`) · `actions/checkout` v7.0.1(`3d3c42e5…`). 각 upstream `action.yml`의 `runs.using: node24`와 v5~v7 깨지는 변경을 design에 적는다(setup-node `package-manager-cache` 입력 이름 확인 포함).
  - 검증: 세 SHA가 `gh api repos/<r>/commits/<sha>`로 해석되고 `using: node24`.
- [ ] **T0.2** v1→HEAD 소비자 체감 변화 전수: `git diff malmoi-i18n-push-v1..origin/main -- scripts/ lib/cli/ lib/push/ lib/adapters/ .github/actions/`에서 exit 코드·red 조건·입력 해석이 바뀐 곳을 표로.
  - 검증: 표가 ACTIONS §3의 다섯 + `requestedFormat` 분기를 포함하고, 각 행에 파일:줄이 있다.
- [ ] **T0.3** 러너 도달 확인: `curl -s -o /dev/null -w '%{http_code}' -X POST https://dev.mal-moi.com/api/push`(인증 없이).
  - 검증: 앱 응답(401)이면 T1이 dev를 겨눈다. Vercel SSO 302면 T1의 green 판정을 T7로 미루고 T1은 install 스텝 시간만 잰다.

## T1 — 스파이크 (폐기용 리포, 수동) ⚠️ B(캐시)를 확정하는 단계

**ref**: 이 리포의 원격 일회용 브랜치 `spike/action-cache`(dev·main을 건드리지 않는다 — preview 배포 없음). **대상**: `SinhyeokKang/i18n-order-check`(json-catalog, dev App) + 필요한 갈래용 폐기용 리포. 대상 워크플로는 `uses: …/malmoi-i18n-push@<스파이크 SHA>`, `api-url: https://dev.mal-moi.com`(T0.3 결과에 따라), dev 프로젝트 토큰 secret.

- [ ] **T1.1** 기준선: v1 태그와 스파이크(캐시 끔)로 콜드 run 각 3회 — HEAD lockfile(673) 콜드 기준선. 그다음 스파이크(캐시 켬) 미스 1 + 적중 3.
  - 검증: 각 run의 install 스텝·action 단계·**job 전체(post 포함)** 시간을 `gh api …/jobs`로 표에 기록. 적중 install 스텝이 기준선 대비 얼마인지로 **B 목표치를 여기서 정한다**. 캐시 크기(Actions → Caches) 기록.
- [ ] **T1.2** 표면 둘 job(같은 action 두 번) 1회.
  - 검증: job green이고 두 번째 post 로그에 `ReserveCacheError`류가 **info/warning**으로 찍힘. 다음 run이 적중.
- [ ] **T1.3** 갈래별 1회씩:
  - (a) 대상 리포 `package.json`에 `"packageManager": "yarn@4…"` → 경고 한 줄 + 캐시 스텝 안 돎 + green(적재 결과가 캐시 없는 run과 같다). **`i18n-many-locales`(excalidraw 포크, yarn)**가 후보.
  - (b) 대상 리포 `pnpm-workspace.yaml`에 `storeDir: .pnpm-store` → 같은 판정.
  - (c) 대상 리포가 자기 job에서 먼저 `pnpm/action-setup`(`cache: true`)을 돈 뒤 우리 action → green, 미스 시 prefix 복원 크기·시간 기록.
  - (d) 캐시 불가: 호출 스텝 `env`로 `ACTIONS_RESULTS_URL`·`ACTIONS_CACHE_URL`을 비운다 → 로그에 action-setup의 캐시 불가 warning이 찍혔는지로 갈래를 밟았는지 판정. 못 밟으면 코드 근거(`isFeatureAvailable`)로 대체하고 design에 기록.
  - (e) `[skip-malmoi-i18n]` 커밋 **push 트리거**(dispatch는 `head_commit`이 없어 가드를 못 밟는다) → action 안 새 스텝 0개. 워크플로 job 수준 `if:`와 action 가드를 따로 보려면 job `if:`를 뺀 워크플로로 한 번.
  - (f) `target: sub/` → green, 복사본은 워크스페이스 루트에 생겼다 지워짐.
  - 검증: 각 run 끝 스텝 `git status --porcelain` 빈 줄(완료 조건 5), 결과가 캐시 없는 run과 같다(조건 9).
- [ ] **T1.4** 전 run 로그에 Node 20 경고 0건.
  - 검증: `gh run view <id> --log | grep -c "Node.js 20"` = 0.
- 결과를 design에 옮긴다. **B 목표 미달이거나 T1.3(c)의 위험이 크면 캐시 입력을 끄고(A만) 진행**한다(spec 결정). 스파이크 브랜치·워크플로·secret은 T1 끝에 지운다.

## T2 — 계약 테스트 먼저 (`/tdd`) — 커밋 ①

- [ ] **T2.1** `scripts/__tests__/action-cache.test.ts` — design "순수 함수" 절의 단언 전부(전제 단언 포함). B를 끄기로 했으면 캐시 단언 대신 "cache 입력이 없거나 false"와 `package-manager-cache: false`만.
- [ ] **T2.2** `workflow-pins.test.ts`에 `action.yml` 두 `uses:`의 기대 SHA 단언 · `workflow.test.ts`에 생성 YAML의 checkout v7 SHA·`@malmoi-i18n-push-v2` 단언.
  - 검증: `pnpm test`에서 **이 셋만** red이고 이유가 판·v2·캐시 스텝이다(`content.test.ts`·`onboarding.test.ts`는 아직 green — 허용 넷은 안 바뀌고 스냅샷은 T4에서 바뀐다).

## T3 — `action.yml` (`/implement`) — 커밋 ②

- [ ] **T3.1** 스텝: 가드 → 버전 읽기 → **캐시 준비**(bash: packageManager·storeDir 감지 → `cache` 출력, `mktemp -d` 복사 → `path` 출력, 끌 때 영어 경고) → `pnpm/action-setup@<v6.1.0 SHA>`(`version` 값, `cache: ${{ steps.<준비>.outputs.cache }}`, `cache_dependency_path: ${{ steps.<준비>.outputs.path }}`) → **복사본 삭제**(`if: always() && <가드>`, 그 출력 경로만) → `actions/setup-node@<v7.0.0 SHA>`(`package-manager-cache: false`) → 기존 install 이하 그대로.
  - 주석(한국어, 왜만): hashFiles 워크스페이스 함정 · `pnpm store path`가 대상 리포 설정을 읽는다 · setup-node 자동 캐시가 대상 리포 package.json을 읽는다 · post가 상태 키를 쓰므로 지워도 된다 · prefix 이름공간 공유.
  - 검증: T2 셋 green, `pnpm test` 전체 green.

## T4 — 생성 워크플로 (`/implement`) — 커밋 ③

- [ ] **T4.1** `lib/onboarding/workflow.ts`: checkout → v7.0.1 SHA, `@malmoi-i18n-push-v1` → `-v2`. `docs/ACTIONS.md` 첫 YAML 블록 같은 줄(줄 대조). `app/(edit)/__tests__/onboarding.test.ts:1845` 스냅샷 갱신.
  - 검증: `workflow.test.ts`·`onboarding.test.ts` green. `grep -rn "malmoi-i18n-push-v1" lib app components` = 0.

## T5 — 문서 (문서별 커밋) — 커밋 ④~

- [ ] **T5.1** `docs/ACTIONS.md`: 스니펫 v2 · v1↔v2 차이 표(T0.2) · run 시간 줄(T1 실측) · 캐시가 대상 리포 캐시 한도를 나눠 쓴다 · 캐시 = `PUSH_TOKEN` 스텝의 의존성 공급 경로(위협·수용 근거) · 기존 소비자는 워크플로를 다시 복사해 v2로 옮긴다 · **:19의 테스트 참조를 `lib/guide/__tests__/content.test.ts`로 정정**. `docs(ACTIONS): …`
- [ ] **T5.2** `guide/setup/workflow.md`: 기존 소비자 한 문단("Settings → Workflow file에서 다시 복사해 덮어쓴다", v2가 무엇을 바꾸는지 한 줄). `allowed-actions.md`는 변경 없음 확인(`@*`). `pnpm guide:check` 출력 인용 → stale 셋은 재촬영 없이 `guide/SHOOTING.md` blob SHA만 갱신. `docs(guide): …`
- [ ] **T5.3** `docs/ARCHITECTURE.md` §8에 캐시 공급 경로 위협·수용 근거 · 셋업 함정 셋(hashFiles·store path·setup-node 자동 캐시) 한 문단. `docs(ARCHITECTURE): …`
- [ ] **T5.4** `CLAUDE.md`(+`AGENTS.md` 미러)의 `@malmoi-i18n-push-v1` 언급을 v2 기준으로(v1은 "기존 소비자" 설명으로). `docs(CLAUDE): …`
  - 검증: `pnpm test` green(가이드 사실 대조 포함) · `pnpm sync:agents:check` · `grep -rn "push-v1" docs CLAUDE.md guide` 남은 줄이 전부 "기존 소비자"·v1↔v2 설명이다.

## T6 — `/push` → `/merge` (태그는 T8에서, 같은 `/merge` 안)

- [ ] 일반 절차. 검증: PR CI `verify` green.

## T7 — main squash SHA로 폐기용 리포 재실측 (수동)

- [ ] T1.1 워크플로를 `@<main squash SHA>`로 미스 1 + 적중 1(B를 켰으면), 아니면 1회.
  - 검증: 완료 조건 1(Node 20 경고 0)·3·5·9 재확인. T0.3에서 dev가 막혔으면 여기서 **프로덕션 URL + prod 폐기용 프로젝트**(`bugshot-i18n-test`)로 green 판정.

## T8 — v2 태그 (action 릴리스) ⚠️ 생성 YAML 배포보다 먼저

- [ ] `/merge` 8단계 squash 직후, Vercel 배포 완료 **전**에 `gh api repos/SinhyeokKang/malmoi/git/refs -f ref=refs/tags/malmoi-i18n-push-v2 -f sha=<squash SHA>`(새 태그라 force 없음).
  - 검증: `git ls-remote --tags origin malmoi-i18n-push-v2`가 squash SHA · 배포 뒤 온보딩 ④의 YAML이 v2 · 폐기용 리포 하나를 `@malmoi-i18n-push-v2`로 돌려 green(v2 첫 run은 미스 — 시간은 T1.1 미스 수준).
  - **롤백**: v2 소비자가 생기기 전(배포 직후)이면 생성기를 v1로 되돌리는 revert를 다음 배포로 보내고 v2는 그대로 둔다(태그 삭제·강제 이동 없이). 소비자가 생긴 뒤의 결함은 v1과 같은 규칙으로 **수정 커밋에 v2를 옮긴다**(이동 전 SHA를 기록). 판단 기준: 폐기용 리포 red · 사용자 제보.
- [ ] 결론(캐시 설계·함정 셋·실측·v1↔v2)을 ACTIONS·ARCHITECTURE로 올리고 이 디렉터리를 지운다(spec "지우는 조건").

## 결정 기록 (2026-09-27, /orchestrate 인테이크)

- **T0.3 결과: `dev.mal-moi.com`은 Vercel SSO 302다.** 사용자 결정 — T1은 **prod API(`https://mal-moi.com`) + prod 폐기용 프로젝트로 green까지** 잰다(T7을 기다리지 않는다). 스파이크 ref는 dev HEAD의 스크립트를 prod v1.0.0 서버에 보낸다(그 사이 코드 변경 없음).
- prod 폐기용 프로젝트·push 토큰은 **스파이크 워커가 prod UI(ego-browser)로** 만든다 — 대상 `SinhyeokKang/i18n-order-check`(prod App 설치 전제, 먼저 확인). 표면 둘(T1.2)용 표면도 같은 프로젝트에 더한다. 끝에 토큰 회전 또는 프로젝트 보관을 리포트에 남긴다.
- 외부 쓰기 승인: ① 이 리포 원격 일회용 브랜치 `spike/action-cache`(지휘자가 push) ② `i18n-order-check`의 일회용 브랜치·워크플로·secret(T1 끝에 삭제, 캐시도 삭제).
- **T1.3(a) yarn 갈래는 포크 픽스처(`i18n-many-locales`)가 아니라 `i18n-order-check` 일회용 브랜치의 `package.json`에 `packageManager: yarn@4…`를 넣어 밟는다** — 포크는 쓰기 검증에 쓰지 않는다(runtime-test §7.1).
- 순서: 코드 워커(T0.1·T0.2·T2·T3·T4, 캐시 켬) → 스파이크 SHA로 T1 → B 판정 → 같은 코드 워커가 B 반영 + T5 문서 → dev 통합·push. **T6~T8은 `/merge` 몫이다**(이 오케스트레이션 밖).
- **T1 대상 교체**(사용자, 같은 날): prod App `malmoi-sync`가 `i18n-order-check`에 설치돼 있지 않아 **`SinhyeokKang/bugshot-i18n-test`(폐기용, 기본 브랜치 `dev`, 기존 `CI` 워크플로 있음)**로 바꾼다. 위의 외부 쓰기 승인·yarn 갈래 대체가 이 리포에 그대로 적용된다. 기존 prod 프로젝트가 있으면 그것을 쓴다.
- **B 판정: 캐시를 끄고 A만 출하한다**(T1 실측, spec "미달이면 캐시 입력만 끄고 A를 출하"). setup+install 3회 평균 — v1 15.7s · v2 캐시 끔 19.9s(v6 self-installer +~3.3s) · 캐시 미스 19.2s(post 저장 +5.1s) · 적중 15.0s(install 3.5s지만 292MB 복원이 pnpm 스텝을 10~13s로 늘림). 적중 이득이 v1 대비 ~0.7s라 제안 목표(v1 콜드 50%)에 못 미친다. 표면 둘 job은 둘째 셋업이 store를 지워 **빈 캐시(9.66KiB)가 저장되고 다음 run이 거기 "적중"해 콜드 설치**하는 결함까지 있다. 스파이크 run id·표 전체는 T1 인계(`.scratch/handoff-T1.md`)에서 ACTIONS로 옮긴다.
- **T1이 찾은 v2 차단 결함**: HEAD `push:local`이 `scripts/local.ts`를 거쳐 `generated/prisma/client`를 import해 러너에서 `ERR_MODULE_NOT_FOUND`(516a396c 이후). C1 r2가 고쳤다(`scripts/local-env.ts` + import 그래프 테스트).
- **v1부터 있던 문제(범위 밖, 후속)**: 대상 리포가 자기 job에서 먼저 pnpm을 깔고 캐시를 쓰면, 우리 `pnpm/action-setup`이 다시 깔며 PNPM_HOME store를 지우고 대상 리포 자기 캐시 키에 말모이 store가 저장된다(v1 태그 대조 run에서도 같다).
