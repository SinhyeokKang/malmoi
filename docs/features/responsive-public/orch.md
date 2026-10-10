# responsive-public — 지휘 계획 (/orchestrate)

원본: [spec](spec.md) · [design](design.md) · [tasks](tasks.md) · [design-brief](design-brief.md)(끝 절 "시안 수령 판정"이 시안 주석보다 우선). 이 문서는 원본을 복제하지 않고 배치·소유권·순서·상태만 든다.

- 시작: 2026-10-10, dev `3a1afe68`
- 끝은 dev(preview)다. `/merge`는 responsive-app 완료 뒤 두 기능을 함께 낸다(spec 출시 절). 이 런은 `/merge`를 부르지 않는다.
- 스키마·마이그레이션·환경변수 변경 없음(design §5).

## 결정 기록

| # | 결정 | 출처 |
|---|---|---|
| D1 | 좁은 Docs 장 내비 = 하단 캡슐 + 전체 화면 시트, 헤더 메뉴는 늘 글로벌 서랍 | 2026-10-10 사용자 |
| D2 | 좁은 Inbox = 전체 화면 시트(열기 핸들러 `matchMedia`로 그릇 선택) | 2026-10-10 사용자 |
| D3 | `lg` 미만 표시급 타이포 한 단계 하향 허용 | 2026-10-10 사용자 |
| D4 | 키보드·`dvh` 계약은 공개 단계에 둔다 | 2026-10-10 사용자 |
| D5 | 큰 모달 규칙 — `lg` 미만 LargeModal 계열 전부(앱 모달 포함) 전체 화면 시트, 그릇 상수 한 곳. gutter 96 재정의 안 함 | 2026-10-10 사용자 |
| D6 | 계정(사용자) 메뉴 = 헤더 팝오버 유지, `collisionPadding` 8 | 2026-10-10 사용자 |
| D7 | Docs 캡슐 라벨 = 현재 페이지 제목, 현재 페이지가 없으면(404) `m.publicDocs.docs.title` | 지휘자 판단 — 시안 PT2a 형을 그대로 확장, 새 문구 0 |
| D8 | 새 사전 키는 R2만 넣는다(서랍 열기/닫기 이름). TOC "On this page"는 기존 `toc` 키 재사용 | 지휘자 판단 — `messages/*` 겹침 제거, 기존 키 존재 확인 |
| D9 | P1(계약·테스트 사례 정리)은 독립 배치가 아니다 — 각 배치가 자기 몫을 먼저 red로 쓴다 | 지휘자 판단 — tasks P1 "독립 구현 커밋 없음" |
| D10 | 프리미티브는 첫 소비자와 같은 배치가 만든다 — 시트 형은 R1(LargeModal·CommandDialog), 측면 서랍 변형·FieldButton 아이콘 형·`lg` 쿼리 잎 모듈은 R2(공개 내비·검색 트리거·Inbox), 꺼진 사유 줄은 R4(Auth). 터치 히트 영역은 R1(Button 전역) | 지휘자 판단 — CLAUDE.md "소비자 없는 API 금지" |
| D14 | Inbox·Docs 장 내비 시트는 R1이 시트로 만든 `LargeModal`을 소비한다 — 새 시트 프리미티브 금지(`lg` 미만에서만 열리고 넘으면 닫히므로 `lg` 이상 형이 쓰이지 않는다) | 지휘자 판단 — 시안 공통 형 = LargeModal `lg` 미만 형 |
| D11 | 가이드 스크린샷은 `pnpm guide:check` 결과대로만(en 1280×800은 `lg` 이상이라 셸 변경이 없으면 재촬영 0) | 지휘자 판단 — spec D6·tasks P6 |
| D13 | 시안이 정본으로 준비된 변경이라 `/design-sync` 배치를 둔다(대조 기준 = 시안 + 브리프 "시안 수령 판정" 정정) | 2026-10-10 사용자("design-sync 배치 까먹지 말거라") |
| D15 | 마무리 CTA h2(48)도 표시급이라 히어로와 같이 `lg` 미만 30/1.2 | 지휘자 판단 — D3 "표시급 한 단계" 원칙의 같은 급(R5 리뷰 제기) |
| D16 | `MIN_PINNED_SCALE` 0.2 수용(목업 고정 재생 하한) | 지휘자 판단 — 375 배율 0.215와 같은 급, 상수 하나 |
| D17 | 터치 히트 영역 44를 `sm`과 아이콘 크기 전부(`icon-xs`·`icon-sm`·`icon-md`·`icon-lg`)로 넓힌다. 텍스트 `md`·`lg`는 제외 | 지휘자 판단 — 2026-10-07 사용자 판정("44까지")의 목적, 시트의 지우기 X(24)·닫기(32)가 빠지면 규칙이 무력(R1 리뷰). 되돌리기는 상수 한 줄 |
| D18 | `viewport-fit=cover`를 넣지 않는다 — safe-area 토큰은 그때까지 0 | 지휘자 판단 — 넣으면 셸 전체 safe-area가 필요해 범위 밖(R1 리뷰 추천) |
| D19 | R1 해제 뒤 `components/ui/large-modal.tsx`는 R2 소유 — 빈 footer 생략·본문 여백 끄기(Inbox·Docs 시트용), 기존 소비자 렌더 불변 조건 | 지휘자 판단 — R2 질문, 시안 PT5a·PT2c는 footer 없음·전폭 행 |
| D20 | 루트 viewport에 `interactiveWidget: "resizes-content"` — Android에서 키보드가 `dvh`를 줄여 D4의 sticky CTA 계약이 실제로 선다. iOS 비대응(비범위) | 지휘자 판단 — R4 리뷰: `dvh`만으로는 키보드를 따르지 않는다. D4 의도의 수단, 되돌리기 한 줄 |
| D21 | `components/ui/dropdown-menu.tsx`를 R2 소유에 추가 — DropdownMenuRow 행 형을 export 상수로 꺼내 Inbox 시트 행과 공유(손 사본 0) | 지휘자 판단 — R2 질문, 시안 PT5a 행 40 |
| D22 | Inbox 시트 첫 포커스 = 머리 닫기(Radix 기본), 시안 PT5a "첫 행 활성"과 다름 | 지휘자 판단 — 목록이 비동기라 열 때 행이 없고, 도착 뒤 포커스 이동은 POSTMORTEM 2026-09-24 "effect로 초기 포커스 경쟁" 재발(R2 리뷰 추천) |
| D23 | Changelog 버전 제목(30)도 `lg` 미만 24로 한 단계 | 지휘자 판단 — D3·D15와 같은 "표시급 한 단계", 좁은 폭 페이지 제목 30과 위계 유지(R3 리뷰 제기) |
| D12 | 워커는 Claude Code 패밀리만(Opus 5.5·Sonnet 5.5, effort ≤ high). Codex 교차 없음 | 지휘자 판단 — 사용자 허가 없음 |

## 배치

| 배치 | tasks | 소유 파일(이 배치만 편집) | 선행 | 모델·effort | 상태 |
|---|---|---|---|---|---|
| **QA0** 기준선 | P0 375 실측 | 없음(리포트 `.scratch/qa0-baseline.md`) | — | Sonnet 5.5 medium — 측정만 | 완료 |
| **R1** 큰 모달 시트·검색 시트 | P2 일부 | `components/ui/{dialog,large-modal,command,button}.tsx`(dialog는 `CommandDialog` 부분만)·`components/landing/mockup/publish.tsx`·관련 테스트(`logs-screen`·`spelling-equivalence`·`onboarding-modal`·`command`·`command-dialog`·`modal-initial-focus`·`parallel-p2-modal`·`overlay-ime-guard`·`landing-mockup`·`visual-system`·`focus-return`·`primitive-focus`) | — | Opus 5.5 high — 앱 모달 8종이 받는 공유 그릇·포커스 계약 | 대기 |
| **R5** 랜딩 캡션·히어로 | P5 | `lib/landing/stage.ts`·`components/landing/stage.tsx`·`app/page.tsx`·`lib/landing/__tests__/`·`landing-stage.test.tsx` | — | Sonnet 5.5 high — 순수 함수 TDD가 명확 | 대기 |
| **R2** 공개 셸·헤더·서랍·Inbox | P2 나머지 | `components/public-shell/*`·`components/shell/{header-bar,attention-inbox,user-menu}.tsx`·`components/search/search-trigger.tsx`·`components/ui/dialog.tsx`(측면 서랍 변형)·`components/ui/field-button.tsx`·새 잎 모듈(`lg` 쿼리 상수)·`messages/{en,ko,es}.tsx`(서랍 키만)·`public-shell.test.tsx` 등 | R1 dev 통합 | Opus 5.5 high — 한 벌 원칙·읽음 1회·포커스 이전 | 대기 |
| **R4** Auth·초대·OAuth·오류 | P4 | `components/signin/*`(푸터 제외)·`components/oauth/consent-panel.tsx`(CTA 영역 — 2026-10-10 R4 질문 허용)·꺼진 사유 줄 프리미티브(`components/ui/`)·`app/signin/`·`app/invite/`·`app/oauth/authorize/`·`app/not-found.tsx`·`app/error.tsx`·`signin-screen.test.ts` | R1 dev 통합 | Sonnet 5.5 medium — 레이아웃 치환 위주 | 대기 |
| **R3** Docs·Privacy·Changelog | P3 | `app/docs/*`·`components/docs/*`·`components/public-doc-toc.tsx`·`components/public-doc-table.tsx`·`components/privacy/privacy-doc.tsx`·`app/privacy/`·`app/changelog/`·`privacy-doc.test.tsx` | R1·R2 dev 통합 | Opus 5.5 medium — 컨테이너 쿼리·재마운트 착지 | 대기 |
| **DS** 시안 대조(`/design-sync`) | P6 대조 | 없음 — main 체크아웃에서 `/design-sync --audit`로 PT1a~PT8 프레임별 computed style + AX 트리 대조, 불일치마다 BugShot 이슈. 수정은 그 화면을 소유한 배치 워커가 하고 DS가 재실측·닫기 | R1~R5 dev 통합 | Opus 5.5 medium — 시안 수치 대조 | 대기 |
| **R6** 정본 문서 | P6a·P6b·P6c | `docs/{PRODUCT,DESIGN,ARCHITECTURE,DIRECTORY}.md` | R1~R5 dev 통합 | Opus 5.5 medium — 정본 판정 문장 | 대기 |
| **QA** 런타임 | P7 | 없음(main 체크아웃, BugShot 이슈) | DS 수정 라운드 dev 통합 | Opus 5.5 medium | 대기 |

리뷰 워커는 배치마다 Opus 5.5 medium, 리포트 전용.

## 겹침과 순서

- 파일 겹침 0인 묶음끼리만 병렬. `messages/*`는 R2 단독(D8). 푸터(`components/public-shell/footer.tsx`)는 R2 — Auth 푸터 두 줄 감김도 R2가 같은 컴포넌트로 든다. R4는 `auth-layout.tsx`의 하한·장식만.
- 파동: **1** R1 · R5 · QA0(main 체크아웃, 통합 전 기준선) → **2** R1 dev 뒤 R2 · R4 → **3** R2 dev 뒤 R3 → **4** DS(main 체크아웃, 직렬) → 수정 라운드 → **5** R6 · QA(main 체크아웃, DS 뒤 직렬).
- QA0·QA가 main 체크아웃에서 `pnpm dev`를 도는 동안 cherry-pick·build 금지.

## 검증 게이트

- 워커: `pnpm gate --base dev`(파이프로 거르지 않는다), `/ship bypass` 11단계(`/push`) 전 정지, 인계 `.scratch/handoff-<batch>.md`.
- 지휘자 통합: main 체크아웃 cherry-pick → `pnpm gate` 끝줄 → `git push` → 그 커밋 dev CI 결론.
- 런타임: spec 측정 판정·샘플링 규칙, 앱 1280 이상·미만의 포털 오버레이 회귀(D5로 앱 모달이 `lg` 미만 시트가 된다).

## 진행 기록

(배치별 push 해시·라운드·미완을 여기에 갱신한다.)

Run `run_93218ca1a5cb`.

| 배치 | Dispatch | 터미널 | 워크트리 | 상태 |
|---|---|---|---|---|
| R1 | `ctx_cb5b32691dab` → fix1 `ctx_cb71fcb77470` | (해제) | (삭제) | dev `4de3962a`·`702581d5` push · 리뷰 🔴0 🟡6 → fix1(D17·머리 상단 정렬) 반영. DS 넘김: Cancel 표기·375 footer 감김·X/Cancel 겹침 폭·1023/1024 computed |
| R2 | `ctx_b69add738ab2` | `term_f50c10be`(유지 — DS 수정 담당 후보) | `~/orca/workspaces/malmoi/rp-r2` | 495bfd3d·86182d18 · 리뷰 🔴0 🟡7(DS 실측: WideOnly 좁아짐 포커스·푸터 스위처 열린 채 좁아짐·서랍 스위처 align·같은 페이지 링크 포커스·Inbox 트리거 ARIA·배경 닫힘 테스트 공백·수치) |
| R3 | `ctx_f06ec45afa8f` → fix1 `ctx_02e78331fa30` | `term_fca2bea3`(유지 — DS 수정 담당 후보) | `~/orca/workspaces/malmoi/rp-r3` | e51f1be4·2e2c469c · 리뷰 🔴0 🟡4 → fix1 반영. 남김: Changelog 표 이름 없음 → 키보드 스크롤 영역 아님 |
| R4 | `ctx_58b60d803427` → fix1 `ctx_dbdc9a38d48f` | (해제) | (삭제) | dev `62c06d3f`·`ed268174` push · 리뷰 🔴1 🟡5 → fix1 반영(EntityCard·초대 카드 줄바꿈, scroll-pb, D20). 꺼진 사유 줄 프리미티브는 소비자 0 → responsive-app |
| R5 | `ctx_5f51f6863e1c` → fix1 `ctx_0579ddf53787` | (해제) | (삭제) | dev `ba028854`·`cee04ef3` push · 리뷰 🔴0 🟡3 → fix1 반영, 재리뷰 생략(지휘자 판단 — 🟡만) |
| QA0 | `ctx_e2cd578cfcea` | `term_79c0d5b1` | main 체크아웃 | 완료 — spec 문제 절에 실측 반영, 해제 |
