# CLAUDE.md

## 응답 스타일 (이 문서의 다른 모든 규칙보다 우선)

**한국어로, 간결하게.** 위반 시 답변을 다시 쓴다. 아래는 취향이 아니라 판정 기준이다.

- **첫 문장이 결론**: 서두·예고 금지 — "~해보겠습니다", "좋은 질문입니다", "확인해보니 다음과 같습니다" 류로 시작하지 않는다. 바로 답/결과부터.
- **꾸밈말 금지**: "완벽합니다", "훌륭한", "핵심적인", "말씀하신 대로" 같은 평가·동조 표현을 빼도 정보가 안 줄면 뺀다.
- **재진술 금지**: 방금 보여준 diff·명령 출력·파일 내용을 산문으로 다시 설명하지 않는다. 코드가 말하는 건 코드가 말하게 둔다.
- **길이 상한**: 단순 질문·확인 → 3줄 이내. 작업 완료 보고엔 줄 수 상한이 없다 — 필요한 정보를 줄이면서까지 짧게 만들지 않는다. 대신 위의 재진술·꾸밈말 금지로 군더더기만 덜어낸다.
- **미완·실패를 먼저**: 못 한 것·실패한 테스트·건너뛴 범위를 성공 요약보다 앞에 쓴다.
- **선택지 나열 금지**: 추천 하나를 고르고 그 이유 한 줄. 사용자 결정이 필요한 지점(작업 원칙의 "가정을 명시")만 예외.
- **예외**: 코드·커밋 메시지·PR title/body는 영문.

강제 장치는 2단이다: 이 섹션(두 런타임 공통 — Codex는 `AGENTS.md` 미러로 받는다)과, `.claude/settings.json`의 `UserPromptSubmit` 훅이 매 턴 같은 규칙 요약을 컨텍스트에 재주입하는 것(긴 세션에서 문서 앞쪽이 희석되는 걸 막는다). **훅은 Claude Code 전용이라 Codex 세션에선 이 섹션만 남는다.**

i18n-poc: 사내 로컬라이제이션 관리 도구(TMS) PoC. 크롬 확장의 `_locales/<locale>/messages.json`을 대상으로, 개발자가 코드에 심은 소스 문자열을 DB로 올리고(push), 비개발자 동료가 웹 UI에서 번역하고, 그 결과를 고정 브랜치의 PR 하나로 되돌려보낸다(pull). Crowdin/Tolgee 대체가 목표가 아니라 학습·실험이고, 사내에서 실제로 한 번 써볼 수 있는 수준이 목표다.

**기본 스펙 문서는 [docs/MVP.md](./docs/MVP.md)다.** 무엇을 만들고 무엇을 안 만드는지, 각 기술 선택의 근거, 세 흐름(push·편집 UI·pull)의 단계별 계약, 스키마, 구현 순서가 전부 거기 있다. **작업을 시작하기 전에 읽고, 설계 결정이 바뀌면 코드보다 먼저 그 문서를 고친다.** 이 문서(CLAUDE.md)는 *어떻게 작업하는가*를 다루고, MVP.md는 *무엇을 만드는가*를 다룬다.

## 코어 설계 원칙: 번역 값은 DB가 진실, 소스 키는 코드가 진실

**이 프로젝트의 유일한 축이고, 여기서 파생되지 않는 복잡도는 전부 의심 대상이다.** (원문·근거는 [docs/MVP.md](./docs/MVP.md) §2)

두 종류의 데이터에 각각 소유자를 하나씩 배정한다. 소스 키(어떤 문자열이 존재하는가)는 **코드만** 안다. 각 축에 소유자가 하나뿐이므로 **머지 로직이 아예 존재하지 않는다** — export는 DB에서 결정적으로 재생성되니, git 브랜치가 갈라져도 base에서 다시 따서 파일을 새로 뽑으면 끝난다. 3-way merge도, 충돌 해소 UI도, "누가 이겼나" 판정도 없다.

**번역 값의 진실은 시점에 따라 갈린다** (strict 정책 — MVP §3.1): push 시점엔 리포가 DB를 덮고, 그 사이엔 DB가 진실이며 pull이 리포로 되돌려준다. 어느 순간에도 **두 쪽을 병합하지 않는다** — 이 원칙이 실제로 지키는 것은 "단일 소유자"가 아니라 **"병합 없음"** 이다.

따라서:

- **push는 리포 값으로 번역을 덮는다** (`ON CONFLICT DO UPDATE`, strict). 변경 감지도 병합도 없다. **대가는 편집 손실 창이다** — 번역자가 편집한 뒤 pull PR이 머지되기 전에 코드가 푸시되면 그 편집이 사라진다 (MVP §3.1). 정책을 느슨하게 하면(변경 감지·병합) 이 원칙이 요구하는 단순성이 무너진다.
- **키는 삭제하지 않는다.** 코드에서 사라진 키도 `orphaned` 플래그만 세운다 — 브랜치를 되돌리거나 기능을 복구하면 번역이 그대로 살아 돌아와야 한다. 삭제는 되돌릴 수 없어 이 원칙을 깬다.
- **pull은 파일을 편집하지 않고 생성한다.** 기존 파일 내용을 읽어 병합하는 코드가 생기면 그 순간 DB의 단독 소유권이 깨진다. 읽는 것은 오직 **변경 여부 판정**을 위한 blob SHA뿐이다.
- **export는 결정적이어야 한다.** 같은 DB 상태 → 언제나 바이트 단위로 같은 파일. 이게 깨지면 blob SHA 비교가 매번 "변경됨"을 뱉어 무의미한 커밋이 쌓이고, 변경 감지 최적화 전체가 무너진다.

## 작업 원칙

- **가정을 명시**: 해석이 여러 개면 조용히 하나 고르지 말고 선택지를 제시. 불확실하면 물어라.
- **더 단순한 방법이 있으면 제안**: 200줄을 50줄로 줄일 수 있으면 줄여라. 요청하지 않은 유연성·설정 가능성·추상화 추가 금지. **이 프로젝트는 PoC다** — 확장성을 위한 선반영은 그 자체가 결함이다.
- **외과적 변경**: 요청과 직접 관련 없는 인접 코드 개선·리팩터 금지. 기존 스타일 따르기. 기존 dead code는 언급만 하고 삭제하지 않는다 — 내 변경이 만든 고아만 제거.
- **검증 가능한 목표로 전환**: "버그 고쳐" → "재현 테스트 작성 후 통과시켜". 멀티스텝 작업은 단계별 검증 체크를 포함한 플랜을 먼저 제시.
- **테스트 우선**: 신규 인터페이스(함수·헬퍼·어댑터) 추가 시 테스트를 먼저 작성하고 구현한다. 기존 로직 변경 시에도 관련 순수 함수의 단위 테스트를 작성/갱신하고 `pnpm test` 통과를 확인한 뒤 작업을 마친다. 테스트 없이 코드만 변경하지 않는다.

## 스택

**버전은 2026-08-31 기준으로 실제 설치·빌드 검증된 조합이다.** 임의로 올리지 않는다 — 특히 `next-auth`는 beta라 마이너 변경에 API가 움직인다.

| 영역 | 선택 | 버전 |
|---|---|---|
| 앱 | Next.js App Router (React 19, TypeScript) | `next` 16.3.3 / `react` 19.2.8 / `typescript` 7.0.2 |
| 배포 | Vercel — main 머지가 곧 프로덕션 | — |
| DB | Supabase Postgres (`i18n-poc`, ref `xgsyyapzkpbdtkrprlmn`) | — |
| 테넌시 | **스키마에 `Project` 테넌트 경계가 있고 SaaS 기능은 없다.** 인증은 단일 테넌트(`AUTH_ALLOWED_LOGINS` — 허용 GitHub 핸들 목록), 운영 대상은 `ACTIVE_PROJECT_SLUG` 하나 | — |
| ORM | Prisma 7 — **접속 URL이 스키마에 없다.** 마이그레이션은 `prisma.config.ts`(`DIRECT_URL`, 5432) / 런타임은 driver adapter(`DATABASE_URL`, 6543) | `prisma`·`@prisma/client`·`@prisma/adapter-pg` 7.10.0 + `pg` 8.23.0 |
| 로그인 | Auth.js v5 GitHub provider, **JWT 세션** (DB 어댑터 없음) | `next-auth` 5.0.0-beta.32 |
| 리포 쓰기 | GitHub App — `octokit`의 `App`을 쓴다 (`@octokit/auth-app` 별도 설치 불필요) | `octokit` 5.0.5 |
| 스타일 | Tailwind CSS 4 — **`tailwind.config.js`가 없다.** 테마는 `app/globals.css`의 `@theme` | `tailwindcss`·`@tailwindcss/postcss` 4.3.3 |
| UI | shadcn/ui (CLI `shadcn@4.19.0`, style `new-york`) — **라이트 단일, `dark:` 금지**. 시각 규칙은 [docs/DESIGN.md](./docs/DESIGN.md) | `radix-ui` 1.6.7 (단일 통합 패키지 — `@radix-ui/react-*` 개별 설치 아니다) |
| 아이콘·토스트 | `lucide-react` 1.37.0 / `sonner` 2.0.8 | |
| 폰트 | **Pretendard Variable 동적 서브셋, 자사 호스트** | `pretendard` 1.3.9 |
| 검증 | Zod 4 — `/api/push` 페이로드 등 외부 진입점 | `zod` 4.5.4 |
| **키·원문 출처** | **리포의 로케일 파일** — 어댑터가 양방향으로 읽고 쓴다 (`lib/adapters/`) | — |
| 사용처 수집 | `ts-morph` AST + 정규식 — **`refs` 전담, 실패는 경고** | `ts-morph` 28.0.0 |
| 스크립트 실행 | `tsx` — `scripts/scan.ts` CLI 실행용 | `tsx` 4.23.13 |
| 테스트 | Vitest (순수 함수 단위) | `vitest` 4.1.11 |
| Node | `.nvmrc` **20** — `@types/node`를 이 메이저에 맞춘다(`^20`) | `@types/node` 20.19.43 |
| DB 접속 | Supabase 리전 `ap-northeast-1` (도쿄). 직결 `db.<ref>.supabase.co`는 IPv6 전용이라 Vercel에서 안 붙으므로 **마이그레이션도 pooler**를 쓴다 | — |

**린터·다크모드·가상 스크롤·테이블 라이브러리는 없다.** 필요해지면 그때 넣는다 (`next-themes`·`@tanstack/*` 미설치).

**⚠️ `app/globals.css`의 `@custom-variant dark` 한 줄이 라이트를 고정한다.** Tailwind v4는 `dark:`의 기본 동작이 `prefers-color-scheme`이라, **그 줄을 지우면 shadcn 생성 컴포넌트의 `dark:` 클래스가 OS 다크에서 살아난다.** 상세는 [docs/DESIGN.md](./docs/DESIGN.md) §3.1.

### Prisma 7 — v6와 배선이 다르다

`url`·`directUrl`이 스키마에서 제거되고 driver adapter가 필수가 됐다. v6 문서·예제를 그대로 적용하면 valid하지 않다.

| 용도 | 위치 | 환경변수 | 포트 |
|---|---|---|---|
| 마이그레이션·CLI | `prisma.config.ts` | `DIRECT_URL` | 5432 (session) |
| 런타임 쿼리 | `lib/db.ts` (`PrismaPg` adapter) | `DATABASE_URL` | 6543 (transaction) |

- 클라이언트는 `generated/prisma/`로 생성된다 (**gitignore된 산출물** — CI가 typecheck 전에 `db:generate`를 돌린다). import는 `@/generated/prisma/client`
- `prisma.config.ts`가 **`.env.local`을 명시적으로 읽는다.** `dotenv` 기본값은 `.env`라서 경로를 안 주면 URL이 `undefined`가 되고 `P1001 Can't reach database server`로 오진하게 된다
- **⚠️ dev DB와 prod DB가 같다.** Supabase 인스턴스가 하나뿐이라 `migrate dev`가 프로덕션을 직접 바꾼다. 번역 데이터가 쌓인 뒤로는 `--create-only` + `db:deploy`로 쪼개고, **`migrate dev`의 리셋 제안은 절대 승인하지 않는다** (번역이 전부 날아간다). 상세는 `/db`

### 데이터 변경 경로 — 내부는 Server Action, 외부 진입점만 Route Handler

| 경로 | 형태 | 호출자 |
|---|---|---|
| 번역 값 저장, pull 트리거 | **Server Action** (`app/(edit)/actions.ts`) | 편집 UI |
| `/api/push` | Route Handler | GitHub Actions (Bearer `PUSH_TOKEN`) |
| `/api/pull` | Route Handler | 편집 UI 버튼 + Vercel Cron (`CRON_SECRET`) |

**내부 쓰기에 Route Handler를 새로 만들지 않는다.** 클라이언트 fetch 배선과 중복 스키마가 생기고, `revalidate`를 손으로 배선해야 한다. 역으로 **외부가 부르는 진입점을 Server Action으로 만들지 않는다** — Actions는 안정된 공개 계약이 아니다.

### 세션은 JWT — 권한 회수가 최대 24시간 지연된다

`session: { strategy: "jwt", maxAge: 60 * 60 * 24 }`. 허용 핸들 목록 검사는 **최초 로그인 시 1회**(`signIn` 콜백) 돌고 핸들을 토큰에 박는다. 따라서 **목록에서 빠진 사람이 최대 하루 동안 편집할 수 있다.** 이걸 받아들이는 대가로 사용자 테이블 4개(`User`·`Account`·`Session`·`VerificationToken`)와 요청마다의 DB 왕복이 사라지고 스키마가 5테이블로 유지된다. 즉시 회수가 필요해지면 `@auth/prisma-adapter`로 DB 세션으로 바꾼다 — 그때 `maxAge`를 줄이는 것으로 때우지 않는다.

### 키 리스트는 가상화하지 않는다

네임스페이스 필터로 자르면 한 화면이 보통 수십~수백 행이다. `@tanstack/react-virtual`·`react-table`을 넣지 않고 순수 렌더로 시작한다. **실제로 느려지는 네임스페이스가 관측되면** 그때 대응한다 — 인라인 편집과 가상 스크롤을 섞으면 스크롤 튐·포커스 유실 함정이 붙는다.

### 폰트 — Pretendard 동적 서브셋 (생성물)

단일 `PretendardVariable.woff2`는 **2.0MB**다. 동적 서브셋은 92개 구간으로 쪼개져 있고 브라우저가 `unicode-range`로 필요한 구간만 받으므로 ko/en/fr 혼용 UI에서 실 전송량이 150~450KB 수준이다.

- `scripts/copy-fonts.mjs`가 `node_modules/pretendard`에서 `public/fonts/pretendard/`로 복사한다. `predev`·`prebuild`가 자동 실행한다
- **`public/fonts/`는 생성물이라 `.gitignore`에 있다** (3.1MB, 92파일)
- CSS의 `url()`이 `./woff2-dynamic-subset/...` 상대 경로다. **디렉터리 구조를 바꾸면 폰트가 조용히 404가 되고 시스템 폰트로 떨어진다**
- `<link>`로 `app/layout.tsx`가 불러온다 — `globals.css`의 `@import`로 넣으면 스타일시트 체인이 직렬화돼 폰트 요청이 한 단계 늦게 시작된다
- **`.npmrc`의 `enable-pre-post-scripts=true`가 이 자동 실행을 보장한다.** pnpm 버전에 따라 기본값이 달라지고, 안 돌면 에러도 경고도 없이 폰트만 빠진다. 이 파일을 지우지 않는다

**두 GitHub 자격증명을 섞지 않는다.** OAuth 토큰으로 커밋하면 커밋이 특정 개인 명의가 되고 그 사람이 org를 떠나면 파이프라인이 깨진다. 로그인은 OAuth, 쓰기는 App — 경계를 넘는 코드가 보이면 리뷰에서 막는다.

## 명령어

| 용도 | 명령 |
|---|---|
| 개발 서버 | `pnpm dev` |
| 빌드 | `pnpm build` (`next build`) |
| 타입 체크만 | `pnpm typecheck` |
| 테스트 | `pnpm test` |
| 테스트 (watch) | `pnpm test:watch` |
| 마이그레이션 생성·적용 (로컬) | `pnpm db:migrate` (`DIRECT_URL` 사용) |
| 마이그레이션 적용 (배포) | `pnpm db:deploy` |
| 마이그레이션 상태·드리프트 | `pnpm db:status` |
| Prisma 클라이언트 재생성 | `pnpm db:generate` |
| DB 브라우저 | `pnpm db:studio` |
| shadcn 컴포넌트 추가 | `pnpm dlx shadcn@4.19.0 add <name>` (버전 고정 — latest는 생성 코드가 움직인다) |
| 로케일 적재 | `pnpm ingest <대상 디렉터리> [--json] [--base <locale>]` (포맷 탐지 → 키 적재 → 왕복 검증) |
| 사용처 스캔 | `pnpm scan <대상 디렉터리> [--json] [--wrapper <module>#<export>]` (`refs` 수집 — **항상 exit 0**) |
| 로컬 push | `pnpm push:local <대상 디렉터리> [--url ...] [--wrapper ...] [--adapter ...] [--project <slug>]` (적재+스캔+POST) |
| 폰트 재복사 | `node scripts/copy-fonts.mjs` (predev·prebuild가 자동 실행) |
| Codex 미러 동기화 | `pnpm sync:agents` (검사만: `pnpm sync:agents:check`) |

**린터 없음** — ESLint/Prettier/Biome 미도입이라 `pnpm lint`는 존재하지 않는다. 스타일 게이트는 `pnpm typecheck` + `pnpm test`뿐이고, 린터 추가는 요청 없이 하지 않는다.

### CI (GitHub Actions)

`ci.yml` 하나뿐이고 job은 `verify`(typecheck + test + Codex 미러 드리프트) 단일이다. 트리거는 **main push + 수동(`workflow_dispatch`)** 뿐이다 — 브랜치가 하나라 PR 이벤트가 발생하지 않는다.

**⚠️ CI는 게이트가 아니라 사후 확인이다.** main 단일 브랜치라 push가 곧 배포이고, CI는 그 push **이후에** 돈다. required status check로 무언가를 막을 수 있는 지점이 없다. **프로덕션 앞의 유일한 게이트는 `/push` 1단계의 로컬 `pnpm typecheck` + `pnpm test`다** — 이걸 건너뛰면 아무것도 검증되지 않은 채 배포된다.

CI가 여전히 있는 이유는 셋: 로컬 환경 의존성을 걷어낸 깨끗한 체크아웃에서 도는지 확인, 다른 창구(웹 UI·Codex·다른 머신)에서 들어온 커밋 검증, Codex 미러 드리프트 차단. **CI에서 `next build`를 돌리지 않는다** — 로컬 게이트(`/push` 1단계)가 이미 돌고 Vercel이 배포에서 다시 돈다. CI에 넣으면 같은 걸 세 번 돌리면서 정작 **배포 후에** 알려주는 층만 늘어난다.

**빌드는 `/push` 1단계 게이트에서만 자동 실행한다.** 개별 작업 중에는 `pnpm typecheck`를 쓴다 — `/implement`가 `pnpm build`를 돌리지 않는 것은 그 때문이고, 게이트가 `/push`에 있어서다.

## 디렉터리 구조

```
app/
  layout.tsx            루트 레이아웃 (Pretendard <link>)
  globals.css           Tailwind 4 @theme + shadcn 토큰 (tailwind.config.js 없음)
  (edit)/               편집 UI (인증 필요 — 차단은 middleware.ts)
    layout.tsx          셸 + 헤더. 2차 방어로 redirect() (조건부 렌더는 차단이 아니다)
    keys/page.tsx       키 테이블 — 로케일이 열, 모든 셀 편집 가능
    actions.ts          Server Action — saveTranslation (유일한 사용자 mutation)
  api/push/route.ts     CI → DB (Bearer PUSH_TOKEN, maxDuration 60)
  api/auth/[...nextauth]/  Auth.js v5 핸들러
  api/pull/route.ts     (미구현) DB → PR (수동 버튼 + Vercel Cron)
middleware.ts           ⚠️ 인증 차단의 유일한 1차 지점 (matcher에 보호 라우트 등록)
components/
  translation-input.tsx 인라인 편집 (client — blur 시 저장)
  ui/                   shadcn 생성물 (직접 편집해도 되지만 CLI 재실행 시 덮인다)
lib/
  adapters/             양방향 로케일 어댑터 — 리포 포맷을 읽고 같은 포맷으로 쓴다
    index.ts            detectFormat / adapterFor / ADAPTERS(우선순위)
    shared.ts           재생성 writer의 결정성 규칙 + 후보 순위·검증
    chrome-locales.ts   _locales/{locale}/messages.json (재생성)
    json-catalog.ts     {dir}/{locale}.json (flat|중첩, 배열 인덱스 — 재생성)
    ts-dict.ts          src/i18n/namespaces/*.ts (⚠️ 수술적 치환 — 원본 내용 필요)
  env.ts                환경변수 단일 접근점 (fail-closed, PEM 개행 복원)
  db.ts                 getPrisma() — 지연 생성 싱글턴 (pg adapter, 6543, server-only)
  utils.ts              cn() — shadcn 표준 헬퍼
  githash.ts            sha1("blob <len>\0" + content) — 로컬 blob SHA
  github.ts             (미구현) Git Data API 래퍼 (App 토큰)
  scan/                 사용처(`refs`) 수집 전담 — 진실이 아니다 (에러가 아니라 경고)
  push/                 plan.ts(순수 판정) / apply.ts(벌크 I/O) / auth.ts(fail-closed)
  auth/allow.ts         허용 핸들 목록 판정 (fail-closed)
  keys/                 view.ts(순수 — 집계·배지·permalink) / save.ts(순수 — 저장 판정)
                        / query.ts(조회, server-only)
types/next-auth.d.ts    session.user.login 타입 확장
prisma/
  schema.prisma         5테이블 (Project 테넌트 경계 / 접속 URL 없음 — Prisma 7)
  migrations/           _init, _add_project_tenant_boundary, _add_project_locale_format
prisma.config.ts        마이그레이션 접속 URL (DIRECT_URL) + .env.local 로드
generated/prisma/       ⚠️ 생성물 (gitignore) — prisma generate
public/fonts/           ⚠️ 생성물 (gitignore) — scripts/copy-fonts.mjs
scripts/
  sync-agents.mjs       Claude Code 원본 → Codex 미러 생성기
  copy-fonts.mjs        Pretendard 동적 서브셋 복사 (predev·prebuild)
  scan.ts               사용처 스캔 CLI
  ingest.ts             로케일 적재 CLI
  push-local.ts         적재+스캔+POST — TASK 7 워크플로가 할 일과 같은 순서
auth.ts                 Auth.js v5 설정 (인가는 signIn 콜백)
docs/MVP.md             기본 스펙
docs/TASKS.md           태스크 체크리스트 (완료 조건 + 🔒 결정 필요)
docs/DESIGN.md          편집 UI 시각 규칙 (라이트 단일, mono 표면 불변식)
docs/ARCHITECTURE.md    설계 상세·함정
docs/POSTMORTEM.md      회귀·버그 회고 누적
```

## 아키텍처 원칙

설계 상세와 함정은 **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** 가 단일 출처다. `lib/adapters/`·`lib/githash.ts`·`lib/github.ts`·`lib/scan/`·`lib/push/`를 건드리기 전에 읽는다. 요약:

- **export 결정성 3규칙 (재생성 방식)**: 키는 코드포인트 오름차순 정렬, 들여쓰기 2칸, 파일 끝 개행 정확히 1개. `orphaned` 키는 export에서 제외(DB엔 남으므로 되돌릴 수 있다). **수술적 치환(`ts-dict`)은 이 규칙을 지나지 않는다** — 원본 순서·공백·주석을 보존하는 것이 그 방식의 요지다 (ARCHITECTURE §1.1).
- **변경 감지는 API 호출 전에 끝낸다**: blob SHA를 로컬에서 계산해 base 트리와 비교하고, 전부 같으면 GitHub API를 **한 번도** 부르지 않는다. 야간 cron이 매일 도는데 변경이 없는 날이 대부분이라 이게 기본 경로다. **`ts-dict`는 write에 원본 내용이 필요해 이 최적화가 그대로 성립하지 않는다** (MVP §3.3 — 파일당 blob 읽기 1회).
- **커밋 parents는 항상 base의 head, 브랜치는 force update**: `l10n/sync`는 누적 히스토리가 아니라 "현재 DB 상태의 스냅샷"이다. 3-way merge를 피하는 게 코어 원칙이므로 fast-forward를 지키려 하지 않는다.
- **커밋 메시지에 `[skip-l10n]`**: 이 마커가 없으면 pull이 만든 커밋이 main에 머지될 때 push가 다시 돌아 무한 루프가 된다.
- **PR은 하나를 재사용**: 열린 PR이 있으면 새로 만들지 않는다. PoC 리포에 PR 수십 개가 쌓이면 사람이 안 본다.

## 브랜치 정책 & 배포

**`main` 단일 브랜치다.** 작업 브랜치도 PR도 없다.

- **main push = Vercel 프로덕션 배포.** 별도 배포 명령이 없고, 그래서 `/deploy`도 `/merge`도 없다. `/push`가 배포 스킬이다.
- **preview 배포가 없다.** 브랜치가 하나라 Vercel이 preview를 붙일 대상이 없다. 배포 전에 눈으로 보려면 `pnpm dev`로 로컬에서 확인한다.
- **PR 전 CI 게이트가 없다.** PR이 없으므로 CI는 배포 후에 돈다 (위 CI 섹션).
- **GitHub 브랜치 프로텍션도 없다.** Free 플랜 + private 리포 조합에서 GitHub이 거부한다 (`403: Upgrade to GitHub Pro or make this repository public`).
- **버전·tag 없음.** 웹앱이라 semver가 소비자에게 의미를 주지 않는다.

### 그래서 게이트가 전부 로컬에 있다

서버 측에 막는 장치가 하나도 없다는 뜻이다. **프로덕션 앞에 서 있는 것은 `/push` 1단계의 `pnpm typecheck` + `pnpm test`, 그리고 `/ship`의 단계별 게이트뿐이다.** 이 구조에서:

- **`/push`의 로컬 검증 게이트를 건너뛰면 아무것도 검증되지 않은 채 배포된다.** "CI가 잡아줄 것"은 성립하지 않는다.
- **로컬 게이트가 `pnpm build`를 포함한다** (2026-08-31 추가). `tsc`는 RSC 경계를 못 본다 — `"use client"` 누락, 서버 컴포넌트의 클라이언트 훅, Server Action 직렬화 위반은 `next build`만 잡는다. 콜드 5초 / 웜 2초라 게이트 비용이 무시할 수준이고, **CI에 넣으면 배포 후에 알게 되므로 로컬에 둔다.**
- **`/ship`의 게이트는 "다음 단계로 갈 자격"이 아니라 "배포될 자격"이다.** 애매한 통과는 곧 사고다.
- **되돌리는 유일한 방법은 다음 배포다.** revert 커밋을 push하는 것 말고는 롤백 경로가 없다.
- **`git push --force`는 기본 금지.** main이 유일한 브랜치라 히스토리가 하나뿐이고, 날아가면 복구할 곳이 없다.

### DB 마이그레이션은 배포와 순서가 얽힌다

`pnpm db:deploy`를 **push 전에** 돌려 프로덕션 스키마를 먼저 넓힌다(additive-first). 컬럼 삭제·타입 변경은 코드 배포가 끝난 다음 별도 마이그레이션으로. 이 순서를 어기면 배포 순간 프로덕션이 없는 컬럼을 조회한다. `/push` 3단계가 마이그레이션을 감지해 확인을 요구하지만 그건 안전망이고, 순서를 아는 건 `/db`의 책임이다.

## 워크플로우 (스킬 라인업)

스킬 **11개**의 역할·단계별 게이트는 `.claude/commands/<name>.md`에 정의돼 있고, Codex 미러는 `.agents/skills/source-command-<name>/SKILL.md`다 (`/push`만 미러 제외).

`/feature` · `/feature-review` · `/tdd` · `/implement` · `/code-review` · `/refactor` · `/db` · `/push` · `/pull` · `/postmortem` · `/ship`

권장 흐름: `/feature` → `/tdd interface` → `/implement` → `/code-review` → `/refactor` → (`/db`) → `/push`. 작은 변경은 `/ship` 하나로 전 단계를 오케스트레이션하며, **`/ship`은 프로덕션 배포까지 간다.**

- **무엇을 할지는 `docs/TASKS.md`에서 시작한다.** 단계별 태스크와 완료 조건이 거기 있고, `/tdd`는 그 "검증:" 줄을 테스트 케이스로 쓰고, `/push`는 통과한 것만 체크한다. `/feature`는 TASKS의 한 단계가 설계 문서를 요구할 만큼 클 때만 부르고, `/feature-review`는 그 산출물이 커서 4관점 크로스체크가 필요할 때만 부른다.

- **`/merge`·`/sync`는 삭제됐다.** main 단일 브랜치가 되면서 존재 이유가 사라졌다 (dev→main PR도, dev 재동기화도 없다). 이 이름을 부르는 지침이 남아 있으면 오래된 문서다.
- **배포하지 않고 커밋만 쌓고 싶으면 `/ship`을 쓰지 않고 개별 스킬로 진행한다.**
- **스키마를 건드렸으면 `/push` 전에 `/db`** — 마이그레이션 파일이 코드와 같은 커밋에 들어가야 하고, 배포 순서 판정(additive-first)도 여기서 한다.
- **회귀·버그를 잡아 고쳤으면 `/postmortem`** 으로 `docs/POSTMORTEM.md`에 회고를 남긴다. 역으로 `/implement`·`/refactor`·`/code-review`는 **착수 전 변경 영역으로 `docs/POSTMORTEM.md`를 grep**해 과거 함정을 소환한다 — 쓰기만 하고 안 읽으면 죽은 로그다.
- **`/l10n-roundtrip`은 아직 없다.** push→편집→pull 왕복을 실제 리포로 검증하는 스킬인데, 세 흐름이 다 서기 전엔 만들 게 없다. `/api/pull`이 동작하는 시점에 추가한다.

## 문서 신선도

문서가 6개뿐이라 `/doc-check` 같은 전수 대조 스킬을 두지 않는다. `/push`가 **푸시될 diff에 걸린 문서만** 트라이아지한다 (대상·트리거는 `.claude/commands/push.md` 4단계). 갱신은 문서별 별도 커밋(`docs(CLAUDE): ...` / `docs(ARCHITECTURE): ...`).

- **docs/DESIGN.md** — 편집 UI 시각 규칙. UI를 만들거나 고칠 때 필독. 토큰 값의 진실은 `app/globals.css`이고 `components.json`의 `baseColor`는 CLI 시드일 뿐이다. 새 raw 색을 늘렸으면 §6.2에 등재한다. 커밋 prefix `docs(DESIGN): ...`
- **docs/TASKS.md** — **태스크 체크리스트.** 완료 조건이 붙은 단계별 목록. **`lib/`·`app/`·`prisma/`에 실질 변경이 있으면 거의 항상 걸린다** — 코드를 고쳤는데 체크박스가 그대로면 그 문서는 거짓이다. 검증 조건이 실제로 통과한 태스크만 체크한다. 커밋 prefix `docs(TASKS): ...`
- **docs/MVP.md** — **기본 스펙.** 범위·기술 선택·세 흐름의 계약·스키마·구현 순서. 기능을 추가/삭제했거나 기술 선택을 바꿨거나 비범위 항목을 범위로 끌어들였으면 **여기부터** 갱신한다 (코드가 스펙을 앞서면 스펙이 거짓이 된다). §10 "아직 안 정한 것"에서 결정된 항목은 본문으로 올리고 목록에서 뺀다. 커밋 prefix `docs(MVP): ...`
- **CLAUDE.md** — 명령어 표, 스택, 브랜치·배포, 스킬 라인업, 코드 컨벤션
- **docs/ARCHITECTURE.md** — export 결정성, blob SHA 비교, 커밋·PR 전략, 스캐너 계약, 스키마
- **docs/POSTMORTEM.md** — 회고 누적 (append-only, `/postmortem` 전담)

`.env.example`도 문서로 취급한다 — **새 환경변수를 코드에서 읽었으면 같은 커밋에서 `.env.example`에 추가**한다. 빠지면 새 체크아웃·Vercel 재설정에서 원인 불명으로 죽는다.

## 코드 컨벤션

- **커밋 메시지는 영문**, Conventional Commits (`feat:` `fix:` `test:` `refactor:` `docs(scope):` `chore:`).
- **주석은 한국어로, "왜"만 쓴다.** 코드가 말하는 "무엇"을 반복하지 않는다. 특히 **비자명한 제약·함정·과거에 밟은 지뢰**를 남긴다 (예: "pooler로 마이그레이션하면 DDL 세션을 못 잡아 실패한다").
- **순수 함수를 먼저 분리한다.** export 생성·blob SHA·키 추출·정렬은 I/O 없는 순수 함수여야 하고, 그래서 테스트가 가능하다. DB·GitHub 호출은 얇은 껍데기로 감싼다.
- **`any` 금지**, `noUncheckedIndexedAccess`가 켜져 있으니 인덱스 접근은 undefined를 처리한다.
- **환경변수는 한 곳에서 읽는다** — 흩어진 `process.env` 접근은 누락된 변수를 런타임까지 숨긴다.
- **⚠️ 환경변수를 읽는 코드를 모듈 최상위에서 평가하지 않는다.** 함수 안에 두고 호출 시점에 읽는다. 최상위 평가는 "파일을 읽기만 해도 죽는다"를 뜻하고, `.env`가 없는 CI에서 import·빌드만으로 실패한다 (`prisma.config.ts`가 이걸로 CI를 red로 만든 전례 — `docs/POSTMORTEM.md` 2026-08-31). 함수 안에 있어도 그 함수를 최상위 `const`가 부르면 같은 문제다.
- **서버 전용 모듈엔 `import "server-only"`.** 클라이언트 번들 유입을 컴파일 타임에 막는다. **단 테스트가 직접 import하는 순수 모듈(`lib/env.ts` 등)엔 붙이지 않는다** — 이 패키지는 `react-server` 조건 밖에서 던져서 vitest가 죽는다.
- **날짜는 UTC로 저장**, 표시 시점에만 로컬로 변환.
- **⚠️ 인증 차단은 `middleware.ts`에만 의존한다.** 레이아웃·페이지의 조건부 렌더는 차단이 아니다 — App Router가 둘을 병렬로 렌더해 페이지가 이미 실행되고 RSC 페이로드가 응답에 실린다(실측 1.3MB 노출). 레이아웃에서는 `redirect()`를 던진다. **새 보호 라우트는 `matcher`에 추가한다** (ARCHITECTURE §6.1).
- **⚠️ 로케일 파일이 키의 진실, 코드 스캔은 `refs`만 준다.** 스캔 실패로 적재를 막지 않는다 — 남의 리포 CI를 우리 규칙으로 실패시키지 않는다 (ARCHITECTURE §4).
- **⚠️ 새 writer를 만들면 `lib/adapters/shared.ts`의 결정성 규칙을 쓴다.** 정렬·재조립·2칸·끝 개행 1개를 직접 구현하지 않는다 (ARCHITECTURE §1.1).
- **⚠️ 모든 DB 쿼리는 `projectId`로 좁힌다.** 인덱스가 전부 `projectId` 선두 복합이라 안 좁히면 풀스캔이고, 더 중요하게는 **테넌트 간 데이터가 새는 경로가 된다.** 인가가 아직 단일 테넌트라 애플리케이션이 유일한 방어선이다 (RLS 없음).

## 게이트웨이 (알아두면 유용)

- **`prisma`의 npm `latest` 태그가 RC를 가리킨다.** 2026-08 시점 `latest`가 `8.0.0-rc.12`고 stable은 `prev` 태그의 `7.10.0`이다. `pnpm add prisma`로 무심코 깔면 RC가 들어오고 `alchemy`·`cloudflare-runtime` 같은 무관한 의존성이 딸려온다. **버전을 명시해 깐다.**
- **Supabase pooler와 Prisma**: `DATABASE_URL`에 `?pgbouncer=true`가 없으면 prepared statement 충돌로 간헐 실패한다. 증상이 "가끔 되고 가끔 안 됨"이라 진단이 오래 걸린다.
- **Vercel Cron은 Hobby 플랜에서 하루 1회**다. 야간 pull 1회가 요구사항이라 지금은 맞지만, 주기를 늘리려면 플랜을 봐야 한다.
- **GitHub App 개인키는 개행이 들어간 PEM**이다. Vercel env에 넣을 때 개행이 `\n` 문자열로 이스케이프되므로 읽는 쪽에서 복원해야 한다. 안 하면 JWT 서명이 조용히 실패한다.
- **`.pem`은 `.gitignore`에 있다.** 이 패턴이 뚫리면 리포 쓰기 권한이 새어나간다.
- **`orphaned`는 삭제가 아니다.** export에서만 빠지고 DB엔 남는다. "번역이 사라졌다"는 제보를 받으면 먼저 이 플래그를 본다.

## 명시적 비범위

**정본은 [docs/MVP.md](./docs/MVP.md) §7이다.** 요청받아도 먼저 그 목록을 근거로 되묻는다 — PoC 범위를 지키는 게 이 프로젝트의 성패다.

큰 축만: ICU 복수형, 동시 편집, 다중 프로젝트, 세밀한 권한, in-context 편집, 스크린샷 첨부, 번역자 노트, 승인 워크플로, push 웹훅.

컨텍스트 제공은 **코드 참조 자동 수집 + 네임스페이스 단위 그룹핑** 두 개까지다. 편집 UI의 성패가 컨텍스트에 달려 있지만, 그 답이 "기능을 더 넣기"는 아니다.

## 메모리 & 참고 문서

- **`docs/TASKS.md` — 태스크 체크리스트. 지금 무엇을 해야 하는지의 정본. 착수 전 필독**
- **`docs/DESIGN.md` — 편집 UI 시각 규칙. UI 작업 전 필독**
- **`docs/MVP.md` — 기본 스펙. 범위·근거·세 흐름의 계약. 작업 착수 전 필독**
- `docs/ARCHITECTURE.md` — 설계 상세·함정 (코어 로직 건드리기 전 필독)
- `docs/POSTMORTEM.md` — 과거 함정 (`/implement`·`/refactor`·`/code-review` 착수 전 grep)
- `~/code/bugshot-2` — 이 하네스의 원본이자, 셋업 완료 후 push/pull 실전 테스트 대상(ko/en/fr 3개 로케일). **하네스를 참고할 때 그 리포의 i18n 구현을 조사 대상으로 삼지 않는다.**
- `~/.claude/projects/-Users-sinhyeokkang-code-i18n-poc/memory/` — Claude Code 전용 개인 메모리 (Codex는 읽지 않는다)
