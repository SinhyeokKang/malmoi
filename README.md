# 말모이 (malmoi)

프로젝트는 리포·권한·토큰·Publish를, TranslationSurface는 포맷·적재 상태·키·번역을 소유한다.
여러 활성 표면도 비중첩 경로만 허용하고 프로젝트당 PR 하나로 보낸다.
현재 T16(단계 A): 편집 URL은 `/projects/:slug/surfaces/:surfaceSlug/translations`·`locales`이며
옛 URL은 저장된 기본 표면으로 이동한다. Add surface와 동일 키·언어 코드 공존은 T17–T21에서 열린다.

사내 로컬라이제이션 관리 도구(TMS). 크롬 확장의 `_locales/<locale>/messages.json`에서 출발했고, 개발자가 코드에 심은 소스 문자열을 DB로 올리고(push), 비개발자가 웹 UI에서 번역하고, 그 결과를 고정 브랜치의 PR 하나로 되돌려보낸다(pull). **지금은 어댑터 5종을 읽고 쓴다** — 크롬 `_locales` · JSON 카탈로그 · YAML 카탈로그 · TS/JS 딕셔너리 둘. **리포를 연결하면 로케일 파일을 탐지해 프로젝트를 만들고 첫 적재까지 웹에서 끝낸다**(`/projects/new`) — 대상 리포는 복사용 워크플로 YAML과 그 프로젝트의 push 토큰만 붙인다.

**코어 설계 원칙: 번역 값은 DB가 진실, 소스 키는 코드가 진실.** 각 축에 소유자가 하나뿐이므로 머지 로직이 아예 존재하지 않는다 — export가 DB에서 결정적으로 재생성되므로, git 브랜치가 갈라져도 base에서 다시 따서 파일을 새로 뽑으면 끝난다.

**출시가 목표다** — 낯선 사람이 설명 없이 자기 리포를 연결해 첫 왕복을 끝낼 수 있어야 한다. 수익 모델은 붙이지 않는다. 무엇을 만들고 무엇을 안 만드는지는 [docs/PRODUCT.md](./docs/PRODUCT.md)가 정본이다.

## 문서

| 문서 | 내용 |
|---|---|
| [docs/PRODUCT.md](./docs/PRODUCT.md) | **제품 판정의 정본.** 완료 조건·역할과 권한표·범위/비범위·설계 결정·IA |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | **불변식과 함정.** §0 불변식 열하나 · 결정성 · 어댑터 실측 근거 · 스키마 · 보안 모델. 코어 로직 건드리기 전 필독 |
| [docs/DIRECTORY.md](./docs/DIRECTORY.md) | 어디에 무엇이 있고 왜 그렇게 생겼나 |
| [docs/DESIGN.md](./docs/DESIGN.md) | UI 시각 규칙 (라이트 단일, 토큰, 대비 함정) |
| [docs/OPERATIONS.md](./docs/OPERATIONS.md) | 키 회전·복구·전면 재발급 절차 |
| [docs/ACTIONS.md](./docs/ACTIONS.md) | 대상 리포에 붙이는 워크플로 |
| [docs/POSTMORTEM.md](./docs/POSTMORTEM.md) | 회귀·버그 회고 (append-only) |
| [CLAUDE.md](./CLAUDE.md) | 작업 규칙·명령어·컨벤션 (Codex는 `AGENTS.md` 미러) |

## 스택

Next.js 16 App Router · Supabase Postgres + Prisma 7 · Auth.js v5 DB 세션 (GitHub·Google 로그인 — 인가는 `ProjectMember`) · **저장 시 암호화**(세션은 SHA-256 digest, 회원 개인정보·GitHub App 토큰은 AES-256-GCM, 조회는 별도 HMAC 컬럼) · GitHub App · Tailwind 4 + **자체 프리미티브**(`components/ui/` 19개, Radix — DropdownMenu·Dialog·Slot·RadioGroup) + `sonner` 토스트 + 앱 셸 + `messages/en.tsx` 단일 사전(**UI는 영어 단일**, `lang="en"`) (**라이트 단일, `dark:` 금지**) · Vercel

## 개발

```bash
nvm use                      # .nvmrc = 24
pnpm install
cp .env.example .env.local   # 값을 채운다 — 다른 머신의 것을 옮긴다. 에이전트가 편집하지 않는다 (CLAUDE.md "새 머신 셋업")
pnpm db:generate             # Prisma 클라이언트 생성 (generated/는 gitignore)
pnpm db:status && pnpm db:status:prod   # dev·prod가 별 Supabase 프로젝트다 — migrate는 dev만, prod 반영은 db:deploy(/merge 1단계)
pnpm dev
```

⚠️ **암호화 키 여섯**(`*_ENCRYPTION_KEYS`·`*_ACTIVE_KEY_ID`·`EMAIL_LOOKUP_KEY`·`_KEY_ID`)은 **환경별 독립 난수**다 — 비면 로그인·초대·멤버 조회가 통째로 죽는다. 형식과 prod 키 배선은 `.env.example` 주석에 있다.

| 용도 | 명령 |
|---|---|
| 타입 체크 | `pnpm typecheck` |
| 빌드 | `pnpm build` — ⚠️ `/push` 로컬 게이트 셋의 하나다. `tsc`는 RSC 경계를 못 본다 |
| 테스트 | `pnpm test` |
| 로케일 적재 | `pnpm ingest <디렉터리>` — 포맷 탐지 → 키 적재 → 왕복 검증 |
| 사용처 스캔 | `pnpm scan <디렉터리>` — `refs` 수집 |
| 어댑터 범용성 측정 | `pnpm adapter-survey docs/adapter-survey/repos.txt` — 읽기 전용, 네트워크 |
| GitHub App 스모크 | `pnpm smoke:github <slug>` — 읽기만 |
| Blob 저장소 스모크 | `pnpm smoke:blob` — 실 API. 고아 후보는 목록만 내고 지우지 않는다 |
| 마이그레이션 | dev: `pnpm db:migrate` / prod 반영: `pnpm db:deploy` / 상태: `pnpm db:status`·`pnpm db:status:prod` / 브라우저: `pnpm db:studio` (dev) |
| 로컬 push | `pnpm push:local <디렉터리> --project <slug>` (⚠️ 인자 필수 — 토큰이 프로젝트를 정한다) |
| 자격증명 전환·회전 | `pnpm credentials:dev` / `credentials:prod` — 기본 check-only. 절차는 [docs/OPERATIONS.md](./docs/OPERATIONS.md) |
| 격리 PostgreSQL 검증 | `pnpm test:credentials:postgres` · `pnpm test:projects:postgres` — ⚠️ 둘 다 `pnpm test`에 **없다**. 앞은 `lib/credentials/**`, 뒤는 표면 backfill·복합 FK·push 격리·미발송 술어 일치를 검사하므로 `lib/keys/**`·`lib/surfaces/**`·`lib/push/apply.ts`를 건드렸을 때 손으로 돌린다 |
| Codex 미러 동기화 | `pnpm sync:agents` |

**브랜치는 `main` / `dev` 둘이다.** 작업은 `dev`에서 하고 **dev push = Vercel preview 배포**, **dev→main squash PR 머지 = 프로덕션 배포**(`https://mal-moi.com`)다. 그 아래 작업 브랜치는 두지 않는다.

**린터가 없다** — ESLint/Prettier/Biome 미도입이라 `pnpm lint`는 존재하지 않고, 스타일 게이트가 곧 타입 체크와 테스트다. 게이트가 둘이다: `/push`가 로컬에서 돌리는 `pnpm typecheck` + `pnpm test` + `pnpm build`(dev·preview 앞), 그리고 **PR에 붙는 CI `verify` 체크**(프로덕션 앞 — `/merge`가 그 결론을 본다). ⚠️ **둘 다 못 보는 스위트가 둘 있다** — `pnpm test:credentials:postgres`·`pnpm test:projects:postgres`는 별도 config + 로컬 PostgreSQL이라 `pnpm test`에도 CI에도 없다. GitHub 브랜치 프로텍션은 Free 플랜 + private 조합이라 없으므로, PR CI가 게이트인 것은 `/merge`가 그것을 확인하기 때문이지 서버가 강제해서가 아니다.

preview는 **dev DB**를 본다. preview에서 GitHub 로그인은 dev 브랜치 고정 URL에서만 된다 — OAuth App의 callback URL이 하나뿐이라 preview 전용 앱을 따로 두고 그 URL에 박았다.
