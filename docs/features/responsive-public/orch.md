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
| D10 | 꺼진 컨트롤 사유 줄·`lg` 쿼리 상수·터치 히트 영역은 R1이 `components/ui`·잎 모듈에 만들고 R2·R4가 소비 | 지휘자 판단 — design §2, 프리미티브 먼저 |
| D11 | 가이드 스크린샷은 `pnpm guide:check` 결과대로만(en 1280×800은 `lg` 이상이라 셸 변경이 없으면 재촬영 0) | 지휘자 판단 — spec D6·tasks P6 |
| D13 | 시안이 정본으로 준비된 변경이라 `/design-sync` 배치를 둔다(대조 기준 = 시안 + 브리프 "시안 수령 판정" 정정) | 2026-10-10 사용자("design-sync 배치 까먹지 말거라") |
| D12 | 워커는 Claude Code 패밀리만(Opus 5.5·Sonnet 5.5, effort ≤ high). Codex 교차 없음 | 지휘자 판단 — 사용자 허가 없음 |

## 배치

| 배치 | tasks | 소유 파일(이 배치만 편집) | 선행 | 모델·effort | 상태 |
|---|---|---|---|---|---|
| **QA0** 기준선 | P0 375 실측 | 없음(리포트 `.scratch/qa0-baseline.md`) | — | Sonnet 5.5 medium — 측정만 | 대기 |
| **R1** 공유 오버레이 프리미티브 | P2 일부 | `components/ui/{dialog,large-modal,command,field-button,button}.tsx`·새 잎 모듈(`lg` 쿼리 상수)·`components/landing/mockup/publish.tsx`·꺼진 사유 줄 프리미티브·관련 테스트(`logs-screen`·`spelling-equivalence`·`onboarding-modal`·`command`·`command-dialog`·`modal-initial-focus`·`parallel-p2-modal`·`overlay-ime-guard`·`landing-mockup`·`visual-system`·`focus-return`·`primitive-focus`) | — | Opus 5.5 high — 앱 모달 8종이 받는 공유 그릇·포커스 계약 | 대기 |
| **R5** 랜딩 캡션·히어로 | P5 | `lib/landing/stage.ts`·`components/landing/stage.tsx`·`app/page.tsx`·`lib/landing/__tests__/`·`landing-stage.test.tsx` | — | Sonnet 5.5 high — 순수 함수 TDD가 명확 | 대기 |
| **R2** 공개 셸·헤더·서랍·Inbox | P2 나머지 | `components/public-shell/*`·`components/shell/{header-bar,attention-inbox,user-menu}.tsx`·`components/search/search-trigger.tsx`·`messages/{en,ko,es}.tsx`(서랍 키만)·`public-shell.test.tsx` 등 | R1 dev 통합 | Opus 5.5 high — 한 벌 원칙·읽음 1회·포커스 이전 | 대기 |
| **R4** Auth·초대·OAuth·오류 | P4 | `components/signin/*`(푸터 제외)·`app/signin/`·`app/invite/`·`app/oauth/authorize/`·`app/not-found.tsx`·`app/error.tsx`·`signin-screen.test.ts` | R1 dev 통합 | Sonnet 5.5 medium — 레이아웃 치환 위주 | 대기 |
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
