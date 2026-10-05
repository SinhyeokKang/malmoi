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
| D6 | **`muted-foreground`/`canvas` 라이트 4.38 = 여섯째 대비 수용 예외**(라이트 한정, 다크는 7.66 통과 — 값 불변) | 2026-10-05 사용자 |
| D4 | P2-0 ②의 Safari·Firefox 계산은 워커 도구(ego-browser = Chromium)로 못 본다 → **미검증으로 리포트에 남긴다**(Chromium + 산출 CSS 판정으로 진행). 사용자가 직접 볼지는 최종 리포트에서 묻는다 | 지휘자 판단 — 도구 부재를 통과로 취급하지 않는다 |

## 배치

| 배치 | 태스크 | 모델·effort (이유) | 선행 | 소유 파일(주) | 상태 |
|---|---|---|---|---|---|
| **Q0 기준값** | P1-0 기준값 캡처(`.scratch/color-baseline.json`) | Sonnet 5.5 medium — 측정 목록이 tasks에 고정, CDP computed 읽기 | — (**A 통합 전에 끝나야 한다** — 옛 상태가 로컬에서 사라진다) | 없음 — main 체크아웃, 산출물 `.scratch/` | 대기 |
| **A Phase 1** | P1-0 팔레트 스파이크 · P1-1 · P1-2 · P1-3 · P1-4(DESIGN·DIRECTORY 문서만) | Opus 5.5 high — 오매핑 판단 · 가드 테스트 다수 재작성 · 카나리아 교체 · 스파이크 판정 | — | `app/globals.css` · `components/ui/{alert,badge,icon-tile,row-card,meter,avatar,project-thumbnail,dialog,large-modal}.tsx` · `components/ui/tone.ts` · tasks P1-2 화면 파일 · `components/__tests__/{visual-system,spelling-equivalence}.test.ts` · `globals-css.test.ts` · tasks의 "깨지는 테스트" 목록 · `docs/DESIGN.md`(§2·§2.4·§6.2) · design.md §2.1(스파이크 판정) | 대기 |
| **B 기반** | P2-pre · P2-1 · P2-2(SQL만) | Opus 5.5 medium — 잎 순수 함수 + 대비 헬퍼(oklch 변환) · 세션 허용 목록 넓히기는 앞 두 기능과 같은 자리 | — (A와 병렬) | `lib/color-scheme/scheme.ts` · `lib/color-scheme/__tests__/**`(helpers 포함) · `prisma/**` · `lib/auth/**` · `types/next-auth.d.ts` · `lib/privacy/collected.ts`(필드 등재가 typecheck에 묶이면) · design.md §3.6·§3.7·§4.3(P2-pre 대조 결과) | 대기 |
| **C 다크 값·자산** | P2-0 스파이크 · P2-3 · P2-4 | Opus 5.5 high — `light-dark()` 산출 CSS 판정 · 대비 쌍 두 테마 · sonner 특이도 · 로고 7곳 이관 | A·B 통합 + 핸드오프 확보 | `app/globals.css` · `app/layout.tsx` · `components/ui/malmoi-mark.tsx` + 로고 import 7곳 · `components/mcp/connected-apps-card.tsx` · `components/ui/large-modal.tsx` · `components/signin/dot-field.tsx` · `globals-css.test.ts` · `visual-system.test.ts` · 대비 검사 테스트 | 대기 |
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
- **A fix1 완료**: rebase dev(충돌 없음) + `test(ui)` 팔레트 변수 철자 0 검사 · 접두 29개 카나리아 + `refactor(ui)` `subtle` → `surface-subtle`. 각 gate ok. 지휘자 확인(검사 diff). A 통합: cherry-pick 6(`a079b545..3566f7ad`) + spec·tasks 옛 철자 정리 · tasks 체크.
- **Phase 1 push** `519f57cf..363abe45`(gate ok) · CI run 37242265122 감시. **Q1 착수**(Sonnet medium, main 체크아웃, task_5a0e3dcd764b / ctx_5d77e901e41d — 이 동안 cherry-pick·build 금지) · **E 착수**(Opus high, `cs-e`, task_16965045ae74 / ctx_1a9b348820a1). A는 Q1 결함용 유지. C는 핸드오프 대기.
- E 질문 → 답: `lib/color-scheme/server.ts`(`getColorScheme`)는 **E가 만든다**(Theme 카드 초기값에 필요). C는 그것을 쓰고 레이아웃 연결만 한다.
- **Q1 완료**: Phase 1 dev(`363abe45`)에서 23그룹 53항목 재측정 — color·background·border 문자열 전부 일치, 그림자는 채널 값 일치(직렬화만 rgba → `color(srgb …)`). 결함 0, 이슈 0. Q0 미측정 8은 토큰 값 표로 갈음. dev DB 원복(ProjectEvent 추가분 보존). Phase 1 CI(37242265122) green. Q1·A 해제, `cs-a` 제거(인계 사본 `.scratch/color-scheme/handoff-A.md`). **Phase 1 완료.**
- **E 완료**(2커밋 `fe8229d1` feat · `b1e80088` docs(DESIGN) §10.1, 각 gate ok): `setColorScheme` · `getColorScheme`(E 작성) · Theme 카드(선적용/롤백) · 골격 셋째 · 사전 셋 · 방침 en/ko + 개정 행 · client-graph 잎. 소유 밖: `entry-points.test.ts` 한 줄(승인). D 몫: ARCHITECTURE 잎 명부 · DESIGN §6.4 문안. **RE 리뷰 착수**. E는 수정 라운드용 유지.
- **핸드오프 확보**: 사용자 URL(`b99d54cd…`, `Color Scheme.dc.html`) → DesignSync로 `design_handoff_color_scheme/README.md`를 `.scratch/color-scheme/handoff/README.md`에(§5 다크 토큰 표 · §4 시안 우선 표 — design §3.8과 다르면 design이 이긴다 주석). `.dc.html`은 Q2가 직접 받는다.
- **C 착수**(Opus high, `cs-c`, task_916158667dbb / ctx_7344af0608d9) — 순서 P2-0 스파이크 → P2-4(자산) → E가 dev에 들어오면 rebase → P2-3. **통합 순서를 E → C로 바꿨다**: `getColorScheme`이 E 소유가 되어 C의 레이아웃 연결이 그것에 기대고, 그 사이 dev에서 Dark를 골라도 레이아웃이 `data-theme`을 안 다는 상태라 화면 변화가 없다(빈 다크 위험 없음).
- **RE 리뷰**: 🔴0 · 🟡1(`data-theme` 없는 상태 롤백 갈래 테스트 없음) · ⚪4(design §3.4 소비자 줄 낡음 · revalidate 던짐 시 카드/DOM 어긋남은 공용 카드 기존 형 · ko 설명 낱말(사용자 검수) · 같은 날 개정 행). **E fix1 착수**(같은 터미널). RE 해제.
- **E fix1**(`17617f85` 롤백 "속성 없음" 갈래 DOM 테스트 둘 + design §3.4 소비자 둘) gate ok. **E 통합** cherry-pick 3(`fd3b14f2..d5b3553b`). ko 검수 메모: Theme 카드 설명 "Malmoi 화면의 밝기를 정합니다." → 형제 형("…테마입니다.") 제안(사용자 일괄 검수).
- **E push** `363abe45..7db35fec`(gate ok) · CI 37243633751 감시. E 해제·`cs-e` 제거(인계 사본 `.scratch/color-scheme/handoff-E.md`). C에 "E가 dev에 있다 — rebase 후 P2-3" 전달.
- **C 완료**(2커밋 `ecd83a61` P2-4 · `15f59799` P2-3, dev `7db35fec` 위, HEAD gate ok): 스파이크 = `light-dark()` 유지 — 단 **Next lightningcss가 `--lightningcss-light/dark` 토글로 낮춘다**(산출 CSS에 `light-dark()` 0개, 실제 하한은 사용자 정의 속성+`color-mix()` → D가 DESIGN §3 하한 문장에) · 토스트는 `Toaster style` · Canvas 점은 계산된 color(다크에서 `lab()`). 소유 밖 테스트 6파일(라이트 값 대조 → 첫 인자 · Toaster light 고정 단언) 승인 수정. Safari·Firefox 미검증. **RC 리뷰 착수**. C 유지.
- **RC 리뷰**: 🔴0(다크 값 README와 1:1 · 라이트 첫 인자 55선언 회귀 0 · lightningcss 토글이 light/dark/system 셋 모두 정상 · `color-scheme`이 `<html>`에 남고 OS 추종 유지) · 🟡3(예외 여섯 문서 반영 — 지휘자 `bb00d938` 완료 · 기본 토큰 라이트 첫 인자 미고정 · 토스트 설명 라이트도 `muted-foreground`, 소비자 0 — 의도, D가 §6.25에). **C fix1 착수**(LIGHT_BASE 고정). RC 해제.
- **C fix1**(`40e8b8f3` LIGHT_BASE 18토큰 첫 인자 고정 + 전수 단언) gate ok. **C 통합** cherry-pick 3. 인계 사본 `.scratch/color-scheme/handoff-C.md`.
- **C push** `7db35fec..19bb0a4c`(gate ok) · CI 37246140686 감시. **Q2 착수**(Opus medium, main 체크아웃 — cherry-pick·build 금지, task_f8acaad46112 / ctx_19b5fcaecada) · **D 착수**(Opus medium, `cs-d`, task_00e6b14eaf9a / ctx_3f8c2eb56cb5 — 문서만, Q2와 병렬). C는 Q2 결함용 유지.
- **D 완료**(9커밋, gate ok @b7cb671f): DESIGN §3 재작성·다크 열·예외 여섯(§7) · CLAUDE.md+스킬 4+미러 · PRODUCT · ARCHITECTURE §6.357 · DIRECTORY · README · 가이드 Theme 절 세 벌 · contrast.test why 문자열(승인). 남김: Preferences 샷 재촬영 후보(Q3 뒤). **RD 리뷰 착수**. D 유지.
- **RD 리뷰**: 🔴0(문서 문장 전수 대조 일치 · 대비 수치 재계산 일치) · 🟡2(스킬 2곳 "라이트 단일" 잔존) · ⚪5(CLAUDE 스타일 행 표현 · sonner 죽은 classNames · 가이드 #next · guide:check stale 27컷 · README 앵커). **D fix1 착수**. RD 해제.
- **D fix1**(3 docs 커밋: 스킬 2곳 "라이트 단일" · CLAUDE 스타일 행 · 가이드 #next 세 벌) gate ok @45e81dff. D 해제 — 통합은 Q2 인계 뒤(워크트리 유지). 미처리 ⚪: sonner action/close classNames(코드, 죽은 클래스) · guide stale 샷.
- **Q2 완료**(1440·1280 · 다크→라이트): 다크 토큰 42/43 일치 · off-token 색 0 · 라이트 회귀 0(의도된 LargeModal 1px만) · B1–B6 일치. 결함 1: **#187** 다크 scrim `#0a0a0a`(README `black`) → **C fix2**(라이트 불변, 다크 black, Refs #187). 시안과 다른 자리 7(구분선 `border` vs `divider` · 체크박스 · 코드 블록 · 빈 상태 글리프 · 골격 · Publish scrim /32 · Theme 머리 min-h 48)은 라이트부터 같은 기존 코드라 결함 아님. 못 본 것: 연결 앱 로고 칸(연결 없음) · 로딩 골격 · 보관 행 · danger/violet/removed-locale 상태 → Q3. dev DB 원복(colorScheme null · uiLocale ko). Q2 해제.
- **D 통합** cherry-pick 12(docs 11 + `test(theme)` why 문자열).
- **C fix2**(`b6f63a60` 다크 scrim `black`, 라이트 바이트 동일, Refs #187) 통합 + 지휘자 `docs(DESIGN)` scrim 불변 문구 3곳 정정. #187은 Q3 재확인 뒤 닫는다.
