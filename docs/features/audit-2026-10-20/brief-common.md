# 공통 브리프 — 2026-10-20 감사 후속 워커

모든 구현 워커(B1~B5)가 먼저 읽는다. 지휘 계획: `docs/features/audit-2026-10-20/orch.md`(항목 표·파일 소유권·결정 기록).

## `/ship bypass` 재정의

- 구현은 `/ship bypass`로 한다(스코프 가드만 건너뛴다). 네 스킬 `/tdd` → `/implement` → `/code-review` → `/refactor`를 빼지 않는다.
- 임시 워크트리 브랜치 = dev 등가. **11단계(`/push`) 전에 멈춘다.** `/merge`·`/sync`·`git push`·`db:deploy` 금지.
- 스키마 변경 금지.
- **`.env.local`을 복사하지 않는다.** 게이트는 `pnpm gate --base dev` 하나다. ⚠️ 출력을 `| grep`·`| head`로 거르지 않는다 — 끝줄 `gate: ok` / `gate: FAILED at <step>`만 근거다.
- 브라우저가 필요하면 ego-browser만 쓴다. 시스템 브라우저를 열지 않는다(`BROWSER=true`로 무력화).
- 런타임 검증: `/ship` 6.2대로 (a) 결정적으로 잴 수 있는 것은 시나리오 테스트로 먼저 쓰고, 인계의 "런타임 검증 목록"에는 (b)만 남긴다(각 항목이 왜 (b)인지 한 줄).
- **다른 배치를 기다리지 않는다.** 소유 파일 밖을 고쳐야 하는 항목은 하지 말고 남겨 둔 채 나머지를 끝내고, 인계의 "미룬 항목"에 적는다.
- 커밋은 영문 Conventional Commits, 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`(모델에 맞게).

## 인계

`.scratch/handoff-<batch>.md`에 아래를 쓰고 Dispatch 지침대로 `worker_done`을 한 번 보낸 뒤 대기한다.

- 커밋 목록(해시·제목)
- `pnpm gate --base dev` 끝줄 그대로
- 계획과 다른 점
- 미룬 항목
- 런타임 검증 목록((b)만)
