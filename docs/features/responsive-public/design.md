# responsive-public — 기술 설계

[스펙](spec.md) · [태스크](tasks.md) · [브리프](design-brief.md). 측정 숫자는 코드 선언값이며 브라우저 검증은 미실행이다.

## 1. 영향 흐름과 변경 소유권

공개 읽기·Auth UI를 바꾼다. push·pull 서버 코어는 변경하지 않는다. 검색·Inbox·계정·언어 변경은 기존 Action을 그대로 사용한다.

| 소유 | 파일/영역 | 경계 |
|---|---|---|
| P1a 공개 셸·공유 오버레이 | `components/public-shell/`·`components/shell/header-bar.tsx`·`components/search/`·`components/shell/attention-inbox.tsx`·`components/ui/dialog.tsx`·`components/ui/large-modal.tsx` | 공유 프리미티브는 현 소비자 모두 검사. 앱 셸 하한과 레이아웃은 풀지 않음 |
| P1b 공개 읽기 | `app/docs/`·`components/docs/`·`components/public-doc-toc.tsx`·`components/public-doc-table.tsx`·`components/privacy/privacy-doc.tsx`·`app/changelog/page.tsx` | 본문·원고·SEO·검색 색인 내용 불변 |
| P1c Auth | `components/signin/`·`app/signin/`·`app/invite/`·`app/oauth/authorize/` | 레이아웃과 상태 표현만; 토큰·인가·OAuth 계약 불변 |
| P1d 랜딩 1차 | `app/page.tsx`·`components/landing/stage.tsx`·`lib/landing/stage.ts` | 1440×900·5씬 유지, 캡션 실측 |
| A2e 후속 | `components/landing/mockup/`와 위 stage 둘 | 앱 설계 확정 후 같은 파일을 순차 수정. P1에서 선구현하지 않음 |

`app/globals.css`의 shell-min1280 전역 값을375로 바꾸지 않는다. 공개/Auth 셸에서만 최소 폭 사용을 제거한다. 반대로 modal gutter는 포털에도 적용되는 공유 치수이므로 P1에서 실제 소비자를 모두 확인한다. 1280 이상 기존96px·1024px 상한은 유지하고 좁은 외곽은 총32px을 출발값으로 시안 대조한다. 별도 모바일 프리미티브는 만들지 않는다.

## 2. 셸·서랍·포커스

셸 유효 너비1024 미만은 Dialog 조립 서랍, 이상은 고정 내비다. 실제 페이지의 셸 너비는 뷰포트와 같다. 후속 앱 목업은 자기 렌더링 루트 너비를 사용한다. CSS와 JS의1024 판정은 동일한 경계를 가지며1023/1024/1025 테스트를 둔다. DOM 숨김은 CSS 우선, JS는 열림 정리·포커스 이전 등 동작에만 쓴다. 서버 렌더와 최초 클라이언트의 상태를 같게 하고 UA 분기를 하지 않는다.

공개 사이트 내비와 Docs 장 내비는 서로 다른 접근 이름을 가진다. 좁은 Docs에서도 두 역할을 유지하되 서랍 하나를 연 뒤 다른 서랍으로 중첩하지 않는다. TOC는 문서 본문 안의 펼침 목록이며 내비와 합치지 않는다.

열기 → 기존 Dialog의 initial focus 규칙, Tab 순환·배경 비활성, Esc/배경/닫기 → 트리거 복귀. 경로 이동은 도착 화면의 포커스가 이긴다. 넓어지며 트리거가 사라질 때는 고정 내비의 대응 링크, 없으면 본문 제목을 fallback으로 정한다. resize 때문에 본문/스크롤러/검색/Inbox를 다시 마운트하지 않는다. 읽음 Action은 실제 Inbox 열기 이벤트 한 번에만 실행한다. 검색 단축키 리스너와 결과 로더 소유자도 한 벌이다.

서랍 닫힘 때 진행중 Action 제한을 우회하지 않는다. 검색·Dialog는 기존 IME guard를 유지한다. 공개 스크롤러의 body 포커스 회수와 Dialog focus trap이 경쟁하지 않도록 오버레이 열림 상태에서도 실물 검증한다.

## 3. 공개 문서·Auth 레이아웃

Docs는 기존264px 내비를 넓은 셸에 유지하고 좁으면 서랍으로 옮긴다. `app/docs/layout.tsx`의 내비는 경로 이동 동안 유지되며 `PublicScroller`는 기존 페이지별 재마운트 규칙을 보존한다. 해시 헤딩에 착지하고 키보드 Space/PageDown이 본문을 움직여야 한다.

Docs/Privacy 읽기 프레임의 **외부 컨테이너 content box**960 미만은 TOC를 본문 앞 펼침 목록으로 옮긴다. 컨테이너 선언과 이를 질의하는 grid는 부모/자식으로 분리한다. TOC 링크/관측 로직은 한 벌만 활성화하고 중복 id를 만들지 않는다. 코드·표 내부 overflow, 이미지 max-width, 긴 URL 줄바꿈을 다룬다. 빈 TOC에서 좁은 화면에 빈 열을 남기지 않는다.

Signin 장식은1024 미만 숨기고 폼을 우선한다. AuthColumn320·OAuth480은 `width:100%`와 기존 max-width로 바꾼다. footer는 줄바꿈 높이를 허용하고 본문 최소 높이가 폼/동작을 밀어내지 않도록 한다. svh 기반 한정 높이·min-height 우선순위·실제 키보드 가용 높이를 검사한다. 폼 값·pending·에러는 폭 전환으로 초기화하지 않는다.

## 4. 랜딩 캡션과 순수 함수

현재 `lib/landing/stage.ts`는 `fitScale({W,H})`에 고정 CHROME_H(16+28)를 빼고 `frame`이 이를 호출한다. 캡션 높이가 변하면 이 전제가 틀린다.

변경할 인터페이스(새 제안): `fitScale` 및 `frame` 입력에 실제 캡션/진행 영역 높이 `chromeHeight: number`를 추가한다. W/H는 기존 공개 scroller 치수다. P1에서 테스트 사례를 정리하고 P5에서 테스트를 먼저 red로 만든 뒤 함수·전체 소비자·테스트를 같은 커밋에서 갱신하며 예전 고정 높이 default로 누락을 숨기지 않는다. gap16 포함 여부는 `chromeHeight`에 포함하는 것으로 통일한다.

- `components/landing/stage.tsx`에서 현재 언어의 다섯 캡션을 같은 가용 너비로 측정하고 가장 큰 높이+간격/진행 영역을 전달한다. 시각적으로 숨긴 측정층은 aria-hidden이며 활성 문구 중복 낭독을 막는다.
- font ready·언어·컨테이너 폭 변경을 ResizeObserver로 반영한다. 같은 크기/스크롤 위치에서 같은 프레임이어야 한다. 씬마다 예산이 출렁여 목업이 움직이지 않게 한다.
- 미측정 시 캡션은 정상 흐름에 둬 겹침을 막고, 측정 후 고정 스테이지를 활성화한다. 높이가 목업 최소 표시조차 못 담으면 고정 재생 대신 동일5씬 정적 흐름을 보여준다. 씬 정보/CTA를 제거하지 않는다.
- 순수 함수 테스트: 여러 줄 높이·0/비정상 치수·작은 H·scale 0..1·동일 입력 동일 출력·정/역 스크럽·reduced-motion. DOM 측정은 얇은 껍데기다.

서랍은 Dialog가 동작을 들고 CSS가 배치를 정하므로 별도 범용 상태 머신을 만들지 않는다. 공유 breakpoint helper는 실제 JS 소비자가 필요한 판정만 잎 모듈로 분리하며 CSS와 경계 일치 테스트를 둔다.

## 5. 서버·불변식·성능

스키마/마이그레이션/환경변수/외부 호스트/쿠키 추가 없음. 인증은 기존 페이지/Action 판정이며 좁은 조건부 렌더가 인가를 대신하지 않는다. export 결정성·blob SHA·strict push·보호 토큰·Project 잠금 영향 없음. 새로운 Route Handler 없음.

SSR의 데이터 조회를 클라이언트로 옮기지 않는다. 별도 데스크톱/모바일 데이터 소유자를 중복 마운트하지 않고 client-graph 검사를 유지한다. 기존 메시지와 en/ko/es 사전 재사용, 새 키는 세 언어 동시 추가. `dark:`·raw 색·신규 테마 없음. global-error 등 기존 테마 예외 유지.

## 6. 과거 함정과 검증

- POSTMORTEM 2026-09-15 「자기 자신을 컨테이너로 물은 쿼리」: 선언 조상과 소비자 분리,960 경계 양쪽 computed grid 실측.
- POSTMORTEM 2026-09-19 「스크롤 래퍼에 준 접근 이름」: 표 자체 이름과 스크롤 영역 이름을 각각 검사.
- POSTMORTEM 2026-09-24 「초대 모달의 포커스·입력 규칙」 및 「포커스가 body로 빠지는 자리」: effect로 초기 포커스 경쟁 금지, 기존 initialFocusRef/busy/fallback 계약 유지. DOM 테스트뿐 아니라 브라우저 activeElement 확인.
- `large-modal.tsx` 머리/높이 주석: min-height가 max-height를 이김, footer 도달·첫 입력 focus ring을 실제 높이에서 확인.

## 7. 연계·대안·정본 갱신

앱을 함께375로 풀거나 모든 화면을 비율 축소하는 방법은 앱 편집 기능·가독성을 만족하지 못한다. 전역768 분기 추가 대신1024 셸 및 내부 컨테이너 질의를 쓴다. 상호작용을 갖는 Drawer 라이브러리를 추가하지 않고 기존 Dialog를 조립한다.

P1 검증 완료본을 A2의 선행 기준으로 삼는다. 앱 단계는 공유 오버레이/검색/Inbox를 재구현하지 않고 소비한다. A2e는 P1d 완료본 위에서 캔버스와 frame 입력을 확장하며 동시 수정하지 않는다.

구현 태스크에서 PRODUCT 지원 범위, DESIGN 공개/Auth 하한·내비·모달·랜딩, ARCHITECTURE 검색/Inbox 소유자 변화가 있는 부분, DIRECTORY 신규 파일, 가이드 세 언어를 갱신한다. 이번 문서 작업에서는 정본을 수정하지 않는다.
