# tenant-auth — tasks

**순수 함수 → 스키마 → backfill → 껍데기 → (red 테스트) → 전환 → 게이트 대조 → 문서** 순서다. 역순은
테스트 못 하는 코드를 먼저 쌓는 것이고, 특히 **전환(§5)을 backfill(§3) 앞에 두면 아무도 로그인할 수
없게 된다**(design §5).

검증 줄마다 `[auto]`(`pnpm test`·`pnpm typecheck`·grep — CI가 본다) / `[manual]`(`pnpm dev`·브라우저·DB
— 사람이 본다)이 붙는다. 이 프로젝트엔 e2e가 없어 UI 검증은 전부 수동이다.

커밋 경계는 `──`로 표시한다.

## 1. 순수 판정 — `/tdd interface` ✅ (2026-09-05, `5b38a0f` → `ef7895c` → `2e0f7f4`)

**67케이스 green.** 구현 중 확정된 것 둘: `planMemberRemoval` → **`planMemberChange`**(제거와 강등이
같은 판정을 지나야 하므로 `nextRole`을 받는다), `planOwnerBackfill`의 `owner` → **`ownerUserId`**.

- [x] `normalizeEmail` (`lib/auth/email.ts`) — trim + 소문자. **그 이상 하지 않는다**
  - 검증 `[auto]`: `" A@B.com "` → `"a@b.com"` / `"a.b+c@Gmail.com"` → `"a.b+c@gmail.com"`(점·`+` 유지) /
    유니코드 로컬파트 유지 / 원문 인자는 안 바뀐다
- [x] `canPerform(role, permission)` (`lib/auth/permission.ts`) — SAAS.md §3 권한표. permission 셋
  - 검증 `[auto]`: **6칸 전부** — OWNER×3 통과 / EDITOR: `translation:write` 통과(Publish 포함),
    `project:settings`·`member:manage` 거부
- [x] `hashInviteToken` (`lib/auth/invitation.ts`) — sha256 hex
  - 검증 `[auto]`: 같은 입력 → 같은 해시 / 다른 입력 → 다른 해시 / 출력에 원문이 없다
- [x] `planInvitationAccept({ invitation, verifiedEmail, now })`
  - 검증 `[auto]`: `ok` / `expired`(만료 1ms 뒤) / `already-accepted` / `email-mismatch`(대소문자 차이는
    **일치**로) / `not-found`(invitation이 null) 다섯 분기
- [x] `planProjectAccess({ member, permission })` (`lib/auth/access.ts`)
  - 검증 `[auto]`: member null → `not-found` / EDITOR + `member:manage` → `forbidden` /
    EDITOR + `translation:write` → `ok` / OWNER + 셋 → `ok`. **반환의 `projectId`가 member 행의 것**
- [x] `planMemberChange({ members, targetUserId, nextRole })` (`lib/auth/membership.ts`)
  - 검증 `[auto]`: OWNER 둘 중 하나 제거 → `ok` / **마지막 OWNER 제거 → `last-owner`** /
    **마지막 OWNER를 EDITOR로 강등 → `last-owner`** / EDITOR 제거 → `ok` / EDITOR→OWNER → `ok` /
    대상이 멤버가 아님 → `not-member`
- [x] `planOwnerBackfill({ projects, members, ownerUserId })` (`lib/auth/backfill.ts`)
  - 검증 `[auto]`: OWNER 없는 프로젝트만 행을 낸다 / 이미 있으면 0건 / **결과를 members에 합쳐 다시
    돌리면 0건**(멱등) / **빈 `ownerUserId`는 던진다**(code-review 🟡 — 빈 배열을 내면 스크립트가
    "채울 것 없음"으로 읽고, 그 스크립트가 `User`까지 upsert하므로 빈 id의 User가 전 프로젝트의
    OWNER가 된다. `syncBranchFor`가 같은 이유로 던진다)
- [x] `hasSessionCookie(names)` (`lib/auth/cookie.ts`)
  - 검증 `[auto]`: `authjs.session-token` / `__Secure-authjs.session-token` 어느 하나면 true, 둘 다 없으면 false
- [x] `resolveBackfillOptions(argv)` · `backfillReport(...)` (`lib/auth/backfill.ts`) — §3에서 추가.
      **이 판정이 틀리면 프로덕션 DB에 쓴다**
  - 검증 `[auto]`: 기본이 dev·dry-run / 모르는 `--target`은 던진다 / GitHub id가 숫자가 아니면 던진다 /
    **dry-run과 apply의 출력이 다르다**(같으면 `--apply`를 잊은 것을 "채웠다"로 오독한다)
- [x] `accessErrorMessage(error)` (`lib/auth/message.ts`) — Action 거부 문자열 → 한국어 (`pullMessage` 형태)
  - 검증 `[auto]`: `unauthorized`·`forbidden`·`not-found` 셋이 서로 다른 문구. exhaustive switch

`──` 커밋: `test(auth): pure decisions for access, membership, invitations and backfill` → `feat(auth): …`

## 2. 스키마 (additive) — `/db` ✅ (2026-09-05, `2e998d4` — `20260904182548_add_tenant_auth_tables`)

**⚠️ 착수 중 뒤집힌 판정 하나: `onDelete`가 전부 Restrict가 아니다.** 어댑터의 `deleteUser`가
`p.user.delete` 하나만 부르므로(`node_modules/@auth/prisma-adapter/index.js` 실측) `Account`·`Session`이
`Restrict`면 그 메서드가 **항상 실패**한다. 그 둘만 `Cascade`이고 우리 데이터(`ProjectMember`·
`ProjectInvitation`)는 `Restrict` 그대로다 — 마지막 OWNER가 조용히 사라지면 안 된다.

**⚠️ 타입 검사가 이 스키마를 검증하지 못한다** (2026-09-05 실측). 어댑터가 인자를 `@prisma/client`의
`PrismaClient`로 받는데 그 패키지는 `.prisma/client/default`를 re-export하고, Prisma 7의
`prisma-client` 생성기는 그 경로를 만들지 않는다(우리 산출물은 `generated/prisma`다). `skipLibCheck`가
해결 실패를 삼켜 파라미터가 사실상 `any`가 된다 — **`PrismaAdapter({ nope: true })`도 컴파일된다.**
그래서 `prisma/__tests__/schema-contract.test.ts`(20케이스)가 **유일한 자동 방어선**이고, 어댑터 소스의
`where` 키·델리게이트 목록을 스키마와 직접 대조한다.

- [x] `User` · `Account` · `Session` · `VerificationToken` · `ProjectMember` · `ProjectInvitation` (design §5)
  - 검증 `[manual]`: `pnpm db:migrate`로 **dev에만** 적용 후 `pnpm db:status` up to date. `pnpm db:generate`
    후 `pnpm typecheck` 통과
  - 검증 `[auto]`(SQL 읽기): 생성된 SQL에 **기존 테이블(`Project`·`Locale`·`StringKey`·`KeyRef`·`Translation`)
    대상 `ALTER`가 없다.** 새 테이블의 FK `ALTER TABLE "ProjectMember" ADD CONSTRAINT`는 정상이다
- [x] `ProjectMember @@unique([projectId, userId])`, `ProjectInvitation tokenHash @unique` +
      `@@index([projectId, email])`(**unique 아님** — design §5), `Session.sessionToken @unique`,
      `Account @@id([provider, providerAccountId])`
  - 검증 `[auto]`(SQL 읽기): unique 인덱스 3건 + 일반 인덱스 1건. `projectId`가 선두
- [x] `onDelete` — **`Account`·`Session` → `User`는 `Cascade`**(위 ⚠️), 우리 두 모델은 `Restrict`.
      `ProjectMember.updatedAt` 있음
  - 검증 `[auto]`(SQL 읽기): `CASCADE` 2건 · `RESTRICT` 4건. 기존 5테이블 대상 `ALTER` 0건 · `DROP` 0건
- [x] `Translation.updatedBy` 주석 (컬럼 변경 없음) — **현재형으로 적었다**: 지금 들어가는 값은
      여전히 GitHub 핸들이고 `User.id`가 되는 것은 §5 인가 전환 시점이다. FK를 안 거는 이유도
      "사용자 테이블이 없어서"가 아니라 "전환 뒤에도 두 종류 값이 섞여 참조 무결성을 주장할 수 없어서"다

`──` 커밋: `feat(db): tables for users, sessions, membership and invitations`

## 3. ⚠️ OWNER backfill — **전환(§5) 앞에 반드시** ✅ (2026-09-05, `fa2bbf4` → `e4b56ee` → `bdd254b`)

**dev dry-run이 `order-check` 1건을 낸다.** ⚠️ **`--apply`는 아직 안 돌렸다** — dev·prod 양쪽의
실제 실행은 §5 전환 직전이 적기다(그 사이에 소유자가 로그인하면 어댑터가 만든 `User`와 합쳐야 한다).

- [x] `scripts/backfill-owners.ts` — **`User` + `Account(github, providerAccountId=<숫자 id>, type="oauth")` +
      `ProjectMember(OWNER)`를 함께 upsert**한다. 판정은 `planOwnerBackfill`, 스크립트는 I/O만.
      소유자 `SinhyeokKang`의 id·이메일은 `gh api user`로 얻어 인자로 넘긴다(스크립트가 GitHub을 부르지 않는다)
  - ⚠️ **`User`만 만들면 첫 GitHub 로그인이 `OAuthAccountNotLinked`로 거부된다**(design §5). Account까지가
    이 스크립트의 요지다
  - 검증 `[auto]`: `planOwnerBackfill` 테스트(§1). 스크립트 자체는 `pnpm test` 밖(DB)
  - 검증 `[manual]`: **기본은 dry-run** — 만들 행을 출력만. `--apply`로 dev에 적용 → `order-check`에
    OWNER 1행 + `User`·`Account` 1행씩. 다시 `--apply` → "0건" 출력
- [x] `--target prod`일 때만 `DIRECT_URL_PROD`(5432)로 붙는다 (design §5 예외). 없으면 `DIRECT_URL`(dev)
  - 검증 `[manual]`: 플래그 없이 돌리면 출력에 dev ref가 찍힌다
  - ⚠️ `lib/db.ts`는 `server-only`라 tsx가 못 쓴다 — `scripts/smoke-github.ts`처럼 `.env.local` 로드 +
    자체 `PrismaPg`
- [x] 스크립트 수명: **일회성.** prod 적용 뒤 삭제 커밋(§8) — 주석과 CLAUDE.md 양쪽에 적었다

⚠️ **마이그레이션 안에 넣지 않는다** — dev와 prod의 `Project` 행이 다르고, 소유자를 사람이 확인해야
한다. 빠뜨린 채 §5를 배포하면 **아무도 어느 프로젝트에도 못 들어간다**(fail-closed라 옳지만 복구가 SQL이다).

**prod 시퀀스 (`/merge` 때)**: ① `pnpm db:deploy` → ② `pnpm db:status:prod` up to date 확인 →
③ `pnpm tsx scripts/backfill-owners.ts --target prod`(dry-run 출력 확인) → 같은 명령 `--apply` →
④ `/merge`. ①이 ③보다 먼저다 — backfill이 `ProjectMember` 테이블을 요구한다. prod에 리셋 개념은 없다.

`──` 커밋: `chore(db): backfill project owners`

## 4. 껍데기 — Auth.js DB 세션 + 인가 ✅ (2026-09-05, `65d6c3f` → `bb94651` → `0d80e5a`)

**구현 중 뒤집힌 판정 셋. 셋 다 근거가 실측이다.**

1. **matcher에서 `/keys`를 빼지 않았다.** 아래 항목은 "제거"라고 적었지만 그 라우트는 §5까지 살아
   있다 — 지금 빼면 방어가 레이아웃 `redirect()` 하나로 줄고, 그게 POSTMORTEM 2026-08-31이
   1.3MB 노출로 배운 부류다. **`/projects/:path*`를 더하기만 했고 제거는 §5b가 라우트와 함께** 한다.
2. **이메일 검증을 `signIn`이 아니라 provider의 `profile` 구성 자리에서 한다.** `signIn`이 받는
   `user`는 기존 사용자일 때 DB 행이고 어댑터가 쓰는 것은 `userFromProvider`라(`@auth/core` 실측),
   콜백에서 검사만 하면 **검증한 주소와 저장되는 `User.email`이 갈린다.** 그러면 "`User.email`이
   정규화를 지나게 한다"는 아래 항목도 함께 무의미해진다 (POSTMORTEM 2026-09-05).
3. **GitHub provider의 `userinfo.request`를 대체했다.** 기본 동작은 공개 이메일이 없을 때만
   `/user/emails`를 조회하고, 조회해도 `verified`를 버린 채 `emails[0]`로 떨어질 수 있다 —
   §4가 "구현 전 확인"으로 남긴 질문의 답이 **"조회는 하지만 검증 여부를 안 준다"** 였다.

- [x] `@auth/prisma-adapter` **설치** ✅ (2026-09-05, `7546907`) — `2.11.3`. `@auth/core@0.41.3`을 정확히
      고정하고 있어 `next-auth` 5.0.0-beta.32와 인스턴스를 공유한다(`.pnpm`에 `@auth+core@0.41.3` 하나)
- [x] `session: { strategy: "database" }`로 전환하고 어댑터를 배선한다
  - ⚠️ **`NextAuth(async () => config)` 지연 형태** — `PrismaAdapter(getPrisma())`가 인자에 그대로 있으면
    `requireEnv("DATABASE_URL")`이 import 시점에 던진다 (design §8)
  - 검증 `[auto]`: `.env.local`을 치운 셸에서 `pnpm build` 통과 /
    `grep -rn -E '\benv\(|requireEnv\(' --exclude-dir=node_modules --exclude-dir=generated` — 모듈 최상위·
    최상위 `const` 호출 0건 / `grep -rn -E '\w+\([^)]*,\s*requireEnv\('` 0건
  - 검증 `[manual]`: 로그인 후 `Session` 행이 생기고, **그 행을 지우면 다음 요청이 `/`로 튄다** —
    spec 완료 조건 2의 수동 절반
- [x] Google provider 추가. **`allowDangerousEmailAccountLinking`을 어느 provider에도 두지 않는다**
      — ⚠️ **Google 로그인은 §5가 허용 목록을 걷어낼 때까지 거부된다** (핸들이 없어 목록을 못 지난다).
      의도된 fail-closed이고, 로그인 화면에 Google 버튼이 없어 그 거부에 도달할 경로도 아직 없다
  - 검증 `[auto]`: provider 설정을 읽어 그 옵션이 없음을 단언(spec 완료 조건 4)
  - 검증 `[manual]`: 로컬에서 Google 로그인 성공(Google 클라이언트 1개에 URI 셋 등록 — design §6)
- [x] **검증된 이메일 없으면 거부** — 판정은 `verifiedEmailFrom`(순수), 재료 수집은 provider 설정,
      `signIn`은 결과가 비어 있는지만 본다. ⚠️ **`pages.error`는 §5b가 로그인 화면과 함께** 한다 —
      지금은 거부 경로에 도달할 UI가 없다
  - ⚠️ **구현 전 확인**: GitHub provider가 공개 이메일 없을 때 `/user/emails`를 조회하는가(`@auth/core/providers/github`).
    안 하면 `profile` 콜백에서 직접 조회한다
  - 검증 `[auto]`: 판정을 `isVerifiedEmail(profile, provider)` 순수 함수로 빼서 provider별 케이스 /
    `[manual]`: 비공개 이메일 GitHub 계정으로 로그인 → `/`에 거부 문구
- [x] **`User.email`이 정규화를 지나게 한다** ✅ — 위 판정 2로 함께 닫혔다. `verifiedEmailFrom`이
      `normalizeEmail`을 지난 값을 내고 그 값이 곧 `User.email`이다. 원래 우려는 이랬다: — `@auth/prisma-adapter`의
      `createUser`는 우리 코드를 지나지 않으므로 provider 원문이 그대로 저장된다. design §2·§5의
      "`User.email`은 정규화 값을 저장한다"가 조치 없이는 **거짓이 된다.** 초대 수락은
      `planInvitationAccept`가 양쪽을 정규화해 안 깨지지만, §5의 "이미 멤버인 이메일 초대" 검사처럼
      `User.email`을 직접 대조하는 조회가 대소문자로 갈린다
  - ⚠️ **또 하나의 실패 경로**(code-review 2026-09-05): `scripts/backfill-owners.ts`는 **정규화된**
    이메일로 `user.upsert`한다. 소유자가 이 배선 전에 `Sinhyeok.Kang@…` 원문으로 로그인해 그 행이
    생기면, backfill 재실행이 `findUnique({email})`로 못 찾고 create로 가서 **`User_email_key`를
    위반하며 죽는다.** 멱등해야 한다는 §3의 요구가 그 지점에서 깨진다
  - 검증 `[auto]`: `signIn`/`profile` 콜백이 `normalizeEmail`을 부르는 것을 테스트가 고정 /
    `[manual]`: 대문자 섞인 이메일로 로그인 후 `User.email`이 소문자
- [x] `session` 콜백이 `user.id`만 싣는다. `types/next-auth.d.ts`의 `login` → `id`
  - 검증 `[auto]`: `pnpm typecheck` — `session.user.login` 참조 0건(`grep -rn 'user.login'`)
- [x] `requireUser()` · `requireProjectAccess({ slug, permission })`(페이지용, redirect) ·
      `getProjectAccess(...)`(Action용, union 반환). 판정은 전부 `planProjectAccess`
  - 검증 `[auto]`: 메모리 DB로 — 다른 프로젝트 slug → `not-found` / EDITOR + `member:manage` → `forbidden` /
    `planProjectAccess`를 지나는 것을 스파이가 고정
- [x] `middleware.ts` — **`auth` 래퍼 제거**, `hasSessionCookie(request.cookies)`만. `matcher`에
      `/projects/:path*` **추가**. **`/keys/:path*`는 남긴다**(위 판정 1 — 제거는 §5b).
      **`/invite/:path*`는 넣지 않는다**(design §4.1)
  - 검증 `[auto]`: `grep -n '@/auth' middleware.ts` 0건 /
    `[manual]`: 쿠키 없이 `curl -si localhost:3000/projects/x/translations` → 302 + `wc -c` 본문 0 /
    `curl -si localhost:3000/invite/abc` → 200(로그인 버튼 페이지)
- [x] `.env.example` — `AUTH_GOOGLE_ID`·`AUTH_GOOGLE_SECRET` 추가 (클라이언트 1개·URI 셋)(주석: 클라이언트 1개·URI 셋)

`──` 커밋: `feat(auth): database sessions, Google provider, project-scoped authorization`

## 5. 전환 ✅ (2026-09-05) — red 테스트 먼저, 편집 경로가 인가를 지나고, **같은 커밋에서 옛 인가를 걷어낸다**

⚠️ **쪼개지 않는다.** `AUTH_ALLOWED_LOGINS` 검사는 `signIn` 콜백에 있어 **로그인 자체를 거부**하므로,
남겨둔 채 `requireProjectAccess`만 붙이면 두 인가가 **AND로 걸려 좁은 쪽이 이긴다** — 초대받아
`ProjectMember` 행이 있는 비개발자가 목록에 핸들이 없어 로그인 단계에서 막힌다. spec 완료 조건 3이
그 구간 동안 성립하지 않는다 (design §5).

### 5a. red 테스트 — `/tdd` ✅ (2026-09-05, `f62be81`) — 52케이스

- [x] `app/(edit)/__tests__/edit-flow.test.ts` **하네스 갱신** — `@/auth` mock을 `vi.hoisted` 핸들로(per-test
      null / 다른 `userId`), `@/lib/env` mock에서 `requireEnv("ACTIVE_PROJECT_SLUG")` 의존 제거,
      `memoryDb()`에 `projectMember`·`projectInvitation`·`user` 델리게이트 추가. 기존 "다른 프로젝트 `keyId`
      거부"(`:298-303`)는 **slug 경로로 재배선**(신규 아님)
- [x] 거부 케이스 `[auto]` — 전부 red로 시작:
  - 세션 null → `saveTranslation`·`triggerPullAction`·`createInvitation`·`changeMember` 전부 `unauthorized`
  - 세션 유효 + `ProjectMember` 없음 → 전부 `not-found` (**spec 완료 조건 2의 자동 절반**)
  - A 멤버가 B의 slug / B의 `keyId`+A slug / B의 `localeCode`+A slug → 거부
  - EDITOR의 `createInvitation`·`changeMember` → `forbidden`; EDITOR의 `triggerPullAction` → **허용**
  - 초대: 재사용 / 만료 / 이메일 불일치 / 이미 멤버인 이메일 초대(→ 거부) / 만료 뒤 재초대(→ 토큰 회전,
    옛 행 만료) / 자기 초대(→ 거부) / **동시 수락** — `updateMany({ where: { id, acceptedAt: null } })`의
    count를 검사하고 그 인자를 스파이로 고정(ARCHITECTURE §5.5.6 선례; 메모리 DB는 경합을 못 본다)
  - 마지막 OWNER 제거·강등 → `last-owner`; `changeMember` 응답에 `planMemberChange` 결과가 그대로
  - 토큰 원문이 `createInvitation` 응답에 **한 번만**, DB에는 해시만
  - `grep -rn 'if (!session' app/` 0건 (POSTMORTEM 2026-08-31 grep)
- [x] **진입점 소스 스캔 테스트** (spec 완료 조건 6) — `app/**/actions.ts`의 `"use server"` export와
      `app/**/page.tsx`를 fs로 열어 `getProjectAccess`/`requireProjectAccess`/`requireUser` 중 하나를 부르는지,
      예외 목록(`/api/push`·`/api/pull`·`[...nextauth]`·`signIn`/`signOut` 폼·`/`·`/invite/[token]`)은
      **이름으로 고정**. `lib/adapters/__tests__/contract.ts`가 `ADAPTERS`를 순회하는 것과 같은 상시 방어선
  - 검증 `[auto]`: 예외 목록에 없는 Action에서 호출을 지우면 red

`──` 커밋: `test(auth): the cross-tenant access attempts that must fail`

### 5b. 구현 ✅ (2026-09-05, `6ed4ecb` → `d5f0cd5`)

- [x] 라우트 이관 — `app/(edit)/keys/` → `app/(edit)/projects/[slug]/translations/page.tsx`(판정 로직·
      `lib/keys/view.ts` 그대로, 최상단 `requireProjectAccess`, `loadProject(prisma, slug)`는 인가가 준
      `projectId`로). `app/(edit)/projects/page.tsx`(멤버십 목록) 신설. `/keys` 삭제, `app/page.tsx`
      redirect → `/projects`, `revalidatePath` 경로 갱신
  - ⚠️ **`middleware.ts`의 matcher에서 `/keys/:path*`를 여기서 뺀다** (§4가 남겨 뒀다 — 라우트가
    살아 있는 동안 빼면 그 페이지가 무방비다)
  - 검증 `[auto]`: `grep -rn ACTIVE_PROJECT_SLUG app/\(edit\) lib/keys lib/auth components` 0건 /
    `[manual]`: 로그인 → `/projects` → 프로젝트 클릭 → 표가 보인다. 멤버 아닌 slug 직접 입력 → `/projects`로 튄다
- [x] `saveTranslation(raw)`·`triggerPullAction(slug)` — `raw`에 `slug` 포함(Zod), **기본값 자리 `requireEnv`
      금지**(design §8). `getProjectAccess` → 인가된 `projectId`로 기존 격리 검사. `updatedBy: userId`.
      `TranslationInput`·`PullButton`이 slug를 props로 받는다
  - 검증 `[auto]`: 5a 케이스 green + 기존 값 전달 테스트(저장→DB→pull 파일 내용) 새 경로에서 green
- [x] 초대 Action — `createInvitation({ slug, email, role })`(OWNER, 토큰 원문 1회 반환, 7일 만료, 같은
      이메일 미수락 행 회전) · `acceptInvitation({ token })`(**`requireUser`만**, `planInvitationAccept`,
      `updateMany … acceptedAt: null` 단일 사용). `/invite/[token]/page.tsx`(matcher 밖, design §4.1 표대로
      네 실패 분기를 각자 한 줄로, 이메일 마스킹)
  - 검증 `[auto]`: 5a 초대 케이스 green / `[manual]`: **Google로 로그인한(허용 목록에 있을 수 없는)
    사용자가 링크 → 수락 → `/projects/<slug>/translations`에서 저장 → Publish 성공** (spec 완료 조건 3)
- [x] 멤버 Action — `changeMember({ slug, targetUserId, nextRole })`(OWNER, `planMemberChange`). 화면은 6단계,
      호출자는 테스트 + 헤더의 임시 초대 폼과 같은 자리
  - ⚠️ **`accessErrorMessage`에 `last-owner`·`not-member` 문구를 더한다** (code-review 🟡, 2026-09-05).
    §1이 판정만 만들고 문구를 안 만들어서, 안 더하면 화면이 즉흥으로 정한다. 초대 4분기는 design §4.1이
    표로 갖고 있지만 멤버 쪽은 어디에도 없다
  - 검증 `[auto]`: 5a 마지막 OWNER 케이스 green / `AccessError` 다섯이 서로 다른 문구
- [x] 최소 화면 — `/`에 Google 버튼 + 문구 교체("허용 목록…" 삭제) + `?error=` 한 줄, 헤더 `user.name ?? user.email`,
      `translation-input.tsx`의 실패 문구를 `accessErrorMessage`로(입력값 유지), 토큰 원문 표시는
      `font-mono` + 복사
  - 검증 `[manual]`: 세션 회수(Session 행 삭제) 뒤 blur 저장 → "로그인이 만료됐다" 한 줄, 입력값 남음
- [x] **같은 커밋에서** `AUTH_ALLOWED_LOGINS`·`lib/auth/allow.ts`·**`lib/auth/__tests__/allow.test.ts`** 제거,
      `signIn` 콜백은 §4의 이메일 검증만 남긴다. `middleware.ts:13`·`layout.tsx:7-13` 주석 갱신
  - 검증 `[auto]`: `grep -r AUTH_ALLOWED_LOGINS`가 `.env.example` 포함 0건. `pnpm test` green.
    `pnpm typecheck` green

`──` 커밋: `feat(auth): project membership replaces the login allowlist`

**구현 중 더한 것 둘.**
- **임시 초대 폼** (`components/invite-form.tsx`) — 없으면 `createInvitation`에 호출부가 테스트뿐이고
  **spec 완료 조건 3을 손으로도 밟을 수 없다**(OWNER가 링크를 만들 방법이 없다). 화면은 6단계이지만
  이 폼은 그때까지의 유일한 통로다.
- **조건부 쓰기** — `changeMember`가 `deleteMany`/`updateMany`의 count를 읽는다. `delete`/`update`는
  행이 사라졌을 때 던지고, 그건 OWNER 둘이 같은 멤버를 동시에 건드리는 실제 경로다
  (POSTMORTEM 2026-09-05). `acceptInvitation`은 이미 그 형태였다.
- **하네스가 `@@unique([projectId, userId])`를 흉내내게 했다** — 안 그러면 가짜가 실제보다 관대해
  그 결함을 **재현할 수조차 없다**(같은 회고).

⬜ **남은 `[manual]` 넷**: Google 로그인 / 초대 링크 왕복(spec 완료 조건 3) / 세션 회수 뒤 blur 저장 /
`curl`로 비로그인 응답 본문 0바이트. preview에서 밟는다.

## 6. 보안 게이트 대조 ✅ (2026-09-05) — 이걸 통과해야 2단계가 닫힌다

SAAS.md §5.7 11항목 ↔ 테스트 이름 대조표. **테스트는 5a에서 이미 green이다** — 여기는 빠진 항목이
없는지 세는 자리다. `[manual]` 넷은 preview(dev 브랜치 고정 URL)에서 밟았고 실측 기록은 아래 §6.1이다.

| SAAS §5.7 | 근거 |
|---|---|
| 비로그인 사용자의 조회·수정·Publish | `authorization` "저장이 거부된다" · "Publish가 거부된다" · "거부가 DB에 닿기 전에 일어난다 — 인가 조회조차 하지 않는다" / 조회는 `[manual]` ①(307 + 본문 0바이트) |
| A 멤버가 B의 URL·ID 직접 전송 | `authorization` "B의 slug를 직접 보내면 거부된다" · "B의 slug로 Publish를 걸 수 없다" |
| 다른 프로젝트의 `keyId`·`localeCode` | `authorization` "자기 slug에 B의 keyId를 실으면 거부된다 — 인가된 projectId로 다시 확인한다" · "자기 slug에 B의 localeCode를 실으면 거부된다". **`translationId`는 해당 없음** — Action이 그 인자를 받지 않는다 |
| EDITOR의 멤버·리포 설정 변경 | `membership` "EDITOR는 forbidden이다 — 멤버 관리는 OWNER만이다" · "EDITOR는 부를 수 없다" / 리포 설정 Action이 아직 없어 `permission` "EDITOR는 프로젝트 설정을 바꾸지 못한다"가 대신 든다 |
| 설치되지 않은 리포 등록 | ⏭ **4단계** (`github-connect`) — Project 생성 경로가 없다 |
| 설치에 접근할 수 없는 사용자의 생성 | ⏭ **4단계** (같은 이유) |
| 제거된 멤버가 기존 세션으로 재접근 | `authorization` "세션이 살아 있어도 ProjectMember 행이 사라지면 거부된다" / `[manual]` ④ |
| 같은 이메일 provider 자동 병합 | `provider-config` "allowDangerousEmailAccountLinking에 값을 대입하지 않는다" / `[manual]` ③ — **실물에서 실제로 거부됐다** |
| 초대받은 이메일과 다른 계정으로 수락 | `membership` "다른 이메일 계정으로는 수락되지 않는다" |
| 초대 토큰 재사용·만료 후 사용 | `membership` "재사용은 already-accepted다" · "만료된 토큰은 expired다" · "단일 사용을 조건부 갱신으로 강제한다" · "이미 멤버인 사람이 옛 초대를 수락하면 already-member다" |
| 로그·응답에 토큰·PEM·DB URL 노출 | 기존 `lib/failure.ts`(ARCHITECTURE §6.0) + `membership` "원문이 응답에 한 번 실리고 DB에는 해시만 있다". 초대 토큰의 URL 경로 노출은 **단일 사용·7일로 수용**한다 (design §4.1) |

- [x] 표의 근거 칸이 전부 실재하는 테스트 이름이고 `pnpm test` green (1259건)
- [x] `[manual]` 넷을 preview에서 한 번씩 밟았다 — 아래 §6.1

### 6.1 실물 검증 기록 (2026-09-05, preview) — ⚠️ 체크리스트 밖의 기록이라 이 파일이 닫혀도 남긴다

**어디서**: `https://malmoi-git-dev-ox501501-1046s-projects.vercel.app` (dev DB / preview 전용 OAuth 앱 /
ego-browser 실브라우저). **로컬에서 하지 않은 이유**: 로컬 `.env.local`의 `AUTH_GITHUB_ID`가 OAuth
client id가 아니라 7자리 App ID라 GitHub이 404를 준다(미해결, 로컬 앱을 새로 만들어야 한다).

| # | 항목 | 결과 |
|---|---|---|
| ① | 비로그인 응답 본문 | `/projects/order-check/translations` → **307, 본문 0바이트**, 번역 키 0건 |
| ② | Google 로그인 | 통과. ⚠️ Google 동의 화면이 **External + 테스트**여야 한다 — Internal이면 `403 org_internal`로 조직 밖 계정이 막히고, 그게 곧 **초대 경로가 막히는 것**이다 |
| ③ | 초대 왕복 (spec 완료 조건 3) | OWNER가 발급 → 비로그인으로 링크 열람(마스킹된 이메일만) → **다른 Google 계정**으로 수락 → `/projects/order-check/translations`로 리다이렉트 → EDITOR로 저장 성공. 옛 초대 행은 만료로 회전, DB엔 해시만 |
| ④ | 세션 회수 | `Session` 행 삭제 후 blur 저장 → 한국어 거부 문구 + 입력값 유지 + **DB 미기록** |
| ⑤ | 같은 이메일 자동 병합 거부 (§5.7) | GitHub(`ox501501@gmail.com`)로 OWNER가 된 뒤 **같은 주소의 Google**로 로그인 → `?error=OAuthAccountNotLinked`, `User`·`Account`에 고아 행 0건 |

**실물 검증이 잡은 것 넷 — 타입 검사도 1259건도 원리적으로 못 보는 부류다.** 셋은 §5 마감 직후,
하나는 2026-09-06 `/bugshot-qa` 전수 회귀에서 나왔다.

1. 🔴 **사이드바가 삭제된 `/keys`를 가리켰다** (`89e76d0`). `qs()`가 경로를 하드코딩한 채 남아 네임스페이스·
   기준 로케일 링크가 전부 404였다. 문자열이고 페이지를 렌더하는 테스트가 없다 → `app/__tests__/entry-points.test.ts`의
   **"죽은 라우트 링크"** 가 상시 방어선으로 섰다.
2. 🟡 **거부가 일시적 장애처럼 읽혔다** (`8d0224f`). `OAuthAccountNotLinked`에 "잠시 뒤 다시 시도"를 보이면
   사용자가 같은 버튼을 반복해 누른다 → `signInErrorMessage(code)`가 사유별 문구를 낸다.
3. 🔴 **초대 수락 거부가 화면에 아무 문구도 남기지 않았다** (issue #2 → `37541c2`). Action이 사유를
   `?e=`로 넘기는데 **페이지가 `searchParams`를 받지도 읽지도 않았다.** 무음인 것은 **버튼을 눌러서
   나는 셋**(`email-mismatch`·`already-member`·`unauthorized`)뿐이고, 행을 읽자마자 갈리는 셋은 화면이
   있어서 **초대 화면이 실패를 잘 보여주는 것처럼 보였다** → `inviteErrorMessage` 6분기 + 진입점 소스
   스캔 **"쿼리 파라미터의 수신자"** (POSTMORTEM 2026-09-06).
4. 🔴 **preview 런타임이 session 모드(5432) pooler를 쓰고 있었다** — `EMAXCONNSESSION max clients reached
   in session mode - pool_size: 15`. Preview 스코프의 `DATABASE_URL`을 transaction(6543, `?pgbouncer=true`)로
   교체하고 재배포해 해소. 경고는 `.env.example`·ARCHITECTURE §7에 있었지만 **배선에서 지켜지지 않았고,
   부하가 낮아 오래 안 드러났다** (POSTMORTEM 2026-09-05).

**데이터 오류 하나**: backfill의 소유자 이메일을 에이전트가 `sinhyeok.kang@day1company.co.kr`로 추측했는데
실제 GitHub 계정 `SinhyeokKang`의 주소는 `ox501501@gmail.com`이었다. 그 오류가 ⑤(같은 이메일 병합)를
**우연히 검증 불가로 만들고 있었다** — 두 provider의 이메일이 애초에 달랐기 때문이다. 인증 테이블을 비우고
올바른 값으로 다시 채운 뒤에야 ⑤가 실제 판정이 됐다.

`──` 커밋 없음 (문서 §7에 합친다)

## 7. 문서 ✅ (2026-09-05)

- [x] **`docs/ARCHITECTURE.md` §6·§6.1 갱신** — 차단이 미들웨어 단독에서 **미들웨어(쿠키 존재, 1차) +
      진입점(본판정)** 으로 갈렸다는 것, **조건부 렌더 금지는 유지**, `auth` 래퍼가 DB 세션에서 DB를 친다는 함정.
      §6.2(검증된 이메일을 만드는 자리)·§6.3(거부는 값으로 흐른다)이 함께 섰다. §7의 "dev DB와 prod DB가
      같다"가 **2026-09-04 분리 뒤로 거짓이었던 것**을 여기서 고쳤다
- [x] **`docs/SAAS.md`** — §8 2단계 완료 게이트에 `[manual]` 실측 결과 / 3단계를 2단계에 흡수했다고 접기 /
      §5.2 시그니처 `slug`(내부 `projectId`) / §5.5에 실측 확인 / §5.6에 토큰 URL 노출 수용·`@@index` 판정·
      `updatedBy=User.id` / §5.7에 단계 표기(4단계 2건) / 멤버 관리 **화면**을 6단계에 추가
- [x] **`CLAUDE.md`** — "인증 차단은 `middleware.ts`에만 의존" → 두 층으로 / 새 머신 셋업 OAuth 앱 표에
      Google 1행(클라이언트 하나에 URI 셋) + 동의 화면 External 제약. "세션은 DB에 있다" 절과 디렉터리
      구조·명령어 표·테넌시 행은 §5 마감에서 이미 갱신됐다
- [x] `.env.example` — `AUTH_ALLOWED_LOGINS` 제거·Google 블록·`ACTIVE_PROJECT_SLUG` 주석은 §4·§5에서 반영됐고,
      여기서는 "OAuth 앱이 둘" → **셋**(본문이 이미 셋을 나열하고 있었다)과 pooler 포트 경고를 고쳤다
- [x] `docs/features/README.md` — tenant-auth 상태 갱신 + `tasks.md`를 남기는 이유(§6.1) + 백로그에
      "`translation-input` 저장 상태 `role=status`·실패 시 포커스 복귀"(6단계) 한 줄
- [x] `docs/TASKS.md` 전역 미결 — `ACTIVE_PROJECT_SLUG` 항목에 "편집 경로는 tenant-auth에서 제거됨,
      push·pull은 SAAS 5단계" 한 줄, "dev DB가 비어 있다"는 SAAS 0단계에서 해소돼 체크. PoC 기록이라 그 이상 손대지 않는다
- [x] `docs/POSTMORTEM.md` — preview `DATABASE_URL`이 session 모드였던 건(위 §6.1 3)
  - 검증 `[auto]`: `pnpm sync:agents:check` 통과 / `[manual]`: 각 문서의 서술이 코드와 일치

`──` 커밋: `docs: authorization moves from an allowlist to project membership`

## 8. 뒷정리 ✅ (2026-09-06 — prod 적용 뒤)

- [x] `scripts/backfill-owners.ts`·`lib/auth/backfill.ts`(+테스트 30케이스) 삭제 — 일회성이다.
      **prod `ProjectMember` 6행을 `https://mal-moi.com/projects` 화면에서 눈으로 확인한 뒤** 지웠다
      (`bugshot-2`·`bugshot-i18n-test`·`format-check-yaml`·`skillflo`·`format-check-code`·`order-check`).
      `package.json`의 `backfill:owners`와 CLAUDE.md의 명령어 표·디렉터리 구조 항목도 함께 뺐다

⚠️ **왜 남기지 않았나**: 남겨두면 다음 사람이 "이걸 또 돌려야 하나"를 매번 판단해야 하고, 그 판단에
필요한 맥락(누가 소유자인가·이미 돌았나)은 코드에 없다. 되살릴 일이 생기면 git 히스토리에 있고,
그때는 **어차피 그 시점의 소유자 정보로 다시 써야 한다.**

`──` 커밋: `chore: drop the one-off owner backfill`
