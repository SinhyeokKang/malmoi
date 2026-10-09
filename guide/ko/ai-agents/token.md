# 개인 토큰 사용

Cursor처럼 브라우저로 로그인할 수 없는 에이전트에는 개인 토큰을 씁니다.

## 토큰 만들기 {#token}

1. 사이드바에서 **MCP 커넥터**를 열고 **토큰 만들기**를 선택합니다.
2. **유효 기간**에서 30일, 90일, 365일 중 하나를 고릅니다. 모든 토큰에는 만료가 있습니다.
3. **권한**에서 에이전트가 바꿔도 되는 것을 체크합니다. 읽기 전용 토큰이라면 아무것도 체크하지 않습니다.
4. **범위**에서 **내 모든 프로젝트** 또는 **선택한 프로젝트**를 고릅니다.
5. **만들기**를 선택한 뒤 토큰을 **복사**합니다. 토큰은 한 번만 표시되니, 보관한 뒤 **닫기**를 선택합니다.

![90일을 고르고 번역·게시를 체크하고 내 모든 프로젝트를 고른 토큰 만들기 대화상자 2단계 중 1단계](/guide/mcp-create-token.webp "유효 기간, 권한, 범위를 고른 뒤 토큰을 만듭니다.")

토큰을 파일이나 채팅에 넣지 마세요. 에이전트를 시작하는 셸의 `MALMOI_TOKEN` 환경 변수에 보관합니다. 예를 들어 `read -s MALMOI_TOKEN && export MALMOI_TOKEN`을 실행한 뒤 토큰을 붙여 넣습니다. 아래 연결 조각은 그 변수를 읽으므로 토큰 자체가 설정 파일에 나타나지 않습니다.

개인 토큰은 한 번에 하나만 가질 수 있으며, 연결된 앱은 여기에 포함되지 않습니다. 허용 범위를 바꾸려면 **토큰 교체**를 선택한 뒤 **교체하고 새 토큰 보기**를 선택합니다. 이전 토큰은 즉시 동작을 멈추고, 그 토큰을 쓰던 에이전트는 새 토큰을 줄 때까지 모두 멈춥니다. **철회**는 새 토큰을 만들지 않고 토큰을 멈춥니다. 만료된 토큰에는 **만료됨**이 표시되니 새로 만드세요.

## 토큰으로 Malmoi 추가 {#connect}

아래 조각의 `SERVER_URL`을 지금 사용하는 사이트의 서버 주소로 바꿉니다. 주소를 복사하려면 **MCP 커넥터** 페이지의 **연결된 앱** 카드에서 **서버 URL 복사**를 선택합니다.

### Claude Code {#claude-code}

프로젝트 루트의 `.mcp.json`에 다음을 추가합니다.

```json title=".mcp.json"
{
  "mcpServers": {
    "malmoi": {
      "type": "http",
      "url": "SERVER_URL",
      "headers": {
        "Authorization": "Bearer ${MALMOI_TOKEN}"
      }
    }
  }
}
```

### Codex {#codex}

Codex 설정 파일에 다음을 추가합니다.

```toml title="~/.codex/config.toml"
[mcp_servers.malmoi]
url = "SERVER_URL"
bearer_token_env_var = "MALMOI_TOKEN"
```

### Cursor {#cursor}

프로젝트의 `.cursor/mcp.json`에 다음을 추가합니다.

```json title=".cursor/mcp.json"
{
  "mcpServers": {
    "malmoi": {
      "url": "SERVER_URL",
      "headers": {
        "Authorization": "Bearer ${env:MALMOI_TOKEN}"
      }
    }
  }
}
```

항목을 추가한 뒤 에이전트를 다시 시작합니다. `unauthorized`가 보고되면 토큰이 없거나, 만료되었거나, 철회된 것입니다. `MALMOI_TOKEN`을 확인하거나 토큰을 교체하세요.

## 다음 단계 {#next}

에이전트에게 Malmoi에서 작업하도록 요청합니다. 토큰이 무엇을 허용하는지는 [에이전트가 할 수 있는 일](permissions.md#permissions)을, 시작할 요청은 [프롬프트 예시](prompts.md#prompts)를 참고하세요.
