# release-versioning — design

## 결정 (2026-09-27, 사용자)

첫 안의 추천 셋을 사용자가 전부 뒤집었다. 아래 본문은 이 결정 기준이다.

1. **bump 레벨은 매번 묻는다** (bugshot-2 방식). `/merge`가 `AskUserQuestion`으로 patch·minor·major를 묻고, 커밋 타입 규칙의 판정을
   **추천 선택지**로 보인다. `/merge <level>` 덮어쓰기 인자는 두지 않는다(질문이 그 역할을 한다). 예외는 묻는 의미가 없는 두 경우다 —
   seed(1.0.0 고정)와 재실행(bump가 이미 dev에 있다).
2. **노트를 둘로 따로 쓴다.** squash PR body = **개발자용 변경 목록**(내부 변경 포함), GitHub Release = **사용자 체감 변화만**(bugshot-2 노트 규칙).
   둘 다 영문.
3. **`/push`·`/orchestrate` 리포트에 예상 버전을 싣지 않는다.** `pnpm release:plan`은 `/merge` 3단계만 쓴다.

## 1. bugshot-2에서 무엇을 가져오고 무엇을 버리나

출처: `~/code/bugshot-2/.claude/commands/{merge,deploy,sync}.md`, `CLAUDE.md` "릴리스 & 버전"(106–123행), 태그 `v1.7.30`…`v1.7.44`.

| bugshot-2 | 판정 | 이유 |
|---|---|---|
| semver, `package.json`의 `version`이 정본 | **가져온다** | 요청 그대로. malmoi는 manifest가 없어 `package.json` 하나다 |
| `/merge`가 dev에 bump 커밋을 얹어 squash PR에 싣는다 | **가져온다** | main 프로텍션(`enforce_admins`)을 우회하지 않는 유일한 경로. `/sync`의 tree 비교도 그대로 통과한다(bump가 main에 들어가므로) |
| 태그는 main의 squash 커밋에 | **가져온다** | dev HEAD는 squash로 사라지는 해시다 |
| 태그는 branch ref가 아니라 프로텍션 밖 | **가져온다** | 실측: `gh api repos/SinhyeokKang/malmoi/rulesets` → `[]` (tag rule 없음) |
| PR 제목 `v<ver>: <summary>` | **가져온다** | main 히스토리가 버전으로 읽힌다(bugshot-2 `git log main`이 그 모양) |
| Release 노트: 영문 직접 작성, `--generate-notes` 금지, 사용자 체감만, 내부(docs·test·스킬·리팩터) 제외, "Maintenance release" 한 줄 | **가져온다** | 노트 품질 규칙은 앱 종류와 무관하다 |
| PR body와 Release 노트를 따로 쓴다 | **가져온다** (결정 2) | 독자가 다르다 — PR은 머지 판단을 하는 개발자, Release는 방문자·사용자 |
| 레벨을 사람에게 매번 묻는다(`patch`/`minor`/`major`/`skip`) | **가져온다** (결정 1) — 단 `skip` 삭제, 커밋 타입 규칙의 판정을 추천으로 | 머지 = 배포이므로 버전 없는 배포를 만들지 않는다. 추천이 있어야 질문이 "기억해서 고르기"가 아니라 "확인하기"가 된다 |
| `pnpm version <level> --no-git-tag-version` + lockfile stage | **바꾼다** — 스크립트가 다음 버전을 계산하고 `npm pkg set version=<next>` | `pnpm version`은 필드가 없을 때(1.0.0 seed)의 동작이 정해져 있지 않다. 계산을 한 곳에 두면 seed와 평시가 같은 경로다 |
| `/deploy` 전체(스토어 빌드·zip·Install 절·심사 안내) | **버린다** | Vercel이 배포한다 |
| Release `--draft` 후 수동 publish | **버린다** — 즉시 published + `--latest` | 심사 대기가 없다. 머지 순간 프로덕션이 그 버전이다 |
| `git tag` 로컬 생성 + push | **바꾼다** — `gh release create --target <sha>` 한 번 | 태그와 Release가 한 호출에서 같이 생긴다 → "태그만 있고 Release 없음" 반쪽 상태가 없다 |
| 커버리지 리포트·래칫 | **버린다** | 인프라 없음, 요청 밖 |
| e2e 게이트 | **이미 있다** | malmoi `/merge` 2단계(dev CI 결론)가 같은 자리다 |

## 2. 영향 받는 흐름

push / 편집 UI / pull **어디에도 붙지 않는다.** 하네스(`/merge`)와 `scripts/`만이다. 번역 데이터·어댑터·API 계약·
DB는 무관하다.

## 3. 새 `/merge` 단계

기존 0–7단계를 유지하고 사이에 끼운다. 번호는 새로 매긴다.

| # | 단계 | 새/기존 | 요점 |
|---|---|---|---|
| 0 | 사전 게이트 | 기존 + `git fetch origin` 선두 | ⚠️ 뒤의 `origin/main..origin/dev`가 stale ref 위에서 계산되지 않게 한다(`sync.md` 1단계와 같은 이유) |
| 1 | 스키마 게이트 (`db:status:prod` → 사용자 `db:deploy`) | 기존 | 변화 없음 |
| 2 | dev CI 결론 (`origin/dev` HEAD SHA 일치 run) | 기존 | **bump 전에 둔다** — bump는 메타데이터 한 줄이라 여기서 본 green이 머지될 코드의 green이다(bugshot-2와 같은 논리). bump SHA는 6단계 PR CI가 본다 |
| 3 | **버전 판정** `pnpm release:plan` → **레벨 질문** | 새 | exit≠0이면 중단. `action: "bump"`이고 seed가 아니면 `AskUserQuestion`으로 patch·minor·major를 묻는다 — 선택지 라벨에 각 다음 버전(`candidates`), `recommended`를 첫 선택지로 두고 "(Recommended)"와 근거(`feat 20 → minor`)를 붙인다. seed(`1.0.0`)·재실행(`action: "none"`)은 묻지 않는다. 고른 레벨과 추천이 달랐으면 리포트에 남긴다 |
| 4 | **bump 커밋** (`action: "bump"`일 때만) | 새 | `npm pkg set version=<candidates[고른 레벨]>` → `git diff --name-only`가 `package.json` 하나이고 **`version`을 뺀 JSON이 HEAD와 같은지** 확인(T3 실측: seed는 `version`을 **맨 끝 키로 덧붙여** 직전 줄에 쉼표가 생긴다 — diff가 두 줄이다. 이후 bump는 제자리 한 줄) → `git commit -m "chore(release): v<next>"` → `git push origin dev`. ⚠️ **`/push`를 거치지 않는 유일한 dev 커밋이다** — 로컬 게이트가 볼 코드가 없다. CLAUDE.md 브랜치 정책에 이 예외를 적는다 |
| 5 | **노트 두 벌** `.scratch/pr-v<next>.md` · `.scratch/release-v<next>.md` | 새 | §6. 소스는 둘 다 3단계 출력의 커밋 목록. **Release 노트도 머지 전에 쓴다** — 머지 뒤 9단계를 명령 하나로 남겨 "머지는 됐는데 릴리스가 안 됨" 창을 줄인다 |
| 6 | PR 생성/재사용 | 기존(바뀜) | 제목 `v<next>: <summary>`, `--body-file .scratch/pr-v<next>.md`(마이그레이션이면 그 안에 `Migration applied to production before merge.`). 재사용이면 `gh pr edit`으로 제목·본문을 덮는다 |
| 7 | PR CI 대기 | 기존 | 변화 없음 |
| 8 | squash 머지 | 기존(바뀜) | **`--subject "v<next>: <summary> (#<n>)"`를 명시한다**(§5 POSTMORTEM 2026-09-17). 머지 뒤 `gh pr view <n> --json mergeCommit -q .mergeCommit.oid`로 squash SHA를 받는다 |
| 9 | **GitHub Release + 태그** | 새 | `gh release create v<next> --target <squash SHA> --title v<next> --notes-file .scratch/release-v<next>.md --latest` → `git ls-remote --tags origin v<next>`가 squash SHA인지 확인. **실패해도 10단계로 간다**(머지는 끝났다) — 리포트에 재실행 명령을 그대로 남기고, `/merge`를 다시 부르지 않는다 |
| 10 | dev 동기화 | 기존 | 변화 없음. bump 커밋이 squash에 실렸으므로 `git diff --quiet origin/main origin/dev`가 성립한다 |
| 11 | 프로덕션 배포 확인 + composite action 안내 | 기존 | 변화 없음. **앱 버전과 `malmoi-i18n-push-vN`은 별개 축**이라는 한 줄을 더한다 |

### 재실행·실패 경로

- **4단계 push 뒤 중단**(PR CI red 등): dev에 bump가 남는다. 고친 뒤 다시 `/merge` → 3단계가 `action: "none"`(버전 > 직전 태그)
  → 4단계 건너뜀. 버전이 두 번 오르지 않는다. 그 사이 `/sync`를 손으로 돌리면 tree 비교가 걸려 멈춘다 — 올바른 동작이다.
- **8단계 성공 · 9단계 실패**: main은 `1.0.0`, 태그 없음. 리포트의 명령을 손으로 재실행한다. 다음 `/merge`까지 미루면
  3단계가 `lastTag`를 옛 값으로 보아 `version`(=main의 값) > `lastTag` → `action: "none"`으로 판정해 **같은 번호를 다시 쓰려 한다**
  → 그래서 3단계는 "`version`에 해당하는 태그가 없고 main의 `package.json`이 이미 그 버전"이면 **에러로 멈추고 9단계 재실행을 요구**한다(§4 `planRelease`의 `unreleased-on-main`).

## 4. 순수 함수 — `/tdd` 진입점

위치: `scripts/release.ts`(순수) + `scripts/release-plan.ts`(git 호출 껍데기). 테스트: `scripts/__tests__/release.test.ts`.
⚠️ **`lib/`가 아닌 이유**: 앱 런타임이 쓰지 않는 하네스 로직이고, `lib/`는 sec-audit-3이 진행 중이다. `scripts/format.ts`가 같은 선례다.

```ts
type Semver = { major: number; minor: number; patch: number };
type Level = "major" | "minor" | "patch";

parseVersion(s: string): Semver | null          // "1.2.3"만. "v1.2.3"·"1.2"·"01.2.3"·"1.2.3-rc.1" → null
formatVersion(v: Semver): string
compareVersion(a: Semver, b: Semver): -1 | 0 | 1
latestReleaseTag(tags: string[]): Semver | null // /^v\d+\.\d+\.\d+$/만. "malmoi-i18n-push-v1"·"l10n-push-v1"·
                                                // "doc-check-wip-20260923"·"v1" 제외. 생성 순이 아니라 semver 최대
recommendLevel(commits: { subject: string; body: string }[]): { level: Level; reason: string }
                                                // `type!:`/`type(scope)!:` 또는 body의 "BREAKING CHANGE:" → major,
                                                // 아니면 `feat` 존재 → minor, 아니면 patch(비-Conventional 제목 포함).
                                                // reason 예: "feat 20 → minor". 결정 1의 추천 선택지다 — 판정이 아니다
nextVersion(v: Semver, level: Level): Semver    // minor는 patch를 0으로, major는 minor·patch를 0으로
planRelease(input: {
  pkgVersion: string | null;     // origin/dev의 package.json version (없으면 null)
  mainVersion: string | null;    // origin/main의 package.json version
  tags: string[];                // 원격 태그 이름
  commits: { subject: string; body: string }[]; // origin/main..origin/dev
}): Plan
```

`Plan`은 판별 유니온이고, **위에서부터 첫 일치**로 판정한다(`unreleased-on-main`이 `nothing-to-release`보다 앞선다 — 9단계가 실패한 뒤엔 머지할 커밋이 0이라, 순서가 반대면 진짜 원인이 가려진다):

| 조건 | 결과 |
|---|---|
| `mainVersion`이 있고 그 버전의 `v` 태그가 없고 `mainVersion` > 직전 태그(또는 태그 없음) | `error: "unreleased-on-main"` — 9단계 재실행 요구 |
| `commits` 비었음 | `error: "nothing-to-release"` |
| `pkgVersion`이 있는데 `parseVersion` 실패 | `error: "invalid-version"` |
| 태그 없음 + `pkgVersion` null | **seed**: `action: "bump"`, `seed: true`, `candidates` 셋 다 `"1.0.0"` — 질문 없음 |
| 태그 없음 + `pkgVersion` 있음 | `action: "none"`, `next: pkgVersion` (seed bump가 이미 dev에 있다) |
| `pkgVersion` < 직전 태그 | `error: "behind-last-tag"` |
| `pkgVersion` == 직전 태그 (또는 null인데 태그 있음) | `action: "bump"`, `candidates: { patch, minor, major }` = `nextVersion(lastTag, 각 레벨)`, `recommended: recommendLevel(commits)` |
| `pkgVersion` > 직전 태그 | `action: "none"`, `next: pkgVersion` (재실행) |

`Plan`은 `lastTag`(없으면 null)와 `compareBase`(`https://github.com/SinhyeokKang/malmoi/compare/v<last>...`, seed면 null)를 함께 든다 —
Release 노트의 Full changelog 줄이 거기에 `v<고른 버전>`을 붙인다. **후보 셋을 한 번에 내므로 레벨을 고른 뒤 스크립트를 다시 부르지 않는다.**

**껍데기 `scripts/release-plan.ts`**(테스트 대상 아님 — 인자를 받지 않는다. 인자가 있으면 exit 2):

- 입력을 모은다: `git ls-remote --tags --refs origin` · `git show origin/dev:package.json` · `git show origin/main:package.json` ·
  `git log origin/main..origin/dev --format=%s%x1f%b%x1e`.
- ⚠️ **태그는 로컬이 아니라 `ls-remote`로 읽는다** — 태그는 9단계가 서버에서 만들고, 로컬에는 `l10n-push-v1`·`doc-check-wip-20260923` 같은
  원격에 없는 태그가 있다(실측). 원격이 정본이다.
- 출력: stdout에 JSON 한 개. exit 0 = 판정 성공(`bump`/`none`), 1 = `error` 판정, 2 = 인자가 주어짐. **소비자는 `/merge` 3단계 하나다**(결정 3 — `/push`·`/orchestrate`는 부르지 않는다).
- `pnpm release:plan` 스크립트를 `package.json`에 더한다. **쓰기는 하지 않는다** — 버전 기록은 `/merge` 4단계의 `npm pkg set`이다.

### 스크립트가 과한가 (CLAUDE.md "확장성 선반영 금지"와의 대조)

- 레벨 규칙은 3줄이고 이제 추천일 뿐이다 — 그것만이라면 스크립트가 필요 없다. 스크립트를 두는 이유는 **태그 필터와 seed·재실행 판정**이다: 이것들이 산문 명령으로는 조용히 틀린다 — `git describe --tags`가 이미
  `malmoi-i18n-push-v1`을 준다(실측). 이 판정을 스킬 본문에 두면 `pnpm test`가 못 본다.
- 대신 **설정·옵션을 두지 않는다**: 태그 접두어·레벨 규칙·리포 URL은 상수다. prerelease(`-rc`)·빌드 메타데이터·레벨 커스터마이즈·
  노트 렌더러는 만들지 않는다. 노트는 LLM이 쓰는 글이라 순수 함수 대상이 아니다.

## 5. POSTMORTEM에서 소환한 것

- **2026-09-17 — 번역 PR을 merge commit으로 머지하면 루프 마커가 사라져 push가 DB를 덮었다** (2133–2139행).
  교훈: "**GitHub이 재조립하는 필드**(squash 기본 메시지 등)에 우리 문자열이 실린다고 가정하지 않는다." → squash 커밋 제목의 버전을
  GitHub 기본값(커밋 1개짜리 PR이면 PR 제목이 아니라 그 커밋 메시지를 쓴다)에 맡기지 않고 **`--subject`로 명시**한다(8단계).
  또 **버전의 정본은 태그와 `package.json`이지 main 커밋 제목이 아니다** — `planRelease`는 커밋 제목을 레벨 추천에만 쓴다.
  같은 항목의 grep 규칙 `rg -n "gh pr merge" .claude/commands`는 `merge.md`의 `--squash`를 "우리 리포의 정책이라 예외"로 두는데,
  행 번호(`merge.md:61`)로 적혀 있어 이번 개정 뒤 번호가 어긋난다 — POSTMORTEM은 append-only라 고치지 않고, 예외가 **내용상** 그대로
  참(여전히 `--squash`)임을 확인만 한다.
- **2026-08-31 — 모듈 로드 시점에 환경변수를 요구해 CI가 red** (21–28행) 의 그물 기록: "`/push` 6단계가 의도적으로 논블로킹이라 CI
  실패는 항상 사후 발견". → 4단계의 bump push도 dev CI를 기다리지 않는다. 대신 그 SHA를 **7단계 PR CI가 required check로** 막는다.
- **`/sync`·`/merge` 6단계의 fetch-먼저·SHA lease** (`sync.md` 1·4단계, 2026-09-13 Codex 하네스 검토 지적 1): 이번 개정은 그 절차를
  건드리지 않는다. 다만 0단계에 `git fetch origin`을 두어 3단계의 `origin/main..origin/dev` 계산이 같은 함정(stale ref 위의 검사)을
  밟지 않게 한다. ⚠️ `merge.md` 6(→10)단계와 `sync.md`는 "두 곳이 갈리면 안 된다" — 이번엔 둘 다 절차 불변이다.

## 6. 노트 두 벌 (결정 2)

공통: **영문**(CLAUDE.md 예외에 GitHub Release notes를 명시로 더한다 — bugshot-2 CLAUDE.md 13행과 같은 모양). 소스는 `origin/main..origin/dev`
개별 커밋(3단계 출력). `.scratch/`는 gitignore라 커밋에 안 딸려간다. 표기는 화면 이름 `Malmoi`, 식별자·URL `malmoi`.

### 6.1 PR body — 개발자용 (`.scratch/pr-v<next>.md`)

독자는 머지를 판단하는 개발자(나)다. **걸러내지 않는다** — 내부 변경(하네스·문서·테스트·리팩터)도 영역별로 싣는다. 지금 `/merge` 3단계
PR body("이번에 들어가는 변경을 항목으로")를 잇고 양식만 고정한다:

```markdown
## Changes

### <Area — e.g. Publish, Onboarding, Security, Harness, Docs>
- <What changed, one line> (<short SHA or commit type>)

## Migrations

- `<migration name>` — applied to production before merge.   ← 없으면 "None."

## Notes

- <Deploy-order caveats, composite action tag move pending, follow-ups>   ← 없으면 절 생략
```

### 6.2 GitHub Release — 사용자용 (`.scratch/release-v<next>.md`)

bugshot-2 `deploy.md` 6단계 규칙에서 Install 절을 뺀 것이다. **사용자가 체감하는 변화만** 남기고 `docs`·`test`·`chore`·`refactor`·`build`·
하네스(`.claude/`·`.agents/`·CLAUDE.md)는 뺀다. 커밋 메시지를 옮기지 않고 "사용자가 무엇을 하게 됐나"로 다시 쓴다.

```markdown
## Highlights

<One sentence.>

## Features

### <Area>
- **<Headline>.** <What changed for the user and why it matters, 1–3 sentences.>

## Fixes

- **<Headline>.** <Symptom the user saw, and what they see now.>

**Full changelog:** https://github.com/SinhyeokKang/malmoi/compare/v<prev>...v<next>
```

- 남는 커밋이 0이면 Highlights에 `Maintenance release — no user-facing changes.` 한 줄, Features·Fixes 생략.
- **1.0.0만 다르다**: 직전 태그가 없으니 compare 줄을 뺀다. Highlights는 "첫 공개 릴리스"로, Features는 157커밋 나열이 아니라
  README의 기능 절을 기준으로 **지금 할 수 있는 것**을 영역별로 요약한다(사실 대조 소스는 PRODUCT·README·가이드).
  PR body는 1.0.0이어도 6.1 양식 그대로다(157커밋을 영역별로 접는다).

## 7. 버전 레벨 — 웹앱에서 major는 무엇인가

malmoi의 외부 소비자는 대상 리포뿐이고, 그 계약은 `/api/push` 페이로드와 composite action의 `inputs`다(`docs/ACTIONS.md`).
**major = 대상 리포가 워크플로를 바꿔야 하는 변경**으로 정의한다 — 그때는 action 태그도 `-v2`로 새로 끊는다(`merge.md` 7단계의 기존 규칙).
지금까지 `!:` 커밋은 0건이다(전 히스토리 실측) — 추천이 major가 될 일은 드물고, 필요하면 3단계 질문에서 major를 고른다.

## 8. CI·태그 이름공간

- `ci.yml`의 `on.push`는 `branches: [main, dev]`만 가진다 — **`branches`만 준 필터는 태그 push에 발화하지 않는다.** `release:` 이벤트
  워크플로도 없다. 새 트리거를 더하지 않으므로 태그로 도는 것이 없다(검증은 1.0.0 뒤 `gh run list --event push`에 태그 run이 없는지).
- 앱 태그 `v<x.y.z>`와 action 태그 `malmoi-i18n-push-vN`은 이름이 겹치지 않는다. 다만 **`@v1.0.0`도 action을 참조할 수 있는 유효한 ref**
  다 — 대상 리포가 그것을 쓰면 앱 릴리스마다 action이 따라 움직일 수 있다고 오해한다. `ACTIONS.md`에 "앱 릴리스 태그는 action 계약이
  아니다" 한 줄을 둔다.

## 9. 스키마·환경변수·불변식

- **스키마 변경 없음. 새 환경변수 없음.**
- **불변식 영향 없음** — ARCHITECTURE §0 열하나 중 어느 것도 하네스 절차를 다루지 않는다. 병합 로직·양방향 동기화를 요구하지 않는다.
- 범위 게이트: PRODUCT §4.2(과금·조직 계층·TM·실시간 편집·범용 알림·포맷 설정 UI·셀프 삭제)·§4.3(판정 다섯) 어디에도 걸리지 않는다 —
  제품 기능이 아니라 배포 절차다. **PRODUCT·ARCHITECTURE 갱신 불필요.**

## 10. Codex 미러

- `merge`·`sync`·`push`·`orchestrate`는 이미 `scripts/sync-agents.mjs`의 `EXCLUDE`다 — 원격 상태(태그·Release 포함)를 바꾸는 창구를
  Claude Code 하나로 두는 기존 이유가 이번 변경으로 더 강해질 뿐, 목록은 그대로다.
- **CLAUDE.md → `AGENTS.md`는 미러된다** — CLAUDE.md를 고치는 커밋은 `pnpm sync:agents`로 `AGENTS.md`를 같이 싣는다.
- `ship.md`(미러 대상)는 이번에 고치지 않는다 — 그 리포트는 `/push` 리포트를 인용하고, 버전은 `/merge`의 일이다.

## 11. 다른 스킬·문서가 받는 변경

| 파일 | 변경 | 미러 |
|---|---|---|
| `.claude/commands/merge.md` | §3의 0–11단계로 재작성. description에 "버전 bump + 태그 + GitHub Release". 리포트에 `버전: v<prev> → v<next> (<고른 레벨> · 추천 <recommended>: <reason>)` · `릴리스: <url> / ⚠️ 실패(재실행 명령)`. 금지 사항에 "Release `--draft` 금지(머지 = 배포)", "`version`을 4단계 밖에서 바꾸지 않는다", "태그 강제 이동·삭제 금지" | 제외 |
| `.claude/commands/push.md` | 금지 사항에 한 줄: "`package.json`의 `version`을 바꾸지 않는다 — `/merge` 4단계 몫". **리포트는 그대로**(결정 3 — 예상 버전을 싣지 않는다) | 제외 |
| `.claude/commands/sync.md` | 한 줄: "bump 커밋이 dev에만 있고 머지 전이면 2단계 tree 비교가 걸린다 — 정상이다, `/merge`를 다시 부른다" | 제외 |
| `.claude/commands/orchestrate.md`·`ship.md`·`pull.md`·`db.md` | **변경 없음** — `/merge`를 이름으로만 부르고 단계 번호를 인용하지 않는다(`db.md`의 "`/merge` 1단계"는 번호가 그대로다) | — |
| `CLAUDE.md` | ① 응답 스타일 예외에 "GitHub Release notes" ② 브랜치 정책 표 `main` 행에 "`v<x.y.z>` 태그 + GitHub Release" ③ 브랜치 정책 아래 **"릴리스 & 버전"** 짧은 절(semver·규칙·1.0.0 seed·`version`은 `/merge`만·bump 커밋이 `/push`를 안 거치는 유일한 dev 커밋·태그는 `gh release create --target`·앱 태그와 action 태그는 별개 축) ④ CI 절에 "태그 push는 어떤 job도 안 돌린다" ⑤ 명령어 표에 `pnpm release:plan`(`/merge` 3단계 전용, 읽기 전용) ⑥ 워크플로 권장 흐름의 `/merge`(프로덕션) → `/merge`(프로덕션 + 릴리스) | `AGENTS.md` 재생성 |
| `docs/ACTIONS.md` | "앱 릴리스 태그(`v<x.y.z>`)는 action 계약이 아니다 — `@malmoi-i18n-push-vN`을 쓴다" 한 줄 | — |
| `docs/DIRECTORY.md` | `scripts/` 행에 `release`(순수 판정) · `release-plan`(`pnpm release:plan` — `/merge` 3단계 전용. 원격 태그·origin/dev·origin/main을 읽는다. exit 0 판정 / 1 error / 2 인자가 주어짐) | — |
| `package.json` | `"release:plan": "tsx scripts/release-plan.ts"`. **`version`은 여기서 넣지 않는다** — 1.0.0 seed는 첫 `/merge` 4단계가 넣는다(스크립트가 `pkgVersion: null`을 seed로 읽는 경로를 실물로 한 번 밟는다) | — |
| PRODUCT·ARCHITECTURE·README | 변경 없음 | — |
