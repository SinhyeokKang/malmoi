# Optional login providers — 스펙

작성: 2026-10-09 · 상태: 코딩 직전 · 결정 4건 닫힘(§6, 2026-10-09 사용자)

## 1. 사용자

**1순위는 self-hosted 운영자(개발자)** 다. 설치 준비에서 로그인용 OAuth 자격증명을 GitHub OAuth App · Google OAuth 중 **원하는 것 하나만** 등록해도 말모이가 기동하고 로그인이 되게 한다.

번역 편집자에게 보이는 변화는 "운영자가 켠 수단의 버튼만 보인다" 하나다. 호스팅 서비스(mal-moi.com)는 두 공급자를 계속 켜 두므로 화면이 바뀌지 않는다.

## 2. 관측된 문제

- `lib/deployment/preflight.ts`의 `SELF_HOSTED_ENV`가 `AUTH_GITHUB_ID`·`AUTH_GITHUB_SECRET`·`AUTH_GOOGLE_ID`·`AUTH_GOOGLE_SECRET` 넷을 전부 `required`로 둔다. 하나라도 비면 web이 `preflight: <name> missing`으로 재시작을 반복한다. **실제 장벽은 이 표 하나다** — `auth.ts`의 config는 이미 `NextAuth(async () => ...)`라 env 없이도 빌드된다.
- 가이드 설치 표가 "Both login providers are required. The app always offers GitHub and Google sign-in."이라 적는다(세 언어). Google Cloud의 동의 화면 External + In production 게시는 운영자에게 무거운 절차인데, GitHub만 쓰는 팀에도 강제된다.
- 로그인 버튼 셋(`/signin`·`/invite/[token]`·`/oauth/authorize`)과 `/account` 수단 카드가 두 공급자를 **하드코딩**한다. 자격증명이 없는 공급자의 버튼은 누르면 Auth.js `Configuration` 오류로 떨어진다.
- 로그인 수단 판정(`lib/login-link/policy.ts`)이 "연결된 `Account` 행"만 보고 "그 공급자가 이 설치에서 켜져 있나"를 모른다. 공급자를 끈 설치에서:
  - `pickLoginAccount`가 꺼진 GitHub을 확인 상대로 골라 **전체 로그아웃·계정 병합 확인이 불가능한 왕복**이 된다.
  - `canUnlink`가 연결 행 수로 세므로, 꺼진 GitHub 행이 남아 있으면 유일하게 켜진 Google을 해제할 수 있다 — **해제 즉시 그 계정은 다시 로그인할 수 없다.**

## 3. 범위 게이트

- PRODUCT §4.2 비범위와 충돌하지 않는다. §4.1 "셀프 호스팅"의 **"하지 않는 것: 로컬 비밀번호·SAML·이메일 로그인"** 은 그대로다 — 공급자를 늘리지 않고 기존 둘 중 일부만 켜는 것이다.
- §4.3 ①(이메일 매직링크)·③(로그인 provider를 GitHub App으로 교체)을 요구하지 않는다.
- ⚠️ **정본 문구 하나가 바뀐다**: PRODUCT §4.1 셀프 호스팅 "그대로인 것: 로그인(GitHub·Google …)". 구현 배치에서 갱신한다(tasks T7).
- ARCHITECTURE §0 코어 원칙(병합 없음)과 무관하다. 인증 경계 불변식은 design §5에서 다룬다 — **로그인 자격증명과 GitHub App 자격증명을 섞지 않는다**는 원칙은 그대로이고, Google만 켠 설치에서도 OWNER의 리포 연결은 GitHub App user-to-server 인가(`GITHUB_APP_CLIENT_*`)로 한다.

## 4. 완료 조건

공급자 상태 정의: 한 공급자의 `AUTH_<P>_ID`·`AUTH_<P>_SECRET`이 **둘 다 값이 있으면 `enabled`**, 둘 다 비면 `absent`, 하나만 있으면 `partial`(공백만 있는 값은 빈 값). **켜진 집합(enabled set)** = `enabled`인 공급자, 순서는 언제나 `github` → `google`.

1. **preflight** — self-hosted에서 `enabled`가 1개 이상이고 `partial`이 0개일 때만 통과한다. `partial`은 빠진 쪽 이름으로 `incomplete-pair`, `enabled` 0개는 두 ID 이름으로 `no-login-provider`를 낸다. 값은 찍지 않는다. [단위: 상태 3×3 조합 표 9칸 전부]
2. **로그인 버튼** — `/signin`·`/invite/[token]`·`/oauth/authorize` 셋이 켜진 공급자의 버튼만 그린다. 켜진 것 중 **첫째가 primary**이고(Google 단독이면 Google이 primary), `/oauth/authorize`의 `autoFocus`도 첫째에 붙는다. [단위·렌더]
3. **Auth.js** — `providers`에 켜진 공급자만 들어간다. 꺼진 공급자로 `/api/auth/signin/<p>`·callback을 직접 때려도 로그인·가입이 생기지 않는다. [단위: provider 목록 구성 / 수동: 실기동]
4. **계정 화면** — `/account` 수단 카드가 켜진 공급자 행만 그리고 배지는 `{연결된 켜진 수단} of {켜진 수}`다. 꺼진 공급자로 연결된 `Account` 행은 **지우지 않고 숨긴다**(다시 켜면 그대로 돌아온다). [단위·렌더]
5. **해제 판정** — 해제 뒤 **켜진 연결 수단이 하나 이상 남을 때만** 해제한다. 꺼진 공급자의 해제 요청은 `unavailable`이다. 서버 Action과 화면이 같은 순수 판정을 쓴다. [단위: 꺼진 GitHub 행 + 켜진 Google 하나 → Google 해제 거부]
6. **연결 시작** — `startLoginMethodConnect`가 꺼진 공급자를 서버에서 거부한다(`?connect=failed`, OAuth 왕복을 시작하지 않는다). [단위·Action 테스트]
7. **확인 상대 선택** — 전체 로그아웃(`beginRevocation`)·계정 병합 안내(`loadLinkOffer`)·병합 확인 화면(`loadChallengeView`)이 확인 상대를 **켜진 연결 수단 중에서만** 결정적으로(`github` 우선) 고른다. 켜진 연결 수단이 없으면: 전체 로그아웃은 `unavailable`, 병합 안내는 하지 않음(기존 `OAuthAccountNotLinked` 거부), 병합 화면은 `/signin`으로. [단위]
8. **hosted 회귀 0** — 네 값이 다 있는 환경에서 모든 화면·판정 결과가 지금과 같다(버튼 둘, GitHub primary, 수단 카드 두 행, `x of 2`). [기존 테스트 green + 두 공급자 케이스 단위]
9. **배치·문서** — `deploy/compose.yaml`이 네 값을 빈 기본값(`${AUTH_GITHUB_ID:-}`)으로 넘겨 미설정 경고를 내지 않는다. `.env.example`·`deploy/.env.example`·가이드 self-hosting 장(install·troubleshooting·README, 세 언어)·PRODUCT §4.1·ARCHITECTURE·SELF-HOSTING이 "최소 하나의 완전한 쌍"을 말한다. [SH-15 게이트 green · `/guide` 검수]
10. **기존 세션** — 공급자를 끄더라도 살아 있는 세션은 끊지 않는다(세션에 공급자가 없다). 그 세션으로 `/account`에서 켜진 공급자를 연결할 수 있다. 가이드가 "끄기 전에 사용자가 다른 수단을 연결하게 하라"를 말한다. [수동 + 가이드]

## 5. 비목표

- 공급자 추가(GitLab·Microsoft·이메일·SAML 등) — PRODUCT §4.1 셀프 호스팅 "하지 않는 것".
- 관리 화면에서 공급자 켜기·끄기, 런타임 토글 — env가 유일한 스위치다.
- 꺼진 공급자로만 연결된 사용자를 앱이 구제하는 경로(관리자 재연결·이메일 확인 등). 운영자가 그 공급자를 다시 켜는 것이 복구 절차다(가이드).
- 꺼진 공급자의 `Account` 행 정리·삭제·마이그레이션.
- 호스팅 서비스의 공급자 구성 변경, Vercel env 변경.
- 켜진 공급자 0개인 hosted 환경의 전용 화면 — self-hosted는 preflight가 막고, hosted는 우리가 두 쌍을 넣는다.
- `/oauth/authorize`의 "Signed in with {provider}" 줄 — 세션의 실제 수단을 기록하지 않으므로 연결 행 기준을 그대로 둔다(design §3.6).
- 공개 가이드의 일반 장(faq·translate·account·ai-agents)의 "GitHub or Google" 문구 — 호스팅 서비스 기준 서술이고 self-hosting 장이 차이를 말한다.
- 호스팅 서비스 `/privacy` 본문 — 수신처 목록이 바뀌지 않는다(self-hosted는 운영자 URL로 redirect).

## 6. 결정 (2026-10-09 사용자 — 넷 모두 추천안 채택)

| # | 질문 | 결정 | 근거 |
|---|---|---|---|
| Q1 | 켜진 집합 판정을 hosted에도 똑같이 적용하나 | **같이 적용** ✅ | 판정을 모드별로 가르면 분기가 하나 늘고, hosted는 네 값이 다 있어 결과가 같다. 반쪽이면 지금은 버튼이 `Configuration` 오류로 떨어지고, 바뀐 뒤엔 버튼이 사라진다 — 둘 다 hosted 운영 결함이고 preflight는 hosted에서 돌지 않는다 |
| Q2 | self-hosted `partial`을 기동 거부로 하나(조용히 끄지 않고) | **기동 거부** ✅ | 반쪽은 거의 언제나 오타·누락이다. 조용히 끄면 운영자는 "버튼이 왜 없지"부터 찾는다 — preflight가 이름을 찍어 주는 편이 싸다 |
| Q3 | 꺼진 공급자의 연결 행을 `/account`에서 숨기나(보이되 비활성으로 두지 않고) | **숨김, DB엔 보존** ✅ | "미설정 공급자는 미노출"이 요청이고, 보여 주면 누를 수 없는 행에 사유 문구가 새로 필요하다(새 사전 키·DESIGN 판정). 행은 DB에 남아 다시 켜면 돌아온다 |
| Q4 | 꺼진 공급자로만 연결된 사용자는 앱이 구제하지 않고 가이드 안내로 막나 | **가이드 안내로** ✅ | 다른 수단으로 소유를 증명할 길이 없다 — 이메일 일치만으로 붙이면 ARCHITECTURE §6.2.1이 금지한 자동 병합이다 |
