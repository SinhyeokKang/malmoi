# spec — composite action v2: Node 24 판 + pnpm store 캐시

## 사용자

**개발자**(대상 리포에 워크플로를 붙이는 사람). 번역 편집자는 이 변경을 보지 않는다 — 적재 결과·보류 판정은 그대로다.

## 문제 (관측)

- action 안의 `pnpm/action-setup@v4.4.0`·`actions/setup-node@v4.4.0`와 생성 워크플로의 `actions/checkout`(SHA 핀, `# v4`)이 전부 `using: node20`이고 run 로그에 **Node 20 사용 중단 경고**가 난다(2026-09-24 run, `malmoi-test-org/i18n-workflow-check`).
- 대상 리포의 `malmoi-i18n` run이 **30~50초**다(2026-09-27 — 표면 하나 31초 중 action 21초, 표면 둘 49초 = action 26초 + 14초, `docs/ACTIONS.md`). 캐시가 없어 매 run이 콜드 설치다. `--ignore-scripts`는 효과가 없었다(launch-readiness L7.7).
- ⚠️ **그 시간이 누구의 비용이라는 관측은 없다** — 불만·제보·과금 사례가 없다. 개선 여지가 보여 하는 것이고, 그래서 캐시는 **선택**이다(아래 완료 조건 B).
- ⚠️ 기준선 454패키지는 **태그 lockfile**로 잰 값이다. HEAD lockfile은 673패키지(태그 575)라 v2의 콜드 기준선은 T1에서 다시 잰다.

## 결정

| 판정 | 근거 |
|---|---|
| **새 태그 `malmoi-i18n-push-v2`를 끊는다**(v1은 안 옮긴다) | v2에는 HEAD 스크립트가 같이 나가고, 그 안에 v1 소비자에게 새 red가 되는 판정 다섯 이상이 있다(ACTIONS §3). v1 소비자는 아무것도 안 바뀌고, 새 온보딩과 워크플로를 다시 복사한 리포만 v2를 받는다 |
| 판 교체가 **필수**, 캐시는 **선택** | 캐시 입력(`cache`)이 `pnpm/action-setup` v6에만 있어 판 교체가 선행이다. 캐시가 목표에 못 미쳐도 판 교체는 출하한다 |
| 캐시는 `pnpm/action-setup`의 내장 `cache` | 허용 목록이 넷 그대로다(design) |
| 캐시 목표치는 T1 실측으로 정한다 | 가장 따뜻한 두 번째 호출도 14초였다 — 근거 없는 숫자를 먼저 박지 않는다 |

## 완료 조건

**A. 필수 — v2 판**

1. v2 action 안의 `uses:` 둘(`pnpm/action-setup` v6.1.0 · `actions/setup-node` v7.0.0)과 생성 워크플로의 `actions/checkout`(v7.0.1)이 **`runs.using: node24`**인 판이고 40자 SHA로 핀돼 있다. 판정: SHA 핀은 `scripts/__tests__/workflow-pins.test.ts`(`.github/`) + `lib/onboarding/__tests__/workflow.test.ts`(생성 YAML — 새 SHA 단언), node24 여부는 T0.1의 upstream `action.yml` 조회와 T7 run 로그의 Node 20 경고 0건.
2. **허용 목록이 넷 그대로다** — `SinhyeokKang/malmoi/.github/actions/malmoi-i18n-push` · `actions/checkout` · `pnpm/action-setup` · `actions/setup-node`. 판정: `lib/guide/__tests__/content.test.ts`(헬퍼 `lib/guide/__tests__/helpers/allowed-actions.ts`) green.
3. `setup-node`의 자동 캐시(`package-manager-cache`, 기본 true — 대상 리포의 `package.json`을 읽는다)가 **꺼져 있다**. 판정: 계약 테스트 단언 + T1 run 로그에 setup-node 캐시 스텝 없음.
4. `[skip-malmoi-i18n]` 커밋에서 새 스텝이 하나도 돌지 않는다. 판정: 계약 테스트(가드 `if`) + T1 push 트리거 run.
5. 대상 리포 워크스페이스에 **말모이 파일이 남지 않는다** — action 뒤 `git status --porcelain`이 action 전과 같다. 판정: T1 run 끝 스텝.
6. 생성 워크플로(`lib/onboarding/workflow.ts`)·`docs/ACTIONS.md` 스니펫이 `@malmoi-i18n-push-v2`와 새 checkout SHA를 말한다. v1 참조는 "기존 소비자" 설명에만 남는다. 태그 `malmoi-i18n-push-v2`가 원격에 있고, 생성 YAML을 내는 배포보다 먼저 생긴다.
7. 공개 가이드(`guide/setup/workflow.md`)에 **기존 소비자가 v2로 옮기는 방법** 한 문단이 있다 — "Settings → Workflow file에서 다시 복사해 덮어쓴다"(설정 모달이 전체 파일을 다시 만든다). ACTIONS.md에 v1↔v2 차이(새 red 목록)·캐시가 대상 리포 캐시 한도를 나눠 쓴다는 것·캐시가 `PUSH_TOKEN` 스텝의 의존성 공급 경로라는 것을 적는다.

**B. 선택 — 캐시** (A와 같은 릴리스. 미달이면 캐시 입력만 끄고 A를 출하한다)

8. **적중 run**의 "말모이 의존성"(install) 스텝이 T1이 정한 목표 이하다. 판정: 폐기용 리포에서 같은 커밋으로 미스·적중을 **각 3회** 돌려 `gh api …/jobs`로 install 스텝과 **job 전체**(post 저장 포함)를 기록한다.
9. 캐시가 **run 결과를 바꾸지 않는다** — 캐시 미스·서비스 불가·대상 리포가 pnpm이 아닌 경우(yarn/npm)·대상 리포에 `storeDir`/`store-dir`가 있는 경우 모두 green/red·적재가 캐시 없는 run과 같다. 뒤의 둘은 **감지해서 캐시를 끈다**. 판정: T1.3 갈래별 run.

## 비목표

- **v1 태그 이동** — v1은 2026-09-14 커밋에 그대로 둔다. v1 소비자의 Node 20 경고는 워크플로를 다시 복사해야 사라진다.
- **번들**(`push:local` 단일 JS 사전 빌드) — 캐시로도 부족하면 그때 PRODUCT §10에 올린다.
- **소비자용 `cache` on/off 입력**·캐시 키 커스터마이즈·재시도 — 입력 계약을 늘리지 않는다.
- **기존 소비자에게 알리는 경로**(알림·배너·이메일) — PRODUCT §4.2 "범용 알림 시스템"에 걸린다. 가이드·ACTIONS 문서 안내까지만 한다.
- setup-node 툴 캐시·tsx 컴파일 캐시.
- `pnpm/setup`(후속 action — pnpm v11+ 전용, 이 리포는 `pnpm@10.33.0`)·Node·pnpm 버전 자체 올리기.
- 비 ubuntu 러너(action은 `bash`·`ubuntu-latest` 전제, ACTIONS.md).
- action 안의 기존 한국어 로그 셋을 영어로 옮기기 — 새 경고만 영어로 쓰고 기존은 후속.
- 대상 리포가 `pnpm@<10.33.0 아닌 버전>`을 선언하면 "Multiple versions"로 red인 기존 버그 — 따로 판단한다.

## 이 디렉터리를 지우는 조건

A 전부 + B(달성 또는 "캐시 끄고 출하" 판정 기록) + 결론을 ACTIONS·ARCHITECTURE로 올린 뒤.
