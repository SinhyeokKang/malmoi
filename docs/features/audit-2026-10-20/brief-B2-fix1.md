# B2 fix1 — 가이드의 gitlab-v2 서술 (B2 미룬 항목)

`9a56bd4c`는 dev에 통합됐다(`534f8c65`). 먼저 `git rebase dev`(로컬 dev — `/Users/sinhyeokkang/code/malmoi`의 dev가 워크트리 공유 ref다) 후 진행한다.

## 할 일

- `/guide` 규칙(`guide/AUTHORING.md`)대로 `guide/{en,ko,es}/self-hosting/README.md` 42행 부근의 `malmoi-i18n-push-gitlab-v2`를 `malmoi-i18n-push-gitlab-v3`로 고친다. 세 언어를 같은 커밋에서. 다른 원고에 gitlab-v2가 더 있으면 같이 본다(`grep -rn "gitlab-v2" guide/`).
- `guide/SHOOTING.md`는 촬영 기록이라 건드리지 않는다. `gitlab-ci-file` 컷 재촬영은 지휘자가 통합 뒤 `/guide-shots` 행으로 따로 돌린다.
- 검증: `pnpm test`의 가이드 게이트(가이드 관련 테스트 파일만 돌려도 된다 — 머신 부하가 높다) + `pnpm gate --base dev`. 부하로 test 단계가 타임아웃 red면 실패 파일만 낮은 동시성으로 재실행한 결과를 인계에 적는다.
- 커밋: `docs(guide): point the self-hosting note at malmoi-i18n-push-gitlab-v3`
- `.scratch/handoff-B2.md`에 fix1 절을 덧붙이고 `worker_done`을 한 번 보낸다.
