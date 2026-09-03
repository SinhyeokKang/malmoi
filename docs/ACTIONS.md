# 대상 리포에 붙이는 워크플로

**이 문서는 *대상 리포*(번역할 리포)에 무엇을 넣는지 다룬다.** i18n-poc 자신의 CI는 CLAUDE.md의 CI 섹션에 있다.

대상 리포는 워크플로 하나만 갖고, 실제 일은 i18n-poc의 composite action(`.github/actions/l10n-push`)이 한다. **페이로드를 셸·YAML로 조립하지 않는다** — 생산자는 `lib/push/payload.ts` 하나이고 action이 `scripts/push-local.ts`를 그대로 부른다 (POSTMORTEM 2026-08-31: 리터럴 조립이 계약 변경을 조용히 통과시켰다).

## 1. i18n-poc 쪽 설정 (한 번만)

⚠️ **i18n-poc가 private이라 접근을 열어야 한다.** i18n-poc > Settings > Actions > General > Access > **"Accessible from repositories owned by the user"**. 안 켜면 대상 리포 run이 `unable to resolve action`으로 죽는다.

## 2. 대상 리포 쪽 설정

**Secret 하나**: `PUSH_TOKEN` — i18n-poc의 Vercel env와 **같은 값이어야 한다**. 다르면 `/api/push`가 401이고, 어느 쪽이 틀렸는지는 알려주지 않는다(의도된 것 — `lib/push/auth.ts`).

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
    # ⚠️ **이 조건이 없으면 무한 루프다.** pull이 만든 커밋이 머지되면 push가 돌고,
    # 그 push가 DB를 리포 값으로 덮고, 다음 pull이 또 PR을 만든다 (ARCHITECTURE §3).
    if: "!contains(github.event.head_commit.message, '[skip-l10n]')"
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: SinhyeokKang/i18n-poc/.github/actions/l10n-push@main
        with:
          push-token: ${{ secrets.PUSH_TOKEN }}
          project: order-check
          github-token: ${{ secrets.GITHUB_TOKEN }}   # 열린 l10n/sync PR 경고용 (읽기만)
```

### 리포마다 달라지는 것

| input | 언제 주는가 |
|---|---|
| `project` | **항상.** 서버의 `ACTIVE_PROJECT_SLUG`와 다르면 409다 (오배송 거부 — ARCHITECTURE §5.5.5) |
| `adapter` | **한 리포에 포맷이 둘이면 필수.** 탐지 우선순위가 작은 쪽을 골라 큰 쪽 키가 전부 orphan된다. bugshot-2가 그렇다: `_locales` 4키 vs `ts-dict` 903키 → `adapter: ts-dict` |
| `wrapper` | 기본값(`@/i18n#t`)이 아닐 때. 여러 개면 줄바꿈으로 나눈다 |
| `api-url` | 기본값이 `https://i18n-poc.vercel.app`이라 보통 생략 |

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
| 동적 키만 있어 `refs`가 0건 | green + 경고 |
| 로케일 파일에 없는 키를 코드가 참조 | green + 경고 |
| 열린 `l10n/sync` PR이 있다 | green + **경고** (아래) |

### 열린 PR 경고는 차단이 아니다

번역 PR이 머지되기 전의 push는 그 편집을 덮는다 (MVP §3.1의 손실 창 — 2026-09-03에 실증됐다). 그래서 열린 `l10n/sync` PR이 있으면 run 요약에 경고가 붙는다.

**막지 않는 이유**: 막으면 "어느 쪽이 이기는지"를 CI가 판정하게 되고, 그건 병합 로직이라 코어 원칙을 깬다. 개발자가 볼 재료만 남기고 판단은 사람이 한다.

## 4. 야간 pull은 대상 리포와 무관하다

`/api/pull`은 **i18n-poc의 Vercel Cron**이 부른다 (`vercel.json`, UTC 18:00 = KST 03:00). 대상 리포에 pull용 워크플로를 넣지 않는다 — 리포 쓰기는 i18n-poc의 GitHub App이 하고, 대상 리포의 `GITHUB_TOKEN`은 이 경로에 들어오지 않는다 (ARCHITECTURE §6).
