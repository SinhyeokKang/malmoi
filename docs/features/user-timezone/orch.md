# user-timezone — 지휘 계획 (orch)

원본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md). 이 문서는 원본을 복제하지 않는다 — 태스크 ID(A1·C2…)는 tasks.md를 가리킨다.

- 착수: 2026-10-05 · 시작 dev `53d93b5a`
- 끝: dev까지. `/merge`(prod `db:deploy` — ui-locales `uiLocale` 마이그레이션 뒤 순서 고정)는 사용자가 부른다.
- 지휘자 런타임: Claude Code → 워커는 **Claude Code / Opus 5.5·Sonnet 5.5, effort ≤ high**.

## P0 결과 (지휘자, 2026-10-05)

- ui-locales dev 통합·push 확인(`53d93b5a` = origin/dev): `utcDay(at, uiLocale)` 기본값 없음 · `/preferences` + `components/preferences/language-card.tsx` · 마이그레이션 `20261004102735_add_user_ui_locale` · `messages/es.tsx`·`ko-privacy.tsx`.
- `@/lib/utc-time` 비테스트 호출부 18파일 — design §5와 일치. 테스트 쪽 importer는 `components/__tests__/{a11y-reasons,privacy-doc,ui-locale-project-screens,ui-locale-screens}`로 tasks A2 목록과 다르다 → **T1이 착수 때 다시 뽑는다**.
- design §2.1의 41개 id × (2026-01-15·07-15 정오, Santiago 09-06·Azores 03-29·Cairo 04-24 전환 직후) 오프셋이 **Node 24.21.0과 26.4.0에서 동일**.

## 결정 기록

| # | 결정 | 근거 |
|---|---|---|
| D1 | **선별 목록은 design §2.1 초안(UTC + 41개) 그대로 확정** | 2026-10-05 사용자 |
| D2 | **ko 초안(방침 D3 · 가이드 E1) 검수는 dev 통합 뒤 일괄**이다. gate green이면 통합하고 `/merge` 전까지 사용자가 한 번에 본다 | 2026-10-05 사용자 (ui-locales D1과 같은 방식) |
| D3 | 스키마: T2가 **DB 없이** `prisma migrate diff`로 SQL만 만든다(연결하지 않는 더미 `DIRECT_URL`). dev DB 적용·`has_schema_privilege` 확인은 지휘자가 통합 때 한다 | orchestrate §1 |
| D5 | **K1(ko 사전 톤 검수)만 Codex / gpt-6-astra high로 패밀리 교차** — 사용자 명시 허가(2026-10-05 "워크트리로 코덱스 하나 띄워서" · "astra로 띄워"). 다른 배치는 Claude 패밀리 그대로 | 2026-10-05 사용자 |
| D4 | 시안·`/design-sync` 없음 — 기존 페이지에 같은 형의 카드 하나(design §6) | design §6 |

## 배치

| 배치 | 태스크 | 모델·effort (이유) | 선행 | 소유 파일(주) | 상태 |
|---|---|---|---|---|---|
| **T1 순수 함수** | A1–A5 | Opus 5.5 high — 서머타임·0시 없는 날·런타임 TZ 누수·잎 경계 판단 | — | `lib/time-zone/**` · `lib/utc-time.ts`→`lib/date-format.ts` · `lib/events/{filter,view,query}.ts` · 호출부 18파일(**이름만** — `timeZone: "UTC"`) · `components/logs/log-filters.tsx`(프리셋 이동) · `lib/mcp/tools/project.ts` · `(home)/page.tsx`·logs page의 `loadEvents` 호출 · 관련 테스트 · `client-graph.test.ts` | 완료 |
| **T2 스키마·세션** | B1(SQL만) · B2 | Sonnet 5.5 medium — ui-locales C2(`uiLocale`)와 같은 자리를 따라 넓힌다 | — (T1과 병렬) | `prisma/**` · `lib/privacy/collected.ts` · `lib/auth/**` · `types/next-auth.d.ts` · `lib/credentials/__tests__/adapter.test.ts` | 완료 |
| **T3 입구·호출부** | C1 · C2 (+ H2 주석) | Opus 5.5 high — provider·하이드레이션 `now` prop·호출부 전수·사전 셋 | T1·T2 통합 | `lib/i18n/server.ts` · `components/i18n/**` · `app/layout.tsx` · 호출부 전부 · `messages/{en,ko,es}.tsx`(`m.logs.range.*`) · `components/{logs,home}/**` | 진행 |
| **T4 화면·방침** | D1–D3 | Opus 5.5 high — Radix Select 포커스·공용 조립 추출·Action 갈래·방침 동형 | T3 통합 | `app/(edit)/preferences/**` · `components/preferences/**` · `messages/{en,ko,es}.tsx`(새 키) · `messages/ko-privacy.tsx` · `app/__tests__/entry-points.test.ts` | 대기 |
| **T5 가이드** | E1 | Sonnet 5.5 medium — 원고 세 벌 문장 교체 + 절 하나 | T4 통합 | `guide/{en,ko,es}/**` · `guide/AUTHORING.md`(필요 시) | 대기 |
| **T6 정본 문서** | H1 | Opus 5.5 medium — 문서별 커밋, 사실 대조 | T4 통합 (T5와 병렬 — 파일이 갈린다) | CLAUDE.md(+미러) · `docs/{ARCHITECTURE,DESIGN,PRODUCT,DIRECTORY,OPERATIONS}.md` | 대기 |
| **Q1 런타임** | H3 `/runtime-test` + Preferences 샷 `/guide-shots` | Opus 5.5 medium — main 체크아웃(그동안 cherry-pick·build 금지) | T1–T6 통합 | 없음(리포트·BugShot) · `public/guide/` 샷 | 대기 |
| 지휘자 | P0 · 체크·통합 · dev DB 마이그레이션 · 결함 라우팅 | — | 각 통합 시 | 이 문서 · tasks 체크 | — |

## 파일 겹침과 순서

- **1파(병렬)**: T1 · T2 — 겹치는 파일 없음(T1은 `lib/events`·날짜 포맷·호출부, T2는 `prisma`·`lib/auth`·`collected.ts`).
- T1·T2 통합(+ dev DB 마이그레이션) → **T3**.
- T3 통합 → **T4**(`messages/*.tsx`를 둘 다 고친다 — 직렬).
- T4 통합 → **T5 · T6 병렬**(guide/** 대 정본 문서).
- 전부 통합 → **Q1** → 결함은 소유 배치(남아 있으면) 또는 새 워커로.

## 검증 게이트

- 워커: `pnpm gate --base dev`(파이프로 거르지 않는다) + 인계 문서 `.scratch/handoff-<batch>.md`.
- 지휘자 통합: `git cherry-pick` → `pnpm gate` 끝줄 `gate: ok` → `git push`(dev).
- 마이그레이션(T2): dev `pnpm exec prisma migrate deploy` → `db:status` → `has_schema_privilege` false.

## 진행 기록

(배치별 라운드·통합 해시·미완 항목을 여기에 덧붙인다.)
- Run `run_ba6c4daeafda`. **T1 착수**(Opus high, task_853dadb07aee / ctx_e0385ed40aa9, 워크트리 `utz-t1`) · **T2 착수**(Sonnet medium, task_3380583ca10d / ctx_e159312bdf37, 워크트리 `utz-t2`). 브리프 `.scratch/user-timezone/`.
- **별건 둘 추가**(사용자 2026-10-05, 범위 밖이지만 같은 런에서): **T7** 랜딩·signin 슬로건 en 고정 — 범위 D5 = `landing.hero.title` · `signIn.hero` · `landing.closing.title`(사용자 선택) (Sonnet medium, task_6ba42706ae04 / ctx_e11e121fa8fe, `utz-t7`, 브리프 `brief-T7.md`) · **T8** 하위태그 없는 `es` 로케일 배지 = 스페인 국기(D6 — 다른 다국 언어는 null 유지) (Sonnet medium, `utz-t8`, `brief-T8.md`). T7은 `messages/*.tsx`를 고치므로 **T3은 T7 통합 뒤** 착수.
- **T7 · T8 통합**: `fa589a61` feat(i18n) 슬로건 en 고정 · `377dd4ac` docs(ARCHITECTURE) · `24b1c21d` feat(keys) es 국기 — 각각 별도 커밋(사용자 요청). gate 2회 red(load 26–38에서 5초 타임아웃·타이밍 — 단독 실행 green) → 부하 해소 뒤 `gate: ok`. 런타임 미확인: ko·es 랜딩/signin 슬로건 육안 · 번역 화면 `es` 배지 → Q1. T7·T8 해제·워크트리 제거.
- **T2 통합·push**: `feat(db)` + `feat(auth)` (B1·B2). dev DB `20261004180102_add_user_time_zone` 적용 · `db:status` 최신 · anon/authenticated USAGE·CREATE false · 테이블 GRANT 0. deviation: SQL을 `--from-schema`(직전 커밋 스키마)로 diff · T3 소유 `server.test.ts`에 `timeZone: null` 한 토큰. 런타임 미확인: `/api/auth/session` 본문 → Q1. T2 해제·워크트리 제거.
- **K1 착수**(별건, 사용자 2026-10-05): ko 사전 전면 톤 검수 — 자연스럽게, en 유지 허용(슬로건·기술 용어). Codex gpt-6-astra high(D5), task_3e2daf9bbb98 / ctx_330d2e847cb2, 워크트리 `utz-k1`, `brief-K1.md`. `logs.range.*`·`preferences.*`·`ko-privacy.tsx`는 손대지 않음(T3·T4 충돌 방지). §10.0·§10.1과 충돌하면 사용자 요청이 이기고 DESIGN도 고친다. T3·T4는 ko.tsx 다른 절만 고쳐 병렬 허용 — 통합 순서대로 rebase.
- **T1 통합·push**: `feat(time)` (A1–A5, 48파일). 리뷰(Opus 서브에이전트) 🔴0 🟡0 ⚪6 — startOfDay 42 tz × 1990–2039 전수 0 불일치, deviation 7 전부 수용. ⚪(1970 주석·테스트 머리 주석)는 T3 브리프로. 개명은 git이 delete+create로 봐 `--follow` 이력이 끊김(수용). gate ok. T1 해제·워크트리 제거, 인계 사본 `.scratch/user-timezone/handoff-T1.md`.
- **T3 착수**(Opus high, `brief-T3.md`). K1과 ko.tsx 겹침은 절로 가름(`logs.range.*`만 T3).
- **K1 통합·push**: `fix(i18n)` ko 사전 355/1,435 항목 · `docs(guide)` ko 가이드 인용 7파일 · `docs(DESIGN)` §10.0·§10.1. 용어: 풀 리퀘스트→PR · 보내지 않은 편집→미전송 변경 사항 · 인가→승인 · 좌석→정원 · `~하시겠습니까?`→`~할까요?`. gate ok. **사용자 일괄 검수 대상(D2)**. 남은 것: ko 가이드 **본문**에 옛 용어(보내지 않은 편집·풀 리퀘스트·허용 동작) 잔존 — 범위 밖이었다 · `ko-privacy.tsx` 어색한 곳 7건 목록(인계 사본 `.scratch/user-timezone/handoff-K1.md`) · 좁은 폭 줄바꿈 7화면 → Q1. K1 해제·워크트리 제거.
- **K2 착수**(별건, 사용자 2026-10-05): ko 용어 2차 검수 + ko 가이드 본문 갱신 — 기준 "ko-first 서비스 수준". Claude Opus 5.5 high, task_02d0ebcdc705 / ctx_9c1f8341d63f, `utz-k2`, `brief-K2.md`. `logs.range`·`preferences`·T5 시간대 문장 제외. **T5(가이드)는 K2 통합 뒤** 착수(guide/ko 겹침).
- **D6 뒤집힘 → T9**(사용자 2026-10-05 직접 확인): 슬로건 셋 en 고정(T7) 철회, 다시 번역. ko = h1·signin 「흩어진 말을 모아, / 함께 번역하고 전달하세요」 · closing 「이미 있는 번역 파일에서 시작하세요」, es 초안. K2 워커가 먼저 제안 — 워커 메시지는 사용자 입력이 아니므로 지휘자가 사용자에게 재확인 후 착수. Sonnet medium, task_93f54e2356b5 / ctx_76930383efa3, `utz-t9`, `brief-T9.md`.
- **R3(T3 리뷰)**: 🔴0 · 🟡2(사용자 시간대 호출부를 고정하는 소스 검사 없음 · 인계의 "UTC 화면 바이트 동일" 주장이 틀림 — 행 시각 `UTC` 라벨·시각 칸 48→112px·Dialog `Days are in UTC.`는 의도된 변화) · ⚪4(signin/link가 PUBLIC_SHELL 밖 · A4⑤ 정규식 좁음 · 자정 넘긴 탭의 Today는 Refresh 전까지 하루 늦음(수용, H1 문서 한 줄) · NY 칩 테스트 유효). deviation 7 수용(ko `logs.range.description`은 D2 검수 대상). **T3 fix1 착수**(같은 터미널, ctx_8daffef87e9b). ⚠️ Q1 체크리스트는 위 세 의도된 변화를 회귀로 보지 않는다.
- **K2 통합·push**: `fix(i18n)` ko 용어 통일 · `docs(guide)` ko 가이드 본문(풀 리퀘스트 49곳→PR · 보내지 않은 편집 21곳→미전송 변경 사항 · 사건/이벤트→활동 등) · `docs(DESIGN)` §10.0·§10.1. 금지어 15개 등재. gate ok. **사용자 일괄 검수 대상(D2)** — 용어 표·K1 뒤집은 목록은 `.scratch/user-timezone/handoff-K2.md`. T5 몫: `guide/*/sync/logs.md:12`의 시간대 문장(ko는 아직 `사건 시각`). K2 해제·워크트리 제거.
- **T9 통합·push**: `feat(i18n)` 슬로건 재번역(ko 사용자 안 · es `Reúne tus textos, / traduce y publica en equipo` · `Empieza con los archivos que ya tienes` 초안) · `docs(ARCHITECTURE)` 영어 고정 목록에서 제거. K2 위로 충돌 없이 cherry-pick, gate ok. 런타임: ko·es 랜딩/signin 줄바꿈 → Q1. T9 해제·워크트리 제거.
