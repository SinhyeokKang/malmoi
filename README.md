# 말모이 (malmoi)

사내 로컬라이제이션 관리 도구(TMS) PoC. 크롬 확장의 `_locales/<locale>/messages.json`에서 출발했고, 개발자가 코드에 심은 소스 문자열을 DB로 올리고(push), 비개발자가 웹 UI에서 번역하고, 그 결과를 고정 브랜치의 PR 하나로 되돌려보낸다(pull). **지금은 어댑터 5종을 읽고 쓴다** — 크롬 `_locales` · JSON 카탈로그 · YAML 카탈로그 · TS/JS 딕셔너리 둘 ([docs/ADAPTER-COVERAGE.md](./docs/ADAPTER-COVERAGE.md)). **리포를 연결하면 로케일 파일을 탐지해 프로젝트를 만들고 첫 적재까지 웹에서 끝낸다**(`/projects/new`) — 대상 리포는 복사용 워크플로 YAML과 그 프로젝트의 push 토큰만 붙인다.

**코어 설계 원칙: 번역 값은 DB가 진실, 소스 키는 코드가 진실.** 각 축에 소유자가 하나뿐이므로 머지 로직이 아예 존재하지 않는다 — export가 DB에서 결정적으로 재생성되므로, git 브랜치가 갈라져도 base에서 다시 따서 파일을 새로 뽑으면 끝난다.

Crowdin/Tolgee 대체가 목표가 아니라 학습·실험이다. **MVP(PoC)는 2026-09-05에 닫혔고 지금은 SaaS화 단계다** — 인증·인가(2단계, 2026-09-06 프로덕션 반영), GitHub 설치 연결(4단계)과 탐지 온보딩(5단계)이 **2026-09-07에 프로덕션까지** 갔다(PR [#9](https://github.com/SinhyeokKang/malmoi/pull/9) → `f595cc3`). **6단계(번역 UI 재작성 + Publish)에 들어갔다** — 6a는 4번의 배송으로 **전부 프로덕션에 나가 닫혔고**(PR [#12](https://github.com/SinhyeokKang/malmoi/pull/12) → `46df51a` · [#14](https://github.com/SinhyeokKang/malmoi/pull/14) → `add099a` · [#15](https://github.com/SinhyeokKang/malmoi/pull/15) → `ef9da44` · [#16](https://github.com/SinhyeokKang/malmoi/pull/16) → `695e441`), 그 뒤 6b가 사이클로 돈다 — 6b-1(어댑터 오류 코드화)·6b-2(멤버 화면)가 프로덕션(PR [#17](https://github.com/SinhyeokKang/malmoi/pull/17) → `982cb42` · [#19](https://github.com/SinhyeokKang/malmoi/pull/19) → `a00d380`), 6b-3(기준 브랜치·기준 로케일)·6b-4(`/account` + 사이드바 2구역)도 프로덕션(PR [#21](https://github.com/SinhyeokKang/malmoi/pull/21) → `7c975c0` · [#22](https://github.com/SinhyeokKang/malmoi/pull/22) → `70e393b`), 6b-5(로케일 화면)·6b-6(프로젝트 Home — 착지점)도 프로덕션(PR [#23](https://github.com/SinhyeokKang/malmoi/pull/23) → `0d68d71`)이다. ✅ **6단계가 프로덕션까지 끝났다.** ✅ **7단계(운영 안전성)도 프로덕션까지 끝났다** (2026-09-10, PR [#26](https://github.com/SinhyeokKang/malmoi/pull/26) → `d0e8688`, 실물 검증 포함) — `SyncRun` 테이블과 동시 실행 차단·stale 복구·안정적 오류 코드·프로젝트 보관·변경 이력(`logs`) 화면이고, **이로써 화면 여덟이 전부 찼다.** 그 뒤 **보안 라운드 셋이 프로덕션까지 갔다** (2026-09-10): sec-audit-2 수정(PR [#27](https://github.com/SinhyeokKang/malmoi/pull/27) → `ff5e8a4`) · **자격증명·개인정보 저장 암호화 + 전체 세션 회수**(PR [#28](https://github.com/SinhyeokKang/malmoi/pull/28) → `9e6854e`) · 평문 email 인덱스 제거(PR [#29](https://github.com/SinhyeokKang/malmoi/pull/29) → `f6933d7`) — dev·prod 양쪽 DB 전환이 끝났다. 🔵 **8단계(UI 재작성)에 들어갔다** (2026-09-10) — Figma 시안 기반이고 배송 단위로 쪼갠다(`docs/features/ui-rework/`). **8-1(signin·초대)이 프로덕션에 나갔다** (PR [#31](https://github.com/SinhyeokKang/malmoi/pull/31) → `718db80`) — 랜딩 페이지가 `/`에 들어올 자리를 비우려고 로그인 화면을 **`/signin`으로 갈랐고**(목적지를 만드는 아홉 자리를 `lib/routes.ts` 하나로 모았다), 그 위에 시안을 입히면서 **전역 규칙 여덟**(neutral 팔레트 · weight 최대 500 · **자간을 크기 토큰이 든다** · radius 12 · elevation 토큰 둘 · 밑줄 없는 링크 · 토스트 피드백 · 2열 패널 골격)이 확정됐다. **8-2(셸)와 8-3(프로젝트 목록)이 dev까지 갔다** (2026-09-10) — 셸은 전폭 48 헤더 · 투명 사이드바 · 흰 콘텐츠 패널 · 320 프로젝트 패널 골격이고 `app/(edit)/projects/[slug]/layout.tsx`가 새로 생겼다. 목록은 2줄 행 · URL 필터(`?filter=`) · 상태 배지 하나 · fluid 폭이고, 사이드바가 시안에 맞춰 접기·스위처·`New project`를 잃고 Help를 얻었다. 전역 규칙의 정본은 [docs/DESIGN.md](./docs/DESIGN.md) §0이다. 포트폴리오 마감이 9단계다. 화면 구조의 정본은 [docs/SAAS.md](./docs/SAAS.md) §7.7이다.

## 문서

| 문서 | 내용 |
|---|---|
| [docs/SAAS.md](./docs/SAAS.md) | **현재 단계 정본(SaaS화).** 범위·보안 모델·단계별 체크리스트·불변식 9개 |
| [docs/MVP.md](./docs/MVP.md) | PoC 스펙 (닫힘). 코어 원칙의 원문·세 흐름의 계약 |
| [docs/TASKS.md](./docs/TASKS.md) | PoC 태스크 기록 (닫힘) + 전역 미결. 지금 할 일은 SAAS.md §8 |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | 불변식과 함정. 코어 로직 건드리기 전 필독 |
| [docs/DESIGN.md](./docs/DESIGN.md) | 편집 UI 시각 규칙 (라이트 단일, 토큰, 대비 함정) |
| [docs/ACTIONS.md](./docs/ACTIONS.md) | 대상 리포에 붙이는 워크플로 |
| [docs/ADAPTER-COVERAGE.md](./docs/ADAPTER-COVERAGE.md) | 어댑터 범용성 실측 — 어댑터·탐지 규칙 손대기 전 필독 |
| [docs/POSTMORTEM.md](./docs/POSTMORTEM.md) | 회귀·버그 회고 (append-only) |
| [docs/features/README.md](./docs/features/README.md) | 기능 문서 인덱스 + 살아 있는 백로그. **스펙이 아니라 근거다** |
| [CLAUDE.md](./CLAUDE.md) | 작업 규칙·명령어·컨벤션 (Codex는 `AGENTS.md` 미러) |

## 스택

Next.js 16 App Router · Supabase Postgres + Prisma 7 · Auth.js v5 DB 세션 (GitHub·Google 로그인 — 인가는 `ProjectMember`) · **저장 시 암호화**(세션은 SHA-256 digest, 회원 개인정보·GitHub App 토큰은 AES-256-GCM, 조회는 별도 HMAC 컬럼) · GitHub App · Tailwind 4 + **자체 프리미티브**(`components/ui/` 17개, Radix 3종) + 앱 셸 + `messages/en.tsx` 단일 사전(**UI는 영어 단일**, `lang="en"`) (**라이트 단일, `dark:` 금지**) · Vercel

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
| 테스트 | `pnpm test` |
| 마이그레이션 | dev: `pnpm db:migrate` / prod 반영: `pnpm db:deploy` / 상태: `pnpm db:status`·`pnpm db:status:prod` |
| 로컬 push | `pnpm push:local <디렉터리> --project <slug>` (⚠️ 인자 필수 — 토큰이 프로젝트를 정한다) |
| 자격증명 전환 | `pnpm credentials:dev` / `credentials:prod` (+ `credentials:finalize:dev`·`:prod`) — 기본 check-only. 절차는 [운영 문서](./docs/features/credential-storage/operations.md) |
| 격리 PostgreSQL 검증 | `pnpm test:credentials:postgres` — ⚠️ `pnpm test`에 **없다**. `lib/credentials/**`를 건드렸으면 손으로 돌린다 |
| Codex 미러 동기화 | `pnpm sync:agents` |

**브랜치는 `main` / `dev` 둘이다** (2026-09-04 분리). 작업은 `dev`에서 하고 **dev push = Vercel preview 배포**, **dev→main squash PR 머지 = 프로덕션 배포**(`https://mal-moi.com`)다. 그 아래 작업 브랜치는 두지 않는다.

게이트가 둘이다: `/push`가 로컬에서 돌리는 `pnpm typecheck` + `pnpm test` + `pnpm build`(dev·preview 앞), 그리고 **PR에 붙는 CI `verify` 체크**(프로덕션 앞 — `/merge`가 그 결론을 본다). ⚠️ **둘 다 못 보는 스위트가 하나 있다** — `pnpm test:credentials:postgres`는 별도 config + 로컬 PostgreSQL이라 `pnpm test`에도 CI에도 없다. GitHub 브랜치 프로텍션은 Free 플랜 + private 조합이라 없으므로, PR CI가 게이트인 것은 `/merge`가 그것을 확인하기 때문이지 서버가 강제해서가 아니다.

preview는 **dev DB**를 본다. preview에서 GitHub 로그인은 dev 브랜치 고정 URL에서만 된다 — OAuth App의 callback URL이 하나뿐이라 preview 전용 앱을 따로 두고 그 URL에 박았다.
