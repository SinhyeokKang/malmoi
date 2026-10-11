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

## 배치

| 배치 | 항목 | 소유 파일 | 건드리지 말 것 | 모델·effort | 선행 | 상태 |
|---|---|---|---|---|---|---|
| **K1** 목업 컨테이너 | tasks M1의 ① design §3.5 1440 목업 ↔ dev 실물 대조·정정, ② 목업 루트 `@container` 선언(선언·질의 요소 분리), ③ 셸 내비 컨테이너 변형(LNB ↔ compact 헤더 `[로고][메뉴] · [검색][Inbox][계정]`, 서랍 닫힘), ④ 번역 씬 컨테이너 규칙(카드 772 한 판=상세 판 · 머리 640 · 트리 접힘 980 — 실물 클래스 복사), ⑤ Publish ④⑤ 큰 모달의 시트 형 컨테이너 변형(MK1c), ⑥ 클래스 대조 테스트(`hand-copies.test.ts` 또는 `landing-mockup.test.tsx`) · `max-lg:` 0 유지 | `components/landing/mockup/*` · `components/__tests__/landing-mockup.test.tsx` · `components/__tests__/hand-copies.test.ts`(목업 행만) | `lib/landing/*` · `components/landing/stage.tsx` · `components/__tests__/landing-stage.test.tsx` · `docs/DESIGN.md` · 앱 실물 컴포넌트(읽기만) | Opus 5.5 high — 실물↔복제 대조와 컨테이너 자기 참조 함정 | 없음 | 대기 |
| **K2** stage | tasks M1의 stage 몫: ① 순수 함수 — 상태 폭 `Wk` 입력의 `fitScale`, 씬 안 구간 타임라인(D/T/M 정지·전환·교차·복귀, ⑤ 예외), 폭·배율 보간, `h` 0→.74, reduced-motion 중간 폭 0, 캡션 자리 = 씬 최대 상태 높이, `PLAY.perScene` 1.5 / ② `stage.tsx` 배선 — 베젤 캔버스 폭 1440·784·391, 화면 루트 레이아웃 폭 보간, **폭은 현재·다음 레이어에만**(나머지는 배치 계산 제외) / ③ 결정성·역스크럽·작은 H(`pinnable`)·P5 계약 유지 | `lib/landing/stage.ts` · `lib/landing/__tests__/stage.test.ts` · `components/landing/stage.tsx` · `components/__tests__/landing-stage.test.tsx` | `components/landing/mockup/*` · `components/__tests__/landing-mockup.test.tsx` · `docs/DESIGN.md` | Opus 5.5 high — 결정성·성능 제약이 걸린 스크롤 수학 | 없음 | 대기 |
| **Q** QA | 두 배치 통합 뒤: 레이아웃 실측 + `/design-sync` MK1 프레임 대조, 결함은 BugShot 즉시 | main 체크아웃(읽기) | 코드 수정 금지 | Opus 5.5 medium | K1·K2 dev 통합 | 대기 |

겹침 행렬: K1 ∩ K2 = ∅(위 소유 열). `landing-mockup.test.tsx:66`의 `frame.style.width === "1440px"`은 K2 몫의 단언이지만 스크롤 0 = D 상태라 캔버스 1440이 유지된다 — K2가 깨면 그 한 줄만 K2가 고치고 인계에 적는다.

## 검증 게이트

- 워커: `pnpm gate --base dev`(파이프 금지) · TDD(신규 순수 함수는 테스트 먼저) · `/ship bypass` 11단계 전 정지.
- 리뷰: 배치별 독립 리뷰 워커(Opus 5.5 medium, 리포트 전용) — 🔴 0까지 수정 라운드.
- 통합: main 체크아웃 cherry-pick → `pnpm gate` → `&&` push → dev CI 결론.
- 런타임: Q(spec M-01~03 · design §2 폭 보간 제약 · MK1 대조).

## 진행 기록

- 2026-10-11 orch 작성.
