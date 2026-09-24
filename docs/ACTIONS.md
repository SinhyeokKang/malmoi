# 대상 리포에 붙이는 워크플로

**이 문서는 *대상 리포*(번역할 리포)에 무엇을 넣는지 다룬다.** 말모이 자신의 CI는 CLAUDE.md의 CI 섹션에 있다.

대상 리포는 워크플로 하나만 갖고, 실제 일은 말모이의 composite action(`.github/actions/malmoi-i18n-push`)이 한다. **페이로드를 셸·YAML로 조립하지 않는다** — 생산자는 `lib/push/payload.ts` 하나이고 action이 `scripts/push-local.ts`를 그대로 부른다 (POSTMORTEM 2026-08-31: 리터럴 조립이 계약 변경을 조용히 통과시켰다).

## 1. 말모이 쪽 설정 (한 번만)

**없다.** 말모이 리포가 public이라(2026-09-18) 어느 계정의 리포든 이 action을 참조할 수 있다. ⚠️ **private이던 동안에는** Settings > Actions > Access의 "Accessible from repositories owned by the user"가 필요했고 그 설정은 **소유자가 같은 리포만** 열어서, 다른 계정 리포는 자동 수집(push)이 원리적으로 안 돌았다 — `unable to resolve action`을 보면 리포가 다시 private이 됐는지부터 본다.

## 2. 대상 리포 쪽 설정

**Secret 하나**: `PUSH_TOKEN` — **그 프로젝트의 토큰 원문**이다 (2026-09-07부터. 말모이 설정 화면에서 발급하고, 서버는 해시만 갖는다). 값이 틀리거나 그 프로젝트가 아직 토큰을 발급받지 않았으면 `/api/push`가 **401**이고 어느 쪽이 틀렸는지는 알려주지 않는다 — **프로젝트 존재를 노출하지 않으려고** 무효 토큰과 없는 프로젝트를 같은 응답으로 접는다.

⚠️ **말모이 서버의 공유 env와 같은 값이 아니다.** 전에는 배포 전체가 토큰 하나를 들었고 그 값이 비면 500(`server misconfigured`)이었는데, 지금은 토큰이 곧 프로젝트라 서버에 그런 변수가 없다.

⚠️ **한 리포에 프로젝트가 둘이면 secret 하나로 둘을 먹일 수 없다.** 토큰이 프로젝트를 정하므로 **스텝 둘 + secret 둘**이 필요하고(`PUSH_TOKEN_CODE`·`PUSH_TOKEN_YAML` 식), 각 스텝의 `project`와 `adapter`가 다르다. prod에 그 모양이 실재한다 — `i18n-format-check` 하나가 `format-check-code`(code-dict)·`format-check-yaml`(yaml-catalog) 둘을 먹인다. **secret 이름은 자유다** — 위는 예시이고 서버는 값만 본다(PRODUCT §10, 2026-09-14 확정).

**조직이 action 허용 목록을 쓰면 넷을 전부 넣는다** (2026-09-24, launch-readiness L2.5): `SinhyeokKang/malmoi/.github/actions/malmoi-i18n-push` · `actions/checkout`(워크플로 파일) · `pnpm/action-setup` · `actions/setup-node`(**malmoi action 안** — `action.yml`). 하나라도 빠지면 run이 `not allowed to be used`로 멈춘다. ⚠️ **안쪽 둘은 대상 리포 파일에 안 보여서 빠뜨리기 쉽다.** 공개 도움말(`/docs#allowed-actions`)이 같은 넷을 들고, `components/__tests__/docs-content.test.tsx`가 실제 `uses:`에서 읽어 대조한다 — action에 `uses:`를 더하면 그 테스트가 red다. ⚠️ **허용 목록 패턴의 실제 통과는 아직 실측 전이다**(L2.5 수동 검증).

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
    # 빠뜨려도 루프는 막히지만, 그때는 러너가 말모이 clone·pnpm install까지 한 뒤에야 멈춘다.
    if: "!contains(github.event.head_commit.message, '[skip-malmoi-i18n]')"
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4

      - uses: SinhyeokKang/malmoi/.github/actions/malmoi-i18n-push@malmoi-i18n-push-v1
        with:
          push-token: ${{ secrets.PUSH_TOKEN }}
          project: order-check
          surface: default
          path-template: "i18n/{locale}.json"
          adapter: json-catalog
          base-locale: en
          github-token: ${{ secrets.GITHUB_TOKEN }}   # for the open-PR warning (read only)
```

⚠️ **참조는 `@malmoi-i18n-push-v1`이고 `@main`이 아니다** (2026-09-09, sec-audit 발견 3). 이 스텝에는
`secrets.PUSH_TOKEN`과 `GITHUB_TOKEN`이 들어가므로, 참조가 움직이면 **말모이 `main`의 커밋 하나가
대상 리포의 러너에서 즉시 실행된다** — 소비자 측 리뷰도 롤백 창도 없다. `main`에는 이제 브랜치
프로텍션(required check `verify`, 2026-09-18)이 있지만 그것이 보는 것은 **테스트 green**이지 action이
남의 러너에서 할 일이 아니다 — 말모이의 CI 게이트가 남의 리포의 보안 경계가 되어서는 안 된다.

⚠️ **전에 이 문서와 `CLAUDE.md`가 `@main`을 "안전하다"고 적었는데, 그 논거는 *낡음*이었다** —
"action 변경이 dev에 있는 동안 대상 리포가 옛 버전을 쓴다"는 참이지만 축이 다르다. 묻는 것은
**가변성**이고, `main`에 닿는 커밋은 그 순간 전 소비자에게 나간다.

**태그를 옮기는 것은 릴리스다.** action을 고쳤으면 `main`에 머지한 뒤 `malmoi-i18n-push-v1`을 그 커밋으로
옮긴다 — 소비자는 아무것도 안 고친다. 호환이 깨지는 변경이면 `-v2`를 새로 끊고 이 문서의 예시를
바꾼다(옛 태그는 그대로 두어 기존 소비자가 안 깨진다).

⚠️ **action 안의 `uses:`도 전부 40자 SHA로 핀돼 있다** — 업스트림 태그 재지정(2025년
`tj-actions/changed-files`)이 같은 경로로 들어온다. `scripts/__tests__/workflow-pins.test.ts`가
`.github/` 전체를 훑어 가변 태그가 0건인지 상시로 센다(핀 옆의 버전 주석과 `ci.yml`의
`permissions: contents: read`도 같은 파일이 센다).

⚠️ **그 테스트가 이 문서도 읽는다** — 이 문서가 action을 `main`으로 참조하도록 안내하지 않는지, 그리고
`@malmoi-i18n-push-v1` 문자열이 실제로 있는지 검사한다(그 정규식이 문장의 산문에도 걸리므로 여기서
가변 참조를 예시로 쓰지 않는다). 위 스니펫의 태그를 고칠 때 그 두 조건이 함께 움직인다.

⚠️ **그 스캐너는 `.github/`만 본다 — 위 스니펫의 `actions/checkout@v4`는 그 방어선 밖이다.**
이 문서의 복붙 블록과 그것을 만드는 `lib/onboarding/workflow.ts`는 우리 리포의 워크플로가 아니라
**남의 리포로 나가는 텍스트**라 파일 경로로 걸러지지 않는다. 그 스텝은 `secrets.PUSH_TOKEN`을 든
job 안에 있으므로 **핀한다** — 고칠 자리가 셋(이 문서 · `workflow.ts` · 줄 대조하는
`lib/onboarding/__tests__/workflow.test.ts`)이고 한 커밋에 함께 움직여야 한다.

✅ **배포 하나가 프로젝트 여럿의 push를 받고, 야간 pull도 준비된·보관되지 않은 프로젝트를 한 번에 50개까지 돈다** (2026-09-07 — push는 토큰이 프로젝트를 정하고, cron은 `lib/pull/targets.ts`가 고른 목록을 순회한다). 필터는 넷(`installationId`·**`repositoryId`**·`lastCommitSha`·`archivedAt`)이고 상한은 `PULL_BATCH_LIMIT` 50이다. ⚠️ **`repositoryId`는 2026-09-10에 붙었다** — 그 이전에 만들어진 행은 null이라 **OWNER가 재연결할 때까지 순회에서 빠진다**. 아래 예시들을 동시에 붙여도 서로 섞이지 않는다.

⚠️ **토큰은 프로젝트를 만들 때 한 번, 그리고 설정 화면의 [토큰 재발급]으로 나온다** — 원문은 그 화면을 벗어나면 다시 볼 수 없고 서버는 해시만 갖는다. 재발급하면 **옛 토큰이 즉시 무효**이므로 이 리포의 secret을 같은 세션에 바꾼다.

대상 리포는 Node·pnpm 셋업이 필요 없다 — action이 말모이를 clone해 `.nvmrc`·`packageManager` 기준으로 세우고 `pnpm install`한다(`ubuntu-latest` 전제, run 시간의 대부분이 이 install이다).

### 표면별 입력과 추가 step

`surface`는 서버에 등록된 slug이며 action 기본값은 `default`다. `path-template`은 등록된 후보를 정확히 고른다.
CLI의 대응 옵션은 `--surface`·`--path-template`이다. 서버의 `surfaceSlug`는 성공·실패 보고 모두 필수이며 기본값이 없다.
없는·비활성·다른 프로젝트 표면은 동일한 `409 {"error":"surface mismatch"}`다. 따라서 409 가드는 보관 → 프로젝트 slug
→ 표면 → 포맷 → 커밋 순서의 다섯 개다. 아래 step은 동일 프로젝트 토큰과 concurrency job을 공유한다.
Sources의 Add sources 결과에서 실제 등록 slug·path-template을 담은 step을 복사한다.
그 화면을 벗어났으면 **Settings의 워크플로 블록이 활성 표면 전부의 step을 담은 파일 전체를 낸다**
(`renderProjectWorkflowYaml`) — slug·path-template을 손으로 조립하지 않는다. 토큰이 프로젝트 단위라
틀린 `surface:`는 409가 아니라 다른 표면을 덮어쓴다.
현재 `malmoi-i18n-push-v1`(8511d37)은 surfaceSlug를 생산한다. 삭제된 옛 `l10n-push-v1`은 생산하지 않았다.
[배포 1 writer 전환](./OPERATIONS.md#다중-표면-배포-1--additive-migration과-writer-전환) 뒤에만 이 예시를 실행한다.

<!-- additional-surface-step -->
```yaml
      - uses: SinhyeokKang/malmoi/.github/actions/malmoi-i18n-push@malmoi-i18n-push-v1
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
| `github-token` | **항상 권장.** 없으면 열린 번역 PR 경고 스텝이 통째로 빠진다 — 실패도 경고도 없이 조용히 |
| `adapter` | **말모이가 생성하는 YAML은 확정한 어댑터를 항상 명시한다.** 자동 탐지·수동 지정 여부와 무관하게 결과 화면과 설정 화면이 같은 값을 내므로, 복사 후 CI의 탐지 순위가 저장된 포맷을 바꾸지 않는다. **한 리포에 포맷이 둘이면 필수.** `ts-dict`는 **자동 탐지에 아예 참여하지 않으므로**(`detectCandidates`가 항상 빈 배열) 명시 지정이 유일한 경로다 — bugshot-2가 그렇다: `_locales` 4키가 탐지되고 `ts-dict` 903키는 후보에 오르지도 않는다 → `adapter: ts-dict`. 그 밖의 공존은 `detectCandidatesAcross`의 후보 순위가 다른 쪽을 골라 큰 쪽 키가 orphan된다 |
| `base-locale` | **`en`이 없는 리포는 필수.** 없으면 사전순 첫 로케일을 base로 추정하고, 틀리면 진짜 base에만 있는 키가 적재에서 빠져 orphaned로 떨어진다 — 키 집합은 base 파일이 정한다 (2026-09-04). ⚠️ **말모이 설정 화면에서 기준 언어를 바꾸면 이 값도 함께 고쳐야 한다** (6b-3): 화면은 "선언"만 저장하고 실제 전환은 **이 값을 든 다음 push**가 한다 — 안 고치면 CI는 계속 옛 base를 보내 통과하고(409가 아니다) 변경이 **영영 일어나지 않는다.** 그래서 대기 중에는 설정 화면의 워크플로 YAML이 이 줄을 무조건 박아 낸다. ⚠️ **2026-09-14부터 말모이가 내는 YAML은 대기가 아닐 때도 이 줄을 든다** — 온보딩 ③에서 탐지 1순위가 아닌 기준 언어를 고를 수 있고, 그때 이 줄이 없으면 CI가 1순위를 보내 `format mismatch` 409가 된다. 결과 화면과 설정 화면이 같은 값을 낸다 |
| `wrapper` | 기본값(`@/i18n#t`)이 아닐 때. 여러 개면 줄바꿈으로 나눈다 |
| `api-url` | 기본값이 `https://mal-moi.com`이라 보통 생략. ⚠️ **`.vercel.app`을 쓰지 않는다** — 프로젝트 리네임에 404가 되고 Deployment Protection이 Bearer를 무시해 302로 튕긴다(2026-09-04 실측) |

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

**적재 실패만 red다.** 스캔 실패는 경고이고 exit 0이다 — 키의 진실은 로케일 파일이고 스캔은 `refs` 전담이라, 남의 리포 CI를 우리 스캐너 규칙으로 실패시키지 않는다 (ARCHITECTURE §4).

| 상황 | 결과 |
|---|---|
| 로케일 파일이 깨졌다·base 파일이 없다 | **red** — 연동이 성립하지 않는다 |
| **YAML·JSON 카탈로그에서 같은 키가 두 번** — YAML의 중복 키, JSON의 중첩·점 키 충돌(`{ "a": { "b": … }, "a.b": … }`) | **red** — `duplicate-key`. 두 값 중 하나가 사라지는 파일이라 서버까지 가지 않는다. 처방은 둘 중 하나를 지우는 것. ⚠️ JSON 충돌은 2026-09-17까지 조용히 마지막 값으로 적재됐다(green) — 그 뒤로 red다. ⚠️ **`duplicate-key`를 내는 어댑터는 이 둘뿐이다.** YAML의 점 키·중첩 충돌(`a.b: …` + `a: { b: … }`)도 2026-09-24부터 같은 red다. `ts-dict`·`code-dict`는 코드 객체의 같은 키(점 키·중첩 충돌 포함)를 **`duplicate-property` 경고**로 알린다 — JS 의미대로 마지막 값이 적재되고 malmoi가 그 자리를 고치므로 잃는 값이 없다. CI 로그에 `적재 경고 N건 — CI는 계속한다:`와 키 목록이 찍히고 **green이다**. `chrome-locales`는 중복 감지가 없어(JSON 파서가 접는다) 마지막 값만 남는다: **green이다** |
| `/api/push`가 4xx·5xx | **red** — **409가 다섯**(판정 순서대로 **보관** · 오배송 · **표면 불일치 `surface mismatch`** · **표면 교체 `format mismatch`** · 커밋 역행)·스키마 위반(400)이 여기 걸린다 |
| **프로젝트가 보관됐다** | **red** — 409 `{"error":"archived"}`. ⚠️ **판정이 다섯 중 맨 앞이다**(`checkArchived`): 멈춘 프로젝트에서는 페이로드가 맞는지가 답할 질문이 아니다. **처방이 다른 넷과 다르다** — `adapter`·`base-locale`을 아무리 고쳐도 안 풀린다. 할 일은 **이 워크플로를 떼는 것**이거나 설정 화면에서 보관을 되돌리는 것이다 |
| `wrapper`·`adapter` 값이 형식·등록 목록에 안 맞는다 | **red** (exit 2 — 스캐너 규칙이 아니라 입력 형식이다) |
| **박아 둔 `adapter`·`base-locale`이 그 리포의 실제 탐지 결과와 안 맞는다** | **red** (exit 1 — **서버까지 가지 않는다**). 정확히 이 문서가 "박아라"라고 권하는 두 input의 실패 경로다 |
| **말모이에 아직 안 보낸 번역 편집이 있다** | **green + 적재 없음** — 200 `{"status":"deferred","reason":"pending-edits","pendingCount":N,…}` (2026-09-18, sync-edit-protection). 미전달 편집이 하나라도 있으면 **프로젝트 전체 적재를 보류**해 편집이 리포 값에 덮이지 않게 한다. 이 run의 새 키·삭제·로케일 변경도 앱에 **안 들어갔다**. 풀리는 길은 둘이다: 번역자가 Publish해 PR로 보낸 뒤 이 job을 **다시 돌리기**(다음 push도 된다), 또는 OWNER가 앱의 `[Sync]`에서 편집 폐기를 승인하기. ⚠️ **red가 아니다** — 남의 리포 CI를 앱 상태로 실패시키지 않는다. 새 CLI는 `::warning title=malmoi import deferred::…` 한 줄을 더 낸다(구 태그 `@malmoi-i18n-push-v1`은 본문만 찍는다 — 그래도 exit 0이라 안전하다. 성공 본문은 `"status":"applied"`로 시작한다) |
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
| 응답 | 성공은 **204**(본문 없음). 거부는 401 · 400(`body too large` — 본문 상한 **4096바이트** · `invalid json` · `invalid report`) · 409(`archived` · `project mismatch` · `surface mismatch` · `stale commit` · `stale report`) · 500 `{"error":"internal","ref":"…"}` — **전부 경고 한 줄로 접힌다** |
| 제한 | **5초 · 재시도 없음**. 비정상 응답·네트워크 실패는 경고 한 줄로 남고 **원래 진단과 exit 1은 그대로다** |
| 안 보내는 것 | 파서 원문 · 소스 문자열 · 로컬 절대경로 · 토큰 |

⚠️ **보고가 red를 대신하지 않는다.** 이 요청이 404를 받든 타임아웃이 나든 CI는 여전히 실패한다 —
보고는 부가 신호이고, 그것이 CI의 판정을 바꾸면 "말모이가 조용하면 괜찮은 것"이라는 잘못된 신호가 된다.

⚠️ **서버를 먼저 릴리스한다.** 기존 Action은 이 endpoint를 몰라도 정상 push가 계속되고, 새 스크립트가
옛 서버의 404를 받으면 위 규칙대로 경고만 남긴다. **대상 리포가 쓰는 `@malmoi-i18n-push-v1`은 서버 배포만으로
새 스크립트를 받지 않는다** — 그 태그를 옮기는 것이 릴리스다(CLAUDE.md).

**red일 때 어디를 보나.**

⚠️ **401부터 푼다 — 토큰이 틀리면 400·409를 아예 못 본다.** JSON 파싱과 zod 검증이 **인증 뒤에** 있다(`app/api/push/route.ts` — `maxDuration = 60`인 공개 엔드포인트라 무효 토큰 하나로 1446키 페이로드를 파싱시키고 zod `issues`로 스키마 구조까지 받아 가게 두지 않는다). 그래서 페이로드가 아무리 깨져 있어도 토큰이 안 맞으면 응답은 401이다 — 진단을 페이로드에서 시작하면 엉뚱한 곳을 판다.

응답 본문이 run 로그에 **800자**까지 찍힌다(`lib/cli/push-response.ts`의 `reportPushResponse`가 든 `slice(0, 800)` — `scripts/push-local.ts`는 부르기만 한다 — 바이트가 아니라 UTF-16 문자다. 한국어 문구가 실리면 실제 상한이 최대 ~2,400바이트다). 4xx는 본문으로 진단된다 — 400은 `{"error":"invalid payload", issues}`(zod) 또는 `{"error":"invalid json"}`(본문이 JSON이 아닐 때) 또는 `{"error":"body too large"}`(본문 **4,500,000바이트** 초과 — Vercel 함수의 요청 본문 상한 이하로 잡은 값이다. 플랫폼 상한이 2진 4.5 MiB라면 그 사이의 페이로드는 여기서 걸린다), 409는 다섯이고 **보관이 맨 앞이다**(`{"error":"archived"}` — 위 표 참고) — 나머지 넷은 판정 순서대로 slug 오배송(`expected/got`) · 표면 불일치(`surface mismatch`) · **표면 교체**(`format mismatch` — `got`이 `adapter`·`pathTemplate`·`baseLocale` 객체이고, `expected`엔 거기에 **`declaredBaseLocale`이 하나 더** 실린다: 대기 중인 프로젝트의 CI 로그에서 "선언한 그 값도 받아들여진다"가 보여야 한다 — 6b-3) · 커밋 역행(`commitAt/lastCommitAt`)이다. ⚠️ **표면 교체가 커밋 역행보다 앞이다** — 둘 다 걸린 run은 `format mismatch`를 받는다. 표면 교체는 워크플로에 `adapter`·`base-locale`이 안 박혀 CI가 탐지 1순위를 보낼 때 난다. ⚠️ **같은 409의 두 번째 경로가 있고 그쪽엔 이 처방이 안 듣는다** — 리포가 **로케일 파일 경로를 옮긴** 경우다(`checkFormat`이 `pathTemplate`도 비교하므로 워크플로에 무엇을 박아도 영구 red다). 서버는 GitHub을 부르지 않아 정당한 이전을 오배송과 구별할 수 없다 — ⚠️ **재설정 UI는 아직 없다**(7단계가 `needs_configuration`을 후속으로 미뤘다, PRODUCT),  **401은 `{"error":"unauthorized"}` 하나뿐이다**(헤더 없음·토큰 오타·미발급 프로젝트가 전부 같은 응답이다 — 프로젝트 존재를 노출하지 않는다. 404는 2026-09-07에 사라졌다). **500은 `{"error":"internal","ref":"…"}`** 이고 원인은 말모이 Vercel 로그에 `[push] <ref>`로 있다(대상 리포가 public일 수 있어 남의 라이브러리 메시지는 싣지 않는다 — ARCHITECTURE §6.0). 우리 문구(`MissingEnvError`·`AppError`)는 그대로 온다.

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

⚠️ **대상 리포가 쓰는 `@malmoi-i18n-push-v1`은 서버 배포만으로 새 스크립트를 받지 않는다** — 그 태그를
옮기는 것이 릴리스다(CLAUDE.md). 순서: **서버 배포 → 태그 릴리스 → 사용 리포 전환.**

### 열린 PR 경고는 차단이 아니다

번역 PR이 머지되기 전의 push는 그 편집을 덮는다 (ARCHITECTURE §0 불변식 2의 손실 창 — 2026-09-03에 실증됐다). 그래서 열린 번역 PR이 있으면 run 요약에 경고가 붙는다. 브랜치는 **프로젝트별**이다 — `malmoi-i18n/sync-<project>` (`inputs.project`로 조립한다. 2026-09-05에 상수 하나에서 갈렸고, 이 조회가 옛 이름을 보던 동안 경고는 항상 "없음"이었다).

**막지 않는 이유**: 막으면 "어느 쪽이 이기는지"를 CI가 판정하게 되고, 그건 병합 로직이라 코어 원칙을 깬다. 개발자가 볼 재료만 남기고 판단은 사람이 한다.

### 머지 방식은 무엇이든 된다 — 단, PR 제목의 마커를 지우지 않는다

번역 PR은 squash · rebase · **merge commit** 어느 것으로 머지해도 된다. 루프 가드는 `head_commit.message`의 부분 문자열만 보는데, merge commit의 그 메시지는 `Merge pull request #N from …` + **PR 제목**이라 커밋 메시지의 마커가 실리지 않는다 — 그래서 마커는 **PR 제목에도** 든다(`malmoi-i18n: sync translations [skip-malmoi-i18n]`). PR 제목을 고쳐도 되지만 **`[skip-malmoi-i18n]`은 남긴다** — 지우면 머지 직후 push가 돌아 DB를 그 시점 값으로 덮고, 그 뒤에 저장한 번역이 사라진다. 제목에서 마커가 빠진 열린 PR은 다음 pull이 **그 제목 뒤에 마커를 다시 붙인다**(제목은 그대로다. 단 붙인 결과가 GitHub 상한인 **256자를 넘으면 기본 제목으로 돌아간다** — `PATCH /pulls`가 422로 pull 전체를 죽이는 것보다 낫다. 2026-09-17 이전에 열린 PR도 여기에 든다).

## 4. 야간 pull은 대상 리포와 무관하다

`/api/pull`은 **말모이의 Vercel Cron**이 부른다 (`vercel.json`, UTC 18:00 = KST 03:00). 대상 리포에 pull용 워크플로를 넣지 않는다 — 리포 쓰기는 말모이의 GitHub App이 하고, 대상 리포의 `GITHUB_TOKEN`은 이 경로에 들어오지 않는다 (ARCHITECTURE §6).
