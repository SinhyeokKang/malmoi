# 대상 리포에 붙이는 워크플로

**이 문서는 *대상 리포*(번역할 리포)에 무엇을 넣는지 다룬다.** 말모이 자신의 CI는 CLAUDE.md의 CI 섹션에 있다.

대상 리포는 워크플로 하나만 갖고, 실제 일은 말모이의 composite action(`.github/actions/l10n-push`)이 한다. **페이로드를 셸·YAML로 조립하지 않는다** — 생산자는 `lib/push/payload.ts` 하나이고 action이 `scripts/push-local.ts`를 그대로 부른다 (POSTMORTEM 2026-08-31: 리터럴 조립이 계약 변경을 조용히 통과시켰다).

## 1. 말모이 쪽 설정 (한 번만)

⚠️ **말모이 리포가 private이라 접근을 열어야 한다.** `malmoi` > Settings > Actions > General > Access > **"Accessible from repositories owned by the user"**. 안 켜면 대상 리포 run이 `unable to resolve action`으로 죽는다.

## 2. 대상 리포 쪽 설정

**Secret 하나**: `PUSH_TOKEN` — **그 프로젝트의 토큰 원문**이다 (2026-09-07부터. 말모이 설정 화면에서 발급하고, 서버는 해시만 갖는다). 값이 틀리거나 그 프로젝트가 아직 토큰을 발급받지 않았으면 `/api/push`가 **401**이고 어느 쪽이 틀렸는지는 알려주지 않는다 — **프로젝트 존재를 노출하지 않으려고** 무효 토큰과 없는 프로젝트를 같은 응답으로 접는다.

⚠️ **말모이 서버의 공유 env와 같은 값이 아니다.** 전에는 배포 전체가 토큰 하나를 들었고 그 값이 비면 500(`server misconfigured`)이었는데, 지금은 토큰이 곧 프로젝트라 서버에 그런 변수가 없다.

**워크플로** `.github/workflows/l10n.yml`:

```yaml
name: l10n

on:
  push:
    branches: [main]   # 대상 리포의 base 브랜치. bugshot-2는 dev다 (MVP §3.1)
  workflow_dispatch:

# 같은 프로젝트에 두 push가 동시에 들어오면 뒤가 이기는 것이 맞다 —
# strict라 마지막 상태가 진실이고, 중간 결과를 남길 이유가 없다.
concurrency:
  group: l10n-${{ github.ref }}
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
    if: "!contains(github.event.head_commit.message, '[skip-l10n]')"
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: SinhyeokKang/malmoi/.github/actions/l10n-push@main
        with:
          push-token: ${{ secrets.PUSH_TOKEN }}
          project: order-check
          github-token: ${{ secrets.GITHUB_TOKEN }}   # 열린 번역 PR 경고용 (읽기만)
```

✅ **배포 하나가 프로젝트 여럿의 push를 받고, 야간 pull도 준비된 전 프로젝트를 돈다** (2026-09-07 — push는 토큰이 프로젝트를 정하고, cron은 `lib/pull/targets.ts`가 고른 목록을 순회한다). 아래 예시들을 동시에 붙여도 서로 섞이지 않는다.

⚠️ **토큰은 프로젝트를 만들 때 한 번, 그리고 설정 화면의 [토큰 재발급]으로 나온다** — 원문은 그 화면을 벗어나면 다시 볼 수 없고 서버는 해시만 갖는다. 재발급하면 **옛 토큰이 즉시 무효**이므로 이 리포의 secret을 같은 세션에 바꾼다.

대상 리포는 Node·pnpm 셋업이 필요 없다 — action이 말모이를 clone해 `.nvmrc`·`packageManager` 기준으로 세우고 `pnpm install`한다(`ubuntu-latest` 전제, run 시간의 대부분이 이 install이다).

### 리포마다 달라지는 것

| input | 언제 주는가 |
|---|---|
| `project` | **항상.** `push-token`이 정한 프로젝트의 slug와 다르면 409다 (오배송 거부 — ARCHITECTURE §5.5.5). 토큰이 먼저 프로젝트를 정하고 이 값은 그 뒤에 대조된다 |
| `target` | 로케일·소스가 **하위 디렉터리**에만 있을 때(모노레포). 기본은 `github.workspace`. `git rev-parse`도 이 경로에서 돈다 |
| `github-token` | **항상 권장.** 없으면 열린 번역 PR 경고 스텝이 통째로 빠진다 — 실패도 경고도 없이 조용히 |
| `adapter` | **한 리포에 포맷이 둘이면 필수.** `ts-dict`는 **자동 탐지에 아예 참여하지 않으므로**(`detectCandidates`가 항상 빈 배열) 명시 지정이 유일한 경로다 — bugshot-2가 그렇다: `_locales` 4키가 탐지되고 `ts-dict` 903키는 후보에 오르지도 않는다 → `adapter: ts-dict`. 그 밖의 공존은 `detectCandidatesAcross`의 후보 순위가 다른 쪽을 골라 큰 쪽 키가 orphan된다 |
| `base-locale` | **`en`이 없는 리포는 필수.** 없으면 사전순 첫 로케일을 base로 추정하고, 틀리면 진짜 base에만 있는 키가 적재에서 빠져 orphaned로 떨어진다 — 키 집합은 base 파일이 정한다 (2026-09-04) |
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
| `/api/push`가 4xx·5xx | **red** — 오배송(409)·역행(409)·스키마 위반(400)이 여기 걸린다 |
| `wrapper`·`adapter` 값이 형식·등록 목록에 안 맞는다 | **red** (exit 2 — 스캐너 규칙이 아니라 입력 형식이다) |
| 동적 키만 있어 `refs`가 0건 | green + 로그 한 줄 |
| 로케일 파일에 없는 키를 코드가 참조 | green + 로그 한 줄 |
| 열린 번역 PR(`l10n/sync-<project>`)이 있다 | green + **run 요약 경고** (아래) |
| 번역 PR **조회 자체가 실패**(`pull-requests: read` 누락 등) | green + 조회 실패 경고 — **실패를 "PR 없음"으로 읽지 않는다** |

**red일 때 어디를 보나.** 응답 본문이 run 로그에 800바이트까지 찍힌다. 4xx는 본문으로 진단된다 — 400은 zod `issues`, 409는 `expected/got` slug 또는 `commitAt/lastCommitAt`, **401은 `{"error":"unauthorized"}` 하나뿐이다**(헤더 없음·토큰 오타·미발급 프로젝트가 전부 같은 응답이다 — 프로젝트 존재를 노출하지 않는다. 404는 2026-09-07에 사라졌다). **500은 `{"error":"internal","ref":"…"}`** 이고 원인은 말모이 Vercel 로그에 `[push] <ref>`로 있다(대상 리포가 public일 수 있어 남의 라이브러리 메시지는 싣지 않는다 — ARCHITECTURE §6.0). 우리 문구(`MissingEnvError`·`AppError`)는 그대로 온다.

### 열린 PR 경고는 차단이 아니다

번역 PR이 머지되기 전의 push는 그 편집을 덮는다 (MVP §3.1의 손실 창 — 2026-09-03에 실증됐다). 그래서 열린 번역 PR이 있으면 run 요약에 경고가 붙는다. 브랜치는 **프로젝트별**이다 — `l10n/sync-<project>` (`inputs.project`로 조립한다. 2026-09-05에 상수 하나에서 갈렸고, 이 조회가 옛 이름을 보던 동안 경고는 항상 "없음"이었다).

**막지 않는 이유**: 막으면 "어느 쪽이 이기는지"를 CI가 판정하게 되고, 그건 병합 로직이라 코어 원칙을 깬다. 개발자가 볼 재료만 남기고 판단은 사람이 한다.

## 4. 야간 pull은 대상 리포와 무관하다

`/api/pull`은 **말모이의 Vercel Cron**이 부른다 (`vercel.json`, UTC 18:00 = KST 03:00). 대상 리포에 pull용 워크플로를 넣지 않는다 — 리포 쓰기는 말모이의 GitHub App이 하고, 대상 리포의 `GITHUB_TOKEN`은 이 경로에 들어오지 않는다 (ARCHITECTURE §6).
