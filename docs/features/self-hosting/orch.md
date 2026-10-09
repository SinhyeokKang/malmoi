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
| tasks와 다른 배치 경계 | credential target 파서(tasks §1)를 B3로, 공개 응답 정책 순수 함수(tasks §1)를 B5로 옮긴다. hosted 도메인 리터럴 집결과 SH-15 ①은 B1 | 지휘자 판단 — 파일 소유권을 배치 하나로 묶어 병렬을 연다 |
| 모드 잎 모듈 경로 | `lib/deployment/`(신설) — 판정·origin 파서·preflight 순수 함수 | 지휘자 판단 — design §2 "잎 모듈 하나" |
| 0배치 실측 | B1의 첫 단계(코드 커밋 없음). 인라인이면 B1이 멈추고 지휘자가 design §2·§7을 다시 연다 | 지휘자 판단 |

## 배치

| 배치 | 범위(tasks 절) | 소유 파일(이 밖은 건드리지 않는다) | 선행 | 모델·effort | 상태 |
|---|---|---|---|---|---|
| **B1** 정책 | §0 middleware env 실측 · §1(credential 파서·공개 응답 정책 제외) | `lib/deployment/**`(신설) · `lib/github-connect/origin.ts` · `lib/onboarding/workflow.ts` · `lib/seo/site.ts` · `lib/invitation-email/config.ts`(origin 상수만) · `lib/invitation-email/message.ts`(origin 상수만) · `app/(edit)/mcp/page.tsx`(fallback) · `.env.example`(신규 변수) · `lib/i18n/__tests__/brand-spelling.test.ts` · 각 테스트 | — | Opus 5.5 high — origin·토큰 유출 경로라 판단이 무겁다 | 대기 |
| **B3** DB·운영 | §3 + credential target 파서 | `deploy/bootstrap.sql`(신설) · `lib/__tests__/self-hosted-bootstrap.integration.ts` · `scripts/gate-plan.ts`·그 테스트 · `lib/credentials/command.ts` · `scripts/finalize-credentials.ts` · `scripts/credentials.ts` · 각 테스트 | — | Opus 5.5 medium | 대기 |
| **B2** 서버 경계 | §2 | `lib/upload/**` · `app/api/images/**` · `lib/invitation-email/**`(B1의 상수 자리 제외) · `lib/oauth/**`·`app/.well-known/**`·`lib/mcp/http.ts`(테스트·필요 시 판정 연결) · `app/__tests__/well-known.test.ts` · preflight 기동 진입(`scripts/preflight.ts` 신설) · `prisma/schema.prisma:22` 주석 | B1 | Opus 5.5 high — 파일 저장소 보안 경계 | 대기 |
| **B5** 공개 화면 | §5 + 공개 응답 정책 순수 함수 | `middleware.ts` · `app/layout.tsx` · `components/analytics.tsx` · `app/privacy/page.tsx` · `app/signin/page.tsx` · `app/oauth/authorize/page.tsx` · `messages/{en,ko,es}.tsx` · `docs/DESIGN.md` §10.1 행 · `lib/i18n/__tests__/helpers/banned-terms.ts` · `lib/i18n/__tests__/terminology.test.ts` · `components/__tests__/new-project.test.tsx` · `lib/seo/crawl.ts`(필요 시) | B1 | Opus 5.5 medium | 대기 |
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
