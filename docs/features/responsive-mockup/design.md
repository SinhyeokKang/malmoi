# responsive-mockup — 기술 설계

[스펙](spec.md) · [태스크](tasks.md) · 2026-10-11 responsive-app의 옛 A2e에서 옮겼다(그 기능 디렉터리는 닫혔다 — 결론은 DESIGN §5·§6.5·§6.1a).

## 1. 소유 파일

`components/landing/mockup/app-frame.tsx` · `translations.tsx` · `publish.tsx` · `index.tsx`, `components/landing/stage.tsx`, `lib/landing/stage.ts`(+ `lib/landing/__tests__/stage.test.ts`), `components/__tests__/landing-mockup.test.tsx`. responsive-app이 끝난 뒤 순차 수정한다 — 앱 배치와 동시 수정하지 않는다.

## 2. stage — 고정 캔버스에서 논리 캔버스로

**P5 완료본에서 시작한다** — `fitScale({W,H,chromeHeight})`·`frame`의 `chromeHeight`는 이미 필수이고(`CHROME_GAP` 16 포함), `MIN_PINNED_SCALE` 0.2 아래는 `pinnable=false`로 같은 5씬 정적 흐름이며, 한 줄 캡션 블록은 28(`min-h-7`, #216)이다. 이 계약을 유지하면서 1440×900 상수(`CANVAS_W`·`CANVAS_H`)를 고정 전제로 쓰던 fitScale/frame/목업 레이아웃을 바꾼다. 새로 더할 순수 함수 입력은 논리 canvasWidth/canvasHeight다(scroller W/H·chromeHeight·scroll position은 이미 있다).

5씬 각각의 정지 구간에서 데스크톱 → 태블릿 → 모바일 순차 상태를 배치하고 다음 씬으로 전환한다. 각 상태는 동일 스크롤 위치에서 동일하게 결정된다. reduced-motion은 중간 변형 없이 상태를 교체하고 모든 씬 내용을 유지한다. **정확한 구간 비율·태블릿/모바일 종횡비는 MK1 시안과 가용 높이 실측 산출물로 고정하며 그 전에는 임의 애니메이션 값을 구현하지 않는다.**

## 3. 목업 내부 — 컨테이너가 앱 규칙을 고른다

목업 루트의 **레이아웃 너비**(spec의 고정 폭 1440 · 768 · 375 — transform scale 전의 값)가 셸 1024·내부 카드 772·기타 컨테이너 기준(960 · 640 · 608 등)의 입력이다. 실제 셸은 뷰포트 `lg`로 판정하지만(2026-10-07 사용자), 목업은 이미 정적 복제본이라(`app-frame.tsx` 머리 주석 — 순수 판정만 재사용, 마크업은 복제) **목업 루트에 `@container`를 선언하고, 뷰포트로 갈리는 규칙의 컨테이너 변형을 목업 마크업에만 둔다** — 대상은 둘이다: ① 셸 내비(LNB ↔ 헤더 메뉴·서랍, 실물은 뷰포트 `lg`), ② **큰 모달 시트 형**(Publish 씬 — 실물 `LargeModal`은 `lg` 미만 전체 화면 시트이고 그 토큰이 `max-lg:`라 목업이 그대로 쓸 수 없다). 그 밖의 앱 규칙은 이미 컨테이너 질의라(번역 `ws` 772 · 머리 `panel-head` 640 · Home 960 · Files 608) 목업이 같은 이름의 컨테이너와 같은 클래스를 쓰면 목업 폭에서 그대로 켜진다.

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
