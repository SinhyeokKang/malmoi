# tenant-auth — design

## 1. 영향 받는 흐름

**셋 중 편집 UI 하나이고, 나머지 둘에는 손대지 않는다.**

| 흐름 | 영향 |
|---|---|
| **push** | **없다.** `/api/push`는 Bearer `PUSH_TOKEN` + `ACTIVE_PROJECT_SLUG`이고 사용자 세션과 무관하다. 프로젝트별 토큰(SAAS.md §7.8)은 5단계다 |
| **편집 UI** | **전부.** `/keys` → `/projects/[slug]/translations`로 이관(판정 로직 `lib/keys/view.ts`는 그대로), `saveTranslation`·`triggerPullAction`이 `requireProjectAccess`를 지나고 slug를 인자로 받는다. 최소 화면 셋 신설(§4.1) |
| **pull** | **간접.** `triggerPull(prisma, slug)`의 시그니처는 그대로이고, **누가 그 slug를 부를 자격이 있는가**를 호출부가 판정한다. `/api/pull`(cron)은 `ACTIVE_PROJECT_SLUG`를 계속 읽는다 — 전 프로젝트 순회는 5단계 |

## 2. 순수 함수 — `/tdd` 진입점

**여기가 이 기능의 테스트 가능한 전부다.** I/O(세션·DB·OAuth)는 얇은 껍데기로 감싸고, 판정은 전부
아래로 내린다. 형태는 이 리포의 `checkBearer`/`statusFor`(`lib/push/auth.ts`)·`planSave`(`lib/keys/save.ts`)와
같다 — **값을 인자로 받는 순수 판정 + 이름 붙은 union**.

| 함수 | 위치 | 무엇을 판정하나 |
|---|---|---|
| `normalizeEmail(raw)` | `lib/auth/email.ts` | 비교·저장용 정규화 — trim + 소문자. **그 이상은 하지 않는다**: gmail 점·`+` 태그·유니코드 로컬파트를 건드리지 않는다 (provider가 준 주소를 우리가 재해석하면 다른 사람과 일치시킬 수 있다). ⚠️ `ProjectInvitation.email`·`User.email`은 **정규화 값을 저장**한다 — 원문을 저장하면 `@@index([projectId, email])` 조회가 대소문자로 갈린다 |
| `canPerform(role, permission)` | `lib/auth/permission.ts` | SAAS.md §3 권한표를 코드로. permission은 **셋**: `"translation:write"`(조회·수정·**Publish 포함**) · `"project:settings"` · `"member:manage"`. 3×2=6칸 전부 케이스 |
| `hashInviteToken(raw)` | `lib/auth/invitation.ts` | sha256 hex. **원문은 저장하지 않는다** |
| `planInvitationAccept({ invitation, verifiedEmail, now })` | `lib/auth/invitation.ts` | `ok` / `expired` / `already-accepted` / `email-mismatch` / `not-found`. `invitation`은 **토큰 해시로 찾은 행 하나**(없으면 null) |
| `planProjectAccess({ member, permission })` | `lib/auth/access.ts` | `member`(`ProjectMember` 행 또는 null) → `not-found` / `forbidden` / `{ ok, projectId, role }`. **`requireProjectAccess`의 판정은 전부 여기다** — 껍데기는 조회와 redirect만 한다 |
| `planMemberChange({ members, targetUserId, nextRole })` | `lib/auth/membership.ts` | `nextRole: Role \| null`(null = 제거). `ok` / `last-owner` / `not-member`. **제거와 강등이 같은 판정을 지난다** — 유일 OWNER의 OWNER→EDITOR도 `last-owner` |
| `planOwnerBackfill({ projects, members, owner })` | `lib/auth/backfill.ts` | 기존 `Project` 전 행에 대해 **없는 OWNER 행만** 낸다. 멱등성이 여기서 결정되므로 "두 번 돌려본다"가 아니라 `pnpm test`로 판정한다 |

**`planAccountLink`는 없다** (검수 2026-09-05). Auth.js 어댑터가 기본으로 교차 provider 자동 연결을
거부하고(`allowDangerousEmailAccountLinking` 미설정 — `@auth/core/lib/actions/callback/handle-login.js`),
명시적 "GitHub 연결"은 4단계다. 이 단계의 방어선은 **그 옵션을 어느 provider에도 켜지 않는 것**이고,
그걸 고정하는 테스트는 provider 설정을 읽는 검사 하나다.

⚠️ **`planInvitationAccept`가 `not-found`를 따로 갖는 이유**: 조회 실패와 "권한 없음"을 같은 값으로
접으면 **실패한 조회가 정상 거부로 읽힌다** — POSTMORTEM 2026-09-03이 정확히 그 형태였다(실패한 PR
조회를 "PR 없음"으로 읽어 경고가 사라졌다). 호출부가 둘을 구별할 수 있어야 한다. DB **오류**는 던지므로
그 축은 이미 갈려 있다.

⚠️ **`planProjectAccess`는 반대로 "slug 없음"과 "멤버 아님"을 같은 `not-found`로 접는다.** SAAS §7.7
"URL을 안다는 사실은 접근 권한이 아니다" — 존재 여부를 403/404 차이로 새지 않게 한다. `forbidden`은
**멤버이지만 permission이 모자란** 경우(EDITOR의 `member:manage`)에만 쓴다.

### 2.1 검증된 이메일 — `signIn` 콜백이 fail-closed로 거른다

Auth.js 어댑터는 OAuth 로그인에서 `User.emailVerified`를 세우지 않는다(이메일 provider 전용). 그래서
**`signIn` 콜백이 provider별 검증 신호를 보고, 없거나 미검증이면 로그인을 거부한다**:

| provider | 신호 |
|---|---|
| Google | id_token의 `email_verified === true` |
| GitHub | `/user/emails`에서 `primary && verified`인 항목. ⚠️ **GitHub provider가 공개 이메일이 없을 때 그 엔드포인트를 조회하는지 구현 전에 확인한다**(tasks §4) — 안 하면 비공개 이메일 계정은 `email: null`로 오고, 그 계정은 로그인 자체가 거부된다(fail-closed라 옳다. 사용자에게는 "GitHub 이메일을 공개하거나 Google로") |

이래서 `User.email`은 **항상 검증된 값**이고 `planInvitationAccept`의 `verifiedEmail` 계약("검증된 것만
넘긴다")이 성립한다. 초대 없는 OWNER 경로도 같은 검사를 지난다 — 예외를 두면 두 경로의 `User.email`
성질이 갈린다.

## 3. I/O 껍데기 — 판정을 하지 않는다

```
requireUser()                                       세션 → { userId } (없으면 redirect("/"))
requireProjectAccess({ userId, slug, permission })  slug→project 조회 + ProjectMember 조회
                                                    → planProjectAccess → { projectId, role }
                                                    not-found·forbidden이면 redirect("/projects")
```

**slug를 받지만 인가는 `projectId`로 한다** (SAAS §5.2·§7.7). 내부에서 `project.findUnique({ slug })`로
`projectId`를 풀고 `projectMember.findUnique({ projectId_userId })`를 본다. SAAS §5.2의 시그니처 표기
(`projectId`)는 tasks §7에서 이쪽으로 맞춘다 — 호출자가 가진 것은 URL의 slug다.

**프로젝트를 다루는 모든 서버 진입점이 후자를 지난다.** 클라이언트가 보낸 role·projectId·owner 여부를
믿지 않는다 (SAAS.md §5.2). 예외 경계는 spec 완료 조건 6에 열거돼 있다.

**Server Action 안에서는 `redirect()`가 아니라 결과값으로 거부한다** — `saveTranslation`은 blur 저장이라
redirect가 입력 중인 셀을 날린다. Action용 `getProjectAccess()`(같은 판정, 결과를 union으로 반환)와
페이지용 `requireProjectAccess()`(redirect) 둘을 두고, 판정은 `planProjectAccess` 하나다.

## 4. ⚠️ 차단 지점이 둘로 갈린다 — DB 세션의 대가

**이게 이 설계에서 가장 틀리기 쉬운 자리다.**

JWT일 때는 미들웨어가 토큰만 보고 **DB 없이** 완전한 판정을 했다. DB 세션에서는 다르다 —
**현재 `middleware.ts`의 `export default auth(fn)` 래퍼는 `strategy: "database"`에서 `adapter.getSessionAndUser`를
부르고, `updateAge`를 넘으면 `updateSession` 쓰기까지 한다**(`next-auth/lib/index.js:142-145`,
`@auth/core/lib/actions/session.js:65-91` — 검수 2026-09-05 확인). 즉 그 래퍼를 남기면 미들웨어가
Prisma/pg를 물고 "값싼 1차 차단"이 거짓이 된다.

**해법 — 층을 나눈다:**

| 층 | 무엇을 하나 | 무엇을 못 하나 |
|---|---|---|
| `middleware.ts` | **`auth` 래퍼를 버린다.** `request.cookies`에 세션 쿠키가 **있는지만** 본다 — 이름은 `authjs.session-token`(http) / `__Secure-authjs.session-token`(https, `@auth/core/lib/utils/cookie.js:44-49`). **둘 다 검사한다** — 로컬은 접두 없음, preview·prod는 접두 있음. 없으면 `/`로 redirect | 쿠키가 위조·만료됐는지 모른다. **프로젝트 인가는 전혀 모른다** |
| 페이지·Server Action | `requireProjectAccess`/`getProjectAccess`로 **진짜 판정** | — |

쿠키 이름 판정은 순수 함수 `hasSessionCookie(cookieNames)`(`lib/auth/cookie.ts`)로 빼서 테스트한다.
split config(`auth.config.ts`)는 이 프로젝트엔 과하다 — 미들웨어가 Auth.js를 import할 이유가 없어진다.

⚠️ **"미들웨어가 유일한 차단"이라는 기존 규칙이 여기서 바뀐다.** 그 규칙(CLAUDE.md·ARCHITECTURE §6.1)이
막던 것은 **"레이아웃의 조건부 렌더"** 였다 — POSTMORTEM 2026-08-31: App Router가 레이아웃과 페이지를
병렬로 렌더해서, 레이아웃이 `children`을 안 써도 **페이지는 이미 실행되고 RSC 페이로드가 응답에
실린다**(실측 1.3MB / 1446키).

**페이지 최상단의 `await requireProjectAccess()`는 조건부 렌더가 아니다** — 실패하면 `redirect()`를
던져 렌더가 중단되므로 페이로드가 만들어지지 않는다. 그래서 이 구조가 안전하다. 다만:

- **조건부 렌더로 되돌아가지 않는다.** `if (!access) return <Denied/>`는 그때의 실수를 그대로 반복한다.
- **인가는 페이지 진입 1회, 행 루프 밖이다.** 셀마다 `canPerform`을 부르지 않는다 — 수백 행 화면에서
  비용을 늘리지 않는다 (CDO 검수).
- **`matcher`에 `/projects/:path*`를 추가하고 `/keys/:path*`를 뺀다.** `/invite/:path*`는 **넣지 않는다** —
  §4.1. 빠뜨리면 1차 차단이 없다.
- **검증은 응답 본문으로 한다.** `curl -s <라우트> | wc -c`가 302 + 빈 본문. 화면으로는 안 보인다.
- `middleware.ts:13`·`app/(edit)/layout.tsx:7-13`·`types/next-auth.d.ts:5`의 "JWT라 DB 없이" 주석이
  거짓이 된다 — tasks §5가 함께 고친다.
- Next 16.3.3은 `middleware` 규약이 deprecated고 `proxy`로 바뀌었다(`next/dist/build/index.js:730`
  warnOnce, 둘 다 있으면 에러). 동작하므로 **이 기능에서 건드리지 않는다** — 옮기는 것은 별도 chore.

### 4.1 최소 화면 — 기존 관용구 그대로, 신설 셋 + 이관 하나

spec 완료 조건 3은 화면 없이 손으로도 검증할 수 없다. **재작성이 아니라 착지점 신설**이고, 전부
`app/page.tsx`(inline server action `<form>` + raw `<button>`)·`keys/page.tsx:28-39`(빈/오류 상태 = `text-sm`
한 줄 + `text-muted-foreground text-xs` 원인 한 줄)의 관용구를 그대로 쓴다. **Supabase 레퍼런스
(DESIGN §9)는 여기서 적용하지 않는다** — 사이드바·프로젝트 전환은 6단계 것이고 이 화면들은 버튼
하나·문장 두 줄 규모다. 새 raw 색·토큰·`dark:` 없음.

| 화면 | 무엇 | 거부·실패 상태 |
|---|---|---|
| `/` (기존) | GitHub 버튼 옆에 **Google 버튼**. 문구 "GitHub 계정으로… 허용 목록에 없는 계정은…"을 지운다(거짓이 된다). 로그인돼 있으면 `/projects`로 | `signIn` 거부(미검증 이메일·`OAuthAccountNotLinked`)는 Auth.js 기본 `/api/auth/error`로 간다 — `pages.error`를 `/`로 돌리고 `?error=`를 한 줄로 보인다(`AccessDenied` → "이메일이 검증되지 않았거나 이미 다른 방식으로 가입한 계정이다") |
| `/projects` (신설) | 내 멤버십 목록 — slug·name·role, 링크만. **로그인 후 착지점**이고 인가 거부의 redirect 목적지 | 멤버십 0 → "어느 프로젝트의 멤버도 아니다. 초대 링크를 받아 여세요" 두 줄 |
| `/projects/[slug]/translations` (이관) | `/keys` 그대로. `requireProjectAccess({ permission: "translation:write" })` 최상단 | not-found·forbidden → `redirect("/projects")` |
| `/invite/[token]` (신설) | **matcher 밖** — 비로그인으로 열 수 있어야 토큰이 보존된다(matcher가 `/`로 302하면 `callbackUrl` 없이 토큰이 사라진다). 페이지는 `hashInviteToken`으로 행을 찾아 **마스킹된 초대 이메일**(`s***@day1company.co.kr`)·프로젝트 이름·역할을 보인다. 세션 없음 → GitHub/Google 버튼(`redirectTo`를 이 URL로). 세션 있음 → "수락" 버튼(Server Action). ⚠️ 이 페이지가 비로그인으로 노출하는 것은 **마스킹 이메일·프로젝트 이름·역할**뿐이다 — 조건부 렌더이지만 새는 데이터가 그것이 전부라 허용한다. 번역 데이터는 여기서 조회하지 않는다 | `planInvitationAccept`의 네 실패 분기를 **각자 다른 한 줄**로(`text-destructive text-sm`): `not-found` "초대가 없다" / `expired` "만료됐다 — 다시 초대를 요청" / `already-accepted` "이미 사용된 링크" / `email-mismatch` "`<마스킹>`으로 초대됐다 — 그 이메일의 계정으로 다시 로그인". 판정은 갈라놓고 화면을 안 갈라놓으면 사용자가 왜 실패했는지 모른다 |
| `(edit)/layout.tsx` 헤더 (수정) | `session.user.login` → `user.name ?? user.email`. 핸들과 같이 sans(DESIGN: 식별자가 아니라 이름) | — |
| 초대 생성 (Action만, 화면은 6단계) | OWNER가 `createInvitation({ slug, email, role })`을 부르면 토큰 원문이 **응답에 한 번** 실린다. 6단계 전까지 호출자는 테스트와 `/projects/[slug]/translations` 헤더의 임시 폼 하나 — 표시할 때는 `font-mono` + 복사 버튼(식별자다) | — |

**세션 회수 뒤 blur 저장**: `translation-input.tsx:78`이 오늘 `저장 실패: unauthorized`를 12px 한 줄로
보인다. DB 세션에선 "회수 즉시 반영"이 **정확히 이 문구로만** 드러난다 — `error` 문자열을 한국어로 매핑하는
순수 함수(`lib/pull/message.ts`의 `pullMessage`와 같은 형태) 하나를 두고 `unauthorized` → "로그인이 만료됐다
— 다시 로그인", `forbidden` → "이 프로젝트를 편집할 권한이 없다"로 보인다. 입력값은 남긴다(재로그인 뒤
다시 저장할 수 있게). 접근성(`aria-live`·포커스 복귀)은 기존 결함이라 6단계 백로그로(tasks §7).

**초대 토큰이 URL 경로에 실린다** → Vercel 요청 로그에 남는다(SAAS §5.7 마지막 항목과 긴장). **단일
사용 + 7일 만료로 받아들인다** — 링크가 사람 손으로 전달되는 설계라 URL 밖에 실을 방법이 없고, 로그에
남은 토큰은 수락 직후 무효다. 이 판정을 SAAS §5.6에 한 줄로 올린다(tasks §7).

## 5. 스키마 변경 — additive

**5테이블 → 11테이블.** 전부 새 테이블이고 기존 테이블에 `ALTER`가 없다. (새 테이블의 FK는 Prisma가
`ALTER TABLE "ProjectMember" ADD CONSTRAINT`로 내므로 "ALTER 0건"이 아니라 **"기존 테이블에 ALTER 0건"**
이 검증 문장이다.)

```prisma
User               id · email(unique — 정규화 저장, §2.1이 검증을 보장) · emailVerified? · name? · image? · createdAt
Account            Auth.js 표준 — @@id([provider, providerAccountId]) · type · userId …
Session            Auth.js 표준 — sessionToken @unique · userId · expires
VerificationToken  Auth.js 어댑터가 요구 — 이메일 provider를 안 쓰므로 비어 있다
ProjectMember      projectId · userId · role(OWNER|EDITOR) · createdAt · updatedAt
                   @@unique([projectId, userId])
ProjectInvitation  projectId · email(정규화) · role · tokenHash(unique) · expiresAt · acceptedAt? · invitedBy
                   @@index([projectId, email])   ← unique가 아니다 (아래)
```

- **`ProjectInvitation`에 `@@unique([projectId, email])`을 두지 않는다.** `acceptedAt`을 남기는 설계라
  수락·만료된 행이 이메일을 점유해 **재초대가 unique 위반**이 된다(멤버를 뺐다가 다시 부르는 정상 경로).
  행이 여럿이어도 `planInvitationAccept`가 `expired`·`already-accepted`를 가르므로 판정은 성립한다.
  생성 Action은 **같은 이메일의 미수락 행이 있으면 토큰을 회전**한다(새 행 + 옛 행 만료).
- **`onDelete`는 전부 `Restrict`** — 기존 스키마가 `Project` 관계 전부를 `Restrict`로 둔 것(ARCHITECTURE §5)과
  같은 이유: 삭제가 조용히 번져 나가지 않게. `User` 삭제는 이 단계에 경로가 없다.
- **`ProjectMember.updatedAt`** — SAAS §6이 `AuditEvent` 유예의 근거로 이 컬럼을 든다.
- Auth.js 어댑터 모델 필드명은 `@auth/core/adapters.d.ts`(`AdapterUser`·`AdapterAccount`·`AdapterSession`·
  `VerificationToken`)를 따른다. **`@auth/prisma-adapter` 버전은 번들된 `@auth/core@0.41.3`과 Prisma 7
  `prisma-client` 생성기에 맞는 것을 확인해 `package.json`에 정확 고정한다**(tasks §4).
- **`Translation.updatedBy`는 `User.id`를 넣는다** (검수 결정 2026-09-05). 컬럼 타입이 `String?`
  그대로라 마이그레이션은 없고 주석만 바뀐다. 근거는 SAAS §5.6("이메일은 재할당된다")과 같다. 셀 옆
  표시는 6단계가 join으로 푼다 — 그때까지 `keys/page.tsx:178`은 id를 보이거나 숨긴다. 세션에는 `user.id`만
  싣는다(`types/next-auth.d.ts`의 `login` → `id`).

**배포 순서 (additive-first, ARCHITECTURE §7):**

1. 테이블 추가 — 이 시점에 애플리케이션은 아직 `AUTH_ALLOWED_LOGINS`를 쓴다
2. **기존 `Project`에 OWNER backfill** — `scripts/backfill-owners.ts`가 **`User` + `Account` + `ProjectMember`를
   함께 upsert한다.** 소유자는 `SinhyeokKang`(리포 소유자의 GitHub 계정)이고 id·이메일은 `gh api user`로
   얻는다. ⚠️ **`User`만 만들면 첫 GitHub 로그인이 `OAuthAccountNotLinked`로 거부된다** — 이메일이 같은
   User가 있고 그 provider의 Account가 없으면 어댑터가 던진다(`@auth/core/lib/actions/callback/handle-login.js:231-251`).
   `Account(provider="github", providerAccountId=<GitHub 숫자 id>, type="oauth")`까지 만들어야 로그인이
   기존 User에 붙는다. "먼저 로그인해서 만들게 한다"는 경로는 어댑터(3)가 배포된 뒤에만 열리므로
   **순서상 불가능하다** — 그래서 스크립트가 셋을 만든다
3. **애플리케이션 전환과 `AUTH_ALLOWED_LOGINS` 제거를 한 커밋으로** (아래 ⚠️)

⚠️ **3을 쪼개지 않는 이유 — 공존 구간이 애매한 게 아니라 기능을 막는다.** `AUTH_ALLOWED_LOGINS`
검사는 `signIn` 콜백에 있어서 **로그인 자체를 거부**한다. 그것을 남긴 채 `requireProjectAccess`만
붙이면, 초대받아 `ProjectMember` 행이 있는 비개발자가 **목록에 핸들이 없어 로그인 단계에서 막힌다** —
이 기능이 하려는 일(spec 완료 조건 3)이 그 구간 동안 성립하지 않는다. 두 인가가 **AND로 걸리므로**
좁은 쪽이 이긴다.

⚠️ **2와 3 사이가 위험 구간이다.** backfill을 빠뜨린 채 3을 배포하면 **아무도 아무 프로젝트에도
못 들어간다**(fail-closed라 그렇게 되는 것이 옳지만, 복구가 SQL이다). backfill을 마이그레이션 안에
넣지 않고 **별도 스크립트로 두고 눈으로 확인**한다 — dev와 prod의 `Project` 행이 다르다.

⚠️ **prod 접속 — `DIRECT_URL_PROD` 예외.** CLAUDE.md는 prod **런타임** URL(`DATABASE_URL_PROD`)을 금지한다.
backfill은 런타임이 아니라 마이그레이션과 같은 성질의 일회성 DDL/DML이므로 **`--target prod` 명시
플래그일 때만 `DIRECT_URL_PROD`(5432)를 `PrismaPg`에 넘긴다** — `prisma.config.ts`가 `PRISMA_TARGET=prod`로
하는 것과 같은 모양이다. 기본은 **dry-run**(만들 행을 출력만), `--apply`가 있어야 쓴다. `lib/db.ts`는
`server-only`라 tsx가 못 쓰므로 `scripts/smoke-github.ts`처럼 자체 `PrismaPg`를 든다.

⚠️ **`ProjectMember`가 없는 `Project`는 접근 불가다.** 스크립트는 **`Project` 전 행**을 훑는 멱등 upsert라
prod 행 수를 미리 알 필요가 없다. 양쪽 다 돌린다 — `pnpm db:deploy`가 스키마만 옮기고 데이터는 안 옮긴다.

## 6. 새 환경변수

| 변수 | 스코프 | 비고 |
|---|---|---|
| `AUTH_GOOGLE_ID` · `AUTH_GOOGLE_SECRET` | 로컬 · Production · Preview — **셋이 같은 값** | **Google OAuth 클라이언트는 하나다.** Google Cloud 웹 클라이언트는 redirect URI를 **여러 개** 등록할 수 있어 GitHub의 "앱당 callback 하나" 제약이 없다 — 로컬 `http://localhost:3000/api/auth/callback/google` · dev 고정 URL · `https://mal-moi.com` 셋을 한 클라이언트에 등록하고 Vercel 두 스코프에 같은 값을 넣는다. (검수 2026-09-05 — 이전 서술 "앱이 또 셋, 총 여섯"은 과대였다) |

**Google을 미루지 않는 이유**: spec 완료 조건 3(GitHub 계정 없이 번역)이 **Google 없이는 검증 불가**다.
미루면 2단계가 "닫혔다"고 말하면서 그 조건만 열려 있게 되고, 그 상태로 4~5단계를 쌓으면 비개발자
경로가 처음 밟히는 시점이 훨씬 뒤가 된다.

**`.env.example` 갱신을 태스크에 넣는다.** 빠지면 새 체크아웃에서 원인 불명으로 죽는다 (CLAUDE.md).
기존 모순도 이때 맞춘다 — `.env.example:29`는 "OAuth 앱이 둘", CLAUDE.md는 "셋"(로컬 포함). 셋이 맞다.

**제거되는 것**: `AUTH_ALLOWED_LOGINS`(**이 단계, §5의 3번 커밋에서**), `ACTIVE_PROJECT_SLUG`(**편집 경로에서만** —
`/api/push`·`/api/pull`은 5단계까지 계속 쓴다. `.env.example`의 주석을 "push·pull 전용"으로 고친다).

## 7. 불변식 영향

| 불변식 | 영향 |
|---|---|
| export 결정성 (ARCHITECTURE §1) | **없음** — 이 기능은 파일을 만들지 않는다 |
| blob SHA 비교 (§2·§3) | **없음** |
| **인증 경계 (§6)** | **바뀐다** — 위 §4. 차단이 미들웨어 단독에서 **미들웨어(쿠키 존재, 1차) + 진입점(본판정)** 으로 갈린다. ARCHITECTURE §6.1 갱신이 태스크에 있다 |
| 두 GitHub 자격증명 분리 (§6) | **유지** — Google이 늘어도 **로그인 provider일 뿐**이고 커밋은 계속 App installation token이 한다 |
| 모든 쿼리를 `projectId`로 좁힌다 (CLAUDE.md) | **강화된다** — 지금은 env가 준 `projectId`이고, 그때는 **인가가 판정한** `projectId`다 |
| 환경변수는 함수 안에서 (CLAUDE.md) | **주의** — §8 셋째 항목. 위험 지점은 provider가 아니라 **어댑터**다 |

## 8. POSTMORTEM에서 소환한 함정

- **2026-08-31 「레이아웃 인증 검사가 데이터 노출을 막지 못했다」** — 위 §4의 근거. 규칙을 바꾸되
  **그 규칙이 막던 것**(조건부 렌더)은 그대로 막는다. grep `grep -rn 'if (!session' app/` — 지금
  `actions.ts:105`가 그 모양이고 `requireUser`/`getProjectAccess`로 바뀐다.
- **2026-09-03 「실패한 조회를 "없음"으로 읽어 경고가 존재하지 않는 것과 구별되지 않았다」** —
  `planInvitationAccept`가 `not-found`를 별도 값으로 갖는 이유(§2).
- **2026-08-31 「모듈 로드 시점에 환경변수를 요구해 CI가 red」(+ 🔁 재발 2건)** — **위험 지점은 provider가
  아니라 어댑터다.** provider 자격증명은 라이브러리가 로드 시점에 `process.env`를 스냅샷하되 **누락에
  던지지 않는다**(`@auth/core/lib/utils/env.js:45-59`) — Google을 더해도 GitHub과 같다. 반면
  `PrismaAdapter(getPrisma())`를 `NextAuth({...})` 인자에 그대로 두면 `getPrisma()`→`requireEnv("DATABASE_URL")`이
  **import 시점에** 던져 `.env` 없는 빌드가 죽는다 — 원 항목의 `prisma.config.ts`와 같은 모양.
  **`NextAuth(async () => ({ adapter: PrismaAdapter(getPrisma()), ... }))` 지연 형태**로 쓴다. 🔁 재발 ①의
  규칙도 적용한다: `saveTranslation(raw, slug = requireEnv(...))` 같은 **기본값 자리의 `requireEnv`는
  금지** — slug는 필수 인자다. 검증 grep 둘은 tasks §4에 그대로 있다.
