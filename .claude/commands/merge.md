---
description: dev → main PR 생성 + CI 대기 + squash 머지 + dev 동기화. main 머지가 곧 Vercel 프로덕션 배포다.
---

`dev`를 `main`에 반영한다. **main 머지가 곧 Vercel 프로덕션 배포이므로 이 스킬이 배포 스킬이다** — 별도 `/deploy`는 없다.

## 절차

### 0. 사전 게이트

- `git branch --show-current`가 `dev`인지 확인. 아니면 중단.
- `git status --porcelain`이 비었는지 확인. 미커밋 변경이 있으면 **중단** — `/push`로 먼저 정리한다.
- `git log origin/dev..HEAD`가 비었는지 확인. 로컬에만 있는 커밋이 있으면 **중단** — `/push` 먼저.

### 1. 스키마 게이트 (⚠️ 이 프로젝트 특화)

`git diff origin/main...origin/dev -- prisma/`를 확인한다.

**마이그레이션이 포함돼 있으면**, 머지 **전에** 프로덕션 스키마를 넓혀야 한다:

```
pnpm db:deploy
```

- 이 스킬이 자동 실행하지 **않는다.** 프로덕션 DB를 바꾸는 일이라 사용자가 돌린다.
- **사용자에게 실행 여부를 확인받고 대기한다.** 안 돌린 채 머지하면 배포 직후 프로덕션이 없는 컬럼을 조회한다 (additive-first 원칙, ARCHITECTURE §7).
- `pnpm db:status`로 적용 완료를 확인한 뒤 진행.

### 2. dev의 CI 결론 확인

```
gh run list --branch dev --workflow ci.yml --limit 5 --json headSha,conclusion,url
```

- `origin/dev`의 HEAD SHA와 일치하는 run을 찾는다. **최신 run을 그냥 집지 않는다.**
- `conclusion`이 `success`가 아니면 **중단 + 리포트**. 실패한 걸 main에 넣지 않는다.
- 아직 진행 중이면 대기할지 사용자에게 확인 (`gh run watch <id>`).

### 3. PR 생성 또는 재사용

```
gh pr list --head dev --base main --state open --json number,url
```

- 열린 PR이 있으면 재사용. 없으면 `gh pr create --base main --head dev`.
- **title·body는 영문.** body에는 이번에 들어가는 변경을 항목으로. 마이그레이션이 포함되면 **"Migration applied to production before merge"** 를 명시한다.

### 4. PR CI 대기

PR에 붙은 `verify` 체크가 green이 되기를 기다린다 (`gh pr checks <n> --watch`). 실패면 중단 + 리포트.

### 5. squash 머지

```
gh pr merge <n> --squash --delete-branch=false
```

- **`--delete-branch=false`** — `dev`는 상시 브랜치다. 지우면 다음 작업이 브랜치를 다시 만들어야 한다.
- squash로 linear history를 유지한다.

### 6. dev 동기화

```
git fetch origin
git checkout dev
git reset --hard origin/main
git push --force-with-lease origin dev
```

squash 머지로 main의 커밋 해시가 dev와 달라지므로, 동기화하지 않으면 다음 PR diff에 이전 변경이 다시 나타난다.

### 7. 프로덕션 배포 확인 (논블로킹)

main 머지로 Vercel 프로덕션 배포가 트리거된다. **기다리지 않는다.** 확인 경로만 한 줄로 안내하고 종료:
- GitHub main의 커밋 status에 붙는 Vercel 체크
- Vercel 대시보드

배포가 실패하면 사용자가 알게 되고, 그때 후속 픽스를 만든다.

## 리포트

```
🚢 merge: dev → main
스키마: 마이그레이션 없음 / db:deploy 완료(<마이그레이션 이름>)
dev CI: success (<url>)
PR: #<n> (<url>) — 신규/재사용
PR CI: success
머지: squash <해시>
dev 동기화: origin/main으로 reset + force push 완료
프로덕션 배포: Vercel이 진행 중 — 결과는 <확인 경로>에서 확인
```

## 금지 사항

- **`pnpm db:deploy` 자동 실행 금지** — 사용자 확인 후 사용자가 돌린다.
- **마이그레이션이 미적용인 채 머지 금지.**
- **CI 실패·진행 중 상태에서 머지 금지.**
- **merge commit·rebase 머지 금지** — squash만.
- **`dev` 브랜치 삭제 금지.**
- **main에 직접 push 금지.**
