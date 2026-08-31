# i18n-poc

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
cp .env.example .env.local   # 값을 채운다
pnpm db:migrate              # 로컬 스키마 적용
pnpm dev
```

| 용도 | 명령 |
|---|---|
| 타입 체크 | `pnpm typecheck` |
| 테스트 | `pnpm test` |
| 마이그레이션 | `pnpm db:migrate` / 상태: `pnpm db:status` |
| Codex 미러 동기화 | `pnpm sync:agents` |

**브랜치는 `main` 단일이다.** PR도 preview 배포도 없고, **main push가 곧 Vercel 프로덕션 배포**다. CI는 push 이후에 돌므로 게이트가 아니라 사후 확인이다 — 프로덕션 앞의 유일한 게이트는 `/push`가 로컬에서 돌리는 `pnpm typecheck` + `pnpm test`다.
