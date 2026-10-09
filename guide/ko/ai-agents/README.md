# AI 에이전트 연결

Claude Code, Codex, claude.ai, Cursor 같은 AI 에이전트가 브라우저 로그인이나 개인 토큰으로 Malmoi에서 대신 작업하게 합니다.

시작하기 전에: Malmoi에 로그인합니다. 에이전트가 프로젝트를 만들게 하려면 먼저 [계정](../account/profile.md#github-connection)에서 GitHub를 연결하고 GitHub App을 설치합니다.

에이전트는 사용하는 사이트의 서버 주소에서 MCP(Model Context Protocol)로 연결합니다. 주소를 복사하려면 **MCP 커넥터** 페이지의 **연결된 앱** 카드에서 **서버 URL 복사**를 선택합니다. Malmoi가 직접 번역을 쓰지는 않습니다. 에이전트가 값을 쓰고, Malmoi는 브라우저와 같은 검사를 거쳐 그 값을 내가 저장한 변경 사항으로 기록합니다.

연결 방법은 두 가지입니다. Claude Code, Codex, claude.ai는 [브라우저로 로그인](browser.md#browser)할 수 있습니다. 서버 주소만 추가하고 Malmoi에서 에이전트를 승인하면 되며 토큰을 복사할 일이 없습니다. Cursor처럼 고정 헤더만 받는 에이전트는 [개인 토큰](token.md#token)을 씁니다.
