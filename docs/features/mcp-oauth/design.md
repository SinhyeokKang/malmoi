# mcp-oauth — design

## 0. 먼저 재는 것 (T1 — 설계의 갈림길이 전부 여기 걸려 있다)

미실측이라 **근거로 쓰지 않고 먼저 잰다**(PRODUCT §10의 "미실측 판정은 근거로 쓰지 않는다" 선례). 헤더 없는 설정으로 붙여 본다.

| 클라이언트 | 재는 것 |
|---|---|
| Claude Code 2.1.283 | PRM 발견 경로(`WWW-Authenticate` / well-known 추측), 등록 방식(CIMD `client_id` URL / DCR `/register`), `redirect_uri` 모양(loopback 포트), `resource` 파라미터 전송 여부, refresh 사용 여부 |
| Codex CLI 0.157.1 | 같은 항목 + `codex mcp login` 흐름 |
| claude.ai 커스텀 커넥터 | 같은 항목 + 콜백 origin. **이것이 붙어야 번역 편집자 경로가 선다** |

대상은 셋 다다(2026-09-29 사용자 판정 — claude.ai 포함). 이 결과는 **§2 등록 방식**을 정한다. 셋 중 하나라도 OAuth로 붙지 않으면 구현 착수를 멈추고 보고한다.
T1 종료 조건은 등록 방식·loopback 호환 정책·refresh 경합과 재동의 동작·claude.ai 실물 확인 환경을 근거와 함께 기록하는 것이다.

### 0.1 T1 결과 (2026-09-29 실측)

⚠️ **claude.ai는 미측정이다.** 스텁을 공개할 quick tunnel(`cloudflared`)이 Claude Code auto mode 분류기에 거부됐다(외부 ingress 터널).
그래서 T1은 **닫히지 않았다** — 사람이 터널을 승인하거나 다른 공개 경로를 정해 claude.ai 행을 채워야 §2의 DCR 여부가 확정된다.

스텁은 `.scratch/oauth-stub/`(커밋 안 함)의 Node 서버 셋이다 — 등록 광고만 다르다: `both`(CIMD 지원 + `registration_endpoint`) · `cimd` 전용 · `dcr` 전용.
authorize는 자동 승인, 토큰 엔드포인트는 회전 + §4.1 재사용 폐기를 흉내 낸다. 설정은 **헤더 없는 URL만**이다. 모든 요청은 JSONL로 남겼다.
실제 설치 버전은 계획과 다르다 — **Claude Code 2.1.284**, **Codex CLI 0.154.0**.

| 항목 | Claude Code 2.1.284 | Codex CLI 0.154.0 | claude.ai |
|---|---|---|---|
| 첫 요청 | `POST /api/mcp`(`server/discover`, 2026-07-28) → 401 | `GET /api/mcp` 프로브(`MCP-Protocol-Version: 2024-11-05`) → 405 | 미측정 |
| PRM 발견 | **401의 `WWW-Authenticate` `resource_metadata`** → `/.well-known/oauth-protected-resource/api/mcp` | **헤더를 보지 않고 RFC 9728 경로를 추측**한다 — 같은 `/.well-known/oauth-protected-resource/api/mcp`. 그 뒤 AS 문서 | 미측정 |
| AS 문서 | `/.well-known/oauth-authorization-server`(루트) | 같다 | 미측정 |
| 그 밖의 well-known | 재인증의 revoke 흐름에서 루트 `/.well-known/oauth-protected-resource` 1회(404, 영향 없음). `openid-configuration`은 0건 | 0건 | 미측정 |
| `both` 모드 등록 | **CIMD** — `client_id=https://claude.ai/oauth/claude-code-client-metadata` | **CIMD** — `client_id=https://chatgpt.com/oauth/codex/<id>/client.json`(서버 추가마다 `<id>`가 다르다) | 미측정 |
| `cimd` 전용 | 성공 | 성공 | 미측정 |
| `dcr` 전용 | 성공 — `/oauth/register`에 `client_name: "Claude Code (<서버 이름>)"`, 포트가 박힌 `redirect_uris` 하나 | 성공 — `client_name: "Codex"`, `application_type: native` | 미측정 |
| CIMD 문서 `redirect_uris` | `http://localhost/callback` · `http://127.0.0.1/callback`(**포트 없음**) | `http://127.0.0.1/callback/<id>` · `http://localhost/callback/<id>`(**포트 없음**) | 미측정 |
| 실제 `redirect_uri` | **`http://localhost:<임의 포트>/callback`** — 재인증 5회 전부 `localhost`, `127.0.0.1`은 0회 | **`http://127.0.0.1:<임의 포트>/callback/<id>`** — `localhost`는 0회 | 미측정 |
| `[::1]` | 0회 | 0회 | — |
| `resource` | authorize · code 교환 · refresh **전부** 보낸다(정확한 MCP URL) | 같다 | 미측정 |
| PKCE | S256 | S256 | 미측정 |
| refresh 사용 | 쓴다. **만료가 가까우면 선제 refresh** — `expires_in: 45`에서는 요청마다 refresh(2.5초에 4회), 3600에서는 만료 전 0회. 401이면 반응형 refresh 1회 뒤 재시도 | 쓴다 — 시작 시 401을 받으면 refresh 1회 뒤 `initialize` 재시도 | 미측정 |
| refresh의 `client_id` | 보낸다 | 보낸다 | 미측정 |
| `/oauth/revoke` | **쓴다** — `/mcp` → Re-authenticate가 옛 refresh·access를 각각 revoke(RFC 7009, `token_type_hint` 포함) | 0회 | 미측정 |
| 도구 호출 | `tools/call ping` → pong | `initialize` → `notifications/initialized` → `tools/list` → `tools/call ping` → pong(2025-06-18) | 미측정 |

- **CIMD 가져오기는 둘 다 공개 HTTPS 200 + `application/json`이었다** — 문서의 `client_id`가 URL과 같다. `client_name`은 Claude Code만 넣고 Codex 문서엔 없다
  (DCR일 때만 `Codex`). 동의 화면의 이름 폴백이 필요하다 — 이름이 없으면 clientId URL을 보인다(§6.1의 "이름은 신원 보증이 아니다"와 같은 방향).
- **브라우저**: 두 CLI 모두 authorize URL을 **시스템 기본 브라우저로 연다.** Codex `mcp add`는 추가 직후 자동으로 로그인까지 돈다. `codex mcp login`에는 브라우저를
  끄는 옵션이 없다(`--oauth-client-registration auto|cimd|dcr`만). 그래서 재로그인 측정은 건너뛰었다(사용자 브라우저를 다시 열지 않기 위해).

### 0.2 T10 claude.ai 확인 환경 — prod 머지 후 (추천)

**claude.ai는 prod(`mal-moi.com`)에서 머지 뒤 확인한다.** preview는 Vercel SSO 뒤인데 claude.ai 커넥터는 Anthropic 서버에서 URL 하나로 붙는다.
Protection Bypass는 `x-vercel-protection-bypass` **헤더**여야 하고(§6.45.8 — URL 쿼리 금지), 커넥터가 그 헤더를 PRM·AS·token 요청까지 매번 싣게 할 방법이 없다.
401 → well-known → token 요청은 우리가 조립한 URL을 클라이언트가 따라가므로 쿼리를 실어도 첫 요청에만 붙는다. ⚠️ 이 판단은 claude.ai 실측 전의 추론이다 — claude.ai가
사용자 지정 헤더를 받는다면 preview도 된다. T10 규칙(tasks)대로 preview 단계에서는 claude.ai를 완료로 적지 않고 spec 1을 prod 확인까지 미완으로 둔다.

## 1. 영향 받는 흐름

**push·pull·편집 UI의 번역 흐름은 건드리지 않는다.** 붙는 곳은 MCP 진입점의 **인증 한 층**과 새 AS 엔드포인트, `/mcp` 화면이다.
도구 28개·카탈로그·코어 인가 규칙은 그대로다. 인증 층 외에도 자격증명을 직접 다루는 두 곳을 확장한다:
`whoami`의 만료 조회와 프로젝트 생성 시 고른 범위의 `projectIds` 추가다(§5).

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
- 어느 쪽이든 `redirect_uri`는 **완전 일치**, 표준의 예외는 loopback IP literal(`http://127.0.0.1` · `http://[::1]`)의 **포트만** 자유다
  ([RFC 8252 §7.3](https://www.rfc-editor.org/rfc/rfc8252.html#section-7.3)). scheme·host·path·query는 그대로 대조한다.
  `localhost`는 이 표준 예외에 포함하지 않는다. T1에서 대상 클라이언트에 꼭 필요하다고 확인되면 별도 호환 정책과 검증을 명시하고,
  그 전에는 등록 URI와 완전 일치만 허용한다.
  claude.ai 콜백은 HTTPS 완전 일치다 — 예외 목록에 claude.ai를 하드코딩하지 않고 클라이언트 메타데이터가 선언한 값만 받는다.

**T1 판정 (2026-09-29, §0.1):**

- **CIMD를 구현한다.** 두 CLI 모두 `both`에서 CIMD를 골랐고 `cimd` 전용에서도 붙었다. 등록 테이블 없이 두 CLI가 선다.
- **DCR은 claude.ai 실측 뒤에 정한다.** 두 CLI는 DCR 없이 된다. claude.ai가 `cimd` 전용에서 실패할 때만 DCR(`OAuthClient` + 상한)을 더한다.
  지금 DCR을 선반영하지 않는다 — 무인증 등록 엔드포인트는 대상이 확인된 뒤에만 연다.
- **`localhost`를 loopback 예외에 넣는다 — Claude Code가 `localhost`만 쓴다**(5/5). 규칙은 IP literal과 같다: **등록된 URI와 요청 URI 둘 다 host가
  문자 그대로 `localhost`이고 scheme이 `http`일 때만 포트를 무시**한다. path·query는 완전 일치다. `localhost` ↔ `127.0.0.1` 교차 일치는 허용하지 않는다
  (두 CLI의 CIMD 문서가 두 host를 각각 선언하므로 필요 없다). 근거: RFC 8252 §7.3은 `localhost`를 권장하지 않을 뿐 금지하지 않고, 콜백은 사용자 기기의
  리스너라 AS가 볼 수 있는 차이가 없다. 이 예외가 없으면 Claude Code가 CIMD로 붙지 않는다.
- **포트 예외는 CIMD의 포트 없는 등록값 때문에 필수다** — 두 CLI 모두 문서엔 포트가 없고 요청엔 임의 포트가 붙는다. DCR 등록값은 포트까지 박혀 있어
  완전 일치로 충분하다.
- `[::1]`은 두 CLI 모두 쓰지 않았다 — 표준 예외로 남기되 호환 근거로 삼지 않는다.

## 3. 순수 함수로 분리 가능한 부분 (`/tdd` 진입점)

`lib/oauth/` 아래, 전부 I/O 없음·`server-only` 없음.

| 함수 | 입력 → 출력 |
|---|---|
| `parseAuthorizeRequest(searchParams)` | 쿼리 → `{ ok, request } \| { ok:false, error, redirectable }`. `response_type=code` · `code_challenge_method=S256` 필수 · `resource`가 우리 MCP URL과 일치. ⚠️ `searchParams`는 남이 정한 키다 — `Object.hasOwn` |
| `planRedirectUri(registered[], requested)` | 완전 일치 / loopback 포트 예외 판정 |
| `verifyPkce(verifier, challenge)` | S256 비교 |
| `planCodeExchange({ codeRow, now, clientId, redirectUri, resource, verifier, expectedIssuer, expectedResource })` | `ok \| invalid_grant`(만료·사용됨·불일치는 같은 코드). 검증 필드는 codeRow의 발급 시점 스냅샷이며 요청 행을 다시 읽지 않는다 |
| `planRefresh({ connectionRow, presentedHash, usedTokenRow, now, clientId, resource, expectedIssuer, expectedResource })` | `rotate \| revoke-replayed-connection \| reject-within-grace \| invalid_grant` — 바인딩을 먼저 검증한 뒤 현재 해시·사용 이력(회전 뒤 30초 안이면 유예)·연결 만료 판정. 폐기 판정은 연결 ID를 들고, 외부 응답은 폐기 커밋 뒤 `invalid_grant`. 유예는 쓰기 없이 `invalid_grant` |
| `planConsent(input)` | `planApiTokenIssue` 재사용 — grant 어휘·만료·현재 비보관 멤버십 범위 검증. 역할 ∩ grant는 도구 실행 시 판정하며 동의 시 역할로 선택을 막지 않는다 |
| `resolveBearerKind(token)` | `mlm_` → 개인 토큰 · `mlo_` → OAuth · 그 밖 → 거부. **DB를 두드리기 전에** 가른다(`resolveApiToken`의 접두 선판정 선례) |
| `planClientMetadata(doc, clientIdUrl)` (CIMD) | 가져온 문서 검증 |
| `protectedResourceMetadata(origin)` · `authorizationServerMetadata(origin)` | 결정적 문서. SDK 빌더로 감싼다 |
| `wwwAuthenticate(origin)` | 401 헤더 값 |

## 4. 스키마 변경 — **additive**

새 테이블 넷(DCR이면 다섯). `ApiToken`은 건드리지 않는다.

```prisma
model OAuthConnection {            // 클라이언트별 "연결" = 개인 토큰의 형제
  id               String   @id @default(cuid())
  userId           String
  clientId         String            // CIMD URL 또는 DCR id
  clientName       String            // 동의 시점 스냅샷(화면 표시용)
  redirectUri      String            // 동의 시점 콜백(기록). 화면에 싣지 않는다 — §6.1
  issuer           String
  resource         String            // 발급 환경의 정확한 MCP URL
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
  refreshHistory   OAuthRefreshHistory[]
  @@unique([userId, clientId])
}

model OAuthRefreshHistory {        // 회전으로 소비한 refresh의 해시만 보존
  tokenHash    String @id
  connectionId String
  usedAt       DateTime
  connection   OAuthConnection @relation(fields: [connectionId], references: [id], onDelete: Cascade)
  @@index([connectionId])
}

model OAuthAuthorizationRequest {   // 로그인 왕복 동안 검증된 요청을 들고 있는다
  id String @id                      // 난수. URL의 ?request=
  clientId String; clientName String; redirectUri String; state String
  codeChallenge String; issuer String; resource String
  expiresAt DateTime                 // 10분
  consumedAt DateTime?               // Authorize/Deny 중 한 번만 확정
}

model OAuthCode {
  codeHash String @id
  requestId String @unique           // 발급 출처 식별용 스칼라. 요청 행 FK·cascade 없음
  clientId String; clientName String; redirectUri String
  codeChallenge String; issuer String; resource String // 검증된 요청에서 복사, 교환 입력으로 덮지 않는다
  userId String; grants String[]; allProjects Boolean; projectIds String[]; connectionExpiresAt DateTime
  expiresAt DateTime                 // code 발급 시점 + 60초. 요청 TTL과 독립
  usedAt DateTime?                   // 1회용 — 조건부 UPDATE로 소비
  @@index([userId, clientId])
}
```

- **같은 사용자 × 같은 `clientId` 재동의 = 기존 연결 삭제 + 삽입**(개인 토큰의 "재발급 = 삭제 + 삽입"과 같은 모양).
  grants·선택 범위를 바꾸는 길은 재동의다. 단 **고른 범위의 연결이 직접 만든 프로젝트를 같은 tx에서 편입**하는 기존 예외는 유지한다(§5).
  (2026-09-29 사용자 판정 — 교체.) 대가: 같은 클라이언트를 두 머신에서 쓰면 나중 동의가 앞 머신을 끊는다. 동의 화면이 "기존 연결을 대체한다"를 미리 말한다.
  스키마에 `@@unique([userId, clientId])`를 건다 — 교체를 DB가 강제한다.
- 요청·code 행의 정리는 만료 판정으로 무효화하고, 삽입 시점에 만료 행을 같은 tx에서 지운다(작업 큐 없음 — PRODUCT §4.2).
- **code는 발급 시점의 검증 필드를 직접 보관한다** (2026-09-29 사용자 승인). 발급 시 요청이 아직 유효한지 확인하고,
  `clientId`·`clientName`·`redirectUri`·`codeChallenge`·`issuer`·`resource`를 요청 행에서 복사한다. 동의 결과는 기존대로 code에 저장한다.
  교환 시 PKCE·클라이언트·리다이렉트·리소스 검증과 연결 생성은 이 스냅샷을 사용한다. `requestId`로 원래 요청을 다시 조회하거나
  그 만료를 code의 만료로 취급하지 않는다. 요청 정리가 살아 있는 code를 cascade 삭제해서도 안 된다.
- ⚠️ 새 마이그레이션 뒤 dev·prod `has_schema_privilege = false` 확인(`/db` 5단계).
- 개인정보: 새 테이블 전부(사용자 연결을 가리키는 `OAuthRefreshHistory`와 DCR을 택하면 `OAuthClient` 포함)를 `lib/privacy/collected.ts`에 등재한다. `clientName`은 사용자가 아니라 클라이언트가 정한 문자열 — 화면에 그릴 때 이스케이프만 한다.

### 4.1 refresh 회전·재사용 — 연결 단위 폐기 (2026-09-29 사용자 승인)

- **이전 해시를 덮어쓰기만 하지 않는다.** 사용된 refresh의 sha256 해시를 `OAuthRefreshHistory`에 연결 ID와 함께 남긴다.
  현재 토큰은 `OAuthConnection.refreshTokenHash`, 이미 사용된 토큰은 이력에서 조회한다. 원문·새 토큰 응답은 저장하지 않는다.
- 회전·재사용 판정은 **연결 행 잠금 뒤 다시 읽은 현재 해시와 이력**으로 한다. 현재 해시가 맞으면 이력 삽입과
  access/refresh 해시 교체를 같은 트랜잭션에서 확정한다. 어느 쓰기든 실패하면 전부 롤백하고 토큰을 응답하지 않는다.
  이 잠금은 `/oauth/token`의 회전용이며 MCP 도구의 인가 재읽기에 잠금을 추가하지 않는다.
- 클라이언트·발급 환경 바인딩이 맞는 이미 사용된 해시가 다시 오면 **그 이력이 가리키는 연결만 삭제**한다. 현재 access·refresh와 이력도 함께 무효화되고,
  커밋 뒤 `invalid_grant`를 반환한다. 알 수 없는 해시만으로 연결을 폐기하지 않는다. DB 장애는 `server_error`다.
- 이력은 연결이 살아 있는 동안 오래된 것까지 보존한다. 연결 삭제 시 cascade로 지우고, 만료 연결은 삽입 시점 정리 대상으로 둔다.
  최근 해시 하나만 남기거나 연결보다 먼저 이력을 지우면 옛 토큰 재사용을 탐지하지 못한다.
- **재사용 유예 30초** (2026-09-29 사용자 판정 — T1 COMPAT-RISK). 바인딩 검사를 통과한 옛 해시가 **같은 연결**의 이력에 있고
  `now - usedAt <= 30초`(경계 포함)이면 **회전도 폐기도 하지 않고** `invalid_grant`만 답한다(`reject-within-grace`, 쓰기 0건).
  같은 클라이언트의 프로세스 둘이 access 만료 뒤 같은 refresh를 겹쳐 내는 정상 동작(Codex 병렬 시작 1ms)이 연결을 끊지 않게 하는 것이다 —
  먼저 회전한 쪽이 새 토큰을 들고, 늦은 쪽은 저장소의 새 refresh로 다시 시도한다. 30초를 넘긴 재사용은 위대로 연결을 폐기한다.
  대가: 회전 직후 30초 안에 쓰인 탈취 refresh는 탐지하지 못한다(유예는 토큰을 발급하지 않으므로 얻는 것은 없다).
  역방향도 같다: 공격자가 먼저 회전하면 정상 클라이언트의 옛 refresh는 30초 안에서는 거부만 된다 — 탐지는 그 클라이언트가
  30초 뒤 다시 제출하거나 사용자가 재동의할 때 일어난다.
  응답 유실 후 30초가 지난 옛 토큰 재전송은 여전히 재동의가 필요하다.
- 순수 판정은 `lib/oauth/exchange.ts#planRefresh`(`REFRESH_REUSE_GRACE_MS`)다. 이력 행은 `usedAt`을 들고 와야 한다.

근거: [RFC 9700 §4.14.2](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14.2).

#### T1 실측 — ⚠️ COMPAT-RISK (2026-09-29, 스텁이 이 절의 폐기를 흉내 냈다)

⚠️ **같은 클라이언트의 프로세스 둘이 저장된 자격증명 하나를 나눠 쓰다 access 만료 뒤 refresh가 겹치면, 정상 사용으로 연결이 폐기된다.**
둘 다 재사용으로 판정되고 모든 세션이 수동 재인증으로 떨어진다. → 사용자 판정으로 위의 **재사용 유예 30초**를 더했다(2026-09-29).

| 시나리오 | Claude Code | Codex |
|---|---|---|
| 한 프로세스 안의 병렬 도구 호출(만료 직후 5개) | **직렬이다** — 401 한 번 → refresh 1회 → 나머지는 새 access. MCP HTTP 요청 자체가 ~60ms 간격으로 줄 선다 | 한 프로세스는 refresh 1회(시작 시) |
| 프로세스 둘, 겹치지 않음(7초 간격) | 둘째가 **저장소의 회전된 refresh를 다시 읽어** 보냈다 — 재사용 없음 | 측정 안 함 |
| 프로세스 둘, 겹침 | **같은 refresh를 두 번 제출 → 재사용 → 폐기.** 둘째는 `invalid_grant` 뒤 저장소의 새 refresh로 한 번 더 시도했으나 이미 폐기된 연결이었다. 겹침은 token 응답을 10초로 늘려 만들었다 | **동시에 시작한 `codex exec` 둘이 같은 refresh를 1ms 차이로 제출 → 재사용 → 폐기, 둘 다 서버를 잃었다.** 지연은 400ms(실제 RTT 수준)였다. Codex는 시작할 때 설정된 서버 전부에 붙으므로 만료 뒤 병렬로 띄우면 거의 확실히 겹친다 |
| refresh 응답 유실(회전 뒤 소켓 끊음) | **옛 refresh를 즉시 재전송 → 재사용 → 폐기** → "needs you to sign in again (run /mcp)" | 같다 — 시작 재시도가 같은 refresh를 한 번 더 보낸다 → 폐기 → 도구가 목록에서 사라진다 |
| `invalid_grant`(강제) | **자동 재동의 없음.** 도구 호출이 "run /mcp to re-authenticate"로 실패한다. `/mcp` → Authenticate로 복구 | **자동 재동의 없음.** stderr에 `AuthRequired`만 남고 에이전트는 "도구가 없다"고만 말한다. 복구는 `codex mcp login`(브라우저) |

- 재사용이 **한 프로세스 안에서는** 나오지 않았다 — 두 CLI 모두 in-process 직렬이다. 선제 refresh 연쇄(짧은 TTL)도 직렬이었다. access 1시간이면 정상 단일 세션은 안전하다.
- 위험은 **여러 세션 동시 사용**이다 — 워크트리 워커 여러 개(`/orchestrate`), 병렬 `codex exec`, 같은 머신의 두 Claude Code 창. 주기는 access 수명(1h)마다 한 번이고,
  겹침 창은 우리 `/oauth/token` 왕복 시간이다(DB 잠금 + 도쿄 리전).
- 응답 유실 뒤 옛 토큰 재전송은 두 CLI 모두 **정상 재시도**다. 정책대로면 네트워크 한 번 끊김이 재동의를 요구한다(§4.1이 이미 받아들인 대가 — 실측으로 확인만 했다).
- 재동의는 둘 다 **수동**이다. 서버가 `invalid_grant`로 끊으면 사용자가 `/mcp`(Claude Code)나 `codex mcp login`을 직접 돌려야 하고, Codex는 사용자에게 이유를 보이지 않는다.

### 4.2 동의·교환·끊기의 원자성

- Authorize는 **User → 요청 행** 순서로 잠그고 요청 만료·미소비 상태와 현재 세션·멤버십을 다시 확인한다. 같은 사용자·clientId의
  이전 미교환 code 무효화, 요청의 `consumedAt` 기록, 새 code 삽입을 같은 tx로 확정한다. 요청당 code는 `requestId @unique`로도 막는다.
  중복 제출은 새 code를 만들지 않고 이미 처리된 요청으로 표시한다. Deny는 요청을 조건부 소비하고 검증된 콜백에 `access_denied`와
  원래 state를 반환한다. Authorize와 Deny가 경합하면 먼저 소비한 한 건만 성공한다.
- 기존 연결은 **code 교환 성공 시점**에 교체한다. 교환도 User 잠금 뒤 code를 다시 검증하고, 조건부 소비·기존 연결 삭제·새 연결 삽입을
  같은 tx에서 끝낸 뒤 토큰을 응답한다. 실패 시 기존 연결을 보존한다. 새 동의가 먼저 커밋됐다면 이전 code 교환은 거부한다.
- `/mcp` 끊기와 `/oauth/revoke`는 User 잠금 뒤 대상 연결을 다시 확인하고 **연결과 같은 사용자·clientId의 미교환 code**를 같은 tx에서
  삭제한다. 대기하던 code 교환은 재읽기에서 거부되어 연결을 되살리지 못한다. 새로 동의하는 것은 별도 명시적 허용이다.
- refresh 재사용 폐기도 같은 code 무효화를 적용한다. 갱신·폐기 경로에서 두 잠금이 필요하면 **User → Connection** 순서로 통일한다.
  정상 refresh도 이 순서를 따라 연결을 재읽고 §4.1 판정을 수행한다. 현재 연결을 새 행으로 교체한 뒤 옛 해시가 들어오면 새 연결은 건드리지 않는다.

## 5. 주체·인가 — 기존 판정을 공유하고 자격증명 종류만 넓힌다

- `Subject.tokenId?: string`을 **`credential?: { kind: "api-token"; tokenHash } | { kind: "oauth"; connectionId }`**로 넓힌다. 세션·cron은 `undefined` 그대로.
  - ⚠️ 이 필드는 잠금 자리 입력의 **필수 키**다(§6.45.3) — 이름이 바뀌면 `TOKEN_SITES`·`RAW_TOKEN_SITES` AST 테스트와 모든 홉이 같이 바뀐다. 기계적 치환 커밋을 따로 뗀다.
- `lockApiToken` → `lockCredential`: kind에 따라 `ApiToken`(userId AND tokenHash) 또는 `OAuthConnection`(userId AND id)을 다시 읽고 **같은 `planLockedToken`**에 넣는다(행 모양이 `{grants, allProjects, projectIds, expiresAt}`로 같다).
  - OAuth는 **연결 id로 재읽는다, access 해시가 아니다** — 잠금 대기 중 refresh가 access를 회전해도 같은 연결의 쓰기는 정당하다. 재동의·끊기는 행 삭제라 "행 없음"이 된다(§6.45.3의 "재발급은 새 행" 성질이 그대로다).
- `resolveBearer`: 접두로 갈라 `resolveApiToken` 또는 `resolveOAuthAccess`(accessTokenHash → 연결, 발급 환경 바인딩과 `accessExpiresAt`·`expiresAt` 검사). 결과는 같은 `ApiTokenAuthority` + credential.
- `lib/onboarding-run/create.ts`의 `ApiToken.projectIds` 직접 갱신을 자격증명별로 나눈다. 고른 범위이면 **프로젝트·OWNER 멤버십 생성과
  같은 tx**에서 호출한 개인 토큰(userId + tokenHash) 또는 OAuth 연결(userId + connectionId)에 새 프로젝트 ID를 추가한다.
  전체 범위·세션은 갱신하지 않고, 다른 연결에 편입하지 않는다. OAuth에도 기존 생성 상한·인가·롤백 규칙이 그대로 적용된다.
- `lib/mcp/tools/account.ts#whoami`의 만료 조회도 종류별로 나눈다. OAuth는 userId + connectionId로 연결의 `expiresAt`을 읽는다.
  응답의 `token.expiresAt`은 **동의한 연결 수명**이며 access의 1시간 수명이 아니다. 개인 토큰 조회와 도구 응답 형식은 유지한다.
- 401은 두 종류가 **같은 본문** + 이제 `WWW-Authenticate` 헤더. ⚠️ 조회 장애는 여전히 500 `unavailable`이다(401로 접지 않는다 — §6.45.1).
- 토큰 엔드포인트 오류는 RFC 6749 §5.2 형(`invalid_grant` 등). ⚠️ DB 장애는 `server_error`(500)다 — `invalid_grant`로 접으면 클라이언트가 연결을 버리고 재로그인을 시킨다(같은 축).

## 6. 새 환경변수

**없다.** 토큰은 불투명 난수 + sha256이라 서명 키가 필요 없다. authorize 요청은 DB 행이라 `APP_SIGNING_SECRET`도 쓰지 않는다
(쓰면 그 키 회전이 진행 중 동의를 깬다 — 영향이 작아도 새 소비자를 늘리지 않는다). issuer·resource URL은 요청 origin을 `ALLOWED_HOSTS`로
거른 값(`requestOrigin`)이다 — dev·preview·prod가 각자 자기 origin을 광고한다.

- origin 허용만으로 토큰의 발급 환경을 판정하지 않는다. 검증한 origin에서 만든 issuer와 정확한 `<origin>/api/mcp` resource를
  요청 → code → 연결로 보관한다. authorize 복귀와 동의 Action도 현재 origin과 요청의 바인딩이 맞아야 진행한다.
- code 교환은 저장된 issuer/resource를 현재 엔드포인트와 대조한다. refresh는 `client_id`도 저장값과 대조하고,
  `resource`가 생략되면 기존 연결의 리소스를 유지하며 전달되면 동일한 값만 허용한다. 불일치는 회전·재사용 폐기 전에 거부한다.
- access 호출도 저장된 issuer/resource가 현재 MCP 엔드포인트와 맞아야 주체를 만든다. DB를 공유하는 로컬·preview 사이도 예외가 없다.
  `/oauth/revoke` 역시 현재 issuer와 제출한 clientId에 묶인 연결만 폐기한다. `client_id`는 공개 식별자이며 시크릿 인증을 대신하지 않는다.

## 6.1 동의·로그인·연결 목록 UI

시안은 spec "디자인 정본"의 링크다.

- 기존 `LinkDest`에 `{ kind: "oauth"; requestId }`를 추가한다. `destFromCallbackUrl`뿐 아니라 challenge 직렬화·역직렬화·성공/오류 착지,
  `/signin` 복귀 링크와 계정 연결 화면까지 같은 목적지를 보존한다. 임의 URL을 저장하지 않고 허용된 경로의 요청 ID로 복원한다.
  복귀 시 요청이 없거나 만료·소비됐으면 명시적으로 끝내고 `/projects`로 조용히 바꾸지 않는다.
- 무세션·로그인 중·만료 요청·동의 제출 중·실패를 구분하고 기존 Button 로딩·Alert·Dialog를 쓴다. 동의 실패는 입력을 보존한다.
  요청·연결 목록의 최초 조회 중과 조회 실패도 구분한다. 조회 장애는 요청 없음·연결 없음으로 숨기지 않고 재시도를 제공한다.
  `Not you?`도 요청 ID를 유지한 채 계정을 바꾸며, 새 로그인 수단 연결 challenge를 경유하는 경우까지 동일 요청으로 복귀한다.
- 이름은 신원 보증이 아니다. 동의 화면·연결 행에 clientId 식별 줄(CIMD URL, 스킴 생략)을 보조 정보로 표시한다. 동의 화면은 검증된 콜백의
  host를 행동 줄(`You'll return to …`)에 함께 보인다. **연결 행에는 콜백 주소를 싣지 않는다**(2026-09-29 사용자 판정) — clientId 식별 줄로 충분하고
  `(userId, clientId)`가 유일하며, 루프백 포트는 로그인마다 바뀌어 구별 정보가 되지 않는다. 긴 이름/주소는 줄바꿈하며
  같은 이름의 연결도 끊기 버튼의 접근 이름에서 구별한다. 임의 브랜드 이미지·색을 가져오지 않고 기존 라이트·mono 표면을 따른다.
- 연결 목록은 빈 상태와 마지막 사용 없음·만료를 구분한다. 끊기는 기존 `components/mcp/token-card.tsx`의 확인 Dialog·제출 중 표시를 따른다.
  명시적 실패는 행과 재시도 위치를 유지한다. 통신 단절의 결과 미확인은 성공으로 말하지 않고 재조회한다. 성공은 목록과 상태 메시지로 알리고,
  포커스는 다음 행의 끊기 버튼, 없으면 목록 제목으로 보낸다. 취소는 원래 버튼으로 돌아간다.

## 7. 불변식 영향

- **export 결정성·blob SHA**: 영향 없음 — 번역 흐름을 건드리지 않는다.
- **인증 경계(ARCHITECTURE §6)** — 건드린다.
  - Malmoi가 **발급자**가 된다. 표(§6)에 "OAuth access/refresh token `mlo_…`/`mlr_…`" 행을 더한다 — **GitHub 자격증명이 아니다**, 개인 토큰과 같은 Malmoi 신원이다. `credential-separation.test.ts`의 세 축은 불변.
  - `/api/mcp`·`/oauth/token`·`/oauth/register`·`/oauth/revoke`와 비쿠키 코어는 쿠키를 읽지 않는다.
    authorize 페이지·로그인·동의 및 `/mcp` 관리 Action은 세션을 읽는다. 테스트의 검사 경로도 이 경계를 따른다.
  - **권한은 매 호출 DB**(§6.45.2 ④)를 그대로 잇는다 — JWT를 쓰지 않는 이유다. 끊기·멤버 제거가 다음 호출부터 반영된다.
  - "401에서 두 CLI 모두 OAuth로 넘어가지 않는다"(§6.45.1)는 **헤더가 설정된 경우의 실측**이다 — 헤더 없는 설정의 동작은 T1이 새로 잰다. ARCHITECTURE 해당 줄을 고친다.
- **활동 사건(§5.7)**: 바뀌지 않는다 — OAuth로 한 일도 그 사용자의 사건이다(경유 표시 없음, 개인 토큰과 같은 판정).

## 8. 과거 함정 (POSTMORTEM)

- **2026-09-10 재인증 목적이 사라진 OAuth callback이 일반 가입을 실행했다** — 로그인 왕복의 "목적"을 삭제 가능한 표식에서만 찾으면 안 된다. 여기서 목적은 `?request=<id>`이고, **행이 없거나 만료면 동의 화면을 그리지 않고 오류로 끝난다** — 조용히 `/projects`로 가는 일반 로그인이 되면 안 된다. `clearAuthRoundtripCookies()` → `signIn()` 순서도 그대로 지킨다.
- **2026-09-12 OAuth 오류 화면이 초대 복귀 지점을 표시하지 않았다** — 공급자 취소 시 Auth.js는 `pages.error`(`/signin`)로 간다.
  §6.1대로 `LinkDest`의 저장·복원·challenge 왕복·착지 전체를 넓혀 authorize 복귀를 유지한다(새 쿠키 없음).
- **2026-09-06 인가는 지났는데 조회를 그 사용자로 좁히지 않았다** — 연결 목록·끊기·code 교환의 모든 조회에 `userId`(교환은 code 행이 가진 값)를 건다.
- **2026-09-16 같은 요청의 `Promise.all`이 토큰 회전을 둘로 겹쳤다** — 에이전트는 병렬로 부른다. 여기서는 우리가 발급자이므로
  외부 공급자의 회전 실패를 재시도하던 정책을 그대로 가져오지 않는다. §4.1의 연결 잠금·사용 이력·재사용 폐기를 적용하고,
  정상 클라이언트의 겹친 refresh(T1 실측)는 30초 유예로 받는다.
- **2026-09-04 시크릿이 트랜스크립트에 남았다** — OAuth 경로는 설정 조각에 비밀값 자리 자체가 없다. `/mcp`의 연결 예시에 "헤더 없는 URL만" 조각을 더한다.

## 9. 문서 갱신 (implement / push 신선도 단계)

- PRODUCT §4.1 "MCP 커넥터" — 연결 방식 둘(개인 토큰 · OAuth) · 연결별 끊기 · 계정당 하나는 **개인 토큰에만** 걸린다.
- PRODUCT §7.7 IA — `/oauth/authorize` 추가.
- ARCHITECTURE §6 표 · §6.45.1(401 · 헤더) · §6.45.2 옆 **§6.45.8 OAuth** 신설 · §8(middleware 비보호 이유).
- DIRECTORY — `lib/oauth/` · `app/oauth/` · `app/.well-known/`.
- DESIGN — 동의 화면 규칙(신규 페이지라 `/design-sync` 대상).
- `/privacy` — 새 전송처는 없고(클라이언트에 주는 것은 우리가 발급한 토큰), 새 보존 대상(연결 행)이 생긴다. 판정 후 필요하면 개정.
- 가이드 — MCP 연결 페이지(`/guide`·`/guide-shots`).
