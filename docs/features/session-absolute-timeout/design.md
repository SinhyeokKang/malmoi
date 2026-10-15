# session-absolute-timeout — design

## 1. 영향 받는 흐름

push·pull·export와 무관하다. **인증 경계**(ARCHITECTURE §6.1.1)의 세션 수명만 바뀐다 — 편집 UI·`/account`·`/mcp`·`/preferences` 등 세션을 쓰는 모든 화면. MCP Bearer(`ApiToken`·`OAuthConnection`)는 Session을 읽지 않아 무관하다.

**만료 순간의 UI는 새로 만들지 않고 지금 만료·폐기된 세션의 경로를 그대로 탄다.** 달라지는 것은 그 순간이 로그인 24시간 뒤에서 7일 뒤로 옮겨 가는 것뿐이다:

- 번역 워크스페이스 [Save] 저장(blur는 저장하지 않는다) → `unauthorized` → draft가 화면에 남고 danger Alert, sessionStorage 사본(`components/translations/workspace/workspace.tsx:562`·`:1187-1192`, `lib/translations/draft.ts:89-91`).
- 모달·설정 Action → 입력을 유지한 채 `accessErrorMessage`(`lib/auth/message.ts:61`). 다시 로그인하는 링크·이탈 가드는 없다(기존 동작, 비목표).
- ⚠️ 기존 동작이지만 기록한다: 워크스페이스 세션 Alert가 떠 있을 때 [Check](`workspace.tsx:1092`)나 onReview(`:1111`)를 누르면 refresh가 `/signin` redirect가 되어 화면의 draft가 사라진다(남는 것은 sessionStorage 사본). 코드 추론이며 이번 범위에서 고치지 않는다.

## 2. Auth.js가 정하는 것

`@auth/core@0.41.3` `lib/actions/session.js`(DB 전략, CTO 검수에서 설치본 대조):

1. `getSessionAndUser(token)` → `session.expires < now`면 `deleteSession` 후 무효.
2. `due = session.expires − maxAge + updateAge`. `due <= now`면 `updateSession({ sessionToken: 원문, expires: now + maxAge })`. **반환값을 쓰지 않는다.**
3. 응답 쿠키를 `expires: now + maxAge`로 다시 심는다 — **그러나 우리 앱에선 이 Set-Cookie가 브라우저에 닿지 않는다.** `next-auth@5.0.0-beta.32` `lib/index.js`의 `initAuth`(config가 함수인 분기)에서 인자 없는 `auth()`는 `getSession(headers, config).then(parseSessionResponse)`만 하고 응답 헤더를 버린다. 앱의 유일한 호출부가 `lib/auth/read-session.ts:43`의 인자 없는 `auth()`이고, 미들웨어는 `auth()`를 쓰지 않는다(`middleware.ts` 머리 주석).
4. callback(로그인)은 세션 쿠키를 `expires: session.expires`로 심는다(`lib/actions/callback/index.js:110` 등). `session`은 새 로그인이면 어댑터 `createSession`의 반환, 이미 로그인한 같은 사용자면 기존 행이다(`handle-login.js:99-101`).

따라서 **쿠키 만료는 로그인 시점의 `expires`에서 움직이지 않는다.** 지금의 `updateAge` 1시간은 DB만 연장하고 브라우저 쿠키는 로그인 + 24시간에 끝난다. sliding을 살리려면 쿠키를 다시 심는 둘째 장치가 필요하고(기각, §3), 고정 수명이면 쿠키와 DB가 같은 값이 된다.

## 3. 결정 — 로그인 뒤 7일 고정, 연장 없음

- `auth.ts`: `maxAge: 60 * 60 * 24 * 7`, `updateAge: 60 * 60 * 24 * 7`(= `maxAge`). 2의 공식에서 `due = expires`가 되어 Auth.js가 `updateSession`을 부르지 않는다(만료 행은 1에서 먼저 지워진다).
- **연장하지 않는다는 보증은 어댑터가 든다** — `credentialAdapter.updateSession`은 DB를 읽지도 쓰지도 않고 `null`을 돌려준다(Auth.js는 반환값을 쓰지 않는다, 2). Auth.js 공식에만 기대면 `expires == now` 경계의 1회 호출이나 누군가 `updateAge`를 되돌리는 변경에서 조용히 sliding이 돌아온다 — Codex 감사 #6이 정확히 이 공식의 함정이었다.
- `createSession`·`getSessionAndUser`·`deleteSession`은 그대로. `expires`가 실제 만료 시각이므로 `expires > now`를 직접 보는 판정(`lib/session-revocation/store.ts:24·51`, `lib/account-connect/store.ts:25·55·78`, OAuth callback 경로의 `getSessionAndUser` — `lib/auth/safe-adapter.ts` 머리 주석)이 코드 변경 없이 새 정책을 따른다. 술어는 `isSessionValid`(`lib/credentials/crypto.ts`) 하나로 남는다.

### 기각한 대안

- **idle 7일 + absolute 30일(원안)** — 쿠키가 재발급되지 않아 idle이 브라우저에서 성립하지 않는다(2). 살리려면 아래 둘 중 하나가 필요하다.
- **`maxAge` 30일 + 어댑터가 DB `expires`를 `now + 7d`로 자르고 1시간 스로틀** — callback이 쿠키 만료를 `createSession` 반환값으로 정하므로(2-4) 어댑터가 DB와 다른 `expires`를 Auth.js에 돌려줘야 한다. `Session.createdAt` 열·마이그레이션·CAS도 따라온다.
- **미들웨어가 렌더 요청마다 세션 쿠키를 다시 심기** — 인증 쿠키를 다루는 둘째 장치가 생기고, Auth.js 쿠키 속성(`__Secure-` 접두·sameSite·path)과 어긋나면 로그인이 깨진다.

## 4. 순수 함수

새로 만들지 않는다. 판정은 기존 `isSessionValid`이고, 수명은 `auth.ts` 리터럴 둘이다.

## 5. 껍데기 — `credentialAdapter.updateSession`

```ts
// 세션은 로그인 뒤 고정 수명이다 — 연장하지 않는다. 근거·기각안은 ARCHITECTURE §6.1.1.
async updateSession() { return null; },
```

- 기존 구현의 "삭제된 세션을 갱신으로 생성하지 않는다"(`expires: { gt: now }` 조건부 `updateMany`)는 쓰기가 없어지며 자명하게 참이 된다.
- 이 변경으로 고아가 되는 import(`now` 등)가 생기면 함께 지운다.

## 6. 스키마 변경

없다. 마이그레이션·배포 순서 판정 없음.

## 7. 개인정보

새 필드·새 목적·새 전송처가 없다 — 보존(쿠키 수명) 문장만 바뀐다.

- 방침(hosted, **en·ko 둘** — es는 `publicDocs.privacy`가 영어 고정이다). **"얼마나 동작하나"와 "행이 얼마나 남나"를 나눠 쓰는 형은 유지한다**(POSTMORTEM 2026-09-19). 쿠키 표 행은 쿠키의 실제 수명이고, 이제 DB 만료와 같은 값이다.

  | 자리 | 지금 | 새 문장 |
  |---|---|---|
  | `messages/en.tsx:862` | A session stops working 24 hours after your last activity. … | A session stops working 7 days after you sign in. Its row goes away when you sign out, or when that expired session is next presented. |
  | `messages/en.tsx:932` | `["Session", "24 hours from your last activity", …]` | `["Session", "7 days from when you sign in", "Keeps you signed in"]` |
  | `messages/ko-privacy.tsx:154` | 세션은 마지막 활동 뒤 24시간이 지나면 … | 세션은 로그인한 때부터 7일이 지나면 더 이상 사용할 수 없습니다. 세션 기록은 로그아웃하거나 만료된 세션으로 다시 요청할 때 삭제됩니다. |
  | `messages/ko-privacy.tsx:223` | `["세션", "마지막 활동부터 24시간", …]` | `["세션", "로그인부터 7일", "로그인을 유지합니다"]` |

  - 숫자는 숫자로 쓰고 en·ko의 같은 자리 숫자·단위를 맞춘다(DESIGN §10, `policy-gate.test.tsx:236-268`). "a week"·"일주일" 금지. `ko-privacy.tsx`는 금지어 게이트 밖이라(`dictionary-consistency.test.ts:27-35`) "갱신" 같은 금지어를 손으로 피한다.
  - ⚠️ **바꾸지 않는 "24 hours"**: `en.tsx:818`·`ko-privacy.tsx:110`은 Vercel Analytics 방문 세션이다.
  - 개정 이력: `policy-gate.test.tsx`의 `REVISIONS` 끝에 `{ effectiveDate, digest, koDigest }` 행(값은 실패 메시지에서), `en.tsx:716`·`ko-privacy.tsx:15`의 `effectiveDate`, en·ko `changes` 절, 그리고 **`policy-gate.test.tsx:316`의 하드코딩 `toBe("2026-10-14")`**. 날짜 = 머지일이고, 머지일이 바뀌면 날짜 다섯 자리를 함께 옮기고 digest·koDigest를 다시 받는다(`changes` 본문이 digest에 들어간다).
- 가이드(`/guide` 규칙, en·ko·es 같은 커밋):
  - `guide/{en,ko,es}/self-hosting/troubleshooting.md:76` — Session 행 설명의 "24시간 뒤 마지막 활동" → 로그인 뒤 7일.
  - 같은 파일 `:100` — 쿠키 수명.
  - `guide/{en,ko,es}/self-hosting/operate.md:112` — "이미 열린 세션은 로그인 상태를 유지한다": 공급자를 끈 뒤에도 열린 세션이 사는 기간이 최대 24시간 → 최대 7일이다. 운영자 판단에 쓰이므로 기간을 문장에 넣는다.

## 8. 새 환경변수

없다.

## 9. 불변식 영향

- export 결정성·blob SHA: 없음.
- 인증 경계(§6.1.1): **세션 수명만 바뀐다.** 판정 술어는 `isSessionValid(expires, now)` 하나로 남고, 회수는 여전히 "행 삭제 = 다음 요청부터 거부"다. 세션에 role·projectIds를 싣지 않는다는 §6.00 ④는 그대로.

## 10. POSTMORTEM에서 소환한 함정

- **Codex 감사 2026-09-06 #6** (ARCHITECTURE §6.1.1) — `updateAge` 기본값이 `maxAge`와 같아 세션이 연장되지 않았다. 그때 고친 sliding은 DB에만 닿았고 쿠키에는 닿지 않았다(§2-3). 이번엔 **연장 없음이 의도**이므로 `updateAge = maxAge`를 명시하고, 보증은 어댑터 no-op이 든다(§3). `provider-config.test.ts`의 "세션이 슬라이딩한다" 테스트는 뜻이 뒤집힌다.
- **2026-09-19 방침이 코드와 어긋남** — 이번 방침 문장도 실측(T0·T9) 뒤에 확정한다. 현재 문장이 이미 거짓이라는 사실 자체가 `/postmortem` 대상이다.
- **2026-09-10 격리 PG 스위트가 `pnpm test` 밖** — `postgres.integration.ts:333-335`가 실제 Auth.js 경로에서 연장을 단언하고 fixture가 `maxAge: 86400, updateAge: 3600`(`:254`)을 복제한다. 둘 다 바꾼다. `lib/credentials/adapter.ts`·`auth.ts` 변경이라 `pnpm gate`가 스위트를 붙인다(`scripts/gate-plan.ts`).
- **`lib/auth/cookie.ts` "쿠키 없는 POST"** — 7일째 쿠키가 브라우저에서 지워진 뒤의 Server Action POST는 미들웨어를 통과해 Action이 `unauthorized`를 낸다. 지금 24시간째에 겪는 경로와 같다.
