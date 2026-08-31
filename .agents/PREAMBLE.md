# AGENTS.md

> **이 파일은 자동 생성물이다.** 원본은 [CLAUDE.md](./CLAUDE.md)이고 `pnpm sync:agents`가 아래 본문을 그대로 복제한다.
> 고칠 내용이 있으면 **CLAUDE.md를 고치고** `pnpm sync:agents`를 돌려라 — 이 파일을 직접 편집하면 다음 sync에서 덮어써진다.
> 같은 규칙이 `.agents/skills/`(= `.claude/commands/` 미러)에도 적용된다. 이 프리앰블만 예외로 `.agents/PREAMBLE.md`에서 손으로 관리한다.
> 본문이 `CLAUDE.md`·`.claude/commands/`를 가리키면 **그 원본 경로가 맞다** — 치환 없이 복제하므로 그대로 읽으면 된다.

## Codex 런타임 차이 (이 프리앰블 전용)

Claude Code에만 있는 자동 안전망이 Codex 세션에는 없다. 아래는 **직접** 챙긴다.

- **스킬 호출 매핑** — 본문이 `/<name>`으로 부르는 스킬은 Codex에선 `source-command-<name>` 스킬로 로드한다.
- **미제공 스킬 (역할 분담)** — `/push`·`/merge`·`/sync`는 미러하지 않는다. **Codex는 작업 → 커밋까지, 원격으로 나가는 건 Claude Code**가 단일 창구로 맡는다 — main 머지가 곧 Vercel 프로덕션 배포이므로 두 창구가 경쟁하면 배포가 깨진다. 이 스킬들이 필요해지면 사용자에게 Claude Code 세션에서 실행하라고 안내하고 멈춘다.
- **`/ship`은 커밋까지** — `source-command-ship`은 미러돼 있고 마지막 커밋 단계까지 전부 돈다. push 단계는 **수행하지 않고** "push 대기 — Claude Code에서 `/push` 실행"을 리포트에 남기고 종료한다. 상세는 스킬 본문의 "push 권한 / 런타임별 종착점".
- **export 결정성 훅 없음** — Claude Code는 `.claude/settings.json`의 PostToolUse 훅이 `lib/export.ts`·`lib/githash.ts` 편집 시 관련 테스트를 자동 실행해 결정성 붕괴를 차단한다. Codex엔 이 훅이 없으니 그 파일을 건드렸으면 손으로 돌린다: `pnpm test`
- **미러 sync 훅 없음** — Claude Code는 `CLAUDE.md`·`.claude/commands/*.md` 편집 시 훅이 `sync:agents`를 자동 실행한다. Codex엔 없다. 애초에 **Codex는 원본을 편집하지 않는 게 규칙**이고, 부득이 고쳤으면 `pnpm sync:agents`를 직접 돌려 미러를 함께 커밋한다.
- **개인 메모리 없음** — 본문 말미의 `~/.claude/projects/.../memory/`는 Claude Code 전용 저장소다. Codex는 이 경로를 읽지 않는다.
- **커밋 트레일러** — Codex 세션에서 만든 커밋은 마지막 줄에 `Co-Authored-By: Codex <noreply@openai.com>`를 붙인다(Claude Code의 `Co-Authored-By: Claude ...`와 대칭 — 어느 에이전트가 만든 커밋인지 히스토리에서 구분되게).

---
