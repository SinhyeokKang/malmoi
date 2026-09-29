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
   기존 이메일에 새 로그인 수단을 붙이는 challenge를 거쳐도 같은 요청으로 돌아온다. 복귀 시 요청이 만료됐으면 명시적으로 끝낸다.
4. 동의 화면의 권한·범위 어휘는 `/mcp` 개인 토큰과 **같다**(`TOKEN_GRANTS` · All projects / 고른 프로젝트 · 만료 30/90/365일).
   선택은 `planApiTokenIssue`와 같은 grant 어휘·프로젝트 멤버십 판정을 따른다. 실행 권한은 매 호출 **현재 역할 ∩ grant**로 제한한다.
5. 동의 뒤 사용자는 **어떤 토큰 원문도 보지 않는다** — Malmoi는 `redirect_uri`로 code만 돌려주고, 토큰은 `/oauth/token`이 클라이언트에게만 준다.
6. PKCE `S256`가 없거나 틀린 교환, 재사용된 code, 다른 `redirect_uri`·`client_id`·`resource`의 교환은 전부 `invalid_grant`다.
   만료 전 요청에서 발급한 code는 요청 행이 만료·삭제돼도 발급 시점부터 60초 동안 교환할 수 있다. code 자체의 만료·일회 사용과
   교환 바인딩 검사는 그대로 적용한다.
7. OAuth access token으로 부른 도구의 인가 결과가 같은 grants·범위의 개인 토큰과 **같다** — 판정 코어(`planToolAccess`·잠금 뒤 재판정)를
   공유한다(테스트가 두 주체로 같은 표를 돈다).
   고른 프로젝트 범위의 연결로 프로젝트를 만들면 생성과 같은 트랜잭션에서 그 연결의 범위에 편입되어 즉시 조회·편집할 수 있다.
8. `/mcp`에 **연결된 앱 목록**(클라이언트 이름 · 권한 · 범위 · 마지막 사용 · 만료)과 **연결별 끊기**가 있고, 끊은 다음 호출부터 401이다.
   동의 화면과 목록에는 클라이언트 식별 정보도 표시해 같은 이름의 연결을 구별한다. 끊기는 확인·실패·결과 미확인·삭제 후 포커스까지
   기존 개인 토큰 폐기 패턴을 따른다. 개인 토큰 카드는 그대로다.
9. 연결 하나를 끊어도 다른 연결과 개인 토큰은 계속 동작한다.
10. `/api/mcp`는 여전히 **쿠키를 읽지 않는다**. `/oauth/token`·등록·폐기 엔드포인트와 그 비쿠키 코어도 검사 대상에 추가한다.
    쿠키를 읽어야 하는 authorize 페이지·로그인·동의 Action은 이 금지 대상과 구분한다.
11. 새 테이블이 `lib/privacy/collected.ts`에 등재되고, `/privacy` 본문이 여전히 참인지 판정이 끝났다(개정 필요하면 개정 이력 포함).
12. refresh 회전은 사용된 해시와 연결의 관계를 보존한다. 회전 전 토큰이 다시 제출되면 해당 연결을 폐기하고 `invalid_grant`로 답한다.
    그 연결의 현재 access·refresh도 다음 호출부터 거부하며, 다른 연결과 개인 토큰은 유지한다. 단 **회전 뒤 30초 안(경계 포함)**에
    같은 연결의 옛 refresh가 다시 오면 폐기·회전 없이 `invalid_grant`만 답한다 — 같은 클라이언트의 프로세스 둘이 겹쳐 refresh하는
    정상 동작(T1 실측)이 재동의를 강요하지 않게 한다(2026-09-29 사용자 판정). 대가: 회전 직후 30초 안에 쓰인 탈취 refresh는 탐지하지 못한다.
13. code·연결은 발급 issuer와 MCP resource에 묶인다. 다른 origin의 토큰 교환·refresh·access 호출은 거부하며,
    다른 `client_id`의 refresh도 거부한다. 로컬·preview가 DB를 공유해도 이 경계는 유지된다.
14. 동의 요청 하나에서 code는 최대 하나만 발급된다. 연결 교체는 유효 code 교환의 원자적 커밋 시점이며,
    새 동의는 이전 미교환 code를 무효화한다. 연결을 끊으면 해당 연결의 미교환 code도 무효화해 뒤늦은 교환으로 되살리지 못한다.

## 디자인 정본

시안: https://claude.ai/design/p/b99d54cd-3034-44f1-8446-0a864da9d767?file=MCP+OAuth.dc.html
(프로젝트 `b99d54cd-3034-44f1-8446-0a864da9d767`, 핸드오프 `design_handoff_mcp_oauth/` — `/oauth/authorize` 신규 · `/mcp` 변경).
2026-09-29 2차 피드백까지 반영해 확정했다. 샘플로 남은 자리(핸드오프 §10.2)는 T1 실측으로 채운다.

## 비목표

- **개인 토큰 대체·폐지** — 병행이다. 헤더만 받는 클라이언트와 CI가 계속 쓴다.
- **제3자 앱 생태계** — 공개 앱 디렉터리, 앱 심사, 앱별 브랜딩 설정, 클라이언트 시크릿 발급 화면은 없다. 클라이언트는 전부 public client(PKCE)다.
- **Malmoi를 로그인 공급자로 쓰기(OIDC)** — `id_token`·userinfo 없음. 이 AS가 발급하는 것은 `/api/mcp` 한 리소스의 토큰뿐이다.
- **새 권한 어휘** — OAuth `scope` 문자열로 새 권한을 만들지 않는다. 늘리는 순간 PRODUCT §4.2 "세밀한 RBAC"이다.
- **Step-up 인가**(403 `insufficient_scope`로 재동의 유도) — 지금처럼 도구 결과의 `token-scope`로 답한다. 다음 단계 후보.
- **토큰 introspection(RFC 7662)·JWT access token** — 불투명 토큰 + DB 조회다(§6.45.2 "권한은 매 호출 DB에 있다"를 그대로 잇는다).
- **로그인 공급자 추가** — 여전히 GitHub·Google 둘뿐이다(PRODUCT §4.3 ①·③ 판정 불변).
