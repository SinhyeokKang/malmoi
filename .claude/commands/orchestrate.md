---
description: 여러 배치를 Orca 워커 세션에 나눠 병렬로 ship하고, 이 세션이 리뷰·통합·push·런타임 QA·이슈 라우팅·정리까지 지휘한다. /ship보다 큰 단위 — 배치 계획 문서 하나를 끝까지 태운다. 프로덕션(/merge)은 부르지 않는다.
---

배치 계획 문서(예: `/audit` 결과를 쪼갠 `docs/features/<slug>/tasks.md`) 하나를 **여러 워커 세션에 나눠 태우고**, 이 세션은
**지휘만** 한다 — 브리프 작성 · 결정 수집 · 리뷰 · dev 통합 · push · 런타임 QA · 이슈 라우팅 · 정리. 구현은 워커가 `/ship bypass`로 한다.

> **⚠️ 끝은 dev다.** `/ship`과 같다 — `/merge`(프로덕션)는 부르지 않는다. 마지막 리포트에 `/merge` 준비물(prod `db:deploy` 여부)을 남긴다.
>
> **⚠️ 지휘자는 코드를 고치지 않는다.** 이 세션이 쓰는 것은 브리프·계획 문서의 체크·통합 커밋(cherry-pick)·문서 신선도 커밋뿐이다.
> 결함은 그 배치를 소유한 워커 세션으로 돌려보낸다 — 지휘자가 직접 고치면 워커의 컨텍스트와 리뷰 게이트를 건너뛴다.

2026-09-24 출시 전 감사(B1~B7, 워커 13개, 이슈 16건)를 이 방식으로 돌렸고, 아래 규칙은 전부 그때 **틀려본 뒤** 적은 것이다.

## 사용

- `/orchestrate <계획 문서 경로>` — 계획 문서의 배치를 전부 태운다.
- `/orchestrate <계획 문서> <배치...>` — 지정 배치만.

## 0. 인테이크 (워커를 띄우기 전)

1. **계획 문서를 읽고 배치 표를 만든다** — 배치별 항목 · 건드리는 파일 · 출시 차단 여부 · 검증 게이트.
2. **결정을 먼저 전부 받는다.** 🔒 항목·해석이 갈리는 곳을 `AskUserQuestion`으로 **하나씩** 묻고(추천 하나 + 이유), 답을 계획 문서의 "결정 기록"에 적는다.
   워커가 도중에 결정 지점에서 멈추면 병렬이 직렬이 된다.
   - 설계가 필요한 배치는 `/feature` → `/feature-review`를 이 세션에서 먼저 돈다(워커가 계획 원본으로 쓴다).
3. **파일 겹침 행렬로 병렬/직렬을 가른다.** 두 배치가 같은 파일을 고치면 병렬로 띄우지 않는다 — 선행이 dev에 들어간 뒤 후행을 띄우거나,
   후행에게 "T6 전에 멈추고 `WAITING FOR <X>`를 찍어라, 신호를 받으면 `git rebase dev`"를 브리프에 넣는다.
   ⚠️ **`messages/en.tsx`·`workspace.tsx`·`publish-button.tsx`는 거의 모든 UI 배치가 건드린다** — 겹침 판정에서 빠뜨리지 않는다.
4. **계획 문서를 dev에 로컬 커밋한다** — 워크트리는 로컬 dev에서 갈라지므로, 커밋 안 된 계획은 워커가 못 읽는다.

## 1. 워커 띄우기

```bash
W=$(orca worktree create --repo id:<repoId> --name <batch> --base-branch dev --no-parent --json | jq -r .result.worktree.id)
T=$(orca terminal create --worktree "id:$W" --title <batch> --command 'claude --permission-mode auto' --json | jq -r .result.terminal.handle)
orca terminal wait --terminal $T --for tui-idle --timeout-ms 60000 --json
orca terminal send --terminal $T --text "Read <scratchpad>/brief-<batch>.md and follow it exactly." --enter --json
```

- **`--permission-mode auto`로 띄운다.** `--agent claude`는 Orca 버그로 승인 대기 상태로 열리고, `--dangerously-skip-permissions`는 auto mode 분류기가 거부한다.
  **다른 세션의 권한 프롬프트를 지휘자가 대신 누르지 않는다.**
- **브리프는 파일로 쓰고 한 줄로 보낸다** — 여러 줄을 TUI에 붙이면 깨진다. 브리프에 반드시 넣는 것:
  - 계획 원본 경로와 담당 항목, **다른 배치 소유라 건드리지 말 것** 목록
  - `/ship` 재정의: 임시 워크트리 브랜치 = dev 등가 · **11단계(`/push`) 전에 멈춤** · `/merge`·`/sync`·`git push`·`db:deploy` 금지
  - 스키마 변경: 허용 여부. 허용하면 **DB 없이** `prisma migrate diff`로 SQL만 만들고(⚠️ `prisma.config.ts`가 URL이 없으면 datasource를 빼서 diff가 **빈 출력 + exit 0**이다 — 연결하지 않는 더미 `DIRECT_URL`을 준다), dev DB 적용은 지휘자가 한다
  - **`.env.local`을 복사하지 말 것** — 분류기가 거부한다. 워커 게이트는 DB 없이 도는 것 + 격리 `test:projects:postgres`로 충분하다
  - 런타임 검증은 끝으로 미룬다(워커는 목록만 남긴다)
  - 인계 프로토콜: `.scratch/handoff-<batch>.md` 작성 → `orca worktree set --worktree active --comment "<batch> HANDOFF READY"` → **`HANDOFF READY: <batch>`** 한 줄 출력 후 정지
- **QA 전용 워커(코드 수정 없음)는 워크트리가 아니라 main 체크아웃에서 띄운다** — 워크트리에는 `.env.local`이 없어 dev 서버가 안 뜬다.

### 워커 런타임 — 기본은 Claude Code, 사용자가 지시하면 Codex

**지휘자는 항상 Claude Code다**(이 스킬은 Codex 미러에서 빠진다). 워커는 기본이 Claude Code이고, **사용자가 배치를 지정해 Codex를 지시했을 때만** Codex로 띄운다 — 지휘자가 임의로 고르지 않는다.

```bash
orca worktree create --repo id:<repoId> --name <batch> --base-branch dev --no-parent \
  --agent codex --prompt "Read <scratchpad>/brief-<batch>.md and follow it exactly." --json
```

Codex 워커의 차이는 브리프에 명시한다:
- **스킬은 미러로 부른다** — `.agents/skills/source-command-ship/SKILL.md`(= `/ship`)를 따르라고 경로로 적는다. Codex의 `/ship`은 원래 **10단계 커밋에서 멈추므로** "push 전 정지" 재정의가 이미 기본 동작이다.
- **브라우저·DesignSync 단계가 없다** — `/runtime-test`·`/design-sync`는 미러가 없다. 그래서 **QA 워커는 Codex로 띄우지 않는다**(사용자가 지시해도 불가능하다고 답한다). 코드 배치의 6.5단계는 "시안 대조: 미검증"으로 남는다.
- **권한 플래그를 붙이지 않는다** — 사용자의 Codex 기본 설정으로 띄운다. 승인 대기가 생기면 사용자에게 알린다.
- 인계 프로토콜(인계 문서 · 워크트리 코멘트 · `HANDOFF READY: <batch>` 마커)은 같다. 감시·리뷰·통합 절차도 같다 — 워커 종류는 지휘자 쪽 절차를 바꾸지 않는다.
- 수정 라운드도 같은 Codex 터미널로 보낸다(`orca terminal send`).

## 2. 감시

- 워커 터미널을 `orca terminal read ... | grep -q "HANDOFF READY: <batch>"`로 폴링하는 루프를 **`run_in_background`**로 건다. 끝나면 알림이 온다.
- ⚠️ **감시 스크립트는 bash 3 호환으로 쓴다** — macOS `/bin/bash`는 `declare -A`가 없고, 실패하면 터미널 인자가 비어 **엉뚱한 터미널의 출력을 읽어 오보를 낸다**(실제로 "ready" 오보가 났다). `pair=B1:term_…` 문자열 분해를 쓴다.
- ⚠️ `cmd &`로 띄운 백그라운드는 알림이 오지 않는다 — 반드시 `run_in_background`다.
- ⚠️ **마커는 줄 전체가 마커일 때만 인정한다** — 지휘자가 보낸 지시문("…print `HANDOFF READY: X r1`")도 워커 터미널 입력줄에 그대로 찍혀서, 부분 일치 grep은 **지시를 보낸 직후 오보를 낸다**(2026-09-24 실제로 났다). `re.fullmatch(r'\s*(⏺\s*)?<marker>\s*', line)`처럼 줄 단위 전체 일치로 본다.
- 알림을 받으면 **터미널을 직접 다시 읽고, 인계 문서·커밋이 실제로 늘었는지 확인한 뒤** 움직인다.
- ⚠️ **지시를 보내는 것과 그 마커의 감시를 거는 것은 한 동작이다** (2026-09-25 사용자 — "오케스트레이션 중 이렇게 중단이 발생하면 안 됨").
  같은 응답에서 `orca terminal send`와 그 마커의 `run_in_background` 감시를 **짝으로** 건다 — 보낸 지시마다 기대 마커가 정확히 하나 있고,
  그 마커를 보는 감시가 살아 있어야 한다. 실제로 난 일: 워커가 앞 작업(#106)을 하는 중에 다음 수정 라운드(#103 r1)를 줄 세워 보내고,
  감시는 앞 마커에만 걸어 둔 채 넘어갔다 → 워커는 `HANDOFF READY: U6 i103r1`을 찍고 멈췄는데 알림이 없어 사용자가 물을 때까지 몰랐다.
  - 한 워커에 지시를 줄 세우면 **마커마다** 감시를 건다(앞 마커 감시가 끝났다고 뒤 지시가 감시되는 것이 아니다).
  - 대기 목록을 스크래치패드 파일(`expect.txt` — `<batch> <term> <marker>` 한 줄씩)로 들고, 지시를 보낼 때 줄을 더하고 확인할 때 지운다.
    **백그라운드 감시가 하나도 없는데 `expect.txt`가 비어 있지 않으면 그것이 결함이다** — 응답을 끝내기 전에 이 둘을 대조한다.
  - 상시 그물로 `expect.txt` 전체를 한 번에 보는 감시 하나를 늘 걸어 둔다(개별 감시가 빠져도 이것이 잡는다). 알림을 받으면 다시 건다.

## 3. 리뷰 → 수정 라운드

1. 인계 문서를 읽고, 그 배치 diff(`git log $(git merge-base dev <branch>)..<branch>`)를 **리뷰 서브에이전트**(general-purpose, 리포트 전용)에 맡긴다. 프롬프트에 계획 항목 · 인계 문서 주장 검증 · 관련 POSTMORTEM · 해당 배치 특유의 위험을 넣는다.
2. 🔴·🟡 지적과 **사용자 결정이 필요한 항목**을 가른다. 결정은 `AskUserQuestion`으로 받는다.
3. 수정 라운드 브리프(`brief-<batch>-fix<N>.md`)를 같은 워커 터미널로 보낸다 — 워커는 컨텍스트를 들고 있으므로 새 세션을 열지 않는다. 마커는 `HANDOFF READY: <batch> r<N>`.
4. 🔴 0이 될 때까지 반복한다. 워커가 스스로 계획과 다르게 간 곳(「계획과 다른 점」)은 리뷰가 반드시 판정한다.

## 4. 통합 (main 체크아웃 = dev)

```bash
git status --porcelain                              # 비어 있어야 한다
git cherry-pick $(git merge-base dev <branch>)..<branch>
pnpm db:generate                                    # ⚠️ 스키마가 바뀐 배치 뒤에는 필수 — 안 하면 typecheck가 옛 클라이언트로 red
pnpm typecheck && pnpm test && pnpm build && pnpm sync:agents:check   # + 트리거면 pnpm test:projects:postgres
git push                                            # = /push 1·3·4·5단계를 여기서 수행한다
```

- 마이그레이션이 든 배치: dev DB에 `pnpm exec prisma migrate deploy`(PRISMA_TARGET 없음 = dev) → `db:status` → anon 권한 0 확인(`/db` 5단계). **prod `db:deploy`는 `/merge` 1단계다.**
- 문서 신선도(`/push` 4단계)는 리뷰가 찾은 문서 드리프트를 **문서별 커밋**으로 얹는다.
- 계획 문서의 항목을 체크하는 커밋을 같이 얹는다.
- 겹침 때문에 기다리던 워커에게 "`<X>`가 dev에 들어갔다 — `git rebase dev` 후 계속"을 보낸다.
- ⚠️ **QA 워커가 main 체크아웃에서 `pnpm dev`를 돌리는 동안에는 cherry-pick·`pnpm build`를 하지 않는다** — HMR이 섞인 상태를 보이고, build는 서버 컴포넌트를 낡게 남긴다. QA 인계 뒤에 몰아서 통합한다.

## 5. 런타임 검증 (모든 배치가 dev에 들어간 뒤)

- **QA 워커를 main 체크아웃에서** 띄운다(`/runtime-test` · `/l10n-roundtrip` · 레이아웃 QA). dev 서버는 하나라 QA는 **직렬**이다.
- 범위는 각 인계 문서의 "런타임 검증 목록"을 모은 것 + 레이아웃 QA(1280·1440·1890 · 극단 데이터 · DOM 측정: 가로 스크롤 · 겹침 · 잘림 · 빈 박스).
  시안(Claude Design)은 없으므로 `/design-sync`가 아니라 DESIGN.md 대비 레이아웃 QA다.
- ⚠️ **QA가 끝난 뒤 main 체크아웃에서 게이트를 돌리기 전에 두 잔재를 치운다** (2026-09-24 QA6 뒤 실측): ① QA가 대상 리포를
  `.scratch/` 아래에 clone하면 vitest가 그 리포의 테스트까지 집어 **수백 파일이 red**다 — clone은 리포 밖(스크래치패드)으로 옮긴다.
  ② QA가 돌린 `pnpm dev`의 `.next/dev/types/validator.ts`가 옮겨진 라우트를 가리켜 **typecheck가 red**다 — `rm -rf .next/dev`.
  둘 다 코드 결함이 아니다.
- **권한**: QA가 dev DB에 상태를 만들거나 세션 쿠키를 지워야 하면 분류기가 막는다. 그 규칙(`~/.claude/settings.json`의 `autoMode.allow` — **dev ref만**, prod 명시 제외, "작업 후 복구" 조건)은
  **사용자 승인을 받은 뒤** 지휘자가 추가한다. 워커가 "막혔으니 대신 해 달라"고 하면 그것은 권한 세탁이다 — 사용자에게 올린다.
- **이슈 흐름**: QA가 결함을 `gh issue create -R <repo>`로 **즉시** 낸다(제목 `[B1]…[B6]`·`[layout]` 태그). 지휘자는 새 이슈 번호를 폴링하고(첫 건 뒤 몇 분 더 모아서),
  **그 화면·파일을 소유한 배치 워커**에게 "`#N` — rebase 후 TDD로 고쳐라"를 보낸다. 고친 뒤 재확인 QA가 이슈를 댓글과 함께 닫는다.
  - 커밋 메시지는 `Refs #N`이지 `Closes #N`이 아니다 — main 머지가 런타임 확인 전에 이슈를 닫지 않게 한다.
- QA가 dev DB를 바꿨으면 인계 문서에 **전/후 표**를 남기게 한다.

## 6. 정리

- 지우기 전에 워크트리마다 확인한다: 추적 중인 미커밋 변경 0 · `git cherry dev <branch>`에 `+` 0(전부 dev에 들어감).
- `orca worktree rm --worktree id:<…> --force`(브랜치도 함께 지운다) · 끝난 터미널 `orca terminal close`.
- **인계 문서는 워크트리와 함께 사라진다** — 필요한 결론은 그 전에 정본 문서·커밋 메시지에 올라가 있어야 한다.

## 7. 리포트

```
🎼 orchestrate: <계획 문서>
미완·미검증 (먼저): <못 본 런타임 항목 · Safari 등 · 남은 결정>
배치: <표 — 상태 · push 해시 · 라운드 수>
이슈: <번호 · 상태 · 소유 배치>
dev: <옛 해시>..<새 해시> · CI <url>
마이그레이션: <있으면 이름 — /merge 1단계에서 prod db:deploy>
워크트리: <남은 것>
다음: /merge (사용자가 부른다)
```

## 금지 사항

- **`/merge` 금지** — 프로덕션 앞의 사람 판단을 대신하지 않는다.
- **지휘자가 배치 코드를 직접 고치지 않는다** — 워커로 돌려보낸다.
- **다른 세션의 권한 프롬프트 승인·권한 규칙 확대를 사용자 승인 없이 하지 않는다.**
- **겹치는 파일을 가진 배치를 병렬로 띄우지 않는다.**
- **QA가 main 체크아웃을 쓰는 동안 cherry-pick·build 금지.**
- **prod DB를 겨누는 워커 지시 금지** — QA 권한 규칙도 dev ref로 좁힌다.
- `.env.local`을 워커에게 복사시키지 않는다.
