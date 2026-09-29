# mcp-oauth — spec

MCP 클라이언트가 **토큰 복사 없이** 브라우저 로그인 + 동의만으로 `https://mal-moi.com/api/mcp`에 붙는다.
Malmoi가 MCP Authorization 스펙의 **Authorization Server + Resource Server**가 된다. 개인 토큰(`ApiToken`)은 **그대로 병행**한다
(2026-09-29 사용자 판정).

## 사용자

**개발자(나)** — 그리고 CLI를 쓰지 않는 **번역 편집자**가 claude.ai 웹 커넥터에서 붙는 경로가 처음 생긴다. 대상 클라이언트는
**Claude Code · Codex · claude.ai 웹 커넥터 셋**이다(2026-09-29 사용자 판정). 두 사용자의 요구가 여기서는 상충하지 않는다 — 둘 다 "비밀값을 다루지 않는다"를 원한다.

## 문제 (관측된 사실)

- 지금 연결은 **`/mcp`에서 발급 → 원문 복사 → 셸 환경변수 → 설정 파일에 `${MALMOI_TOKEN}` 참조**의 4단계다(`lib/mcp/snippets.ts`).
  비개발자에게 "셸 환경변수"가 막힌다.
- 설정 파일에 헤더가 있으면 Claude Code는 OAuth로 넘어가지 않고 401 본문만 보인다(ARCHITECTURE §6.45.1 실측). 즉 지금 구조로는
  **헤더를 못 붙이는 클라이언트(웹 커넥터류)가 아예 연결되지 않는다.**
- 토큰이 **계정당 하나**라 Claude Code와 Codex를 같이 쓰면 같은 원문을 두 곳에 두고, 한쪽만 끊을 수 없다.

## 완료 조건 (검증 가능한 문장)

1. 헤더 없이 URL만 등록한 **Claude Code · Codex · claude.ai 웹 커넥터**가 각각 `401` → 메타데이터 발견 → 브라우저 동의 → 도구 호출까지 간다
   (실물로 붙여 본다).
2. `POST /api/mcp`의 무인증 401에 `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource/api/mcp"`가
   실리고, 두 메타데이터 문서가 RFC 9728 · RFC 8414 형으로 응답한다(단위 테스트 + `curl`).
3. 로그인하지 않은 상태로 authorize URL을 열면 `/signin`이 아닌 **authorize 화면 자신의** GitHub·Google 버튼으로 로그인하고,
   성공하면 **같은 동의 화면으로 돌아온다.** 공급자 취소·오류 착지에서도 그 동의 화면으로 돌아갈 링크가 있다(POSTMORTEM 2026-09-12).
4. 동의 화면의 권한·범위 어휘는 `/mcp` 개인 토큰과 **같다**(`TOKEN_GRANTS` · All projects / 고른 프로젝트 · 만료 30/90/365일).
   역할보다 넓게 고를 수 없다(`planApiTokenIssue`와 같은 판정).
5. 동의 뒤 사용자는 **어떤 토큰 원문도 보지 않는다** — Malmoi는 `redirect_uri`로 code만 돌려주고, 토큰은 `/oauth/token`이 클라이언트에게만 준다.
6. PKCE `S256`가 없거나 틀린 교환, 재사용된 code, 다른 `redirect_uri`·`client_id`·`resource`의 교환은 전부 `invalid_grant`다.
7. OAuth access token으로 부른 도구의 인가 결과가 같은 grants·범위의 개인 토큰과 **같다** — 판정 코어(`planToolAccess`·잠금 뒤 재판정)를
   공유한다(테스트가 두 주체로 같은 표를 돈다).
8. `/mcp`에 **연결된 앱 목록**(클라이언트 이름 · 권한 · 범위 · 마지막 사용 · 만료)과 **연결별 끊기**가 있고, 끊은 다음 호출부터 401이다.
   개인 토큰 카드는 그대로다.
9. 연결 하나를 끊어도 다른 연결과 개인 토큰은 계속 동작한다.
10. `/api/mcp`는 여전히 **쿠키를 읽지 않는다**(`no-cookie-reads.test.ts` green). `/oauth/token`·등록 엔드포인트도 쿠키를 읽지 않는다.
11. 새 테이블이 `lib/privacy/collected.ts`에 등재되고, `/privacy` 본문이 여전히 참인지 판정이 끝났다(개정 필요하면 개정 이력 포함).

## 비목표

- **개인 토큰 대체·폐지** — 병행이다. 헤더만 받는 클라이언트와 CI가 계속 쓴다.
- **제3자 앱 생태계** — 공개 앱 디렉터리, 앱 심사, 앱별 브랜딩 설정, 클라이언트 시크릿 발급 화면은 없다. 클라이언트는 전부 public client(PKCE)다.
- **Malmoi를 로그인 공급자로 쓰기(OIDC)** — `id_token`·userinfo 없음. 이 AS가 발급하는 것은 `/api/mcp` 한 리소스의 토큰뿐이다.
- **새 권한 어휘** — OAuth `scope` 문자열로 새 권한을 만들지 않는다. 늘리는 순간 PRODUCT §4.2 "세밀한 RBAC"이다.
- **Step-up 인가**(403 `insufficient_scope`로 재동의 유도) — 지금처럼 도구 결과의 `token-scope`로 답한다. 다음 단계 후보.
- **토큰 introspection(RFC 7662)·JWT access token** — 불투명 토큰 + DB 조회다(§6.45.2 "권한은 매 호출 DB에 있다"를 그대로 잇는다).
- **로그인 공급자 추가** — 여전히 GitHub·Google 둘뿐이다(PRODUCT §4.3 ①·③ 판정 불변).
