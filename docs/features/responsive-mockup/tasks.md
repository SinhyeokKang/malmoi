# responsive-mockup — 구현 태스크

상태: 전부 미착수. **선행: responsive-app A6 완료**(앱 좁은 폭 실측으로 배치·경계값 확정).
[스펙](spec.md) · [설계](design.md) · [브리프](design-brief.md).

M0 → M1 → M2. 검증 표기는 responsive-app tasks와 같다(`자동` = Vitest / `실측` = ego-browser).

- [ ] **M0 — MK1 시안 수령**
  - responsive-app이 dev에 들어간 상태의 실측 배치를 기준으로 [브리프](design-brief.md)의 MK1을 받는다. 대표 씬의 데스크톱 16:10 → 태블릿 → 모바일 순차 상태, 가용 높이에 맞는 두 종횡비·정지/전환 비율을 확정해 design §2에 기록한다.
  - 검증: 프레임 누락 0, 확정 치수를 spec/design/brief에 동일 기록. 시안 없음은 구현 차단으로 남긴다.

- [ ] **M1 — stage 논리 캔버스 + 목업 컨테이너 배치**
  - 먼저 순수 테스트(`lib/landing/__tests__/stage.test.ts`): 명시 canvasWidth/Height와 chromeHeight로 fitScale/frame 계산, 같은 위치 결정성·역스크럽·reduced-motion·작은 H. 이후 stage 측정과 목업 배치를 함께 변경한다. P5 계약(`chromeHeight` 필수 · `MIN_PINNED_SCALE`·`pinnable` 정적 흐름 · 한 줄 캡션 28)을 유지한다.
  - 목업 루트에 `@container` 선언(자기 참조 금지 — 선언 요소와 질의 요소 분리), 셸 내비 규칙의 컨테이너 변형은 목업 마크업에만 두고 경계 상수는 공유한다. 앱의 순수 레이아웃 판정을 소비한다.
  - 교체: `components/__tests__/landing-mockup.test.tsx`의 1440px 고정 단언. "목업 껍데기에 `max-lg:` 토큰 0" 단언은 유지한다.
  - 검증: M-01~03·랜딩 회귀, 바깥 1280 고정에서 목업만 세 너비로 바꾸어 내비·목록·상세 실측(1023/1024 목업 루트 computed); 4뷰포트에서 5씬/캡션/진행/CTA 누락·겹침 0. stage 단위/DOM 테스트 green.
  - 커밋: `feat(responsive-mockup): mirror responsive layouts in landing scenes`.

- [ ] **M2 — 정본·마무리**
  - `docs(DESIGN)` §6.615 랜딩에 기기 순차 목업·컨테이너 규칙·확정 비율을 올린다. `README.md`·가이드에 랜딩 목업 설명이 있으면 같이 본다.
  - `/design-sync`로 MK1 대조(신규 표면). 배포 준비 세션에서 `pnpm gate` 후 `/push`, 프로덕션은 사용자가 `/merge`를 따로 부른다.
  - 기능 완료 뒤 이 디렉터리를 지운다.
