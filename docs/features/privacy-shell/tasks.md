# privacy-shell — 태스크

순서: 순수 함수 → 셸 이관(동작 불변) → 표 추출(동작 불변) → privacy 그릇 → TOC → 페이지 → 대조 → 문서.
검증 표기: **자동** = `pnpm test`/`typecheck` · **수동** = `pnpm dev` + ego-browser · **sync** = `/design-sync`. ⚠️ `pnpm build`를 `pnpm dev`와 겹치지 않는다.

## T1 — 순수 함수
- `lib/public-doc/toc.ts` `currentSection` · `lib/auth/landing.ts` `publicCta`(라벨 **키**를 돌려준다 — 잎 유지). 테스트 먼저.
- 케이스: `currentSection` — 첫 절 위(→0) · 경계 정확히(`offsetTop − 96 === scrollTop`) · 절 사이 · 마지막 절 아래 · 빈 배열 · NaN. `publicCta` — 세 갈래, `unavailable`이 Get started 쪽, href는 `routes.*` 대조.
- `CLIENT_LIB_FILES`는 소비자(T5)가 붙는 커밋에서 등재 — 여기선 잎 검사만(`lib/landing/stage.ts` 형).
- 검증(자동): `pnpm test` green.

**커밋 1** `feat(privacy): toc section and public CTA decisions`

## T2 — 셸 이관 (동작 불변)
- `components/landing/shell/` → `components/public-shell/`, `LandingShell` → `PublicShell({ cta, current, children })`, `data-landing-scroller` → `data-public-scroller`.
- 랜딩(`app/page.tsx`)은 `cta` = `publicCta("none")`, `current="home"` — 화면 결과가 전과 바이트 단위로 같아야 한다.
- 스테이지(`components/landing/stage.tsx`)의 `closest(...)`와 테스트(`landing-shell`·`landing-stage`·`landing-mockup`) 따라가기.
- 검증(자동): 기존 landing 테스트 전부 green(이름·경로만 바뀜) + 새 단언 — `current` 없으면 헤더에 `aria-current` 0, `cta`의 href·label이 그대로 선다.

## T3 — `DocTable` 추출 (동작 불변)
- `components/public-doc.tsx`의 표 분기를 `components/public-doc-table.tsx`로. `PublicDoc`이 그것을 쓴다.
- 검증(자동): `public-doc.test.tsx`·`docs-content.test.tsx`·`table-presets.test.ts` green, 변경 없음.

**커밋 2** `refactor(public-shell): share the landing shell and doc table`

## T4 — privacy 그릇 (`components/privacy/privacy-doc.tsx`, 서버)
- design.md "문서 그릇" 표대로. 본문 블록은 기존 사전(`m.publicDocs.privacy.sections`) 그대로, 표는 `DocTable`. TOC 자리(오른쪽 칸)는 T5가 채운다.
- `m.publicDocs.privacy.toc`(`On this page`)를 `sections` **밖**에 추가, `m.landing.shell.openMalmoi` 추가.
- 검증(자동): jsdom — h1 1개 · 절 일곱이 `aria-labelledby`로 이름 · 표 둘이 `role=region`+`tabIndex=0`+이름 · 본문 링크 blue-600 · 시행일 `<time dateTime>` · 복귀 링크 0 ·
  `policy-gate.test.tsx` green(개정 이력 요구 없음) · `no-korean-ui`·`brand-spelling`·`terminology`·`visual-system` green.

## T5 — TOC (`components/privacy/toc.tsx`, 클라이언트 잎)
- design.md "TOC 동작". `lib/public-doc/toc.ts`를 `CLIENT_LIB_FILES`에 등재.
- 검증(자동): jsdom(`vi.stubGlobal` — `matchMedia`·`ResizeObserver`·rAF) — (1) 링크가 `href="#id"` 일곱 (2) 스크롤 이벤트 뒤 현재 항목이 `currentSection` 결과와 같다— 현재 항목만 `aria-current="location"`(2026-09-26 지휘자 판정: 시각 강조와 같은 정보를 보조기기에 준다) (3) 클릭이 `scrollTo({ top: offsetTop − 48, behavior })` — reduced면 `auto` (4) 언마운트 정리 (5) `client-graph` green.

## T6 — 페이지
- `app/privacy/page.tsx`: `readSession` → `<PublicShell cta={publicCta(status)}>` + `<PrivacyDoc/>`. 주석 갱신(세션 = 헤더 primary).
- 검증(자동): 새 page 테스트(`readSession` mock) — `ok` → `Open Malmoi` `/projects`, `none`·`unavailable` → `Get started` `/signin` · `main` 1개 · `entry-points` green.
- 검증(수동, build 뒤 dev 재시작): 1280 이상 문서 스크롤 0 · Space/PageDown · TOC 강조·클릭 · `/privacy#cookies` 하드 진입 · 없는 해시 · 랜딩 푸터 → `/privacy` → 헤더 Home → 랜딩 · `/docs`가 전과 같다.

**커밋 3** `feat(privacy): public shell, reading frame and on-this-page nav`

## T7 — 시안 대조
- `/design-sync` — 1e, 1440×900 · 2560×1440, `/privacy`. computed style + 접근성 트리.
- 검증(sync): 불일치 0.

## T8 — 정본 문서 (문서별 커밋)
- `docs(DESIGN)`: §6.61 `/docs` 전용 · `/privacy` 공개 셸 절 · §6.615 셸 공용 서술 · 320px 규칙 범위. `docs(DIRECTORY)`: 옮김·신설 · "공용 공개 셸이 아니다" 삭제. `docs(PRODUCT)`: §7.7 `/privacy` 행(필요 시).
- 기능 종료 시 `docs/features/privacy-shell/` 삭제.
- 검증: `/push` 4단계 문서 신선도 통과.
