# 8-1 signin + 인증 화면 — spec

**무엇을**: 로그인·초대 수락·인증 실패 화면을 Figma 시안으로 재작성하고, 그 과정에서 **`/signin`을
독립 라우트로 분리**한다. 8단계의 첫 배송이자 토큰·프리미티브 기반 배선을 겸한다.

⚠️ **배송이 둘로 갈렸다** (2026-09-10 리뷰): **8-1a**(라우트 이관 + placeholder, 시안 0) ·
**8-1b**(기반 + 시안). 성격이 다른 축 넷을 한 PR로 묶으면 red일 때 원인 축을 특정하는 비용이
커진다 — 6a가 같은 이유로 배송을 넷으로 쪼갰다. 순서와 커밋 경계는 `tasks.md`가 든다.

## 사용자

**둘 다이고, 이 화면은 비개발자 쪽이 더 자주 만난다.**

- **번역 편집자(비개발자 동료)** — 초대 링크를 받아 처음 이 제품을 보는 곳이 로그인 화면이다.
  이 사람에게 malmoi는 "슬랙으로 받은 링크"이고, 그 링크가 여는 첫 화면이 신뢰를 결정한다.
- **개발자(나)** — 프로젝트를 만들러 들어오는 경로. 이미 GitHub 계정이 있어 마찰이 적다.

## 문제

**셋이고, 성격이 다르다.**

### ① 랜딩 페이지가 들어올 자리가 없다

`/`가 곧 로그인 화면이다. 랜딩을 추가하려면 로그인을 다른 경로로 옮겨야 하는데, **로그인 화면을
가리키는 자리가 일곱이고 여섯이 하드코딩이다**:

| 자리 | 지금 |
|---|---|
| `auth.ts:93` — `pages: { signIn, error }` | `"/"` 둘 |
| `auth.ts:155` — 세션 장애 반환 | `"/?error=Unavailable"` |
| `middleware.ts:34` — 1차 차단 redirect | `"/"` |
| `lib/auth/session.ts:26-27` | `"/?error=Unavailable"` · `"/"` |
| `app/(edit)/layout.tsx:29-30` | 같은 둘 |
| **`lib/session-revocation/policy.ts:55`** | **`"/?sessions=revoked"`** |
| `lib/routes.ts` — `signIn()` | `"/"` |
| `components/translation-input.tsx:119` | `routes.signIn()` — **유일하게 이미 옳다** |

⚠️ **초안이 일곱이라고 적었고 실측은 아홉이다** (2026-09-10 리뷰가 셋을 더 찾았다). 그중
**`policy.ts:55`가 `?sessions=revoked`의 유일한 생산자**라, 놓치면 `/` 껍데기가 쿼리를 버려
**세션 회수 완료 피드백이 원리적으로 안 뜬다.**

⚠️ **`signOut({ redirectTo: "/" })` 둘**(`app/(edit)/layout.tsx:44` · `app/(edit)/account/page.tsx:58`)
**은 옮기지 않는다** — **로그아웃은 랜딩으로 간다**가 결정이다(2026-09-10 사용자). 이관 누락이
아니라는 것을 주석으로 남긴다.

⚠️ **경로 문자열은 타입이 아니라 데이터라 옮겨도 아무것도 깨지지 않는다** — 2026-09-05에 `/keys` →
`/projects/[slug]/translations` 이관에서 정확히 그랬고 게이트 셋이 전부 green이었다
(POSTMORTEM 2026-09-05). 나중에 옮기면 같은 사고를 다시 낸다.

### ② 화면이 시안과 다르다

현재 로그인 화면은 6단계가 세운 것으로, 제목+tagline 2줄에 장식이 CSS 모형 카드다. 시안은 로고 ·
제목 한 줄 · 버튼 둘 · 약관 · 푸터이고, 우측은 도트 배경 + 키비주얼 + 상하단 문구다.

### ③ 푸터 링크의 목적지가 없다

시안 푸터에 Privacy Policy · Docs가 있는데 그 라우트가 없다. 출시 전에 채울 예정이라
**빈 라우트를 미리 딴다** (2026-09-10 사용자).

## 완료 조건

**검증 가능한 문장으로.** 앞의 넷이 8-1a, 나머지가 8-1b다.

### 8-1a

1. `/`에 비로그인으로 들어가면 `/signin`으로, 로그인 상태로 들어가면 `/projects`로 간다
2. **로그인 목적지를 만드는 자리가 `routes.signIn()` 하나로 모인다** — 판정은 grep 0건이 아니라
   **`routes.signIn(` 호출자 ≥ 7 + 잔여 `"/"` 리터럴이 전부 `signOut` 둘과 경로 조작뿐**임을
   눈으로 확인하는 것이다
   ⚠️ **초안의 grep은 아홉 중 여섯을 구조적으로 못 봤다** — `pages: { signIn: "/" }`·`new URL("/")`·
   `redirectTo: "/"`·`"/?sessions="`를 한 건도 매치하지 않는다
3. **예상 red 여섯이 전부 났다가 green이 된다** — `session-revocation` 넷 · `credentials/sign-in` ·
   `onboarding`. 그리고 **`pnpm test:credentials:postgres`가 green**이다(그 스위트는 `pnpm test`
   밖이라 게이트가 못 본다)
4. `/privacy`·`/docs`가 200을 내고, 거기서 로그인 화면으로 **돌아올 수 있다**

### 8-1b

5. `/signin`이 시안과 같은 골격으로 렌더된다 — 좌측 카드(로고·제목·버튼 둘·약관·푸터) + 우측
   도트 배경·상하단 문구·키비주얼
6. 인증 거부·세션 장애가 **토스트로** 보이고 **닫기 전까지 남는다.** `signInErrorMessage`의
   **갈래 넷**(`OAuthAccountNotLinked`·`AccessDenied`·`Unavailable`·fallback)이 전부 닿고,
   **`?error=` 없이 `unavailable`인 경우**(미들웨어 redirect 경로)도 포함한다
7. 전체 로그아웃 완료(`?sessions=revoked`)가 토스트로 보인다
8. `/invite/[token]`에서 **`planInvitationAccept`의 5분기**가 각자 다른 화면을 내고,
   `email-mismatch`에 "다른 계정으로 로그인"이 있다
9. 도트 필드가 커서를 따라 스케일하고, `prefers-reduced-motion`에서 정적이며,
   **커서가 패널에 들어오기 전에는 rAF가 돌지 않는다**
10. **1280px에서 가로 스크롤이 없다** — `min-w-[1280px]`가 그 아래에서 스크롤을 만든다
11. `pnpm typecheck && pnpm test && pnpm build` green — 특히 `entry-points`·`focus-ring`·
    `client-graph`·`no-korean-ui`
12. 브라우저 탭에 favicon이 뜬다
13. `docs/SAAS.md` §7.7·`docs/DESIGN.md`·`CLAUDE.md`가 새 상태를 말한다

## 비목표

- **랜딩 페이지 자체** — `/`는 이번엔 redirect 껍데기다. 내용은 나중이다
- **`/privacy`·`/docs`의 내용** — 빈 placeholder다. 라우트만 딴다
- **`/account`** — 인증 인접(전체 세션 회수)이지만 **셸 안 화면**이라 8-2(셸) 뒤다
- **회원가입 전용 페이지** — 만들지 않는다. provider 로그인이 곧 가입이고(`createUser`),
  프로젝트 가입은 초대 수락이다. 6번 지시의 "회원가입 관련 페이지"에 해당하는 실물은 그 둘뿐이다
- **이메일 매직링크 로그인** — SAAS §4.3 ①이 2차로 미뤘고 그 조건("사내 비개발자가 GitHub·Google
  계정을 못 쓰는 상황")이 아직 아니다
- **팔레트 교체(slate → neutral)** — 규약 7대로 slate 유지, 런타임 목측만
- **Terms of Service** — 돈 받고 파는 서비스가 아니라 Privacy Policy 하나로 퉁친다 (2026-09-10 사용자)
- **다른 화면의 인라인 Alert를 토스트로 옮기는 것** — signin·invite만 이번 배송이고, 나머지는 각자의 배송에서 옮긴다
- **다른 화면** — 셸·목록·번역 등은 각자의 배송이다
- **한국어 UI** — 로그인이 비개발자의 첫 화면이라 유혹이 크지만 `lib/i18n/index.ts`가 *"ko를 더할 때
  바뀌는 파일이 여기 하나"*를 전제로 서 있다. 여기만 한국어로 하지 않는다
- **SEO·OG 메타데이터** — `/`가 공개 라우트가 되고 랜딩 자리를 예고하지만, title/description/OG는
  랜딩 배송의 몫이다
- **새 디자인 토큰** — 치수는 기존 스케일에서 고른다 (README 규약 6)

## 범위 게이트

**통과.** SAAS §8 8단계의 첫 배송이고 §4.2 비범위·§4.3 보류 넷 어디에도 걸리지 않는다.
코어 설계 원칙(MVP §2 — 병합 없음)과 무관하다: 이 배송은 값·키를 만지지 않는다.

⚠️ **SAAS §7.7 IA 라우트 표에 `/signin`·`/privacy`·`/docs`가 없다** — 라우트를 셋 늘리므로
그 표 갱신이 태스크에 들어간다. 안 하면 다음에 여는 사람이 `/`를 로그인으로 읽는다.
