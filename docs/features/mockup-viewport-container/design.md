# mockup-viewport-container — 설계

[스펙](spec.md) · [태스크](tasks.md).

**기준 형은 `git show 9eafafc7^:lib/landing/stage.ts`(순환 이전)다.** 다만 9eafafc7 이후 커밋이 같은 파일과 얽혀 있어 `git revert`는 비현실적이다 — 손으로 되돌리고, 무엇을 걷고 무엇을 남기는지는 §3이 정한다.

## 1. 판정 — 순수 함수 (`lib/landing/stage.ts`, 잎 — import 0 유지)

- `deviceForViewport(isLg: boolean, isSm: boolean): Device` — `isLg ? 0 : isSm ? 1 : 2`(export · 단위 테스트). 모순 조합(lg ∧ ¬sm)은 lg가 이겨 D다. 입력은 셸이 `matchMedia`로 묻는 두 쿼리의 결과다(§2). ⚠️ **스크롤러 `clientWidth`로 판정하지 않는다** — 공개 셸 거터(`px-2` 16 + 패널 `border` 2 = 18, `public-shell.tsx`)에 스크롤바까지 빠져 늘 뷰포트보다 18 이상 좁고, 뷰포트 1024~1041에서 CSS `lg`와 어긋난다. 같은 이유로 앱 셸도 뷰포트 `lg`다(2026-10-07).
- 상수: `STATE_CANVAS_W = [1440, 786, 393]`(유지) · **`STATE_CANVAS_H = [900, 900, 776]`**(새로 — `CANVAS_H` 단일 상수를 대체). M 776은 검수 뷰포트 375×812·390×844 + 두 줄 캡션(chrome ≈69)에서 **폭이 배율을 정하는** 최대 높이다(375×812: 폭 309/393 = 0.786 · 세로 613/776 = 0.790).
- `fitScale({ W, H, chromeHeight, device })` — **`device` 필수**(기본값 없음 — 빠뜨린 호출이 조용히 D가 되지 않게, `chromeHeight` 필수와 같은 근거). 상태의 캔버스 폭·높이로 맞춘다. **캡션 자리는 그 상태의 높이**다(세 상태 최대를 잡던 `slot`은 순환 때문이었다 — 걷는다). y는 순환 이전 식(`(h − Hk·scale − chrome)/2`).
- `chromeW = min(byWidthOf(Wk), 1)·Wk` — **캡션 최대 폭을 그릇 폭에 묶는다**(지금은 D 1440 기준이라 T·M에서 캡션이 프레임보다 넓다 — 1023×768 T: 프레임 519 / 캡션 925). 폭만의 함수라 캡션 높이 ↔ 폭 순환이 생기지 않는다. 정적 배율 `chromeW / Wk`가 그대로 성립한다.
- `sceneAt` — 순환 이전 형으로: `HOLD` 0.6 / 전환 0.4, `t = i < 4 && f > HOLD ? (f − HOLD)/(1 − HOLD) : 0`, `h = min(f / HOLD, 1)`, `device` 필드 삭제.
- `frame({ …, device })` — **`device` 필수**. `canvasW`·배율·위치는 `fitScale` 한 번(9df288af 구조 유지). 레이어 교차·캡션·배지·타이핑은 순환 이전 규칙. **`live` 없음**(§3).
- `PLAY.perScene` 1.5 → **1**(`pinnedSpan()` 5).

## 2. 껍데기 (`components/landing/stage.tsx`)

- **쿼리는 `lib/shell/breakpoint.ts`의 상수를 쓴다** — `WIDE_QUERY`(64rem) 재사용 + 같은 파일에 `sm` 쿼리 상수(`SM_QUERY = "(min-width: 40rem)"`) 추가. 리터럴을 쓰면 `breakpoint.test.ts:39`의 가드가 red다. 같은 테스트에 Tailwind `--breakpoint-sm`과 같은지 재는 단언을 더하고, 머리 주석의 "JS는 네 자리"를 다섯(랜딩 스테이지 그릇 선택)으로 고친다. `stage.ts`는 잎이라 쿼리를 import하지 않는다 — 셸이 불리언으로 넘긴다.
- effect에서 `MediaQueryList` 둘을 한 번 만들고 **틱이 `.matches`를 직접 읽는다** — change 리스너를 두지 않는다. 뷰포트가 바뀌면 스크롤러 크기도 바뀌어 기존 `ResizeObserver(scroller)`가 틱을 예약하므로, 리스너가 저장한 오래된 값을 쓸 여지가 없다. reduced-motion 구독은 지금 그대로다(크기 변화가 없다).
- **재생 위치 보존 조건을 넓힌다**: 지금은 `H !== lastH`일 때만 돈다(`stage.tsx:222`). 경계를 넘으면 `H`는 그대로인데 트랙 여백 `mt-16 lg:mt-30`과 히어로 h1(48→30)이 바뀌어 `stageTop`이 움직이고 q가 ΔstageTop/H만큼 튄다. **`H` 또는 `stageTop`이 바뀌면** 직전 `u = (scrollTop − lastStageTop)/lastH`로 복원한다.
- 프레임 `style.width`·`style.height` = 그 상태의 캔버스(변할 때만 쓴다). **SSR·측정 전 기본은 D**(측정 전엔 프레임이 `invisible` — `stage.tsx:297`, `data-ready`는 첫 칠 뒤라 모바일 방문자에게 D가 비치지 않는다).
- **정적 흐름**: 틱이 `--landing-canvas-w`·`--landing-canvas-h`를 `--landing-static-scale`과 같은 자리에서 `written` 캐시를 거쳐 쓰고, 정적 장 JSX는 `var(--landing-canvas-w, 1440px)` 등을 쓴다(지금은 `CANVAS_W` 직접 — `stage.tsx:373·379·386`). 배율은 `chromeW / Wk`. **setState 0** — 씬 DOM 재렌더·첫 렌더 D 깜빡임이 없다(`stage.tsx:50` 원칙).

## 3. 걷는 것 / 남기는 것

**걷는다**: `TO_T`·`TO_M`·`CROSS`·`CONTENT_END`·`deviceAt`·`hold`·`span`·`SceneAt.device`·`lerp`(폭 보간) · `slot`의 세 상태 최대값 · `CANVAS_H`(→ `STATE_CANVAS_H`) · **`Frame.live`·`data-idle`(`content-visibility`)·`written.live`·SSR `data-idle={k >= 1}`** — `live`/`data-idle`은 폭 보간 리플로 대책(9eafafc7·33be5e2a)이었고 순환 이전엔 없었다. 폭이 고정되면 스크롤 중 레이아웃이 0이고, 오히려 씬 경계마다 `content-visibility`를 푸는 동작이 D 크기 서브트리의 레이아웃을 일으킨다 — 다섯 레이어를 배치한 채 transform·opacity만 쓰는 순환 이전 형으로 돌아간다. #239의 "배율을 폭의 함수로"는 폭이 고정이라 자연히 성립한다(회귀 테스트는 device 축으로 바꿔 유지).

**남긴다**: `STATE_CANVAS_W` 값과 `SCREEN_BORDER`(389110e4) · `Frame.canvasW`와 `style.width` 쓰기 · 9df288af의 "배치는 `fitScale` 한 번" 구조 · d1837a4a(K1 루트 컨테이너 배치)·f10da3fb(폭 체인 테스트)·62cf587e·39e2709d 전부.

**순환 전제 주석 갱신**(남기면 거짓이 된다): `stage.ts:10-12, 16-18, 25, 45-54, 62, 76, 88, 92-94, 182-200, 219-226` · `stage.tsx:40-48, 125, 308, 367-368` · `components/landing/mockup/app-frame.tsx:50`("K2 stage가 1424 · 768 · 375로 바꾼다" — 1424도 DESIGN의 1422와 어긋난다). 줄 번호는 검수 시점 기준.

## 4. 불변식·함정

- 결정성: 같은 (scrollTop, stageTop, W, H, chromeHeight, reduced, device) → 같은 프레임. device는 뷰포트의 함수.
- #216 `min-h-7` 캡션 · `MIN_PINNED_SCALE` · `chromeHeight`·`device` 필수 유지. `pinnable`은 그 상태 높이로 잰 `byHeight`가 정한다(568×320 가로 폰 — M — 처럼 하한 근처에서 device와 독립임을 테스트로 고정).
- `lib/shell/breakpoint.ts` 밖 `matchMedia("(min-width` 리터럴 0(`breakpoint.test.ts`) · `stage.ts` import 0(`client-graph.test.ts`).
- POSTMORTEM 2026-09-15(컨테이너 자기 참조) — 목업 쪽은 손대지 않는다.
- 스키마·환경변수·사전 키 없음(`landing.stage`는 `label`·`captions`뿐). ARCHITECTURE §0 무관. 셀프 호스팅 체크리스트 해당 없음.

## 5. 정본 (T5 — 이 디렉터리를 지우기 전에 옮긴다)

DESIGN §6.615:
- **"목업 캔버스"**: 상태 폭·높이는 뷰포트가 고른다(1440×900 · 786×900 · 393×776, 루트 1422 · 768 · 375). `scale` 식의 900 → 상태 높이 `Hk`.
- **"배율 표"**: 상태별로 다시 쓴다(T6 실측으로 확인) — D: 1024×768 0.643(폭) · 1280×800 0.696 · 1440×900 0.807 · 1920×1080 0.999 · 2560×1440 1 · 1024×1366(iPad Pro 세로)은 폭에 묶여 세로 여백이 크다 / T: 768×1024 0.878(폭) · 1023×768 0.660(세로) / M: 375×812 0.786 · 390×844 0.824(둘 다 폭). "좁은 페이지는 D가 폭에 묶여 … M에서 실제 크기에 가까워진다"를 걷는다.
- **"그릇 순환" 행 → "뷰포트 그릇" 행**: 뷰포트 `lg`·`sm`이 그릇 하나를 고르고 재생 중 바뀌지 않는다 · 경계를 넘는 리사이즈는 즉시 전환(재생 위치 보존 — `H` 또는 `stageTop` 변화) · 캡션 자리 = 그 상태 높이 · 캡션 최대 폭 = 그릇 폭 · 정적 흐름도 같은 그릇(T 정적 장이 길어지는 대가).
- **"씬 다섯"**: `perScene` 1(고정 구간 5 H) · 정지 0.6 / 전환 0.4 · `h = min(f/0.6, 1)` — "씬 안 구간은 위 그릇 순환 행"·"h 0 → .74"·"마지막 씬은 M 정지로 끝난다"·"1이면 정지 하나가 0.18 H"를 걷는다.
- **"모션 감소"**: "그릇 폭 전환" 문구를 걷는다(씬 교차만).
- **"목업 루트 컨테이너"**: 랜딩이 실제로 서는 루트 폭은 **1422 · 768 · 375 셋뿐**이다 — 리사이즈해도 그 사이를 연속으로 지나지 않으므로 중간 갈래(1278 · 1070 · 822 · 658)는 랜딩에 그려지지 않고 실물 대조(폭 체인 테스트) 몫이다. 실물과 갈리는 구간(822~1023 · 1024~1277)을 적는다.

DESIGN §5(:345 "뷰포트 경계는 `lg` 하나 · JS가 뷰포트 폭을 묻는 자리는 넷") · PRODUCT §4.1(:407): **공개 랜딩 목업의 그릇 선택만 `sm`(40rem)을 더 본다**는 예외와 JS 다섯째 자리를 등재한다. `lib/shell/breakpoint.ts` 머리 주석도 같은 커밋(T3).

범위 밖(언급만): `DIRECTORY.md:441`의 "1440×810"은 이 변경 전부터 낡은 값이다.
