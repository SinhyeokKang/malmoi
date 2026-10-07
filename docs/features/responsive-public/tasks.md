# responsive-public — 구현 태스크

상태: 전부 미착수. 문서 작성 시 코드·테스트·빌드·커밋·배포 실행 없음.
[스펙](spec.md) · [설계](design.md) · [브리프](design-brief.md).

## 순서와 커밋 경계

P0 → P1 → P2 → P3/P4 → P5 → P6 → P7. 각 구현 커밋은 관련 테스트를 먼저 red로 만들고 구현 뒤 green을 확인한다. 서로 독립인 공개 읽기/Auth도 공유 껍데기 P2 뒤에 진행한다. P1은 테스트 사례·계약 정리 단계이며 독립 구현 커밋이 아니다. 실제 red→순수 함수 구현→소비자 이관→green은 해당 소비자 배치 안에서 연속 수행한다. 각 구현 커밋은 pnpm test·pnpm typecheck 통과를 요구하며, 필수 인자 변경과 모든 호출부·테스트 갱신을 나누지 않는다. P2~P5 개별 커밋은 배포 승인이나 공개 지원 완료를 뜻하지 않는다.

- [ ] **P0 — 시안 수령 및 치수 확정** (첫 태스크, 코드 없음)
  - 사용자 제공 로컬 핸드오프 경로에서 P01~P15 상태별 정적 프레임을 받는다. 프로토타입 연결선이 아니라 네 폭의 별도 프레임이다.
  - 1024 내비·960 TOC·좁은 모달 거터/여백·로그인 장식 경계·캡션 예산을 긴 en/ko/es 문구로 확정한다. 기존 화면은 변경 요청으로 대조하고 새 서랍은 신규 표면 자격을 확인한다.
  - 검증: 프레임 번호×폭 누락0, D4~D6와 기능 생략 충돌0, 확정값/로컬 파일 경로를 두 기능 문서에 기록. 미수령은 다음 UI 구현의 차단 항목으로 남긴다.

- [ ] **P1 — 순수 레이아웃 계약·테스트 사례 정리**
  - `lib/landing/__tests__/stage.test.ts`에 추가할 chromeHeight 입력·여러 줄·작은 높이·비정상 치수·정/역 스크럽·reduced-motion 사례와 fitScale/frame의 전체 소비자를 정리한다. 테스트 작성·red 확인부터 함수 구현·소비자 이관까지는 P5에서 함께 수행한다.
  - CSS/JS 내비 경계에 실제 공유 판정이 필요하면 소비자와 잎 모듈 테스트 사례를 정한다. P2에서 테스트를 먼저 작성하고 실제 소비자와 함께 구현한다. 범용 반응형 설정 API를 만들지 않는다.
  - 검증: 각 사례의 기대값·소비자·구현 배치 누락0. 이 단계에서는 함수 계약이나 실행 테스트를 바꾸지 않아 P2~P4 검증을 깨뜨리지 않는다.
  - 커밋: 독립 구현 커밋 없음. 내비 판정은 P2, 랜딩 계약은 P5 소비자 이관 커밋에 포함한다.

- [ ] **P2 — 공개 셸·서랍·공유 오버레이** (P1a)
  - 공개/Auth 하한을 단계적으로 해제할 기반, 헤더·푸터 재배치, 공개 내비 Dialog, 검색 아이콘 접근 이름, Inbox 폭 제한, LargeModal/Dialog 치수·본문/푸터 배치를 구현한다.
  - 앱1280 하한과 shell-min 전역 값은 유지한다. 공유 프리미티브 소비자를 검색하여 검색·온보딩·Publish·로그 상세·초대 등 현 소비자 회귀를 함께 검사한다. 앱 본문을 모바일로 푸는 변경은 넣지 않는다.
  - DOM 테스트:1023↔1024 열린 서랍 정리·focus fallback·라우트 이동·중복 Action/단축키 등록0·로그인별 헤더·IME Esc·진행중 닫힘 제한.
  - 검증: 관련 DOM 테스트 및 pnpm test green, 공개 헤더 네 폭에서 겹침0, 앱1280 이상 기존 모달 동작과 footer 도달 유지.
  - 커밋: `feat(responsive-public): adapt shared shell and overlays`.

- [ ] **P3 — Docs·Privacy·Changelog** (P1b)
  - Docs264 내비를 좁은 서랍에 연결,960 미만 TOC 펼침 목록, 본문 카드·이전/다음·긴 표/코드/이미지 배치를 조정한다. TOC 없음·404도 처리한다.
  - `PublicScroller`의 경로별 재마운트·해시·본문 키보드 스크롤 계약 및 표 자체 접근 이름을 테스트한다.
  - 검증: P03~06 네 폭에서 본문/해시/절/이전·다음 도달,959/960/961 computed grid 판정, 내부 표/코드 외 가로 잘림0, 원고·색인 내용 변화0.
  - 커밋: `feat(responsive-public): adapt public reading pages`.

- [ ] **P4 — Auth·초대·OAuth·오류** (P1c)
  - AuthColumn320/OAuth480을 유동 상한으로 전환하고 좁은 로그인 장식 숨김, footer 줄바꿈과 폼/오류 경계 배치를 구현한다.
  - pending·오류·만료·불일치·프로젝트 다수·승인/거부의 기존 state를 유지한다. 계정 연결·로그인 callback을 레이아웃 작업으로 바꾸지 않는다.
  - 검증: P07~10/P13 각 상태에서 제목·입력·동작 도달, resize 중 입력 보존, 서버 인가/중복 제출 회귀 테스트 green. 외부 OAuth 왕복은 실제 연결 가능한 환경에서 별도 수동 확인하고 미실행을 구분한다.
  - 커밋: `feat(responsive-public): adapt auth and error surfaces`.

- [ ] **P5 — 랜딩 캡션 측정과 공개 하한 통합** (P1d)
  - P1에서 정한 순수 테스트와 `landing-stage.test.tsx` 소비자 테스트를 먼저 작성해 red를 확인한다. 이어 fitScale/frame의 chromeHeight 필수화와 모든 호출부·테스트 갱신을 같은 커밋에서 수행하고 stage의 ResizeObserver·font/언어 변화에 연결한다. 다섯 캡션 최대 실측 높이 사용, 미측정/높이 부족 정적 흐름과 reduced-motion을 구현한다.
  - 히어로/CTA 줄바꿈·캡션·진행 표시·마지막 CTA를 조정하고 공개/Auth 최소폭을 최종 해제한다.1440×900 내부 목업은 유지한다.
  - 검증: `landing-stage.test.tsx`·stage 순수 테스트 red→green 및 pnpm test·pnpm typecheck green, P02 전 씬 정/역 스크럽 및 한/스페인어 여러 줄 캡션 겹침0, 높이 부족 상태에서도5씬/CTA 누락0.
  - 커밋: `feat(responsive-public): fit landing captions to narrow screens`.

- [ ] **P6 — 시안 대조·번역·정본/가이드**
  - 신규 서랍 등 자격을 갖춘 첫 구현 표면만 `/design-sync`로 로컬 핸드오프 대조한다. 기존 화면은 ego-browser computed style/접근성 트리와 변경 브리프를 대조하며 `/design-sync` 적용 대상으로 잘못 분류하지 않는다.
  - `/translate`로 신규 키 en/ko/es를 함께 처리. PRODUCT 공개375/앱1280 과도기, DESIGN 공개/Auth·오버레이·랜딩, ARCHITECTURE 변경된 소유자, DIRECTORY 신규 파일을 필요한 부분만 갱신한다. 가이드 내비 설명은 en/ko/es 동시 반영, 촬영은 en1280×800 공유 유지.
  - 검증: P01~15 프레임별 차이와 해소 결과 기록, 정본이 아직 앱 모바일 전 기능 지원을 주장하지 않음, pnpm test·pnpm typecheck 및 원본 규칙 변경 시 sync:agents:check green.
  - 커밋: 기능 사전은 해당 구현 커밋, 정본은 문서별 `docs(<document>): ...`, 가이드는 세 언어 함께.

- [ ] **P7 — 독립 배포 준비 검증과 앱 인계**
  - spec 매트릭스24조합·주요 상태·경계1023/1024/1025·959/960/961 및 실제 변경된 폼 경계 ±1을 측정한다.200% 확대·키보드·IME·실제 터치 키보드·주소창 변화 포함.
  - 모든 공개 기본 경로와 로그인/비로그인 헤더를 검사하고 앱1280 이상을 공유 프리미티브 회귀 대상으로 검사한다. root/자식 rect·scrollWidth·overflow·activeElement·footer 도달을 남긴다.
  - 검증: P-01~08 각각 증거/결과/미완0, pnpm test·pnpm typecheck green. 통합/배포 준비 세션에서만 pnpm gate 실행 후 새 서버로 실물 재확인하며 이번 feature 작성 중에는 실행하지 않는다.
  - 인계: P1 확정 커밋·공유 파일 목록·경계값·검증 증거를 responsive-app에 전달. 앱 본체 및 A18을 완료로 표시하지 않는다. push/merge는 별도 배포 요청 범위다.

## 실패 판정

시안 미수령, 실제 키보드 검증 불가, 외부 왕복 미검증, 접근할 수 없는 기능, 잘린 footer, 숨은 포커스, 중복 Action은 각각 미완으로 기록한다. jsdom green이나 스크린샷 한 장으로 치수/상호작용 통과를 대체하지 않는다.
