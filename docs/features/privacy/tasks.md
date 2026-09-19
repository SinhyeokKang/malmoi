# privacy — tasks

순서는 **조사 → 등재(A) → 그릇 → 본문 → 배포·게시 → 본문 의존 게이트(B)(C) → 절차·문서**다.

⚠️ **초안의 순서를 뒤집었다** (design 결정, spec §4). 등재(A)는 본문 없이 성립하므로 앞에 두고, **본문에 의존하는 (B)(C)는 프로덕션 배포 뒤로 민다** — 그래야 런칭 차단(L1.1)이 `lib/privacy/` 완성을 기다리지 않고, 전사 오류가 가장 싼 지점에서 red를 낸다. 초안처럼 (A)(B)(C)를 한 커밋에 두면 커밋 1~3이 전부 green이다가 마지막에 셋이 동시에 터진다.

⚠️ **선행: L2.0의 미커밋 작업이 워크트리에 떠 있다**(`app/privacy/page.tsx`·`components/public-doc.tsx`·`messages/en.tsx`·`docs/DESIGN.md` 외 + 신규 `components/__tests__/public-doc.test.tsx`). **그것을 먼저 커밋해 경계를 가른다** — `/push` 1단계는 HEAD가 아니라 워크트리를 재므로 섞이면 L2.0과 이 기능의 diff를 나눌 수 없다.

커밋 경계는 `──` 줄로 표시한다.

## P0. 조사 — 무엇을 저장하는가

- [x] **P0.1** `prisma/schema.prisma`의 **모델 13개 전부**를 `personal` / `not-personal`로 가르고, `personal`인 모델의 스칼라 필드를 전수로 표에 옮긴다. 각 행에 **개인정보인가 / 방침이 말해야 하는가 / 어느 절인가 / 표에서 어느 행으로 접히나** 네 열.
  - ⚠️ **모델까지 전수인 것이 이번 변경의 핵심이다** — 초안은 여덟 모델 하드코딩이라 `Project`·`TranslationSurface`·`Locale`·`StringKey`·`KeyRef`가 대상 밖이었고, `schema.prisma`가 §10으로 미뤄둔 `AuditEvent` 같은 새 모델이 생겨도 게이트가 침묵했다.
  - ⚠️ **`Project.repoOwner`·`repositoryImportToken`·`pushTokenHash`를 판단하는 자리다.** 모델 자체는 `not-personal`이 맞을 가능성이 높지만(생성자 컬럼이 없고 소유는 `ProjectMember`로만 표현된다) **판단을 한 번 남기는 것이 요지다.**
  - ⚠️ **`VerificationToken.identifier`를 "개인정보 아님"으로 분류하면 틀린다** — 값이 `JSON.stringify([purpose, "v1", userId, provider, providerAccountId, …])`라 `userId`와 외부 계정 식별자가 한 문자열 안에 있다(`lib/login-link/policy.ts`·`lib/session-revocation/store.ts`).
  - ⚠️ **접히는 관계(네 번째 열)를 여기서 적어 두지 않으면 P3.1에서 다시 판단하게 된다**(`Account`의 OAuth 컬럼 일곱 → "GitHub·Google 연결 토큰" 한 행).
  - 검증: **줄 단위 grep으로 개수를 대조하지 않는다**(초안의 `grep -cE '^  [a-zA-Z]'`는 실측 168을 주고 실제 대상은 48이다 — 관계 36·enum 블록 값 8·enum 필드 4·generator 3이 섞인다). 전수 여부는 **P1.1의 `pnpm typecheck`이 판정한다** — 빠진 모델·필드를 이름으로 지목한다. 이 표는 그 입력이자 P3.1 본문의 입력이다.
- [x] **P0.2** 외부 전송처를 전수로 확인한다 — GitHub API · GitHub/Google OAuth · Supabase · Vercel Blob **넷이 맞는지**. 다섯째가 있으면 spec §6(자동 허용목록 제외)의 근거가 무너진다.
  - ⚠️ **`grep 'https://'`로는 확인되지 않는다** — 실측 7줄이 전부 `github.com`이고, **Google은 `next-auth/providers/google` 내부 · Supabase는 `DATABASE_URL` 환경변수 · Blob은 `@vercel/blob` SDK라 리터럴이 없다.** 넷 중 셋을 원리적으로 못 본다.
  - 검증: 세 축을 각각 본다 — ① `package.json`의 네트워크를 타는 의존성 ② `lib/env.ts`가 읽는 외부 서비스 env 전수 ③ `grep -rn 'https://' lib app auth.ts | grep -v __tests__`의 호스트. 결과를 이 파일에 적는다.
  - ⚠️ **프로필 이미지 호스트(`avatars.githubusercontent.com`·`lh3.googleusercontent.com`)를 다섯째로 셀지 판정한다** — 우리가 보내는 쪽이 아니라 받아오는 쪽이라 "전송처"가 아닐 수 있다. 어느 쪽이든 판정을 적는다.
- [x] **P0.3** 쿠키를 전수로 확인한다(세션 · OAuth state · `authjs.callback-url` · login-link/session-revocation 지문). 이름·수명·목적을 표로.
  - 검증: `lib/auth/cookie.ts`·`lib/login-link/**`·`lib/session-revocation/**`·`lib/github-connect/**`에서 `set(` 호출 전수.
- [x] **P0.4** **문의 주소와 삭제 요청 처리 절차를 확정한다.** 주소는 **`ox501501@gmail.com`**(결정 13, 2026-09-19 사용자). 처리 절차(요청을 받으면 무엇을 지우는가 · 응답 기한)를 한 문단으로 적는다.
  - ⚠️ **리포 전체에 이 판정이 0건이다.** 정하지 않으면 방침이 지킬 수 없는 약속을 공표한다.
  - 검증: 절차 문단이 P3.1의 `deletion` 절 입력이자 P5.3의 OPERATIONS.md 항목 입력이 된다.

### P0 결과 (2026-09-19 조사)

**P0.1 — 모델 13 / `personal` 8 / 분류 대상 스칼라 63.** 분류는 `lib/privacy/collected.ts`가 정본이고 아래는 그 판단 근거다.

| 모델 | 분류 | 근거 |
|---|---|---|
| `Project` | not-personal | 생성자 컬럼이 없고 소유는 `ProjectMember`로만 표현된다. ⚠️ `repoOwner`는 개인 리포면 개인 계정명과 같은 문자열이지만 **우리가 사람에 대해 모으는 값이 아니라 리포 좌표다** — 방침은 "연결한 리포의 좌표"를 목적(§purposes)에서 말하고 수집 항목 표에는 넣지 않는다. `repositoryImportToken`·`pushTokenHash`는 기계 자격증명이다 |
| `TranslationSurface` · `Locale` · `StringKey` · `KeyRef` | not-personal | 번역 대상 문자열과 그 좌표뿐 |
| `Translation` | **personal** | `updatedBy`(User.id) 하나 때문이다. 스칼라 12 중 11은 `NOT_PERSONAL` |
| `SyncRun` | **personal** | `requestedBy`(User.id) 하나 |
| `User` | **personal** | 스칼라 7 전부 |
| `Account` | **personal** | OAuth 자격증명과 공급자 계정 식별자 |
| `Session` | **personal** | 세션 토큰과 그 소유자 |
| `VerificationToken` | **personal** | ⚠️ `identifier`가 `JSON.stringify([purpose, "v1", userId, provider, providerAccountId, …])`라 **`String` 타입 뒤에 userId와 외부 계정 식별자가 있다** |
| `ProjectMember` | **personal** | 누가 어느 프로젝트에서 무슨 역할인가 |
| `ProjectInvitation` | **personal** | 초대 주소와 그 HMAC 색인 |

절 배정 규칙(파일 머리 주석에 같이 남긴다): `collected` = 수집 항목 표가 이름을 대는 값 · `third-parties` = GitHub·Google 때문에만 존재하는 값 · `cookies` = 쿠키가 나르거나 쿠키 수명이 지배하는 값 · `retention` = 보관 기간을 정하는 값 · `NOT_PERSONAL` = 사람을 기술하지 않는 번역 작업 데이터.

| 모델 | `DISCLOSED` (절) | `NOT_PERSONAL` |
|---|---|---|
| `User` (7) | `collected`: `id` `name` `email` `emailLookup` `emailVerified` `image` `createdAt` | — |
| `Account` (12) | `third-parties`: `type` `provider` `providerAccountId` `refresh_token` `access_token` `expires_at` `token_type` `scope` `id_token` `session_state` · `collected`: `userId` `installRequestedAt` | — |
| `Session` (3) | `cookies`: `sessionToken` `userId` · `retention`: `expires` | — |
| `VerificationToken` (3) | `collected`: `identifier` `token` · `retention`: `expires` | — |
| `ProjectMember` (5) | `collected`: `userId` `role` `createdAt` `updatedAt` | `projectId` |
| `ProjectInvitation` (10) | `collected`: `email` `emailLookup` `role` `tokenHash` `invitedBy` `acceptedAt` · `retention`: `expiresAt` | `id` `projectId` `createdAt` |
| `Translation` (12) | `collected`: `updatedBy` | 나머지 11 |
| `SyncRun` (11) | `collected`: `requestedBy` | 나머지 10 |

표에서 접히는 행(P3.1 입력): `User` 여섯 → "Your name, email address and profile picture" / `Account` 열 → "Your GitHub and Google connection" / `Session`·`VerificationToken` → "Sign-in state" / `ProjectMember`·`ProjectInvitation` → "Project membership and invitations" / `Translation.updatedBy`·`SyncRun.requestedBy` → "Who made a change".

**P0.2 — 외부 전송처는 넷이 맞다.** 세 축으로 확인했다.
- 네트워크를 타는 의존성: `octokit` · `@octokit/oauth-app` · `next-auth`(GitHub·Google) · `pg`/`@prisma/adapter-pg`(Supabase) · `@vercel/blob`. 나머지는 전부 로컬이다.
- `lib/env.ts`가 읽는 외부 서비스 env: `DATABASE_URL`(Supabase) · `GITHUB_APP_*`·`AUTH_GITHUB_*`·`AUTH_GOOGLE_*` · `BLOB_READ_WRITE_TOKEN`(Vercel Blob).
- `https://` 리터럴은 전부 `github.com`·`api.github.com`뿐이다 — **Google은 provider 내부, Supabase는 env, Blob은 SDK라 리터럴이 없다**(셋을 원리적으로 못 본다).
- ⚠️ **프로필 이미지 호스트는 다섯째로 세지 않는다**(판정): `auth.ts:56`이 공급자 URL(`avatars.githubusercontent.com`·`lh3.googleusercontent.com`)을 `User.image`에 그대로 담고 **그 이미지는 보는 사람의 브라우저가 직접 받는다** — 우리가 보내는 것이 0이다. 다만 브라우저 요청이 그쪽에 남으므로 **`third-parties` 절이 한 문장으로 말한다**. 직접 올린 사진은 Vercel Blob(공개 읽기 + 난수 키)이라 넷 안이다.

**P0.3 — 쿠키 전수.** 전부 `httpOnly` · `sameSite=lax` · https에서 `__Host-`/`__Secure-` 접두.

| 이름 | 수명 | 목적 |
|---|---|---|
| `authjs.session-token` | 24시간(마지막 활동 기준 갱신, `updateAge` 1시간) | 로그인 상태 |
| `authjs.callback-url` | 로그인 왕복 | 로그인 뒤 돌아갈 곳 |
| Auth.js OAuth state·PKCE | 15분 | 로그인 왕복의 진정성 |
| `malmoi-gh-state` | 10분 | GitHub App 연결 왕복 |
| `malmoi-account-connect` / `malmoi-connect-state` | 5분 / 15분 | 계정 연결 왕복 |
| `malmoi-login-link` / `malmoi-link-state` | 10분 / 15분 | 같은 주소에 두 번째 로그인 수단 붙이기 |
| `malmoi-session-revocation` / `malmoi-revocation-state` | 5분 / 15분 | 세션 폐기 왕복 |

⚠️ **`authjs.csrf-token`이 조사에서 빠졌다** (2026-09-19 브라우저 실측으로 발견 — `/signin`에서 실제로 선다). `set(` 전수 grep이 못 본 이유는 **`@auth/core`가 심기 때문**이다. 세션 쿠키(브라우저를 닫으면 사라진다)이고 본문 표에 행으로 넣었다. **같은 이유로 `authjs.callback-url`의 수명도 "로그인 왕복"이 아니라 "브라우저를 닫을 때까지"다.**

**추적·분석·광고 쿠키는 0이다** — 그 사실을 `cookies` 절이 문장으로 말한다.

**P0.4 — 문의 주소와 삭제 절차.** 주소는 `ox501501@gmail.com`(결정 13). 절차: 요청을 받으면 **30일 안에** ① 그 사람의 `User`·`Account`·`Session`·`ProjectMember` 행과 아직 수락되지 않은 초대를 지우고 ② 직접 올린 프로필 사진을 Blob에서 지우며 ③ **번역 값 자체는 남기고 `Translation.updatedBy`·`SyncRun.requestedBy`만 끊는다**(번역은 프로젝트의 산출물이고 리포에 이미 나가 있다 — 지우면 남의 데이터를 지우는 것이 된다). 보관 기간: 계정은 삭제 요청까지, 세션은 24시간, 초대는 7일(`INVITE_DAYS`). 절차 정본은 P5.3이 OPERATIONS.md에 남긴다.

⚠️ **그 절차는 `prisma.user.delete` 한 줄로 끝나지 않는다** (2026-09-19 리뷰). `ProjectMember.user`와 `ProjectInvitation.invitedByUser`가 둘 다 `onDelete: Restrict`라 순서를 지키지 않으면 **던진다**: ① 그 사람의 `ProjectMember` 행 ② 그 사람이 **보낸** 초대(`invitedBy`) ③ 그 사람에게 **온** 미수락 초대 ④ 세션·`Account` ⑤ Blob의 프로필 사진 ⑥ 마지막에 `User`. **마지막 OWNER면 멈춘다** — 그 행을 지우면 스키마 주석대로 "이 행이 없는 `Project`는 아무도 접근할 수 없다"가 되므로, 소유권 이전이 선행이다. ⚠️ **`Translation.updatedBy`는 FK가 없어 손으로 `NULL`을 쓴다**(`SyncRun.requestedBy`는 `SetNull`이라 자동이다).

`──` 커밋 없음 (조사는 이 문서 갱신으로만 남는다)

## P1. 전수 등재 — 타입이 게이트다

- [ ] **P1.1** `lib/privacy/collected.ts` — `MODEL_CLASSES`(`satisfies Record<Prisma.ModelName, "personal" | "not-personal">`) · `CLASSIFIED`(mapped type, `personal` 모델의 스칼라 필드 전수 → 절 id 또는 `NOT_PERSONAL`) · `DISCLOSURE_SECTIONS`. P0.1의 표를 그대로 옮긴다. **데이터 파일이라 로직 0.**
  - ⚠️ **정규식 스키마 파서를 만들지 않는다**(결정 6). `generated/prisma`의 `<Model>ScalarFieldEnum`이 관계 필드가 빠진 스칼라 유니온을 주므로 mapped type으로 전수를 강제한다. 초안의 `schema-fields.ts`는 리포의 **세 번째** 파서가 될 뻔했다(`prisma/__tests__/schema-contract.test.ts:31-48`에 `block()`·`fieldNames()`가 이미 있다).
  - ⚠️ **`import type`으로만 가져온다** — 런타임 의존이 0이어야 순수 모듈로 남는다. **`import "server-only"`는 붙이지 않는다**(테스트가 직접 import한다). 그 사실을 파일 머리 주석에 적는다.
  - ⚠️ **`only?`를 두지 않는다**(결정 7). `Translation`의 스칼라 12개 중 11개는 `NOT_PERSONAL`, `updatedBy`만 `DISCLOSED`다.
  - ⚠️ **폴백**: `` `${M}ScalarFieldEnum` `` 템플릿 리터럴 인덱싱이 TS에서 안 풀리면 모델별로 명시적으로 쓴다(13줄). 파서를 되살리지 않는다.
  - 검증(이것이 (A) 검사다): **`pnpm typecheck` green.** 뮤테이션 짝 — 한 필드를 지우면 "빠진 키" red, 없는 필드 이름을 넣으면 "없는 키" red, `MODEL_CLASSES`에서 모델 하나를 빼면 `satisfies` red. **셋을 실제로 돌려 확인하고 되돌린다** (⚠️ 작업 중인 파일에 `git checkout --`를 쓰지 않는다 — POSTMORTEM 2026-09-16 `:2044`).
  - ⚠️ **설계와 갈린 판정 셋** (2026-09-19 `/code-review` + 리뷰 에이전트, 전부 근거를 확인하고 바꿨다): ① **`DISCLOSURE_SECTIONS`가 넷이 아니라 셋이다** — `third-parties` 절은 **서비스 넷**을 말하고 저장 항목을 이름 대지 않아, 넣어 두면 게이트가 참이 아닌 상태로 green이 된다(역검증 테스트가 실제로 red를 냈다). `Account`의 OAuth 컬럼은 `collected`로 간다. ② **`Translation.updatedAt`도 `collected`다** — Home 로그가 `updatedBy`와 한 문장으로 세우므로("X edited K in ko · 2d ago") 시각만 떼면 "누가 언제"의 절반을 안 밝히는 것이 된다. `SyncRun.trigger`·`startedAt`·`finishedAt`도 같다. ③ **`Account.scope`·`id_token`·`token_type`·`session_state`는 `NOT_PERSONAL`이다** — 우리 코드가 한 번도 쓰지 않는 Auth.js 스키마의 컬럼이고(전수 확인), 방침이 "저장하지 않는다"고 쓴다. **쓰기 시작하면 `collected`로 옮기고 표에 행을 더한다.**
  - 검증(0건 방어): `lib/privacy/__tests__/collected.test.ts`에 개수 가드 — `personal` 모델 수 > 0, 분류된 필드 수 > 40, `DISCLOSURE_SECTIONS`의 각 이름이 실재(역검증).
- [ ] **P1.2** `docs/DIRECTORY.md`에 `lib/privacy/` 한 줄. **`.claude/commands/push.md`의 `lib/` 코어 모듈 트리거 목록과 `docs/ARCHITECTURE.md`의 같은 목록에 `lib/privacy/`를 더한다** — 양쪽에 "서로 같아야 한다"가 못 박혀 있고 `push.md`가 "`lib/` 하위에 새 디렉터리가 생기면 이 줄에 추가한다"고 쓴다(과거 `/doc-check`이 네 번 갈린 것을 잡았다).
  - 검증: 두 목록의 항목이 문자열로 일치한다.

`──` **커밋 1**: `feat: classify every persisted field for the privacy policy` + `docs(DIRECTORY): add lib/privacy` (문서는 별도 커밋)

## P2. 그릇 — DESIGN §6.61 먼저

- [ ] **P2.1** `docs/DESIGN.md` §6.61 개정. **행 하나를 더하는 것으로 안 끝난다** — 정의문 둘("패널도 카드도 없다 … 본문 한 컬럼과 나가는 링크 하나뿐", "`blocks`는 문단 또는 목록이다")이 표를 배제하므로 같이 고친다. 새 raw 색은 0이지만 **새 표면은 0이 아니다.**
  - 표 규칙: `components/ui/table.tsx` 재사용 + **`scrollable` 기본값(`true`)**(결정 5 — 바깥에 스크롤 컨테이너가 없는 유일한 화면이라 끄면 표가 페이지를 가로로 민다) + 래퍼에 `role="region" tabIndex={0} aria-label` + **`Th` 대신 `TableHead`**(sticky·반투명 없음, 배경 `bg-primary-foreground`, 글자 `text-foreground` — `bg-muted/50`+`text-foreground/60`은 §2.2·§7에 AA 미달로 이미 등재됐다) + **`TableRow`의 hover 강조 제거**(읽는 화면에 조작 어포던스를 넣지 않는다) + `<th scope="col">`은 그릇이 직접 박는다 + **좁은 폭에서는 표가 자기 컨테이너 안에서 가로 스크롤한다.**
  - 시행일 규칙: `<time dateTime="YYYY-MM-DD">` + 라벨 `Effective date`. **선택 필드 — `/privacy`만 쓰고 `/docs`는 안 쓴다.** **날짜 포맷터를 새로 만들지 않는다**(결정 4 — `lib/utc-time.ts`의 `utcMinute`은 분까지 내므로 안 맞는다). 사전의 문자열을 그대로 보이고 같은 문자열을 `dateTime`에 넣는다. **시행일 줄은 `<section>` 밖이라 본문 링크 규칙(`[&_a]:text-blue-600`)이 안 걸린다**를 한 줄로 남긴다.
  - ⚠️ **`components/ui/table.tsx:34`의 "번역 화면만 `scrollable={false}`다" 주석과 DESIGN의 소비자 수, `components/__tests__/table-presets.test.tsx`의 테스트 이름이 이미 셋 다 거짓이다**(`components/onboarding/steps/files.tsx:360`이 둘째). 같은 커밋에서 고친다 — POSTMORTEM 2026-09-15 `:1845`가 정확히 이 부류다.
  - 검증: 절이 규격 표의 행으로 서고 정의문 둘이 개정됐다. **구현보다 먼저**다(POSTMORTEM 2026-09-15 `:1781`).
- [ ] **P2.2** `components/public-doc.tsx` — `effectiveDate?: string` prop과 `{ table: { label, head, rows } }` 블록 갈래.
  - 검증(red 먼저, DOM): 시행일이 `<time dateTime="…">`로 서고 `h1` 바로 아래·`intro` 위다 / **라벨 `Effective date`가 있다**(존재만 보면 라벨 누락을 못 잡는다) / `effectiveDate` 없으면 아무것도 안 그린다(짝) / 표가 `<thead>`+`<tbody>`로 서고 모든 `th`에 `scope="col"`이 있다 / 래퍼가 `role="region"`과 접근 이름을 갖는다 / 헤더 수와 각 행의 셀 수가 같다 / **기존 7개 테스트 green 유지**.

`──` **커밋 2**: `docs(DESIGN): allow tables and an effective date in the public doc shell`
`──` **커밋 3**: `feat: give the public doc shell an effective date and tables`

## P3. 본문

- [ ] **P3.1** `messages/en.tsx`의 `publicDocs.privacy`를 채운다 — `effectiveDate` + **절 일곱(id 확정, 순서 그대로)**: `collected`(표) · `purposes` · `retention` · `third-parties` · `deletion`(삭제와 문의) · `cookies`(표) · `changes`. 수집 항목은 P0.1 표, 제3자는 P0.2 목록, 쿠키는 P0.3 표, 삭제·문의는 P0.4.
  - ⚠️ **절 `id`는 URL 조각이다 — 확정됐고 고치지 않는다**(결정 10).
  - ⚠️ **표는 P0.1의 "접히는 행" 열을 따른다**(결정 1). `collected.ts`의 필드 이름을 표에 그대로 옮기지 않는다 — 읽는 사람은 `Account.refresh_token`이 아니라 "GitHub·Google 연결 토큰"을 이해한다.
  - ⚠️ **문체는 DESIGN §10** — sentence case · "please"·"sorry" 금지 · 제품 이름은 문장 첫 자리도 `malmoi`.
  - ⚠️ **런타임 `import`를 새로 추가하지 않는다** — `components/__tests__/client-graph.test.ts`가 `messages/en.tsx`의 그래프를 정확 일치로 고정하므로 `Link`나 아이콘을 쓰면 즉시 red다. 순수 `<a>`는 무해하다.
  - ⚠️ **`publicDocs.docs.intro`의 placeholder는 남는다**(spec §6 — `/docs`는 L2.3의 몫).
  - 검증(자동): `no-korean-ui` · `brand-spelling` green. ⚠️ **그 둘은 문구의 참/거짓을 전혀 묻지 않는다** — 한글 UI 리터럴과 브랜드 표기만 센다.
  - 검증(수동): 로그인 화면 푸터 링크 → 본문 도달, 절 앵커 일곱이 각각 동작.
  - ⚠️ **법률적 충분성은 이 태스크가 답하지 않는다**(spec §6). 자동 검증이 원리적으로 못 보는 축이다.
- [ ] **P3.2** **`/design-sync`를 한 바퀴 돈다.** L2.0이 "절·목록·링크가 실물로 서는 것은 L2.1 이후라 그때 한 번에 돈다"고 **명시적으로 이 기능에 넘긴 부채**이고(`launch-readiness/tasks.md:96`), 표 블록이 §6.61에 새로 들어와 대조 대상이 늘었다.
  - 검증: 그 스킬의 실측(computed style + CDP 접근성 트리)이 §6.61과 일치할 때까지 돈다.
- [ ] **P3.3** `docs/PRODUCT.md` 두 건. ① §7.7의 "`/privacy`·`/docs`는 placeholder이고 출시 전에 채운다"를 현재 사실로 갱신한다(privacy는 채웠고 `/docs`는 아직이다 — **두 라우트를 갈라 말한다**). ② **셀프서비스 계정 삭제를 만들지 않는다는 판정을 §4.2 또는 §10에 새로 세운다.**
  - ⚠️ **spec 초안이 §7.9를 근거로 들었으나 §7.9는 *프로젝트* 수명주기이고 계정 삭제를 말하지 않는다** — 리포 전체에 그 판정이 0건인데 방침 본문이 문장으로 공표한다.
  - ⚠️ **이 태스크의 소유자는 커밋 4다.** 초안은 "`/implement` 또는 `/push` 신선도 단계에서 실행"으로 미뤘는데, **커밋 3의 diff가 `messages/en.tsx` 하나이고 그 경로는 `/push` 4단계의 어느 문서 트리거에도 없어** 아무도 안 잡는다.
  - 검증: §7.7이 두 라우트를 갈라 말하고, 계정 삭제 판정이 절의 항목으로 선다.

`──` **커밋 4**: `feat: write the privacy policy`
`──` **커밋 5**: `docs(PRODUCT): record the policy and the account-deletion stance`

## ▶ 배포 게이트 (P6 앞당김 — 런칭 차단을 여기서 푼다)

- [ ] **P6.1** `/push`(dev·preview 확인) → **`/merge`**(프로덕션 배포). `https://mal-moi.com/privacy`가 열리는지 확인한다.
  - 검증: 비로그인으로 열리고 복귀 링크가 `/signin`, 로그인 상태에서 `/projects`. 절 앵커 일곱이 프로덕션에서 동작.
- [ ] **P6.2** Google Cloud 콘솔 — OAuth 동의 화면에 `https://mal-moi.com/privacy`를 넣고 **게시**로 전환한다.
  - 검증: 상태가 In production. **사용자 작업이다.**
  - 롤백: 문제가 생기면 동의 화면을 Testing으로 되돌린다(게시 취소가 되돌리기다. "L1.1을 열어 둔다"는 보류이지 롤백이 아니다).
- [ ] **P6.3** 테스트 사용자 목록 **밖**의 Google 계정으로 `mal-moi.com/signin` 로그인 → 성공.
  - ⚠️ **계정을 먼저 특정한다** — launch-readiness가 `ox501tube@gmail.com`을 목록 **안**으로 적으므로 그것이 아니다. 실측 전에 어느 주소를 쓸지 정하고 여기에 적는다.
  - 검증: launch-readiness **L1.1이 닫힌다.** 실패(`403 access_denied`)면 게시가 반영되지 않은 것이고 L1.1은 열린 채로 둔다. ⚠️ **L0.1은 이미 닫혀 있다** — 이 단계로 닫히는 것은 L1.1 하나다.

## P4. 본문 의존 게이트 — (B)(C)

- [ ] **P4.1** `lib/privacy/disclosure.ts` — `sectionGaps(disclosed, sections, disclosureSections)`. 반환은 `{ missingSections, unusedSections, duplicateIds }` **배열 셋**(불리언이 아니다 — 실패 메시지에 이름이 나와야 한다).
  - ⚠️ **셋째 인자가 필요한 이유**: 절 일곱 중 `purposes`·`changes`·`deletion`은 `DISCLOSED`가 가리키지 않으므로 전체를 대조하면 무조건 red다.
  - ⚠️ **중복 id를 따로 센다** — Set만 쓰면 중복이 조용히 사라지고 앵커는 첫 절로만 간다.
  - 검증(red 먼저, `lib/privacy/__tests__/disclosure.test.ts`): 미등재 1건 · 없는 절 id · 안 쓰인 대상 절 · 중복 id. **각 케이스에서 정상 입력은 빈 배열을 짝으로 단언한다.**
- [ ] **P4.2** `lib/privacy/doc-text.ts` — `docText(sections)` + `docDigest(text)`. `renderToStaticMarkup` + 태그 제거 + 공백 압축·줄바꿈 정규화(결정 9 — **jsdom을 부르지 않는다.** `// @vitest-environment jsdom`은 파일 단위 지시자라 같은 파일의 다른 검사까지 끌려간다).
  - 검증(red 먼저, `lib/privacy/__tests__/doc-text.test.ts`): 같은 내용 다른 공백 → 같은 해시, 한 글자 바꾸면 다른 해시, ReactNode가 섞인 블록에서 `[object Object]`가 안 나온다, 빈 `sections` → 빈 문자열(그리고 그것이 정상 통과하지 않도록 아래 개수 가드가 있다).
- [ ] **P4.3** `lib/privacy/__tests__/policy-gate.test.tsx` — P4.1·P4.2를 **실물**에 엮는다. (B) 등재 ↔ 본문 양방향(**대조 단위는 절 id다 — 항목 라벨 문자열이 아니다**) (C) 본문 해시 ↔ `effectiveDate`.
  - ⚠️ **(C)의 상수는 `REVISIONS: { effectiveDate, digest }[]` 이력 배열이고 이 파일이 든다**(결정 3·8). 단언은 (a) 마지막 항목의 `digest`가 현재 본문과 같다 (b) 사전의 `effectiveDate`가 그 항목의 날짜와 같다 — **"해시만 갱신하고 날짜는 두는" 탈출구가 닫힌다.** 방침의 `changes` 절이 필요로 하는 개정 이력이 같은 배열로 선다.
  - ⚠️ **git log 기반 대안을 쓰지 않는다** — CI 체크아웃이 깊이 1이라(`actions/checkout`에 `fetch-depth` 없음) 파일 이력이 없고, 조용히 통과하거나 조용히 깨진다.
  - ⚠️ **파일이 `.tsx`다** — 렌더가 필요하고 리포의 렌더 테스트는 전부 `.tsx`다.
  - ⚠️ **`changes` 절 문장을 그때 되올린다** (2026-09-19 리뷰 🔴1) — 초안 본문이 "a test compares a digest … and it fails if the text changes without a new entry"로 **아직 없는 통제를 공표**했다. P3.1에서 "개정이 있으면 시행일이 옮겨지고 여기 적힌다"로 낮췄으므로, 게이트가 실제로 서는 이 태스크에서 통제를 말하는 문장으로 되돌린다(본문이 바뀌므로 개정 이력에 행이 하나 는다).
  - ⚠️ **`REVISIONS`의 각 `effectiveDate`가 `changes` 절 본문에 문자열로 있는지도 센다** (2026-09-19 `/code-review`) — 이력이 배열과 본문 두 곳이라, 배열만 갱신하면 (C)는 green인데 **화면의 개정 이력에는 그 개정이 없다.**
  - 검증(0건 방어): `docText(...).length`가 임계 초과 · 실물 사전의 **모든 `table` 블록에서 헤더 수 = 각 행의 셀 수**(P2.2의 단언은 픽스처를 보므로 실물의 셀 누락을 못 잡는다) · 절 일곱이 전부 존재.
  - 검증(뮤테이션, **일회성 확인이고 리포에 남는 것이 아니다** — 리포에 남는 짝은 P4.1·P4.2의 픽스처 단언이다): `DISCLOSED`에서 한 줄을 빼면 (B)가 red · 절 id를 오타 내면 (B)가 red · 본문 한 글자를 바꾸면 (C)가 red. **셋을 실제로 돌려 확인하고 되돌린다** (⚠️ `git checkout --` 금지).
  - 검증: `pnpm test` 전체 green.

`──` **커밋 6**: `test: gate the privacy policy against the schema and the doc text`

## P5. 절차와 문서

- [ ] **P5.1** `.claude/commands/push.md` 4단계에 트리거를 더한다 — diff에 `prisma/schema.prisma` · `auth.ts` · `lib/credentials/**` · 새 `fetch(` 호스트 · `cookies().set`이 걸리면 **자동이 못 보는 넷**(새 목적 · 새 전송처 · 쿠키·보존 · 본문 내부 모순)을 묻는다. **그리고 `CLAUDE.md` 코드 컨벤션에 같은 한 줄을 무조건 박는다**(결정 14 — 초안의 조건문을 지웠다).
  - ⚠️ **`/push`는 Codex 미러가 없다**(`.agents/skills/`에 `source-command-push`가 없음을 확인). CLAUDE.md는 `scripts/sync-agents.mjs`가 `AGENTS.md`로 미러하므로 한 줄이면 두 런타임이 덮인다. 법적 고지의 신선도 게이트를 한 런타임에만 두지 않는다.
  - 검증: **`pnpm sync:agents:check` green은 근거가 아니다** — `push.md`에 미러가 없어 무엇을 고치든 항상 green이다. 실제로 재는 것은 ① `AGENTS.md`에 그 한 줄이 미러됐는가(`sync:agents` 후 diff) ② `push.md` 4a 트라이아지 목록에 경로가 들어갔는가(수동).
- [ ] **P5.2** `docs/ARCHITECTURE.md` 보안 모델 절에 게이트 규칙 한 문단 — "개인정보 모델의 새 필드·새 모델은 `collected.ts` 등재 없이는 `pnpm typecheck` red".
  - 검증: `/doc-check privacy` 또는 손으로 대조.
- [ ] **P5.3** `docs/OPERATIONS.md`에 **삭제 요청 처리 절차**(P0.4)를 항목으로 남긴다 — 방침이 공표한 약속을 나중에 다시 실행할 절차로.
  - 검증: 절차가 "무엇을 지우는가 · 응답 기한"을 말한다.
- [ ] **P5.4** `docs/features/launch-readiness/tasks.md`의 **L2.1을 닫고** L1.1의 선행 사슬을 갱신한다. ⚠️ **그 파일 자체의 stale 셋도 같이 고친다** — L2.1의 `en.tsx:263 body:`(실제 `intro:`)와 `:234-235`, L2.3의 `PRODUCT.md:421`(실제 :493).
  - 검증: 열린 항목 수가 줄고, L1.1의 선행이 사실이 된다.

`──` **커밋 7**: 문서별로 쪼갠다 — `docs(ARCHITECTURE)` / `docs(OPERATIONS)` / `docs(feature)`. `.claude/commands/push.md`+`CLAUDE.md`+`AGENTS.md`는 `chore:`.

## 검증 요약

| 층 | 무엇 | 언제 |
|---|---|---|
| `pnpm typecheck` | **(A) 모델·필드 전수 등재** | 상시 |
| `pnpm test` | (B) 등재↔본문 · (C) 본문↔개정 이력 · 0건 방어 · 그릇 DOM | 상시 |
| `pnpm build` | RSC 경계 — 그릇과 사전이 서버 컴포넌트를 지난다 | `/push` 1단계 |
| `/design-sync` | 화면이 §6.61과 같은가 (computed style + 접근성 트리) | P3.2 |
| `/push` 4단계 + CLAUDE.md | 새 목적 · 새 전송처 · 쿠키·보존 · 본문 모순 | 푸시마다 |
| 수동 | 법률적 충분성 · 절 앵커 · Google 게시 · 목록 밖 계정 로그인 | P3.1 · P6 |
