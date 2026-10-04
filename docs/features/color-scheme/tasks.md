# color-scheme — 태스크

**선행(고정 순서, 2026-10-04 사용자): ui-locales → user-timezone → color-scheme.**
Phase 1은 ui-locales의 E 배치(화면 파일 이관)와 W10(`globals.css`·Preferences)이 dev에 들어간 뒤, 그리고 user-timezone이 dev에 들어간 뒤 착수한다.
착수 직전에 design §2.2 "소비 자리"를 `git grep`으로 다시 뽑는다 — 앞 두 기능이 파일을 옮기거나 쪼갰을 수 있다.

커밋 경계는 `──` 줄이다. 각 경계에서 `pnpm gate` green.

## Phase 1 — 의미 토큰 (라이트 화면 변화 0, 단독으로 dev 배포 가능)

### P1-0 스파이크 (코드 커밋 없음 — 결과를 design §2.1에 적는다)

- `.scratch/`에서 `:root`의 `--x: var(--color-amber-800)` · `color-mix(in oklab, var(--color-amber-100) 80%, transparent)`가 빌드 CSS에 팔레트 변수와 함께 출력되는지 본다.
  - 검증: `pnpm build` 산출 CSS에서 `--color-amber-800` 정의가 있고, 브라우저 computed `color`가 이관 전 `text-amber-800`과 같은 값.

### P1-1 토큰 정의 + 검사 (TDD red 먼저)

- `globals-css.test.ts`·`visual-system.test.ts`에 먼저 쓴다(red):
  ① design §2.2 표의 새 토큰이 `:root`에 있고 라이트 값이 "옮겨 온 값"과 문자열로 같다 ② `:root`의 색 변수마다 `@theme inline` 등록이 있다
  ③ `@theme inline`에 팔레트 별칭(`var(--color-<hue>-<n>)`)이 없다 ④ 그림자 둘이 `--shadow-color`를 지난다.
- `app/globals.css`에 토큰을 더하고, `link`·`gray-*` 별칭을 `:root`로 내린다. 아직 소비자는 옛 클래스 그대로다(둘이 공존).
  - 검증: `pnpm test` green · 빌드 CSS에서 `bg-success-soft` 등 유틸이 생성됨(`pnpm build` 뒤 `.next/static/css` grep — 클래스 하나 쓰는 임시 파일 없이 `@source inline`이 아니라 실제 소비가 생기는 P1-2 뒤에 확인해도 된다).

──

### P1-2 이관 — 프리미티브

- `components/ui/{alert,badge,icon-tile,row-card,meter,avatar,project-thumbnail,dialog,large-modal}.tsx` · `components/ui/tone.ts` → 새 철자. `bg-foreground/32·/40` 오버레이 셋은 `bg-scrim/32·/40`.
- 프리미티브 DOM 테스트의 클래스 기대값을 새 철자로 고친다(`status-badge.test.tsx` 등).
  - 검증: `pnpm test` green · `REGISTERED`에서 이 파일들의 줄이 빠짐(빠뜨리면 "소비자 0 줄" 검사가 red).

──

### P1-3 이관 — 화면

- `components/logs/{glyph,event-detail}.tsx` · `components/publish-button.tsx` · `components/landing/mockup/{publish,translations,app-frame}.tsx` · `components/home/count-cards.tsx` · `components/translations/workspace/{key-list,locale-panel,workspace}.tsx` · `components/sources/base-language-form.tsx` · `components/signin/auth-layout.tsx`(`bg-white` → `bg-background`).
  - 검증: `pnpm test` green · `REGISTERED`가 빈 표.

──

### P1-4 "raw 0" 고정

- `visual-system.test.ts`: `REGISTERED`와 그 두 검사를 지우고 **생산 소스 raw 팔레트 0** 검사로 바꾼다. 카나리아는 픽스처 문자열(`"bg-amber-100/80"`가 잡히는지)로.
- 색 리터럴 검사: 생산 소스(주석 제외)의 hex·`rgb(`·`hsl(`·`oklch(`가 `components/signin/brand-icons.tsx`·`lib/invitation-email/**` 밖에서 0.
- `dark:` 0곳 소스 검사(완료 조건 15 — Phase 1에서 먼저 건다. 지금도 0이라 바로 green).
  - 검증: `pnpm test` green · 일부러 `text-amber-700` 한 줄을 넣으면 red(로컬 확인만, 커밋 안 함).

──

### P1-5 정본 갱신 + 라이트 무변화 확인

- `docs/DESIGN.md`: §2 토큰 표에 새 토큰 · §2.4 톤 표의 클래스 열 · §6.2 "등재 raw 색" 절을 **의미 토큰 표**로 바꾼다(`REGISTERED`가 사라졌다는 사실과 새 검사 이름). "흑백 둘과 남의 자산" 절은 Google 로고·초대 메일만 남긴다.
- `docs/DIRECTORY.md`: 변경 없음 확인(새 파일 없음).
- 라이트 무변화: `/runtime-test` 대신 **대표 화면 computed style 표본**(Badge 셋 · Alert 넷 · Logs 칩 · Publish diff · 번역 화면 상태 글자 · Dialog 오버레이)을 이관 전 dev와 비교한다.
  - 검증: 표본 값 일치 기록을 이 파일에 남긴다(어긋나면 P1-1 ① 상수가 틀린 것이다).
- `/push` → dev. **Phase 1은 여기서 끝나도 제품이 성립한다.**

──

## Phase 2 — 컬러 스킴

### S. 다크 시안 (P2-3 전에 — `/design-sync` 입력)

- S1 ✅ [`design-brief.md`](./design-brief.md)(2026-10-04) — 토큰 표(다크 칸 비움) · 대표 화면 A1–A15 · Theme 카드 B1–B6 · 대비 하한 · 열린 질문 일곱.
  ⚠️ Phase 1 착수 때 토큰 이름이 바뀌면 브리프 §3도 같이 고친다(시안이 이미 나왔으면 핸드오프 표의 이름을 옮긴다).
- S2 사용자가 Claude Design에서 다크 시안을 받는다 → 핸드오프 확보. ⚠️ **기존 화면의 design-sync는 사용자 승인 예외**(spec 결정)임을 orch·DESIGN 기록에 남긴다.

### P2-0 스파이크 (코드 커밋 없음 — 결과를 design §3.1에 적는다)

- ① `bg-<token>/50`이 `light-dark()` 값에서 올바른 알파 색이 되는가 ② `color-mix(… var(--color-…) …)`를 품은 `light-dark()`가 Chrome·Safari·Firefox 최신에서 계산되는가 ③ `getComputedStyle`이 사용자 정의 속성에서 선언 문자열을 돌려주는가 · `color: var(--signin-dot)` 요소의 계산된 `color`는 rgb인가.
  - 검증: 셋 다 통과면 `light-dark()` 형, 하나라도 실패면 두 벌 블록 형 + "두 블록이 같은 토큰 집합" 검사로 설계를 고친다.

### P2-1 순수 함수 (TDD — `/tdd interface`)

- `lib/color-scheme/scheme.ts`: `COLOR_SCHEMES` · `parseColorScheme` · `resolveColorScheme` · `planColorSchemeWrite`. 테스트: `__proto__`·`constructor`·`""`·`"Dark"`·숫자 불통과 · account > cookie > light · OS 입력 없음.
- 테스트 헬퍼 `oklchToSrgb` · `contrastRatio` · `readThemeTokens`. 테스트: Tailwind 문서 hex 대조 · DESIGN의 라이트 수치 재현(4.75 · 4.83 · 2.54 · 4.34).
- `client-graph.test.ts` 잎 목록·ARCHITECTURE 잎 명부에 `lib/color-scheme/scheme.ts`를 등재해야 하는지 확인(클라이언트가 import하지 않으면 불필요).
  - 검증: `pnpm test` green.

──

### P2-2 스키마 (`/db`)

- `User.colorScheme String?` + 마이그레이션 1개(additive). 세션 허용 목록·타입 넷(design §4.1) · `read-session.test.ts` 모양.
  - 검증: `pnpm db:status` 적용됨 · dev `has_schema_privilege` false · `pnpm test` green.

──

### P2-3 다크 값 + 루트 레이아웃 (한 커밋 — 값 없이 속성만 들어가면 System 사용자가 빈 다크를 본다)

- `app/globals.css`: `color-scheme` 세 줄 + 모든 색 변수를 `light-dark(<라이트>, <시안 다크>)`로. 비색 값(로고 전환)은 두 블록.
- `lib/color-scheme/server.ts` `getColorScheme()` · `app/layout.tsx` `<html data-theme>`.
- 대비 검사(완료 조건 12): §4.4 쌍을 두 테마에서 계산 — 수용 예외는 수치 + DESIGN 절 상수.
- `globals-css.test.ts`: 모든 색 변수가 `light-dark(`를 쓴다(테마 불변으로 등재한 것 제외 — `on-hue` 등) · 라이트 쪽 값이 P1-1 ① 상수와 같다(Phase 1 회귀 방지).
  - 검증: `pnpm test` green · 쿠키를 손으로 `dark`로 넣은 로컬에서 첫 페인트부터 다크(새로고침 · 깜빡임 없음).

──

### P2-4 화면 밖 자산

- 로고: 7곳 import를 `components/ui/brand-logo.tsx`(라이트·다크 두 `<Image>` + CSS 전환)로 모은다 — 기존 사본 이관이므로 같은 커밋에서 7곳 전부. DOM 테스트: 두 판이 다 렌더되고 alt는 하나만 읽힌다(다른 하나 `aria-hidden`).
- `openai.svg` 공식 흰 판을 `public/brand/agents/`에 추가 + `lib/mcp/brand.ts`가 두 판을 들고 화면이 전환. ⚠️ 공식 배포본 출처 URL을 머리 주석에 남긴다.
- `components/signin/dot-field.tsx`: 계산된 `color` 읽기 + System의 `matchMedia` `change` 구독.
  - 검증: `pnpm test` green · 로컬에서 OS 다크 토글 시 로그인 점 색이 따라감.

──

### P2-5 바꾸기 + Theme 카드 + 방침 (한 커밋 — 쿠키가 생기는 커밋에서 방침이 참이어야 한다)

- `app/(edit)/preferences/actions.ts` `setColorScheme`(design §3.6) — Action 갈래 테스트: invalid · 세션 없음 · DB 실패 시 쿠키 미기록 · 성공 시 계정+쿠키.
- Theme 카드(design §3.7) — DOM 테스트: 즉시 적용 · 같은 값 무요청 · 닫힌 트리거 typeahead 차단 · busy 중 포커스 유지 · 실패 시 원래 값 + Alert.
- `messages/{en,ko,es}.tsx` 새 키 · DESIGN §10.1 ko·es 열.
- `lib/privacy/collected.ts` · 방침 en·ko 본문 · 개정 이력 · 시행일.
  - 검증: `pnpm test` green(`policy-gate`·사전 정합 포함) · `pnpm typecheck` green.

──

### P2-6 정본 갱신

- `docs/DESIGN.md` §3 전면 재작성("다크는 토큰 값이 든다 — `dark:` 금지", `light-dark()`·`data-theme`·지원 브라우저 하한) · §3.2 삭제 · §2 표에 다크 값 열 · §2.1·§2.2의 대비 수치에 다크 열 · §6.4 즉시 적용 예외에 Theme · §6.625(메일 라이트 고정 유지 명시) · 빠른 체크리스트("새 색은 토큰 + 두 테마 값").
- `CLAUDE.md` 스택 표 "라이트 단일, `dark:` 금지" → "라이트·다크 — 토큰이 든다, `dark:` 금지" · "린터·다크모드·…는 없다"에서 다크모드 삭제 · `@custom-variant` 경고의 근거 문장. → `pnpm sync:agents`.
- `docs/PRODUCT.md`: §4.1 개인 설정에 테마 한 줄 · IA의 `/preferences` 설명.
- `docs/ARCHITECTURE.md`: 개인정보·쿠키 절(있으면)에 `malmoi-color-scheme` · 잎 명부(P2-1 판정대로).
- `docs/DIRECTORY.md`: `lib/color-scheme/` · `components/ui/brand-logo.tsx` · 새 로고 파일.
- `guide/`: Preferences 페이지에 Theme 절(en·ko·es 같은 커밋 — `/guide`). 스크린샷은 라이트(비목표).
  - 검증: `pnpm gate` green · `/push` 4단계 신선도 통과.

──

### P2-7 검증

- `/design-sync` — S2 핸드오프 대비 대표 화면을 다크에서 computed style + CDP로 대조.
- `/runtime-test` — **전 화면 × Light·Dark·System(OS 다크)**: 깜빡임 없음 · 다른 기기 로그인 시 계정 값 · 로그아웃 뒤 공개 페이지에 쿠키 값 · 네이티브 컨트롤 · 로고·에이전트 로고 · 키비주얼 · 토스트 · 오버레이 · 포커스 링 가시성.
  - 검증: 두 리포트의 🔴 0, 결함은 BugShot 이슈.
- 끝나면 결론을 정본으로 올렸는지 확인하고 `docs/features/color-scheme/`을 지운다.
