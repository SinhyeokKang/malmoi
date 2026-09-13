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

강제 장치는 2단이다: 이 섹션(두 런타임 공통 — Codex는 `AGENTS.md` 미러로 받는다)과, `.claude/settings.json`의 `UserPromptSubmit` 훅이 매 턴 **이 절의 요약**을 컨텍스트에 재주입하는 것(긴 세션에서 문서 앞쪽이 희석되는 걸 막는다). **훅은 Claude Code 전용이라 Codex 세션에선 이 섹션만 남는다.**

## 이 프로젝트

말모이(`malmoi`): 사내 로컬라이제이션 관리 도구(TMS). **이름은 1910년대 조선어사전 편찬 사업에서 왔다** — 흩어진 말을 여러 사람이 모아 하나로 만드는 일이 이 도구가 하는 일이다. 표기는 문서 본문 `말모이`, 코드·리포명·slug·도메인 `malmoi`.

리포의 로케일 파일(JSON·YAML·TS/JS 딕셔너리)을 대상으로, 개발자가 코드에 심은 소스 문자열을 DB로 올리고(push), 비개발자 동료가 웹 UI에서 번역하고, 그 결과를 고정 브랜치의 PR 하나로 되돌려보낸다(pull). **무엇을 만들고 무엇을 안 만드는지는 [docs/PRODUCT.md](./docs/PRODUCT.md)가 정본이다** — 비범위는 §4.2이고, 요청받아도 먼저 그 목록을 근거로 되묻는다.

## 코어 설계 원칙: 번역 값은 DB가 진실, 소스 키는 코드가 진실

**이 프로젝트의 유일한 축이고, 여기서 파생되지 않는 복잡도는 전부 의심 대상이다.**

두 종류의 데이터에 각각 소유자를 하나씩 배정한다. 소스 키(어떤 문자열이 존재하는가)는 **코드만** 안다. 각 축에 소유자가 하나뿐이므로 **머지 로직이 아예 존재하지 않는다** — export는 DB에서 결정적으로 재생성되니, git 브랜치가 갈라져도 base에서 다시 따서 파일을 새로 뽑으면 끝난다. 3-way merge도, 충돌 해소 UI도, "누가 이겼나" 판정도 없다.

**번역 값의 진실은 시점에 따라 갈린다** (strict 정책): push 시점엔 리포가 DB를 덮고, 그 사이엔 DB가 진실이며 pull이 리포로 되돌려준다. 어느 순간에도 **두 쪽을 병합하지 않는다** — 이 원칙이 실제로 지키는 것은 "단일 소유자"가 아니라 **"병합 없음"** 이다.

따라서:

- **push는 리포 값으로 번역을 덮고 저자도 비운다** (`ON CONFLICT DO UPDATE`, `"updatedBy" = NULL`). 변경 감지도 병합도 없다. **덮인 값의 저자는 리포이므로 사람 이름이 남는 쪽이 거짓이었다.** 미배포 집계(`countUnpublished`·`isUnpublished`)가 그 조건 위에 선다 — `updatedAt`만 보면 push가 전 행의 시각을 올려 code push 직후 903키 전부가 "안 보낸 편집"이 된다. **대가는 편집 손실 창이다** — 번역자가 편집한 뒤 pull PR이 머지되기 전에 코드가 푸시되면 그 편집이 사라진다.
- **키는 삭제하지 않는다.** 코드에서 사라진 키도 `orphaned` 플래그만 세운다 — 브랜치를 되돌리거나 기능을 복구하면 번역이 그대로 살아 돌아와야 한다.
- **pull은 값을 병합하지 않는다.** **모든 어댑터가 원본 파일 내용을 읽는다** — 수술적 치환(`ts-dict`·`yaml-catalog`·`code-dict`)은 **구조**(빈 줄·주석·키 순서)를, 재생성(`chrome-locales`·`json-catalog`)은 **표현**(들여쓰기·한 줄 컨테이너·이스케이프·필드 순서)을 가져온다. 어느 쪽도 **값**은 아니다. 기존 값과 DB 값을 견줘 고르는 코드가 생기는 순간 이 원칙이 깨진다.
- **export는 결정적이어야 한다.** 같은 DB 상태 → 언제나 바이트 단위로 같은 파일. 이게 깨지면 blob SHA 비교가 매번 "변경됨"을 뱉어 무의미한 커밋이 쌓이고, 변경 감지 최적화 전체가 무너진다.

**불변식 열하나의 정본은 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) §0**이다.

## 작업 원칙

- **가정을 명시**: 해석이 여러 개면 조용히 하나 고르지 말고 선택지를 제시. 불확실하면 물어라.
- **더 단순한 방법이 있으면 제안**: 200줄을 50줄로 줄일 수 있으면 줄여라. 요청하지 않은 유연성·설정 가능성·추상화 추가 금지. **확장성을 위한 선반영은 그 자체가 결함이다.**
- **외과적 변경**: 요청과 직접 관련 없는 인접 코드 개선·리팩터 금지. 기존 스타일 따르기. 기존 dead code는 언급만 하고 삭제하지 않는다 — 내 변경이 만든 고아만 제거.
- **검증 가능한 목표로 전환**: "버그 고쳐" → "재현 테스트 작성 후 통과시켜". 멀티스텝 작업은 단계별 검증 체크를 포함한 플랜을 먼저 제시.
- **테스트 우선**: 신규 인터페이스(함수·헬퍼·어댑터) 추가 시 테스트를 먼저 작성하고 구현한다. 기존 로직 변경 시에도 관련 순수 함수의 단위 테스트를 작성/갱신하고 `pnpm test` 통과를 확인한 뒤 작업을 마친다. 테스트 없이 코드만 변경하지 않는다.

## 스택

**버전을 임의로 올리지 않는다** — 특히 `next-auth`는 beta라 마이너 변경에 API가 움직인다.

| 영역 | 선택 | 버전 |
|---|---|---|
| 앱 | Next.js App Router (React 19, TypeScript) | `next` 16.3.3 / `react` 19.2.8 / `typescript` 7.0.2 |
| 배포 | Vercel — **dev push = preview / main 머지 = 프로덕션**(`https://mal-moi.com`) | — |
| DB | Supabase Postgres **둘** — prod(`malmoi`, ref `xgsyyapzkpbdtkrprlmn`) / dev(`malmoi-dev`, ref `bfugwmjubgmmroevrave`) | — |
| ORM | Prisma 7 — **접속 URL이 스키마에 없다.** 마이그레이션은 `prisma.config.ts`(`DIRECT_URL`, 5432) / 런타임은 driver adapter(`DATABASE_URL`, 6543) | `prisma`·`@prisma/client`·`@prisma/adapter-pg` 7.10.0 + `pg` 8.23.0 |
| 로그인 | Auth.js v5 **DB 세션** — GitHub + Google. 로그인은 **검증된 이메일만** 요구하고 그것이 아무것도 열지 않는다 — 인가는 `ProjectMember`다. ⚠️ **Google 동의 화면은 External + 테스트**여야 한다(Internal은 조직 밖 계정을 `403 org_internal`로 막아 초대 경로를 통째로 죽인다) | `next-auth` 5.0.0-beta.32 + `@auth/prisma-adapter` 2.11.3 (`@auth/core@0.41.3` 고정) |
| 리포 쓰기 | GitHub App **installation 토큰** — `octokit`의 `App` | `octokit` 5.0.5 |
| 계정 연결 | 같은 App의 **user-to-server 토큰**. ⚠️ `octokit`이 재수출하는 `OAuthApp`으로는 안 된다(`clientType: "oauth-app"`으로 고정된 클래스라 github-app 모드가 타입상 `never`로 접힌다) | `@octokit/oauth-app` 8.0.4 |
| 스타일 | Tailwind CSS 4 — **`tailwind.config.js`가 없다.** 테마는 `app/globals.css`의 `@theme` | `tailwindcss`·`@tailwindcss/postcss` 4.3.3 |
| UI | **`components/ui/`를 이 리포가 소유한다** — 프리미티브 18개 + `radix-ui`에서 DropdownMenu·Dialog·Slot·RadioGroup 넷. **라이트 단일, `dark:` 금지**. 시각 규칙은 [docs/DESIGN.md](./docs/DESIGN.md) | `radix-ui` 1.6.7 (단일 통합 패키지) · `class-variance-authority` |
| 아이콘·폰트 | `lucide-react` / **Pretendard Variable 동적 서브셋, 자사 호스트** | 1.37.0 / `pretendard` 1.3.9 |
| 검증 | Zod 4 — `/api/push` 페이로드 등 외부 진입점 | `zod` 4.5.4 |
| YAML | `yaml` — **CST 보존 수술적 치환용**(`parseDocument`). ⚠️ **고정 이유가 둘이다**: `lib/onboarding/budget.ts`가 **`Parser`의 내부 `stack`을 읽는다** — 공개 API가 아니라 버전이 올라가면 조용히 모양이 바뀌고, 그때 red를 내는 것은 `budget.test.ts`뿐이다 | `yaml` 2.9.0 |
| 사용처 수집 | `ts-morph` AST + 정규식 — **`refs` 전담, 실패는 경고** | `ts-morph` 28.0.0 |
| 테스트 | Vitest — **순수 함수 단위 + DOM**(파일 머리의 `// @vitest-environment jsdom`. ⚠️ **기본은 그대로 `node`다** — 전역으로 켜면 순수 모듈 수백 개가 이유 없이 jsdom을 세운다) | `vitest` 4.1.11 · `jsdom` 27.4.0 · `@testing-library/user-event` 14.6.1 |
| Node | `.nvmrc` **24**. **정본은 Vercel 프로젝트의 Node.js Version이다** — 프로덕션이 그 버전으로 빌드하므로 로컬·CI가 따라간다 | `@types/node` 24.13.3 |
| DB 접속 | Supabase 리전 `ap-northeast-1`(도쿄). 직결은 IPv6 전용이라 Vercel에서 안 붙으므로 **마이그레이션도 pooler**를 쓴다. ⚠️ **Vercel 함수도 같은 리전에 둔다**(`vercel.json`의 `regions: ["hnd1"]`) — 기본 `iad1`에서는 홉당 ~375ms였다 | — |

**린터·다크모드·가상 스크롤·테이블 라이브러리는 없다.** 필요해지면 그때 넣는다 — ⚠️ **가상화를 넣지 않는 근거는 실측이고 [ARCHITECTURE §1.95](./docs/ARCHITECTURE.md)에 있다**(24키 프로젝트도 3.29초였다: 병목이 행 수가 아니라 함수 리전이었다). `pnpm lint`는 존재하지 않고 스타일 게이트는 `pnpm typecheck` + `pnpm test`뿐이다.

⚠️ **`app/globals.css`의 `@custom-variant dark` 한 줄이 라이트를 고정한다.** Tailwind v4는 `dark:`의 기본 동작이 `prefers-color-scheme`이라, **그 줄을 지우면 누가 `dark:`를 하나 쓰는 순간 OS 다크에서 살아난다.** 지금 소스에 `dark:`는 0곳이지만 그 줄은 남긴다 — 막는 것이 요지다 (DESIGN §3.1).

### Prisma 7 — v6와 배선이 다르다

`url`·`directUrl`이 스키마에서 제거되고 driver adapter가 필수가 됐다. v6 문서·예제를 그대로 적용하면 valid하지 않다.

| 용도 | 위치 | 환경변수 | 포트 | 어느 DB |
|---|---|---|---|---|
| 마이그레이션 생성·상태 | `prisma.config.ts` | `DIRECT_URL` | 5432 | **dev** |
| 마이그레이션 **프로덕션 반영** | `prisma.config.ts` (`PRISMA_TARGET=prod`) | `DIRECT_URL_PROD` | 5432 | **prod** |
| 런타임 쿼리 | `lib/db.ts` (`PrismaPg` adapter) | `DATABASE_URL` | 6543 | 로컬·Preview는 dev / 프로덕션은 prod |

- **`PRISMA_TARGET`을 사람이 넘기지 않는다** — `package.json`의 `db:deploy`·`db:status:prod`가 세운다. 없으면 dev(안전한 쪽)로 떨어진다.
- 클라이언트는 `generated/prisma/`로 생성된다 (**gitignore된 산출물**). import는 `@/generated/prisma/client`
- `prisma.config.ts`가 **`.env.local`을 명시적으로 읽는다.** `dotenv` 기본값은 `.env`라서 경로를 안 주면 URL이 `undefined`가 되고 `P1001`로 오진하게 된다
- ⚠️ **`prisma.config.ts`에서 `env("DIRECT_URL")`을 쓰지 않는다.** 그 헬퍼는 config **로드 시점에** 던지고 이 파일은 `prisma generate`에도 로드되므로, `.env.local`이 없는 환경(Vercel·새 체크아웃)의 `pnpm build`가 통째로 죽는다. `datasource`는 **조건부로 넣는다**. 같은 파일이 같은 이유로 두 번 터졌다 (POSTMORTEM 2026-08-31 + 🔁 재발)
- **dev DB와 prod DB가 갈려 있다.** `pnpm db:migrate`가 프로덕션에 **닿을 수 없다** — dev에만 적용하고 `db:deploy`를 잊으면 배포 순간 프로덕션이 없는 컬럼을 조회한다. 그래서 **`/merge` 1단계가 `pnpm db:status:prod`를 확인한다.** `--create-only` + `db:deploy`로 쪼개는 습관은 유지한다(생성한 SQL을 프로덕션에 보내기 전에 눈으로 본다). **dev에서는 리셋을 승인해도 된다**(`push:local`로 복구된다).

### 데이터 변경 경로 — 내부는 Server Action, 외부 진입점만 Route Handler

| 경로 | 형태 | 호출자 |
|---|---|---|
| 번역 값 저장, pull 트리거 | **Server Action** (`app/(edit)/actions.ts`) | 편집 UI |
| 초대·멤버·보관·프로젝트 생성·온보딩 | **Server Action** (`app/(edit)/projects/actions.ts` 등) | 편집 UI |
| 초대 수락 | **Server Action** (`app/invite/actions.ts`) | 초대 링크 — **인가 예외**, 토큰이 대신한다 |
| `/api/push` | Route Handler | GitHub Actions — Bearer가 **그 프로젝트의 토큰 원문**이다 |
| `/api/pull` | Route Handler | Vercel Cron만 (`CRON_SECRET`) |

**내부 쓰기에 Route Handler를 새로 만들지 않는다** — 클라이언트 fetch 배선과 중복 스키마가 생기고 `revalidate`를 손으로 배선해야 한다. 역으로 **외부가 부르는 진입점을 Server Action으로 만들지 않는다** — Actions는 안정된 공개 계약이 아니다.

### GitHub 자격증명이 셋이고, 섞지 않는다

| 무엇 | 어디서 | 무엇을 하나 |
|---|---|---|
| OAuth App 토큰 | Auth.js provider (`AUTH_GITHUB_*`) | **로그인** — 이 사람이 누구인가 |
| GitHub App **user-to-server** 토큰 | `lib/github-connect/user.ts` (`GITHUB_APP_CLIENT_*`) | **연결** — 이 사람이 우리 App의 어느 설치를 볼 수 있는가. **GET만** |
| GitHub App **installation** 토큰 | `lib/github.ts` (`GITHUB_APP_ID`·`GITHUB_APP_PRIVATE_KEY`) | **쓰기** — 커밋·PR |

OAuth 토큰으로 커밋하면 커밋이 특정 개인 명의가 되고 그 사람이 org를 떠나면 파이프라인이 깨진다. 경계를 넘는 코드가 보이면 리뷰에서 막고, `lib/github-connect/__tests__/credential-separation.test.ts`가 소스에서 상시로 센다.

여기에 `GITHUB_APP_SLUG` 하나가 더 붙는데 자격증명이 아니다 — 설치 링크 조립용이고 `optionalEnv`라 **없으면 그 링크만 조용히 사라진다**.

### 암호화 키도 셋이고, 섞지 않는다

**저장된 것은 전부 봉투·해시이고 원문은 쿠키와 프로세스 메모리에만 있다.** 키 목록·회전·복구 절차는 [docs/OPERATIONS.md](./docs/OPERATIONS.md)가 정본이다. ⚠️ **PII 키를 잃으면 회원 이메일·이름을 복구할 수 없다** — 키와 백업을 쌍으로 보관한다.

## 명령어

| 용도 | 명령 |
|---|---|
| 개발 서버 / 빌드 / 타입 / 테스트 | `pnpm dev` · `pnpm build` · `pnpm typecheck` · `pnpm test` (watch: `test:watch`) |
| 마이그레이션 생성·적용 (**dev**) | `pnpm db:migrate` |
| 마이그레이션 프로덕션 반영 | `pnpm db:deploy` — 이름 그대로 **prod 전용** |
| 마이그레이션 상태 | `pnpm db:status` (dev) · `pnpm db:status:prod` (prod — `/merge` 1단계가 본다) |
| Prisma 재생성 / DB 브라우저 | `pnpm db:generate` · `pnpm db:studio` |
| 로케일 적재 | `pnpm ingest <디렉터리> [--json] [--base <locale>] [--adapter <name>]` |
| 사용처 스캔 | `pnpm scan <디렉터리> [--json] [--wrapper <module>#<export>[()]]...` (**결과가 어떻든 exit 0**) |
| 로컬 push | `pnpm push:local <디렉터리> --project <slug> [--url ...] [--wrapper ...] [--adapter ...] [--base <locale>]` |
| 어댑터 범용성 측정 | `pnpm adapter-survey <리포목록.txt> [--verdicts <파일>] [--json] [--out <파일>]` (읽기 전용, exit 0) |
| GitHub App 스모크 | `pnpm smoke:github <project-slug>` (**읽기만** — 실 API라 `pnpm test` 밖이다) |
| Codex 미러 동기화 | `pnpm sync:agents` (검사만: `pnpm sync:agents:check`) |
| 자격증명 전환·회전 | `pnpm credentials:dev` / `credentials:prod` — 기본 **check-only**. 절차는 OPERATIONS.md |
| 격리 PostgreSQL 검증 | `pnpm test:credentials:postgres` — ⚠️ **`pnpm test`에 없다.** `lib/credentials/**`를 건드렸으면 손으로 돌린다 |

### 새 머신 셋업 (체크아웃 3개 산출물이 전부 gitignore다)

**두 대에서 작업한다.** 새 체크아웃은 `node_modules`·`generated/prisma`·`public/fonts`·`.env.local`이 전부 없고, 앞의 셋은 명령으로 복구되지만 **`.env.local`만 사람이 채운다.**

1. **Node를 `.nvmrc`에 맞춘다**(24). **어긋났을 때 맞추는 방향은 Vercel 쪽이다** — 프로덕션이 진실이고 `.nvmrc`가 따라간다.
2. `pnpm install`
3. `cp .env.example .env.local` 후 값을 채운다. ⚠️ **암호화 키 여섯이 비면 로그인·초대·멤버 조회가 통째로 죽는다.** **⚠️ 이 파일은 에이전트가 편집하지 않는다** — 편집하면 하네스가 "파일이 바뀌었다" 알림으로 **전문을 컨텍스트에 넣어** 시크릿이 트랜스크립트에 남는다(2026-09-04에 실제로 유출돼 전면 재발급했다). 구조가 필요하면 **다른 경로에 템플릿을 쓰고** 사람이 값을 채워 옮긴다. ⚠️ **`vercel env pull`로는 못 가져온다** — 전부 Vercel의 **Sensitive**라 CLI도 대시보드도 값을 못 읽는다. **다른 머신의 `.env.local`을 옮기는 것이 정상 경로**다.
   - ⚠️ **GitHub OAuth 앱이 셋인데 `.env.local`이 갖는 건 로컬 앱 하나뿐이다**(callback URL을 앱당 하나만 등록할 수 있다): 프로덕션 → Vercel Production 스코프 / preview → Vercel Preview 스코프 / 로컬 → `.env.local`(두 머신이 공유).
   - ⚠️ **Google은 반대로 클라이언트가 하나다** — redirect URI를 여러 개 등록할 수 있어 로컬·preview·프로덕션 셋을 한 클라이언트에 넣고 같은 값을 세 곳에 둔다.
4. `pnpm db:status`(dev) · `pnpm db:status:prod`(prod)로 접속을 확인한다. ⚠️ 두 출력이 **같아 보인다**(pooler 호스트가 같고 ref는 사용자명에 있다) — 구별 신호는 **적용된 마이그레이션 개수**다.
5. `pnpm db:generate` — 안 하면 `@/generated/prisma/client`를 못 찾는다.
6. `pnpm typecheck && pnpm test`로 셋업 확인. 폰트는 `predev`가 복사한다.

⚠️ **`vercel env add`는 환경을 하나씩만 받고, `--force`를 믿지 말고 목록으로 확인한다** (CLI 59.11 실측). Preview에서 `--force`가 `✓ Overrode`를 출력하고도 값이 그대로였다. 갱신 뒤 `vercel env ls <environment>`의 시각 열을 보고, 안 바뀌었으면 `vercel env rm … --yes` 후 다시 넣는다. **성공 메시지가 근거가 아니다.** 값은 stdin으로 넘긴다 — `--value`는 `ps`에 노출된다.

### 폰트 — Pretendard 동적 서브셋 (생성물)

`scripts/copy-fonts.mjs`가 `node_modules/pretendard`에서 `public/fonts/pretendard/`로 복사하고 `predev`·`prebuild`가 자동 실행한다. **`public/fonts/`는 생성물이라 `.gitignore`에 있다**(3.1MB, 92파일). CSS의 `url()`이 상대 경로라 **디렉터리 구조를 바꾸면 폰트가 조용히 404가 되고 시스템 폰트로 떨어진다**. `<link>`로 `app/layout.tsx`가 불러온다(`@import`로 넣으면 스타일시트 체인이 직렬화돼 폰트 요청이 한 단계 늦게 시작된다). **`.npmrc`의 `enable-pre-post-scripts=true`가 그 자동 실행을 보장한다 — 이 파일을 지우지 않는다.**

### CI (GitHub Actions)

`ci.yml` 하나뿐이고 job은 `verify`(`db:generate` + typecheck + test + Codex 미러 드리프트) 단일이다. ⚠️ **`permissions: contents: read`가 job에 박혀 있고 `uses:` 셋이 40자 SHA로 핀돼 있다** — 이 job은 `pnpm test`로 임의 프로젝트 코드를 돈다. 트리거는 **push `[main, dev]` + pull_request `[main]` + 수동**이다.

| 트리거 | 무엇을 막나 |
|---|---|
| push `[dev]` | dev에 red가 쌓이는 것. preview 배포와 같은 커밋을 검증한다 |
| pull_request `[main]` | **프로덕션 머지 게이트.** `/merge`가 이 결론을 본다 |
| push `[main]` | 머지 뒤 확인 + 다른 창구(웹 UI·Codex·다른 머신)가 main을 직접 친 경우 |

⚠️ **GitHub 브랜치 프로텍션은 없다**(Free + private). PR CI가 게이트인 것은 **`/merge`가 그것을 보기 때문**이지 서버가 강제해서가 아니다. **CI에서 `next build`를 돌리지 않는다** — 로컬 게이트가 이미 돌고 Vercel이 배포에서 다시 돈다.

## 브랜치 정책 & 배포

**`main` / `dev` 두 브랜치다.** 그 아래 작업 브랜치는 두지 않는다 — 혼자 작업이라 층을 하나 더 얹으면 스스로 연 PR을 스스로 머지하는 형식만 남는다.

| 브랜치 | 무엇 | 어떻게 들어가나 |
|---|---|---|
| `dev` | 상시 작업 브랜치. **push = Vercel preview 배포** (dev DB를 본다) | `/push` |
| `main` | 프로덕션. **머지 = Vercel 프로덕션 배포** (`https://mal-moi.com`) | `/merge` (dev→main squash PR) |

- **GitHub default branch는 `dev`다.** ⚠️ **대상 리포의 composite action 참조는 `@l10n-push-v1`(불변 태그)이고 `@main`이 아니다** — 그 스텝에 `secrets.PUSH_TOKEN`이 들어가므로 `main`에 닿는 커밋 하나가 대상 리포 러너에서 즉시 돈다. 태그를 옮기는 것이 릴리스다.
- **`main`에 직접 커밋·푸시하지 않는다.**
- **preview는 dev DB를 본다.** dev 브랜치 고정 URL은 `https://malmoi-git-dev-ox501501-1046s-projects.vercel.app`이고, **preview에서 GitHub 로그인은 그 URL에서만 된다**(OAuth App callback이 하나라 preview 전용 앱을 그 URL에 박았다). ⚠️ **preview는 Vercel SSO 뒤에 있다** — `curl`로 찌르면 앱 응답이 아니라 `vercel.com/sso-api`로 가는 302가 온다(앱이 깨진 것으로 오진하기 쉽다).
- **되돌리는 유일한 방법은 다음 배포다.** revert 커밋을 dev에 얹어 같은 경로로 보낸다.
- **`git push --force`는 main에 금지.** dev는 `/sync`가 머지 후 force update하지만 그 스킬의 안전 검사 3개를 지나야 한다.

### 게이트가 어디에 서 있나

| 게이트 | 어디 | 무엇을 막나 |
|---|---|---|
| `pnpm typecheck` + `test` + `build` | `/push` 1단계 (로컬) | dev·preview에 red가 나가는 것 |
| PR `verify` 체크 | `/merge` 4단계 (GitHub) | **프로덕션에 red가 나가는 것** |

- **로컬 게이트를 "PR CI가 잡아줄 것"이라며 건너뛰지 않는다.** 그 CI는 커밋 여러 개가 쌓인 뒤에 돌아서, red가 나오면 무엇이 깼는지 특정하는 비용이 지금의 3분보다 크다.
- **로컬 게이트가 `pnpm build`를 포함한다.** `tsc`는 RSC 경계를 못 본다 — `"use client"` 누락, 서버 컴포넌트의 클라이언트 훅, Server Action 직렬화 위반은 `next build`만 잡는다.
- **DB 마이그레이션은 dev DB를 `/push` 전에, prod DB를 `/merge` 전에** 넓힌다(additive-first). **`db:deploy`를 `/push` 시점으로 당기지 않는다** — 프로덕션이 코드보다 앞서 있는 창을 필요 이상으로 길게 연다.

## 워크플로우 (스킬 라인업)

스킬 **18개**의 역할·단계별 게이트는 `.claude/commands/<name>.md`에 있고, Codex 미러는 `.agents/skills/source-command-<name>/SKILL.md`다 (**`/push`·`/merge`·`/sync`·`/bugshot-qa`·`/design-sync` 다섯은 미러 제외** — 앞의 셋은 원격 상태를 바꾸는 창구를 Claude Code 하나로 두려는 것이고, 뒤의 둘은 Codex에 런타임이 없다: `/bugshot-qa`는 ego-browser, `/design-sync`는 그 위에 **`DesignSync` 도구**까지 쓴다).

`/feature` · `/feature-review` · `/tdd` · `/implement` · `/code-review` · `/refactor` · `/audit` · `/doc-check` · `/db` · `/push` · `/merge` · `/sync` · `/pull` · `/postmortem` · `/ship` · `/l10n-roundtrip` · `/bugshot-qa` · `/design-sync`

**권장 흐름**: `/feature` → `/tdd interface` → `/implement` → `/code-review` → `/refactor` → (`/db`) → `/push`(dev) → `/merge`(프로덕션). 작은 변경은 `/ship` 하나로 `/push`까지 오케스트레이션하며, **`/ship`은 dev까지다 — 프로덕션 배포는 `/merge`를 따로 부른다**(브랜치를 나눈 목적이 프로덕션 앞에 사람 판단을 하나 더 두는 것이므로).

- **`/feature`가 기능의 시작점이다.** 산출물은 `docs/features/<name>/`에 `spec`·`design`·`tasks`로 남고, **기능이 끝나면 결론을 정본(PRODUCT — 제품 판정 / ARCHITECTURE — 불변식·함정 / DESIGN — 시각 규칙)으로 올리고 그 디렉터리는 지운다.** 근거 기록을 쌓아 두지 않는다 — 2026-09-13에 그렇게 쌓인 15디렉터리 14,929줄을 걷어냈고, 되살릴 일이 생기면 `git log`가 답한다.
- **`/audit`은 이 흐름 밖이다.** 변경분이 아니라 **코드베이스 전체**를 불변식·원칙·경계·부채 네 차원으로 감사하고 `docs/POSTMORTEM.md` 전 항목의 재발 방지 grep을 전수로 돌린다 — `/code-review`는 변경분에 걸린 항목만 소환하므로 손대지 않은 코드에 남은 같은 패턴은 이쪽만 잡는다. 리포트 전용이라 배포 경로와 무관하다.
- **`/sync`는 파괴적이다** — dev를 `origin/main`으로 hard reset + force push한다. 미커밋·미푸시·미머지 세 검사를 전부 통과해야 실행한다. `/merge`가 6단계에서 자동으로 하므로, 손으로 부르는 것은 그게 실패했거나 **다른 머신·창구가 머지한 뒤**다.
- **스키마를 건드렸으면 `/push` 전에 `/db`** — 마이그레이션 파일이 코드와 같은 커밋에 들어가야 하고, 배포 순서 판정도 거기서 한다. **프로덕션 반영은 `/merge` 1단계다.**
- **회귀·버그를 잡아 고쳤으면 `/postmortem`.** 역으로 `/implement`·`/refactor`·`/code-review`는 **착수 전 변경 영역으로 `docs/POSTMORTEM.md`를 grep**해 과거 함정을 소환한다 — 쓰기만 하고 안 읽으면 죽은 로그다.
- **`/doc-check`은 문서 전수 대조다.** `/push` 4단계가 **푸시될 diff에 걸린 문서만** 보는 것과 반대로, diff와 무관하게 문서 전문 ↔ 코드베이스를 양방향(틀린 단언 + 누락)으로 대조한다. `POSTMORTEM.md`(append-only)는 대상이 아니다.
- ⚠️ **로케일이 많은 리포가 하나 필요하다 — `i18n-many-locales`다** (2026-09-13, excalidraw 포크 · `packages/excalidraw/locales/{locale}.json` **59로케일** · json-catalog). 폐기용 셋은 전부 **로케일이 3개**라 `sampleOrder`가 처음부터 전부 실어서, 온보딩 ②의 **lazy load**(누른 언어만 받는 경로)와 **세그먼트→`Select` 접힘**(다섯 이상)이 **한 번도 안 밟힌다**. 그 둘을 보려면 이 리포다. ⚠️ **쓰기 검증에는 쓰지 않는다** — 포크라 PR 흔적이 남고, `/l10n-roundtrip`의 "폐기용 리포만" 규칙은 그대로다.
- ⚠️ **로케일이 하나도 없는 리포도 하나 필요하다 — `i18n-none`이다** (2026-09-13, `sindresorhus/p-map` 포크 · 74KB · MIT). 온보딩 ②의 **후보 0개**(예외 E — 좌측이 수동 지정 폼이 되고 우측이 "Nothing to preview yet"인 갈래)는 **설치된 다른 다섯이 전부 로케일 리포라 브라우저로 영영 못 밟는다.** 그 갈래는 되돌릴 수 없는 결정 직전의 화면인데 단위 테스트로만 고정돼 있었다. **74KB를 고른 이유는 트리 조회가 즉시 끝나서다** — `i18n-many-locales`는 탐지에 30초가 넘는다. ⚠️ **쓰기 검증에는 쓰지 않는다**(포크라 PR 흔적이 남는다).
- **`/bugshot-qa`는 편집 UI의 실물 검증 전담이다** — `pnpm test`가 값은 보지만 화면은 못 보는 축(라우트 이관, 권한별 UI 노출, 거부 문구, 입력값 유지)이 대상이다. **리포트+이슈 전용**이고 preview가 아니라 **로컬**을 쓴다.
- ⚠️ **`/design-sync`는 Claude Design 핸드오프를 SoT로 삼는 루프다** — **시안이 정본이고 구현이 따라간다.** 수정→**실측**→(불일치면 수정)→**리뷰**→(지적이면 수정)을 일치할 때까지 돌고, 실측은 눈이 아니라 **computed style + CDP 접근성 트리**다. 2026-09-13에 새 프로젝트 모달이 핸드오프와 **29곳** 어긋난 채 `pnpm test` 3,000개가 green이었고, 그 루프가 **자기가 만든 회귀 넷**(list role 소실·접근 이름 0·반투명 sticky 헤더·`<strong>` 제거)을 추가로 잡았다 — **전부 화면에도 테스트에도 안 나타나는 부류다.** `/bugshot-qa`가 "동작하나"를 보는 자리라면 이쪽은 **"시안과 같은가"**다.
- **`/l10n-roundtrip`은 어댑터 실물 검증 전담이다** — 실제 리포·실제 GitHub API로 push→편집→pull→머지→재pull을 한 바퀴 돈다. **값이 맞아도 표현이 깨지는 부류는 `pnpm test`가 원리적으로 못 본다.** 대상은 **폐기용 리포만**이다(`bugshot-i18n-test`·`i18n-format-check`·`i18n-order-check`) — 재생성 어댑터를 고쳤으면 `i18n-order-check`다(그 리포가 표현 5축이 섞이도록 재포맷돼 있다).

## 문서 지도

**여섯 개다.** 갱신은 문서별 별도 커밋(`docs(PRODUCT): ...` 꼴).

| 문서 | 무엇 | 언제 갱신하나 |
|---|---|---|
| [docs/PRODUCT.md](./docs/PRODUCT.md) | **제품 판정의 정본** — 완료 조건·포지셔닝·역할과 권한표·범위/비범위·설계 결정·IA(URL 구조) | 기능을 추가/삭제했거나 비범위를 범위로 끌어들였거나 §10이 결정됐을 때 |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | **불변식과 함정** — §0 불변식 11 · 결정성 · 어댑터 실측 근거 · blob SHA · 스키마 · 보안 모델 | `lib/` 코어를 건드리기 전에 읽고, 계약이 바뀌면 코드보다 먼저 고친다 |
| [docs/DIRECTORY.md](./docs/DIRECTORY.md) | 어디에 무엇이 있고 **왜 그렇게 생겼나** | 파일·디렉터리를 새로 만들거나 옮겼을 때 |
| [docs/DESIGN.md](./docs/DESIGN.md) | UI 시각 규칙 (라이트 단일, 토큰의 진실은 `app/globals.css`) | UI를 만들거나 고칠 때 필독. 새 raw 색을 늘렸으면 §6.2에 등재 |
| [docs/OPERATIONS.md](./docs/OPERATIONS.md) | 키 회전·복구·전면 재발급 — **나중에 다시 실행할 절차만** | 그 절차가 바뀌었을 때 |
| [docs/ACTIONS.md](./docs/ACTIONS.md) | **대상 리포**에 붙이는 워크플로 (외부 계약) | `inputs`나 red 조건을 바꿨을 때. ⚠️ 말모이가 private이라 Settings > Actions에서 접근 허용이 켜져 있어야 대상 리포가 이 action을 쓴다 |
| [docs/POSTMORTEM.md](./docs/POSTMORTEM.md) | 회고 누적 (append-only, `/postmortem` 전담) | — |
| [README.md](./README.md) | CLAUDE.md의 요약 미러 | 스택·명령·브랜치가 바뀌면 같이 |

`docs/adapter-survey/`는 문서가 아니라 **`pnpm adapter-survey`가 읽는 살아 있는 입력**이다. `.env.example`도 문서로 취급한다 — **새 환경변수를 코드에서 읽었으면 같은 커밋에서 추가**한다.

## 코드 컨벤션

- **커밋 메시지는 영문**, Conventional Commits (`feat:` `fix:` `test:` `refactor:` `docs(scope):` `chore:`).
- **⚠️ 화면 문구는 `messages/en.tsx`를 지난다 — 소스에 한글 UI 리터럴 금지.** `lib/i18n/__tests__/no-korean-ui.test.ts`가 `app`·`components`·`lib`·`messages` + 루트 `auth.ts`·`middleware.ts`를 훑고 허용 목록은 하나뿐이다(`lib/push/apply.ts`의 서버 로그). **주석은 벗기고 세므로 아래 항목과 충돌하지 않는다.**
- **주석은 한국어로, "왜"만 쓴다.** 코드가 말하는 "무엇"을 반복하지 않는다. 특히 **비자명한 제약·함정·과거에 밟은 지뢰**를 남긴다.
- **순수 함수를 먼저 분리한다.** export 생성·blob SHA·키 추출·정렬은 I/O 없는 순수 함수여야 하고, 그래서 테스트가 가능하다. DB·GitHub 호출은 얇은 껍데기로 감싼다.
- **`any` 금지**, `noUncheckedIndexedAccess`가 켜져 있으니 인덱스 접근은 undefined를 처리한다.
- **⚠️ 남이 정한 키로 조회하거나 대입하면 프로토타입을 먼저 끊는다.** 조회는 `Object.hasOwn`(`?? 폴백`은 `Object.prototype`에서 찾아진 값을 못 막는다), **대입은 `Object.create(null)`**이다. 평범한 `{}`에 `out["__proto__"] = v`를 하면 setter가 불려 own property가 안 생기고 **그 키가 조용히 사라진다.** **로케일 파일의 키·`Locale.code`·`pathTemplate`·`searchParams`가 전부 이 부류다.**
- **환경변수는 한 곳에서 읽는다** (`lib/env.ts`의 `requireEnv`·`optionalEnv`). 인가 판정에 넘기는 값(`CRON_SECRET`)은 `optionalEnv`다 — 던지면 fail-closed 판정에 닿기 전에 본문 없는 500이 된다.
- **⚠️ 환경변수를 읽는 코드를 모듈 최상위에서 평가하지 않는다.** 최상위 평가는 "파일을 읽기만 해도 죽는다"를 뜻하고, `.env`가 없는 CI에서 import·빌드만으로 실패한다. 함수 안에 있어도 그 함수를 최상위 `const`가 부르면 같은 문제다.
- **서버 전용 모듈엔 `import "server-only"`.** 단 테스트가 직접 import하는 순수 모듈엔 붙이지 않는다. ⚠️ **`vitest.setup.ts`가 그것을 전역 mock하므로 "테스트가 죽는다"는 더 이상 잎 모듈을 분리시키는 압력이 아니다** — **남은 방어선은 `components/__tests__/client-graph.test.ts` 하나**이고 그것은 `"use client"` 그래프만 본다.
- **날짜는 UTC로 저장**, 표시 시점에만 로컬로 변환.
- **일회성 실험 스크립트는 `.scratch/`에 둔다.** 리포 **안**이어야 tsconfig·경로 별칭이 잡히고, `.gitignore`에 있어야 `git add -A`에 안 딸려간다.
- **⚠️ 차단은 두 층이고, 조건부 렌더는 어느 층도 아니다.** 1차 `middleware.ts`는 렌더 요청(GET·HEAD)에 쿠키 이름만 보는 값싼 차단이고, **본판정은 진입점**이다 — 페이지는 최상단 `requireProjectAccess`, Server Action은 `getProjectAccess`. App Router가 레이아웃과 페이지를 병렬로 렌더해 페이지가 이미 실행되고 RSC 페이로드가 응답에 실린다(실측 1.3MB 노출). **새 보호 라우트는 `matcher`에 추가한다.**
- **⚠️ 로케일 파일이 키의 진실, 코드 스캔은 `refs`만 준다.** 스캔 실패로 적재를 막지 않는다 — 남의 리포 CI를 우리 규칙으로 실패시키지 않는다.
- **⚠️ 새 writer를 만들면 `lib/adapters/shared.ts`의 결정성 규칙을 쓴다.** 정렬·재조립·들여쓰기·끝 개행 1개를 직접 구현하지 않는다. **단 수술적 치환 어댑터는 그 규칙을 지나지 않는다** — 어느 쪽인지는 `writeStrategy`가 정하고 `lib/adapters/__tests__/contract.ts`가 매트릭스를 검사한다.
- **⚠️ "원본 내용이 필요한가"는 `writeStrategy`로 판단한다, `layout`이 아니다.**
- **⚠️ 모든 DB 쿼리는 `projectId`로 좁힌다.** 인덱스가 전부 `projectId` 선두 복합이라 안 좁히면 풀스캔이고, 더 중요하게는 **테넌트 간 데이터가 새는 경로가 된다.**
  - ⚠️ **"애플리케이션이 유일한 방어선"은 2026-09-09까지 거짓이었다.** Supabase는 PostgREST·GraphQL 데이터 API를 기본으로 켜 두고 `public` 스키마의 `pg_default_acl`이 **`anon`·`authenticated`에 새 테이블 전 권한을 자동으로 준다** — 실측으로 **anon key 하나로 `Account.access_token`·`Session.sessionToken`까지 읽고 지울 수 있었다.** 조치는 두 롤의 `public` 권한 REVOKE + `ALTER DEFAULT PRIVILEGES`에서 제거다(후자가 없으면 **다음 마이그레이션이 만드는 테이블이 다시 열린다**).
  - ⚠️ **그 조치는 절반만 닫는다** — `ALTER DEFAULT PRIVILEGES`는 객체를 만드는 롤별이라 `supabase_admin` 소유 항목은 `postgres`로 지울 수 없다(`permission denied`). Prisma가 만드는 테이블은 안 열리고 **대시보드로 만드는 경로**가 열린다. 그래서 여기는 **예방이 아니라 탐지**다 — **새 마이그레이션 뒤에는 `anon` 권한이 0인지 확인한다**(`/db` 5단계).
  - ⚠️ **런타임 롤이 `postgres`이고 `rolbypassrls=true`다** — 지금 RLS를 켜도 앱 연결에는 안 걸린다. **최소권한 롤로 옮기는 것은 RLS를 실제로 켜는 시점에 한다**(`DATABASE_URL` 교체가 넷을 동시에 건드리고, GRANT가 이미 0이라 인터넷 노출은 닫혀 있다).

## 게이트웨이 (알아두면 유용)

- **`prisma`의 npm `latest` 태그가 RC를 가리킨다.** stable은 `prev` 태그다. `pnpm add prisma`로 무심코 깔면 RC가 들어오므로 **버전을 명시해 깐다.**
- **Supabase pooler와 Prisma**: `DATABASE_URL`에 `?pgbouncer=true`가 없으면 prepared statement 충돌로 간헐 실패한다. 증상이 "가끔 되고 가끔 안 됨"이라 진단이 오래 걸린다.
- **Vercel Cron은 Hobby 플랜에서 하루 1회다.** **cron은 프로덕션 배포에서만 돈다** — preview가 야간 pull을 중복으로 돌려 대상 리포에 PR을 내지 않는다.
- ⚠️ **App 설치가 `Only select repositories`다.** **DB에 `Project` 행을 만드는 것만으로는 부족하고** GitHub 설치의 선택 목록에도 그 리포를 넣어야 한다. 안 넣으면 `probeRepo`가 `not-installed`를 주고 야간 pull은 "base 브랜치를 읽을 수 없다"를 낸다. **현재 목록은 여섯**: `bugshot-2` · `bugshot-i18n-test` · `i18n-format-check` · `i18n-order-check` · **`i18n-many-locales`** · **`i18n-none`**(2026-09-13 추가, 앱 목록에서 실물 확인). ⚠️ **이 줄을 리포 생성 시점이 아니라 설치 목록에 실제로 든 뒤에 올린다** — 앞서가면 `not-installed`를 만난 사람이 설치 목록을 의심 대상에서 빼고 엉뚱한 곳을 디버깅한다.
- **GitHub App 개인키는 개행이 들어간 PEM이다.** Vercel env에서 개행이 `\n` 문자열로 이스케이프되므로 읽는 쪽에서 복원해야 한다. 안 하면 JWT 서명이 조용히 실패한다. **`.pem`은 `.gitignore`에 있다.**
- ⚠️ **`pnpm-workspace.yaml`의 공급망 정책 둘이 "왜 이게 안 깔리지"를 만든다.** `minimumReleaseAge: 1440`은 **publish된 지 24시간이 안 된 버전을 제외**하므로 방금 나온 버전을 명시해도 직전 버전이 깔린다. `onlyBuiltDependencies`는 빌드 스크립트 화이트리스트이고 **목록은 셋뿐이다** — 스크립트가 **없는** 패키지를 넣으면 업스트림이 나중에 추가할 때 자동 승인되어 화이트리스트의 요지가 사라진다. **둘 다 증상이 원인을 안 가리킨다.**
- **`orphaned`는 삭제가 아니다.** export에서만 빠지고 DB엔 남는다. "번역이 사라졌다"는 제보를 받으면 먼저 이 플래그를 본다. **`StringKey`와 `Locale` 둘 다 갖는다** — "로케일 열이 사라졌다"·"지운 로케일 파일이 PR에서 돌아온다"는 둘 다 이 플래그가 답이다.

## 참고

- `~/code/bugshot-2` — 이 하네스의 원본이자 push/pull 실전 테스트 대상(ko/en/fr). **하네스를 참고할 때 그 리포의 i18n 구현을 조사 대상으로 삼지 않는다.**
- `~/.claude/projects/<체크아웃 경로 슬러그>/memory/` — Claude Code 전용 개인 메모리(Codex는 읽지 않는다). **머신마다 경로가 다르므로 문서에 박지 않는다.**
