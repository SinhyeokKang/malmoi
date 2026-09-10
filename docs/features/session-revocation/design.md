# 모든 세션 회수 — 기술 설계

## 범위와 기존 계약

SAAS §4.2 및 MVP §7의 비범위와 충돌하지 않는 사용자 계정 보안 기능이다. `/account` Server Action이 시작하고 기존 Auth.js OAuth callback에서 끝난다. 내부 쓰기 Route Handler를 새로 만들지 않는다. export·번역·프로젝트 인가에는 영향이 없다.

POSTMORTEM의 2026-09-05 signIn 검사와 handleLoginOrRegister 저장 분리, 2026-09-06 DB 장애를 비로그인으로 오분류한 사례, 2026-09-10 만료/삭제 CAS를 보존한다. 설치 Auth.js 0.41.3 callback은 signIn이 URL 문자열을 반환하면 handleLoginOrRegister 전에 반환한다. 회수 성공·실패 모두 이 경로로 끝내 새 계정/세션 생성을 방지한다.

## 확인 요청과 저장

새 테이블/환경변수는 없다. 현재 이메일 provider가 사용하지 않는 VerificationToken을 목적 접두로 분리해 사용한다. identifier에는 JSON 배열 `["malmoi/session-revocation","v1",userId,provider,providerAccountId,sessionDigest,stateDigest]`, token에는 도메인 분리 SHA-256(nonce), expires에는 생성 후 5분을 저장한다. 원문 세션·OAuth state·nonce는 DB에 저장하지 않는다. nonce는 32바이트 난수다.

확인 쿠키는 nonce만 담으며 HttpOnly, SameSite=Lax, path=/, 5분 수명이다. HTTPS는 Secure 및 __Host- 접두를 쓴다. Auth.js state는 별도 이름 `malmoi-revocation-state`(HTTPS `__Secure-` 접두)으로 15분 보관한다. PKCE는 Auth.js 기본 쿠키를 쓴다. state 쿠키의 암호화 salt도 이름으로 갈리므로 일반 `authjs.state`로 이름을 바꿔도 검증되지 않는다. 쿠키 내용은 권한을 직접 나타내지 않고 DB 확인 요청을 찾는 증거다. 사용자별 새 시작은 User 행 잠금 아래 이전 확인 요청을 대체해 저장량을 제한한다.

## 시작과 완료

1. Server Action에서 requireUser, 실제 session digest/만료, 로그인 Account가 정확히 하나인지 확인한다. userId/provider 입력을 클라이언트에서 받지 않는다.
2. `withRevocationStart` 요청 스코프에서 Auth.js state 쿠키 이름을 바꾼 뒤 기존 signIn을 redirect:false + prompt=select_account로 호출해 state를 포함한 인가 URL과 Auth.js 쿠키를 생성한다. github/google에 state 검증을 명시한다. URL의 state digest와 현재 세션을 확인 요청에 저장한 후 nonce 쿠키를 설정하고 공급자로 이동한다.
3. callback에서 nonce 또는 회수 전용 state 쿠키가 있으면 일반 로그인보다 먼저 회수 경로를 선택하고 같은 state 쿠키 설정으로 Auth.js를 실행한다. nonce가 먼저 만료되거나 DB 요청이 교체/소비돼도 회수 목적이 남는다. 두 표식을 모두 제거하면 일반 Auth.js state 쿠키로는 검증이 안 돼 로그인 쓰기 전에 거부된다. callback-url의 회수 목적지도 거부 전용 보조 표식이며 권한 증거가 아니다. Auth.js의 코드 교환/state/PKCE/공급자 검증이 성공한 signIn 콜백만 완료 함수를 호출한다. query state digest·nonce·현재 세션·providerAccountId를 모두 대조한다.
4. 트랜잭션의 User 잠금 아래 세션 미만료·계정 소유권·확인 요청 만료를 재검사하고 확인 요청을 조건부 소비한다. 사용자 전체 확인 요청과 Session을 삭제한다. 실패는 롤백하며 성공과 섞지 않는다.
5. signIn은 성공이면 `/?sessions=revoked`, 실패면 정해진 오류 URL을 반환한다. Auth handler 응답 래퍼는 AsyncLocalStorage의 해당 요청 완료 결과만 신뢰하고 callback URL을 성공 근거로 쓰지 않는다. nonce·회수 state 쿠키를 지우고 성공일 때만 현재 세션 쿠키도 지운다. 공급자 취소는 cancelled, 콜백 전 오류는 unavailable로 표시한다. 일반 로그인 두 진입점(`/`, `/invite/[token]`)은 새 로그인 시작 전에 회수 nonce/state 쿠키 넷을 지우며 원래 복귀 URL을 유지한다. 시작과 callback의 Secure 판정은 requestOrigin의 host/forwarded-proto를 함께 쓴다.

## 판정과 테스트

`policy.ts`: nonce/state digest, identifier 인코딩/엄격한 파싱, TTL·account/session/state 일치 판정, 쿠키 이름/옵션, 고정 결과 URL. DB·시간·난수는 호출자가 공급한다.
`store.ts`: 현재 계정/세션 검증, 시작·완료 트랜잭션과 고정 예외. `http.ts`: 요청별 Auth.js state 설정·callback 추출·응답 쿠키 정리. `clear-cookies.ts`: 두 일반 로그인 시작의 이전 회수 쿠키 정리. UI는 기존 Card/Button/Alert와 사전을 쓴다.

단위 테스트는 불일치·만료 경계·재사용·쿠키 옵션·원문 부재를 검사한다. 실제 Auth.js/격리 PostgreSQL 테스트는 성공 시 새 세션 부재, 타 사용자 보존, callback의 잘못된 계정 거부, 실패 롤백, 동시 소비 중 하나만 성공, 일반 로그인 회귀를 검사한다. 확인 요청 교체/소비 후 모든 의도 쿠키 유실, 회수 state를 일반 이름으로 바꿔 보내기, 회수 중 이탈 뒤 루트/초대 로그인도 실제 Auth.js로 검증한다. 실제 공급자 및 접근성 수동 검증은 별도 게이트다.

## 공급자 문서

GitHub는 [prompt=select_account](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps), Google은 [OIDC prompt](https://developers.google.com/identity/openid-connect/openid-connect)를 지원한다. 이것을 비밀번호/MFA 재입력 강제로 해석하지 않는다. [OWASP 재인증 원칙](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)에 따라 유출된 말모이 세션만으로 회수를 실행할 수 없도록 별도 공급자 왕복을 요구한다.

2026-09-10 [Google discovery](https://accounts.google.com/.well-known/openid-configuration)의 `code_challenge_methods_supported`에 S256을 확인했다. 이 메타데이터 확인은 실제 브라우저 OIDC 왕복 검증을 대체하지 않는다.
