# 대상 리포에 붙이는 워크플로

**이 문서는 *대상 리포*(번역할 리포)에 무엇을 넣는지 다룬다.** 말모이 자신의 CI는 CLAUDE.md의 CI 섹션에 있다.

대상 리포는 워크플로 하나만 갖고, 실제 일은 말모이의 composite action(`.github/actions/malmoi-i18n-push`)이 한다. **페이로드를 셸·YAML로 조립하지 않는다** — 생산자는 `lib/push/payload.ts` 하나이고 action이 `scripts/push-local.ts`를 그대로 부른다 (POSTMORTEM 2026-08-31: 리터럴 조립이 계약 변경을 조용히 통과시켰다).

## 1. 말모이 쪽 설정 (한 번만)

**없다.** 말모이 리포가 public이라(2026-09-18) 어느 계정의 리포든 이 action을 참조할 수 있다. ⚠️ **private이던 동안에는** Settings > Actions > Access의 "Accessible from repositories owned by the user"가 필요했고 그 설정은 **소유자가 같은 리포만** 열어서, 다른 계정 리포는 자동 수집(push)이 원리적으로 안 돌았다 — `unable to resolve action`을 보면 리포가 다시 private이 됐는지부터 본다.

## 2. 대상 리포 쪽 설정

**Secret 하나**: `PUSH_TOKEN` — **그 프로젝트의 토큰 원문**이다 (2026-09-07부터. 말모이 설정 화면에서 발급하고, 서버는 해시만 갖는다). 값이 틀리거나 그 프로젝트가 아직 토큰을 발급받지 않았으면 `/api/push`가 **401**이고 어느 쪽이 틀렸는지는 알려주지 않는다 — **프로젝트 존재를 노출하지 않으려고** 무효 토큰과 없는 프로젝트를 같은 응답으로 접는다.

⚠️ **말모이 서버의 공유 env와 같은 값이 아니다.** 전에는 배포 전체가 토큰 하나를 들었고 그 값이 비면 500(`server misconfigured`)이었는데, 지금은 토큰이 곧 프로젝트라 서버에 그런 변수가 없다.

⚠️ **한 리포에 프로젝트가 둘이면 secret 하나로 둘을 먹일 수 없다.** 토큰이 프로젝트를 정하므로 **스텝 둘 + secret 둘**이 필요하고(`PUSH_TOKEN_CODE`·`PUSH_TOKEN_YAML` 식), 각 스텝의 `project`와 `adapter`가 다르다. prod에 그 모양이 실재한다 — `i18n-format-check` 하나가 `format-check-code`(code-dict)·`format-check-yaml`(yaml-catalog) 둘을 먹인다. **secret 이름은 자유다** — 위는 예시이고 서버는 값만 본다(PRODUCT §10, 2026-09-14 확정).

**조직이 action 허용 목록을 쓰면 넷을 전부 넣는다** (2026-09-24, launch-readiness L2.5): `SinhyeokKang/malmoi/.github/actions/malmoi-i18n-push` · `actions/checkout`(워크플로 파일) · `pnpm/action-setup` · `actions/setup-node`(**malmoi action 안** — `action.yml`). 하나라도 빠지면 run이 `not allowed to be used`로 멈춘다. ⚠️ **안쪽 둘은 대상 리포 파일에 안 보여서 빠뜨리기 쉽다.** 공개 도움말(`/docs#allowed-actions`)이 같은 넷을 들고, `lib/guide/__tests__/content.test.ts`(헬퍼 `lib/guide/__tests__/helpers/allowed-actions.ts`)가 실제 `uses:`에서 읽어 대조한다 — action에 `uses:`를 더하면 그 테스트가 red다. **실측(2026-09-24, `malmoi-test-org/i18n-workflow-check`의 리포 단위 허용 목록 — org 단위와 같은 매칭이다)**: 넷을 `<이름>@*`(`SinhyeokKang/malmoi/.github/actions/malmoi-i18n-push@*` · `actions/checkout@*` · `pnpm/action-setup@*` · `actions/setup-node@*`)로 넣고 "GitHub 제작 action 허용"을 끈 상태에서 run green, `pnpm/action-setup`만 빼면 **"Set up job" 단계**에서 `The action pnpm/action-setup@… is not allowed …`로 red — 안쪽 action도 job 시작 때 전부 해석되므로 적재 단계까지 가지 않는다. ⚠️ `actions/*` 둘은 "Allow actions created by GitHub"를 켜면 목록 없이도 통과한다.

**워크플로** `.github/workflows/malmoi-i18n.yml`:

⚠️ **아래 블록이 정본이다.** 말모이의 온보딩 결과 화면이 같은 스니펫을 slug만 바꿔 복사용으로 내고(`lib/onboarding/workflow.ts`의 `renderProjectWorkflowYaml`), **`lib/onboarding/__tests__/workflow.test.ts`가 이 문서의 첫 YAML 코드 블록을 읽어 줄 단위로 대조한다**(그 스캐너가 여는 펜스를 정규식으로 찾으므로 이 문서의 산문에 그 펜스 문자열을 쓰지 않는다) — 한쪽만 고치면 `pnpm test`가 red이고, 통과시키면 문서를 보고 붙인 리포와 화면을 보고 붙인 리포가 다르게 동작한다.

```yaml
name: malmoi-i18n

on:
  push:
    branches: ["main"]   # 대상 리포의 base 브랜치. bugshot-2는 dev다 (ARCHITECTURE §0 불변식 2)
                       # ⚠️ 설정 화면에서 기준 브랜치를 바꾸면 이 줄도 함께 고친다 —
                       #    안 고치면 CI가 영영 안 돌고 오류도 안 난다 (6b-3)
  workflow_dispatch:

# 같은 프로젝트에 두 push가 동시에 들어오면 뒤가 이기는 것이 맞다 —
# strict라 마지막 상태가 진실이고, 중간 결과를 남길 이유가 없다.
#
# ⚠️ **그룹 이름에 프로젝트 slug가 들어간다.** 기존 동일 리포의 별도 Project가 있으면
# (PRODUCT §7.1) 워크플로 스텝도 둘인데, `github.ref`만 쓰면 그 둘이 같은 그룹에 들어가
# `cancel-in-progress`가 한쪽을 죽인다 — 그 표면은 영영 적재되지 않고 취소는 실패로 보이지 않는다.
# `malmoi-i18n/sync-<slug>` 브랜치 이름에 slug를 넣은 것과 같은 이유다.
concurrency:
  group: malmoi-i18n-order-check-${{ github.ref }}
  cancel-in-progress: true

# ⚠️ **`pull-requests: read`가 없으면 열린 PR 경고가 뜨지 않는다.**
# 기본 GITHUB_TOKEN 권한으로는 `gh pr list`가 `Resource not accessible by integration`으로
# 거부된다. action은 그 실패를 별도 경고로 알리지만, 정작 필요한 경고는 사라진다.
permissions:
  contents: read
  pull-requests: read

jobs:
  push:
    # ⚠️ **이 조건이 1차 방어다.** pull이 만든 커밋이 머지되면 push가 돌고, 그 push가 DB를 리포
    # 값으로 덮고, 다음 pull이 또 PR을 만든다 (ARCHITECTURE §3). action 안에도 같은 가드가 있어
    # 빠뜨리면 러너 시작·action 다운로드 비용이 들지만, 내부 가드가 의존성 설치 전에 후속 스텝을 건너뛴다.
    if: "!contains(github.event.head_commit.message, '[skip-malmoi-i18n]')"
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1

      - uses: SinhyeokKang/malmoi/.github/actions/malmoi-i18n-push@malmoi-i18n-push-v3
        with:
          push-token: ${{ secrets.PUSH_TOKEN }}
          project: order-check
          surface: default
          path-template: "i18n/{locale}.json"
          adapter: json-catalog
          base-locale: en
          github-token: ${{ secrets.GITHUB_TOKEN }}   # for the open-PR warning (read only)
```

⚠️ **참조는 `@malmoi-i18n-push-v3`이고 `@main`이 아니다** (2026-09-09, sec-audit 발견 3 · v2는 2026-09-27 — 아래 "v1과 v2" · 생성기의 v3 전환은 2026-10-09 — 아래 "v3"). 이 스텝에는
`secrets.PUSH_TOKEN`과 `GITHUB_TOKEN`이 들어가므로, 참조가 움직이면 **말모이 `main`의 커밋 하나가
대상 리포의 러너에서 즉시 실행된다** — 소비자 측 리뷰도 롤백 창도 없다. `main`에는 이제 브랜치
프로텍션(required check `verify`, 2026-09-18)이 있지만 그것이 보는 것은 **테스트 green**이지 action이
남의 러너에서 할 일이 아니다 — 말모이의 CI 게이트가 남의 리포의 보안 경계가 되어서는 안 된다.

⚠️ **전에 이 문서와 `CLAUDE.md`가 `@main`을 "안전하다"고 적었는데, 그 논거는 *낡음*이었다** —
"action 변경이 dev에 있는 동안 대상 리포가 옛 버전을 쓴다"는 참이지만 축이 다르다. 묻는 것은
**가변성**이고, `main`에 닿는 커밋은 그 순간 전 소비자에게 나간다.

**태그를 옮기는 것은 릴리스다.** action을 고쳤으면 `main`에 머지한 뒤 현재 태그(`malmoi-i18n-push-v3`)를 그 커밋으로
옮긴다 — 소비자는 아무것도 안 고친다. 호환이 깨지는 변경이면 `-v3`를 새로 끊고 이 문서의 예시를
바꾼다(옛 태그는 그대로 두어 기존 소비자가 안 깨진다 — v1·v2가 그렇게 남았다).

### v1과 v2 (2026-09-27)

**새 온보딩과 워크플로를 다시 복사한 리포만 v2다.** `malmoi-i18n-push-v1`(8511d37, 2026-09-14)은 옮기지 않았다 —
v2에는 그 뒤의 `scripts/push-local.ts`가 같이 나가고, 그 안에 v1 소비자에게 **새 red**가 되는 판정이 있어서다(아래 표).
v1 리포는 아무것도 안 바뀐다. **v2로 옮기는 법**: 말모이 프로젝트 Settings → Workflow file의 파일 전체를 다시 복사해
`.github/workflows/malmoi-i18n.yml`을 덮는다(표면이 둘 이상이면 그 파일이 step을 전부 담는다). ⚠️ **손으로 더한 입력은 붙여넣은 뒤 다시 넣는다** — 생성 파일은 `wrapper`를 내지 않고(`renderSurfaceWorkflowStep`), 고친 `api-url`·트리거(`branches:` 등)도 생성값으로 돌아간다. `wrapper`가 빠지면 run은 green인 채 사용처(`refs`)만 조용히 빈다. v1 run 로그의
Node 20 사용 중단 경고는 옮기기 전까지 남는다.

| 무엇 | v1 | v2 |
|---|---|---|
| 셋업 action 판 | checkout v4 · `pnpm/action-setup` v4.4.0 · `setup-node` v4.4.0 (node20 — run마다 경고 1줄) | checkout v7.0.1 · `pnpm/action-setup` v6.1.0 · `setup-node` v7.0.0 (node24 — 경고 0) |
| JSON 카탈로그의 중첩·점 키 충돌 | green, 마지막 값 적재 | **red** `duplicate-key` |
| YAML의 점 키·중첩 충돌(`a.b:` + `a: {b:}`) | green, 조용히 접힘 | **red** `duplicate-key` |
| `api-url`이 https가 아니다(루프백 제외) | 평문으로 토큰 전송 | **red** exit 2, 요청 전 종료 |
| 로케일 파일 읽기 실패 | 빈 내용으로 부분 페이로드 | **red** exit 1 `prepare-failed` |
| ts-dict·code-dict의 같은 키 | 조용히 마지막 값 | green + `적재 경고 N건` 로그. code-dict는 가려진 앞 컨테이너의 키를 더는 적재하지 않는다(다음 적재에서 orphan) |
| BOM으로 시작하는 JSON | red `parse-failed` | green |
| 사용처 소스 파일 읽기 실패 | red | green + 경고, 그 파일만 스캔에서 빠진다 |
| `deferred` 응답 | 본문만 찍고 exit 0 | exit 0 + `::warning title=Malmoi import deferred::…` |
| 실행 식별자 `executionId` | 없음 | 실행당 UUID |
| `packageManager: pnpm@<같은 버전>+sha512…`인 대상 리포 | `pnpm/action-setup`이 `Multiple versions of pnpm specified`로 **red** | green(v6이 무결성 접미사를 벗겨 비교한다) |
| ts-dict `.tsx` 네임스페이스의 `path-template` | `…*.ts` | `…*.tsx` — 옛 값을 박은 워크플로는 후보를 못 찾을 수 있다 |

⚠️ **v2를 끊기 직전에 잡은 결함이 하나 있다** — main의 `push:local`이 `.env.local` 로더를 통해 Prisma 클라이언트를 물었고
(`generated/`는 gitignore된 산출물이라 action의 clone에 없다), 그대로 끊었으면 **모든 v2 run이 `ERR_MODULE_NOT_FOUND`로 red**였다.
v2는 그 수정(`scripts/local-env.ts`) 뒤의 커밋이다 — `scripts/__tests__/push-local-graph.test.ts`가 그 그래프를 상시로 센다.
판정의 근거·파일:줄은 `docs/features/action-run-cache/design.md` "v2가 v1과 다른 것"에 있었다 — 2026-09-28 v1.0.1 뒤 지웠으므로 `git log -- docs/features/action-run-cache`로 본다.

### v3 (nightly-sync — 2026-10-07 발행)

**`malmoi-i18n-push-v3`는 `bc8b204f`(v1.2.3, 2026-10-07)에 발행됐다.** **2026-10-09부터 온보딩·설정의 워크플로 생성기와 이 문서의 복사 예시가 v3를 안내한다**(`lib/onboarding/workflow.ts` — self-hosting 착수 전 확정). 워크플로를 다시 복사한 리포만 v3이고, v1·v2 리포는 아무것도 안 바뀐다(태그를 옮기지 않았다). 발행된 태그의 동작과 현재 코드의 동작은 구분한다 — 태그 뒤 `main`의 CLI 변경은 다음 태그 전까지 소비자에게 나가지 않는다. v2와 다른 것은 **셋**이다 — 보류 사유별 CLI 경고(서버가 열린 PR 보류 §3 표의 `open-pr`·`pr-check-failed`를 더했고, 그 응답엔 `pendingCount`가 없다), 열린 PR 안내 스텝의 문구(아래 "열린 PR이 있으면…" 절), 그리고 **관리하지 않는 값(`unmanaged`)이 red가 아니다**(§3 표 — v2는 그 값에서 exit 1이다).

⚠️ **v2 소비자는 서버 게이트가 나간 뒤 거짓 경고를 본다** — v2 태그의 `action.yml`은 열린 PR이 있으면 여전히 "이 push가 그 PR의 편집을 덮는다 (MVP 3.1의 손실 창)"를 찍는데, 서버가 적재를 보류하므로 그 문장은 더는 참이 아니다. 편집은 덮이지 않는다. **v3로 옮길 때까지** 이 경고는 무시해도 된다고 안내한다.

| `deferred` 응답의 `reason` | v2 CLI | v3 CLI |
|---|---|---|
| `pending-edits` (`pendingCount` 있음) | exit 0 + 미전달 편집 경고 | 같다 |
| `open-pr` | **exit 0, 경고 없음**(본문만 찍힌다) | exit 0 + `::warning title=Malmoi import deferred::a Malmoi pull request is still open — repository changes were not imported, so the translations in it aren't overwritten. Review the pull request and merge or close it; the next push or the nightly sync imports these changes.` |
| `pr-check-failed` | **exit 0, 경고 없음** | exit 0 + `::warning title=Malmoi import deferred::couldn't check whether the Malmoi pull request is still open — repository changes were not imported. Re-run this job later.` |

⚠️ **v2가 새 사유에서 경고 없이 green인 것은 의도다** — v2 CLI(`lib/cli/push-response.ts`의 옛 판정)는 `pendingCount`가 정수일 때만 경고하므로, 서버가 수를 싣지 않는 사유는 조용히 지나간다. 거짓 "0 unsent translation changes"보다 낫다. 본문(`"status":"deferred","reason":"open-pr"`)은 v2 run 로그에도 찍힌다. 경고 문구는 `lib/cli/__tests__/push-response.test.ts`가 고정한다.

⚠️ **앱 릴리스 태그(`v<x.y.z>`)는 action 계약이 아니다 — `@malmoi-i18n-push-vN`을 쓴다** (2026-09-27). `/merge`가
머지마다 `v1.0.0` 같은 태그를 만들고 그것도 `uses:`가 받는 유효한 ref지만, 앱 릴리스마다 움직이는 축이라
action 호환을 약속하지 않는다. 앱 버전이 올라도 action 태그는 안 움직인다.

⚠️ **action 안의 `uses:`도 전부 40자 SHA로 핀돼 있다** — 업스트림 태그 재지정(2025년
`tj-actions/changed-files`)이 같은 경로로 들어온다. `scripts/__tests__/workflow-pins.test.ts`가
`.github/` 전체를 훑어 가변 태그가 0건인지 상시로 센다(핀 옆의 버전 주석과 `ci.yml`의
`permissions: contents: read`도 같은 파일이 센다).

⚠️ **그 테스트가 이 문서도 읽는다** — 이 문서가 action을 `main`으로 참조하도록 안내하지 않는지, 그리고
`@malmoi-i18n-push-v3` 문자열이 실제로 있는지 검사한다(그 정규식이 문장의 산문에도 걸리므로 여기서
가변 참조를 예시로 쓰지 않는다). 위 스니펫의 태그를 고칠 때 그 두 조건이 함께 움직인다.

⚠️ **그 스캐너는 `.github/`만 본다 — 위 스니펫의 `actions/checkout` 줄은 그 방어선 밖이다.**
이 문서의 복붙 블록과 그것을 만드는 `lib/onboarding/workflow.ts`는 우리 리포의 워크플로가 아니라
**남의 리포로 나가는 텍스트**라 파일 경로로 걸러지지 않는다. 그 스텝은 `secrets.PUSH_TOKEN`을 든
job 안에 있으므로 **핀한다** — 고칠 자리가 셋(이 문서 · `workflow.ts` · 줄 대조하는
`lib/onboarding/__tests__/workflow.test.ts`)이고 한 커밋에 함께 움직여야 한다. 판(node24 SHA)은 그 테스트가 직접 박고,
action 안의 두 판은 `workflow-pins.test.ts`가 기대 SHA로 박는다 — 40자 SHA만 보면 node20 판으로 되돌려도 green이다.

✅ **배포 하나가 프로젝트 여럿의 push를 받고, 야간 pull도 준비된·보관되지 않은 프로젝트를 한 번에 50개까지 돈다** (2026-09-07 — push는 토큰이 프로젝트를 정하고, cron은 `lib/pull/targets.ts`가 고른 목록을 순회한다). 필터는 넷(`installationId`·**`repositoryId`**·`lastCommitSha` — 보관되지 않은 표면 중 하나라도(`planProjectReadiness`) ·`archivedAt`)이고 상한은 `PULL_BATCH_LIMIT` 50이다. ⚠️ **`repositoryId`는 2026-09-10에 붙었다** — 그 이전에 만들어진 행은 null이라 **OWNER가 재연결할 때까지 순회에서 빠진다**. 아래 예시들을 동시에 붙여도 서로 섞이지 않는다.

⚠️ **토큰은 프로젝트를 만들 때 한 번, 그리고 설정 화면의 [토큰 재발급]으로 나온다** — 원문은 그 화면을 벗어나면 다시 볼 수 없고 서버는 해시만 갖는다. 재발급하면 **옛 토큰이 즉시 무효**이므로 이 리포의 secret을 같은 세션에 바꾼다.

대상 리포는 Node·pnpm 셋업이 필요 없다 — action이 말모이를 clone해 `.nvmrc`·`packageManager` 기준으로 세우고 `pnpm install`한다(`ubuntu-latest` 전제, run 시간의 대부분이 이 install이다). **v1은 run당 30~50초다**(2026-09-27 실측 — 표면 하나 31초 중 action 21초, 표면 둘 49초 = action 26초 + 14초). ⚠️ **v2는 셋업이 ~4초 느리다** — 셋업+install 3회 평균이 v1 15.7초 → v2 19.9초다(2026-09-27, `SinhyeokKang/bugshot-i18n-test` 표면 하나). `pnpm/action-setup` v6이 bootstrap pnpm을 깐 뒤 `self-update`하는 설치 경로라 그 스텝만 1.5초 → 4.4~5.7초가 됐다. **pnpm store 캐시는 재서 버렸다** — 적중해도 292 MB 복원이 pnpm 스텝을 10~13초로 늘려 셋업+install이 15.0초(v1 대비 −0.7초)였고, 한 job에서 action을 두 번 부르면(표면 둘) 둘째 호출이 store를 지운 뒤 빈 store(9.66 KiB)가 저장돼 그 뒤 run은 "적중"인데 콜드 설치였다. 다시 시도하려면 그 두 결함부터 푼다. ⚠️ `--ignore-scripts`로는 줄지 않는다 — 로컬 콜드 설치(새 store·빈 Prisma 캐시)에서 454패키지 27·29초 대 27·25초로 오차 안이었다(Prisma 엔진 24MB 다운로드가 몫이 아니다). `--prod`는 `tsx`가 devDependency라 `push:local`이 안 돈다. 줄이려면 설치 자체를 없애는 번들이다(launch-readiness L7.7).

⚠️ **알려진 한계 — 같은 job에서 이 action 앞에 pnpm을 설치하면 그 store가 지워진다**(v1부터 같다). `pnpm/action-setup`이 매번 `~/setup-pnpm`을 새로 깔고 기본 store가 그 아래(`PNPM_HOME`)에 있어서다 — 대상 리포가 같은 job에서 자기 `pnpm/action-setup`(`cache: true`)+install을 먼저 돌면 그 설치가 사라지고, 그 job의 post가 말모이 store를 대상 리포 캐시 키에 저장한다(2026-09-27 실측, v1 태그로도 재현). 이 action은 **별도 job**에 둔다(생성 워크플로가 그 모양이다).

### 표면별 입력과 추가 step

`surface`는 서버에 등록된 slug이며 action 기본값은 `default`다. `path-template`은 등록된 후보를 정확히 고른다.
CLI의 대응 옵션은 `--surface`·`--path-template`이다. 서버의 `surfaceSlug`는 성공·실패 보고 모두 필수이며 기본값이 없다.
없는·다른 프로젝트 표면은 동일한 `409 {"error":"surface mismatch"}`다. ⚠️ **앱에서 제거한 소스는 `409 {"error":"surface removed"}`다**
(2026-10-05) — 적재하지 않고 Logs에 거부로 남는다. 처방은 **워크플로에서 그 소스의 step을 지우는 것**이다. step이 남아 있으면 그 job이
red가 되고 **뒤 step의 다른 소스도 적재되지 않는다**(step은 순서대로 돌고 첫 실패에서 멈춘다). 따라서 409 가드는 보관 → 프로젝트 slug
→ 표면(불일치·제거) → 포맷 → 커밋 순서의 다섯 개다. 아래 step은 동일 프로젝트 토큰과 concurrency job을 공유한다.
Sources의 Add sources 결과에서 실제 등록 slug·path-template을 담은 step을 복사한다.
그 화면을 벗어났으면 **Settings의 워크플로 블록이 활성 표면 전부의 step을 담은 파일 전체를 낸다**
(`renderProjectWorkflowYaml`) — slug·path-template을 손으로 조립하지 않는다. 틀린 `surface:`는
그 표면에 저장된 포맷과 맞지 않아 409 `format mismatch`다(없는 slug면 `surface mismatch`) — 한 프로젝트의
표면은 `pathTemplate`이 겹치지 않고 `checkFormat`이 그것까지 비교한다.
`malmoi-i18n-push-v1`(8511d37)·`-v2`·`-v3` 모두 surfaceSlug를 생산한다. 삭제된 옛 `l10n-push-v1`은 생산하지 않았다.

<!-- additional-surface-step -->
```yaml
      - uses: SinhyeokKang/malmoi/.github/actions/malmoi-i18n-push@malmoi-i18n-push-v3
        with:
          push-token: ${{ secrets.PUSH_TOKEN }}
          project: order-check
          surface: web
          path-template: "web/{locale}.json"
          adapter: json-catalog
          base-locale: en
          github-token: ${{ secrets.GITHUB_TOKEN }}   # for the open-PR warning (read only)
```

### 리포마다 달라지는 것

| input | 언제 주는가 |
|---|---|
| `push-token` | **항상.** 그 프로젝트의 토큰 **원문**이다(서버는 해시만 갖는다) — 이것이 프로젝트를 정하고 `project`는 그 뒤에 대조된다. 재발급하면 옛 토큰이 즉시 무효라 이 리포의 secret을 같은 세션에 바꾼다 |
| `project` | **항상.** `push-token`이 정한 프로젝트의 slug와 다르면 409다 (오배송 거부 — ARCHITECTURE §5.5.5). 토큰이 먼저 프로젝트를 정하고 이 값은 그 뒤에 대조된다 |
| `target` | 로케일·소스가 **하위 디렉터리**에만 있을 때(모노레포). 기본은 `github.workspace`. `git rev-parse`도 이 경로에서 돈다 |
| `github-token` | **항상 권장.** 없으면 열린 번역 PR 경고 스텝이 통째로 빠진다 — 실패도 경고도 없이 조용히. ⚠️ **2026-09-30(nightly-sync)부터 이 스텝은 안내일 뿐이다** — 열린 PR이 있으면 서버가 이 토큰과 무관하게 적재를 보류한다(§3 `open-pr`). 빠지는 것은 push **전의** 한 줄뿐이다 |
| `adapter` | **말모이가 생성하는 YAML은 확정한 어댑터를 항상 명시한다.** 자동 탐지·수동 지정 여부와 무관하게 결과 화면과 설정 화면이 같은 값을 내므로, 복사 후 CI의 탐지 순위가 저장된 포맷을 바꾸지 않는다. **한 리포에 포맷이 둘이면 필수.** `ts-dict`도 2026-09-14부터 자동 탐지 후보에 오르지만(ARCHITECTURE §1.9 판정 ③) **1순위는 `detectCandidatesAcross`의 순위가 정한다** — bugshot-2는 `_locales` 4키가 크롬 버킷이라 `ts-dict` 903키보다 언제나 앞선다 → `adapter: ts-dict`. 명시가 없으면 순위가 다른 쪽을 골라 큰 쪽 키가 orphan된다 |
| `base-locale` | **`en`이 없는 리포는 필수.** 없으면 사전순 첫 로케일을 base로 추정하고, 틀리면 진짜 base에만 있는 키가 적재에서 빠져 orphaned로 떨어진다 — 키 집합은 base 파일이 정한다 (2026-09-04). ⚠️ **말모이 설정 화면에서 기준 언어를 바꾸면 이 값도 함께 고쳐야 한다** (6b-3): 화면은 "선언"만 저장하고 실제 전환은 **이 값을 든 다음 push**가 한다 — 안 고치면 CI는 계속 옛 base를 보내 통과하고(409가 아니다) 변경이 **영영 일어나지 않는다.** 그래서 대기 중에는 설정 화면의 워크플로 YAML이 이 줄을 무조건 박아 낸다. ⚠️ **2026-09-14부터 말모이가 내는 YAML은 대기가 아닐 때도 이 줄을 든다** — 온보딩 ③에서 탐지 1순위가 아닌 기준 언어를 고를 수 있고, 그때 이 줄이 없으면 CI가 1순위를 보내 `format mismatch` 409가 된다. 결과 화면과 설정 화면이 같은 값을 낸다 |
| `wrapper` | 기본값(`@/i18n#t`)이 아닐 때. 여러 개면 줄바꿈으로 나눈다 |
| `api-url` | 기본값이 `https://mal-moi.com`이라 호스팅 서비스에선 보통 생략. **self-hosted 설치의 워크플로엔 항상 있고 필수다**(아래 "self-hosted 설치").  **Malmoi가 생성한 워크플로는 프로덕션이 아닌 앱(dev·로컬)에서 만들면 그 origin을 이 입력으로 박는다**(`workflowApiUrl`).  ⚠️ **`.vercel.app`을 쓰지 않는다** — 프로젝트 리네임에 404가 되고 Deployment Protection이 Bearer를 무시해 302로 튕긴다(2026-09-04 실측). ⚠️ **https여야 한다** — 요청이 push 토큰 원문을 싣는다. `http:`는 루프백(`localhost`·`127.0.0.1`·`[::1]`)만 받고 그 밖이면 스텝이 exit 2로 red다 |

### self-hosted 설치

self-hosted 설치가 만든 워크플로는 **`api-url`을 항상 든다** — 값은 그 설치의 `MALMOI_ORIGIN`(HTTPS origin, 끝 슬래시 없음)이다. action의 기본값이 호스팅 서비스(`https://mal-moi.com`)라 이 줄이 빠지면 **push 토큰 원문이 우리 서비스로 간다**(그쪽은 401로 거절하지만 토큰은 이미 남의 서버에 도착했다). 그래서 설치 화면이 낸 파일을 그대로 쓰고, 손으로 옮겨 적을 때도 이 줄을 지우지 않는다. 설치의 판정이 무효(`invalid`)면 생성기가 줄을 생략하는 대신 워크플로 렌더를 거부한다(`workflowApiUrl`).

```yaml
      - uses: SinhyeokKang/malmoi/.github/actions/malmoi-i18n-push@malmoi-i18n-push-v3
        with:
          push-token: ${{ secrets.PUSH_TOKEN }}
          project: order-check
          surface: default
          path-template: "i18n/{locale}.json"
          adapter: json-catalog
          base-locale: en
          api-url: "https://<설치 origin>"   # 필수 — 그 설치의 MALMOI_ORIGIN
          github-token: ${{ secrets.GITHUB_TOKEN }}   # for the open-PR warning (read only)
```

⚠️ **공급망 의존이 하나 있다.** 위 `uses:`는 설치가 아니라 **상류 리포의 불변 태그**를 가리킨다 — self-hosted 설치의 대상 리포 CI도 우리 `malmoi-i18n-push-v3` 태그의 코드를 자기 러너에서 실행하고, 그 스텝에 그 프로젝트의 `PUSH_TOKEN`과 `GITHUB_TOKEN`이 들어간다. 설치를 고정 버전으로 두어도 이 태그는 설치 버전과 무관하게 움직일 수 있다(태그를 옮기는 것이 action 릴리스다 — 위). 이 의존을 받아들일 수 없는 운영자는 상류 리포를 포크해 `uses:`를 그 포크의 커밋 SHA에 고정할 수 있다 — 포크는 상류의 계약 변경을 자동으로 따라가지 않는다. 조직 허용 목록에 넣을 이름은 위 넷 그대로다.

훅 기반 리포의 예 (실측 형태 — ARCHITECTURE §4.0):

```yaml
        with:
          push-token: ${{ secrets.PUSH_TOKEN }}
          project: skillflo
          wrapper: |
            @/shared/i18n#useI18n()
```

```yaml
        with:
          push-token: ${{ secrets.PUSH_TOKEN }}
          project: bugshot-web
          wrapper: |
            next-intl#useTranslations()
            next-intl/server#getTranslations()
```

## 3. 무엇이 red를 만드는가

⚠️ **아래 표의 CLI 기본 기준은 `@malmoi-i18n-push-v2`다** — 새 워크플로는 v3지만(§2 "v3"), v2와 달라지는 행은 해당 행에 v3 판정으로, 발행된 태그에 아직 없는 현재 코드의 CLI 판정도 해당 행에 따로 표시한다. 서버 판정은 배포된 서버를 따른다. 워크플로를 다시 복사하지 않은 리포가 쓰는 `@malmoi-i18n-push-v1`(8511d37, 2026-09-14)과 다른 판정은 §2 "v1과 v2" 표에 있다 — action이 그 태그의 스크립트를 clone해 돌리므로 v1 리포에서는 그 표의 v1 열대로 동작한다.

**적재 실패만 red다.** 스캔 실패는 경고이고 exit 0이다 — 키의 진실은 로케일 파일이고 스캔은 `refs` 전담이라, 남의 리포 CI를 우리 스캐너 규칙으로 실패시키지 않는다 (ARCHITECTURE §4).

| 상황 | 결과 |
|---|---|
| 로케일 파일이 깨졌다·base 파일이 없다 | **red** — 연동이 성립하지 않는다 |
| **로케일 파일을 읽지 못했다**(권한·I/O 오류) | **red** (exit 1 — **서버까지 가지 않는다**, `prepare-failed`로 보고). 빈 파일로 읽으면 그 파일의 키가 페이로드에서 빠져 말모이가 삭제로 읽는다 — 부분 페이로드를 보내지 않는다 (2026-09-27, audit #7). ⚠️ **구 태그 `@malmoi-i18n-push-v1`에는 이 판정이 없다** — action이 그 태그의 `scripts/push-local.ts`를 clone해 돌리므로, v2로 옮기기(워크플로 재복사) 전까지 그 리포는 여전히 부분 페이로드를 보낸다 |
| **YAML·JSON 카탈로그에서 같은 키가 두 번** — YAML의 중복 키, JSON의 중첩·점 키 충돌(`{ "a": { "b": … }, "a.b": … }`) | **red** — `duplicate-key`. 두 값 중 하나가 사라지는 파일이라 서버까지 가지 않는다. 처방은 둘 중 하나를 지우는 것. ⚠️ JSON 충돌은 2026-09-17까지 조용히 마지막 값으로 적재됐다(green) — 그 뒤로 red다. ⚠️ **`duplicate-key`를 내는 어댑터는 이 둘뿐이다.** YAML의 점 키·중첩 충돌(`a.b: …` + `a: { b: … }`)도 2026-09-24부터 같은 red다. `ts-dict`·`code-dict`는 코드 객체의 같은 키(점 키·중첩 충돌 포함)를 **`duplicate-property` 경고**로 알린다 — JS 의미대로 마지막 값이 적재되고 malmoi가 그 자리를 고치므로 잃는 값이 없다. CI 로그에 `적재 경고 N건 — CI는 계속한다:`와 키 목록이 찍히고 **green이다**. `chrome-locales`는 중복 감지가 없어(JSON 파서가 접는다) 마지막 값만 남는다: **green이다** |
| `/api/push`가 4xx·5xx | **red** — **409가 다섯**(판정 순서대로 **보관** · 오배송 · **표면 불일치 `surface mismatch`**(앱에서 제거한 소스면 `surface removed`) · **표면 교체 `format mismatch`** · 커밋 역행)·스키마 위반(400)이 여기 걸린다 |
| **프로젝트가 보관됐다** | **red** — 409 `{"error":"archived"}`. ⚠️ **판정이 다섯 중 맨 앞이다**(`checkArchived`): 멈춘 프로젝트에서는 페이로드가 맞는지가 답할 질문이 아니다. **처방이 다른 넷과 다르다** — `adapter`·`base-locale`을 아무리 고쳐도 안 풀린다. 할 일은 **이 워크플로를 떼는 것**이거나 설정 화면에서 보관을 되돌리는 것이다 |
| `wrapper`·`adapter` 값이 형식·등록 목록에 안 맞는다 | **red** (exit 2 — 스캐너 규칙이 아니라 입력 형식이다) |
| `api-url`이 https가 아니다(루프백 `http:` 제외) | **red** (exit 2 — 토큰을 평문으로 보내기 전에 멈춘다) |
| **박아 둔 `adapter`·`base-locale`이 그 리포의 실제 탐지 결과와 안 맞는다** | **red** (exit 1 — **서버까지 가지 않는다**). 정확히 이 문서가 "박아라"라고 권하는 두 input의 실패 경로다 |
| **말모이에 아직 안 보낸 번역 편집이 있다** | **green + 적재 없음** — 200 `{"status":"deferred","reason":"pending-edits","pendingCount":N,…}` (2026-09-18, sync-edit-protection). 미전달 편집이 하나라도 있으면 **프로젝트 전체 적재를 보류**해 편집이 리포 값에 덮이지 않게 한다. 이 run의 새 키·삭제·로케일 변경도 앱에 **안 들어갔다**. 풀리는 길: 번역자가 Publish하고 열린 말모이 PR이 있으면 머지하거나 닫은 뒤 **현재 head의 새 push 또는 야간 동기화**로 최신 리포 상태 받기, 또는 OWNER가 앱의 `[Sync]`에서 편집 폐기를 승인하기. ⚠️ **Publish로 안 나가는 편집이 있다** (#129) — 언어 파일이나 키 자리가 리포에 없으면(코드에서 지운 base 키 포함) 그 편집은 보류되어 Publish 뒤에도 `deferred`가 이어진다. 그때 주된 해법은 **파일·키를 리포에 되돌려 놓기**이고, 아니면 폐기 승인 Sync, 되돌릴 기준이 있는 셀이면 OWNER의 `Revert to last sent`다. 경고 줄이 이 순서로 함께 말한다(응답 필드는 그대로다 — 서버는 어느 편집이 보류인지 모른다). ⚠️ **red가 아니다** — 남의 리포 CI를 앱 상태로 실패시키지 않는다. 새 CLI는 `::warning title=Malmoi import deferred::…` 한 줄을 더 낸다(구 태그 `@malmoi-i18n-push-v1`은 본문만 찍는다 — 그래도 exit 0이라 안전하다. 성공 본문은 `"status":"applied"`로 시작한다) |
| **말모이 번역 PR(`malmoi-i18n/sync-<project>`)이 아직 열려 있다** | **green + 적재 없음** — 200 `{"status":"deferred","reason":"open-pr",…}`(`pendingCount` 없음, 2026-09-30 nightly-sync). 미전달 편집이 0이어도 그렇다 — Publish가 커밋에 성공하면 편집 토큰이 비워지므로, PR이 머지되기 전에 적재하면 그 PR의 번역이 DB에서 옛 리포 값으로 덮인다. 이 run의 새 키·삭제도 앱에 **안 들어갔다.** 풀리는 길: **그 PR을 머지하거나 닫는다** — 그 뒤 **현재 head의 새 push나 야간 동기화가 최신 리포 상태를 받는다.** ⚠️ **이 job을 다시 돌리지 않는다** — PR이 머지된 뒤 옛 커밋의 job을 다시 돌리면 그 커밋의 옛 값이 방금 머지된 번역을 strict로 덮는다(야간이 이미 더 새 커밋을 적재했으면 409 `stale commit`이다). 닫은(머지 안 한) PR은 열린 PR로 세지 않는다. ⚠️ **GitHub App 설치나 리포 고정(`installationId`·`repositoryId`)이 없는 프로젝트엔 이 게이트가 없다** — PR을 낼 수 없으니 열린 PR도 없다. v2 CLI는 경고 없이 본문만 찍는다(§2 "v3") |
| **말모이가 열린 PR을 확인하지 못했다**(GitHub 오류·설치 토큰 실패·마감 초과) | **green + 적재 없음** — 200 `{"status":"deferred","reason":"pr-check-failed",…}`. ⚠️ **"PR 없음"으로 읽지 않는다**(fail-closed) — 그렇게 읽으면 GitHub 장애 동안 열린 PR의 번역이 덮인다. 대가로 **CI 적재가 GitHub 가용성에 묶인다.** 할 일: 조회가 가능해지면 **현재 head의 새 push 또는 야간 동기화**로 최신 리포 상태를 받는다. 계속되면 말모이 설정의 GitHub 연결(설치·리포 선택)을 본다 |
| **적재 확인 뒤 전달 확인이 바뀌었다** | **green + 적재 없음** — 200 `{"status":"deferred","reason":"publish-raced",…}`. 잠금 안에서 Last sent 또는 소스별 전달 확인 revision 변경을 감지하며 `no-changes` 완료도 포함한다. GitHub 조회 실패와 다른 사유다. 열린 말모이 PR이 있으면 머지하거나 닫은 뒤 현재 head의 새 push·야간 적재가 PR과 미전달을 다시 확인한다. 새 CLI는 별도 경고를 내며 이미 발행된 action 태그의 CLI는 본문만 표시할 수 있다 |
| **TS 키가 후행 spread·동적 computed에 가려졌다** | **현재 코드의 판정이며 발행된 v2·v3에는 없다**(v1.2.4에서 추가). 현재 CLI는 **red** — `key-shadowed` failure. 앞 문자열을 실행 시점의 값으로 확정할 수 없어 적재하지 않는다. 뒤의 명시적 리터럴은 자기 키를 다시 확정한다(ARCHITECTURE §1.4). 일반 리터럴 중복의 `duplicate-property` warning과 다르다 |
| **malmoi가 관리하지 않는 값**(`ts-dict`·`code-dict`의 식·참조·shorthand, YAML의 숫자·불린 — `unmanaged`) | **green + 로그 경고** — 그 키만 적재에서 빠지고 파일의 값은 Publish가 그대로 남긴다(잃는 번역이 없다). CI 로그에 `적재 경고 N건 — CI는 계속한다:`와 키 목록이 찍힌다. ⚠️ **v3 판정이다** — v2 태그의 스크립트는 이 값에서 **red**(exit 1)다(§2 "v3") |
| **`PUSH_TOKEN` secret이 비었다**(미등록·오타 이름) | **red** (exit 1 — 적재·스캔 전에 멈춘다. **서버까지 가지 않고 실패 보고도 없다**). composite action은 `required: true`를 강제하지 않아 빈 문자열이 넘어오고, 스크립트가 그것을 없음으로 읽는다. 401이 아니라 로그의 `PUSH_TOKEN이 없다`로 구별된다 |
| `head_commit.message`에 `[skip-malmoi-i18n]` | **green + `::notice`, 적재 없음** — pull이 만든 커밋이 머지될 때 무한 루프를 막는 가드다. 마커는 **커밋 메시지와 PR 제목 둘 다**에 있어 squash·rebase·merge commit 어느 방식이든 잡힌다(아래 "머지 방식"). "적재가 안 됐다"의 흔한 원인이라 여기 적는다 |
| 동적 키만 있어 `refs`가 0건 | green + 로그 한 줄 |
| 로케일 파일에 없는 키를 코드가 참조 | green + 로그 한 줄 |
| **로케일 파일을 지웠다** | green + 응답의 `orphanedLocales` 수가 는다(**개수뿐이다** — 어느 로케일인지는 응답에 없고, `deferred` 응답에는 이 필드 자체가 없다) — **red가 아니다.** 의도한 삭제인지 실수인지는 CI 로그에 남아야 사람이 안다. 그 뒤 pull PR도 그 파일을 내지 않는다 |
| 열린 번역 PR(`malmoi-i18n/sync-<project>`)이 있다 | green + **run 요약 경고** (아래) |
| 번역 PR **조회 자체가 실패**(`pull-requests: read` 누락 등) | green + 조회 실패 경고 — **실패를 "PR 없음"으로 읽지 않는다** |

### 적재 실패는 말모이에도 남는다 (2026-09-13)

**파싱에 실패하면 `/api/push`는 아예 안 불린다** — 그래서 그 실패는 오랫동안 이 리포의 Actions
로그에만 있었고, 말모이 쪽 목록에서는 그 프로젝트가 그냥 조용했다. 지금은 스크립트가 종료 전에
**`POST /api/push/failure`**로 사실 하나를 보낸다.

| 무엇 | 값 |
|---|---|
| 인증 | **같은 `PUSH_TOKEN`** — 새 토큰도 새 input도 없다 |
| 본문 | `{ projectSlug, surfaceSlug, commitSha, commitAt, code, executionId }` — 코드는 넷(`parse-failed` · `parse-crashed` · `invalid-locale-data` · `prepare-failed`). **닫힌 스키마라 `surfaceSlug`가 빠지면 400 `invalid report`다**(기본값이 없다 — 위 §"표면별 입력") |
| 응답 | 성공은 **204**(본문 없음). 거부는 401 · 400(`body too large` — 본문 상한 **4096바이트** · `invalid json` · `invalid report`) · 409(`archived` · `project mismatch` · `surface mismatch` · `surface removed` · `stale commit` · `stale report`) · 500 `{"error":"internal","ref":"…"}` — **전부 경고 한 줄로 접힌다** |
| 제한 | **5초 · 재시도 없음**. 비정상 응답·네트워크 실패는 경고 한 줄로 남고 **원래 진단과 exit 1은 그대로다** |
| 안 보내는 것 | 파서 원문 · 소스 문자열 · 로컬 절대경로 · 토큰 |

⚠️ **보고가 red를 대신하지 않는다.** 이 요청이 404를 받든 타임아웃이 나든 CI는 여전히 실패한다 —
보고는 부가 신호이고, 그것이 CI의 판정을 바꾸면 "말모이가 조용하면 괜찮은 것"이라는 잘못된 신호가 된다.

⚠️ **서버를 먼저 릴리스한다.** 기존 Action은 이 endpoint를 몰라도 정상 push가 계속되고, 새 스크립트가
옛 서버의 404를 받으면 위 규칙대로 경고만 남긴다. **대상 리포가 쓰는 action 태그는 서버 배포만으로
새 스크립트를 받지 않는다** — 그 태그를 옮기는 것이 릴리스다(CLAUDE.md). v1은 옮기지 않으므로 v1 리포는 워크플로를 다시 복사해야 받는다.

**red일 때 어디를 보나.**

⚠️ **401부터 푼다 — 토큰이 틀리면 400·409를 아예 못 본다.** JSON 파싱과 zod 검증이 **인증 뒤에** 있다(`app/api/push/route.ts` — `maxDuration = 60`인 공개 엔드포인트라 무효 토큰 하나로 1446키 페이로드를 파싱시키고 zod `issues`로 스키마 구조까지 받아 가게 두지 않는다). 그래서 페이로드가 아무리 깨져 있어도 토큰이 안 맞으면 응답은 401이다 — 진단을 페이로드에서 시작하면 엉뚱한 곳을 판다.

응답 본문이 run 로그에 **800자**까지 찍힌다(`lib/cli/push-response.ts`의 `reportPushResponse`가 든 `slice(0, 800)` — `scripts/push-local.ts`는 부르기만 한다 — 바이트가 아니라 UTF-16 문자다. 한국어 문구가 실리면 실제 상한이 최대 ~2,400바이트다). 4xx는 본문으로 진단된다 — 400은 `{"error":"invalid payload", issues}`(zod) 또는 `{"error":"invalid json"}`(본문이 JSON이 아닐 때) 또는 `{"error":"body too large"}`(본문 **4,500,000바이트** 초과 — Vercel 함수의 요청 본문 상한 이하로 잡은 값이다. 플랫폼 상한이 2진 4.5 MiB라면 그 사이의 페이로드는 여기서 걸린다), 409는 다섯이고 **보관이 맨 앞이다**(`{"error":"archived"}` — 위 표 참고) — 나머지 넷은 판정 순서대로 slug 오배송(`expected/got`) · 표면 불일치(`surface mismatch`) · **표면 교체**(`format mismatch` — `got`이 `adapter`·`pathTemplate`·`baseLocale` 객체이고, `expected`엔 거기에 **`declaredBaseLocale`이 하나 더** 실린다: 대기 중인 프로젝트의 CI 로그에서 "선언한 그 값도 받아들여진다"가 보여야 한다 — 6b-3) · 커밋 역행(`commitAt/lastCommitAt`)이다. ⚠️ **표면 교체가 커밋 역행보다 앞이다** — 둘 다 걸린 run은 `format mismatch`를 받는다. 표면 교체는 워크플로에 `adapter`·`base-locale`이 안 박혀 CI가 탐지 1순위를 보낼 때 난다. ⚠️ **같은 409의 두 번째 경로가 있고 그쪽엔 이 처방이 안 듣는다** — 리포가 **로케일 파일 경로를 옮긴** 경우다(`checkFormat`이 `pathTemplate`도 비교하므로 워크플로에 무엇을 박아도 영구 red다). 서버는 리포 트리를 읽지 않아(GitHub 호출은 열린 PR 조회 하나뿐이다) 정당한 이전을 오배송과 구별할 수 없다 — ⚠️ **재설정 UI는 아직 없다**(7단계가 `needs_configuration`을 후속으로 미뤘다, PRODUCT),  **401은 `{"error":"unauthorized"}` 하나뿐이다**(헤더 없음·토큰 오타·미발급 프로젝트가 전부 같은 응답이다 — 프로젝트 존재를 노출하지 않는다. 404는 2026-09-07에 사라졌다). **500은 `{"error":"internal","ref":"…"}`** 이고 원인은 말모이 Vercel 로그에 `[push] <ref>`로 있다(대상 리포가 public일 수 있어 남의 라이브러리 메시지는 싣지 않는다 — ARCHITECTURE §6.0). 우리 문구(`MissingEnvError`·`AppError`)는 그대로 온다.

### 실행 식별자 — 같은 실행이 두 줄이 되지 않게 한다 (2026-09-20)

말모이의 활동 이력은 **실행 하나를 한 줄로** 보인다. 그 판정에 커밋 SHA를 쓸 수 없어서 — 같은 커밋을
다시 처리하는 것은 **별도 실행**이다 — 생산자가 식별자를 하나 발급한다.

| 무엇 | 값 |
|---|---|
| 필드 | `executionId` — UUID. **정상 push와 실패 보고에 같은 값**이 실린다 |
| 언제 발급하나 | **소스별 실행 시작, 파싱·페이로드 조립 이전에 한 번.** HTTP 재전달은 같은 값을 유지한다 |
| 무엇이 새 값인가 | **새 CLI 호출 · 워크플로 재실행.** 그 둘은 실제로 다른 실행이다 |
| 서버가 하는 일 | 인가된 프로젝트·확인된 소스 아래에서만 쓴다. **인증 증거가 아니다** |

⚠️ **전환 순서는 "서버 먼저, 생산자 나중"이다.** 서버는 이 필드를 **선택**으로 받는다 — 식별자 없는
구 생산자의 요청은 계속 처리되고, 서버가 요청별 값을 대신 쓴다. 그 상태에서는 **HTTP 재전달의 중복
방지가 보장되지 않는다**(재전달마다 다른 값이라 줄이 둘이 될 수 있다).

⚠️ **새 생산자를 구 서버에 먼저 연결하지 않는다.** 실패 보고의 스키마가 **닫혀 있어**(`strictObject`)
모르는 필드를 400 `invalid report`로 거부한다 — 그러면 원래 실패가 보고 실패로 바뀐다.

⚠️ **대상 리포가 쓰는 action 태그는 서버 배포만으로 새 스크립트를 받지 않는다** — 그 태그를
옮기는 것이 릴리스다(CLAUDE.md). 순서: **서버 배포 → 태그 릴리스 → 사용 리포 전환.** `executionId`를 내는 생산자는 v2부터다.

### 열린 PR이 있으면 서버가 적재를 보류한다 (2026-09-30 판정 반전)

번역 PR이 머지되기 전의 push는 그 편집을 덮었다 (ARCHITECTURE §0 불변식 2의 손실 창 — 2026-09-03에 실증됐다). **2026-09-30(nightly-sync)부터 서버가 막는다** — `/api/push`가 인증·미전달 편집 사전 집계 뒤에 GitHub App installation 토큰으로 열린 말모이 PR을 조회하고, 있으면 적재 전체를 `deferred`(`open-pr`)로 보류한다(§3 표). 야간 동기화의 서버 적재도 같은 게이트를 지난다. action의 열린 PR 경고 스텝은 그 사실을 push **전에** 알리는 안내로 남았다 — **v3부터** 문구가 "이 push가 그 PR의 편집을 덮는다"에서 "이 PR을 머지하거나 닫을 때까지 Malmoi가 리포 변경의 적재를 보류한다"로 바뀐다(v2 태그는 옛 문구 그대로라 게이트 뒤에는 거짓이다 — §2 "v3"), `github-token`이 없어 이 스텝이 빠져도 보류는 일어난다. 브랜치는 **프로젝트별**이다 — `malmoi-i18n/sync-<project>` (`inputs.project`로 조립한다. 2026-09-05에 상수 하나에서 갈렸고, 이 조회가 옛 이름을 보던 동안 경고는 항상 "없음"이었다).

**옛 판정**(~2026-09-29): "막으면 '어느 쪽이 이기는지'를 CI가 판정하게 되고, 그건 병합 로직이다 — 경고만 남긴다." **뒤집은 이유**: 게이트는 셀을 고르지 않는다. 입력은 "말모이 PR이 열려 있나" 하나이고 결과는 **적재 전체의 보류**다 — 미전달 편집 보류(`pending-edits`)와 같은 부류다. 리포 값과 DB 값을 견주는 코드는 여전히 0곳이고, 보류가 풀리면 적재는 전과 같은 strict 덮어쓰기다. 경고만으로는 편집자가 Publish한 번역이 리뷰어가 PR을 보기 전에 DB에서 사라지는 것을 아무도 막지 못했다.

**대가**: PR이 열린 동안 리포의 새 키·삭제가 앱에 안 들어온다(야간 Publish가 PR을 매일 갱신하므로 편집이 이어지는 팀에선 며칠 이어질 수 있다 — 푸는 사람은 PR 리뷰어다). 조회 실패도 보류라(`pr-check-failed`) CI 적재가 GitHub 가용성에 묶인다.

### 머지 방식은 무엇이든 된다 — 단, PR 제목의 마커를 지우지 않는다

번역 PR은 squash · rebase · **merge commit** 어느 것으로 머지해도 된다. 루프 가드는 `head_commit.message`의 부분 문자열만 보는데, merge commit의 그 메시지는 `Merge pull request #N from …` + **PR 제목**이라 커밋 메시지의 마커가 실리지 않는다 — 그래서 마커는 **PR 제목에도** 든다(`malmoi-i18n: sync translations [skip-malmoi-i18n]`). PR 제목을 고쳐도 되지만 **`[skip-malmoi-i18n]`은 남긴다** — 지우면 머지 직후 불필요한 적재 실행이 발생한다. 미전달 편집이 있으면 서버의 사전 집계·잠금 안 재판정이 적재 전체를 보류해 보호한다. 제목에서 마커가 빠진 열린 PR은 다음 pull이 **그 제목 뒤에 마커를 다시 붙인다**(제목은 그대로다. 단 붙인 결과가 GitHub 상한인 **256자를 넘으면 기본 제목으로 돌아간다** — `PATCH /pulls`가 422로 pull 전체를 죽이는 것보다 낫다. 2026-09-17 이전에 열린 PR도 여기에 든다).

## 4. 야간 pull은 대상 리포와 무관하다

`/api/pull`은 **말모이의 Vercel Cron**이 부른다 (`vercel.json`, UTC 18:00 = KST 03:00). 대상 리포에 pull용 워크플로를 넣지 않는다 — 리포 쓰기는 말모이의 GitHub App이 하고, 대상 리포의 `GITHUB_TOKEN`은 이 경로에 들어오지 않는다 (ARCHITECTURE §6).

**야간은 리포에서 받기도 한다** (2026-09-30, nightly-sync). 미전달 편집이 없는 프로젝트는 base head가 마지막 적재와 다르고 열린 말모이 PR이 없으면 서버가 리포를 직접 읽어 적재한다(ARCHITECTURE §3.05). 그래서 **이 워크플로는 필수가 아니다** — 붙이지 않으면 리포 변경이 하루 한 번 들어오고, 붙이면 커밋마다 즉시 들어온다. 야간 적재는 서버 적재 예산(파일 200개·파일당 2MB·총 10MB — `lib/onboarding/budget.ts`, 그리고 잘리지 않은 트리)을 지나므로, 그보다 큰 리포는 야간이 매일 `too-large`로 보류하고 이 워크플로가 유일한 자동 경로다.
