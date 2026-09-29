import { describe, expect, it } from "vitest";

import { toolCatalog, type ToolRequirement } from "@/lib/mcp/catalog";

/**
 * **잠금 뒤 토큰 재판정의 요구 grant = 역할 permission** (`lib/auth/lock.ts`의 `lockProjectAccess`·raw 자리의 `lockCredential`).
 * 잠금 자리는 도구 이름을 모르고 `permission` 하나만 받으므로 "쓰기 도구의 grant는 역할 permission과 같다"가 카탈로그에서 참이어야
 * 한다. 다른 grant를 요구하는 쓰기 도구가 생기면 여기서 red가 되고, 그때 `lockProjectAccess`가 grant를 따로 받아야 한다.
 */
function requirements(access: ToolRequirement | { newProject: ToolRequirement; existingProject: ToolRequirement }): ToolRequirement[] {
  return "rolePermission" in access ? [access] : [access.newProject, access.existingProject];
}

describe("쓰기 도구의 토큰 grant", () => {
  const writes = toolCatalog().filter(tool => !tool.annotations.readOnlyHint);

  it("쓰기 도구를 찾았다 — 필터가 공허하지 않다", () => {
    expect(writes.length).toBeGreaterThan(10);
  });

  it("역할 permission이 있는 쓰기 도구는 전부 그 permission과 같은 grant를 요구한다", () => {
    const mismatched = writes.flatMap(tool => requirements(tool.access)
      .filter(r => r.rolePermission !== null && r.tokenGrant !== r.rolePermission)
      .map(r => `${tool.name}: role ${r.rolePermission} / grant ${r.tokenGrant}`));
    expect(mismatched).toEqual([]);
  });

  it("역할이 없는 쓰기는 project:create 하나다 — 그 자리(생성 코어)는 grant를 직접 적는다", () => {
    const roleless = writes.flatMap(tool => requirements(tool.access).filter(r => r.rolePermission === null).map(r => `${tool.name}:${r.tokenGrant}`));
    expect(roleless).toEqual(["create_project:project:create"]);
  });
});
