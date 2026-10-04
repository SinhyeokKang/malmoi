# ui-locales — 지휘 계획 (orch)

원본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md) · 시안 <https://claude.ai/design/p/b99d54cd-3034-44f1-8446-0a864da9d767?file=UI+Locales.dc.html>.
이 문서는 원본을 복제하지 않는다 — 태스크 ID(A1·E3…)는 tasks.md를 가리킨다.

- 착수: 2026-10-04 · 시작 dev `ec56b151`
- 끝: dev까지. `/merge`(prod `db:deploy` 포함)는 사용자가 부른다.
- 지휘자 런타임: Claude Code → 워커는 **Claude Code / Opus 5.5·Sonnet 5.5, effort ≤ high**.

## 결정 기록

| # | 결정 | 근거 |
|---|---|---|
| D1 | **ko 원고 셋(사전·가이드·방침) 검수는 dev 통합 뒤 일괄**이다. 초안은 gate green이면 바로 통합하고, 전 배치가 끝난 뒤 사용자가 한 번에 본다. 고칠 곳은 소유 워커에게 라운드로 보낸다. `/merge` 전까지가 검수 창이다 | 2026-10-04 사용자 |
| D2 | **`Messages`에서 빼는 영어 고정 네임스페이스** = 최상위 `mcp`·`seo`·`crash` + 중첩 `publicDocs.privacy`. 초대 메일은 전용 네임스페이스가 없고(`projects.role` 등 공용 키) 소비자가 `en`을 명시 import한다 | `messages/en.tsx` 최상위 절 실측(2026-10-04). 사전 워커가 W1을 기다리지 않고 시작하려면 지금 정해야 한다 |
| D3 | **날짜·상대 시각·언어명 헬퍼의 `locale` 인자는 W1에서 기본값 `"en"`으로 들어간다** — 호출부 27개 파일을 W1이 건드리지 않게 한다. E 배치가 호출부마다 실제 언어를 넘기고, **E7이 기본값을 지운다**(남은 호출부는 typecheck가 잡는다) | E와의 파일 겹침 제거 |
| D4 | 스키마: W1이 **DB 없이** `prisma migrate diff`로 SQL만 만든다(연결하지 않는 더미 `DIRECT_URL`). dev DB 적용·`has_schema_privilege` 확인은 지휘자가 통합 때 한다 | orchestrate §1 |
| D5 | ko·es 사전 워커는 W1 통합 전에 시작한다 — `satisfies Messages`는 W1 통합 후 rebase하며 붙인다(D2 덕에 키 집합이 지금 정해져 있다) | 가장 긴 작업(3,840줄 ×2)을 앞당긴다 |
| D6 | 사전·가이드 번역은 **`/ship bypass`가 아니라 직접 작성 + `pnpm gate --base dev`**다 — TDD 대상 코드가 없다. 코드 배치는 `/ship bypass` | 번역 원고는 인터페이스가 아니다 |

## 배치

| 배치 | 태스크 | 모델·effort (이유) | 선행 | 소유 파일(주) | 상태 |
|---|---|---|---|---|---|
| **W1 기반** | A0 · A1–A4 · B1′ · B1 · C1(SQL) · C2 · D1–D3 | Opus 5.5 high — 불변식(번들·RSC 경계·세션 타입·pull 계약) 판단이 많다 | — | `lib/i18n/**`(사전 제외) · `lib/utc-time.ts` · `lib/relative-time.ts` · `lib/onboarding/{language-name,detect}.ts` · `lib/pull/**` · `components/publish-button.tsx`(경고 표시만) · `app/(edit)/projects/actions.ts`(`summarizeCandidates`만) · `prisma/**` · `lib/privacy/collected.ts` · `lib/auth/**` · `types/next-auth.d.ts` · `components/i18n/**` · `app/layout.tsx` · `components/__tests__/{client-graph,helpers/dom}` | 대기 |
| **W2 ko 사전** | B2 · B3 | Opus 5.5 medium — 번역 품질, 용어 일관 | 착수 즉시(D5), `satisfies`는 W1 뒤 | `messages/ko.tsx` · `docs/DESIGN.md` §10·§10.1·§6.4 · `no-korean-ui.test.ts` 허용 목록 | 대기 |
| **W3 es 사전** | B4 | Opus 5.5 medium | 착수 즉시, `satisfies`는 W1 뒤 | `messages/es.tsx` | 대기 |
| **W4 ko 가이드** | I4 초안 → (W1 뒤) I1 · I2 · I3 | Opus 5.5 medium | 초안 즉시 · I1은 W1(D2 `getUiLocale`) 뒤 | `guide/ko/**` · (I1 뒤) `guide/en/**`(이동) · `lib/guide/**` · `app/docs/**` · `app/api/search-index/**` · `app/llms*` · `app/sitemap.ts` · `scripts/guide-check.ts` · `lib/search/docs-index*` · `terminology.test.ts` | 대기 |
| **W5 es 가이드** | I5 초안 | Sonnet 5.5 medium — 원문 대비 기계적 번역, 검수 없음 | 즉시 | `guide/es/**` | 대기 |
| **W6 이행 lib** | E1 · E2 | Opus 5.5 medium — 시그니처 전환, 테스트 133파일 기계 전환 | W1 통합 | `lib/mcp/**` · `lib/invitation-email/**` · `lib/seo/**` · `app/global-error.tsx` · 정적 `metadata` · `scripts/**` · 테스트 전반 · `lib/` 문구 모듈 | 대기 |
| **W7 이행 공개·셸** | E3 · E4 | Sonnet 5.5 medium — 기계적 | W6 통합 | `app/{page,signin,invite,oauth,docs,changelog,privacy,not-found,error}` · `components/{public-shell,signin,landing,docs,changelog,privacy,oauth,shell,projects,onboarding,search}` · `lib/links.ts` · `lib/shell/nav.ts` · `lib/search/**` | 대기 |
| **W8 이행 프로젝트·계정** | E5 · E6 | Sonnet 5.5 medium | W6 통합 | `app/(edit)/projects/**` · `components/{home,sources,translations,members,logs,settings,account,mcp}/**` · `components/ui/**`(사전 읽는 8곳) | 대기 |
| **W9 마감 이행** | E7 · E8 | Sonnet 5.5 medium | W7·W8 통합 | `lib/i18n/index.ts`(별칭 삭제) · 헬퍼 기본값 삭제(D3) | 대기 |
| **W10 언어 바꾸기·Preferences** | F1 · F2a · F2 · H1 · H1k · F3 · G1 · G2 | Opus 5.5 high — 포커스·busy·Action 갈래·방침 | W9 · W2 · W3 통합 | `app/ui-locale/**` · `components/ui/text-trigger.tsx` · `components/i18n/locale-switcher*` · `components/public-shell/footer.tsx` · `components/signin/auth-layout.tsx` · `messages/{en,ko,es}.tsx`(새 키만) · `messages/ko-privacy.tsx` · `app/privacy/**` · `app/globals.css` · `app/(edit)/preferences/**` · `lib/auth/cookie.ts` · `lib/seo/crawl.ts` · `lib/shell/nav.ts` | 대기 |
| **W11 가이드 페이지** | H3 | Sonnet 5.5 medium | W10 · W4 통합 | `guide/{en,ko,es}/**` 새 페이지 · `guide/SHOOTING.md` · `public/guide/` 새 샷 | 대기 |
| **Q1 시안 대조** | G3 `/design-sync` | Opus 5.5 medium — main 체크아웃 | W10 통합 | 없음(리포트·BugShot) | 대기 |
| **Q2 런타임** | H4 `/runtime-test` | Opus 5.5 medium — main 체크아웃, Q1 뒤 직렬 | Q1 | 없음 | 대기 |
| 지휘자 | H2 정본 갱신 · I6 · 체크·통합 · dev DB 마이그레이션 | — | 각 통합 시 | 정본 문서 | — |

## 파일 겹침과 순서

- **1파(병렬)**: W1 · W2 · W3 · W4(초안) · W5 — 파일이 겹치지 않는다(W2의 `DESIGN.md`는 정본 문서라 다른 배치가 안 건드린다).
- W1 통합 → W2·W3에 "`git rebase dev` 후 `satisfies Messages`" · W4에 "I1–I3 진행" · **W6 착수**.
- W6 통합 → **W7 · W8 병렬**(디렉터리가 갈린다. `lib/shell/nav.ts`는 W7만).
- W7·W8 통합 → W9.
- W9 · W2 · W3 통합 → W10(`messages/*.tsx`에 새 키를 세 사전에 같이 넣는다 — 그래서 사전 셋이 먼저 들어가야 한다).
- W10 · W4 통합 → W11 · Q1 → Q2.
- ⚠️ `messages/en.tsx`를 고치는 배치: W1(B1′가 경고 코드 문구를 쓰면) · W10. 둘은 직렬이다. W6~W9는 en.tsx 문구를 바꾸지 않는다(필요하면 질문으로 올린다).
- ⚠️ `components/publish-button.tsx`: W1(경고 표시) → W8(이행). 직렬.

## 검증 게이트

- 워커: `pnpm gate --base dev`(파이프로 거르지 않는다) + 인계 문서 `.scratch/handoff-<batch>.md`.
- 지휘자 통합: `git cherry-pick` → `pnpm gate` 끝줄 `gate: ok` → `git push`(dev).
- 마이그레이션(W1): dev `prisma migrate deploy` → `db:status` → `has_schema_privilege` false.

## 진행 기록

(배치별 라운드·통합 해시·미완 항목을 여기에 덧붙인다.)

### 1파 — 2026-10-04 착수 (Run `run_d303841cd9aa`)

| 배치 | Task | Dispatch | 워크트리 | 모델 |
|---|---|---|---|---|
| W1 | task_724a86f7b6e3 | ctx_95a9a14ce285 | `~/orca/workspaces/malmoi/ui-locales-W1` | Opus 5.5 high |
| W2 | task_2ac94b06fd6e | ctx_9a2dee6437d5 | `…/ui-locales-W2` | Opus 5.5 medium |
| W3 | task_f80fa47e2e13 | ctx_617c7947a513 | `…/ui-locales-W3` | Opus 5.5 medium |
| W4 | task_a8aa7e0bda45 | ctx_87474fcb42c8 | `…/ui-locales-W4` | Opus 5.5 medium |
| W5 | task_2703e03fbb0b | ctx_c083b680efec | `…/ui-locales-W5` | Sonnet 5.5 medium |

브리프: `.scratch/ui-locales/brief-{common,W1..W5}.md`(메인 체크아웃, gitignore).
- W1 질문(A1): `UI_LOCALE_NAMES`의 `한국어` endonym 때문에 `lib/i18n/locales.ts`를 `no-korean-ui` 허용 목록에 넣는다 → 승인. 허용 목록은 `locales.ts`·`messages/ko.tsx`·`messages/ko-privacy.tsx` 셋이 된다(design §6·§8 갱신 대상 — 지휘자 문서 커밋).
- W1 질문(A3): ko 날짜 단위(년·월·일) 때문에 `lib/utc-time.ts`도 허용 목록에 → 승인. 허용 목록 넷(`locales.ts`·`utc-time.ts`·`messages/ko.tsx`·`messages/ko-privacy.tsx`).
- W4 질문: 기존 `structure.test.ts`가 `guide/`를 재귀로 훑어 `guide/ko`를 미등재 페이지로 잡는다 → 초안은 미커밋으로 두고 I1과 함께 커밋. W5에도 같은 지시(I1 뒤 rebase·커밋). 독자 원고는 29파일.
- W5: I5 초안 완료(미커밋, 질문 msg_11c61b2f9b5c에 I1 뒤 답한다).
- W1 질문(B1′): `lib/publish/warnings.ts`·`components/onboarding/steps/files.tsx` 한 곳씩 수정 승인. MCP publish 응답·cron JSON은 각 층(`lib/mcp`·`app/api/pull`)에서 `en`으로 문장을 조립해 계약 모양을 유지하라고 지시. 서버 로그는 코드 허용.
- W4: I4 초안 완료(미커밋, 질문 msg_350d442a5337에 W1 통합 뒤 답한다).
- W3: es 사전 초안 `5a24008e`(gate ok, 미import). 질문 msg_351025ece70a에 W1 통합 뒤 'go'.
- W2: `a18908d6` DESIGN §10 · `b24b0cb3` ko 사전(gate ok). 질문 msg_a82d364a79e8에 W1 통합 뒤 답. W1에 landing.mockup 허용 접두 전달, W3에 §10.1 es 열 정렬 지시.
- W1 질문(D1–D3): ko·es provider·사전 행은 W1에서 en으로 임시 매핑, W2/W3가 rebase 때 각자 provider 파일 추가 + 표 한 줄 교체 → 승인. B1⑥ 허용 importer = 언어별 provider + `lib/i18n/server.ts`. W2 → W3 직렬 rebase.
- **W1 에스컬레이션(번들)**: Turbopack에서 루트 레이아웃이 import하는 클라이언트 모듈은 언어별 provider로 나눠도 한 레이아웃 청크 묶음에 들어간다 — 실험상 en 페이지도 ko 사전 청크를 받았다. design §3.3·완료 조건 10이 성립하지 않는다.
  **D7(사용자)**: 스파이크 후 판정 — W1 통합 뒤 같은 워커가 클라이언트 언어별 비동기 청크(next/dynamic 또는 동적 import + preload)를 실측한다. 실패하면 모두에게 +~60KB를 수용하고 조건 10을 지운다. W2·W3의 표 교체는 판정 뒤.
- **W1 완료**(2026-10-04): 6커밋 `20f242dd..ec766001`, `gate: ok`. 인계의 "계획과 다른 점" 12개(공용 provider + client reference 사전 · `Widen` · `AdapterUser` 미확장 등)는 R1 리뷰가 판정.
  - A0 기준선: en 사전 청크 gzip 32,828B(`Button`·lucide와 한 청크) · first-load gzip `/` 268,997 · `/projects/[slug]` 307,067 등(인계 부록 스크립트).
  - 후속: W1 터미널 재사용 → 스파이크 Task `task_9fb4f17bb5fa`/`ctx_0c825f4ec063`(커밋 없음). 리뷰 R1 `task_c81f503e99ff`/`ctx_bb49435ca3af`(Opus high, W1 브랜치 위 새 워크트리).
- **D7 판정(스파이크 결과)**: **1b 채택** — 사전을 `next/dynamic` 로더 하나가 운반하고 안정된 `Inner` provider가 언어별 슬롯을 `use()`로 읽는다. 실측(Turbopack, `/privacy`): ko 청크가 레이아웃 엔트리 밖 단일 청크 · en HTML 참조 0 · ko HTML이 preload · SSR ko 문구 · 전환 시 재마운트 없음(jsdom). 완료 조건 10 유지. `ui-dictionaries.ts`·`<lang>-messages.ts` 표는 사라지고 W2·W3의 교체는 `Carriers` 한 줄 + `server.ts` 한 줄. 남은 위험(브라우저 H4): 루트 하이드레이션 suspend 길이 · preload `fetchPriority=low`. 구현은 W1 수정 라운드에 넣는다(보고서 `ui-locales-W1/.scratch/spike-bundle.md`).
- **R1 리뷰(W1)**: 🔴1(번들 주장 — D7 1b로 해소) · 🟡5(배선이 en인 상태 미탐지 · 잎 경로 집합 · 사전 importer 검사 · 어댑터→세션 경로 · cron 행동 테스트) · ⚪9. deviation 1–7·9–12 수용, 8은 재마운트·SSR 수용/번들 주장 수정. 리포트 사본 `.scratch/ui-locales/review-W1.md`. R1 워크트리 제거.
  - 지휘자 몫: ⚪2(E2 뒤 B1⑦을 전이 검사로 올릴지 — `lib/push/apply.ts → import-status → import-failure.ts`의 최상위 `m`) · ⚪4(E8은 사전 청크가 아니라 라우트별 first-load gzip 합으로 비교) · ⚪6(pull 서버 로그가 코드 — H2 OPERATIONS·ARCHITECTURE).
- W1 수정 라운드 1: `task_a7666a24f593`/`ctx_e19f2a766d61`(1b 구현 + 🟡1–5 + ⚪1·⚪5).
- **W1 통합 준비**: dev에 cherry-pick 8커밋(`20f242dd`…`9152bf82` → dev `c5db7d8c`, push `2ef22e0d..c5db7d8c`; gate 1회차 api-contract 부하 타임아웃(load 43) → 재실행 `gate: ok`). dev DB `20261004102735_add_user_ui_locale` 적용 · `db:status` 최신 · anon/authenticated USAGE·CREATE 모두 false · 테이블 GRANT 0.
- W1 정리: 인계·스파이크 보고 사본 `.scratch/ui-locales/{handoff-W1,spike-bundle}.md`, 워커 해제·워크트리 제거.
- 신호: W2 rebase+satisfies(W3는 W2 통합 뒤) · W4 I1–I3 시작(가이드 관련 파일의 en 전환도 W4 소유) · **W6 착수** `task_071cebac8f37`/`ctx_c35f0ba1166b`(Opus medium).
- W4 질문(I1): `no-korean-ui`·`brand-spelling`의 가이드 경로 한 줄씩 수정 승인 — no-korean-ui는 ko 외 전 트리, brand-spelling은 전 트리.

## 피어 세션 (지휘 대상 아님 — 사용자가 직접 응답)

- 2026-10-04 사용자: Preferences에 TZ·Theme 추가. **구현 순서 고정: ui-locales → user-timezone → color-scheme**(color-scheme은 하드코딩 색 정리 → 컬러 스킴).
- 스펙 작성 세션 둘(Opus 5.5, dev 기반 워크트리, `/feature`): `feature-user-timezone`(term_d5eca2ce…) · `feature-color-scheme`(term_8df94b9f…). 브리프 `.scratch/peer/feature-*.md`. 산출물은 각 브랜치 커밋 — 통합은 ui-locales와 별개.
- W6 질문: `lib/links.ts`·`lib/shell/nav.ts`·`lib/search/{rows,nav-index}.ts`의 m 인자화는 W7 몫으로 남김.
- W4: I1 커밋(`00622bb8` guide/en 이동·로더 · `17350047` ko 가이드), I2 소유 밖 파일(검색 로더·다이얼로그 한 줄·entry-points 등) 승인. 옛 `/api/search-index` 경로 제거 → CLAUDE.md 데이터 경로 표 갱신은 지휘자 H2. W5는 W4 브랜치 끝 위에서 커밋(통합 순서 W4 → W5). W6에 W4가 고친 테스트 파일 회피 지시.
- **W4 완료**: 5커밋 `00622bb8 17350047 2ab43bea a456f5e6 5fa369c3`(I4·I1·I2·I3), gate ok. 문서 갱신 대상(지휘자): 옛 `/api/search-index` — CLAUDE.md:123 · ARCHITECTURE 2152/2786 · DIRECTORY 135 · PRODUCT 662 + I6. W5 rebase 대상 5fa369c3. 리뷰 R4 착수.
- **W3 완료**(es 사전 `0a32feaf 5a36fae3 f05aaf2d`, W1 위 rebase) → W2와 같은 블록 충돌 예상이라 후속 Task로 로컬 dev(W2 포함) rebase 지시. 지휘자가 W3의 W1-신호 질문에 답을 놓쳤다(W3가 로컬 dev를 신호로 삼음).
- **W3 통합(로컬)**: `48d9aa9a 85c5153f b7487eb9`(es 사전·§10.1 정렬·배선). 워커 해제·워크트리 제거. push는 W2와 함께 게이트 대기.
- **R4(W4 리뷰)**: 🔴0 · 🟡3(트리 없는 언어에서 /docs 500 — 닫는 조건 · ko 'push 토큰' vs 사전 '푸시 토큰' · 인용 문구 게이트 밖) · ⚪10. 사본 `.scratch/ui-locales/review-W4.md`. W4 수정 라운드 1 착수(🟡1은 W5 es 커밋 위로 rebase 뒤). 통합 순서: W5 커밋 → W4 fix1이 그 위로 → W4 브랜치 하나로 통합.
- W4 fix1 질문: BANNED_TERMS 공유 헬퍼로 추출(복사 금지) — W4는 dev(83941d54)로 rebase, W5 es 커밋은 나중에 W4가 cherry-pick.
- **D8(사용자, W7에 얹음)**: 헤더 44 — `HeaderBar` `h-10`→`h-11` · `FieldButton` 40→44 · 앱 셸 `gap-2 p-2`→`px-2 pt-1.5 pb-2` + 헤더 `mb-1.5` · 공개 셸 `pt-2`→`pt-1.5` + 헤더 `mb-2`→`mb-1.5`(두 셸 같은 형). 패널 시작(56)·헤더 요소 세로 중심(28) 불변. 랜딩 목업 헤더·DESIGN 문구(§6.x "전폭 40 헤더", FieldButton "40×320") 함께.
  - **D8 검증 통과 조건(사용자)**: **검색 버튼 높이(40→44, 그에 따른 버튼 y −2)를 빼고 시각 변경 0.** 판정은 변경 전후 DOM 실측 — 1280·1440에서 앱 셸(`/projects`·프로젝트 Home)·공개 셸(`/`·`/docs`·`/privacy`)·`AuthLayout`(`/signin`)의 패널 시작 y·사이드바·로고·내비·New project·아바타·푸터의 bounding rect가 같다. 값을 표로 인계에 남긴다. ⚠️ 랜딩 목업도 `HeaderBar`를 쓰므로 목업 프레임 안 헤더 줄이 4px 커지면 위반이다 — 목업은 지금 높이를 유지하는 방법을 W7이 정하고(필요하면 `ask`), 같은 실측에 넣는다.
