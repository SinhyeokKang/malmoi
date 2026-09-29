# mcp-oauth — design

## 0. 먼저 재는 것 (T1 — 설계의 갈림길이 전부 여기 걸려 있다)

미실측이라 **근거로 쓰지 않고 먼저 잰다**(PRODUCT §10의 "미실측 판정은 근거로 쓰지 않는다" 선례). 헤더 없는 설정으로 붙여 본다.

| 클라이언트 | 재는 것 |
|---|---|
| Claude Code 2.1.283 | PRM 발견 경로(`WWW-Authenticate` / well-known 추측), 등록 방식(CIMD `client_id` URL / DCR `/register`), `redirect_uri` 모양(loopback 포트), `resource` 파라미터 전송 여부, refresh 사용 여부 |
| Codex CLI 0.157.1 | 같은 항목 + `codex mcp login` 흐름 |
| claude.ai 커스텀 커넥터 | 같은 항목 + 콜백 origin. **이것이 붙어야 번역 편집자 경로가 선다** |

대상은 셋 다다(2026-09-29 사용자 판정 — claude.ai 포함). 이 결과는 **§2 등록 방식**을 정한다. 셋 중 하나라도 OAuth로 붙지 않으면 그 클라이언트에서 멈추고 보고한다.

## 1. 영향 받는 흐름

**push·pull·편집 UI의 번역 흐름은 건드리지 않는다.** 붙는 곳은 MCP 진입점의 **인증 한 층**과 새 AS 엔드포인트, `/mcp` 화면이다.
도구 28개·카탈로그·코어 인가는 그대로다 — 바뀌는 것은 "Bearer가 무엇이냐"를 푸는 곳뿐이다.

```
클라이언트 ── POST /api/mcp (헤더 없음) ─▶ 401 + WWW-Authenticate: Bearer resource_metadata=…
          ── GET /.well-known/oauth-protected-resource/api/mcp ─▶ { resource, authorization_servers:[origin] }
          ── GET /.well-known/oauth-authorization-server ─▶ { authorize, token, (registration), S256, … }
          ── (DCR일 때만) POST /oauth/register
브라우저  ── GET /oauth/authorize?client_id&redirect_uri&code_challenge&state&resource
             ├ 검증 실패(client·redirect_uri) → 화면에 오류, **리다이렉트하지 않는다**(open redirect)
             ├ 검증 통과 → 요청을 DB에 저장 → /oauth/authorize?request=<id> 로 정규화
             ├ 세션 없음 → 같은 화면의 GitHub·Google 버튼(signIn redirectTo = 그 URL)
             └ 세션 있음 → 동의 화면(권한·범위·만료) → Authorize(Server Action) → redirect_uri?code&state
클라이언트 ── POST /oauth/token (code + code_verifier) ─▶ { access_token, refresh_token, expires_in }
          ── POST /api/mcp  Authorization: Bearer mlo_…  → 기존 도구
```

| 경로 | 형태 | 근거 |
|---|---|---|
| `/.well-known/oauth-protected-resource/api/mcp` · `/.well-known/oauth-authorization-server` | Route Handler (GET) | 외부 계약. SDK `oauthMetadataResponse`·`buildOAuthProtectedResourceMetadata` 재사용 |
| `/oauth/authorize` | **페이지** (서버 컴포넌트) | 브라우저가 연다. 로그인·동의 UI |
| Authorize / Deny 버튼 | **Server Action** | 내부 쓰기다(CLAUDE.md). CSRF는 Next Action의 origin 검사 + 세션 |
| `/oauth/token` · `/oauth/register` · `/oauth/revoke` | Route Handler (POST) | 외부 계약. **쿠키를 읽지 않는다** |
| `/mcp` 연결 목록 끊기 | Server Action | 기존 `/mcp` Action 옆 |

⚠️ `/oauth/authorize`는 `isProtectedPath`에 넣지 **않는다** — 무세션이 정상 진입이고, 페이지가 스스로 로그인 버튼을 그린다(초대 화면 `/invite/[token]`과 같은 모양). 동의 Action은 `readSession`으로 본판정한다.

## 2. 클라이언트 등록 — T1 결과로 하나를 고른다

- **CIMD 우선 (추천)** — `client_id`가 HTTPS URL이고, authorize 시점에 그 문서를 가져와 `redirect_uris`·`client_name`을 읽는다.
  **등록 테이블이 없다** — 무한 등록 행(DCR 남용) 문제가 원리적으로 없다. 가져오기는 SSRF 방어가 필요하다(HTTPS만 · 사설 IP 거부 ·
  크기·시간 상한 · 리다이렉트 불추종 · `client_id`와 문서의 `client_id` 일치).
- **DCR (T1에서 CIMD를 못 쓰는 클라이언트가 대상이면 추가)** — `OAuthClient` 행. 무인증 공개 엔드포인트라 **행 상한 + 미사용 정리 기준**
  이 필요하다(범용 작업 큐는 만들지 않는다 — 정리는 등록 시점의 동기 삭제로).
- 어느 쪽이든 `redirect_uri`는 **완전 일치**, 예외는 loopback(`http://127.0.0.1` · `http://localhost`)의 **포트만** 자유(RFC 8252 §7.3).
  claude.ai 콜백은 HTTPS 완전 일치다 — 예외 목록에 claude.ai를 하드코딩하지 않고 클라이언트 메타데이터가 선언한 값만 받는다.

## 3. 순수 함수로 분리 가능한 부분 (`/tdd` 진입점)

`lib/oauth/` 아래, 전부 I/O 없음·`server-only` 없음.

| 함수 | 입력 → 출력 |
|---|---|
| `parseAuthorizeRequest(searchParams)` | 쿼리 → `{ ok, request } \| { ok:false, error, redirectable }`. `response_type=code` · `code_challenge_method=S256` 필수 · `resource`가 우리 MCP URL과 일치. ⚠️ `searchParams`는 남이 정한 키다 — `Object.hasOwn` |
| `planRedirectUri(registered[], requested)` | 완전 일치 / loopback 포트 예외 판정 |
| `verifyPkce(verifier, challenge)` | S256 비교 |
| `planCodeExchange({ codeRow, now, clientId, redirectUri, resource, verifier })` | `ok \| invalid_grant`(만료·사용됨·불일치 전부 같은 코드) |
| `planRefresh({ connectionRow, presentedHash, now })` | `ok \| invalid_grant` — 회전·연결 만료 |
| `planConsent({ memberships, input })` | `planApiTokenIssue` 재사용 — 역할 ∩ 요청, 범위는 현재 비보관 멤버십만 |
| `resolveBearerKind(token)` | `mlm_` → 개인 토큰 · `mlo_` → OAuth · 그 밖 → 거부. **DB를 두드리기 전에** 가른다(`resolveApiToken`의 접두 선판정 선례) |
| `planClientMetadata(doc, clientIdUrl)` (CIMD) | 가져온 문서 검증 |
| `protectedResourceMetadata(origin)` · `authorizationServerMetadata(origin)` | 결정적 문서. SDK 빌더로 감싼다 |
| `wwwAuthenticate(origin)` | 401 헤더 값 |

## 4. 스키마 변경 — **additive**

새 테이블 셋(DCR이면 넷). `ApiToken`은 건드리지 않는다.

```prisma
model OAuthConnection {            // 클라이언트별 "연결" = 개인 토큰의 형제
  id               String   @id @default(cuid())
  userId           String
  clientId         String            // CIMD URL 또는 DCR id
  clientName       String            // 동의 시점 스냅샷(화면 표시용)
  grants           String[]          // ApiToken.grants와 같은 어휘
  allProjects      Boolean
  projectIds       String[] @default([])
  accessTokenHash  String   @unique  // sha256, 원문 없음
  accessExpiresAt  DateTime          // 짧다 (1h)
  refreshTokenHash String   @unique
  expiresAt        DateTime          // 연결 수명 = 동의 화면의 30/90/365일(2026-09-29 사용자 판정). refresh가 넘지 못한다 — 만료면 재동의
  createdAt        DateTime @default(now())
  lastUsedAt       DateTime?
  user             User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}

model OAuthAuthorizationRequest {   // 로그인 왕복 동안 검증된 요청을 들고 있는다
  id String @id                      // 난수. URL의 ?request=
  clientId String; clientName String; redirectUri String; state String
  codeChallenge String; resource String
  expiresAt DateTime                 // 10분
}

model OAuthCode {
  codeHash String @id
  requestId String                   // 위 요청 + 동의 결과
  userId String; grants String[]; allProjects Boolean; projectIds String[]; connectionExpiresAt DateTime
  expiresAt DateTime                 // 60초
  usedAt DateTime?                   // 1회용 — 조건부 UPDATE로 소비
}
```

- **같은 사용자 × 같은 `clientId` 재동의 = 기존 연결 삭제 + 삽입**(개인 토큰의 "재발급 = 삭제 + 삽입"과 같은 모양). 연결은 불변이다 — grants·범위를 바꾸는 길은 재동의뿐이다.
  (2026-09-29 사용자 판정 — 교체.) 대가: 같은 클라이언트를 두 머신에서 쓰면 나중 동의가 앞 머신을 끊는다. 동의 화면이 "기존 연결을 대체한다"를 미리 말한다.
  스키마에 `@@unique([userId, clientId])`를 건다 — 교체를 DB가 강제한다.
- 요청·code 행의 정리는 만료 판정으로 무효화하고, 삽입 시점에 만료 행을 같은 tx에서 지운다(작업 큐 없음 — PRODUCT §4.2).
- ⚠️ 새 마이그레이션 뒤 dev·prod `has_schema_privilege = false` 확인(`/db` 5단계).
- 개인정보: 세 테이블을 `lib/privacy/collected.ts`에 등재하지 않으면 typecheck가 red다. `clientName`은 사용자가 아니라 클라이언트가 정한 문자열 — 화면에 그릴 때 이스케이프만 한다.

## 5. 주체·인가 — 기존 판정을 공유하고 자격증명 종류만 넓힌다

- `Subject.tokenId?: string`을 **`credential?: { kind: "api-token"; tokenHash } | { kind: "oauth"; connectionId }`**로 넓힌다. 세션·cron은 `undefined` 그대로.
  - ⚠️ 이 필드는 잠금 자리 입력의 **필수 키**다(§6.45.3) — 이름이 바뀌면 `TOKEN_SITES`·`RAW_TOKEN_SITES` AST 테스트와 모든 홉이 같이 바뀐다. 기계적 치환 커밋을 따로 뗀다.
- `lockApiToken` → `lockCredential`: kind에 따라 `ApiToken`(userId AND tokenHash) 또는 `OAuthConnection`(userId AND id)을 다시 읽고 **같은 `planLockedToken`**에 넣는다(행 모양이 `{grants, allProjects, projectIds, expiresAt}`로 같다).
  - OAuth는 **연결 id로 재읽는다, access 해시가 아니다** — 잠금 대기 중 refresh가 access를 회전해도 같은 연결의 쓰기는 정당하다. 재동의·끊기는 행 삭제라 "행 없음"이 된다(§6.45.3의 "재발급은 새 행" 성질이 그대로다).
- `resolveBearer`: 접두로 갈라 `resolveApiToken` 또는 `resolveOAuthAccess`(accessTokenHash → 연결, `accessExpiresAt`·`expiresAt` 둘 다 검사). 결과는 같은 `ApiTokenAuthority` + credential.
- 401은 두 종류가 **같은 본문** + 이제 `WWW-Authenticate` 헤더. ⚠️ 조회 장애는 여전히 500 `unavailable`이다(401로 접지 않는다 — §6.45.1).
- 토큰 엔드포인트 오류는 RFC 6749 §5.2 형(`invalid_grant` 등). ⚠️ DB 장애는 `server_error`(500)다 — `invalid_grant`로 접으면 클라이언트가 연결을 버리고 재로그인을 시킨다(같은 축).

## 6. 새 환경변수

**없다.** 토큰은 불투명 난수 + sha256이라 서명 키가 필요 없다. authorize 요청은 DB 행이라 `APP_SIGNING_SECRET`도 쓰지 않는다
(쓰면 그 키 회전이 진행 중 동의를 깬다 — 영향이 작아도 새 소비자를 늘리지 않는다). issuer·resource URL은 요청 origin을 `ALLOWED_HOSTS`로
거른 값(`requestOrigin`)이다 — dev·preview·prod가 각자 자기 origin을 광고한다.

## 7. 불변식 영향

- **export 결정성·blob SHA**: 영향 없음 — 번역 흐름을 건드리지 않는다.
- **인증 경계(ARCHITECTURE §6)** — 건드린다.
  - Malmoi가 **발급자**가 된다. 표(§6)에 "OAuth access/refresh token `mlo_…`/`mlr_…`" 행을 더한다 — **GitHub 자격증명이 아니다**, 개인 토큰과 같은 Malmoi 신원이다. `credential-separation.test.ts`의 세 축은 불변.
  - `/api/mcp`·`/oauth/token`·`/oauth/register`는 쿠키를 읽지 않는다. 쿠키를 읽는 것은 `/oauth/authorize` 페이지와 동의 Action뿐이다.
  - **권한은 매 호출 DB**(§6.45.2 ④)를 그대로 잇는다 — JWT를 쓰지 않는 이유다. 끊기·멤버 제거가 다음 호출부터 반영된다.
  - "401에서 두 CLI 모두 OAuth로 넘어가지 않는다"(§6.45.1)는 **헤더가 설정된 경우의 실측**이다 — 헤더 없는 설정의 동작은 T1이 새로 잰다. ARCHITECTURE 해당 줄을 고친다.
- **활동 사건(§5.7)**: 바뀌지 않는다 — OAuth로 한 일도 그 사용자의 사건이다(경유 표시 없음, 개인 토큰과 같은 판정).

## 8. 과거 함정 (POSTMORTEM)

- **2026-09-10 재인증 목적이 사라진 OAuth callback이 일반 가입을 실행했다** — 로그인 왕복의 "목적"을 삭제 가능한 표식에서만 찾으면 안 된다. 여기서 목적은 `?request=<id>`이고, **행이 없거나 만료면 동의 화면을 그리지 않고 오류로 끝난다** — 조용히 `/projects`로 가는 일반 로그인이 되면 안 된다. `clearAuthRoundtripCookies()` → `signIn()` 순서도 그대로 지킨다.
- **2026-09-12 OAuth 오류 화면이 초대 복귀 지점을 표시하지 않았다** — 공급자 취소 시 Auth.js는 `pages.error`(`/signin`)로 간다. `destFromCallbackUrl`이 authorize 요청 URL도 복귀 대상으로 인정해야 한다(새 쿠키를 만들지 않고 그 파서를 넓힌다).
- **2026-09-06 인가는 지났는데 조회를 그 사용자로 좁히지 않았다** — 연결 목록·끊기·code 교환의 모든 조회에 `userId`(교환은 code 행이 가진 값)를 건다.
- **2026-09-16 같은 요청의 `Promise.all`이 토큰 회전을 둘로 겹쳤다** — 에이전트는 병렬로 부른다. refresh 회전은 조건부 UPDATE(`WHERE refreshTokenHash = presented`)로 하고, 진 쪽은 `invalid_grant`가 아니라 **재시도 가능한 오류**여야 하는지 T1에서 클라이언트 동작을 보고 정한다(확인 필요 4).
- **2026-09-04 시크릿이 트랜스크립트에 남았다** — OAuth 경로는 설정 조각에 비밀값 자리 자체가 없다. `/mcp`의 연결 예시에 "헤더 없는 URL만" 조각을 더한다.

## 9. 문서 갱신 (implement / push 신선도 단계)

- PRODUCT §4.1 "MCP 커넥터" — 연결 방식 둘(개인 토큰 · OAuth) · 연결별 끊기 · 계정당 하나는 **개인 토큰에만** 걸린다.
- PRODUCT §7.7 IA — `/oauth/authorize` 추가.
- ARCHITECTURE §6 표 · §6.45.1(401 · 헤더) · §6.45.2 옆 **§6.45.8 OAuth** 신설 · §8(middleware 비보호 이유).
- DIRECTORY — `lib/oauth/` · `app/oauth/` · `app/.well-known/`.
- DESIGN — 동의 화면 규칙(신규 페이지라 `/design-sync` 대상).
- `/privacy` — 새 전송처는 없고(클라이언트에 주는 것은 우리가 발급한 토큰), 새 보존 대상(연결 행)이 생긴다. 판정 후 필요하면 개정.
- 가이드 — MCP 연결 페이지(`/guide`·`/guide-shots`).
