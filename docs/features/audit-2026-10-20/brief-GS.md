# GS — `pnpm guide:check` stale 전부 촬영 (결정 D8)

먼저 `orch.md`를 읽는다. main 체크아웃(`/Users/sinhyeokkang/code/malmoi`)에서 돈다 — `.env.local`이 여기만 있다. **지휘자는 이 배치가 끝날 때까지 main 체크아웃에서 cherry-pick·build를 하지 않는다.**

## 할 일

- `/guide-shots`를 그대로 따른다(`guide/SHOOTING.md` 전문을 먼저 읽는다 — 규격·마스킹·매핑·벽·셋업 선례가 거기 있다).
- 대상은 지금 `pnpm guide:check`가 내는 stale **전부**다(시작 시점 25컷 29건). 컷마다 재촬영과 SHA만 갱신 중 무엇인지는 그 스킬의 판정을 따른다. 다만 사용자가 "전부 촬영"을 원했으므로 **화면이 바뀌었을 가능성이 조금이라도 있으면 다시 찍는다**. SHA만 갱신하는 컷은 근거(diff·대조 캡처)를 SHOOTING 진행 기록에 남긴다.
  - 이번 런 몫: `gitlab-ci-file`(job의 `MALMOI_I18N_PUSH_TAG`·SHA가 `malmoi-i18n-push-gitlab-v3`·`753901bc…`로 바뀌었다 — 반드시 재촬영) · `gitlab-ci-variable` · `gitlab-protected-branch` · `translation-edit`.
- dev DB 셋업·원복은 SHOOTING의 선례대로 하고, 전후 대조 표를 진행 기록에 남긴다. prod는 건드리지 않는다. Publish로 원격 리포에 쓰지 않는다.
- 시스템 브라우저를 열지 않는다. ego 태스크 스페이스는 하나만 쓰고 끝나면 닫는다.
- 끝나면 `pnpm guide:check`가 stale 0인지 확인하고 `pnpm test`의 가이드 관련 테스트를 돌린다.
- 커밋: 이미지·SHOOTING.md를 `docs(guide): …`로(스킬 관례에 맞춰 나눠도 된다). push 금지.
- `.scratch/handoff-GS.md`에 컷별 결과(재촬영/SHA만 + 근거) · 전후 DB 대조 · `guide:check` 끝 출력 · 커밋을 쓰고 `worker_done` 한 번. 한국어.
