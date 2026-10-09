# Self-hosting — 지휘 계획

시작: 2026-10-09 · 시작 dev `94f9233d`(v1.2.6 `d49a7c8b` 위 문서 커밋) · 원본: [spec](spec.md) · [design](design.md) · [tasks](tasks.md)

## 결정 기록

| 결정 | 값 | 출처 |
|---|---|---|
| 레지스트리 | GHCR 공개 `ghcr.io/sinhyeokkang/malmoi`, 매 앱 태그 `/merge`가 발행 | 사용자 2026-10-09 |
| proxy 예제 | nginx | 사용자 2026-10-09 |
| 생성기 action 태그 | v3 — v1.2.6에 배포 | 사용자 2026-10-09 |
| Docker | 사용자가 설치한다. B4는 설치 확인 뒤 띄운다 | 사용자 2026-10-09 |
| 7배치 OAuth·App·메일 왕복(SH-03·04·05·07 [수동]) | **미완으로 리포트** — 프로비저닝하지 않는다. [자동] 판정까지만 | 사용자 2026-10-09 |
| 워커 패밀리 | Claude Code / Opus·Sonnet만. 교차 없음 | 지휘자 판단 — 허가 없음 |
| 패밀리 교차 (한 건) | 마지막 push 게이트 전 **Codex Astra 전체 리뷰 1회 — effort high**(Astra 상한 medium의 이번 한 건 예외, 사용자 2026-10-09 "이번만 특별히") — 리포트 전용, 구현·수정은 Claude 워커 | 사용자 2026-10-09 ("다른 에이전트의 시각이 궁금함") |
| tasks와 다른 배치 경계 | credential target 파서(tasks §1)를 B3로, 공개 응답 정책 순수 함수(tasks §1)를 B5로 옮긴다. hosted 도메인 리터럴 집결과 SH-15 ①은 B1 | 지휘자 판단 — 파일 소유권을 배치 하나로 묶어 병렬을 연다 |
| 모드 잎 모듈 경로 | `lib/deployment/`(신설) — 판정·origin 파서·preflight 순수 함수 | 지휘자 판단 — design §2 "잎 모듈 하나" |
| 0배치 실측 | B1의 첫 단계(코드 커밋 없음). 인라인이면 B1이 멈추고 지휘자가 design §2·§7을 다시 연다 | 지휘자 판단 |

## 배치

| 배치 | 범위(tasks 절) | 소유 파일(이 밖은 건드리지 않는다) | 선행 | 모델·effort | 상태 |
|---|---|---|---|---|---|
| **B1** 정책 | §0 middleware env 실측 · §1(credential 파서·공개 응답 정책 제외) | `lib/deployment/**`(신설) · `lib/github-connect/origin.ts` · `lib/onboarding/workflow.ts` · `lib/seo/site.ts` · `lib/invitation-email/config.ts`(origin 상수만) · `lib/invitation-email/message.ts`(origin 상수만) · `app/(edit)/mcp/page.tsx`(fallback) · `.env.example`(신규 변수) · `lib/i18n/__tests__/brand-spelling.test.ts` · 각 테스트 | — | Opus 5.5 high — origin·토큰 유출 경로라 판단이 무겁다 | ✅ dev |
| **B3** DB·운영 | §3 + credential target 파서 | `deploy/bootstrap.sql`(신설) · `lib/__tests__/self-hosted-bootstrap.integration.ts` · `scripts/gate-plan.ts`·그 테스트 · `lib/credentials/command.ts` · `scripts/finalize-credentials.ts` · `scripts/credentials.ts` · 각 테스트 | — | Opus 5.5 medium | ✅ dev |
| **B2** 서버 경계 | §2 | `lib/upload/**` · `app/api/images/**` · `lib/invitation-email/**`(B1의 상수 자리 제외) · `lib/oauth/**`·`app/.well-known/**`·`lib/mcp/http.ts`(테스트·필요 시 판정 연결) · `app/__tests__/well-known.test.ts` · preflight 기동 진입(`scripts/preflight.ts` 신설) · `prisma/schema.prisma:22` 주석 | B1 | Opus 5.5 high — 파일 저장소 보안 경계 | ✅ dev |
| **B5** 공개 화면 | §5 + 공개 응답 정책 순수 함수 | `middleware.ts` · `app/layout.tsx` · `components/analytics.tsx` · `app/privacy/page.tsx` · `app/signin/page.tsx` · `app/oauth/authorize/page.tsx` · `messages/{en,ko,es}.tsx` · `docs/DESIGN.md` §10.1 행 · `lib/i18n/__tests__/helpers/banned-terms.ts` · `lib/i18n/__tests__/terminology.test.ts` · `components/__tests__/new-project.test.tsx` · `lib/seo/crawl.ts`(필요 시) | B1 | Opus 5.5 medium | ✅ dev |
| **B4** 배포물 | §4 + SH-15 ③·② compose 부분 | `Dockerfile` · `.dockerignore` · `deploy/**`(bootstrap 제외) · `lib/deployment/__tests__/`의 SH-15 ②③ 확장 | B2·B3 · **Docker 설치** | Opus 5.5 medium | 대기 |
| **B6** 문서 | §6 | `.env.example` 산문 · `docs/OPERATIONS.md` · `docs/ACTIONS.md` · `docs/PRODUCT.md` · `docs/ARCHITECTURE.md` · `CLAUDE.md`(+미러) · `README.md` · `docs/DIRECTORY.md` · `.claude/commands/merge.md` · `guide/{en,ko,es}/**` · `guide/SHOOTING.md` | B4·B5 | Sonnet 5.5 medium — 사실 대조 중심, 가이드 세 언어 | 대기 |
| **B7** 릴리스 검증 | §7(왕복 제외) | 코드 수정 없음 — QA 워커, main 체크아웃 | 전부 · Docker | Opus 5.5 medium | 대기 |

### 겹침과 순서

- 웨이브 1: **B1 ∥ B3** — 소유 파일 교집합 0.
- 웨이브 2: **B2 ∥ B5** — B1이 dev에 들어간 뒤. 교집합 0(B2는 사전을 건드리지 않는다).
- 웨이브 3: **B4** — B2·B3 dev 반영 + Docker 확인 뒤.
- 웨이브 4: **B6** — B4·B5 뒤(env·compose 이름과 App 호칭 낱말이 확정돼야 문서가 참이다).
- 웨이브 5: **B7** — main 체크아웃 QA. 그동안 cherry-pick·build 금지.
- ⚠️ dev push는 v1.2.6 동기화 SHA(`d49a7c8b`)의 dev CI가 끝난 뒤에만.

## 진행 기록

(배치별 커밋·push 해시·리뷰 라운드·미완을 여기에 적는다.)

- **B3** — `a49b7b87`·`804ba656`·`7929d971` → dev `b9b70596`(CI success). 리뷰 1회(🔴0 🟡4 — 전부 fix1). 지휘자 판단: package.json에 `credentials:self-hosted`·`credentials:finalize:self-hosted` 추가 허가, 런타임 롤 속성 단언, 회전 전용 사례 생략 수용(target 무관), `_prisma_migrations` REVOKE 승인. 넘길 것: B4 psql 15+·롤 계약(인계 사본 scratchpad `handoff-B3.md`), B6 `log_statement`·`pg_stat_statements`가 성공한 CREATE ROLE 비밀번호도 담는다는 주의.
- **B1** — `f0fc44ef`·`cbedb83e`·`27db2fc1`·`bb17092d` → dev. 0단계 실측: middleware가 env를 런타임에 읽는다(같은 빌드 `x-probe` a/b). 리뷰 1회(🔴0 🟡4). 지휘자 판단: `add.ts` 재배치 허가, 넷째 env 분류 `command` 수용(spec 문언은 B6), `AUTH_GOOGLE_*` required 유지(`auth.ts`가 무조건 등록). 넘길 것: 🟡4 암묵 env 읽기 게이트 → B4, SH-15 ① `ALLOWED` 행 수정 → B2(메일 행만). ⚠️ **tasks §1 삭제 계획 확장을 B1이 하지 않았다**(인계에 미완 표기 없음, 리뷰도 놓침) → B2로 이관.
- 게이트 flaky: `components/__tests__/attention-inbox.test.tsx` "첫 조회 전엔 골격…"이 전체 스위트 부하에서 1회 red(단독 3/3 green). B3 통합 때 재시도로 통과 — 별도 이슈 후보.
- **B5** — 리뷰 1회(🔴0 🟡3). 지휘자 판단: 무효 모드도 self-hosted처럼 숨김(fail-closed) 수용, "Malmoi GitHub App" 금지 승격 보류(사전 전용 단언) 수용, SH-13 해시는 생성기 무변경으로 대체. ⚠️ **B6 필수 항목**: 원고 9파일(en·ko·es × `ai-agents/README.md`·`ai-agents/prompts.md`·`reference/troubleshooting.md`) 치환 + 같은 커밋에서 `banned-terms.ts` ko·es 승격(es `GitHub App de Malmoi` 포함) + `terminology.test.ts` en `TERMS`에 `/\bMalmoi GitHub App\b/` + 사전 전용 describe의 첫 `it`(App 고유명)만 삭제. **B6 전에 `/merge` 금지**(정본과 원고 불일치). 낱말 표: scratchpad `handoff-B5.md`.
- **B2** — `7c9ae991`·`6aa977eb`·`14047966`·`3e83f442`·`26caa6cc` → dev `311cc422`. 리뷰 1회(Opus high, 🔴0 🟡2 — fix1). 지휘자 판단: B1 소유 preflight probe에 `not-directory` 추가 허가, MCP `checkOrigin` self-hosted 정확 일치 수용, B1이 빠뜨린 삭제 계획 확장 완료. flaky 추가: `search-performance.integration` 시간 예산(305ms>300ms) 1회.
- **B5** — `6dc233d6`·`36391223`·`6e333912`·`8a09750a`·`22645070` → dev `2517f8fc`(CI success). 통합 게이트 1회 red(#209 flaky — attention-inbox·user-menu), 재실행 green.
- **웨이브 3 재편** (지휘자 판단): Docker 미설치라 B4는 작성·[자동] 게이트까지 진행하고 [수동]은 B7로 넘긴다. B6를 **B6a**(compose 무관 — 가이드·금지 승격·ACTIONS·정본 SH-14 일부, 지금 B4와 병렬)와 **B6b**(OPERATIONS 설치·복구, `.env.example` 산문, `merge.md` 이미지 발행, DIRECTORY `deploy/`, 운영자 개인정보 재료 — B4 뒤)로 나눈다. 소유 파일 교집합 0.
