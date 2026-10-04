# color-scheme — 태스크

**선행(고정 순서, 2026-10-04 사용자): ui-locales → user-timezone → color-scheme.**
Phase 1은 ui-locales의 E 배치(화면 파일 이관)와 W10(`globals.css`·Preferences)이 dev에 들어간 뒤, 그리고 user-timezone이 dev에 들어간 뒤 착수한다.
**착수 게이트**(spec 순서 절): `git ls-tree -r origin/dev --name-only`에 `app/(edit)/preferences/` · `messages/es.tsx` · `messages/ko-privacy.tsx`가 있고, `prisma/schema.prisma`의 `User`에 user-timezone 컬럼이 있다. 2026-10-04 리뷰 시점엔 넷 다 없다.
착수 직전에 design §2.2 "소비 자리"를 `git grep`으로 다시 뽑는다 — 앞 두 기능이 파일을 옮기거나 쪼갰을 수 있다. 아래 "깨지는 테스트" 목록도 같이 다시 뽑는다(`git grep -nE '(amber|green|red|blue|teal|violet|neutral)-[0-9]{2,3}|bg-white|bg-foreground/(32|40)' -- '*test*'`).

커밋 경계는 `──` 줄이다. 각 경계에서 `pnpm gate` green. `[수동]`은 커밋 경계의 게이트가 아니다 — 그 확인은 적힌 자리(P1-4 표본 대조 · P2-7)에서 한다.

## Phase 1 — 의미 토큰 (라이트 화면 변화 0, 단독으로 dev 배포 — spec 결정 "Phase 1 단독 가치 있음")

### P1-0 기준값 캡처 + 스파이크 (코드 커밋 없음) ✅ Q0 · A

- **이관 전 라이트 기준값**: 로컬 `pnpm dev`(이관 전 커밋)에서 대표 화면 × 요소 — Badge 셋 · Alert 넷 · IconTile · Logs 칩 셋 · Logs 상세 빈 값 상자 · Publish diff(`+`·`-` 기호·낱말 면) · 번역 화면 상태 글자(`Needs review`·`Not saved`) · Meter 검토 구간 · 기준 언어 Select 대기 테두리 · 아바타·썸네일 식별색 · Dialog·LargeModal 오버레이 · 로그인 패널 면 — 의 computed `color`·`background-color`·`border-color`를 `.scratch/color-baseline.json`에 기록한다(ego-browser CDP). 이후 커밋엔 옛 상태가 로컬에 없으므로 **P1-1 전에** 한다.
  - 검증: `[수동]` 파일이 있고 위 요소마다 값이 있다.
- **팔레트 변수 출력 스파이크**(design §2.1): `.scratch/`의 임시 브랜치에서 `app/globals.css` `:root`에 **어느 유틸도 쓰지 않는 팔레트 변수**(`--x: var(--color-lime-300)` · `color-mix(in oklab, var(--color-lime-200) 80%, transparent)`)를 넣고 `pnpm build`.
  - 검증: `[수동]` `.next/static/css`에 `--color-lime-300`·`--color-lime-200` 정의가 있다. 없으면 폴백 `@theme static`으로 design §2.1을 고친다. 판정을 design §2.1에 적는다.

### P1-1 토큰 + 프리미티브 이관 (TDD red 먼저 — 한 커밋) ✅

토큰은 소비자를 이관하는 커밋에서 같이 더한다 — `globals-css.test.ts:110-121`이 소비자 없는 `@theme` 색을 red로 잡는다(design §2.3).

- 테스트 먼저(red):
  ① `globals-css.test.ts`: 이 커밋의 새 토큰이 `:root`에 있고 라이트 값이 design §2.2 "옮겨 온 값"과 문자열로 같다(상수 표) ② `@theme inline`에 팔레트 별칭(`var(--color-<hue>-<n>)`)이 없다 ③ 그림자 둘이 `--shadow-color`를 지난다 — `--shadow-color`는 `UNREGISTERED`(:164)에 이유와 함께. `:root` 색 변수마다 `@theme` 등록을 세는 검사는 기존 :164를 재사용한다.
  ④ `spelling-equivalence.test.ts`의 `compile()`로 새 유틸(`bg-success-soft` · `text-warning-foreground` · `border-warning-emphasis/50` · `bg-scrim/40` 등)이 생성되고 옛 철자와 같은 값인지.
- `app/globals.css`: 프리미티브가 소비하는 토큰 — `success-surface/soft/foreground` · `warning-surface/soft/soft-foreground/foreground/emphasis` · `danger-surface` · `info-surface` · `hue-*` 8 · `on-hue` · `scrim` · `shadow-color` — 를 더하고 `link`·`gray-*` 별칭을 `:root`로 내린다.
- 프리미티브 이관: `components/ui/{alert,badge,icon-tile,row-card,meter,avatar,project-thumbnail,dialog,large-modal}.tsx` · `components/ui/tone.ts` → 새 철자. 오버레이 리터럴 둘(`dialog.tsx:160` `/40` · `large-modal.tsx:13` 상수 `/32`)은 `bg-scrim/…`. `REGISTERED`에서 이 파일들의 줄을 걷는다(안 걷으면 "소비자 0 줄" 검사 red).
- `visual-system.test.ts`:
  - 카나리아(:146 `found.length > 50`)를 **픽스처 문자열 카나리아**로 바꾼다(`"bg-amber-100/80"`이 잡히는지) — 지금 적중 52곳이 이 커밋에서 26곳으로 줄어 red가 된다.
  - raw 리터럴 가드 셋을 새 철자로: :246-248 아이콘 색 허용 목록 · :288 "Alert 배경 넷이 그 파일 밖에 서지 않는다"(→ `bg-*-surface`) · :632-649 IconTile 덮어쓰기 금지.
- 깨지는 테스트를 새 철자로(착수 때 다시 뽑는다): `alert.test.tsx:29-30` · `icon-tile.test.tsx:31,33` · `badge-button-contract.test.tsx:15-16` · `status-badges.test.tsx:21-24` · `logs-events.test.tsx:279-284` · `row-card-contract.test.tsx:15` · `project-row.test.tsx:218,228` · `parallel-p2-meter-error.test.tsx:17` · `projects-screen.test.ts:228` · `avatar.test.tsx:76-80` · `image-tile-contract.test.tsx:52` · `hue.test.ts:7-11` · `changelog-page.test.tsx:134-135` · `app/(edit)/account/__tests__/structure.test.tsx:222` · `sync-result.test.tsx:168,176` · `translation-workspace-connection.test.tsx:169`(정규식 `bg-(muted|amber-50)`) · 오버레이 `logs-screen.test.ts:198` · `mcp-token.test.tsx:240` · `parallel-p2-modal.test.tsx:17` · `link` 리터럴 `app/__tests__/screens.test.ts:300`. `status-badge.test.tsx:129`는 픽스처라 그대로.
  - 검증: `pnpm test` green(①–④ 포함).

──

### P1-2 화면 이관 + 나머지 토큰 (한 커밋) ✅

- `app/globals.css`: 화면만 소비하는 토큰 — `diff-removed` · `diff-added` · `kind-{blue,teal,violet}`(+`-surface`) · `subtle`(→ `surface-subtle`, RA 🟡2) — 을 더하고 P1-1 ① 상수 표에 잇는다.
- 이관: `components/logs/{glyph,event-detail}.tsx` · `components/publish-button.tsx`(diff `+` 기호는 `diff-added` — design §2.2) · `components/landing/mockup/{publish,translations,app-frame}.tsx`(app-frame 오버레이 `bg-scrim/32`) · `components/home/count-cards.tsx` · `components/translations/workspace/{key-list,locale-panel,workspace}.tsx` · `components/sources/base-language-form.tsx` · `components/signin/auth-layout.tsx`(`bg-white` → `bg-background`).
- 깨지는 테스트: `publish-button.test.tsx:402` · `signin-screen.test.ts:97`(`bg-white`).
  - 검증: `pnpm test` green · `REGISTERED`가 빈 표.

──

### P1-3 "raw 0" 고정 ✅

- `visual-system.test.ts`: `REGISTERED`와 그 두 검사를 지우고 **생산 소스 raw 팔레트 0** 검사를 `ALL_SOURCES`(app·components·lib·messages)로 돌린다(기본 `SOURCES`는 app·components뿐).
- 색 리터럴 검사: 생산 소스(주석 제외)의 hex·`rgb(`·`hsl(`·`oklch(`가 `components/signin/brand-icons.tsx`·`lib/invitation-email/**` 밖에서 0.
- scrim 검사(완료 조건 5): 생산 소스의 `bg-foreground/(32|40)` 0.
- `dark:` 0곳 소스 검사(완료 조건 15 — 지금은 `resizable.test.tsx:118` 한 파일만 본다. 전수로 넓힌다. 지금도 0이라 바로 green).
  - 검증: `pnpm test` green · 일부러 `text-amber-700` 한 줄을 넣으면 red(로컬 확인만, 커밋 안 함).

──

### P1-4 정본 갱신 + 라이트 무변화 확인 ✅ (문서 A · 대조 Q1 — 53항목 일치)

- `docs/DESIGN.md`: §2 토큰 표에 새 토큰 · §2.4 톤 표의 클래스 열 · §6.2 "등재 raw 색" 절을 **의미 토큰 표**로 바꾼다(`REGISTERED`가 사라졌다는 사실과 새 검사 이름). "흑백 둘과 남의 자산" 절은 Google 로고·초대 메일만 남긴다.
- `docs/DIRECTORY.md`: 변경 없음 확인(새 파일 없음).
- 라이트 무변화: P1-0의 `.scratch/color-baseline.json`과 같은 화면 × 요소의 computed 값을 대조한다(자리별 오매핑은 이 대조만 잡는다 — spec 완료 조건 4).
  - 검증: `[수동]` 전 요소 일치를 이 파일에 기록한다(어긋나면 그 자리의 토큰 선택이 틀렸거나 P1-1 ① 상수가 틀린 것이다).
- `/push` → dev. **Phase 1은 여기서 끝나도 제품이 성립한다.**

──

## Phase 2 — 컬러 스킴

### P2-pre 통합 뒤 재대조 (코드 커밋 없음) ✅ B

- ui-locales·user-timezone이 dev에 들어간 뒤, 그 실물로 design §3.6(`setUiLocale` 처리 순서) · §3.7(공용 Select 카드 조립의 유무와 API · Language 카드 국기의 트리거 복제 규칙 · DESIGN §6.4 문안) · §4.3(방침의 쿠키 문장)을 다시 대조하고 어긋나면 design을 먼저 고친다.
  - 검증: design §3.6·§3.7·§4.3에 대조 일자와 결과 한 줄이 있다.

### S. 다크 시안 (P2-3 전에 — `/design-sync` 입력)

- S1 ✅ [`design-brief.md`](./design-brief.md)(2026-10-04, 리뷰 반영) — 토큰 표(다크 칸 비움) · 대표 화면 A1–A15 · Theme 카드 B1–B6 · 대비 하한 · 열린 질문 일곱.
  ⚠️ Phase 1 착수 때 토큰 이름이 바뀌면 브리프 §3도 같이 고친다(시안이 이미 나왔으면 핸드오프 표의 이름을 옮긴다).
- S2 ✅ 다크 시안 확정(2026-10-05) — 핸드오프 `design_handoff_color_scheme`(A1–A15 · B1–B6 · 토큰 표). 피드백 1차는 [`design-brief-feedback-1.md`](./design-brief-feedback-1.md). 시안이 바꾼 항목과 열린 결정 판정은 design §3.8. ⚠️ **기존 화면의 design-sync는 사용자 승인 예외**(spec 결정)임을 orch·DESIGN 기록에 남긴다.

### P2-0 스파이크 (코드 커밋 없음 — 결과를 design §3.1에 적는다) ✅ C

판정은 `next build` 산출 CSS(`.next/static/css`)와 브라우저 computed 값으로 한다.
- ① `bg-<token>/50`이 `light-dark()` 값에서 올바른 알파 색이 되는가 ② `color-mix(… var(--color-…) …)`를 품은 `light-dark()`가 Chrome·Safari·Firefox 최신에서 계산되는가 · 산출 CSS에서 `light-dark()`가 그대로인가(`--lightningcss-light/dark` 폴리필로 바뀌었는가) ③ `getComputedStyle`이 사용자 정의 속성에서 선언 문자열을 돌려주는가 · `color: var(--signin-dot)` 요소의 계산된 `color`는 rgb인가 ④ 토스트의 계산된 `background`·`border-color`·`color`가 토큰 값인가 — 묶는 규칙의 자리(`globals.css` 특이도 vs `Toaster style`)를 고른다.
  - 검증: `[수동]` ①–③ 다 통과면 `light-dark()` 형, 하나라도 실패면 두 벌 블록 형 + "두 블록이 같은 토큰 집합" 검사로 설계를 고친다. ④의 선택을 design §3.5 Toaster 행에 적는다.

### P2-1 순수 함수 (TDD — `/tdd interface`) ✅ B

- `lib/color-scheme/scheme.ts`: `COLOR_SCHEMES` · `parseColorScheme` · `resolveColorScheme`(쓰기 계획 함수 없음 — design §3.3). 테스트:
  - `parseColorScheme`: `__proto__`·`constructor`·`toString`·`""`·`"Dark"`·`"blue"`·숫자·`null` 불통과.
  - `resolveColorScheme`: account 유효 → account(쿠키보다 우선) · account 무효(`"blue"`) + cookie 유효(`"dark"`) → `dark` · 둘 다 null → `light` · OS 입력 없음(시그니처).
- 테스트 헬퍼 `oklchToSrgb` · `contrastRatio` · `readThemeTokens`(design §3.3). 테스트: v4 oklch 변환 기대값(예: `amber-800` ≈ `#973c00`, 색역 밖은 sRGB 클립) · 리터럴 `hsl()`·`rgb()` 파싱 · DESIGN 라이트 수치 재현은 리터럴 토큰 쌍으로(4.75 · 4.83 · 2.54 · 4.34).
- `gray-dim` 글자의 수용 근거를 DESIGN에서 확인해 §4.4 쌍 목록 또는 예외 상수로 정한다(design §4.4).
  - 검증: `pnpm test` green.

──

### P2-2 스키마 (`/db`) ✅ B · dev DB 적용(prod는 /merge)

- `User.colorScheme String?` + 마이그레이션 1개(additive). 세션 허용 목록·타입 넷(design §4.1) · `read-session.test.ts` 모양.
- **배포 순서**: dev 적용은 `/db`(이 커밋을 `/push`하기 전) → dev `has_schema_privilege` false. prod는 `/merge` 1단계의 `pnpm db:deploy` + prod `has_schema_privilege` false. ⚠️ 이 커밋부터 세션 읽기가 `colorScheme`을 싣는다 — prod 반영을 빠뜨리면 프로덕션의 모든 세션 읽기가 실패한다. 리셋 제안은 받지 않는다.
  - 검증: `pnpm db:status` 적용됨 · dev `has_schema_privilege` false · `pnpm test` green.

──

### P2-3 다크 값 + 루트 레이아웃 + 토스트 (한 커밋 — 값 없이 속성만 들어가면 System 사용자가 빈 다크를 본다) ✅ C

- `app/globals.css`: 모든 색 변수를 `light-dark(<라이트>, <시안 다크>)`로 · `color-scheme` 세 줄은 **본문 `:root {` 블록 뒤에**(design §3.1 — `globals-css.test.ts:107` 정규식) · 다크 값은 핸드오프 README §5 표 그대로(design §3.8) · 비색 값 블록은 없다(OpenAI 흰 판은 두 테마 같다 — design §3.5).
- sonner 변수(`--normal-bg/border/text`)를 `popover`·`border`·`foreground`에 묶는 규칙(P2-0 ④에서 고른 자리) · `[data-description]` 글자색도.
- `lib/color-scheme/server.ts` `getColorScheme()` · `app/layout.tsx` `<html data-theme>` + `<Toaster theme={colorScheme}>` · 레이아웃 머리 주석("`theme="light"`가 필수다") 갱신.
- 대비 검사(완료 조건 12): design §4.4 쌍을 두 테마에서 계산 — 수용 예외 넷은 실측 수치 + DESIGN 절 상수.
- `globals-css.test.ts`: 모든 색 변수가 `light-dark(`를 쓴다(테마 불변으로 등재한 것 제외 — `on-hue` 등) · 라이트 쪽 값이 P1-1 ① 상수와 같다(Phase 1 회귀 방지) · `--signin-dot`은 여전히 `@theme` 미등록(`UNREGISTERED`).
- 소스 검사(완료 조건 17): `app/global-error.tsx`가 `globals.css`를 import하지 않고 `data-theme`이 없다 · 초대 메일의 `color-scheme: light` 메타 유지.
  - 검증: `pnpm test` green. `[수동]`(P2-7로): 쿠키를 손으로 `dark`로 넣은 로컬에서 첫 페인트부터 다크.

──

### P2-4 화면 밖 자산 ✅ C

- Malmoi 로고: 7곳 import를 `components/ui/malmoi-mark.tsx`(토큰 fill 인라인 SVG — design §3.5)로 모은다 — 기존 사본 이관이므로 같은 커밋에서 7곳 전부. DOM 테스트: 면 path는 `fill-foreground`, 마크 path는 `fill-background`(또는 `var(--…)`) · `aria-hidden` · `<img>`·`next/image` 없음.
- OpenAI 로고: 원본 검정 마크를 두 테마 같은 흰 판 위에 — `mcp/connected-apps-card.tsx`의 로고 칸 둘, OpenAI만(design §3.5). 새 자산 없음. 색 리터럴 허용 목록에 그 자리를 더하고, `IconTile` 덮어쓰기 금지·raw 0 검사와 부딪히지 않는 길을 고른다.
- LargeModal 윤곽: `LARGE_MODAL_PANEL`에 `border border-border`(design §2.2 — Dialog와 맞춘다). `components/ui/__tests__`의 large-modal 단언 확인.
- `components/signin/dot-field.tsx`: `style={{ color: "var(--signin-dot)" }}` 요소의 계산된 `color` 읽기 + System의 `matchMedia` `change` 구독(`globals-css.test.ts:119-120`의 직접 소비자 검사가 그대로 green).
  - 검증: `pnpm test` green. `[수동]`(P2-7로): OS 다크 토글 시 로그인 점 색이 따라감.

──

### P2-5 바꾸기 + Theme 카드 + 방침 (한 커밋 — 쿠키가 생기는 커밋에서 방침이 참이어야 한다) ✅ E

- `app/(edit)/preferences/actions.ts` `setColorScheme`(design §3.6) — Action 갈래 테스트: invalid · 세션이 `ok`가 아니면 아무것도 안 쓰고 `failed`(redirect 없음 — 형제 `setTimeZone` 형, 2026-10-05 지휘자 판정) · DB 실패 시 쿠키 미기록 + `failed` · 성공 시 **세션 userId로** 계정 갱신 + 쿠키(입력에 userId 없음) · 쿠키 속성(`httpOnly`·`SameSite=Lax`·`secure`는 `x-forwarded-proto` 첫 항목이 `https`일 때 — `app/ui-locale/actions.ts` 실물 그대로 · `Path=/`·1년) · 커밋 뒤 `revalidateAfterCommit` 오류여도 `ok` · `revalidateAfterCommit("color-scheme")` 호출 인자.
- Theme 카드(design §3.7) — 공용 Select 카드 조립 위에. DOM 테스트: 즉시 적용 · Action 전에 `<html data-theme>`이 바뀜 · 실패 시 `data-theme`과 Select가 원래 값 + Alert · 같은 값 무요청 · 닫힌 트리거 typeahead 차단 · busy 중 포커스 유지. `preferences/loading.tsx` 골격에 셋째 카드.
- `client-graph.test.ts` `CLIENT_LIB_FILES`(:96-215, 정확 일치)에 `lib/color-scheme/scheme.ts` 등재 — 클라이언트 카드가 `COLOR_SCHEMES`를 import하는 이 커밋에서. ARCHITECTURE 잎 명부도 같이.
- `messages/{en,ko,es}.tsx` 새 키 · DESIGN §10.1 ko·es 열.
- `lib/privacy/collected.ts` · 방침 en·ko 본문 · 개정 이력 · 시행일.
  - 검증: `pnpm test` green(`policy-gate`·사전 정합·`client-graph` 포함) · `pnpm typecheck` green.

──

### P2-6 정본 갱신

- `docs/DESIGN.md`:
  - §3 전면 재작성("다크는 토큰 값이 든다 — `dark:` 금지", `light-dark()`·`data-theme`·지원 브라우저 하한) · §3.2 삭제 · §2 표에 다크 값 열 · §2.1·§2.2의 대비 수치에 다크 열.
  - 대비 수용 예외에 **아바타 이니셜**(식별색 위, 라이트 최저 3.19) 등재.
  - §4.5 팝오버 그림자: "다크에서 층은 `popover` 면 단계 + `border`가 만든다".
  - §6.25 토스트: sonner 변수를 토큰에 묶는 방식(`classNames`만으로는 sonner CSS에 진다는 사실 포함).
  - §6.4 즉시 적용 예외: "이 예외를 다른 설정으로 넓히지 않는다"를 **"`/preferences`의 개인 설정 카드"**로 범위를 다시 정의(user-timezone이 먼저 고쳤으면 확인만).
  - §6.625(메일 라이트 고정 유지 명시) · 빠른 체크리스트("새 색은 토큰 + 두 테마 값").
- `CLAUDE.md` 스택 표 "라이트 단일, `dark:` 금지" → "라이트·다크 — 토큰이 든다, `dark:` 금지" · "린터·다크모드·…는 없다"에서 다크모드 삭제 · `@custom-variant` 경고의 근거 문장 · 토스트 행("루트 레이아웃이 렌더하는 유일한 서드파티 UI")에 테마 전달. → `pnpm sync:agents`.
- `docs/PRODUCT.md`: 지금 PRODUCT에 `/preferences`도 개인 설정 절도 없다(사용자 설정은 :310 계정 설정뿐). ui-locales가 개인 설정 절을 만들었으면 거기에 테마 한 줄, 안 만들었으면 **이 태스크가 절을 만든다**(Language·Time zone·Theme) · IA의 `/preferences` 설명.
- `docs/ARCHITECTURE.md`: 개인정보·쿠키 절(있으면)에 `malmoi-color-scheme`.
- `docs/DIRECTORY.md`: `lib/color-scheme/` · `components/ui/malmoi-mark.tsx` · 새 로고 파일.
- `guide/`: Preferences 페이지에 Theme 절(en·ko·es 같은 커밋 — `/guide`). 스크린샷은 라이트(비목표).
  - 검증: `pnpm gate` green · `/push` 4단계 신선도 통과.

──

### P2-7 검증

- `/design-sync` — S2 핸드오프 대비 대표 화면을 다크에서 computed style + CDP로 대조.
- `/runtime-test` — **전 화면 × Light·Dark·System(OS 다크)**: 첫 페인트부터 고른 테마(깜빡임 없음) · Theme 카드 선택 즉시 전환 · 다른 기기 로그인 시 계정 값 · 로그아웃 뒤 공개 페이지에 쿠키 값 · 네이티브 컨트롤 · Malmoi·에이전트 로고 · 키비주얼 · 토스트 면·테두리·글자가 토큰 값(완료 조건 19) · 오버레이 · 포커스 링 가시성 · OS 다크 토글 시 로그인 점 · 가이드 스크린샷이 다크 본문에서 읽히는지(변경 없음 확인) · `public-shell`·`auth-layout`의 `<style>{body{background-color:var(--canvas)}}`가 다크 값을 받는지.
  - 검증: 두 리포트의 🔴 0, 결함은 BugShot 이슈.
- 끝나면 결론을 정본으로 올렸는지 확인하고 `docs/features/color-scheme/`을 지운다.
