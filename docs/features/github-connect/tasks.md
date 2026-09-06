# github-connect — 태스크

**순수 함수 → 껍데기 → UI 순서.** 역순은 테스트 못 하는 코드를 먼저 쌓는 것이다.
`⎇` 표시가 커밋 경계다 (`/ship`이 이 분리를 지킨다). `[manual]`은 e2e가 없어 눈으로 보는 검증이다.

⚠️ **마이그레이션이 없다** (`design.md` §5). `/db`를 부르지 않고, `/push`·`/merge`의 DB 순서 판정도
걸리지 않는다.

> 2026-09-06 `/feature-review` 반영 — 리포 고정(셀렉트 없음), connect는 Server Action, `requireUser`,
> Account `create`+P2002, refresh 저장 규칙, 연결 해제, `lib/github-connect/`, T5 시나리오 교체.

---

## T0 — GitHub App 설정 (코드 아님, 선행)

사람이 GitHub에서 한다. **T3 전에 끝나 있어야** 실물 확인이 가능하다. T1·T2는 T0 없이 진행된다.

- [ ] App 설정에 **Callback URL 셋** 등록 — `http://localhost:3000/api/github/callback` ·
      `https://malmoi-git-dev-…vercel.app/api/github/callback` · `https://mal-moi.com/api/github/callback`
- [ ] "Expire user authorization tokens" **켠 채로 둔다** (design §2.4 — refresh를 감당한다)
- [ ] Client ID·secret 발급 → `.env.local` + Vercel Production·Preview
      (⚠️ 값은 stdin으로: `vercel env add <name> production,preview --force`)
- [ ] App slug 확인 → `GITHUB_APP_SLUG`
- [ ] **T5 격리 확인**: 폐기용 리포 셋(`bugshot-i18n-test`·`i18n-format-check`·`i18n-order-check`)과 프로덕션
      프로젝트 리포가 **같은 installation인지** `Project.installationId`로 본다. 같으면 T5의 "App 제거"
      시나리오는 밟지 않는다(접근 철회만) — 설치는 계정 단위라 uninstall이 운영 연결까지 끊는다

**검증:** `.env.local`은 셸에 export되지 않으므로 값을 직접 읽어 넣는다 —
`curl -s -o /dev/null -w '%{http_code}' "https://github.com/login/oauth/authorize?client_id=$(grep ^GITHUB_APP_CLIENT_ID .env.local | cut -d= -f2 | tr -d '"')"`
가 **302**다(404면 `GITHUB_APP_ID` 숫자를 넣은 것 — design §6). ⚠️ 이 검증은 "존재하는 client_id"만
증명한다 — **우리 App인지는 T3 실물이 증명한다.**

---

## T1 — 순수 판정 함수 ⎇ `test:` → `feat:`

`/tdd interface`로 테스트를 먼저 박고 구현한다. **전부 I/O 없음.** 디렉터리는 `lib/github-connect/`.

- [ ] `state.ts` — `signState` · `verifyState({ cookie, query, userId, now, secret })` (`createHmac` +
      `timingSafeEqual` 길이 선검사, 라벨 `"malmoi-github-state"`). ⚠️ `safeNext` 없음 — 목적지는 slug다
- [ ] `account-link.ts` — `planAccountLink({ sessionUserId, existing, current })` 4갈래
- [ ] `connect-plan.ts` — `planRepoConnect({ probe, userInstallationIds, userRepoFullNames })`
      (**3중 검증의 판정 자리** — 5단계가 재사용)
- [ ] `health.ts` — `planConnectionHealth` (6갈래, `unknown` 포함) + `probeFromError(status)`
- [ ] `token.ts` — `planTokenUse`
- [ ] `message.ts` — `ConnectError` union · `isConnectError` · `connectErrorMessage` (**`satisfies never` +
      폴백**, `inviteErrorMessage` 형)

**검증:** `pnpm test` green. 케이스가 최소 이만큼 있다 —
`verifyState`의 `wrong-user`·`state-expired`·`state-mismatch`(서명 변조·쿠키 없음·nonce 불일치) /
`planAccountLink`의 `taken-by-other`·`replace`(내 행이 다른 GitHub 계정) /
`planRepoConnect`의 `installation-forbidden`·`repo-forbidden`·`repo-not-installed`·`repo-moved`면 `ok`에 새
owner/name / `planConnectionHealth`의 **`error` → `unknown`**(≠`app-uninstalled`)·`installation-changed`·
`repo-moved` / `probeFromError`의 403 → `not-installed` / `planTokenUse`의 60초 여유·refresh 없음 →
`reauthorize` / `connectErrorMessage`가 union **전 갈래를 값 배열로** 덮는다(갈래를 늘리면 컴파일 red) +
모르는 문자열은 폴백.

---

## T2 — 껍데기 ⎇ `feat:`

- [ ] `lib/github-connect/user.ts` — `octokit`의 `OAuthApp({ clientType: "github-app" })`으로
      `exchangeCode`·`refreshUserToken`(`bad_verification_code`·`bad_refresh_token`은 200 body라 라이브러리가
      던지는 것을 그대로 쓴다 — `res.ok` 직접 판정 금지) · `getViewer`(id·login) · `listUserInstallations` ·
      `listInstallationRepos` — **둘 다 `octokit.paginate`로 전 페이지**. GET만 부른다(교환·갱신 제외).
      401은 `reauthorize` 신호로 던진다
- [ ] `lib/github-connect/token-store.ts` — `ensureUserToken(prisma, userId, now)`: Account 읽기 → `planTokenUse`
      → `refresh`면 갱신 후 **조건부 `updateMany`(where에 읽었던 `refresh_token`)** → count 0이면 재조회 →
      실패 분류 `reauthorize | unavailable` (design §2.4). `userId`는 어떤 update에도 넣지 않는다
- [ ] `lib/github.ts`에 `probeRepo(owner, repo)` — App JWT `GET /repos/{o}/{r}/installation` → 설치 토큰
      `GET /repos/{o}/{r}` → `{ status: "ok", installationId: string, fullName } | { status: "not-installed" } |
      { status: "error" }`. **try가 토큰 발급까지 감싼다**, 분류는 `probeFromError`. `isNotFound` export.
      ⚠️ **예외를 삼켜 `not-installed`로 접지 않는다** (design §3.3)
- [ ] `requireEnv`를 **함수 안에서** 부른다 (POSTMORTEM 2026-08-31 🔁)
- [ ] `lib/github-connect/__tests__/credential-separation.test.ts` — 소스 스캔:
      `lib/github-connect/user.ts`가 `octokit`의 `App`·`parsePrivateKey`·`GITHUB_APP_PRIVATE_KEY`를 참조하지
      않고, `lib/github.ts`가 `lib/github-connect/`를 import하지 않는다
- [ ] `scripts/smoke-github.ts`에 `probeRepo` 호출·결과 출력 한 줄 (읽기 전용 성질 유지 — "I/O 껍데기엔
      스모크", POSTMORTEM 2026-09-01). 사용자 토큰 쪽은 실물 계정이 필요해 스모크 없음 — T3 `[manual]`이 대신한다

*(2026-09-06 삭제: `prisma/__tests__/schema-contract.test.ts` "한 줄" — 정적 대조 형식으로 표현 불가, 근거는
`:101-104`가 이미 통과 중. design §2.3)*

**검증:** `pnpm test` green + `pnpm typecheck`. `credential-separation`은 **일부러 교차 import를
넣어 red가 되는지** 확인하고 되돌린다 (POSTMORTEM 2026-09-03 — 테스트 이름만 그랬던 전례).
`pnpm smoke:github <slug>`가 `probeRepo` 결과를 찍는다 `[manual]`.

---

## T3 — 연결 시작 Action + callback 라우트 ⎇ `feat:`

- [ ] `app/(edit)/projects/[slug]/settings/actions.ts`에 `startGithubConnect({ slug })` — `getProjectAccess
      (project:settings)` → state 쿠키(`HttpOnly`·`SameSite=Lax`·`Path=/`·10분, **`Secure`·`__Host-`는 https에서만**)
      → `redirect(authorize URL)`
- [ ] `app/api/github/callback/route.ts` — GET. **`requireUser()`**(GUARD — `readSession` 아님) →
      `?error=access_denied` → `denied` → `verifyState` → `exchangeCode` → `getViewer` → `planAccountLink` →
      쓰기 규칙 표(design §3.1: `create`+P2002 재조회 / 토큰만 update / 트랜잭션 replace / 거부는 무쓰기)
      → state 쿠키 삭제 → 302
- [ ] 착지: state 유효 → `/projects/<slug>/settings[?e=]`, **state 무효 → `/projects?e=<status>`** (design §3.5)
- [ ] `middleware.ts`의 `matcher`에 **넣지 않는다** (design §7.1 — `code` 유실)
- [ ] `.env.example`에 셋 추가 + `GITHUB_APP_ID`와의 구별 주석
- [ ] `app/api/__tests__/github-callback.test.ts` — `vi.mock("@/lib/github-connect/user")` + 가짜 prisma:
      ① state 쿠키 없음/서명 변조/`wrong-user` → **`exchangeCode` 0회·Account 쓰기 0회**·`/projects?e=` ②
      `taken-by-other` → 쓰기 0회·`?e=taken-by-other` ③ `create`가 P2002를 던지면 재조회 후 판정 ④ 정상 →
      `create` 1회·`userId`가 세션 사용자·쿠키 삭제 헤더

**검증:** `pnpm test`의 `entry-points.test.ts`가 **예외 목록을 늘리지 않고** green(callback이 `requireUser`로
`GUARDS`에 걸린다) + 위 테스트 파일 green. `[manual]` 로컬에서 "GitHub 연결" → GitHub → callback →
`Account(provider:"github-app")` 행이 `pnpm db:studio`에 보인다. **Safari에서도** 한 번(쿠키 접두 — design §3.1).

---

## T4 — 설정 화면 + 재연결·해제 Server Action ⎇ `feat:`

- [ ] `app/(edit)/projects/[slug]/settings/page.tsx` — 최상단에서
      `requireProjectAccess({ slug, permission: "project:settings" })`를 **던진다**. `searchParams.e`를
      `isConnectError`로 걸러 한 줄(`text-destructive text-sm`). 섹션 둘은 독립 실패(design §8)
- [ ] 같은 `actions.ts`에 `connectRepository({ slug })` — Zod → `getProjectAccess` → `ensureUserToken` →
      `probeRepo` → **설치·리포 목록 조회(전 페이지)** → `planRepoConnect` → `project.update({ where: { id:
      projectId } })`. `{ ok } | { error: ConnectError | AccessError }` 반환, redirect 없음
- [ ] 같은 파일에 `disconnectGithub({ slug })` — `getProjectAccess` → 세션 User의 `github-app` 행 `delete`
- [ ] `components/reconnect-button.tsx` (client — pending "연결하는 중…", 인라인 `text-destructive text-xs`,
      성공 시 `revalidatePath`) · `components/github-account.tsx` (client — 연결 해제 pending, "GitHub 다시 연결")
- [ ] `/projects/page.tsx`에 **`isConnectError` 분기 추가** (state 무효 착지 — design §3.5)
- [ ] 번역 화면 툴바 `role === "OWNER"` 블록에 "설정" Link (`translations/page.tsx:103-118`) + 설정 화면에
      "← 번역" 링크. ⚠️ 헤더/레이아웃에는 slug가 없다 — 거기 달지 않는다
- [ ] 건강성 배지 6종 — `ok`·`not-connected`·`unknown` muted, `repo-moved` amber, `app-uninstalled`·
      `installation-changed` `text-destructive` 글자만. **DESIGN §6.2 밖의 raw 색 없음**
- [ ] **하네스 갱신** (`app/(edit)/__tests__/harness.ts`): `account` 모델 `{ findUnique, findFirst, create,
      update, updateMany, delete }` + `@@id([provider, providerAccountId])` 위반 시 P2002 throw(`createMember`
      `:139-148` 형) · **`project.update`가 상태를 실제로 바꾸고 인자·횟수를 spy로 남긴다**(지금은
      `async () => ({})`) · `$transaction` 롤백 스냅샷(`:256`)에 accounts·projects 추가
      (POSTMORTEM 2026-09-05 "가짜의 목표가 바뀌면 가짜를 다시 본다")

**검증:** `pnpm test` green +
`app/(edit)/__tests__/github-connect.test.ts` — **별도 파일**에 `vi.mock("@/lib/github-connect/user")`·
`vi.mock("@/lib/github", …probeRepo)` (`publish-failure.test.ts:12` 분리 이유와 같다) — 케이스 일곱:
① EDITOR → `forbidden`, `project.update` **0회** ② 설치가 사용자 목록에 없음 → `installation-forbidden`,
0회 ③ 리포가 사용자 리포 목록에 없음 → `repo-forbidden`, 0회 ④ Account 없음 → `not-connected` ⑤ **정상
OWNER → update 1회, 인자 `{ where: { id: <인가된 projectId> }, data: { installationId: <probe 값> } }`, 다른
Project 불변** ⑥ `repo-moved` → data에 새 `repoOwner`·`repoName` ⑦ `disconnectGithub` → 내 행만 delete,
Project 불변. **거부만 검증하면 항상 거부하는 Action도 통과한다** — ⑤가 필수다 (POSTMORTEM 2026-09-06).

---

## T5 — 실물 확인 (preview) — `[manual]`

**e2e가 없어 자동화할 수 없다.** tenant-auth의 `tasks.md` §6.1과 같은 부류이고,
**거기서만 잡힌 결함이 넷이었다** — 전부 "값은 맞는데 사용자에게 도달하지 않는다"였다.

- [ ] Google로만 로그인한 계정에서 "GitHub 연결" → 성공 → `Account` 행 하나, 화면에 `@login`
- [ ] **다른 User가 이미 연결한 GitHub 계정**으로 연결 시도 → 거부되고 **설정 화면에 문구가 보인다**
- [ ] 설정 화면에서 10분 넘게 두고(또는 쿠키를 지우고) callback 도착 → **`/projects`에 문구가 보인다**
      (state 무효 착지 — design §3.5)
- [ ] GitHub 인가 화면에서 취소 → `denied` 문구
- [ ] **접근 철회**: 설치의 selected repositories에서 폐기용 리포 하나 제외 → 설정 화면 `app-uninstalled` →
      다시 포함 → "다시 연결" → `ok` → **번역 1건 편집 → Publish → 원래 리포에 PR**, 번역 값 전후 비교 동일
- [ ] **App 제거 → 재설치**: T0 격리 확인에서 **별도 installation일 때만**. 재설치 뒤 `installation-changed`
      → "다시 연결" → 새 `installationId` 저장 → `ok`
- [ ] 리포 이름 변경 → `repo-moved`가 새 이름을 보인다(자동으로 안 따라간다) → "다시 연결" → `repoOwner`·
      `repoName` 갱신. **여기서 301 추종을 실측한다** (design §3.3)
- [ ] "연결 해제" → 계정 섹션이 "GitHub 연결"로 돌아가고 리포 섹션 건강성은 그대로 → 다시 연결 왕복
- [ ] 번역 화면 툴바 "설정" 링크 클릭 → 설정 화면, "← 번역" → 복귀 (죽은 라우트 검사가 템플릿 리터럴을
      못 본다 — design §8)
- [ ] EDITOR 계정으로 `/projects/<slug>/settings` 직접 접근 → `/projects?e=forbidden` 문구

**대상 리포는 폐기용만** — `bugshot-i18n-test` · `i18n-format-check` · `i18n-order-check`.

---

## T6 — 회귀 방어선 확인 ⎇ (없으면 커밋 없음)

- [ ] `pnpm test` · `pnpm typecheck` · `pnpm build` (`/push` 1단계 게이트가 돌린다)
- [ ] `pnpm smoke:github`가 통과하고 `probeRepo` 결과를 찍는다 — `lib/github.ts`에 함수를 더했다
- [ ] `lib/pull/__tests__/trigger.test.ts:14`의 `@/lib/github` factory mock이 여전히 green (`probeRepo`를
      `trigger.ts`가 쓰지 않으므로 손댈 일이 없어야 한다)
- [ ] `middleware.ts` · `prisma/schema.prisma` · `lib/pull/**` · `lib/adapters/**` diff **0**

---

## T7~T9 — 문서 ⎇ 문서별 커밋

- [ ] **T7** `docs/SAAS.md` — §8 4단계 체크박스 셋(`:530-537`)을 닫고, §5.4 표에 "user-to-server 토큰은 GitHub
      App이 발급한다 · `installationId`는 클라이언트에서 오지 않는다(서버가 `/repos/{o}/{r}/installation`으로
      얻는다)"를 적는다. **§5.7 공격 시나리오 둘**을 "판정 함수(`planRepoConnect`)는 4단계, 종결은 생성
      표면이 생기는 5단계"로 고친다. §10에 "로그인 provider를 GitHub App으로 교체할 것인가"를 2차 후보로
      더한다. `features/tenant-auth/spec.md:86-87`의 "설정 화면은 6단계"를 "멤버 관리 섹션은 6단계 —
      라우트는 4단계가 만들었다"로 좁힌다. 커밋 `docs(SAAS): ...`
- [ ] **T8** `CLAUDE.md` — 스택 표의 "리포 쓰기" 줄 옆에 **자격증명 셋**(로그인 OAuth App / 연결
      GitHub App user token / 쓰기 App installation token)과 디렉터리 구조에 `lib/github-connect/`·
      callback 라우트·설정 페이지·`components/reconnect-button.tsx`·`github-account.tsx`. 커밋 `docs(CLAUDE): ...`
- [ ] **T9** `docs/MVP.md` §7 — **"SaaS 단계에서도 안 한다: … 온보딩, 테넌트별 GitHub App 설치 플로"
      (`:391`)가 거짓이 됐다** (`spec.md` §0). 그 줄을 "온보딩 → SAAS §8 5단계 / GitHub 설치 **연결** → 4단계"로
      승격된 것으로 고친다 — "설치 플로"가 아니라 "연결"이다. 커밋 `docs(MVP): ...`
- [ ] `docs/features/README.md` 표에 이 기능 한 줄 (`docs(feature): ...`)

⚠️ **T9를 빠뜨리면 닫힌 스펙이 현재 구현을 부정한다.** `/doc-check`이 잡겠지만, 그건 안전망이지
순서가 아니다.

---

## 확인 필요 (착수 전 사용자 판정)

2026-09-06 검수에서 결정됨 — 리포 교체 미지원 · refresh 유지 · connect는 Server Action · MVP §7은 SAAS 우선 ·
계정 유일성은 `github-app` 내 + User당 1 · `ok` 무색 · 연결 해제 포함 · `lib/github-connect/` · probe는
`/installation` 엔드포인트 · T5는 접근 철회 중심.

남은 것 하나:

1. **T0의 격리 확인 결과** — 폐기용 리포 셋과 프로덕션 리포가 같은 installation이면 T5 "App 제거"
   시나리오를 건너뛴다(접근 철회만). 다른 installation을 만들지는 그때 정한다.
