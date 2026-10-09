# Self-hosting 워커 공통 규칙

- 계획 원본: `docs/features/self-hosting/{spec,design,tasks}.md` + 지휘 계획 `orch.md`. **orch.md의 배치 표에서 네 배치의 "소유 파일" 밖은 건드리지 않는다.** 범위 밖이 필요하면 `ask`로 묻는다.
- 시작: `pnpm install && pnpm db:generate` (워크트리엔 setup 훅이 없다).
- `/ship bypass`로 진행한다. 계획 원본은 위 문서, 담당 태스크는 네 브리프. 재정의:
  - 이 워크트리 브랜치 = dev 등가. **11단계(`/push`) 전에 멈춘다.** `/merge`·`/sync`·`git push`·`pnpm db:deploy` 금지.
  - 스키마 변경 없음(필요하면 `ask`).
  - **`.env.local`을 복사하지 않는다.** 게이트는 **`pnpm gate --base dev`** 하나다 — 출력을 `| grep`·`| head`로 거르지 않는다(끝줄 `gate: ok`만 근거).
  - 6.2단계: 결정적으로 잴 수 있는 확인은 테스트로 쓰고, 인계 문서 "런타임 검증 목록"에는 런타임에서만 보이는 것만 이유 한 줄과 함께 남긴다.
  - 사전 키·화면 문구는 `/translate` 모드 ①.
- 테스트 우선(CLAUDE.md). 판정은 메시지 문자열이 아니라 사유 코드로 단언한다(POSTMORTEM 2026-09-08).
- 커밋 메시지 영문, `Refs`만(이슈 Close 금지). 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 인계: `.scratch/handoff-<배치>.md`에 커밋 목록 · `pnpm gate --base dev` 끝줄 · 계획과 다른 점 · 미완 · 런타임 검증 목록을 쓰고, preamble의 지침대로 `worker_done`을 **한 번** 보낸 뒤 대기한다.
- 대기 중에도 지휘자의 신호는 터미널 입력으로 온다 — 입력을 받으면 `orca orchestration check`로 쌓인 메시지부터 읽는다.
