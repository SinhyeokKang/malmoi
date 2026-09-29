import { describe, expect, it } from "vitest";

import { CLIENT_NAME_MAX, clientIdLabel, planClientMetadata } from "../client-metadata";

/**
 * CIMD 문서 검증 (mcp-oauth design §2 "T1 판정"). 가져오기·SSRF 방어는 호출자(T6)의 몫이고, 여기는 **가져온 JSON**만 본다.
 * 문서의 키는 전부 남이 정한 것이다 — `Object.hasOwn`으로만 읽는다.
 */
const CLAUDE_CODE = "https://claude.ai/oauth/claude-code-client-metadata";
const CODEX = "https://chatgpt.com/oauth/codex/abc123/client.json";

describe("planClientMetadata — 실측 모양 (design §0.1)", () => {
  it("Claude Code: client_name이 있으면 표시 이름이 그것이다", () => {
    const doc = { client_id: CLAUDE_CODE, client_name: "Claude Code", redirect_uris: ["http://localhost/callback", "http://127.0.0.1/callback"] };
    expect(planClientMetadata(doc, CLAUDE_CODE)).toEqual({
      ok: true,
      client: { clientId: CLAUDE_CODE, clientName: "Claude Code", displayName: "Claude Code", redirectUris: ["http://localhost/callback", "http://127.0.0.1/callback"] },
    });
  });

  it("Codex: client_name이 없으면 표시 이름은 clientId URL이고 원래 이름은 null이다", () => {
    const doc = { client_id: CODEX, redirect_uris: ["http://127.0.0.1/callback/abc123", "http://localhost/callback/abc123"] };
    expect(planClientMetadata(doc, CODEX)).toMatchObject({ ok: true, client: { clientName: null, displayName: CODEX } });
  });

  it("빈·공백 client_name·문자열이 아닌 client_name은 없는 것으로 본다", () => {
    for (const name of ["", "   ", 42, null, ["Claude"]]) {
      const doc = { client_id: CODEX, client_name: name, redirect_uris: ["http://127.0.0.1/cb"] };
      expect(planClientMetadata(doc, CODEX)).toMatchObject({ ok: true, client: { clientName: null, displayName: CODEX } });
    }
  });

  it("모르는 필드는 무시한다", () => {
    const doc = { client_id: CODEX, redirect_uris: ["http://127.0.0.1/cb"], application_type: "native", logo_uri: "https://x/y.png" };
    expect(planClientMetadata(doc, CODEX)).toMatchObject({ ok: true });
  });
});

describe("planClientMetadata — client_id 대조", () => {
  const doc = (clientId: unknown) => ({ client_id: clientId, redirect_uris: ["http://127.0.0.1/cb"] });

  it("문서의 client_id가 URL과 정확히 같아야 한다", () => {
    expect(planClientMetadata(doc(`${CODEX}/`), CODEX)).toEqual({ ok: false });
    expect(planClientMetadata(doc(CODEX.toUpperCase()), CODEX)).toEqual({ ok: false });
    expect(planClientMetadata(doc(undefined), CODEX)).toEqual({ ok: false });
    expect(planClientMetadata({ redirect_uris: ["http://127.0.0.1/cb"] }, CODEX)).toEqual({ ok: false });
  });

  it("clientId URL은 HTTPS여야 한다", () => {
    const http = "http://chatgpt.com/oauth/codex/abc123/client.json";
    expect(planClientMetadata(doc(http), http)).toEqual({ ok: false });
  });

  it("clientId URL에 경로가 있어야 하고, fragment·userinfo·query가 없어야 한다", () => {
    for (const id of ["https://chatgpt.com", "https://chatgpt.com/", `${CODEX}#x`, "https://user@chatgpt.com/client.json", "https://a.example/c?x=1", "https://a.example/c?"]) {
      expect(planClientMetadata(doc(id), id)).toEqual({ ok: false });
    }
  });

  it("기본이 아닌 포트의 clientId URL은 거부한다 — 가져오기가 임의 포트의 내부 서비스를 두드리지 않는다", () => {
    for (const id of ["https://chatgpt.com:8443/client.json", "https://chatgpt.com:22/client.json"]) {
      expect(planClientMetadata(doc(id), id)).toEqual({ ok: false });
    }
  });

  it("정규화로만 같아지는 clientId URL(점 세그먼트·대문자 호스트)은 거부한다", () => {
    for (const id of ["https://chatgpt.com/oauth/../client.json", "https://ChatGPT.com/client.json", "not a url"]) {
      expect(planClientMetadata(doc(id), id)).toEqual({ ok: false });
    }
  });
});

describe("planClientMetadata — redirect_uris", () => {
  const doc = (uris: unknown) => ({ client_id: CODEX, redirect_uris: uris });

  it("비었거나 배열이 아니거나 문자열이 아닌 원소가 있으면 거부한다", () => {
    for (const uris of [[], "http://127.0.0.1/cb", undefined, null, ["http://127.0.0.1/cb", 1], [{}]]) {
      expect(planClientMetadata(doc(uris), CODEX)).toEqual({ ok: false });
    }
  });

  it("https와 loopback http(127.0.0.1·[::1]·localhost)만 받는다", () => {
    const ok = ["https://claude.ai/api/mcp/auth_callback", "http://127.0.0.1/cb", "http://[::1]/cb", "http://localhost/callback"];
    expect(planClientMetadata(doc(ok), CODEX)).toMatchObject({ ok: true, client: { redirectUris: ok } });
  });

  it.each([
    "javascript:alert(document.cookie)//",
    "data:text/html,<script>alert(1)</script>",
    "http://evil.example/cb",
    "app://cb",
    "http://localhost.evil.example/cb",
    "http://user@127.0.0.1/cb",
  ])("%s가 하나라도 있으면 거부한다 — 동의 뒤 우리 origin에서 실행되거나 평문으로 code가 나간다", bad => {
    expect(planClientMetadata(doc(["http://127.0.0.1/cb", bad]), CODEX)).toEqual({ ok: false });
  });

  it("URL로 못 읽는 원소가 있으면 거부한다", () => {
    expect(planClientMetadata(doc(["http://127.0.0.1/cb", "not a url"]), CODEX)).toEqual({ ok: false });
  });
});

describe("planClientMetadata — 문서 모양·남이 정한 키 (POSTMORTEM 2026-09-08 · 09-14)", () => {
  it("객체가 아닌 문서는 거부한다", () => {
    for (const d of [null, "x", 1, [], undefined]) expect(planClientMetadata(d, CODEX)).toEqual({ ok: false });
  });

  it("프로토타입에서 찾아지는 필드는 읽지 않는다", () => {
    const proto = { client_id: CODEX, redirect_uris: ["http://127.0.0.1/cb"], client_name: "Evil" };
    expect(planClientMetadata(Object.create(proto), CODEX)).toEqual({ ok: false });
    const partial = Object.assign(Object.create({ client_name: "Evil" }) as Record<string, unknown>, { client_id: CODEX, redirect_uris: ["http://127.0.0.1/cb"] });
    expect(planClientMetadata(partial, CODEX)).toMatchObject({ ok: true, client: { clientName: null } });
  });

  it("own property `__proto__` 키가 있는 리터럴 JSON도 판정이 흔들리지 않는다", () => {
    const parsed: unknown = JSON.parse(`{"__proto__":{"client_name":"Evil"},"client_id":"${CODEX}","redirect_uris":["http://127.0.0.1/cb"]}`);
    expect(planClientMetadata(parsed, CODEX)).toMatchObject({ ok: true, client: { clientName: null } });
  });
});

/**
 * 화면 표시 (mcp-oauth 핸드오프 §7.2 · §13 결정 3). 이름 길이의 상한은 서버가 둔다 — 넘으면 이름이 없는 것으로 보고 clientId URL을 보인다
 * (잘라서 보이면 사칭 이름의 구별되는 끝이 사라진다). 식별 줄은 동의 화면·연결 목록이 같은 문자열을 쓴다.
 */
describe("표시 — 이름 상한 · 식별 줄", () => {
  it(`client_name이 ${CLIENT_NAME_MAX}자를 넘으면 없는 것으로 본다 — 경계는 통과`, () => {
    const at = { client_id: CODEX, client_name: "a".repeat(CLIENT_NAME_MAX), redirect_uris: ["http://127.0.0.1/cb"] };
    expect(planClientMetadata(at, CODEX)).toMatchObject({ ok: true, client: { clientName: "a".repeat(CLIENT_NAME_MAX) } });
    const over = { ...at, client_name: "a".repeat(CLIENT_NAME_MAX + 1) };
    expect(planClientMetadata(over, CODEX)).toMatchObject({ ok: true, client: { clientName: null, displayName: CODEX } });
  });

  it("식별 줄은 clientId URL에서 https://만 뗀 값이다", () => {
    expect(clientIdLabel(CLAUDE_CODE)).toBe("claude.ai/oauth/claude-code-client-metadata");
    expect(clientIdLabel(CODEX)).toBe("chatgpt.com/oauth/codex/abc123/client.json");
    // URL이 아닌 식별자(저장 값이 CIMD가 아닐 때)는 그대로 보인다 — 감추지 않는다.
    expect(clientIdLabel("7c1e0f52")).toBe("7c1e0f52");
  });
});
