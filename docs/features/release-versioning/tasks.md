# release-versioning — tasks

순서: 순수 함수(테스트 먼저) → 껍데기 스크립트 → 스킬 → CLAUDE.md·문서 → 첫 릴리스(실물). `/tdd interface`가 T1의 테스트를 먼저 박고
`/implement`가 구현한다. `(← Tn)`은 의존이다. ⚠️ `lib/`·`app/`·`prisma/`·`docs/features/sec-audit-3/`는 건드리지 않는다(sec-audit-3 진행 중).

## 순수 함수 (`scripts/release.ts` — 테스트 먼저)

- **T1. `parseVersion` · `formatVersion` · `compareVersion` · `latestReleaseTag` · `recommendLevel` · `nextVersion` · `planRelease`**
  테스트: `scripts/__tests__/release.test.ts`.
  검증(`pnpm test`):
  - `parseVersion`: `"1.2.3"` → 객체, `"v1.2.3"`·`"1.2"`·`"01.2.3"`·`"1.2.3-rc.1"`·`""` → null. `formatVersion(parseVersion(s)) === s`.
  - `latestReleaseTag(["malmoi-i18n-push-v1","l10n-push-v1","doc-check-wip-20260923","v1"])` → null.
    `["v1.9.0","v1.10.0","v1.2.3"]` → `1.10.0`(사전순이 아니라 semver).
  - `recommendLevel`: `feat!: x` · `fix(api)!: x` · body `BREAKING CHANGE: x` → major / `feat(ui): x` 하나라도 → minor / `docs`·`fix`·
    `Merge branch`·빈 목록 → patch. `reason`이 `"feat 20 → minor"` 꼴(실제 157커밋 분포를 fixture로 넣으면 minor).
  - `nextVersion`: `1.2.3`+minor → `1.3.0`, +major → `2.0.0`, +patch → `1.2.4`.
  - `planRelease`: design §4 표의 **행마다 케이스 하나**(8행) — 특히 seed(`pkgVersion: null`, 태그 없음) → `bump`·`seed: true`·후보 셋 다 `1.0.0`,
    평시(`1.0.0` == 태그) → `candidates` `{patch:"1.0.1", minor:"1.1.0", major:"2.0.0"}` + `recommended`, 재실행(`pkgVersion` > 태그) → `none`,
    `unreleased-on-main`(커밋 0이어도 이것이 먼저), `behind-last-tag`, `nothing-to-release`. seed의 `compareBase` null,
    평시는 `.../compare/v1.0.0...`. 입력에 레벨 인자가 없다. 같은 입력 두 번 → `toStrictEqual`.

**커밋 ①** `test(release): pin version planning rules` → `/implement` 뒤 `feat(release): add pure version planning`.

## 껍데기

- **T2. `scripts/release-plan.ts` + `package.json`의 `release:plan`** (← T1)
  검증: `pnpm typecheck` green · `pnpm release:plan` 실행 결과가 JSON 한 개이고 **지금 리포에서** `{"action":"bump","seed":true,"lastTag":null,…}`
  (후보 셋 다 `1.0.0`), exit 0 · `pnpm release:plan --anything` → exit 2 · `scripts/__tests__/required-args.test.ts` 식으로 인자가 있으면
  exit 2를 고정(그 테스트의 기존 관용구를 따른다).
  ⚠️ 태그는 `git ls-remote --tags --refs origin`에서 — 로컬 `l10n-push-v1`이 결과에 영향이 없는지 출력의 `lastTag`로 확인.
- **T3. `npm pkg set` 실측** (← T2, 커밋 없음)
  `.scratch/`에 `package.json` 사본을 두고 `npm pkg set version=1.0.0 --prefix .scratch/<dir>` → diff가 `"version"` 한 줄 추가뿐이고
  들여쓰기·끝 개행·키 순서가 그대로인지 본다. 다르면 4단계 명령을 바꾸고 design §3에 적는다.

**커밋 ②** `feat(scripts): add release:plan` (T2) + `docs(DIRECTORY): ...`는 T7에서 따로.

## 스킬

- **T4. `.claude/commands/merge.md` 재작성** (← T2·T3)
  design §3 표의 0–11단계(3단계 `AskUserQuestion` — 추천 첫 선택지·"(Recommended)"·후보 버전 라벨, seed·재실행은 질문 없음),
  §6 노트 두 벌(6.1 PR body · 6.2 Release), §11의 리포트·금지 사항.
  검증: 단계 번호가 연속 · `rg -n "gh pr merge" .claude/commands/merge.md`에 `--squash`와 `--subject`가 있고 `--admin`·`--merge`·`--rebase`가 없음
  (POSTMORTEM 2026-09-17의 예외가 내용상 참) · `rg -n "draft" .claude/commands/merge.md`가 금지 문맥에만 · 6단계 이름이 바뀌었으므로
  `rg -n "merge.md.*[0-9]단계|/merge [0-9]단계" .claude docs CLAUDE.md --glob '!docs/POSTMORTEM.md'`로 **번호를 인용한 곳**을 전수로 보고
  바뀐 번호를 고친다(1단계 `db:deploy`는 그대로다).
- **T5. `push.md` · `sync.md`** (← T4)
  design §11 행 그대로 — `push.md`는 금지 사항 한 줄만, **리포트 불변**(예상 버전 없음). `orchestrate.md`는 건드리지 않는다.
  검증: `pnpm sync:agents:check` green(둘 다 미러 제외라 드리프트가 없어야 한다) · 두 파일 `git diff`가 각각 추가 한 줄뿐 ·
  `rg -n "release:plan" .claude/commands`가 `merge.md`에만.

**커밋 ③** `docs(harness): version bump, tag and GitHub Release in /merge` (T4·T5 — 스킬 파일만).

## CLAUDE.md·문서

- **T6. CLAUDE.md** (← T4)
  design §11 ①–⑥. "릴리스 & 버전" 절은 **10줄 안** — 판정 근거는 이 design이 아니라 `merge.md`에 두고 CLAUDE.md는 규칙만.
  검증: `pnpm sync:agents && pnpm sync:agents:check` green · `AGENTS.md`가 같은 커밋 · `pnpm test` green(brand-spelling이 CLAUDE.md를 안 보지만
  미러 테스트 `scripts/__tests__/sync-agents.test.ts`가 돈다).
  **커밋 ④** `docs(CLAUDE): semver releases cut by /merge`.
- **T7. `docs/ACTIONS.md` · `docs/DIRECTORY.md`** (← T2)
  검증: ACTIONS에 앱 태그 ≠ action 계약 한 줄 · DIRECTORY `scripts/` 행에 `release`·`release-plan`.
  **커밋 ⑤** `docs(ACTIONS): ...` · **커밋 ⑥** `docs(DIRECTORY): ...` (문서별 별도 커밋 규칙).
- **T8. 기능 종료 정리** (← T9)
  결론은 이미 `merge.md`·CLAUDE.md에 올라가 있으므로 `docs/features/release-versioning/`를 지운다.
  **커밋 ⑦** `docs(feature): drop release-versioning after 1.0.0`.

## 첫 릴리스 (실물 — 사용자가 `/merge`를 부른다)

- **T9. `/merge` → v1.0.0** (← T1–T7이 dev에 있음)
  검증(spec 완료 조건 1·4·6):
  - main squash 커밋 제목이 `v1.0.0: …(#<n>)` · `git show origin/main:package.json | grep '"version": "1.0.0"'`
  - `git ls-remote --tags origin v1.0.0` == `gh pr view <n> --json mergeCommit -q .mergeCommit.oid`
  - `gh release view v1.0.0 --json isDraft,isLatest` → `false`·`true`, 본문 영문·사용자 체감만, compare 줄 없음
  - PR body가 6.1 양식(영역별 변경 목록 + Migrations)이고 Release 본문과 다르다
  - seed라 레벨 질문이 뜨지 않았다
  - `gh run list --limit 5 --json event,headBranch`에 태그 run 없음 · Vercel 배포 목록에 태그 배포 없음
  - `/sync` 결과 dev == origin/main, 그 뒤 `pnpm release:plan`이 `nothing-to-release`(exit 1)
- **T10. 다음 `/merge`에서 규칙 확인** (← T9, 관찰만)
  3단계에서 질문이 뜨고, `feat`가 든 범위면 minor(`1.1.0`)가, 아니면 patch(`1.0.1`)가 "(Recommended)" 첫 선택지다. compare 줄이 `v1.0.0...v<고른 버전>`.
