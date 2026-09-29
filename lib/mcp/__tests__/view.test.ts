import { describe, expect, it } from "vitest";

import { planConnectedApps, planTokenCard } from "../view";

/**
 * `/mcp` 토큰 카드의 판정 (핸드오프 `1a`·`1b`·`1c` · README §10-3). 화면이 쓰는 범위는 **현재 멤버십(보관 제외)과 교집합한** 값이다 —
 * 발급 뒤 멤버에서 빠진 id는 판정에서 효과가 없으므로 개수에도 안 든다. 만료 경계는 인증과 같은 `expiresAt <= now`다.
 */

const now = new Date("2026-09-28T12:00:00.000Z");
const row = (over: Partial<Parameters<typeof planTokenCard>[0]["row"] & object> = {}) => ({
  grants: ["member:manage", "translation:write"],
  allProjects: true,
  projectIds: [],
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  lastUsedAt: null,
  expiresAt: new Date(now.getTime() + 86_400_000),
  ...over,
});

describe("planTokenCard", () => {
  it("행 없음 → none", () => {
    expect(planTokenCard({ row: null, memberProjectIds: ["p1"], now })).toEqual({ state: "none" });
  });

  it("만료 전 → active, grant는 어휘 순서로", () => {
    expect(planTokenCard({ row: row(), memberProjectIds: [], now })).toEqual({
      state: "active",
      grants: ["translation:write", "member:manage"],
      scope: { kind: "all" },
      createdAt: row().createdAt,
      lastUsedAt: null,
      expiresAt: row().expiresAt,
    });
  });

  it("expiresAt == now → expired (인증 경계와 같다)", () => {
    expect(planTokenCard({ row: row({ expiresAt: new Date(now) }), memberProjectIds: [], now })).toMatchObject({ state: "expired" });
  });

  it("projects 범위는 현재 멤버십과 교집합한다 — 빠진 프로젝트는 세지 않는다", () => {
    const card = planTokenCard({ row: row({ allProjects: false, projectIds: ["p1", "p2", "gone"] }), memberProjectIds: ["p2", "p1", "p3"], now });
    expect(card).toMatchObject({ scope: { kind: "projects", projectIds: ["p1", "p2"] } });
  });

  it("어휘 밖 grant는 버린다", () => {
    expect(planTokenCard({ row: row({ grants: ["admin", "project:create"] }), memberProjectIds: [], now })).toMatchObject({ grants: ["project:create"] });
  });
});

/**
 * `/mcp` Connected apps (mcp-oauth 핸드오프 §7.3 · spec 조건 8). 이름은 클라이언트가 정한 것이라 없으면 clientId URL이고, 식별 줄은 동의 화면 앱 카드와
 * **같은 문자열**이다. 범위는 토큰 카드와 같이 현재 멤버십과 교집합한다. 정렬: 마지막 사용 최신 → 사용 없음(연결일 최신) → 만료.
 */
describe("planConnectedApps", () => {
  const CLAUDE = "https://claude.ai/oauth/claude-code-client-metadata";
  const CODEX = "https://chatgpt.com/oauth/codex/abc/client.json";
  const conn = (over: Partial<Parameters<typeof planConnectedApps>[0]["rows"][number]> = {}) => ({
    id: "c1",
    clientId: CLAUDE,
    clientName: "Claude Code" as string | null,
    grants: ["member:manage", "translation:write"],
    allProjects: false,
    projectIds: ["p1", "gone"],
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    lastUsedAt: null as Date | null,
    expiresAt: new Date(now.getTime() + 86_400_000),
    ...over,
  });

  it("이름 · 식별 줄 · 어휘 순서 grant · 멤버십 교집합 범위", () => {
    expect(planConnectedApps({ rows: [conn()], memberProjectIds: ["p1"], now })).toEqual([{
      id: "c1",
      name: "Claude Code",
      ident: "claude.ai/oauth/claude-code-client-metadata",
      state: "active",
      grants: ["translation:write", "member:manage"],
      scope: { kind: "projects", projectIds: ["p1"] },
      createdAt: conn().createdAt,
      lastUsedAt: null,
      expiresAt: conn().expiresAt,
    }]);
  });

  it("이름이 없으면 clientId URL이 이름이다 — 식별 줄은 그대로 보인다", () => {
    expect(planConnectedApps({ rows: [conn({ clientId: CODEX, clientName: null })], memberProjectIds: [], now })[0]).toMatchObject({
      name: CODEX,
      ident: "chatgpt.com/oauth/codex/abc/client.json",
    });
  });

  it("expiresAt == now → expired (인증 경계와 같다)", () => {
    expect(planConnectedApps({ rows: [conn({ expiresAt: new Date(now) })], memberProjectIds: [], now })[0]?.state).toBe("expired");
  });

  it("정렬 — 마지막 사용 최신 → 사용 없음(연결일 최신) → 만료", () => {
    const rows = [
      conn({ id: "expired", expiresAt: new Date(now.getTime() - 1), lastUsedAt: new Date("2026-09-27T00:00:00.000Z") }),
      conn({ id: "never-old", createdAt: new Date("2026-09-02T00:00:00.000Z") }),
      conn({ id: "used-old", lastUsedAt: new Date("2026-09-20T00:00:00.000Z") }),
      conn({ id: "never-new", createdAt: new Date("2026-09-10T00:00:00.000Z") }),
      conn({ id: "used-new", lastUsedAt: new Date("2026-09-27T00:00:00.000Z") }),
    ];
    expect(planConnectedApps({ rows, memberProjectIds: [], now }).map(r => r.id)).toEqual(["used-new", "used-old", "never-new", "never-old", "expired"]);
  });
});
