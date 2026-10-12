# Image publish workflow — 지휘 계획

원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md). 이 문서는 실행·결정·검증 증거만 기록한다.

## 시작점·권한

- 시작 dev: `63a27542` (= origin/dev). 범위는 tasks 0~5. tasks 6(콘솔 Actions access · `/merge` 9-b 실물 · v1.3.0~v1.3.3 소급 · 정본 승격)은 `/merge` 몫이라 이 런 밖이다.
- 지휘자: Claude Code. 워커는 Orca Task/Dispatch, 모델 패밀리는 Claude Sonnet·Opus만.
- 사용자: `/orchestrate` 호출. dev push·CI까지. `/merge`·prod DB 변경 없음(스키마 변경 없음).
- 작업 트리: 인테이크 때 clean, 워크트리 하나(`git worktree list`).

## tasks 0 실측 결과 (2026-10-12, 지휘자 — 이 머신에 `brew install docker docker-buildx`, 데몬 없음)

원문 파일: `/Users/sinhyeokkang/code/malmoi/.scratch/image-measure/` (gitignore — 워커는 절대경로로 읽는다).

- docker 29.9.0 · buildx v0.38.0 (Homebrew). `imagetools inspect`는 **데몬 없이** 돈다.
- 없는 태그 `ghcr.io/sinhyeokkang/malmoi:v0.0.0` — 로그아웃·로그인 **둘 다** exit 1, stdout 빈 채, stderr 정확히 `ERROR: ghcr.io/sinhyeokkang/malmoi:v0.0.0: not found\n`(바이트 동일). design §2.1의 분기 문자열과 일치 — 고칠 것 없음.
- 성공 `v1.3.3 --format '{{json .Manifest}}'` — 로그아웃·로그인 같은 출력, exit 0, stderr 빈 채. stdout은 **들여쓰기 2칸의 여러 줄 JSON**이고 `"digest"`가 **셋**이다(최상위 index `sha256:236756bc99ac3408f4d20a4759afc4c62ef675d1fc3b3fb54229bf619102621b` · amd64 manifest · attestation manifest). jq 없이 읽을 때 **최상위(들여쓰기 2칸) digest만** 골라야 한다 — 첫 매치에 기대면 출력 순서가 바뀌는 날 조용히 틀린다.
- 빌드 metadata(`--metadata-file`) — `.scratch/image-v1.3.3.json`이 이 머신에 없다 → tasks가 정한 대체 경로대로 buildx 문서 예시 모양을 쓰고 출처 주석에 그렇게 적는다.
- 로그인 토큰: 실측 직후 `docker logout ghcr.io` — `~/.docker/config.json`에 ghcr 0건 확인.

## 결정 기록

| ID | 결정 | 근거 |
| --- | --- | --- |
| D1 | 사용자 결정 없이 진행 | 지휘자 판단 — spec·design이 2026-10-12 사용자 결정과 3자 검수로 미결 0. 실측이 design 문자열과 일치 |
| D2 | 빌드 metadata 대역은 buildx 문서 예시 | 지휘자 판단 — tasks 0이 정한 대체 경로 |
| D3 | `actionlint` 미설치 → tasks 3 선택 항목 건너뜀 | tasks 3이 "새 패키지로 넣지 않는다"고 정함 |
| D4 | 런타임 QA 워커 없음 | 지휘자 판단 — 앱 화면 변화가 가이드 문구뿐이고 `pnpm test`가 가이드 구조·번역·링크를 잰다. 워크플로 실물은 머지 전 밟을 수 없다(design §2.2 — dispatch는 기본 브랜치 필요). 실물은 tasks 6 |

## 배치·파일 소유권

| 배치 | tasks | 소유 파일 | 선행 | 모델 / effort | 상태 |
| --- | --- | --- | --- | --- | --- |
| B1 본문 조립 | 1 | `scripts/release-image-note.ts` · `scripts/__tests__/release-image-note.test.ts` | 없음 | sonnet / medium — 순수 함수 + CLI, 사례가 design §3에 다 있다 | 통합 — 리뷰 🔴0·🟡4 → fix1 1라운드 |
| B2 발행 | 2·3 | `scripts/publish-image.sh` · `scripts/__tests__/publish-image.test.ts` · `.github/workflows/image.yml` · `scripts/__tests__/image-workflow.test.ts` | 없음 | opus / medium — fail-closed 3분기·bash 3.2·PATH 대역·워크플로 권한 | 통합 — 리뷰 🔴0·🟡1(+⚪3·4·6) → fix1 1라운드 |
| B3 문서·가이드 | 4·5 | `.claude/commands/{merge,doc-check}.md`(+ 훅이 만드는 `.agents/` 미러) · `CLAUDE.md`(+ `AGENTS.md` 미러) · `docs/{SELF-HOSTING,DIRECTORY,PRODUCT}.md` · `guide/{en,ko,es}/self-hosting/{install,operate}.md` | 없음(design이 파일명·계약을 확정) | sonnet / medium — 정해진 문장 수정 | 통합 — 리뷰 🔴0·🟡3(+⚪1~3) → fix1 1라운드 |
| R 독립 리뷰 | — | 읽기 전용, `.scratch/review-<batch>.md` | 각 배치 인계 | opus / medium | 완료 — R-B1·R-B2·R-B3 |

## 파일 겹침·실행 순서

| 조합 | 겹침 | 실행 |
| --- | --- | --- |
| B1 / B2 | 없음 | 병렬 |
| B1·B2 / B3 | 없음 — B3는 B1·B2가 만들 경로를 design 그대로 문서에 적는다 | 병렬. 통합 직전 지휘자가 DIRECTORY·SELF-HOSTING 문구를 실제 파일과 대조 |
| 통합 순서 | — | B1 → B2 → B3 (tasks 커밋 순서 1→2→3→문서→가이드). tasks 서문대로 **한 번의 push** |

## 공통 검증·인계

- `/ship bypass`. 임시 브랜치 = dev 등가, **11단계 `/push` 전에 멈춤**. 워커 `git push`·`/merge`·`/sync`·`db:deploy` 금지. 스키마 변경 금지. `.env.local` 복사 금지.
- 테스트 먼저(red 커밋 → 구현 커밋). 워커 최종 게이트 `pnpm gate --base dev` — 출력 파이프 금지, 끝줄만 근거.
- `.scratch/handoff-<batch>.md`: 커밋 SHA · red/green · gate 끝줄 · 변경 파일 · 계획과 다른 점 · 런타임 (b)와 이유.
- 지휘자 통합: cherry-pick → `pnpm gate` → `git push origin dev` → 그 HEAD의 CI 결론.

## 실행 기록

- 2026-10-12: tasks 0 실측(위 절). orch.md 커밋 후 B1·B2·B3 병렬 착수.
- 2026-10-12: B1(sonnet)·B2(opus)·B3(sonnet) 병렬 구현 → 배치마다 독립 리뷰(opus) → 수정 1라운드씩. 🔴 0건.
  - 지휘자 판단: B1 🟡4 라벨 중복은 교체 대신 exit 2(fail-closed) · B2 ⚪1·⚪2(입력 검증 순서·digest 출력 id)는 하지 않음 · review-B2 ⚪5(비상 경로 동시 실행)는 B3가 9-b 비상 단락에 반영 · review-B3 ⚪4는 tasks 6 검증 줄로 옮김 · ⚪5(CLAUDE build 문장)는 사실이라 그대로.
  - 워커 gate: B1 첫 구현은 병렬 부하(load ~200)로 무관 테스트 5초 타임아웃 → fix1에서 `gate: ok`. B2·B3 `gate: ok`.
  - 미검증(런타임 b, tasks 6 몫): 워크플로 실물 run · 실제 buildx `--metadata-file` 모양 · Node 24.0/24.1의 `import.meta.main` 폴백.
- 2026-10-12: dev 통합(cherry-pick B1→B2→B3).
