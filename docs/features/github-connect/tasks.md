# github-connect — 태스크

**순수 함수 → 껍데기 → UI 순서.** 역순은 테스트 못 하는 코드를 먼저 쌓는 것이다.
`⎇` 표시가 커밋 경계다 (`/ship`이 이 분리를 지킨다).

⚠️ **마이그레이션이 없다** (`design.md` §5). `/db`를 부르지 않고, `/push`·`/merge`의 DB 순서 판정도
걸리지 않는다.

---

## T0 — GitHub App 설정 (코드 아님, 선행)

사람이 GitHub에서 한다. **T3 전에 끝나 있어야** 실물 확인이 가능하다.

- [ ] App 설정에 **Callback URL 셋** 등록 — `http://localhost:3000/api/github/callback` ·
      `https://malmoi-git-dev-…vercel.app/api/github/callback` · `https://mal-moi.com/api/github/callback`
- [ ] "Expire user authorization tokens" **켠 채로 둔다** (design §2.3 — `planTokenUse`가 감당한다)
- [ ] Client ID·secret 발급 → `.env.local` + Vercel Production·Preview
      (⚠️ 값은 stdin으로: `vercel env add <name> production,preview --force`)
- [ ] App slug 확인 → `GITHUB_APP_SLUG`

**검증:** `curl -sI "https://github.com/login/oauth/authorize?client_id=$GITHUB_APP_CLIENT_ID"`가
404가 아니다. ⚠️ `GITHUB_APP_ID`(숫자)를 넣으면 여기서 404다 (design §6).

---

## T1 — 순수 판정 함수 ⎇ `test:` → `feat:`

`/tdd interface`로 테스트를 먼저 박고 구현한다. **전부 I/O 없음.**

- [ ] `lib/github/state.ts` — `signState` · `verifyState` · `safeNext`
- [ ] `lib/github/account-link.ts` — `planAccountLink`
- [ ] `lib/github/repo-ref.ts` — `normalizeRepoRef`
- [ ] `lib/github/connect-plan.ts` — `planRepoConnect` (**3중 검증의 판정 자리**)
- [ ] `lib/github/health.ts` — `planConnectionHealth` (5갈래, `unknown` 포함)
- [ ] `lib/github/token.ts` — `planTokenUse`
- [ ] `lib/github/message.ts` — `connectErrorMessage` (**`never` 검사**)

**검증:** `pnpm test` green. 케이스가 최소 이만큼 있다 —
`verifyState`의 wrong-user·expired·mismatch / `safeNext`의 `//evil.com`·`\\evil`·`https://` 거부 /
`planAccountLink`의 `taken-by-other` / `planConnectionHealth`의 **`error` → `unknown`**(≠`app-uninstalled`) /
`connectErrorMessage`가 union 전 갈래를 덮는다(갈래를 늘리면 컴파일 red).

---

## T2 — 사용자 토큰 껍데기 ⎇ `feat:`

- [ ] `lib/github/user.ts` — `exchangeCode` · `refreshUserToken` · `getViewer` ·
      `listUserInstallations` · `listInstallationRepos`. **GET만 부른다**(교환·갱신 제외)
- [ ] `lib/github.ts`에 `probeRepo(owner, repo, installationId)` 추가 — App 토큰,
      `{ status: "ok", fullName } | { status: "not-found" } | { status: "error" }`.
      ⚠️ **예외를 삼켜 `not-found`로 접지 않는다** (design §3.3)
- [ ] `requireEnv`를 **함수 안에서** 부른다 (POSTMORTEM 2026-08-31 🔁)
- [ ] `lib/github/__tests__/credential-separation.test.ts` — 소스 스캔:
      `lib/github/user.ts`가 `octokit`의 `App`·`parsePrivateKey`를 import하지 않고,
      `lib/github.ts`가 `lib/github/user.ts`를 import하지 않는다
- [ ] `prisma/__tests__/schema-contract.test.ts`에 한 줄 — `provider: "github-app"` 행이
      어댑터의 `getUserByAccount`(provider+providerAccountId 조회)에 걸리지 않는다

**검증:** `pnpm test` green + `pnpm typecheck`. `credential-separation`은 **일부러 교차 import를
넣어 red가 되는지** 확인하고 되돌린다 (POSTMORTEM 2026-09-03 — 테스트 이름만 그랬던 전례).

---

## T3 — 연결 라우트 둘 ⎇ `feat:`

- [ ] `app/api/github/connect/route.ts` — GET. `readSession` → state 쿠키(`__Host-` 접두,
      `HttpOnly`·`SameSite=Lax`·10분) → 302 authorize
- [ ] `app/api/github/callback/route.ts` — GET. `readSession` → `verifyState` → `exchangeCode` →
      `getViewer` → `planAccountLink` → `Account` upsert → 302 `safeNext(next)`
- [ ] 실패는 **전부 `?e=<status>`로 실어 보낸다** — 목적지 화면이 `connectErrorMessage`로 한 줄 보인다
- [ ] `middleware.ts`의 `matcher`에 **넣지 않는다** (design §7.1 — `code` 유실)
- [ ] `.env.example`에 셋 추가 + `GITHUB_APP_ID`와의 구별 주석

**검증:** `pnpm test`의 `entry-points.test.ts`가 **예외 목록을 늘리지 않고** green
(두 라우트가 `GUARDS`에 걸린다). 로컬에서 `/api/github/connect`를 눌러 GitHub → callback →
`Account(provider:"github-app")` 행이 `pnpm db:studio`에 보인다.

---

## T4 — 설정 화면 + 연결 Server Action ⎇ `feat:`

- [ ] `app/(edit)/projects/[slug]/settings/page.tsx` — 최상단에서
      `requireProjectAccess({ slug, permission: "project:settings" })`를 **던진다**
- [ ] `app/(edit)/projects/[slug]/settings/actions.ts` — `connectRepository`.
      Zod 검증 → `getProjectAccess` → 토큰 확보 → **설치·리포 목록 재조회** →
      `planRepoConnect` → `project.update`
- [ ] 헤더/사이드바에 설정 링크 (OWNER에게만). ⚠️ **경로를 하드코딩하지 않는다**
      (POSTMORTEM 2026-09-05 — 사이드바 전부 404)
- [ ] 건강성 배지 5종 — DESIGN §6.2 밖의 raw 색을 늘리지 않는다, `unknown`은 회색

**검증:** `pnpm test` green +
`app/(edit)/__tests__/`에 케이스 셋 — ① EDITOR가 `connectRepository`를 부르면 `forbidden`이고
`Project`가 안 바뀐다 ② 접근 불가 `installationId` → `installation-forbidden` ③ 그 설치에 없는
`owner/repo` → `repo-forbidden`. **셋 다 `Project` 행이 변경 0이어야 한다.**

---

## T5 — 실물 확인 (preview) — `[manual]`

**e2e가 없어 자동화할 수 없다.** tenant-auth의 `tasks.md` §6.1과 같은 부류이고,
**거기서만 잡힌 결함이 넷이었다** — 전부 "값은 맞는데 사용자에게 도달하지 않는다"였다.

- [ ] Google로만 로그인한 계정에서 "GitHub 연결" → 성공 → `Account` 행 하나
- [ ] **다른 User가 이미 연결한 GitHub 계정**으로 연결 시도 → 거부되고 **화면에 문구가 보인다**
- [ ] 폐기용 리포에서 App 제거 → 설정 화면이 `app-uninstalled` → 재설치 → `ok`,
      **번역 데이터가 그대로다**
- [ ] 리포 이름 변경 → `repo-moved`가 새 이름을 보인다 (자동으로 안 따라간다)
- [ ] `next`에 `//example.com`을 넣어 connect를 호출 → `/projects`로 떨어진다

**대상 리포는 폐기용만** — `bugshot-i18n-test` · `i18n-format-check` · `i18n-order-check`.

---

## T6 — 회귀 방어선 확인 ⎇ (없으면 커밋 없음)

- [ ] `pnpm test` · `pnpm typecheck` · `pnpm build` (`/push` 1단계 게이트가 돌린다)
- [ ] `pnpm smoke:github`가 여전히 통과한다 — `lib/github.ts`에 `probeRepo`를 더했다

---

## T7~T9 — 문서 ⎇ 문서별 커밋

- [ ] **T7** `docs/SAAS.md` — §8 4단계 체크박스 셋을 닫고, §5.4 표에 "user-to-server 토큰은 GitHub App이
      발급한다"를 적는다. §10에 "로그인 provider를 GitHub App으로 교체할 것인가"를 2차 후보로 더한다.
      커밋 `docs(SAAS): ...`
- [ ] **T8** `CLAUDE.md` — 스택 표의 "리포 쓰기" 줄 옆에 **자격증명 셋**(로그인 OAuth App / 연결
      GitHub App user token / 쓰기 App installation token)과 디렉터리 구조에 `lib/github/`·
      새 라우트 둘·설정 페이지. 커밋 `docs(CLAUDE): ...`
- [ ] **T9** `docs/MVP.md` §7 — **"SaaS 단계에서도 안 한다: … 온보딩, 테넌트별 GitHub App 설치 플로"가
      거짓이 됐다** (`spec.md` §0). 그 줄을 SAAS §8 4·5단계로 승격된 것으로 고친다.
      커밋 `docs(MVP): ...`
- [ ] `docs/features/README.md` 표에 이 기능 한 줄 (`docs(feature): ...`)

⚠️ **T9를 빠뜨리면 닫힌 스펙이 현재 구현을 부정한다.** `/doc-check`이 잡겠지만, 그건 안전망이지
순서가 아니다.

---

## 확인 필요 (착수 전 사용자 판정)

1. **GitHub App user 토큰 만료를 켠 채 둘 것인가** — 끄면 `planTokenUse`·`refreshUserToken`이
   통째로 사라진다(~60줄). 추천은 **켠 채 두기**: 만료 없는 토큰을 DB에 눕히는 대가가 순수 함수
   하나보다 크다.
2. **T5의 "App 제거 → 재설치"를 어느 리포에서 밟을 것인가** — App을 제거하면 그 리포의 야간 pull이
   그동안 실패한다. `i18n-format-check`가 가장 조용하다.
3. **설정 화면에 `baseBranch` 편집을 넣을 것인가** — 지금은 뺐다(design §3.2). 리포를 바꾸면 옛
   base branch가 없을 수 있는데, 그 검증은 5단계가 base head를 읽을 때 붙는다.
