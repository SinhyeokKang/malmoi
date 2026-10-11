# responsive-mockup — 지휘 계획 (orch)

원본: [spec](spec.md) · [design](design.md) · [tasks](tasks.md) · [brief](design-brief.md). 시안 정본: Claude Design `Landing Mockup Responsive.dc.html` + `Landing Mockup Screen.dc.html`(프로젝트 `b99d54cd-…`, 2026-10-11 2차 검토로 확정).
착수: 2026-10-11 · 시작 dev `b0065ed3` · 지휘자 Claude Code(Opus 5.5) → 워커 패밀리 Claude Code / Sonnet·Opus.

## 결정 기록

| # | 결정 | 근거 |
|---|---|---|
| D1 | MK1 확정 값(루트 1424·768·375 / 캔버스 1440·784·391, 높이 900, 구간 .18·.10·.18·.10·.18·.13·.13, `perScene` 1.5) | 사용자 수용(2026-10-11) — design §2 |
| D2 | M1을 파일 소유권으로 둘로 가른다: **K1 목업 컨테이너**(`components/landing/mockup/*`) · **K2 stage**(`lib/landing/stage.ts`·`components/landing/stage.tsx`) — 병렬 | 지휘자 판단 — 계약이 "목업 루트는 부모 폭을 채우고 `@container`로 갈린다" 하나라 서로의 파일을 안 본다 |
| D3 | DESIGN §6.615 갱신(tasks M2)은 두 배치 통합 뒤 **지휘자 문서 신선도 커밋** | 지휘자 판단 — 두 배치가 같은 절을 쓰면 겹친다. 워커는 인계 문서에 "DESIGN 반영 노트"를 남긴다 |
| D4 | 런타임 게이트는 단일 QA 워커: 레이아웃 실측(M-03 + scrub + reduced-motion + 다크 + 프레임 시간) **+ `/design-sync` MK1 프레임 대조** | 지휘자 판단 — 정본 시안이 있는 변경(메모리: design-sync-when-canon-prepared) · QA 단일 워커(orchestrate §5) |
| D5 | 가이드 컷·README 영향 없음 | 지휘자 판단 — SHOOTING 매핑에 랜딩 컷 없음, README에 랜딩 목업 서술 없음 |
| D6 | 스키마·환경변수·사전 키 추가 없음(새 문구 0) | spec 범위 게이트 |
| D8 | 1070 경계(LNB가 선 채 한 판 → 1024에서 다시 두 판)를 그대로 둔다 | 지휘자 판단 — 실물 앱이 같고 브리프 원칙이 "내부 배치는 실물을 옮긴다"(K1 리뷰 U1) |
| D7 | 루트 = 캔버스 − 베젤 8×2 − 화면 border 1×2. T·M 캔버스 786·393(루트 768·375 정확), D 캔버스 1440(루트 1422) | 지휘자 판단 — spec이 768·375를 QA 실측 폭이라 고정했고, D는 1422·1424가 같은 갈래라 씬 좌표를 안 움직인다 |

## 배치

| 배치 | 항목 | 소유 파일 | 건드리지 말 것 | 모델·effort | 선행 | 상태 |
|---|---|---|---|---|---|---|
| **K1** 목업 컨테이너 | tasks M1의 ① design §3.5 1440 목업 ↔ dev 실물 대조·정정, ② 목업 루트 `@container` 선언(선언·질의 요소 분리), ③ 셸 내비 컨테이너 변형(LNB ↔ compact 헤더 `[로고][메뉴] · [검색][Inbox][계정]`, 서랍 닫힘), ④ 번역 씬 컨테이너 규칙(카드 772 한 판=상세 판 · 머리 640 · 트리 접힘 980 — 실물 클래스 복사), ⑤ Publish ④⑤ 큰 모달의 시트 형 컨테이너 변형(MK1c), ⑥ 클래스 대조 테스트(`hand-copies.test.ts` 또는 `landing-mockup.test.tsx`) · `max-lg:` 0 유지 | `components/landing/mockup/*` · `components/__tests__/landing-mockup.test.tsx` · `components/__tests__/hand-copies.test.ts`(목업 행만) | `lib/landing/*` · `components/landing/stage.tsx` · `components/__tests__/landing-stage.test.tsx` · `docs/DESIGN.md` · 앱 실물 컴포넌트(읽기만) | Opus 5.5 high — 실물↔복제 대조와 컨테이너 자기 참조 함정 | 없음 | dev ✅ |
| **K2** stage | tasks M1의 stage 몫: ① 순수 함수 — 상태 폭 `Wk` 입력의 `fitScale`, 씬 안 구간 타임라인(D/T/M 정지·전환·교차·복귀, ⑤ 예외), 폭·배율 보간, `h` 0→.74, reduced-motion 중간 폭 0, 캡션 자리 = 씬 최대 상태 높이, `PLAY.perScene` 1.5 / ② `stage.tsx` 배선 — 베젤 캔버스 폭 1440·784·391, 화면 루트 레이아웃 폭 보간, **폭은 현재·다음 레이어에만**(나머지는 배치 계산 제외) / ③ 결정성·역스크럽·작은 H(`pinnable`)·P5 계약 유지 | `lib/landing/stage.ts` · `lib/landing/__tests__/stage.test.ts` · `components/landing/stage.tsx` · `components/__tests__/landing-stage.test.tsx` | `components/landing/mockup/*` · `components/__tests__/landing-mockup.test.tsx` · `docs/DESIGN.md` | Opus 5.5 high — 결정성·성능 제약이 걸린 스크롤 수학 | 없음 | dev ✅ |
| **Q** QA | 두 배치 통합 뒤: 레이아웃 실측 + `/design-sync` MK1 프레임 대조, 결함은 BugShot 즉시 | main 체크아웃(읽기) | 코드 수정 금지 | Opus 5.5 medium | K1·K2 dev 통합 | 대기 |

겹침 행렬: K1 ∩ K2 = ∅(위 소유 열). `landing-mockup.test.tsx:66`의 `frame.style.width === "1440px"`은 K2 몫의 단언이지만 스크롤 0 = D 상태라 캔버스 1440이 유지된다 — K2가 깨면 그 한 줄만 K2가 고치고 인계에 적는다.

## 검증 게이트

- 워커: `pnpm gate --base dev`(파이프 금지) · TDD(신규 순수 함수는 테스트 먼저) · `/ship bypass` 11단계 전 정지.
- 리뷰: 배치별 독립 리뷰 워커(Opus 5.5 medium, 리포트 전용) — 🔴 0까지 수정 라운드.
- 통합: main 체크아웃 cherry-pick → `pnpm gate` → `&&` push → dev CI 결론.
- 런타임: Q(spec M-01~03 · design §2 폭 보간 제약 · MK1 대조).

## 진행 기록

- 2026-10-11 orch 작성(`902d8c7f`). Run `run_f2087895034e`. K1 `task_7f6695ff8c93`/`ctx_1431eb52f82a`(rm-k1) · K2 `task_861888641ffd`/`ctx_35da69a26b99`(rm-k2) 착수 — 둘 다 Opus 5.5 high, activity working.
- K2 `worker_done` — `daca5df1`, gate ok. 계획과 다른 점 6(정적 흐름 D · canvasHeight 미추가 · idle=`content-visibility` · #216 테스트 분리 · :66 무변경 · 복귀 중 data-scene=i). 독립 리뷰 `ctx_1b0d91369b36`(Opus medium) 착수. K2 터미널은 수정 라운드용으로 유지.
- K2 리뷰: 🔴0 · 🟡1(idle 집합을 씬 번호 대신 f 구간으로 — 폭 전환 중 안 보이는 레이어 리플로 제거) · 🟢6(계획과 다른 점 1~6 수용). fix1 `ctx_86d1b16f7bee` K2 터미널로 전송·working. 리뷰어 해제.
- K1 `worker_done` — `d5ef2a3c`(§3.5 정정) · `9b873bb6`(컨테이너 변형), gate ok. 소유 밖 테스트 2(`header-44`·`large-modal-sheet` 제목) 수정 — 목업 계약 단언이라 수용 예정(리뷰 판정). 발견: 베젤 화면 `border` 1px 때문에 루트가 캔버스 − 18(1422·766·373). **지휘자 판단 D7**: T·M은 spec의 QA 실측 폭(768·375)을 정확히 지키도록 K2가 캔버스를 786·393으로, D는 1440 유지(루트 1422 — 같은 갈래). K2 fix1 끝난 뒤 fix2로 보낸다. 독립 리뷰 `ctx_f10142ba5113` 착수.
- K2 fix1 `eeb08884` gate ok — live 집합을 f 구간으로(지휘자 diff 확인). fix2(D7 캔버스 786·393) `ctx_898e221e40af` 전송.
- K2 fix2 `729bab8f` gate ok — 캔버스 [1440, 786, 393], `SCREEN_BORDER` 상수 + DOM 대조. K2 dev 통합 착수(K1과 파일 겹침 없음).
- K2 dev 통합 `9eafafc7..389110e4` · `pnpm gate` ok — push는 K1 통합 뒤 한 번에(K2만 나가면 preview에서 고정 배치 목업이 좁은 그릇에 깨져 보인다). K1 리뷰: 🔴0 · 🟡5(container-query 정규식 · 경계 산수 순수 테스트 · 패널 폭 기준 · 뷰포트 정규식 · 고아 flex) · U1→D8. K1 fix1 `ctx_73b287d5b327`(+ 낡은 주석 4곳 · container-query.test.ts 배정 · rebase dev). 리뷰어 해제.
- K1 fix1 `93b0a491`·`d518887b` gate ok(넓힌 container-query 스캐너가 앱 코드 결함 0). K1 dev 통합 `39e2709d..62cf587e` · `pnpm gate` ok · push(origin/dev `62cf587e`). DESIGN §6.615 반영(그릇 순환 · 목업 루트 컨테이너 행, 낡은 행 826·828·890) — 지휘자 문서 신선도 커밋. 다음: Q.
