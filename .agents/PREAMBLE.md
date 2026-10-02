# AGENTS.md

> **이 파일은 자동 생성물이다.** 원본은 [CLAUDE.md](./CLAUDE.md)이고 `pnpm sync:agents`가 아래 본문을 그대로 복제한다.
> 고칠 내용이 있으면 **CLAUDE.md를 고치고** `pnpm sync:agents`를 돌려라 — 이 파일을 직접 편집하면 다음 sync에서 덮어써진다.
> 같은 규칙이 `.agents/skills/`(= `.claude/commands/` 미러)에도 적용된다. 이 프리앰블만 예외로 `.agents/PREAMBLE.md`에서 손으로 관리한다.
> 본문이 `CLAUDE.md`·`.claude/commands/`를 가리키면 **그 원본 경로가 맞다** — 치환 없이 복제하므로 그대로 읽으면 된다.

## Codex 런타임 차이 (이 프리앰블 전용)

Claude Code에만 있는 자동 안전망이 Codex 세션에는 없다. 아래는 **직접** 챙긴다.

- **스킬 호출 매핑** — 본문이 `/<name>`으로 부르는 스킬은 Codex에선 `source-command-<name>` 스킬로 로드한다.
- **공통 스킬 권한** — `/push`·`/merge`·`/sync`·`/orchestrate`를 포함해 모든 명령을 미러한다. Codex도 같은 브랜치·소유권·검증 게이트를 거쳐 실행한다. `/ship`·`/orchestrate`는 dev까지이고, 프로덕션은 사용자가 별도로 `/merge`를 호출할 때만 반영한다. 원격 변경은 해당 작업을 맡은 세션 하나가 수행하고, 다른 세션의 같은 브랜치 작업과 겹치면 먼저 조율한다.
- **워커 모델 경계** — 워커·서브에이전트를 호출하는 세션이 Codex면 Codex의 Sol·Astra, Claude Code면 Claude의 Sonnet·Opus만 호출한다. `/orchestrate`와 단독 리뷰 스킬 모두 적용한다. 구현·리뷰·QA·재사용·수정 라운드에도 같고, 패밀리 교차는 사용자의 명시 허가가 있을 때만 허용한다.
- **도구 가용성** — 브라우저 QA·촬영·시안 대조는 런타임 이름이 아니라 실제 필요한 도구를 확인한다. Codex의 `/design-sync`는 사용자에게 로컬 핸드오프 파일 경로를 받고 `ego-browser`로 대조한다(DesignSync 대체 호출 없음). 없으면 해당 검증을 미완으로 남기고 실행 가능한 경로를 보고한다. `AskUserQuestion`은 현재 런타임의 질문 도구 또는 일반 질문으로 대응하며, 필요한 답 없이 의존 작업을 진행하지 않는다.
- **결정성 훅 없음** — Claude Code는 `.claude/settings.json`의 PostToolUse 훅이 `lib/adapters/`·`lib/githash.ts`·`lib/push/`·`lib/keys/`·`lib/scan/` 편집 시 관련 테스트를 자동 실행해 결정성·판정 붕괴를 차단한다. Codex엔 이 훅이 없으니 그 파일을 건드렸으면 손으로 돌린다: `pnpm test`
- **미러 sync 훅 없음** — Claude Code는 `CLAUDE.md`·`.claude/commands/*.md` 편집 시 훅이 `sync:agents`를 자동 실행한다. Codex엔 없다. 원본(`CLAUDE.md`·`.claude/commands/`·이 프리앰블)을 고쳤으면 `pnpm sync:agents`를 직접 돌려 미러를 함께 커밋한다.
- **개인 메모리 없음** — 본문 말미의 `~/.claude/projects/.../memory/`는 Claude Code 전용 저장소다. Codex는 이 경로를 읽지 않는다.
- **커밋 트레일러** — Codex 세션에서 만든 커밋은 마지막 줄에 `Co-Authored-By: Codex <noreply@openai.com>`를 붙인다(Claude Code의 `Co-Authored-By: Claude ...`와 대칭 — 어느 에이전트가 만든 커밋인지 히스토리에서 구분되게).

---
