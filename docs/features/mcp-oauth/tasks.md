# mcp-oauth — tasks

순서: 실측 → 순수 함수 → 스키마 → 껍데기 → UI. `──` 는 커밋 경계.
아래 명령은 구현 시 검증 계획이다. feature-review는 문서만 수정하며 테스트·마이그레이션·배포를 실행하지 않는다.

## T1. 클라이언트 실측 (코드 없음 · `.scratch/` 스텁 서버)
- 헤더 없는 설정으로 Claude Code · Codex · claude.ai 커넥터를 붙이고 design §0 표를 채운다.
- 결론: 등록 방식(CIMD / DCR / 둘) · refresh 병렬 동작. (결론은 아래 "결정 기록") 대상은 셋 고정(사용자 판정).
- refresh 실측은 직렬화·같은 토큰 병렬 제출·응답 유실 후 재시도·재동의까지 포함한다. design §4.1의 재사용 폐기 정책으로
  정상 연결이 반복해서 끊기면 구현 전에 호환성 실패로 보고한다. 재사용 탐지·폐기는 실측만으로 생략하지 않는다.
- 검증: design.md §0·§2·§4.1에 등록 방식·loopback 호환·refresh 경합/재동의·claude.ai 확인 환경을 실측 근거와 함께 기록한다.
  **셋 중 하나라도 OAuth로 안 붙으면 구현 착수를 멈추고 보고한다.**
──
## T2. 순수 함수 (`/tdd interface` → `/implement`)
- `lib/oauth/`: `parseAuthorizeRequest` · `planRedirectUri` · `verifyPkce` · `planCodeExchange` · `planRefresh` · `resolveBearerKind` ·
  메타데이터 빌더 · `wwwAuthenticate` · (CIMD면) `planClientMetadata`. `planConsent`는 `planApiTokenIssue` 재사용.
- 검증: `pnpm test` green. RFC 7636 부록 B의 PKCE 벡터 · IPv4/IPv6 loopback 포트 예외 · `localhost` 별도 정책 ·
  `__proto__` 쿼리 키 · 만료 경계(`<=`) 포함. 권한 선택은 기존 발급 규칙, 실제 호출 권한은 현재 역할 ∩ grant로 판정한다.
- refresh 판정 검증: 현재 해시는 회전, 사용 이력의 해시는 회전 뒤 30초 이내면 쓰기 없이 거부·그 밖은 해당 연결 폐기, 알 수 없는 해시·없는/만료 연결은 발급 없이 거부.
- code 판정 검증: 발급 스냅샷만으로 PKCE·클라이언트·리다이렉트·리소스를 대조한다. 요청 TTL이 지난 시각에도 code가 유효하면
  통과하고, code의 `expiresAt <= now` 또는 사용됨이면 `invalid_grant`다.
- 바인딩 검증: 다른 clientId의 refresh, 다른 issuer/resource의 code·refresh·access를 거부한다.
  refresh의 resource 생략은 기존 값을 유지하고, 명시된 다른 resource는 회전·폐기 없이 거부한다.
──
## T3. `Subject.tokenId` → `credential` 기계적 치환
- 모든 홉 + `lockApiToken` → `lockCredential`(OAuth 분기는 아직 `unauthorized`만). 동작 변화 0.
- 직접 소비자인 `lib/onboarding-run/create.ts`의 범위 추가와 `lib/mcp/tools/account.ts#whoami`의 만료 조회도 개인 토큰 분기를
  유지하도록 치환한다. OAuth 동작은 T5에서 추가한다.
- 검증: `pnpm typecheck` · `pnpm test`(`locked-access.test.ts`의 `TOKEN_SITES`·`RAW_TOKEN_SITES` 갱신 포함) · `pnpm test:projects:postgres`.
──
## T4. 스키마 (`/db`)
- `OAuthConnection` · `OAuthRefreshHistory` · `OAuthAuthorizationRequest` · `OAuthCode` (+ DCR이면 `OAuthClient`). additive, `--create-only`로 SQL 확인.
- `lib/privacy/collected.ts` 등재.
- 검증: `pnpm db:status` 적용됨 · dev `has_schema_privilege = false` · typecheck green.
──
## T5. 리소스 서버 쪽
- `/.well-known/oauth-protected-resource/api/mcp` · `/.well-known/oauth-authorization-server` route.
- `/api/mcp` 401에 `WWW-Authenticate` · `resolveBearer`(접두 분기) · `resolveOAuthAccess` · `lockCredential` OAuth 분기.
- OAuth access의 issuer/resource를 현재 엔드포인트와 대조한다. 프로젝트 생성 tx의 고른 범위 추가와 `whoami`의 만료 조회에
  OAuth 연결 분기를 추가한다(design §5). `whoami`는 연결 만료를 반환한다.
- `no-cookie-reads.test.ts`의 MCP 검사와 별도로 `/oauth/token`·`/oauth/register`·`/oauth/revoke` 및 비쿠키 코어 경로를 검사한다.
  세션이 필요한 authorize 페이지·로그인·동의·목록 관리 Action은 검사에서 구분한다. 경로 분류와 실제 검사 대상 파일 존재도 확인한다.
- 검증: `pnpm test`(두 주체의 같은 인가 표·whoami 만료·다른 origin access 거부·확장된 비쿠키 검사) ·
  `curl`로 두 문서와 401 헤더 확인 · `pnpm test:projects:postgres`.
- PostgreSQL 회귀는 기존 수집 경로 `lib/mcp/__tests__/*.integration.ts`에 추가한다. 선택 범위 OAuth로 생성 → 즉시 조회·편집 성공,
  다른 연결에는 새 프로젝트가 편입되지 않음, 생성 실패 시 범위 추가도 롤백됨을 검증한다. 잠금 대기 중 폐기·재동의는 쓰기 0건,
  정상 refresh는 같은 연결의 대기 쓰기를 허용하는지 개인 토큰 회귀와 함께 확인한다.
──
## T6. 인가 서버 쪽
- `/oauth/token`(authorization_code의 조건부 소비 · design §4.1의 연결 잠금 뒤 refresh 이력 저장·회전·재사용 폐기) · `/oauth/revoke` · (DCR이면) `/oauth/register`(상한 포함) · (CIMD면) 문서 가져오기(SSRF 방어).
- code 교환은 `OAuthCode`의 발급 스냅샷으로 검증·연결 생성을 끝내며, 원래 요청 행의 존재에 의존하지 않는다.
  design §4.2의 User 잠금 뒤 code 소비·기존 연결 삭제·새 연결 삽입을 같은 tx로 확정한다.
- refresh는 clientId·issuer/resource를 검증한 뒤 회전/재사용을 판정한다. 폐기 경로는 미교환 code도 같은 tx에서 무효화한다.
  §4.2의 잠금 순서를 따르고, 다른 origin/clientId 요청은 연결을 변경하지 않는다.
- 검증: `pnpm test` — code 재사용·다른 `redirect_uri`·틀린 verifier·만료가 전부 `invalid_grant` · refresh 재사용은 유예 안이면 쓰기 없이, 유예 밖이면 폐기 커밋 뒤 `invalid_grant` · DB 장애는 `server_error`.
- 실 PostgreSQL 검증: `lib/mcp/__tests__/oauth-refresh.integration.ts`를 기존 수집 경로에 두고 `pnpm test:projects:postgres`로 실행한다.
  같은 refresh 두 건의 회전 성공은 최대 한 건이며 30초 유예 안의 뒤 요청은 연결을 건드리지 않고 `invalid_grant`만 받는지(첫 응답의 토큰은 계속 유효),
  유예를 넘긴 재제출과 여러 번 회전한 옛 해시는 해당 연결을 폐기하고 현재 access·refresh가 모두 거부되는지, 다른 연결·개인 토큰은 유지되는지 확인한다. 이력 삽입·해시 교체 중 실패는
  함께 롤백되고, 폐기 쓰기 실패는 `invalid_grant`로 숨기지 않는 것도 검증한다.
- 요청 정리 회귀 검증(T7의 실제 발급 경로 연결 후 완료): `lib/mcp/__tests__/oauth-code.integration.ts`를
  `pnpm test:projects:postgres`로 실행한다. 요청 만료 직전에 code 발급 → 요청 만료 후 실제 정리로 삭제 → code 만료 전 교환 성공,
  code 만료 경계의 거부를 각각 확인한다. 삭제 후에도 잘못된 verifier·clientId·redirectUri·resource·issuer는 거부한다.
- 같은 PostgreSQL 회귀에서 code 동시 교환은 한 건만 성공, 교체 실패는 기존 연결 유지, 새 동의 후 옛 code 거부,
  끊기 후 미교환 code 거부를 검증한다. 서로 다른 origin이 같은 DB를 보게 해 code·refresh·access가 교차 승인되지 않는지도 확인한다.
──
## T7. 동의 화면 + 로그인 왕복 (`/design-sync` — 신규 페이지, Claude Design 핸드오프 선행)
- 디자인 정본은 spec "디자인 정본"의 Claude Design 핸드오프(`design_handoff_mcp_oauth/`)다. `/design-sync`가 그것을 SoT로 대조한다.
- `app/oauth/authorize/page.tsx` — 검증 → 요청 행 저장 → `?request=` 정규화 → 무세션이면 공급자 버튼(`clearAuthRoundtripCookies` → `signIn`, `redirectTo` = 그 URL) → 동의 폼.
- Authorize/Deny Server Action은 design §4.2의 요청 소비를 따른다. `LinkDest`에 oauth requestId를 더하고 `destFromCallbackUrl`·
  challenge 직렬화/역직렬화·성공/오류 착지·`/signin` 복귀 링크를 함께 확장한다. "Signed in as … · Not you?"도 요청을 유지한다.
- Authorize는 유효한 요청 행의 검증 필드와 동의 결과를 `OAuthCode`에 복사하고 발급 시점 + 60초를 설정한다.
  검증: 요청 자체가 이미 만료됐으면 code를 발급하지 않으며, T6의 요청 정리 회귀를 실제 발급 경로로 통과시킨다.
- 문구는 `messages/en.tsx`.
- 검증: DOM 테스트(무세션·없는/만료/소비 요청·범위 입력 오류·제출 중·실패 시 입력 유지·임의 clientName/긴 주소)와
  login-link 순수 함수 회귀. `normal-login.test.tsx`에 authorize 로그인 진입점을 추가해 쿠키 정리 후 signIn 순서와 redirectTo를 검사한다.
  PostgreSQL에서는 Authorize 중복과 Authorize/Deny 경합 시 요청 소비·code 발급이 최대 한 번임을 확인한다.
- 수동 검증: ego-browser로 로그인 → 동의 → loopback 콜백, 공급자 취소 후 복귀, 기존 이메일의 새 공급자 연결 challenge 후
  동일 요청 복귀, Not you? 계정 전환, 왕복 중 요청 만료를 확인한다. 단위 테스트 green을 공급자 왕복 검증으로 대신하지 않는다.
- 조회 상태 검증: 요청의 조회 중·조회 실패·없음을 구분하고 실패 시 재시도를 제공한다.
──
## T8. `/mcp` 연결된 앱
- 연결 목록 · 끊기 Action(`userId`로 좁힘) · 연결 예시에 "URL만" 조각 추가(`lib/mcp/snippets.ts`).
- 클라이언트 식별 보조 정보·빈 상태·마지막 사용 없음·만료를 표시한다. 기존 token-card의 확인 Dialog·제출 중·실패/결과 미확인
  패턴을 재사용하고 삭제 후 다음 행 또는 목록 제목으로 포커스를 옮긴다. 끊기 tx는 design §4.2를 따른다.
- 검증: DOM 테스트(같은 이름 두 연결의 접근 이름 구별·긴 텍스트·확인 취소·실패 시 행 유지·결과 미확인·삭제 후 포커스) ·
  끊은 연결의 다음 호출 401 · 다른 연결·개인 토큰 동작 유지(spec 8·9). 키보드·실제 Dialog 포커스도 수동 확인한다.
- 목록 조회 상태 검증: 최초 조회 중·조회 실패·빈 목록을 구분하고, 장애를 연결 없음으로 표시하지 않는다.
──
## T9. 문서 (design §9) — 문서별 커밋
- 검증: `pnpm sync:agents:check` · `/privacy` 판정 기록 · `policy-gate.test.tsx` green(본문을 고쳤다면).
──
## T10. 실물 왕복 (preview — `dev.mal-moi.com`)
- Claude Code · Codex · claude.ai 웹 커넥터 셋으로 URL 등록 → 동의 → 읽기·쓰기 도구 각 1회 → `/mcp`에서 끊기 → 401.
- 검증: spec 완료 조건 1·5·8 실물 확인. `malmoi-sync-dev` 설치 왕복이 필요한 도구는 preview에서만 본다.
- ⚠️ preview는 Vercel SSO 뒤라 claude.ai 서버가 못 닿는다 — claude.ai는 SSO 우회(Protection Bypass) 또는 프로덕션 확인으로 본다. 방법은 T1에서 정한다.
- 배포 순서: **dev 스키마 적용·권한 확인 → Claude Code `/push` → preview 검증 → prod `pnpm db:deploy`·상태·권한 확인 →
  Claude Code `/merge` → prod 검증**. prod 스키마 적용은 `/merge`의 선행 게이트이며 dev 적용으로 대신하지 않는다.
  claude.ai 확인을 prod로 남겼다면 preview에서 세 클라이언트 검증 완료로 기록하지 않고, prod 확인 전 spec 1을 미완으로 둔다.

## 결정 기록 (orchestrate 인테이크, 2026-09-29)

- 배치: **m1-measure**(T1) ∥ **m2-core**(T3 → T2) → **m3-server**(T4·T5·T6) → **m4-ui**(T7·T8·T9) → QA(T7 수동 왕복 · T10).
  m2의 등록 방식 의존 조각(`planClientMetadata` 또는 DCR 판정)만 m1 결론을 기다린다.
- T1 claude.ai 실측: `cloudflared` quick tunnel로 `.scratch/` 스텁을 공개한다. 실측용 커넥터는 끝나면 claude.ai에서 지운다.
- T7 `/design-sync`: m4는 워크트리에서 DOM 테스트까지 구현 → 지휘자가 dev에 로컬 통합(push 전) → 같은 워커가 main 체크아웃에서
  `/design-sync` 루프로 마무리한다(워크트리엔 `.env.local`이 없다).
- T1 결론(Claude Code·Codex, claude.ai 미측정): 등록은 **CIMD**, DCR은 claude.ai 실측 뒤. loopback 포트 예외에 literal `localhost`를 넣는다(교차 host 없음).
- refresh 재사용 정책(T1 COMPAT-RISK에 대한 사용자 판정): **30초 유예 창.** 회전 뒤 30초 안(`now - usedAt <= 30s`)에 다시 온 옛 refresh는
  폐기·회전 없이 `invalid_grant`만 답하고, 창 밖 재제출은 기존대로 그 연결을 폐기한다. 근거: 두 CLI 모두 프로세스 간 refresh가 겹쳐 정상 사용으로
  연결이 폐기됐고(Codex 병렬 시작 1ms 차), Claude Code는 `invalid_grant` 뒤 저장소의 새 refresh로 재시도한다. 대가: 회전 직후 30초 안의 탈취 refresh 사용은 탐지하지 않는다.
- CIMD 입력 경계(m2 리뷰, 보수 기본값): 문서의 `redirect_uris`는 `https:` 전부와 loopback host(`127.0.0.1`·`[::1]`·`localhost`)의 `http:`만 받는다
  (`javascript:`·`data:`·원격 `http:` 거부 — 동의 뒤 되돌려 보내는 주소라 XSS·open redirect 경로다). `client_id` URL의 query는 거부한다(CIMD 초안 SHOULD NOT).
  커스텀 scheme 클라이언트가 관측되면 그때 넓힌다.
- 무인증 authorize 남용(m3 리뷰): **Vercel WAF rate limit**을 `/oauth/authorize`에 IP 단위로 건다 — log 모드로 시작해 실트래픽을 보고 429로 올린다
  (이미지 프록시 WAF 선례). 코드·작업 큐 없음. 규칙 추가는 `/merge` 전 프로덕션 프로젝트에서 하고 OPERATIONS에 절차를 남긴다(T9).
