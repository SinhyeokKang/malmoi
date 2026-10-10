# responsive-public — 구현 태스크

상태: 전부 미착수. 문서 작성 시 코드·테스트·빌드·커밋·배포 실행 없음.
[스펙](spec.md) · [설계](design.md) · [브리프](design-brief.md).

## 순서와 커밋 경계

P0 → P1 → P2 → P3/P4 → P5 → P6 → P7. P2~P5를 묶어 **공개 단계**라 부른다. 각 구현 커밋은 관련 테스트를 먼저 red로 만들고 구현 뒤 green을 확인한다. 서로 독립인 공개 읽기/Auth도 공유 껍데기 P2 뒤에 진행한다. P1은 테스트 사례·계약 정리 단계이며 독립 구현 커밋이 아니다. 실제 red→순수 함수 구현→소비자 이관→green은 해당 소비자 배치 안에서 연속 수행한다. 각 구현 커밋은 pnpm test·pnpm typecheck 통과를 요구하며, 필수 인자 변경과 모든 호출부·테스트 갱신을 나누지 않는다.

**기존 계약 테스트는 지우지 않고 새 계약으로 바꿔 쓴다.** 1280 하한·반응형 분기 금지·고정 치수를 소스 스캔으로 고정한 테스트가 각 배치에 걸린다(아래 "교체" 줄). 삭제로 green을 만들지 않는다.

**검증 표기**: `자동` = Vitest/typecheck(jsdom은 실제 폭·CSS·컨테이너 쿼리를 못 잰다 — matchMedia/ResizeObserver는 테스트마다 제어 가능한 stub으로 상태 정리·클래스만 단언), `실측` = ego-browser computed style·rect·activeElement·AX 트리. 실측은 터치 에뮬레이션(`pointer:coarse`) 포함.

**배포**: 공개 단계는 dev(preview)까지다. 프로덕션 `/merge`는 responsive-app 완료 뒤 두 기능을 함께 낸다(spec 출시 절).

- [ ] **P0 — 대표 프레임 수령 및 치수 확정** (첫 태스크, 코드 없음)
  - 2026-10-10: 프레임 PT1a~PT8 수령·검토 완료(Claude Design `Public Responsive.dc.html`). 판정과 시안 주석 정정은 [브리프 "시안 수령 판정"](design-brief.md#시안-수령-판정-2026-10-10). 남은 것은 375 실측과 긴 ko 문구 확정이다.
  - 사용자 제공 로컬 핸드오프에서 브리프의 **패턴 대표 프레임 PT1~PT6**를 받는다. 프로토타입이 아니라 폭별 정적 프레임이다.
  - 1024 내비·960 TOC·좁은 모달 거터/안쪽 여백·로그인 장식 경계·캡션 예산·키보드 열린 footer를 긴 en/ko/es 문구로 확정한다.
  - 375 한 컷 실측으로 현재 가로 스크롤·잘림 목록을 spec 문제 절에 관측 사실로 남긴다.
  - 검증: 대표 프레임×폭 누락0, D4~D6와 기능 생략 충돌0, 확정값/로컬 파일 경로를 두 기능 문서에 기록. 미수령은 다음 UI 구현의 차단 항목으로 남긴다.

- [ ] **P1 — 순수 레이아웃 계약·테스트 사례 정리**
  - `lib/landing/__tests__/stage.test.ts`에 추가할 chromeHeight 입력·여러 줄·작은 높이·비정상 치수·정/역 스크럽·reduced-motion 사례와 fitScale/frame의 전체 소비자를 정리한다. 테스트 작성·red 확인부터 함수 구현·소비자 이관까지는 P5에서 함께 수행한다.
  - `lg` 쿼리 문자열 상수(design §2)의 잎 모듈·소스 스캔 테스트 사례를 정한다. 범용 반응형 설정 API를 만들지 않는다.
  - 각 배치의 교체 대상 테스트 목록을 확정한다(아래 각 배치 "교체" 줄을 grep으로 전수 확인 — `min-w-shell-min`·`shell-min`·`1280`·`modal-gutter`·`96px`·`lg:` 금지 단언).
  - 검증: 각 사례의 기대값·소비자·구현 배치 누락0. 이 단계에서는 함수 계약이나 실행 테스트를 바꾸지 않는다.
  - 커밋: 독립 구현 커밋 없음.

- [ ] **P2 — 공개 셸·서랍·공유 오버레이**
  - 공개/Auth 하한 해제 기반, 공유 헤더 배치표(design §2), `dialog.tsx` 측면 서랍 변형 + 공개 내비 소비자, 검색 아이콘 접근 이름(FieldButton 아이콘 전용 반응 클래스), 서랍 바닥 언어·테마 스위처와 `lg` 미만 공개 푸터 왼쪽 묶음, `lg` 미만 전체 화면 시트 공통 형 — 검색(`CommandDialog` CSS)·Inbox(열기 핸들러 `matchMedia`로 DropdownMenu↔Dialog 그릇 선택, design §2), **큰 모달 규칙 — LargeModal 그릇 상수에 `lg` 미만 시트·시트 안쪽 여백 16·footer 바닥 고정(앱 모달 전부가 받는다, 랜딩 목업은 제외 — design §1)**, `dvh`·sticky footer, coarse 히트 영역 `::after`, 꺼진 컨트롤 사유의 보이는 줄을 구현한다.
  - 앱1280 하한과 `--spacing-shell-min` 전역 값은 유지한다. 앱 본문을 모바일로 푸는 변경은 넣지 않는다.
  - 자동: 서랍 열림 상태 직접 렌더(조상 provider)·matchMedia stub으로 `lg` 넘어갈 때 열린 서랍 정리·좁아지는 방향 포커스 이전·라우트 이동·중복 Action/단축키 등록0(검색·Inbox 한 벌)·Inbox 좁은 폭 열기=시트·넓은 폭=메뉴, 열린 채 `lg` 넘나들면 닫힘, 읽음 기록 1회·로그인별 헤더·IME Esc·진행중 닫힘 제한·`lg` 쿼리 문자열 스캔. 새 포커스 테스트는 focus fixup observer + 일부러 깨뜨린 red 확인, 새 서랍을 `focus-return`·`primitive-focus` 그물에 등재.
  - 교체: `components/__tests__/public-shell.test.tsx:319`·`:355-358`, `logs-screen.test.ts:186-191`("좁은 화면 여백도 96" → `lg` 미만 시트), `spelling-equivalence.test.ts:228`(`modal-gutter 96px` — 값은 그대로라 단언 유지 여부만 확인), `command-dialog.test.tsx`·`modal-initial-focus.test.tsx`·`parallel-p2-modal.test.tsx`·`overlay-ime-guard.test.tsx`(그릇 상수 변경 회귀), `landing-mockup.test.tsx`(목업은 시트가 되지 않음), `onboarding-modal.test.tsx:166-172`·`:309-319`, `visual-system.test.ts:183-186`·`:612`(측면 서랍 radius 등재), 회귀 대상 `command.test.tsx:118,150`(`hidden sm:flex`).
  - 실측: 공개 헤더 네 폭 겹침0, 서랍 열기/닫기/링크 이동/`lg` 경계 1023·1024·1025의 activeElement, **앱 1280 이상과 앱 1280 미만(가로 스크롤 구간)에서** 온보딩 Files·Publish·로그 상세·초대·검색 모달의 footer 도달과 두 판 배치(Files의 952 분모가 A5 전까지 남는다), 랜딩 목업 헤더(`app-frame.tsx`) 회귀.
  - 커밋: `feat(responsive-public): adapt shared shell and overlays`.

- [ ] **P3 — Docs·Privacy·Changelog**
  - `/docs` 하단 캡슐 + 장 내비 전체 화면 시트(design §2 — 헤더 메뉴는 글로벌 서랍 그대로), 960 미만 TOC 펼침(TOC DOM 하나, 카드 disclosure 기본 접힘), `lg` 미만 문서 표시급 타이포 한 단계 하향, 좌우 여백 컨테이너 판정, 본문 카드·이전/다음·긴 표/코드/이미지 배치를 조정한다. TOC 없음·404도 처리한다.
  - 자동: `PublicScroller`의 경로별 재마운트·해시·본문 키보드 스크롤 계약, 표 자체 접근 이름, TOC 인스턴스 1개.
  - 교체: `components/__tests__/privacy-doc.test.tsx:117-122`(`720px_200px` 2열 고정).
  - 실측: 본문/해시/절/이전·다음 도달, 959/960/961 computed grid, 내부 표/코드 외 가로 잘림0, 표 AX 트리 이름, 원고·색인 내용 변화0.
  - 커밋: `feat(responsive-public): adapt public reading pages`.

- [ ] **P4 — Auth·초대·OAuth·오류**
  - AuthColumn320/OAuth480을 유동 상한으로 전환하고 `lg` 미만 로그인 장식 숨김, footer 줄바꿈과 폼/오류 경계 배치를 구현한다.
  - pending·오류·만료·불일치·프로젝트 다수·승인/거부의 기존 state를 유지한다. 계정 연결·로그인 callback을 레이아웃 작업으로 바꾸지 않는다.
  - 자동: resize 중 입력 보존, 서버 인가/중복 제출 회귀 green.
  - 교체: `components/__tests__/signin-screen.test.ts:135-136`(`min-w-shell-min`)·`:143`(`lg:` 금지 → "장식 숨김 `lg` 하나만 허용").
  - 실측: 각 상태에서 제목·입력·동작 도달, 키보드 열린 상태 footer 도달(에뮬레이션). 외부 OAuth 왕복은 실제 연결 가능한 환경에서 별도 확인하고 미실행을 구분한다.
  - 커밋: `feat(responsive-public): adapt auth and error surfaces`.

- [ ] **P5 — 랜딩 캡션과 공개 하한 통합**
  - P1에서 정한 순수 테스트와 `landing-stage.test.tsx` 소비자 테스트를 먼저 작성해 red를 확인한다. 이어 fitScale/frame의 chromeHeight 필수화와 모든 호출부·테스트 갱신을 같은 커밋에서 수행한다. 캡션 다섯을 같은 grid 셀에 겹치고 `chromeRef` ResizeObserver로 높이를 넘긴다. 미측정/높이 부족 정적 흐름과 reduced-motion을 구현한다.
  - 히어로 `lg` 미만 표시급 하향(design §3)·CTA 줄바꿈·캡션·진행 표시·마지막 CTA를 조정하고 공개/Auth 최소폭을 최종 해제한다. 1440×900 내부 목업은 유지한다.
  - 자동: stage 순수 테스트 red→green, 소비자 테스트는 jsdom 높이 0이라 stub 값 전달만 단언. pnpm test·pnpm typecheck green.
  - 실측: 전 씬 정/역 스크럽 및 ko/es 여러 줄 캡션 겹침0, 높이 부족 상태에서도 5씬/CTA 누락0.
  - 커밋: `feat(responsive-public): fit landing captions to narrow screens`.

- [ ] **P6 — 대조·번역·가이드**
  - 신규 표면(측면 서랍)만 `/design-sync`. 나머지 대표 프레임은 ego-browser computed style/접근성 트리로 대조한다. 같은 패턴의 나머지 화면은 대표 프레임 패턴이 적용됐는지 실측으로 확인한다.
  - `/translate`로 신규 키 en/ko/es를 함께 처리.
  - `pnpm guide:check`를 돌려 셸·모달 소스 변경으로 stale된 매핑을 확인하고, 결과에 따라 `/guide-shots`(SHA만 갱신 또는 en1280×800 재촬영)을 부른다. 가이드 내비 설명은 `/guide`로 en/ko/es 동시 반영.
  - 검증: 대표 프레임별 차이와 해소 결과 기록, pnpm test·pnpm typecheck green, `guide:check` stale 0.
  - 커밋: 기능 사전은 해당 구현 커밋, 가이드는 세 언어 함께.

- [ ] **P6a — `docs(PRODUCT)` 지원 범위**
  - `docs/PRODUCT.md:824`의 "폭은 셸의 1280이고 폰에서는 가로 스크롤을 수용했다 · 사용자 판정"을 2026-10-07 사용자 판정(원문 인용)으로 교체한다. §4.1에 "375부터 모든 기능, 폭에 따른 기능 분기 0"을 둔다. 앱과 동시 출시이므로 과도기 문장을 쓰지 않는다.
  - 검증: `grep -n "가로 스크롤을 수용" docs/PRODUCT.md` 0건.
  - 커밋: `docs(PRODUCT): support narrow screens from 375px`.

- [ ] **P6b — `docs(DESIGN)` 공개·공유 표면**
  - §5(`:340`) 1280 하한 문장을 날짜와 함께 뒤집고(앱 하한 해제 문장은 A8b가 마무리), §6.54 "gutter 96 유지(알려진 한계)" → `lg` 이상 96 · 미만 시트, §6.61·§6.616 "폰 폭 반응형 없음"(`:1054`), §7 터치 히트 영역·꺼진 컨트롤 사유 보이는 줄, 측면 서랍 radius·배치표, 전체 화면 시트 공통 형·Docs 하단 캡슐·`lg` 미만 표시급 타이포 한 단계를 갱신한다.
  - 검증: 갱신한 줄 목록을 커밋 본문에 남김. `grep -n "반응형 없음" docs/DESIGN.md`의 공개 표면 행 0건.
  - 커밋: `docs(DESIGN): responsive public surfaces`.

- [ ] **P6c — `docs(ARCHITECTURE)`·`docs(DIRECTORY)`**
  - 검색·Inbox 한 벌 원칙(§6.365·§6.37), 신규 잎 모듈. 원본 규칙(CLAUDE.md)을 고치면 `pnpm sync:agents`.
  - 검증: `pnpm sync:agents:check` green(해당 시).

- [ ] **P7 — 공개 단계 검증과 앱 인계**
  - spec 샘플링 규칙의 매트릭스, 경계 1023/1024/1025·959/960/961 및 실제 변경된 폼 경계 ±1을 실측한다. 200% 확대·키보드·IME·터치 에뮬레이션(소프트 키보드 높이·서랍 닫힘 뒤 트리거 복귀·꺼진 Radix Select 터치 — POSTMORTEM 2026-09-24 `pointerdown`·Select 사례)·서랍 reduced-motion 포함.
  - 모든 공개 기본 경로와 로그인/비로그인 헤더, 앱 1280 이상·미만의 포털 오버레이 회귀를 검사한다. 결과는 표 템플릿(화면 · 폭 · 테마 · 언어 · scrollWidth · 잘린 rect · activeElement · footer 도달 · 판정)으로 남긴다.
  - 검증: P-01~08 각각 증거/결과/미완0, 통합 세션에서 pnpm gate 후 새 서버로 실물 재확인.
  - 인계: 공개 단계 확정 커밋·공유 파일 목록(헤더·서랍 변형·큰 모달 시트 규칙·검색·Inbox)·경계값·검증 표를 responsive-app에 전달. `/merge`는 부르지 않는다(앱과 동시 출시).

## 실패 판정

대표 프레임 미수령, 외부 왕복 미검증, 접근할 수 없는 기능, 잘린 footer, 숨은 포커스, 중복 Action은 각각 미완으로 기록한다. jsdom green이나 스크린샷 한 장으로 치수/상호작용 통과를 대체하지 않는다.
