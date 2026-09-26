---
description: dev → main PR 생성 + 버전 bump + CI 대기 + squash 머지 + 태그·GitHub Release + dev 동기화. main 머지가 곧 Vercel 프로덕션 배포다.
---

`dev`를 `main`에 반영하고 **그 배포에 버전을 붙인다.** **main 머지가 곧 Vercel 프로덕션 배포이므로 이 스킬이 배포 스킬이다** — 별도 `/deploy`는 없고, `/push`는 dev까지(= preview 배포)만 간다.

> **`main`은 브랜치 프로텍션이 막는다** (2026-09-18 — required check `verify`, `enforce_admins` 켬). 직접 push는 서버가 거부하고 PR 머지는 `verify`가 green이어야 된다. ⚠️ **서버가 보는 것은 `verify` 하나뿐이다** — `db:status:prod`·미커밋·미푸시 검사는 여전히 이 스킬만 한다.
>
> **PR CI가 프로덕션 앞의 진짜 게이트다** (2026-09-04 브랜치 분리로 되살아났다). 브랜치가 하나였던 동안에는 PR 이벤트 자체가 없어 CI가 배포 **뒤에** 돌았고, 방어선은 `/push`의 로컬 게이트뿐이었다.

> **머지마다 semver를 올린다** (2026-09-27, release-versioning). 정본은 `package.json`의 `version`과 원격 태그 `v<x.y.z>`이고, **main 커밋 제목이 아니다** — 제목의 버전은 읽기 편의다. 레벨은 **매번 사람에게 묻는다**(3단계). `skip`은 없다 — 머지 = 배포이므로 버전 없는 배포를 만들지 않는다.
>
> **프로텍션을 한 번도 우회하지 않는다**: bump는 dev 커밋으로 squash PR에 실리고(4단계), 태그는 `gh release create --target <squash SHA>`가 서버에서 만든다(9단계). 태그는 branch ref가 아니라 프로텍션 밖이다(ruleset 0개 — 2026-09-27 실측).

## 절차

### 0. 사전 게이트

- `git fetch origin` — **검사보다 먼저.** 3단계의 `origin/main..origin/dev`가 stale ref 위에서 계산되지 않게 한다(`sync.md` 1단계와 같은 이유).
- `git branch --show-current`가 `dev`인지 확인. 아니면 중단.
- `git status --porcelain`이 비었는지 확인. 미커밋 변경이 있으면 **중단** — `/push`로 먼저 정리한다.
- `git log origin/dev..HEAD`가 비었는지 확인. 로컬에만 있는 커밋이 있으면 **중단** — `/push` 먼저.

### 1. 스키마 게이트 (⚠️ 이 프로젝트 특화 — additive-first가 여기서 일어난다)

`git diff origin/main...origin/dev -- prisma/`를 확인한다.

**마이그레이션이 포함돼 있으면**, 머지 **전에** 프로덕션 스키마를 넓혀야 한다:

```
pnpm db:deploy
```

- 이 스킬이 자동 실행하지 **않는다.** 프로덕션 DB를 바꾸는 일이라 사용자가 돌린다.
- **사용자에게 실행 여부를 확인받고 대기한다.** 안 돌린 채 머지하면 배포 직후 프로덕션이 없는 컬럼을 조회한다 (additive-first 원칙, ARCHITECTURE §7).
- **⚠️ 확인은 `pnpm db:status:prod`다, `db:status`가 아니다** (2026-09-04 dev/prod 분리 뒤). 후자는 **dev**를 본다 — dev엔 이미 적용돼 있으므로 "up to date"가 나오고, 그걸 prod 상태로 읽으면 그대로 머지된다. 분리 전에는 인스턴스가 하나여서 `migrate dev`가 프로덕션까지 바꿔놨고 그래서 이 게이트를 잊어도 안 깨졌다. **분리가 만든 새 실패 모드이고, 그 실패가 나타나는 지점이 바로 여기다.**
- `/push`가 "마이그레이션 포함 — /merge에서 db:deploy 필요"를 리포트에 남겼다면 그것이 이 단계의 입력이다.

### 2. dev의 CI 결론 확인

```
gh run list --branch dev --workflow ci.yml --limit 5 --json headSha,conclusion,url
```

- `origin/dev`의 HEAD SHA와 일치하는 run을 찾는다. **최신 run을 그냥 집지 않는다.**
- 이 run은 `/push`가 dev에 푸시할 때 돈 것이다. 없으면 `/push`를 거치지 않은 커밋이 dev에 있다는 뜻이므로 왜인지 확인한다.
- `conclusion`이 `success`가 아니면 **중단 + 리포트**. 실패한 걸 main에 넣지 않는다.
- 아직 진행 중이면 대기할지 사용자에게 확인 (`gh run watch <id>`).
- **bump 전에 둔다** — bump는 메타데이터 한 줄이라 여기서 본 green이 머지될 코드의 green이다.

### 3. 버전 판정 → 레벨 질문

```
pnpm release:plan
```

stdout은 JSON 한 개다(`scripts/release-plan.ts` — 판정은 `scripts/release.ts`의 `planRelease`, `pnpm test`가 고정한다). **판정을 여기서 다시 짜지 않는다** — 특히 `git describe --tags`로 직전 릴리스를 찾지 않는다(action 태그 `malmoi-i18n-push-v1`을 준다).

| 출력 | 할 일 |
|---|---|
| exit 1 · `error: "unreleased-on-main"` | **중단.** 직전 `/merge`의 9단계가 실패해 main의 `version`에 태그가 없다. 그 Release를 먼저 만든다(9단계 명령. `--target`은 그 버전의 squash SHA — `git log origin/main --format=%H --grep "^v<version>: " -1`). 같은 번호를 다시 쓰지 않으려는 판정이다 |
| exit 1 · `nothing-to-release` | **중단.** 머지할 커밋이 없다 |
| exit 1 · `invalid-version` · `behind-last-tag` | **중단 + 리포트.** 누군가 `version`을 손으로 바꿨다 — 4단계 밖에서 바뀌면 안 되는 값이다 |
| `action: "bump"` · `seed: true` | **묻지 않는다.** 첫 릴리스이고 `candidates`가 셋 다 `1.0.0`이다 |
| `action: "bump"` · `seed: false` | **`AskUserQuestion`으로 patch·minor·major를 묻는다** (아래) |
| `action: "none"` | **묻지 않고 4단계를 건너뛴다.** bump가 이미 dev에 있다(직전 `/merge`가 4단계 뒤에 멈췄다). `next`가 이번 버전이다 — 버전이 두 번 오르지 않는다 |

질문 모양:

- 선택지 셋의 라벨에 각 다음 버전을 싣는다 — `minor → v1.1.0`.
- **`recommended.level`을 첫 선택지로** 두고 라벨 끝에 `(Recommended)`, 설명에 `recommended.reason`(`feat 20 → minor`)을 붙인다. 나머지 둘은 major·minor·patch 순.
- 추천은 커밋 타입 규칙이다 — `type!:`·본문 `BREAKING CHANGE:` → major, `feat` → minor, 그 밖 patch. **판정이 아니라 확인용이다.** major는 **대상 리포가 워크플로를 바꿔야 하는 변경**(`/api/push` 페이로드·action `inputs`)으로 읽는다.
- 고른 레벨이 추천과 다르면 리포트에 남긴다.

이 단계의 출력에서 `lastTag`(없으면 null)·`compareBase`와 `git log origin/main..origin/dev --format='%h %s'`(5단계 노트의 소스)를 들고 간다. **레벨을 고른 뒤 스크립트를 다시 부르지 않는다** — 후보 셋이 이미 나와 있다.

### 4. bump 커밋 (`action: "bump"`일 때만)

```
npm pkg set version=<candidates[고른 레벨]>
git diff --name-only                              # package.json 하나여야 한다
node -e 'const {execSync}=require("child_process");const a=JSON.parse(execSync("git show HEAD:package.json"));const b=JSON.parse(require("fs").readFileSync("package.json"));delete a.version;delete b.version;process.exit(JSON.stringify(a)===JSON.stringify(b)?0:1)'
git commit -m "chore(release): v<next>" -- package.json
git push origin dev
```

- 두 확인 중 하나라도 실패하면 **중단** — `version` 말고 다른 것이 바뀌었다. `git checkout package.json`으로 되돌리고 리포트한다.
- ⚠️ **diff가 "한 줄"이 아닐 수 있다** — seed(1.0.0)는 `npm pkg set`이 `version`을 **맨 끝 키로 덧붙여** 직전 줄에 쉼표가 생긴다(2026-09-27 실측). 그래서 줄 수가 아니라 **`version`을 뺀 JSON이 같은지**로 본다. 이후 bump는 제자리 한 줄이다.
- ⚠️ **`/push`를 거치지 않는 유일한 dev 커밋이다** — 로컬 게이트가 볼 코드가 없다. dev CI를 기다리지 않는다; 그 SHA는 7단계 PR CI가 required check로 막는다.
- `pnpm version`을 쓰지 않는다 — 필드가 없을 때(seed)의 동작이 정해져 있지 않다. 다음 버전 계산은 3단계 스크립트 한 곳이다.

### 5. 노트 두 벌 — 둘 다 영문, 둘 다 머지 전에

소스는 3단계에서 들고 온 `origin/main..origin/dev` 개별 커밋이다. `.scratch/`는 gitignore라 커밋에 안 딸려간다. 표기는 화면 이름 `Malmoi`, 식별자·URL `malmoi`. **Release 노트도 지금 쓴다** — 머지 뒤 9단계를 명령 하나로 남겨 "머지는 됐는데 릴리스가 안 됨" 창을 줄인다.

**① PR body — 개발자용 (`.scratch/pr-v<next>.md`)**. 독자는 머지를 판단하는 개발자다. **걸러내지 않는다** — 하네스·문서·테스트·리팩터도 영역별로 싣는다.

```markdown
## Changes

### <Area — e.g. Publish, Onboarding, Security, Harness, Docs>
- <What changed, one line> (<short SHA or commit type>)

## Migrations

- `<migration name>` — applied to production before merge.   ← 없으면 "None."

## Notes

- <Deploy-order caveats, composite action tag move pending, follow-ups>   ← 없으면 절 생략
```

**② GitHub Release — 사용자용 (`.scratch/release-v<next>.md`)**. **사용자가 체감하는 변화만** 남긴다 — `docs`·`test`·`chore`·`refactor`·`build`·하네스(`.claude/`·`.agents/`·CLAUDE.md)는 뺀다. 커밋 메시지를 옮기지 않고 "사용자가 무엇을 하게 됐나"로 다시 쓴다. **`--generate-notes`를 쓰지 않는다** — 커밋 제목 나열이 된다.

```markdown
## Highlights

<One sentence.>

## Features

### <Area>
- **<Headline>.** <What changed for the user and why it matters, 1–3 sentences.>

## Fixes

- **<Headline>.** <Symptom the user saw, and what they see now.>

**Full changelog:** <compareBase>v<next>
```

- 남는 커밋이 0이면 Highlights에 `Maintenance release — no user-facing changes.` 한 줄, Features·Fixes 생략.
- **1.0.0(seed)만 다르다**: `compareBase`가 null이니 Full changelog 줄을 뺀다. Highlights는 첫 공개 릴리스로, Features는 커밋 나열이 아니라 README의 기능 절을 기준으로 **지금 할 수 있는 것**을 영역별로 요약한다(사실 대조 소스는 PRODUCT·README·가이드). PR body는 1.0.0이어도 ① 양식 그대로다(커밋을 영역별로 접는다).

### 6. PR 생성 또는 재사용

```
gh pr list --head dev --base main --state open --json number,url
```

- 열린 PR이 없으면 `gh pr create --base main --head dev --title "v<next>: <summary>" --body-file .scratch/pr-v<next>.md`.
- 열린 PR이 있으면 재사용하고 `gh pr edit <n> --title "v<next>: <summary>" --body-file .scratch/pr-v<next>.md`로 **제목·본문을 덮는다** — 옛 제목에 버전이 없거나 다르다.
- **title·body는 영문.** `<summary>`는 이번 변경의 한 줄 요약이다. 마이그레이션이 포함되면 body의 Migrations 절에 **"applied to production before merge"** 를 명시한다.

### 7. PR CI 대기

PR에 붙은 `verify` 체크가 green이 되기를 기다린다 (`gh pr checks <n> --watch`). 실패면 중단 + 리포트. 4단계의 bump 커밋이 여기서 처음 CI를 지난다.

- 여기서 중단하면 dev에 bump가 남는다. 고친 뒤 다시 `/merge`를 부르면 3단계가 `action: "none"`으로 4단계를 건너뛴다. 그 사이 `/sync`를 손으로 돌리면 tree 비교가 걸려 멈춘다 — 올바른 동작이다.

### 8. squash 머지

```
gh pr merge <n> --squash --delete-branch=false --subject "v<next>: <summary> (#<n>)"
gh pr view <n> --json mergeCommit -q .mergeCommit.oid      # squash SHA — 9단계의 --target
```

- **`--subject`를 명시한다** — GitHub의 squash 기본 제목은 커밋이 하나뿐인 PR이면 PR 제목이 아니라 그 커밋 메시지다. GitHub이 재조립하는 필드에 우리 문자열이 실린다고 가정하지 않는다(POSTMORTEM 2026-09-17).
- **`--delete-branch=false`** — `dev`는 상시 브랜치다. 지우면 다음 작업이 브랜치를 다시 만들어야 한다.
- squash로 linear history를 유지한다. 태그는 **main의 squash 커밋**에 붙는다 — dev HEAD는 squash로 사라지는 해시다.

### 9. GitHub Release + 태그

```
gh release create v<next> --target <squash SHA> --title v<next> --notes-file .scratch/release-v<next>.md --latest
git ls-remote --tags origin v<next>                # squash SHA여야 한다
```

- **태그와 Release가 한 호출에서 같이 생긴다** — 로컬 `git tag` + push를 쓰지 않는다("태그만 있고 Release 없음" 반쪽 상태를 안 만든다).
- **곧바로 published + `--latest`다. `--draft`를 쓰지 않는다** — 심사 대기가 없고 머지 순간 프로덕션이 그 버전이다.
- ⚠️ **실패해도 10단계로 간다** — 머지는 끝났다. 리포트에 위 명령을 **SHA를 채운 그대로** 남기고 손으로 재실행한다. `/merge`를 다시 부르지 않는다(부르면 3단계가 `unreleased-on-main`으로 멈추고 같은 요구를 한다).
- 태그 push는 어떤 워크플로도 돌리지 않는다 — `ci.yml`의 `on.push`는 `branches`만 가진다.

### 10. dev 동기화 — **`/sync`와 같은 안전 절차를 쓴다**

squash 머지로 main의 커밋 해시가 dev와 달라지므로, 동기화하지 않으면 다음 PR diff에 이전 변경이 다시 나타난다. bump 커밋은 squash에 실렸으므로 tree 비교가 그대로 성립한다.

```
git fetch origin                                  # ← 검사보다 먼저
git status --porcelain                            # 비어야 한다
git log origin/dev..dev --oneline                 # 비어야 한다
git diff --quiet origin/main origin/dev           # exit 0이어야 한다
LEASE=$(git rev-parse origin/dev)                 # 검사한 그 상태
git checkout dev
git reset --hard origin/main
git push --force-with-lease=dev:$LEASE origin dev
```

⚠️ **여기도 파괴적이고, 창이 좁을 뿐 없지 않다** (2026-09-13, Codex 하네스 검토 지적 1). 7단계 CI 대기가 분 단위이므로 그 사이에 다른 머신이 `dev`에 푸시할 수 있다. `fetch`를 검사보다 먼저 돌리고 lease에 SHA를 박는 이유·`git log`가 아니라 `git diff`로 미머지를 판정하는 이유는 `.claude/commands/sync.md` 1·2단계에 있다 — **두 곳이 갈리면 안 되므로 절차를 고칠 때 양쪽을 같이 고친다.**

- `git diff --quiet`가 실패하면 **중단.** 방금 머지한 내용 말고 다른 것이 `origin/dev`에 들어왔다는 뜻이다. 머지 자체는 이미 끝났으므로 되돌릴 것은 없고, 동기화만 보류하고 리포트에 남긴다.
- lease가 거부되면 **`--force`로 뚫지 않는다.** `/sync`를 손으로 다시 돌린다.

### 11. 프로덕션 배포 확인 (논블로킹)

main 머지로 Vercel 프로덕션 배포가 트리거된다. **기다리지 않는다.** 확인 경로만 한 줄로 안내하고 종료:
- GitHub main의 커밋 status에 붙는 Vercel 체크
- Vercel 대시보드 / `https://mal-moi.com`

배포가 실패하면 사용자가 알게 되고, 그때 후속 픽스를 만든다. **되돌리는 유일한 방법은 다음 배포다** — revert 커밋을 dev에 얹어 같은 경로로 다시 보낸다.

⚠️ **대상 리포는 불변 태그 `@malmoi-i18n-push-v1`을 참조한다** (`SinhyeokKang/malmoi/.github/actions/malmoi-i18n-push@malmoi-i18n-push-v1`, docs/ACTIONS.md가 정본). **그래서 이 머지는 대상 리포의 CI를 바꾸지 않는다** — `.github/actions/` 변경이 들어 있어도 태그를 옮기기 전까지 소비자는 옛 커밋을 쓴다.

- **앱 버전(`v<x.y.z>`)과 action 태그(`malmoi-i18n-push-vN`)는 별개 축이다** — 9단계가 만든 앱 태그는 action 계약이 아니고, 앱 버전이 올라도 action 태그는 안 움직인다.
- **action 태그를 옮기는 것이 action 릴리스이고, 이 스킬 밖의 별도 판단이다.** 머지에 `.github/actions/` 변경이 있으면 리포트에 "태그 이동 대기 중"으로 남겨 잊지 않게 한다. 호환이 깨지는 변경이면 `-v2`를 새로 끊는다(옛 태그는 그대로 둔다).
- ⚠️ **전에 이 자리에 `@main`과 "머지 순간 CI가 바뀐다"가 적혀 있었다** (2026-09-13에 정정). 그 서술은 ACTIONS.md가 2026-09-09 sec-audit 발견 3으로 **이미 폐기한 논거**였다 — 이 스텝에는 대상 리포의 `secrets.PUSH_TOKEN`이 들어가므로, 가변 참조였다면 말모이 `main`에 닿는 커밋 하나가 남의 리포 러너에서 리뷰도 롤백 창도 없이 즉시 돈다. 정본은 docs/ACTIONS.md다.

## 리포트

```
🚢 merge (= 프로덕션 배포): dev → main
스키마: 마이그레이션 없음 / db:deploy 완료(<마이그레이션 이름>, db:status:prod 확인)
dev CI: success (<url>)
버전: v<prev> → v<next> (<고른 레벨> · 추천 <recommended>: <reason>) / v1.0.0 (seed — 질문 없음) / v<next> (재실행 — bump 이미 dev에 있음)
PR: #<n> (<url>) — 신규/재사용
PR CI: success   ← 프로덕션 앞의 게이트
머지: squash <해시> — "v<next>: <summary> (#<n>)"
릴리스: <release url> (태그 v<next> = <squash SHA>) / ⚠️ 실패 — 재실행: gh release create v<next> --target <SHA> --title v<next> --notes-file .scratch/release-v<next>.md --latest
composite action: 변경 없음 / 변경 포함 — 소비자는 @malmoi-i18n-push-v1 그대로, **태그 이동 대기 중**
dev 동기화: fetch→검사→reset→lease push 완료 / ⚠️ 보류(<사유>)
프로덕션 배포: Vercel이 진행 중 — 결과는 <확인 경로>에서 확인
```

## 금지 사항

- **`pnpm db:deploy` 자동 실행 금지** — 사용자 확인 후 사용자가 돌린다.
- **마이그레이션이 미적용인 채 머지 금지.**
- **CI 실패·진행 중 상태에서 머지 금지.**
- **merge commit·rebase 머지 금지** — squash만.
- **`version`을 4단계 밖에서 바꾸지 않는다** — 다음 버전 계산은 `pnpm release:plan` 한 곳이고, 손으로 바꾸면 3단계가 `invalid-version`·`behind-last-tag`로 멈춘다.
- **Release `--draft` 금지** — 머지 = 배포다. **`--generate-notes` 금지** — 노트는 5단계가 직접 쓴다.
- **태그 강제 이동·삭제 금지** — 잘못 만든 릴리스는 다음 버전으로 고친다. 같은 번호를 다시 쓰지 않는다.
- **10단계에서 인자 없는 `--force-with-lease` 금지** — `=dev:<SHA>` 형태만. 이유는 `/sync` 4단계.
- **`dev` 브랜치 삭제 금지.**
- **main에 직접 push 금지.** `--admin` 머지 금지 — 프로텍션을 우회하는 경로가 절차에 없다.
