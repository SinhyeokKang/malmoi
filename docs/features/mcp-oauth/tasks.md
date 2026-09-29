# mcp-oauth — tasks

순서: 실측 → 순수 함수 → 스키마 → 껍데기 → UI. `──` 는 커밋 경계.

## T1. 클라이언트 실측 (코드 없음 · `.scratch/` 스텁 서버)
- 헤더 없는 설정으로 Claude Code · Codex · claude.ai 커넥터를 붙이고 design §0 표를 채운다.
- 결론: 등록 방식(CIMD / DCR / 둘) · refresh 병렬 동작. 대상은 셋 고정(사용자 판정).
- 검증: design.md §0·§2를 실측값으로 갱신, 확인 필요 1·2·4 종료. **셋 다 OAuth로 안 붙으면 여기서 멈춘다.**
──
## T2. 순수 함수 (`/tdd interface` → `/implement`)
- `lib/oauth/`: `parseAuthorizeRequest` · `planRedirectUri` · `verifyPkce` · `planCodeExchange` · `planRefresh` · `resolveBearerKind` ·
  메타데이터 빌더 · `wwwAuthenticate` · (CIMD면) `planClientMetadata`. `planConsent`는 `planApiTokenIssue` 재사용.
- 검증: `pnpm test` green. RFC 7636 부록 B의 PKCE 벡터 · loopback 포트 예외 · `__proto__` 쿼리 키 · 만료 경계(`<=`) 포함.
──
## T3. `Subject.tokenId` → `credential` 기계적 치환
- 모든 홉 + `lockApiToken` → `lockCredential`(OAuth 분기는 아직 `unauthorized`만). 동작 변화 0.
- 검증: `pnpm typecheck` · `pnpm test`(`locked-access.test.ts`의 `TOKEN_SITES`·`RAW_TOKEN_SITES` 갱신 포함) · `pnpm test:projects:postgres`.
──
## T4. 스키마 (`/db`)
- `OAuthConnection` · `OAuthAuthorizationRequest` · `OAuthCode` (+ DCR이면 `OAuthClient`). additive, `--create-only`로 SQL 확인.
- `lib/privacy/collected.ts` 등재.
- 검증: `pnpm db:status` 적용됨 · dev `has_schema_privilege = false` · typecheck green.
──
## T5. 리소스 서버 쪽
- `/.well-known/oauth-protected-resource/api/mcp` · `/.well-known/oauth-authorization-server` route.
- `/api/mcp` 401에 `WWW-Authenticate` · `resolveBearer`(접두 분기) · `resolveOAuthAccess` · `lockCredential` OAuth 분기.
- 검증: `pnpm test`(두 주체로 같은 인가 표를 도는 테스트 — spec 7) · `no-cookie-reads` green · `curl`로 두 문서와 401 헤더 확인 · `pnpm test:projects:postgres`.
──
## T6. 인가 서버 쪽
- `/oauth/token`(authorization_code · refresh_token, 조건부 UPDATE 소비·회전) · `/oauth/revoke` · (DCR이면) `/oauth/register`(상한 포함) · (CIMD면) 문서 가져오기(SSRF 방어).
- 검증: `pnpm test` — code 재사용·다른 `redirect_uri`·틀린 verifier·만료가 전부 `invalid_grant` · 병렬 refresh 2건 경합 · DB 장애는 `server_error`.
──
## T7. 동의 화면 + 로그인 왕복 (`/design-sync` — 신규 페이지, Claude Design 핸드오프 선행)
- `app/oauth/authorize/page.tsx` — 검증 → 요청 행 저장 → `?request=` 정규화 → 무세션이면 공급자 버튼(`clearAuthRoundtripCookies` → `signIn`, `redirectTo` = 그 URL) → 동의 폼.
- Authorize/Deny Server Action · `destFromCallbackUrl`이 authorize 복귀를 인정 · "Signed in as … · Not you?".
- 문구는 `messages/en.tsx`.
- 검증: DOM 테스트(무세션·만료 요청·역할보다 넓은 선택 거부) · `normal-login.test.tsx` green · ego-browser로 로그인 → 동의 → loopback 콜백까지 로컬 실물(공급자 취소 착지에서 복귀 링크 포함).
──
## T8. `/mcp` 연결된 앱
- 연결 목록 · 끊기 Action(`userId`로 좁힘) · 연결 예시에 "URL만" 조각 추가(`lib/mcp/snippets.ts`).
- 검증: DOM 테스트 · 끊은 연결의 다음 호출 401 · 다른 연결·개인 토큰 동작 유지(spec 8·9).
──
## T9. 문서 (design §9) — 문서별 커밋
- 검증: `pnpm sync:agents:check` · `/privacy` 판정 기록 · `policy-gate.test.tsx` green(본문을 고쳤다면).
──
## T10. 실물 왕복 (preview — `dev.mal-moi.com`)
- Claude Code · Codex · claude.ai 웹 커넥터 셋으로 URL 등록 → 동의 → 읽기·쓰기 도구 각 1회 → `/mcp`에서 끊기 → 401.
- 검증: spec 완료 조건 1·5·8 실물 확인. `malmoi-sync-dev` 설치 왕복이 필요한 도구는 preview에서만 본다.
- ⚠️ preview는 Vercel SSO 뒤라 claude.ai 서버가 못 닿는다 — claude.ai는 SSO 우회(Protection Bypass) 또는 프로덕션 확인으로 본다. 방법은 T1에서 정한다.
