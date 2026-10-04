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
