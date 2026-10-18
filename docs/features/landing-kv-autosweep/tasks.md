# landing-kv-autosweep — tasks

> 설계는 spec 완료 조건이 전부다(파일 둘 + 정본). 커밋 경계마다 `pnpm gate`가 green이어야 한다.

- [ ] **K1 — `autoCursor` 넘침 폭** (`lib/signin/dot-field.ts`, 잎 그대로). `autoCursor(elapsed, width, height, speed, rows, overshoot = 0)` — 가로 구간 길이가 `width + 2·overshoot`, 줄바꿈 `x`가 `-overshoot` / `width + overshoot`.
  - 검증(자동): `overshoot = 0`이면 기존 사례 전부 그대로 · `overshoot = o`이면 첫 줄이 `x = -o`에서 시작해 `width + o`에서 끝난다 · 줄바꿈 구간의 `x`가 `[0, width]` 밖 · 한 주기 길이 = `rows·(width + 2o)/speed + (rows−1)·step/speed` · 줄바꿈 중 `partitionDots(dotGrid(w,h,16), spot, o).near`가 비어 있다(o = 180).
- [ ] **K2 — 랜딩은 자동 순회만** (`components/signin/dot-field.tsx`). `follow="scroller"`면 포인터 리스너를 붙이지 않고 `autoCursor(..., CURSOR_RADIUS)`로 부른다. 로그인 경로는 바꾸지 않는다.
  - 검증(자동, DOM): `follow="scroller"`에서 스크롤러·캔버스 모두 `pointermove`·`pointerleave` 리스너 0 · 마우스 `pointermove`를 쏴도 그리기가 바뀌지 않는다 · 로그인은 기존 마우스 테스트 green · unmount 리스너 해제 테스트 갱신.
- [ ] **K3 — 정본**(문서별 커밋): DESIGN §6.62 "도트 필드 — 두 소비자" 행(R7 교체 · 패널 밖 줄바꿈) · §6.615 "KV 배경"(커서 추종 서술) · `components/signin/dot-field.tsx` 머리 주석 R7 · DIRECTORY의 dot-field 서술("마우스 포인터를 받는다" 부분). 그 뒤 이 디렉터리를 지운다.
  - 검증: `rg -n "pointerType === \"mouse\"" docs components/signin` 이 로그인 서술만 가리킨다(랜딩 R7 문장 0).
- [ ] **K4 — 런타임 확인**(language-request-todo QA에 얹는다): 랜딩에서 마우스를 움직여도 점이 따라오지 않는다 · 밝은 원이 패널 좌우 밖으로 완전히 나간 뒤 줄을 바꿔 들어온다 · `/signin`은 마우스를 따른다.
