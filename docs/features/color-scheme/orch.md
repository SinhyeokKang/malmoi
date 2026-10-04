# color-scheme — 지휘 계획 (orch)

원본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md). 이 문서는 원본을 복제하지 않는다 — 태스크 ID(P1-1·P2-3…)는 tasks.md를 가리킨다.

- 착수: 2026-10-05 · 시작 dev `ec081f63`
- 끝: dev까지. `/merge`(prod `db:deploy` — `colorScheme` 마이그레이션. ui-locales `uiLocale` · user-timezone `timeZone` 뒤 순서)는 사용자가 부른다.
- 지휘자 런타임: Claude Code → 워커는 **Claude Code / Opus 5.5·Sonnet 5.5, effort ≤ high**. 패밀리 교차 허가 없음.

## P0 결과 (지휘자, 2026-10-05)

- 착수 게이트(spec·tasks) 충족: origin/dev에 `app/(edit)/preferences/`(Language·Time zone 카드) · `messages/es.tsx` · `messages/ko-privacy.tsx` · `User.timeZone`(schema.prisma:576).
- user-timezone이 공용 조립 `components/preferences/preference-select-card.tsx`를 뽑았다 → design §3.7의 "없으면 이 카드에서 뽑는다" 갈래는 닫힘. Theme 카드는 그 위에 조립한다(대조 확정은 B의 P2-pre).
- 다크 시안 핸드오프 `design_handoff_color_scheme`은 **로컬 파일로 없다** — C 착수 전에 지휘자가 DesignSync로 확보해 `.scratch/color-scheme/handoff/`에 두고 C·Q2 브리프가 그 경로를 가리킨다.
- Orca에 malmoi 워크트리 잔재 없음.

## 결정 기록

| # | 결정 | 근거 |
|---|---|---|
| D1 | **기존 화면 `/design-sync`는 사용자 승인 예외**다 — 다크 시안 대상 화면(A1–A15 · B1–B6)을 Q2가 프레임 단위로 대조한다 | spec 결정 "다크 값의 출처" · tasks S2 |
| D2 | 스키마: B가 **DB 없이** `prisma migrate diff`로 SQL만 만든다(연결하지 않는 더미 `DIRECT_URL` — 없으면 빈 출력 + exit 0). dev DB 적용·`has_schema_privilege` 확인은 지휘자가 통합 때 한다 | orchestrate §1 |
| D3 | **Phase 1은 단독으로 dev에 push**한다(A 통합 직후). Phase 2 배치는 그 뒤 dev에서 갈라진다 | spec 결정 "Phase 1 단독 가치" |
| D5 | **gray-dim = 다섯째 대비 수용 예외**(흰 면 2.58 · canvas 2.39, DESIGN §6.2) — spec 12 "넷뿐" → "다섯뿐" | 2026-10-05 사용자 |
| D4 | P2-0 ②의 Safari·Firefox 계산은 워커 도구(ego-browser = Chromium)로 못 본다 → **미검증으로 리포트에 남긴다**(Chromium + 산출 CSS 판정으로 진행). 사용자가 직접 볼지는 최종 리포트에서 묻는다 | 지휘자 판단 — 도구 부재를 통과로 취급하지 않는다 |

## 배치

| 배치 | 태스크 | 모델·effort (이유) | 선행 | 소유 파일(주) | 상태 |
|---|---|---|---|---|---|
| **Q0 기준값** | P1-0 기준값 캡처(`.scratch/color-baseline.json`) | Sonnet 5.5 medium — 측정 목록이 tasks에 고정, CDP computed 읽기 | — (**A 통합 전에 끝나야 한다** — 옛 상태가 로컬에서 사라진다) | 없음 — main 체크아웃, 산출물 `.scratch/` | 대기 |
| **A Phase 1** | P1-0 팔레트 스파이크 · P1-1 · P1-2 · P1-3 · P1-4(DESIGN·DIRECTORY 문서만) | Opus 5.5 high — 오매핑 판단 · 가드 테스트 다수 재작성 · 카나리아 교체 · 스파이크 판정 | — | `app/globals.css` · `components/ui/{alert,badge,icon-tile,row-card,meter,avatar,project-thumbnail,dialog,large-modal}.tsx` · `components/ui/tone.ts` · tasks P1-2 화면 파일 · `components/__tests__/{visual-system,spelling-equivalence}.test.ts` · `globals-css.test.ts` · tasks의 "깨지는 테스트" 목록 · `docs/DESIGN.md`(§2·§2.4·§6.2) · design.md §2.1(스파이크 판정) | 대기 |
| **B 기반** | P2-pre · P2-1 · P2-2(SQL만) | Opus 5.5 medium — 잎 순수 함수 + 대비 헬퍼(oklch 변환) · 세션 허용 목록 넓히기는 앞 두 기능과 같은 자리 | — (A와 병렬) | `lib/color-scheme/scheme.ts` · `lib/color-scheme/__tests__/**`(helpers 포함) · `prisma/**` · `lib/auth/**` · `types/next-auth.d.ts` · `lib/privacy/collected.ts`(필드 등재가 typecheck에 묶이면) · design.md §3.6·§3.7·§4.3(P2-pre 대조 결과) | 대기 |
| **C 다크 값·자산** | P2-0 스파이크 · P2-3 · P2-4 | Opus 5.5 high — `light-dark()` 산출 CSS 판정 · 대비 쌍 두 테마 · sonner 특이도 · 로고 7곳 이관 | A·B 통합 + 핸드오프 확보 | `app/globals.css` · `app/layout.tsx` · `lib/color-scheme/server.ts` · `components/ui/malmoi-mark.tsx` + 로고 import 7곳 · `components/mcp/connected-apps-card.tsx` · `components/ui/large-modal.tsx` · `components/signin/dot-field.tsx` · `globals-css.test.ts` · `visual-system.test.ts` · 대비 검사 테스트 | 대기 |
| **E 바꾸기·카드·방침** | P2-5 | Opus 5.5 high — Action 갈래 · DOM 선적용/롤백 · Radix Select 가드 재사용 · 방침 동형 게이트 | B 통합 (C와 병렬 — 파일이 갈린다. **통합은 C 뒤**) | `app/(edit)/preferences/**` · `components/preferences/**`(theme 카드 · 필요 시 `preference-select-card.tsx` 글리프 슬롯) · `messages/{en,ko,es}.tsx` · `messages/ko-privacy.tsx` · `app/privacy/**` · `lib/privacy/**` · `components/__tests__/client-graph.test.ts` · DESIGN §10.1 열 | 대기 |
| **D 정본** | P2-6 (+ `/guide` Theme 절 세 벌) | Opus 5.5 medium — 문서별 커밋, 사실 대조 | C·E 통합 | CLAUDE.md(+미러) · `docs/{DESIGN,PRODUCT,ARCHITECTURE,DIRECTORY}.md` · `guide/{en,ko,es}/**` | 대기 |
| **Q1 라이트 무변화** | P1-4 `[수동]` 대조(Q0 표본 ↔ Phase 1 dev) | Sonnet 5.5 medium — main 체크아웃 | A 통합·push | 없음(결과를 `.scratch/color-baseline.json` 옆 기록 · 어긋남은 BugShot `[A]`) | 대기 |
| **Q2 시안 대조** | P2-7 `/design-sync`(다크, D1 예외) | Opus 5.5 medium — main 체크아웃 | C·E·D 통합 | 없음(리포트·BugShot) | 대기 |
| **Q3 런타임** | P2-7 `/runtime-test` 전 화면 × Light·Dark·System(OS 다크) + 완료 조건 수동 항목 | Opus 5.5 medium — main 체크아웃, Q2 뒤 직렬 | Q2 | 없음(리포트·BugShot) | 대기 |
| 지휘자 | P0 · 핸드오프 확보 · 체크·통합 · dev DB 마이그레이션 · 결함 라우팅 · 기능 디렉터리 삭제 | — | 각 통합 시 | 이 문서 · tasks 체크 | — |

## 파일 겹침과 순서

- **1파(병렬)**: Q0(main 체크아웃, `pnpm dev`) · A(워크트리) · B(워크트리) — A는 `globals.css`·UI 프리미티브·화면, B는 `lib/color-scheme`·`prisma`·`lib/auth`로 겹치지 않는다.
  - ⚠️ Q0가 main 체크아웃에서 `pnpm dev`를 돌리는 동안 cherry-pick·build 금지 → **Q0 인계 뒤에 A·B를 통합**한다.
- A 통합·push(Phase 1 단독, D3) → **Q1**(main 체크아웃). B 통합(+ dev DB 마이그레이션)·push는 Q1 시작 전에 몰아서 한다.
- A·B 통합 → **C · E 병렬**(C = `globals.css`·레이아웃·자산, E = preferences·사전·방침 — 겹침 없음. `client-graph.test.ts`는 E만). **통합 순서 C → E**(값 없이 쿠키·카드만 들어가면 Dark를 골라도 빈 화면이다 — tasks P2-3 머리).
- C·E 통합 → **D**.
- 전부 통합 → **Q2 → Q3**(직렬) → 결함은 소유 배치(남아 있으면) 또는 새 워커로.
- 겹침 위험: A와 C가 `globals.css`·`visual-system.test.ts`·`large-modal.tsx`를 같이 고친다 → C는 A 통합 뒤에만 띄운다. 로고 import 7곳(C)이 A의 P1-2 파일(`signin/auth-layout.tsx` 등)과 겹칠 수 있다 — 같은 이유로 직렬이다.

## 검증 게이트

- 워커: `pnpm gate --base dev`(파이프로 거르지 않는다 — 끝줄 `gate: ok`) + 인계 문서 `.scratch/handoff-<batch>.md`(커밋 · 정확한 검증 결과 · 미완 · 계획과 다른 점 · 런타임 검증 목록은 (b)만).
- 리뷰: 배치마다 독립 리뷰 워커(Opus, 리포트 전용) — 런타임 목록 (a)/(b) 분류도 판정.
- 지휘자 통합: `git cherry-pick` → `pnpm gate` 끝줄 `gate: ok` → `git push`(dev).
- 마이그레이션(B): dev `pnpm exec prisma migrate deploy` → `db:status` → anon/authenticated `has_schema_privilege` false.
- 출시 차단: A(Phase 1 완료 조건 1–5) · C·E(완료 조건 6–19) · Q2·Q3 🔴 0. D는 `/push` 4단계 신선도.

## 진행 기록

(배치별 라운드·통합 해시·미완 항목을 여기에 덧붙인다.)
- 2026-10-05 계획 작성 → 사용자가 dev CI green · 클린 트리 확인 후 착수 지시(`ec081f63`).
- Run `run_28e3b25ee627`. 브리프 `.scratch/color-scheme/`. **A 착수**(Opus high, task_9e8324b99acc / ctx_0eead285f36b, `cs-a`) · **B 착수**(Opus medium, task_404cc9320c49 / ctx_b6cf19091b3a, `cs-b`) · **Q0 착수**(Sonnet medium, main 체크아웃, task_653e7d404b85 / ctx_64342ef125bb — 이 동안 cherry-pick·build 금지).
- 핸드오프 확보 실패: `DesignSync list_projects`에 design-system 프로젝트 둘만 보이고, 리포·`.scratch`·Downloads·Desktop에 `design_handoff_color_scheme` 링크·폴더 없음 → **사용자에게 시안 URL(또는 로컬 경로) 요청** — C·Q2 착수 전 필요.
- **Q0 완료**: `.scratch/color-baseline.json` 53항목(23그룹) · 재현 러너 `.scratch/q0-baseline.js`(클래스 비의존 선택자). 못 잰 것 8(alert info 실렌더 없음 · badge soft-red/text · icontile danger · hue 4종(rose·orange·teal·indigo) · 사이드바 16px 타일 · 랜딩 삭제 낱말 면 · logs 상세 Alert · checkbox 테두리) → Q1은 이 8건을 토큰 값 대조(P1-1 ① 상수)로만 본다. dev DB: acme-web 번역·미전송 원복, emails `declaredBaseLocale`이 `en`으로 남았을 수 있음(동작 무변화) · ProjectEvent 추가분 보존. Q0 해제.
- **B 완료**(4커밋 `a5a3ce89..98cff5a5`, gate ok): P2-pre 대조(공용 카드는 ReactNode 라벨로 글리프를 이미 받는다 · design §3.6을 형제 Action 실물대로 고침 — 세션 없으면 `failed`, `secure` = proto) · `scheme.ts` + 대비 헬퍼 · `User.colorScheme` SQL(`--from-migrations`가 shadow DB를 요구해 `--from-schema`로) · 세션 노출 · `COLOR_SCHEME_COOKIE` 상수. 열린 결정: gray-dim을 다섯째 대비 예외로(spec "넷뿐"). **RB 리뷰 착수**(Opus high, task_48f40c7caa43 / ctx_4d1fa0dbf3dd, `cs-b`). B는 수정 라운드용으로 유지.
- 지휘자 판정: §3.6(형제 Action 형)이 tasks P2-5의 "세션 없음 → requireUser redirect" 줄을 이긴다 — CLAUDE.md 데이터 변경 표의 `setTimeZone` 형과 같다. E 브리프에 반영.
- **D5**(2026-10-05 사용자): **gray-dim을 다섯째 대비 수용 예외로 등재** — DESIGN §6.2 기존 수용을 옮기는 것이라 화면 변화 0. spec 완료 조건 12 · design §4.4 갱신. C 대비 검사 상수에 실측 수치(2.58·2.39) + DESIGN 절.
- **RB 리뷰**: 🔴0 · 🟡2(tasks P2-5 테스트 줄이 고친 §3.6과 반대 · §4.3 대조가 방침 "수집 항목" 표·목적 목록을 빠뜨림 — 둘 다 계획 문서, 지휘자가 고침 `519f57cf`) · ⚪7(E 몫: `client-graph` 잎 단언 · `secure`는 proto 첫 항목 trim·소문자 · preferences actions 테스트 mock에 `colorScheme` / D 몫: DESIGN gray-dim v3 hex·2.5 → v4 `#a1a1a1` 2.58 / oklch chroma `%` 미지원은 입력에 없음). 사본 `.scratch/color-scheme/review-B.md`.
- **B 통합·push** `ec081f63..519f57cf`(cherry-pick 4 + 계획 문서 4). dev DB `20261004213608_add_user_color_scheme` 적용 · `db:status` 최신 · anon/authenticated USAGE·CREATE false · 테이블 GRANT 0 · Session⋈User 읽기 16행 정상. gate ok. CI run 37239249162 감시. B·RB 해제 · `cs-b` 워크트리 제거(인계 사본 `.scratch/color-scheme/handoff-B.md`).
- **A 완료**(4커밋 `e6440d53..c4cbb757`, 각 gate ok — P1-4 1회 postgres "동시 수락" 경쟁 플레이크 후 재실행 ok): 스파이크 = 팔레트 변수 출력됨(`@theme static` 불필요, 산출 CSS는 `.next/static/chunks/*.css`) · 의미 토큰 34 · raw 0/색 리터럴/scrim/`dark:` 0 검사 · DESIGN 의미 토큰 표. 계획과 다른 점 8(`--scrim` 리터럴 · `bg-link/[0.14]` 폴백 · 그림자 srgb color-mix · DESIGN 다른 절 철자 14곳 · 국기 SVG 남김 등). C 몫: `LIGHT`·scrim==foreground 단언을 `light-dark()` 첫 인자 비교로 · OpenAI 흰 판은 `COLOR_LITERAL_OWNERS`에. **RA 리뷰 착수**(Opus high, task_c2fe49642506 / ctx_2c895442cd80). A는 수정 라운드용 유지.
- **RA 리뷰**: 🔴0(자리별 오매핑 0 — 47쌍 정적 대조 · 위반 주입 15회 전부 red) · 🟡3: ① raw 0 검사가 `bg-[var(--color-…)]`·`text-(--color-…)`·`ring-offset-*` 등 사각 ② `--color-subtle`이 `border-subtle`을 살아 있는 다른 색으로 만듦 ③ design §4.4에 row-card BannerLine 쌍 누락(지휘자 고침 `df5a6b90`). ⚪: 불투명 폴백 범위(Firefox 111–112, 기존 형과 같아 수용) · CLAUDE.md:264·스킬 5곳 "raw 색 §6.2 등재" 문구 → **D 몫**. 지휘자 결정: `subtle` → **`surface-subtle`**. **A fix1 착수**(같은 터미널, task_bd51791ebd74 / ctx_19a0d0c3cbee, rebase dev 먼저). RA 해제.
