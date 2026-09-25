# landing — 태스크

순서: 순수 함수 → 셸 → 목업 → 스테이지 → 랜딩 → 대조 → 문서. `/docs`·`/privacy`는 범위 밖이다(spec 비목표). 

검증 줄의 표기: **자동** = `pnpm test`/`typecheck`가 판정 · **수동** = `pnpm dev` + ego-browser로 눈·DevTools 실측(e2e 프레임워크 없음) ·
**sync** = `/design-sync`(computed style + CDP 접근성 트리). ⚠️ `pnpm build`를 `pnpm dev`와 겹쳐 돌리지 않는다 — build 뒤 브라우저 확인 전엔 dev를 재시작한다.

## T0 — 시안 확정 (게이트) ✅ 2026-09-26
- 피드백 여섯 전부 반영 확인, 현 판을 정본으로 동결(design.md 선행 조건). 추가 라운드 없음.

## T1 — `lib/landing/stage.ts` 순수 함수
- `fitScale` · `growProgress` · `sceneAt` · `typedPrefix` · `frame`. 테스트 먼저(`/tdd interface`). 상수는 모듈 상수, `cap`만 인자.
- 케이스:
  - 네 뷰포트 배율(0.836 · 0.964 · 1.194 · 1.5 상한) · `m` clamp 양끝 · 패널이 `2m`보다 작을 때 `fit` 0 clamp.
  - `growProgress`: `stageTop ≤ 0` → 1, 음수 scrollTop → 0.
  - `sceneAt`: q = 0 · 정지/전환 경계(f = 0.6 직전/직후) · 씬 경계 직전/직후 · q = 5에서 `i === 4`(off-by-one) · q > 5 · NaN · H = 0.
  - `frame`: 같은 입력 → 같은 출력(역방향 결정성 — p₁→p₂→p₁) · reduced-motion에서 `scale === fit`·`y === yPin`·t ∈ {0, 1} · 캡션 opacity가 t = 0.5에서 0.
  - `typedPrefix`: 빈 문자열 · t < 0 / t > 1 clamp · 픽스처 문자열이 NFC라는 단언(`s === s.normalize("NFC")`).
- `client-graph.test.ts`의 `CLIENT_LIB_FILES`에 등재 + 잎 검사(`lib/protection/plan.ts` 형).
- 검증(자동): `pnpm test` green.

## T2 — `rootView` · `routes.home()`
- `lib/auth/landing.ts`에 `rootView`(맵 + `satisfies` 새로 적용)를 **추가만** 한다 — `landingTarget`과 `app/page.tsx`는 T7까지 그대로(교체하면 커밋 1이 컴파일 에러다).
- `lib/routes.ts`에 `routes.home()`.
- 검증(자동): `pnpm test` green — `rootView` 세 갈래(`ok` → `routes.projects()` 2026-09-10 결정 케이스 보존, `none`·`unavailable` → landing, 새 status가 컴파일 에러),
  `routes.home()`을 `routes.*` 대조 관용구(`landing.test.ts:14`)로.

**커밋 1** `feat(landing): stage math and root view decision`

## T3 — 랜딩 셸 (`components/landing/shell/`)
- 헤더(로고·`nav aria-label="Main"`·Home `aria-current`·`Get started`) · 패널(바깥 `<main>` 표면 + 안쪽 스크롤러 `tabIndex=-1` 포커스 `focus:outline-none`) · 푸터 · body 캔버스 배경 주입.
- 푸터 링크 목록 상수 하나를 `/signin` 푸터(`components/signin/auth-layout.tsx`)와 공유 — 순서 `GitHub · Privacy Policy · Docs`. GitHub URL 상수는 `lib/links.ts`(routes 밖).
- 검증(자동):
  - jsdom — `main` 1개, 마운트 후 `document.activeElement`가 스크롤러, CTA 문구·href `routes.signIn()`, 헤더 링크 셋(`routes.home()`·`routes.docs()`·GitHub) + Home `aria-current`,
    푸터 링크 순서가 `/signin` 푸터와 같다 · 기존 `/signin` 테스트 green.
  - 소스 — 루트 `h-svh min-w-[1280px] overflow-hidden`, 스크롤러 `overflow-y-auto`, 새 파일 raw 색 0(또는 `visual-system.test.ts` allowlist 갱신).

**커밋 2** `feat(landing): landing shell and shared footer links`

## T5 — 목업 씬 DOM (`components/landing/mockup/`, 서버 컴포넌트)
- 1280×720 캔버스, 씬 ①~⑤의 정적 DOM. 앱 라벨은 기존 사전 키(design.md 목업 문구 절의 위치), 가상 데이터는 `m.landing.mockup`.
- 인터랙티브 태그 0 — 버튼 모양은 `buttonClass`를 `<span>`에.
- 검증(자동): jsdom — 루트 `aria-hidden`+`inert`, `button`·`a`·`input`·`textarea`·`select`·`[tabindex]` 0개 ·
  소스 — `components/landing/mockup/**`에 JSX 텍스트 노드(`>[A-Za-z]`)·문자열 prop 리터럴 0(`shell-layout.test.ts`의 readFileSync 형) ·
  `no-korean-ui`·`brand-spelling`·`terminology` green · 새 raw 색 0.

## T6 — 스테이지 (`components/landing/stage.tsx`, 클라이언트)
- 목업을 `children`으로 받고 타이핑 문자열만 prop. rAF + `frame()` → ref로 CSS 변수·`data-scene`·텍스트. `ResizeObserver`(스크롤러, 리사이즈 직전 q 보존) ·
  `matchMedia` reduced-motion(`change` 구독). `data-ready` 전엔 트랙 높이 패널 1개 · 씬 ① opacity 0. `will-change` 상시 금지. 캡션 visually-hidden `<ol>` + 보이는 캡션 `aria-hidden`.
- 검증(자동): jsdom(`vi.stubGlobal`로 `ResizeObserver`·`matchMedia`·rAF) —
  (1) 스크롤 p₁→p₂→p₁ 뒤 `data-scene`·CSS 변수·텍스트 동일 (2) reduced-motion `change` 토글 반영 (3) 리사이즈 콜백 뒤 배율 재계산
  (4) 언마운트 시 rAF 취소·리스너 해제 (5) 스크롤 여러 번에 React 렌더 횟수 불변(프레임당 setState 0) (6) `<ol>`에 캡션 다섯 · 보이는 캡션 `aria-hidden` ·
  `data-ready` 전 트랙 높이 접힘. `client-graph.test.ts` green.
- 검증(수동): 스크롤 내림/올림 재생 · 네 뷰포트 배율 실측(computed `transform`)이 수치표와 일치 · 2560에서 목업 텍스트 선명도 · reduced-motion 이산 · JS 끈 상태에서 빈 구간 없음.

## T7 — 랜딩 페이지
- `app/page.tsx`: `rootView` → redirect 또는 `<PublicShell>` + 히어로 + 스테이지 + 마무리 CTA. `metadata` 갱신. `landingTarget` 제거 + `landing.test.ts`의 `landingTarget` describe를 `rootView` 계약으로 교체.
- 낡은 주석 넷(`app/page.tsx:6-17` · `lib/auth/landing.ts:44-47` · `app/signin/page.tsx:25` · `entry-points.test.ts:18`)을 같은 커밋에서.
- 검증(자동): 새 page 테스트(`readSession` mock) — `ok` → `redirect("/projects")`, `none`·`unavailable` → `main` 1개 + 랜딩 헤딩 + CTA href `/signin` ·
  `terminology`·`no-korean-ui`·`brand-spelling`·`entry-points` green · `pnpm typecheck && pnpm test && pnpm build` ·
  **`pnpm test:credentials:postgres`**(로컬 PG17 전제 — POSTMORTEM 2026-09-10. 해석: `location` 값 불변, 뜻은 `ok → /projects` 유지).
- 검증(수동, build 뒤 dev 재시작): 로그아웃 → 랜딩 착지 · 키보드(Space/PageDown)만으로 끝까지 · 1280 이상에서 문서 스크롤 0·활성 스크롤러 하나.

**커밋 3** `feat(landing): hero, scroll-driven mockup stage and closing CTA`

## T8 — 시안 대조
- `/design-sync` — computed style + CDP 접근성 트리, 네 뷰포트, `/`.
- 검증(sync): 불일치 0 · 목업 프레임 서브트리가 접근성 트리에서 빠짐 · 섹션 이름(`aria-labelledby`/`aria-label`) · 헤더 `aria-current`.

## T9 — 정본 문서 (문서별 커밋)
- `docs(DESIGN)`: 랜딩 절 + §4 weight 600 · `docs(PRODUCT)`: §7.7 `/` 행 · 로그아웃 문장 · `:554-558` 문단 ·
  `docs(ARCHITECTURE)`: `:2071` `/` 착지 판정 · `docs(DIRECTORY)`: 새 디렉터리·파일 + `:11` + `lib/landing/` vs `lib/auth/landing.ts`.
- 기능 종료 시 `docs/features/landing/` 삭제.
- 검증: `/push` 4단계 문서 신선도 통과.
