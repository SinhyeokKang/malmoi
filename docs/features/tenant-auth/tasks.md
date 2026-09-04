# tenant-auth — tasks

**순수 함수 → 스키마 → backfill → 껍데기 → (red 테스트) → 전환 → 게이트 대조 → 문서** 순서다. 역순은
테스트 못 하는 코드를 먼저 쌓는 것이고, 특히 **전환(§5)을 backfill(§3) 앞에 두면 아무도 로그인할 수
없게 된다**(design §5).

검증 줄마다 `[auto]`(`pnpm test`·`pnpm typecheck`·grep — CI가 본다) / `[manual]`(`pnpm dev`·브라우저·DB
— 사람이 본다)이 붙는다. 이 프로젝트엔 e2e가 없어 UI 검증은 전부 수동이다.

커밋 경계는 `──`로 표시한다.

## 1. 순수 판정 — `/tdd interface`

- [ ] `normalizeEmail` (`lib/auth/email.ts`) — trim + 소문자. **그 이상 하지 않는다**
  - 검증 `[auto]`: `" A@B.com "` → `"a@b.com"` / `"a.b+c@Gmail.com"` → `"a.b+c@gmail.com"`(점·`+` 유지) /
    유니코드 로컬파트 유지 / 원문 인자는 안 바뀐다
- [ ] `canPerform(role, permission)` (`lib/auth/permission.ts`) — SAAS.md §3 권한표. permission 셋
  - 검증 `[auto]`: **6칸 전부** — OWNER×3 통과 / EDITOR: `translation:write` 통과(Publish 포함),
    `project:settings`·`member:manage` 거부
- [ ] `hashInviteToken` (`lib/auth/invitation.ts`) — sha256 hex
  - 검증 `[auto]`: 같은 입력 → 같은 해시 / 다른 입력 → 다른 해시 / 출력에 원문이 없다
- [ ] `planInvitationAccept({ invitation, verifiedEmail, now })`
  - 검증 `[auto]`: `ok` / `expired`(만료 1ms 뒤) / `already-accepted` / `email-mismatch`(대소문자 차이는
    **일치**로) / `not-found`(invitation이 null) 다섯 분기
- [ ] `planProjectAccess({ member, permission })` (`lib/auth/access.ts`)
  - 검증 `[auto]`: member null → `not-found` / EDITOR + `member:manage` → `forbidden` /
    EDITOR + `translation:write` → `ok` / OWNER + 셋 → `ok`. **반환의 `projectId`가 member 행의 것**
- [ ] `planMemberChange({ members, targetUserId, nextRole })` (`lib/auth/membership.ts`)
  - 검증 `[auto]`: OWNER 둘 중 하나 제거 → `ok` / **마지막 OWNER 제거 → `last-owner`** /
    **마지막 OWNER를 EDITOR로 강등 → `last-owner`** / EDITOR 제거 → `ok` / EDITOR→OWNER → `ok` /
    대상이 멤버가 아님 → `not-member`
- [ ] `planOwnerBackfill({ projects, members, owner })` (`lib/auth/backfill.ts`)
  - 검증 `[auto]`: OWNER 없는 프로젝트만 행을 낸다 / 이미 있으면 0건 / **결과를 members에 합쳐 다시
    돌리면 0건**(멱등)
- [ ] `hasSessionCookie(names)` (`lib/auth/cookie.ts`)
  - 검증 `[auto]`: `authjs.session-token` / `__Secure-authjs.session-token` 어느 하나면 true, 둘 다 없으면 false
- [ ] `accessErrorMessage(error)` (`lib/auth/message.ts`) — Action 거부 문자열 → 한국어 (`pullMessage` 형태)
  - 검증 `[auto]`: `unauthorized`·`forbidden`·`not-found` 셋이 서로 다른 문구. exhaustive switch

`──` 커밋: `test(auth): pure decisions for access, membership, invitations and backfill` → `feat(auth): …`

## 2. 스키마 (additive) — `/db`

- [ ] `User` · `Account` · `Session` · `VerificationToken` · `ProjectMember` · `ProjectInvitation` (design §5)
  - 검증 `[manual]`: `pnpm db:migrate`로 **dev에만** 적용 후 `pnpm db:status` up to date. `pnpm db:generate`
    후 `pnpm typecheck` 통과
  - 검증 `[auto]`(SQL 읽기): 생성된 SQL에 **기존 테이블(`Project`·`Locale`·`StringKey`·`KeyRef`·`Translation`)
    대상 `ALTER`가 없다.** 새 테이블의 FK `ALTER TABLE "ProjectMember" ADD CONSTRAINT`는 정상이다
- [ ] `ProjectMember @@unique([projectId, userId])`, `ProjectInvitation tokenHash @unique` +
      `@@index([projectId, email])`(**unique 아님** — design §5), `Session.sessionToken @unique`,
      `Account @@id([provider, providerAccountId])`
  - 검증 `[auto]`(SQL 읽기): unique 인덱스 3건 + 일반 인덱스 1건. `projectId`가 선두
- [ ] `onDelete: Restrict` 전부, `ProjectMember.updatedAt` 있음
  - 검증 `[auto]`(SQL 읽기): `ON DELETE RESTRICT` 외 없음
- [ ] `Translation.updatedBy` 주석을 "GitHub 핸들" → "`User.id`"로 (컬럼 변경 없음)

`──` 커밋: `feat(db): tables for users, sessions, membership and invitations`

## 3. ⚠️ OWNER backfill — **전환(§5) 앞에 반드시**

- [ ] `scripts/backfill-owners.ts` — **`User` + `Account(github, providerAccountId=<숫자 id>, type="oauth")` +
      `ProjectMember(OWNER)`를 함께 upsert**한다. 판정은 `planOwnerBackfill`, 스크립트는 I/O만.
      소유자 `SinhyeokKang`의 id·이메일은 `gh api user`로 얻어 인자로 넘긴다(스크립트가 GitHub을 부르지 않는다)
  - ⚠️ **`User`만 만들면 첫 GitHub 로그인이 `OAuthAccountNotLinked`로 거부된다**(design §5). Account까지가
    이 스크립트의 요지다
  - 검증 `[auto]`: `planOwnerBackfill` 테스트(§1). 스크립트 자체는 `pnpm test` 밖(DB)
  - 검증 `[manual]`: **기본은 dry-run** — 만들 행을 출력만. `--apply`로 dev에 적용 → `order-check`에
    OWNER 1행 + `User`·`Account` 1행씩. 다시 `--apply` → "0건" 출력
- [ ] `--target prod`일 때만 `DIRECT_URL_PROD`(5432)로 붙는다 (design §5 예외). 없으면 `DIRECT_URL`(dev)
  - 검증 `[manual]`: 플래그 없이 돌리면 출력에 dev ref가 찍힌다
  - ⚠️ `lib/db.ts`는 `server-only`라 tsx가 못 쓴다 — `scripts/smoke-github.ts`처럼 `.env.local` 로드 +
    자체 `PrismaPg`
- [ ] 스크립트 수명: **일회성.** prod 적용 뒤 삭제 커밋(§7 뒤)

⚠️ **마이그레이션 안에 넣지 않는다** — dev와 prod의 `Project` 행이 다르고, 소유자를 사람이 확인해야
한다. 빠뜨린 채 §5를 배포하면 **아무도 어느 프로젝트에도 못 들어간다**(fail-closed라 옳지만 복구가 SQL이다).

**prod 시퀀스 (`/merge` 때)**: ① `pnpm db:deploy` → ② `pnpm db:status:prod` up to date 확인 →
③ `pnpm tsx scripts/backfill-owners.ts --target prod`(dry-run 출력 확인) → 같은 명령 `--apply` →
④ `/merge`. ①이 ③보다 먼저다 — backfill이 `ProjectMember` 테이블을 요구한다. prod에 리셋 개념은 없다.

`──` 커밋: `chore(db): backfill project owners`

## 4. 껍데기 — Auth.js DB 세션 + 인가

- [ ] `@auth/prisma-adapter` 도입 — **버전을 `@auth/core@0.41.3`(next-auth beta.32 번들)과 Prisma 7
      `prisma-client` 생성기에 맞는 것으로 확인해 정확 고정**. `session: { strategy: "database" }`
  - ⚠️ **`NextAuth(async () => config)` 지연 형태** — `PrismaAdapter(getPrisma())`가 인자에 그대로 있으면
    `requireEnv("DATABASE_URL")`이 import 시점에 던진다 (design §8)
  - 검증 `[auto]`: `.env.local`을 치운 셸에서 `pnpm build` 통과 /
    `grep -rn -E '\benv\(|requireEnv\(' --exclude-dir=node_modules --exclude-dir=generated` — 모듈 최상위·
    최상위 `const` 호출 0건 / `grep -rn -E '\w+\([^)]*,\s*requireEnv\('` 0건
  - 검증 `[manual]`: 로그인 후 `Session` 행이 생기고, **그 행을 지우면 다음 요청이 `/`로 튄다** —
    spec 완료 조건 2의 수동 절반
- [ ] Google provider 추가. **`allowDangerousEmailAccountLinking`을 어느 provider에도 두지 않는다**
  - 검증 `[auto]`: provider 설정을 읽어 그 옵션이 없음을 단언(spec 완료 조건 4)
  - 검증 `[manual]`: 로컬에서 Google 로그인 성공(Google 클라이언트 1개에 URI 셋 등록 — design §6)
- [ ] `signIn` 콜백 — **검증된 이메일 없으면 거부**(design §2.1). Google `email_verified`, GitHub `/user/emails`
      primary+verified. `pages.error`를 `/`로
  - ⚠️ **구현 전 확인**: GitHub provider가 공개 이메일 없을 때 `/user/emails`를 조회하는가(`@auth/core/providers/github`).
    안 하면 `profile` 콜백에서 직접 조회한다
  - 검증 `[auto]`: 판정을 `isVerifiedEmail(profile, provider)` 순수 함수로 빼서 provider별 케이스 /
    `[manual]`: 비공개 이메일 GitHub 계정으로 로그인 → `/`에 거부 문구
- [ ] `session` 콜백이 `user.id`만 싣는다. `types/next-auth.d.ts`의 `login` → `id`
  - 검증 `[auto]`: `pnpm typecheck` — `session.user.login` 참조 0건(`grep -rn 'user.login'`)
- [ ] `requireUser()` · `requireProjectAccess({ userId, slug, permission })`(페이지용, redirect) ·
      `getProjectAccess(...)`(Action용, union 반환). 판정은 전부 `planProjectAccess`
  - 검증 `[auto]`: 메모리 DB로 — 다른 프로젝트 slug → `not-found` / EDITOR + `member:manage` → `forbidden` /
    `planProjectAccess`를 지나는 것을 스파이가 고정
- [ ] `middleware.ts` — **`auth` 래퍼 제거**, `hasSessionCookie(request.cookies)`만. `matcher`에
      `/projects/:path*` 추가, `/keys/:path*` 제거. **`/invite/:path*`는 넣지 않는다**(design §4.1)
  - 검증 `[auto]`: `grep -n '@/auth' middleware.ts` 0건 /
    `[manual]`: 쿠키 없이 `curl -si localhost:3000/projects/x/translations` → 302 + `wc -c` 본문 0 /
    `curl -si localhost:3000/invite/abc` → 200(로그인 버튼 페이지)
- [ ] `.env.example` — `AUTH_GOOGLE_ID`·`AUTH_GOOGLE_SECRET` 추가(주석: 클라이언트 1개·URI 셋)

`──` 커밋: `feat(auth): database sessions, Google provider, project-scoped authorization`

## 5. 전환 — red 테스트 먼저, 편집 경로가 인가를 지나고, **같은 커밋에서 옛 인가를 걷어낸다**

⚠️ **쪼개지 않는다.** `AUTH_ALLOWED_LOGINS` 검사는 `signIn` 콜백에 있어 **로그인 자체를 거부**하므로,
남겨둔 채 `requireProjectAccess`만 붙이면 두 인가가 **AND로 걸려 좁은 쪽이 이긴다** — 초대받아
`ProjectMember` 행이 있는 비개발자가 목록에 핸들이 없어 로그인 단계에서 막힌다. spec 완료 조건 3이
그 구간 동안 성립하지 않는다 (design §5).

### 5a. red 테스트 — `/tdd` (SAAS §5.7을 여기서 케이스로 박는다, §6이 대조한다)

- [ ] `app/(edit)/__tests__/edit-flow.test.ts` **하네스 갱신** — `@/auth` mock을 `vi.hoisted` 핸들로(per-test
      null / 다른 `userId`), `@/lib/env` mock에서 `requireEnv("ACTIVE_PROJECT_SLUG")` 의존 제거,
      `memoryDb()`에 `projectMember`·`projectInvitation`·`user` 델리게이트 추가. 기존 "다른 프로젝트 `keyId`
      거부"(`:298-303`)는 **slug 경로로 재배선**(신규 아님)
- [ ] 거부 케이스 `[auto]` — 전부 red로 시작:
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
- [ ] **진입점 소스 스캔 테스트** (spec 완료 조건 6) — `app/**/actions.ts`의 `"use server"` export와
      `app/**/page.tsx`를 fs로 열어 `getProjectAccess`/`requireProjectAccess`/`requireUser` 중 하나를 부르는지,
      예외 목록(`/api/push`·`/api/pull`·`[...nextauth]`·`signIn`/`signOut` 폼·`/`·`/invite/[token]`)은
      **이름으로 고정**. `lib/adapters/__tests__/contract.ts`가 `ADAPTERS`를 순회하는 것과 같은 상시 방어선
  - 검증 `[auto]`: 예외 목록에 없는 Action에서 호출을 지우면 red

`──` 커밋: `test(auth): the cross-tenant access attempts that must fail`

### 5b. 구현

- [ ] 라우트 이관 — `app/(edit)/keys/` → `app/(edit)/projects/[slug]/translations/page.tsx`(판정 로직·
      `lib/keys/view.ts` 그대로, 최상단 `requireProjectAccess`, `loadProject(prisma, slug)`는 인가가 준
      `projectId`로). `app/(edit)/projects/page.tsx`(멤버십 목록) 신설. `/keys` 삭제, `app/page.tsx`
      redirect → `/projects`, `revalidatePath` 경로 갱신
  - 검증 `[auto]`: `grep -rn ACTIVE_PROJECT_SLUG app/\(edit\) lib/keys lib/auth components` 0건 /
    `[manual]`: 로그인 → `/projects` → 프로젝트 클릭 → 표가 보인다. 멤버 아닌 slug 직접 입력 → `/projects`로 튄다
- [ ] `saveTranslation(raw)`·`triggerPullAction(slug)` — `raw`에 `slug` 포함(Zod), **기본값 자리 `requireEnv`
      금지**(design §8). `getProjectAccess` → 인가된 `projectId`로 기존 격리 검사. `updatedBy: userId`.
      `TranslationInput`·`PullButton`이 slug를 props로 받는다
  - 검증 `[auto]`: 5a 케이스 green + 기존 값 전달 테스트(저장→DB→pull 파일 내용) 새 경로에서 green
- [ ] 초대 Action — `createInvitation({ slug, email, role })`(OWNER, 토큰 원문 1회 반환, 7일 만료, 같은
      이메일 미수락 행 회전) · `acceptInvitation({ token })`(**`requireUser`만**, `planInvitationAccept`,
      `updateMany … acceptedAt: null` 단일 사용). `/invite/[token]/page.tsx`(matcher 밖, design §4.1 표대로
      네 실패 분기를 각자 한 줄로, 이메일 마스킹)
  - 검증 `[auto]`: 5a 초대 케이스 green / `[manual]`: **Google로 로그인한(허용 목록에 있을 수 없는)
    사용자가 링크 → 수락 → `/projects/<slug>/translations`에서 저장 → Publish 성공** (spec 완료 조건 3)
- [ ] 멤버 Action — `changeMember({ slug, targetUserId, nextRole })`(OWNER, `planMemberChange`). 화면은 6단계,
      호출자는 테스트 + 헤더의 임시 초대 폼과 같은 자리
  - 검증 `[auto]`: 5a 마지막 OWNER 케이스 green
- [ ] 최소 화면 — `/`에 Google 버튼 + 문구 교체("허용 목록…" 삭제) + `?error=` 한 줄, 헤더 `user.name ?? user.email`,
      `translation-input.tsx`의 실패 문구를 `accessErrorMessage`로(입력값 유지), 토큰 원문 표시는
      `font-mono` + 복사
  - 검증 `[manual]`: 세션 회수(Session 행 삭제) 뒤 blur 저장 → "로그인이 만료됐다" 한 줄, 입력값 남음
- [ ] **같은 커밋에서** `AUTH_ALLOWED_LOGINS`·`lib/auth/allow.ts`·**`lib/auth/__tests__/allow.test.ts`** 제거,
      `signIn` 콜백은 §4의 이메일 검증만 남긴다. `middleware.ts:13`·`layout.tsx:7-13` 주석 갱신
  - 검증 `[auto]`: `grep -r AUTH_ALLOWED_LOGINS`가 `.env.example` 포함 0건. `pnpm test` green.
    `pnpm typecheck` green

`──` 커밋: `feat(auth): project membership replaces the login allowlist`

## 6. 보안 게이트 대조 — 이걸 통과해야 2단계가 닫힌다

SAAS.md §5.7 11항목 ↔ 5a 테스트 이름 대조표. **테스트는 5a에서 이미 green이다** — 여기는 빠진 항목이
없는지 세는 자리다.

| SAAS §5.7 | 이 단계 | 근거 |
|---|---|---|
| 비로그인 사용자의 조회·수정·Publish | ✅ 수정·Publish `[auto]` / 조회(RSC 페이지) `[manual]` curl 302 | 5a·§4 |
| A 멤버가 B의 URL·ID 직접 전송 | ✅ `[auto]` | 5a |
| 다른 프로젝트의 `keyId`·`localeCode` | ✅ `[auto]` — `translationId`는 **해당 없음**(Action이 받지 않는다) | 5a |
| EDITOR의 멤버·리포 설정 변경 | ✅ `[auto]` — 리포 설정 Action은 없어 `canPerform` 케이스로 | 5a·§1 |
| 설치되지 않은 리포 등록 | ⏭ **4단계** | spec |
| 설치에 접근할 수 없는 사용자의 생성 | ⏭ **4단계** | spec |
| 제거된 멤버가 기존 세션으로 재접근 | ✅ `[auto]`(행 없음 → 거부) + `[manual]`(Session 삭제) | 5a·§4 |
| 같은 이메일 provider 자동 병합 | ✅ `[auto]`(옵션 부재 검사) + `[manual]` | §4 |
| 초대받은 이메일과 다른 계정으로 수락 | ✅ `[auto]` | 5a |
| 초대 토큰 재사용·만료 후 사용 | ✅ `[auto]` | 5a |
| 로그·응답에 토큰·PEM·DB URL 노출 | ✅ 기존 `lib/failure.ts` + 초대 토큰은 URL 경로 노출을 **단일 사용·7일로 수용**(design §4.1) | — |

- [ ] 표의 ✅ 전부에 5a 테스트 이름이 붙어 있고 `pnpm test` green
- [ ] `[manual]` 넷을 preview(dev 고정 URL)에서 한 번씩 밟았다

`──` 커밋 없음 (문서 §7에 합친다)

## 7. 문서

- [ ] **`docs/ARCHITECTURE.md` §6·§6.1 갱신** — 차단이 미들웨어 단독에서 **미들웨어(쿠키 존재, 1차) +
      진입점(본판정)** 으로 갈렸다는 것, **조건부 렌더 금지는 유지**, `auth` 래퍼가 DB 세션에서 DB를 친다는 함정
- [ ] **`docs/SAAS.md`** — §8 2단계 체크 + **3단계를 2단계에 흡수했다고 접기** / §8 0단계 헤더 "← 현재 단계"
      제거 / §5.2 시그니처 `slug`(내부 `projectId`) / §5.6에 토큰 URL 노출 수용·`@@index` 판정·`updatedBy=User.id` /
      §5.7에 단계 표기(4단계 2건) / **§4.3 ②·§8 5단계에 `pushTokenHash`·`/api/pull` 순회 구현을 배정**
      (검수 결정 — "1단계 필수" 표기 삭제) / §6 스키마 표 갱신 / 멤버 관리 **화면**을 6단계에 추가
- [ ] **`CLAUDE.md`** — "세션은 JWT" 절 재작성 / "인증 차단은 `middleware.ts`에만 의존" → §4대로 /
      새 머신 셋업 OAuth 앱 표에 Google 1행(클라이언트 1개) / 디렉터리 구조(`lib/auth/*`·`app/(edit)/projects`·
      `/invite`·`scripts/backfill-owners.ts`) / 명령어 표에 backfill / 테넌시 행
- [ ] `.env.example` — `AUTH_ALLOWED_LOGINS` 제거, "OAuth 앱이 둘" → 셋(+Google 1), `ACTIVE_PROJECT_SLUG`
      주석을 "push·pull 전용 — 5단계에서 사라진다"로
- [ ] `docs/features/README.md` — tenant-auth 상태 갱신 + 백로그에 "`translation-input` 저장 상태 `role=status`·
      실패 시 포커스 복귀"(6단계) 한 줄
- [ ] `docs/TASKS.md` 전역 미결의 `ACTIVE_PROJECT_SLUG` 항목에 "편집 경로는 tenant-auth에서 제거됨, push·pull은
      SAAS 5단계" 한 줄 — PoC 기록이라 그 이상 손대지 않는다
  - 검증 `[auto]`: `pnpm sync:agents:check` 통과 / `[manual]`: 각 문서의 서술이 코드와 일치

`──` 커밋: `docs: authorization moves from an allowlist to project membership`

## 8. 뒷정리 (prod 적용 뒤)

- [ ] `scripts/backfill-owners.ts`·`lib/auth/backfill.ts`(+테스트) 삭제 — 일회성이다. prod `ProjectMember`
      행을 눈으로 확인한 뒤

`──` 커밋: `chore: drop the one-off owner backfill`
