import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { toolCatalog, type ToolSpec } from "../catalog";

/**
 * 도구 카탈로그 (mcp-connector design §2 — PRODUCT §4.3 ⑤의 개방 조건). `tools/list`는 이 배열 순서로 등록되고 SDK가 등록 순서를
 * 그대로 내보낸다(design §1.1 실측) — 그래서 **순서가 계약**이고 스냅샷 인프라 없이 명시적 배열 동치로 고정한다.
 * 역할 조건과 토큰 grant 조건은 별개 필드다 — 역할의 permission을 grant로 자동 복제하지 않는다(tasks T6).
 */

const READ = ["whoami", "list_projects", "get_project", "list_repositories", "list_branches", "detect_formats", "list_keys", "get_key",
  "preview_publish", "preview_sync", "preview_revert", "list_events", "get_workflow", "list_members"];
const WRITE = ["create_project", "add_sources", "set_translations", "publish", "sync_repository", "revert_to_last_sent", "update_project",
  "set_base_locale", "rotate_push_token", "invite_members", "revoke_invitation", "change_member", "archive_project", "unarchive_project"];

const read = { readOnlyHint: true, destructiveHint: false } as const;
const write = { readOnlyHint: false, destructiveHint: false } as const;
const destructive = { readOnlyHint: false, destructiveHint: true } as const;

const EXPECTED: readonly ToolSpec[] = [
  { name: "whoami", annotations: read, access: { rolePermission: null, tokenGrant: null } },
  { name: "list_projects", annotations: read, access: { rolePermission: null, tokenGrant: null } },
  { name: "get_project", annotations: read, access: { rolePermission: "translation:write", tokenGrant: null } },
  { name: "list_repositories", annotations: read, access: { rolePermission: null, tokenGrant: "project:create" } },
  { name: "list_branches", annotations: read, access: {
    newProject: { rolePermission: null, tokenGrant: "project:create" },
    existingProject: { rolePermission: "project:settings", tokenGrant: null },
  } },
  { name: "detect_formats", annotations: read, access: {
    newProject: { rolePermission: null, tokenGrant: "project:create" },
    existingProject: { rolePermission: "project:settings", tokenGrant: "project:settings" },
  } },
  { name: "list_keys", annotations: read, access: { rolePermission: "translation:write", tokenGrant: null } },
  { name: "get_key", annotations: read, access: { rolePermission: "translation:write", tokenGrant: null } },
  { name: "preview_publish", annotations: read, access: { rolePermission: "translation:write", tokenGrant: null } },
  { name: "preview_sync", annotations: read, access: { rolePermission: "project:settings", tokenGrant: null } },
  { name: "preview_revert", annotations: read, access: { rolePermission: "project:settings", tokenGrant: null } },
  { name: "list_events", annotations: read, access: { rolePermission: "translation:write", tokenGrant: null } },
  { name: "get_workflow", annotations: read, access: { rolePermission: "project:settings", tokenGrant: null } },
  { name: "list_members", annotations: read, access: { rolePermission: "translation:write", tokenGrant: null } },
  { name: "create_project", annotations: write, access: { rolePermission: null, tokenGrant: "project:create" } },
  { name: "add_sources", annotations: write, access: { rolePermission: "project:settings", tokenGrant: "project:settings" } },
  { name: "set_translations", annotations: write, access: { rolePermission: "translation:write", tokenGrant: "translation:write" } },
  { name: "publish", annotations: write, access: { rolePermission: "translation:write", tokenGrant: "translation:write" } },
  { name: "sync_repository", annotations: destructive, access: { rolePermission: "project:settings", tokenGrant: "project:settings" } },
  { name: "revert_to_last_sent", annotations: destructive, access: { rolePermission: "project:settings", tokenGrant: "project:settings" } },
  { name: "update_project", annotations: write, access: { rolePermission: "project:settings", tokenGrant: "project:settings" } },
  { name: "set_base_locale", annotations: write, access: { rolePermission: "project:settings", tokenGrant: "project:settings" } },
  { name: "rotate_push_token", annotations: destructive, access: { rolePermission: "project:settings", tokenGrant: "project:settings" } },
  { name: "invite_members", annotations: write, access: { rolePermission: "member:manage", tokenGrant: "member:manage" } },
  { name: "revoke_invitation", annotations: destructive, access: { rolePermission: "member:manage", tokenGrant: "member:manage" } },
  { name: "change_member", annotations: destructive, access: { rolePermission: "member:manage", tokenGrant: "member:manage" } },
  { name: "archive_project", annotations: destructive, access: { rolePermission: "project:settings", tokenGrant: "project:settings" } },
  { name: "unarchive_project", annotations: write, access: { rolePermission: "project:settings", tokenGrant: "project:settings" } },
];

describe("toolCatalog", () => {
  it("이름과 순서 — 읽기 14 다음 쓰기 14", () => {
    expect(toolCatalog().map(t => t.name)).toEqual([...READ, ...WRITE]);
  });

  it("annotations · 역할 조건 · grant 조건 전체가 설계표와 같다", () => {
    expect(toolCatalog()).toEqual(EXPECTED);
  });

  it("호출마다 같은 값이다 (결정적)", () => {
    expect(toolCatalog()).toEqual(toolCatalog());
  });

  it("이름이 유일하다", () => {
    const names = toolCatalog().map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("쓰기 도구는 전부 grant를 요구한다 — grant 없는 토큰은 읽기 전용이다", () => {
    for (const tool of toolCatalog().filter(t => !t.annotations.readOnlyHint)) {
      expect("tokenGrant" in tool.access && tool.access.tokenGrant, tool.name).not.toBeNull();
    }
  });

  it("잎 데이터 모듈이다 — /mcp 페이지(클라이언트)가 읽으므로 import가 없다", () => {
    const source = readFileSync(join(__dirname, "..", "catalog.ts"), "utf8");
    const imports = source.split("\n").filter(line => /^import\s/.test(line) && !/^import type\s/.test(line));
    expect(imports).toEqual([]);
    expect(source).not.toContain("server-only");
  });
});
