# sec-audit-3 — 설계 (design)

번호는 spec의 감사 연번이다. 영향 흐름: **push**(1b·17·18) · **pull/Publish**(1b·4·16) · **온보딩·설정**(1a·6·7·13·14) ·
**초대**(8·15) · **런타임 경계**(11·12) · **DB·운영**(2·3) · **문서·CLI**(5·9·10).

## 과거 함정 (POSTMORTEM)

- **2026-09-09 "검증이 탐지 경로에만 있었고 적재 경로에 없어, 페이로드가 리포 경로를 정했다"** — 1(b)·17이 같은 축이다.
  규칙은 **잎 모듈 하나**(`lib/locale-code.ts`)에 두고 **push 경계 + pull 판정 2층**에 건다. 경계만 고치면 경계 이전에
  저장된 행을 야간 cron이 그대로 읽는다.
- **2026-09-09 "앱 층 인가를 촘촘히 만들었는데 DB가 인터넷에 열려 있었다"** — 2·3. 앱이 안 쓰는 문이 잠겼다는 뜻이 아니다.
  확인은 **코드가 아니라 DB 카탈로그**로 한다.
- **2026-09-10 "YAML 자원 제한이 문자열을 구조로 읽어 우회와 오탐을 함께 만들었다"**, **2026-09-16 "YAML range 치환의
  같은 위치와 바깥 빈 줄이 값을 바꿨다"** — 4는 serializer 옵션만 바꾸고 CST 치환 범위는 건드리지 않는다.
- **2026-09-13 "샘플 검증 테스트가 실제 트리에 없는 경로만 공격해…"** — 1(b)의 pull 쪽 테스트는 **트리에 실제로 있는
  형제 파일**(`package.json`)을 대상으로 공격한다. 없는 경로만 쓰면 "새 파일 생성" 갈래만 밟는다.
- **2026-09-03 "장애를 권한 없음으로 말한다"**(`connect-plan.ts` 머리 주석) — 1(a)에서 `permissions`가 응답에 **없으면**
  거부가 아니라 `unavailable`이다.
- **2026-09-16 "`Promise.all`이 토큰 회전을 둘로 겹쳤다"** — 16에서 읽기 클라이언트를 만들 때 `openRepoReader`의
  "App을 한 번만 만든다" 계약(토큰 캐시)을 깨지 않는다.

## 1 🔴 로케일 모양 + 리포 쓰기 권한

**근본 방어 (a)**: 토큰을 받는 사람이 이미 그 리포에 쓸 수 있으면, sync 브랜치에 무엇이 커밋되든 권한 상승이 아니다.

- `GET /user/installations/{id}/repositories`의 각 항목은 **로그인 사용자 기준** `permissions{admin,push,pull}`을 든다.
  `lib/github-connect/user.ts`가 이름 목록 대신 `{ fullName, push: boolean | null }`을 돌려주게 넓힌다(여전히 GET만 —
  `credential-separation.test.ts` 불변).
- `planRepoConnect`(순수)의 입력을 `userRepos: readonly { fullName; push: boolean | null }[]`로 바꾸고 판정을 하나 더한다:
  리포가 목록에 있고 `push === false` → 새 상태 `repo-read-only`. `push === null`(필드 없음) → `unavailable`.
- 이 함수를 쓰는 자리 전부(프로젝트 생성·Reconnect·Add surface·온보딩 확인)가 자동으로 받는다 — 호출처를 grep으로
  전수 확인하고, 새 상태의 화면 문구를 `messages/en.tsx`에 넣는다(한글 리터럴 금지).
- **기존 프로젝트는 소급하지 않는다** — 생성자의 과거 권한을 알 수 없다. 다음 Reconnect부터 걸린다. (b)가 기존 행을 덮는다.
- 잔여: OWNER로 초대된 사람이 리포 쓰기 권한 없이 토큰을 회전하는 경로. 쓰기 권한자가 위임한 것으로 보고 받아들인다.

**심층 방어 (b)**: `lib/locale-code.ts`에 `isLocaleShaped(code)`를 더한다(잎 유지, import 0).

- 규칙(확인 필요 A): 첫 서브태그 **ASCII 영문자 2~3자**, 이후 서브태그 `[_-][A-Za-z0-9]{1,8}` 0개 이상, 전체 길이 ≤ 35.
  `package`·`index`·`README`·`config`·`action`은 거부, `en`·`pt_BR`·`zh-Hant-TW`·`es-419`·`sr-Latn`·`fil`·`en-GB-oxendict`는 통과.
- `isPathSafeLocale`과 **별개 함수**로 둔다 — 축이 다르다("경로에 넣어도 되나" vs "로케일인가"). push 스키마의 `LocaleCode`는
  둘을 모두 요구하고, `resolveLocalePaths`의 per-locale 갈래도 둘을 모두 요구한다(2층).
- ⚠️ `looksLikeLocale`(`lib/adapters/shared.ts`)은 여전히 재사용하지 않는다 — 탐지 규칙이고 소문자 2~3자만 받는다.
  ARCHITECTURE §5.5.05의 같은 경고가 유효하다.
- **배포 전 prod 확인**: `SELECT DISTINCT code FROM "Locale"`를 새 함수로 돌려 거부 0건을 확인한다(값은 로케일 코드뿐이라
  민감하지 않다). 1건이라도 나오면 그 프로젝트의 야간 pull이 `fail`로 멈추므로 규칙을 먼저 조정한다.
- 잔여: 3글자 단어 파일명(`app.json`·`api.yml`)은 (b)가 못 막는다 — (a)가 근본이다. ARCHITECTURE §5.5.05에 기록한다.

## 2·3 🟡 prod `public` 스키마 USAGE

- 새 마이그레이션 `revoke_public_schema_usage_from_api_roles`:
  ```sql
  DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      REVOKE USAGE, CREATE ON SCHEMA public FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      REVOKE USAGE, CREATE ON SCHEMA public FROM authenticated;
    END IF;
  END $$;
  ```
  롤 존재를 조건으로 거는 이유: `test:projects:postgres`의 격리 PostgreSQL과 Prisma shadow DB에는 Supabase 롤이 없다.
  - 스키마 USAGE가 없으면 `supabase_admin`의 default ACL이 새 테이블에 권한을 줘도 **이름 해석 단계에서 막힌다** —
    `postgres`로 지울 수 없는 default ACL을 지우지 않고 닫는다. 탐지에 기대던 방어가 예방이 된다.
  - `PUBLIC`(`=U`)의 USAGE는 건드리지 않는다 — anon·authenticated는 PUBLIC을 통해서도 USAGE를 상속한다. **확인 필요**:
    마이그레이션 적용 뒤 `has_schema_privilege('anon','public','USAGE')`가 여전히 true면 `REVOKE USAGE ON SCHEMA public FROM PUBLIC`이
    필요하다. 그것은 `postgres`·`service_role` 이외 롤 전체에 영향이 있으므로, 앱 런타임 롤(`postgres`, 소유자)은 무관함을 확인하고 넣는다.
- additive(권한 축소, 스키마 모양 무변경) — 코드와 배포 순서 제약 없음. `/db`가 dev 적용, `/merge` 1단계가 prod 반영.
- 3번: `.claude/commands/db.md` 5단계를 "dev·prod 둘 다"로 굳히고 스키마 USAGE 확인 SQL을 더한다. 미러(`sync:agents`) 제외 스킬이 아니므로 `pnpm sync:agents` 대상이다.

## 4 🟡 YAML 1.1 모호 값 인용

- `flowString`은 `version`이 1.2일 때도 **값이 YAML 1.1 core 스키마에서 문자열이 아닌 것으로 해석되면** PLAIN을 쓰지 않는다.
- 순수 판정 `isYaml11Ambiguous(value): boolean`을 `lib/adapters/yaml-catalog.ts` 안(또는 같은 디렉터리 잎)에 둔다 —
  bool(`y|Y|yes|Yes|YES|n|N|no|No|NO|true|…|on|On|ON|off|Off|OFF`), null(`~`·`null`·빈 값), 60진수(`\d+(:[0-5]?\d)+`),
  8·16진·`_` 포함 숫자, float(`.inf`·`.nan` 포함), 날짜 timestamp.
  - 구현은 가능하면 `yaml`의 `parse(value, { version: "1.1" })`가 문자열이 아닌 값을 주는지로 판정한다(규칙 재구현 금지 — 같은
    라이브러리가 이미 1.1 스키마를 든다). 고정 버전 `yaml` 2.9.0에서 동작을 테스트로 고정한다.
- 모호할 때의 인용 스타일: 원본 노드가 `QUOTE_SINGLE`이면 그것, 아니면 `QUOTE_DOUBLE`(기존 개행 갈래와 같은 선택).
- **불변식 영향**: 결정성 유지(같은 값 → 같은 출력). §1.4 "표현을 원본에서 읽는다"는 모호하지 않은 값에서 그대로다.
  수술적 어댑터라 `shared.ts` 규칙은 지나지 않는다. 값이 안 바뀐 행은 원본 바이트 그대로(치환 대상이 아님).
  - ⚠️ `lib/adapters/**`를 건드리므로 ARCHITECTURE §1.9 재측정 트리거 판정 대상이다 — writer만 바뀌고 탐지는 무변경이라
    `/push` 4d에서 "재측정 불요"를 근거와 함께 남긴다.

## 5·9 문서 사실 정정

- PRODUCT §7.1의 "이름·이미지 Action은 보관 후에도 허용" 문장을 §7.9 판정(보관 = Restore만, 잠금 안 판정)으로 바꾼다.
- `action.yml` 머리 주석의 private 절(7~9행)을 지운다. public 리포의 composite action은 접근 허용이 필요 없다.

## 6·7·8 Server Action 경계

- 6: `deleteProjectImage`가 다른 Action과 같은 `z.object({ slug: … }).safeParse`를 지난다. 형은 인접 `startGithubConnect`와 동일.
- 7: `startGithubConnect`가 `getProjectAccess` 뒤 `planProjectAccess`/`planLockedAccess`의 보관 판정을 받는다 — 보관이면
  `{ ok:false, error:"archived" }`. 쓰기가 없어 잠금은 필요 없고, 진입 판정만 한다(PRODUCT §7.9).
- 8: "이미 멤버인가" 조회를 `$transaction` 안으로 옮기고, `projectMember.create`의 P2002를 `already-member`로 접는다.
  두 겹인 이유: 트랜잭션 안 조회도 read committed에서 경합을 못 막는다 — 최종 판정은 unique 제약이 한다.

## 10 push-local URL

- 순수 함수 `isAllowedPushUrl(raw): boolean` — `https:`는 통과, `http:`는 호스트가 `localhost`·`127.0.0.1`·`[::1]`일 때만.
  `scripts/push-local.ts`가 부르고 위반이면 exit 2. `lib/cli/`에 두고 테스트한다.
- `docs/ACTIONS.md`의 `api-url` 입력 설명에 https 요구를 적는다(외부 계약).

## 11 CSP `'unsafe-inline'` (확인 필요 B)

- ARCHITECTURE §8이 "nonce 배선은 범위 밖 — 전 페이지가 요청마다 렌더된다"로 **명시적으로 받아들인** 트레이드오프다. 이번에 뒤집는다.
- 설계: `middleware.ts`가 요청마다 `randomBytes(16)` nonce를 만들어 요청 헤더 `x-nonce`와 응답 CSP에 싣는다.
  `script-src 'self' 'nonce-…' 'strict-dynamic'`(dev는 `'unsafe-eval'` 유지). Next App Router는 CSP 헤더의 nonce를 읽어
  자기 부트스트랩 스크립트에 붙인다.
  - `buildCsp(env, nonce)`는 순수 함수로 유지하고 테스트한다. **CSP 헤더는 하나만**(§8) — `next.config.ts`의 정적 CSP를 빼고
    미들웨어가 유일한 출처가 된다. 그래서 **미들웨어 matcher가 전 경로**를 덮어야 한다 — 지금 matcher는 보호 라우트 전용이므로
    CSP용 분기를 따로 두거나 matcher를 넓히고 인증 차단은 기존 경로 목록으로 좁힌다(`entry-points.test.ts`가 긍정·부정을 고정).
  - `style-src`는 `'unsafe-inline'`을 남긴다 — React의 `style` 속성·sonner·radix가 인라인 스타일을 쓰고 nonce는 속성에 안 붙는다.
    잔여로 §8에 기록한다.
  - 대가: 정적 렌더되던 페이지(랜딩·`/docs`·`/privacy`)가 동적이 된다. Vercel 함수 리전은 `hnd1`이라 지연은 홉 하나.
- 검증: §8의 수동 절차(로컬 `pnpm build && pnpm start`에서 로그인 둘·계정 연결·App 설치 링크·초대 수락·Publish·이미지 업로드·토스트, 콘솔 위반 0).

## 12 Blob 호스트 고정

- 새 optional env `BLOB_PUBLIC_HOST`(예: `abc123.public.blob.vercel-storage.com`, 환경별로 dev·prod 스토어가 다르다).
  `buildCsp`가 받아 `img-src`에 그 호스트 하나만 넣는다. 없으면 Blob 호스트를 **넣지 않는다**(fail-closed — 업로드 이미지가 안 보인다).
  - 토큰(`BLOB_READ_WRITE_TOKEN`)에서 스토어 id를 파싱하는 안은 쓰지 않는다 — 문서화되지 않은 토큰 형식에 기대게 된다.
  - 호스트 모양 검증(`^[a-z0-9]+\.public\.blob\.vercel-storage\.com$`)을 순수 함수로 두어 CSP 인젝션을 막는다.
- `.env.example` + Vercel 세 환경 등록(Sensitive 아님 — 공개 호스트) + OPERATIONS.

## 13·14 서명 토큰

- 14: 새 env `APP_SIGNING_SECRET`(32바이트 base64url). GitHub 연결 state(`lib/github-connect/state.ts`)와 샘플 확인
  (`lib/onboarding/sample-confirmation.ts`)이 이 키를 쓴다. 두 함수는 이미 `secret`을 인자로 받으므로 **호출처 5곳**
  (`callback/route.ts:52`, `settings/actions.ts:101`, `projects/actions.ts:541·822·889`)만 바꾼다. 용도 라벨은 그대로 둔다.
  - `requireEnv`로 읽되 **함수 안에서**(최상위 평가 금지 — POSTMORTEM 2026-08-31).
  - 전환 창: 배포 순간 진행 중인 GitHub 연결(10분 state)·샘플 확인이 한 번 실패한다. 재시도로 복구되므로 이중 키 검증은 두지 않는다
    (요청 없는 유연성 금지).
  - `.env.example`, OPERATIONS 키 목록·회전 절차, CLAUDE.md "암호화 키" 절이 아니라 **서명 키**라 그 옆에 한 줄.
- 13: `Confirmation`에 `issuedAt: number`(ms)를 더하고 검증이 `now - issuedAt > TTL`이면 실패. TTL 30분(확인 필요).
  `verify`는 `now`를 인자로 받는다(순수). 라벨을 `…:v2`로 올려 옛 토큰을 구조적으로 거부한다.

## 15 사용자 단위 초대 한도

- `ProjectInvitation.invitedBy`가 이미 있다 — **스키마 변경 없음**. `readLimits`가 `invitedBy = userId AND createdAt > now-1h`
  건수를 더 읽고, 순수 판정(`lib/invitation-email/limits.ts`)에 `userRecentCount`·`USER_WINDOW_LIMIT`을 넣는다.
  - 값: 30/h(확인 필요). 프로젝트 20/h보다 크고 3프로젝트 × 20보다 작다.
  - 인덱스: `(invitedBy, createdAt)`가 없다 — 사용자당 행 수가 작아 스캔 비용이 무시할 수준이므로 **인덱스를 더하지 않는다**.
  - 잠금: 프로젝트 잠금 안에서 읽으므로 **다른 프로젝트 동시 발급**은 경합한다(한도를 조금 넘을 수 있다). 사용자 잠금을
    더하지 않는다 — 한도의 목적이 스팸 억제라 근사로 충분하다. ARCHITECTURE에 그 근사를 적는다.
  - `test:projects:postgres` 대상(`lib/invitation-email/issue.ts`를 건드림).

## 16 읽기 토큰 리포 고정

- `createGitClient`의 스코프 조립(`requirePinnedRepositoryId` + `repositoryIds: [pinned]`)을 `listBranches`·`openRepoReader`도 쓴다.
  두 함수에 `repositoryId` 인자를 더하고 호출처가 `Project.repositoryId`를 넘긴다.
  - ⚠️ 온보딩 단계에는 아직 `Project` 행이 없다 — 그 호출처는 `probe`가 준 repository id를 넘긴다. 호출처 전수 확인이 태스크다.
  - `openRepoReader`의 "App을 한 번만 만든다" 계약 유지 — 스코프 토큰을 한 번 받고 만료 임박 시 갱신하는 `createGitClient`의 형을 따른다.

## 17 refs path

- push 스키마 `refs[].path`에 `isPathSafeRepoPath` refine(경계). `buildPermalink`는 저장된 행이 그것을 통과하지 못하면 `null`(2층).
  1(b)와 같은 잎 함수를 쓴다.

## 18 placeholders 상한

- 순수 함수 `jsonWithinBounds(value, { maxDepth: 4, maxBytes: 4096 })`(확인 필요) — 깊이는 반복(스택 없는 순회)으로 잰다.
  `z.unknown().refine(...)`. "모양을 검사하지 않는다" 계약과 충돌하지 않는다 — 크롬 `placeholders`는 깊이 2(`{name:{content,example}}`)라
  상한은 모양이 아니라 자원이다. 주석에 그 구분을 남긴다.

## 순수 함수 (`/tdd` 진입점)

| 함수 | 위치 | 항목 |
|---|---|---|
| `isLocaleShaped` | `lib/locale-code.ts` | 1b |
| `planRepoConnect` (입력 확장, `repo-read-only`) | `lib/github-connect/connect-plan.ts` | 1a |
| `resolveLocalePaths` (거부 추가) | `lib/pull/plan.ts` | 1b |
| push `LocaleCode`·`refs.path`·`placeholders` 스키마 | `lib/push/plan.ts` | 1b·17·18 |
| `isYaml11Ambiguous` / `flowString` | `lib/adapters/yaml-catalog.ts` | 4 |
| `isAllowedPushUrl` | `lib/cli/` | 10 |
| `buildCsp(env, { nonce, blobHost })` · `isBlobPublicHost` | `lib/security-headers.ts` | 11·12 |
| `sign/verifySampleConfirmation` (issuedAt·now) | `lib/onboarding/sample-confirmation.ts` | 13 |
| 초대 한도 판정 | `lib/invitation-email/limits.ts` | 15 |
| `buildPermalink` (불량 경로 null) | `lib/keys/view.ts` | 17 |
| `jsonWithinBounds` | `lib/push/` | 18 |

## 스키마 변경

- **마이그레이션 1개, 권한만**(2번). 테이블·컬럼 무변경. additive로 분류 — 배포 순서 제약 없음.

## 새 환경변수

- `APP_SIGNING_SECRET` (required, 14) · `BLOB_PUBLIC_HOST` (optional, 12). `.env.example`·`lib/env.ts` 경유·OPERATIONS·Vercel 3환경.
  ⚠️ `.env.local`은 에이전트가 편집하지 않는다 — 사람이 채운다(CLAUDE.md 새 머신 셋업).

## 불변식 영향

- **export 결정성**(§1): 4번이 yaml-catalog writer 출력을 바꾼다 — 결정적 규칙이라 결정성 유지. 같은 DB 상태에서 **이전 배포와 바이트가
  다를 수 있다**(모호 값이 새로 인용됨) → 해당 프로젝트의 다음 pull이 그 파일만 1회 변경 PR을 낸다. 의도된 변화로 ARCHITECTURE §1.4에 기록.
- **blob SHA**(§2): 무관.
- **인증 경계**(§6): 1a·7·8·14·11이 건드린다. 전부 **더 좁히는** 방향이고 fail-closed(`permissions` 없음 → `unavailable`,
  `BLOB_PUBLIC_HOST` 없음 → Blob 이미지 차단, `APP_SIGNING_SECRET` 없음 → `requireEnv` 실패).
- **병합 없음**(§0): 무관 — 값을 고르는 분기를 만들지 않는다.

## 정본 문서 갱신 (구현 시)

- ARCHITECTURE §5.5.05(로케일 모양·2층·잔여), §6(리포 쓰기 권한 요구·서명 키 분리), §8(CSP nonce·style 잔여·Blob 호스트), §1.4(YAML 1.1 인용), §7(스키마 USAGE).
- PRODUCT §7.1(5번), 필요 시 §3 권한표 아래 "생성에는 리포 쓰기 권한" 한 줄.
- OPERATIONS(새 키 둘, prod USAGE 확인 SQL) · ACTIONS(`api-url` https) · `.env.example` · `/db` 스킬(3번) · CLAUDE.md(서명 키 한 줄).
- 기능 종료 시 이 디렉터리를 지운다.
