import { describe, expect, it } from "vitest";

import { canPerform, type Permission, type Role } from "../permission";

/**
 * PRODUCT §3 권한표를 코드로. **역할은 둘, permission은 셋이라 6칸이 전부다.**
 *
 * ⚠️ **Publish는 별도 permission이 아니라 `translation:write`에 포함된다** (design §2).
 * PRODUCT §3이 EDITOR에게 Publish를 허용했고("PR 생성이지 base 직접 쓰기가 아니다"),
 * "개발자만 Publish"가 필요해지면 그때 permission을 나눈다 — 지금 넷째를 두는 것은 선반영이다.
 *
 * fail-closed 계보(`lib/auth/allow.ts`)를 잇는다: **표에 없으면 거부**가 기본이다.
 */

const ROLES: readonly Role[] = ["OWNER", "EDITOR"];
const PERMISSIONS: readonly Permission[] = ["translation:write", "project:settings", "member:manage"];

describe("canPerform — PRODUCT §3 권한표 6칸", () => {
  it("OWNER는 번역 조회·수정과 Publish를 한다", () => {
    expect(canPerform("OWNER", "translation:write")).toBe(true);
  });

  it("OWNER는 리포·기준 로케일·base branch를 바꾼다", () => {
    expect(canPerform("OWNER", "project:settings")).toBe(true);
  });

  it("OWNER는 멤버를 관리한다", () => {
    expect(canPerform("OWNER", "member:manage")).toBe(true);
  });

  it("EDITOR는 번역 조회·수정과 **Publish**를 한다 — Publish가 translation:write에 들어 있다", () => {
    expect(canPerform("EDITOR", "translation:write")).toBe(true);
  });

  it("EDITOR는 프로젝트 설정을 바꾸지 못한다", () => {
    expect(canPerform("EDITOR", "project:settings")).toBe(false);
  });

  it("EDITOR는 멤버를 관리하지 못한다", () => {
    expect(canPerform("EDITOR", "member:manage")).toBe(false);
  });

  it("표의 6칸이 전부 판정된다 — 빠진 조합이 조용히 undefined가 되지 않는다", () => {
    const cells = ROLES.flatMap((role) => PERMISSIONS.map((p) => canPerform(role, p)));
    expect(cells).toHaveLength(6);
    expect(cells.every((v) => typeof v === "boolean")).toBe(true);
  });
});
