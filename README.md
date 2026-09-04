# 말모이 (malmoi)

사내 로컬라이제이션 관리 도구(TMS) PoC. 크롬 확장의 `_locales/<locale>/messages.json`을 대상으로, 개발자가 코드에 심은 소스 문자열을 DB로 올리고(push), 비개발자가 웹 UI에서 번역하고, 그 결과를 고정 브랜치의 PR 하나로 되돌려보낸다(pull).

**코어 설계 원칙: 번역 값은 DB가 진실, 소스 키는 코드가 진실.** 각 축에 소유자가 하나뿐이므로 머지 로직이 아예 존재하지 않는다 — export가 DB에서 결정적으로 재생성되므로, git 브랜치가 갈라져도 base에서 다시 따서 파일을 새로 뽑으면 끝난다.

Crowdin/Tolgee 대체가 목표가 아니라 학습·실험이다.

## 문서

| 문서 | 내용 |
|---|---|
| [docs/TASKS.md](./docs/TASKS.md) | **태스크 체크리스트.** 단계별 완료 조건, 결정 필요 항목 |
| [docs/DESIGN.md](./docs/DESIGN.md) | 편집 UI 시각 규칙 (라이트 단일, 토큰, 대비 함정) |
| [docs/MVP.md](./docs/MVP.md) | **기본 스펙.** 범위·기술 선택의 근거·세 흐름의 계약·스키마·구현 순서 |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | 불변식과 함정. 코어 로직 건드리기 전 필독 |
| [docs/POSTMORTEM.md](./docs/POSTMORTEM.md) | 회귀·버그 회고 (append-only) |
| [CLAUDE.md](./CLAUDE.md) | 작업 규칙·명령어·컨벤션 (Codex는 `AGENTS.md` 미러) |

## 스택

Next.js 16 App Router · Supabase Postgres + Prisma 7 · Auth.js (GitHub OAuth) · GitHub App · Vercel

## 개발

```bash
pnpm install
cp .env.example .env.local   # 값을 채운다 — 다른 머신의 것을 옮긴다 (CLAUDE.md "새 머신 셋업")
pnpm db:generate             # Prisma 클라이언트 생성 (generated/는 gitignore)
pnpm db:status               # ⚠️ dev DB = prod DB. migrate dev의 리셋 제안은 절대 승인하지 않는다
pnpm dev
```

| 용도 | 명령 |
|---|---|
| 타입 체크 | `pnpm typecheck` |
| 테스트 | `pnpm test` |
| 마이그레이션 | dev: `pnpm db:migrate` / prod 반영: `pnpm db:deploy` / 상태: `pnpm db:status`·`pnpm db:status:prod` |
| Codex 미러 동기화 | `pnpm sync:agents` |

**브랜치는 `main` / `dev` 둘이다** (2026-09-04 분리). 작업은 `dev`에서 하고 **dev push = Vercel preview 배포**, **dev→main squash PR 머지 = 프로덕션 배포**(`https://mal-moi.com`)다. 그 아래 작업 브랜치는 두지 않는다.

게이트가 둘이다: `/push`가 로컬에서 돌리는 `pnpm typecheck` + `pnpm test` + `pnpm build`(dev·preview 앞), 그리고 **PR에 붙는 CI `verify` 체크**(프로덕션 앞 — `/merge`가 그 결론을 본다). GitHub 브랜치 프로텍션은 Free 플랜 + private 조합이라 없으므로, PR CI가 게이트인 것은 `/merge`가 그것을 확인하기 때문이지 서버가 강제해서가 아니다.

preview는 **dev DB**를 본다. preview에서 GitHub 로그인은 dev 브랜치 고정 URL에서만 된다 — OAuth App의 callback URL이 하나뿐이라 preview 전용 앱을 따로 두고 그 URL에 박았다.
