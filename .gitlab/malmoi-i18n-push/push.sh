#!/usr/bin/env bash
# GitLab CI 진입점 — `.github/actions/malmoi-i18n-push/action.yml`(action v3)의 짝 (gitlab-repositories D1, design §2 "적재와 Sync").
#
# 대상 리포의 생성 job(`lib/onboarding/gitlab-ci.ts`)이 이 리포를 불변 태그 `malmoi-i18n-push-gitlab-vN`으로 `.malmoi`에 shallow clone하고
# **박힌 40자 SHA와 `HEAD`를 대조한 뒤에만** 이 파일을 부른다 — 태그가 옮겨져도 대상 리포 러너는 박힌 SHA 밖의 코드를 돌리지 않는다.
# GitHub 리포 안의 `.gitlab/`은 GitHub에서 아무것도 하지 않는다.
#
# **페이로드를 셸에서 조립하지 않는다** — 인자 변환은 `lib/cli/gitlab-ci-input.ts`(`run.ts`가 부른다), 생산자는 `push:local` →
# `lib/push/payload.ts` 하나다(POSTMORTEM 2026-08-31). 보류 사유별 경고·`/api/push/failure` 보고도 `push:local`이 action v3와 같이 든다.
set -euo pipefail

# ⚠️ **루프 가드 둘째 겹** — 첫 겹은 생성 job의 `rules`다. 그건 복붙 YAML이라 손으로 고치면 빠질 수 있다. Publish MR이 머지된 커밋에서
# push가 다시 돌면 DB를 리포 값으로 덮고 다음 Publish가 또 MR을 연다(2026-09-04 audit #16). 의존성 설치 전에 본다.
case "${CI_COMMIT_MESSAGE-}" in
  *"[skip-malmoi-i18n]"*)
    echo "[skip-malmoi-i18n] commit — this change came from Malmoi, so it is not imported again."
    exit 0
    ;;
esac

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# 이미지는 생성 job이 digest로 고정한다. `.nvmrc`와 major가 다르면 태그와 job이 서로 다른 릴리스에서 왔다는 뜻이라 경고만 한다 —
# 남의 리포 CI를 우리 판 차이로 실패시키지 않는다.
want_node="$(tr -d '[:space:]' < "$root/.nvmrc")"
have_node="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$have_node" != "$want_node" ]; then
  echo "WARNING: Node $have_node is running, but Malmoi expects Node $want_node. Copy the job from Malmoi again."
fi

# ⚠️ 설치 두 줄은 `PUSH_TOKEN`·`CI_JOB_TOKEN`을 지운 환경에서 돈다 — 의존성의 설치 스크립트가 job 환경을 그대로 읽는다(2026-10-17 보안 감사).
# GitHub composite action이 토큰을 마지막 스텝에만 넣는 것과 노출 범위를 맞춘다. 토큰은 아래 `run.ts`만 받는다.
# pnpm 버전의 출처는 말모이의 `packageManager` 하나다(action v3의 "버전 읽기"와 같다). corepack이 아니라 npm으로 까는 것은 corepack의
# 서명 키 갱신에 run이 묶이지 않게 하려는 것이다.
pnpm_version="$(node -p 'require(process.argv[1]).packageManager.split("@")[1]' "$root/package.json")"
env -u PUSH_TOKEN -u CI_JOB_TOKEN npm install --global --silent --no-fund --no-audit "pnpm@$pnpm_version"

cd "$root"
env -u PUSH_TOKEN -u CI_JOB_TOKEN pnpm install --frozen-lockfile
exec pnpm exec tsx .gitlab/malmoi-i18n-push/run.ts
