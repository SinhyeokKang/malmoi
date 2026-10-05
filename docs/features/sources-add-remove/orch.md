# sources-add-remove — orch (지휘 계획)

> 원본: `spec.md` · `design.md` · `tasks.md` · 시안(spec 머리 링크). 이 문서는 지휘 상태만 든다 — 원본을 복제하지 않는다.
> 착수: 2026-10-05, 시작 dev `c557bc51`. 지휘자 = Claude Code(Opus 5.5). 끝은 dev(`/merge`는 사용자).

## 결정 기록

| # | 결정 | 근거 |
|---|---|---|
| D1 | 워커는 Claude Code(Sonnet·Opus)만. Codex 교차 없음 | 지휘자 판단 — 이번 런에 사용자 교차 허가 없음 |
| D2 | 제품 판정(정본 넷 변경)은 spec 머리의 사용자 확정(2026-10-05)으로 닫힘 — 다시 묻지 않음 | 지휘자 판단 — spec 범위 게이트 |
| D3 | T0.1(정본 계약 문서)은 B1이 맨 먼저 문서별 커밋으로 한다 | 지휘자 판단 — 바뀌는 계약이 전부 B 쪽(편집 버리는 길 셋·`surface removed`·권한) |
| D4 | B를 B1(순수·코어·껍데기·push)과 B2(UI·사전 UI 키·Logs·소비자 회귀)로 쪼갠다. B2는 B1이 dev에 든 뒤 띄운다 | 지휘자 판단 — B가 15태스크라 한 워커 컨텍스트에 과함, B2가 B1의 Action에 의존 |
| D5 | A-T5·B-T15 `/design-sync`는 배치 워커가 아니라 통합 뒤 main 체크아웃 QA가 한다 | 지휘자 판단 — dev 서버·`.env.local`이 main 체크아웃에만 있음(메모리 qa-worker-in-main-checkout) |
| D7 | 테마 기본값 light → system을 이 런에 소형 배치 T로 끼운다(Sonnet 5.5 medium). ARCHITECTURE·PRODUCT는 B1과 절이 달라 병렬 허용 | 사용자 2026-10-05 요청 |
| D6 | T22 정본 반영(DESIGN 새 패턴 등)은 B2 마지막 커밋, 디렉터리 삭제는 지휘자가 QA 뒤 | 지휘자 판단 |

## 배치

| 배치 | 항목 | 소유 파일(주) | 선행 | 모델·effort | 출시 차단 | 게이트 | 상태 |
|---|---|---|---|---|---|---|---|
| A | A-T1~T4 | `components/sources/add-sources-modal.tsx` · `components/onboarding/steps/naming.tsx`(+ 추출 컴포넌트) · `lib/sources/add-block.ts` · 해당 테스트 · `messages/*`(A-T4 키) | — | Opus 5.5 medium — DOM 상태 보존·역전 테스트가 까다롭지만 서버 불변식 없음 | 예 | `pnpm gate --base dev` | dev 반영(리뷰 🔴0 🟡4 → fix1, 라운드 1) |
| B1 | T0.1 · B-T1~T9 | `docs/{ARCHITECTURE,PRODUCT,ACTIONS}.md` · `CLAUDE.md` · `lib/surfaces/*` · `lib/protection/fingerprint.ts` · `lib/push/*` · `app/api/push/**` · `lib/events/{payload,view}.ts` · `lib/mcp/tools/*`·catalog · `app/(edit)/projects/[slug]/sources/actions.ts` · `app/__tests__/locked-access.test.ts` · `prisma/schema.prisma`(주석만) · `messages/*`(MCP·거부·사건 문장) | — (messages 편집만 A 뒤) | Opus 5.5 high — 병합 없음·잠금·지문·경합 판단 | 예 | `pnpm gate --base dev`(postgres 트리거) | 대기 |
| B2 | B-T10~T14 · T22 정본 | `components/sources/{source-detail-modal,sources-screen}.tsx` · 확인 창 컴포넌트 · `app/(edit)/projects/[slug]/logs/**` · `messages/*`(UI 키) · `docs/DESIGN.md` · 소비자 회귀 postgres 케이스 | A·B1 dev 반영 | Opus 5.5 medium — 기존 sync-button 형 조립 | 예 | `pnpm gate --base dev` | 대기 |
| G | T20 가이드 세 벌 + 스크린샷 | `guide/{en,ko,es}/**` · `public/guide/**` · `guide/SHOOTING.md` | A·B2 dev 반영 | Sonnet 5.5 medium — 원고 갱신(촬영은 main 체크아웃 QA 단계) | 아니오 | `pnpm test` · `pnpm guide:check` | 대기 |
| T | 테마 기본값 system(brief-T) | `lib/color-scheme/**` · `theme-card.tsx` · `schema.prisma` 주석 · 문서 테마 절 | — | Sonnet 5.5 medium — 소형 기계적 | 아니오 | `pnpm gate --base dev` | dev 반영(리뷰 🔴0 🟡5 → fix2, 라운드 2) |
| Q | A-T5 · B-T15 `/design-sync` · T21 `/runtime-test` | 코드 수정 없음(main 체크아웃) | 전부 dev | Opus 5.5 medium | 예(🔴만) | BugShot 이슈 → 소유 배치 | 대기 |

### 파일 겹침 · 순서

- **A ∥ B1** — 코드 파일 겹침 없음. `messages/{en,ko,es}.tsx`만 겹친다 → B1은 messages를 A가 dev에 든 뒤에만 고친다(`WAITING FOR A` → `git rebase dev`).
- **B2**는 A·B1 뒤(sources-screen·messages·actions 의존).
- **G**는 B2 뒤. 촬영(`/guide-shots`)은 main 체크아웃이라 Q와 직렬.
- 스키마·마이그레이션 0 → `/db` 없음, prod `db:deploy` 없음.

## 진행 로그

- 14:09 run `run_5c78a4a666af`, A·B1 시작
- 14:22 A worker_done(gate ok) → 리뷰 워커 RA 시작, A 터미널 retain
- T 시작(사용자 요청 — 테마 기본 system) · fix1 로그인 시 계정 테마 → 쿠키(사용자 추가 요청)
- A fix1(🟡4 + DESIGN) → dev cherry-pick, `pnpm gate` ok
- T worker_done → 리뷰 RT(🟡1 route handler `cookies().set` 재직렬화가 `Max-Age=0` 삭제를 잃음) → fix2(바깥 래퍼 header append) → dev cherry-pick, `pnpm gate` ok
- 이슈 후보(범위 밖 기존 결함): `withLoginLink`의 `NextResponse` 재구성도 Auth.js 삭제 쿠키를 빈 세션 쿠키로 내보낸다
