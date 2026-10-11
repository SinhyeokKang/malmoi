# responsive-mockup — 기술 설계

[스펙](spec.md) · [태스크](tasks.md) · 2026-10-11 responsive-app의 옛 A2e에서 옮겼다(그 기능 디렉터리는 닫혔다 — 결론은 DESIGN §5·§6.5·§6.1a).

## 1. 소유 파일

`components/landing/mockup/app-frame.tsx` · `translations.tsx` · `publish.tsx` · `index.tsx`, `components/landing/stage.tsx`, `lib/landing/stage.ts`(+ `lib/landing/__tests__/stage.test.ts`), `components/__tests__/landing-mockup.test.tsx`. responsive-app이 끝난 뒤 순차 수정한다 — 앱 배치와 동시 수정하지 않는다.

## 2. stage — 고정 캔버스에서 논리 캔버스로

**P5 완료본에서 시작한다** — `fitScale({W,H,chromeHeight})`·`frame`의 `chromeHeight`는 이미 필수이고(`CHROME_GAP` 16 포함), `MIN_PINNED_SCALE` 0.2 아래는 `pinnable=false`로 같은 5씬 정적 흐름이며, 한 줄 캡션 블록은 28(`min-h-7`, #216)이다. 이 계약을 유지하면서 1440×900 상수(`CANVAS_W`·`CANVAS_H`)를 고정 전제로 쓰던 fitScale/frame/목업 레이아웃을 바꾼다. 새로 더할 순수 함수 입력은 논리 canvasWidth/canvasHeight다(scroller W/H·chromeHeight·scroll position은 이미 있다).

5씬 각각의 정지 구간에서 데스크톱 → 태블릿 → 모바일 순차 상태를 배치하고 다음 씬으로 전환한다. 각 상태는 동일 스크롤 위치에서 동일하게 결정된다. reduced-motion은 중간 변형 없이 상태를 교체하고 모든 씬 내용을 유지한다. **MK1 확정 값**(2026-10-11 시안 검토 · 사용자 수용):
- **틀**: 세 상태 모두 지금의 `Bezel` 하나(툴바 44 · 베젤 8 · radius 24/12 · `border` · `shadow-medium`)이고 폭만 바뀐다. 기기 테두리 없음.
- **캔버스**: 폭 1440 · 784 · 391, 높이는 셋 다 **900**(화면 1424×848 · 768×848 · 375×848). 배율은 `scale_k = min((W − 2·side) / Wk, (H − 2·v − chrome) / 900, 1)` — 지금 `fitScale`의 `CANVAS_W`를 상태 폭 `Wk`로 바꾼 식이고, 폭 `Wk`와 배율을 같은 t로 보간한다.
- **캡션 자리**: 씬에서 가장 큰 상태의 높이로 자리를 잡고 캡션은 그 아래 `CHROME_GAP` 16에 고정한다(`chromeY`가 상태마다 튀지 않는다).
- **씬 안 구간**(f = 0 → 1): D 정지 .18 · D→T .10 · T 정지 .18 · T→M .10 · M 정지 .18 · 다음 씬 교차(M 폭) .13 · M→D 복귀 .13. 마지막 씬 ⑤는 .56부터 끝까지 M 정지다. 보간은 지금 `ease`. 씬 안 진행도 `h`(② 타이핑 · ③ 배지)는 0 → .74에 걸친다.
- **`PLAY.perScene` 1 → 1.5**(사용자 수용 — 고정 구간 5 H → 7.5 H). 1이면 정지 하나가 0.18 H라 휠 한 번에 지나간다. 씬마다 세 상태를 도는 이유는 좁은 페이지에서 다섯 씬 모두 읽히는 M 상태(375 페이지 약 0.68배)를 거치게 하려는 것이다.
- **모션 감소**: 지금 `frame()` 규칙(전환 t ≥ 0.5에서 끊는다)을 폭 전환에도 적용한다 — 중간 폭 0프레임, 스크롤 길이 동일.
- **좁은 상태가 보이는 판**: T·M의 번역 씬은 상세 판(`checkout.submit`, ‹ Keys)이고 목록 → 상세 전환은 그리지 않는다. 셸은 compact 헤더만(서랍 닫힘). ④⑤는 `LargeModal` `lg` 미만 시트 형.

⚠️ **폭 보간은 스크롤 프레임마다 레이아웃을 일으킨다** — 지금 stage는 transform만 써서 합성 단계에서 끝나는데, 루트의 레이아웃 폭을 바꾸면 리플로가 난다. `Stage`가 다섯 씬 레이어를 동시에 마운트하므로 **폭은 현재·다음 두 레이어에만 적용하고 나머지는 배치 계산에서 뺀다**. M1 실측에 스크롤 중 프레임 시간을 넣는다. 같은 이유로 전환 중엔 QA가 재지 않은 중간 루트 폭(1024 · 772 · 640 경계 사이)이 잠깐 보이므로, M-03 실측은 고정 뷰포트 넷 외에 전환 구간 scrub을 포함한다. 지나는 경계는 루트 기준 다섯이다(`planTranslationPanelLayout` 대입 — LNB가 선 루트의 카드 영역 = R − 298, 메뉴 형은 R − 50): D→T에서 **1278** 트리 접힘(카드 영역 980 미만) → **1070** 두 판 → 한 판(카드 영역 772 미만, LNB가 선 채) → **1024** LNB → 메뉴 + 한 판 → 두 판(카드 영역 974, 트리 접힌 채) → **822** 두 판 → 한 판, T→M에서 **658** 머리 두 줄. 1070~1024에서 판이 두 번 뒤집히는 것은 실물 앱(뷰포트 1024~1069)과 같아 그대로 둔다(2026-10-11 K1 리뷰 U1 — 지휘자 판단, MK1d가 빠뜨린 경계). 중간 대표로 루트 900(두 판 · 트리 접힘 · 목록 414 · 로케일 420)과 600(한 판 · 머리 두 줄)을 본다.

## 3. 목업 내부 — 컨테이너가 앱 규칙을 고른다

목업 루트의 **레이아웃 너비**(spec의 고정 루트 폭 1424 · 768 · 375 — transform scale 전의 값)가 셸 1024·내부 카드 772·기타 컨테이너 기준(960 · 640 · 608 등)의 입력이다. 실제 셸은 뷰포트 `lg`로 판정하지만(2026-10-07 사용자), 목업은 이미 정적 복제본이라(`app-frame.tsx` 머리 주석 — 순수 판정만 재사용, 마크업은 복제) **목업 루트에 `@container`를 선언하고, 뷰포트로 갈리는 규칙의 컨테이너 변형을 목업 마크업에만 둔다** — 대상은 둘이다: ① 셸 내비(LNB ↔ 헤더 메뉴·서랍, 실물은 뷰포트 `lg`), ② **큰 모달 시트 형**(Publish 씬 — 실물 `LargeModal`은 `lg` 미만 전체 화면 시트이고 그 토큰이 `max-lg:`라 목업이 그대로 쓸 수 없다). 그 밖의 앱 규칙은 이미 컨테이너 질의라(번역 `ws` 772 · 머리 `panel-head` 640 · Home 960 · Files 608) 목업이 같은 이름의 컨테이너와 같은 클래스를 쓰면 목업 폭에서 그대로 켜진다.

**경계 값을 어떻게 공유하나**(2026-10-11 문서 검토 — 옛 문장 "같은 상수에서 가져온다"와 아래 "import하지 않고 복사"가 서로 어긋났다):
- 목업은 **서버 컴포넌트**라 `"use client"` 모듈의 값을 import할 수 없다(`app-frame.tsx` 머리 주석 — `sidebar.tsx`의 `ROW`도 그래서 복사했다). `components/ui/large-modal.tsx`가 그런 모듈이다.
- **`lib/`의 순수 숫자 상수는 import한다**: `SINGLE_BELOW`(772, `lib/translations/layout.ts`) · `FILES_SPLIT_MIN_PX`(608, `lib/onboarding/files-layout.ts`) 등 — 잎 모듈이라 서버에서 읽어도 된다. 앱의 순수 판정(`planTranslationPanelLayout`의 single/split 등, responsive-app에서 들어갔다)도 같다.
- **클래스 문자열은 복사하고, 앱 쪽과 같은지 테스트로 고정한다**(`hand-copies.test.ts`에 목업 행을 더하거나 `landing-mockup.test.tsx`에서 리터럴 대조). CSS 경계는 JS 상수가 아니라 클래스 안의 숫자(`@max-[772px]/ws:` 등)라 테스트가 유일한 묶음이다.

⚠️ **목업은 뷰포트 `max-lg:` 토큰을 하나도 들지 않는다** — `LARGE_MODAL_PANEL` 같은 그릇 상수(`max-lg:`를 든다)를 import하지 않고 값을 복사하며 `landing-mockup.test.tsx:653-654`가 0건을 고정한다(공개 R2가 #218 열림 링 토큰을 `app-frame.tsx`에 동기화했다). 컨테이너 변형만 쓴다. transform scale은 마지막 화면 맞춤일 뿐, 바깥 페이지 viewport나 기기명으로 내부 UI를 선택하지 않는다. 서버/실제 사용자 데이터를 목업으로 가져오지 않고 현재 샘플 데이터를 유지한다.

## 3.5 데스크톱 목업이 실물과 같은가 (먼저 대조)

responsive-app은 1280 앱 화면도 바꿨는데 목업 파일(`components/landing/mockup/*`)은 어느 배치도 고치지 않았고, 목업↔앱 대조 테스트도 목업을 보지 않는다. 그래서 **기기별 상태를 만들기 전에 1440 목업이 지금 실물과 같은지부터 맞춘다**. 바뀐 것 중 목업 씬(셸·번역·Publish)에 닿을 후보: 패널 머리 `PANEL_HEAD_ROW`(640 경계 — 1440에서는 한 줄이라 외형 영향은 작다) · 번역 상세 머리가 Workspace로 올라간 구조와 경로 칸 · 꺼진 Sync·Publish의 사유 줄(O10 — 목업 샘플이 미전달 > 0이면 서지 않는다) · Projects 행 두 줄(O15 — 목업에 목록이 있으면). 정본은 DESIGN §5.15 · §6.1a · §6.5.

## 4. 함정·정본

- POSTMORTEM 2026-09-15 컨테이너 자기 참조: 목업 루트(선언)와 질의 요소를 분리하고 경계 양쪽을 실측한다. `container-query.test.ts`가 리터럴 className만 훑으므로 `cn()`·변수로 만든 선언이 잡히는지 확인한다.
- 스키마·환경변수·사전 키 추가 없음. JS 잎 모듈은 서버 import 없음, client-graph 테스트 유지.
- 기능이 끝나면 결론을 DESIGN §6.615(랜딩)로 올리고 이 디렉터리를 지운다.
