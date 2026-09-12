import { describe, expect, it } from "vitest";

import { planProjectAccess } from "../access";

/**
 * 프로젝트 인가의 판정 전부 (design §3). 껍데기(`requireProjectAccess`)는 조회와 redirect만 하고
 * **여기서 아무 I/O도 하지 않는다** — `checkBearer`(`lib/push/auth.ts`)·`planSave`와 같은 결이다.
 *
 * ⚠️ **"slug가 없다"와 "멤버가 아니다"를 같은 `not-found`로 접는다** (PRODUCT §7.7 — "URL을 안다는
 * 사실은 접근 권한이 아니다"). 호출부가 프로젝트를 못 찾으면 `member: null`을 넘긴다. 둘을
 * 403/404로 가르면 **프로젝트 존재 여부가 샌다.**
 *
 * `forbidden`은 **멤버이지만 permission이 모자란** 경우에만 쓴다 — 그래야 화면이 "권한이 없다"와
 * "그런 프로젝트가 없다"를 다르게 말할 수 있다.
 */

describe("planProjectAccess — 멤버십이 없으면 not-found", () => {
  it("member가 null이면 not-found다 (프로젝트 부재도 호출부가 여기로 접어 넘긴다)", () => {
    expect(planProjectAccess({ member: null, permission: "translation:write", archivedAt: null })).toEqual({
      status: "not-found",
    });
  });

  it("permission이 무엇이든 member가 null이면 not-found다 — fail-closed", () => {
    expect(planProjectAccess({ member: null, permission: "member:manage", archivedAt: null })).toEqual({
      status: "not-found",
    });
    expect(planProjectAccess({ member: null, permission: "project:settings", archivedAt: null })).toEqual({
      status: "not-found",
    });
  });
});

describe("planProjectAccess — 멤버이지만 권한이 모자라면 forbidden", () => {
  it("EDITOR의 member:manage는 forbidden이다 — not-found가 아니다", () => {
    expect(
      planProjectAccess({ member: { projectId: "p1", role: "EDITOR" }, permission: "member:manage", archivedAt: null }),
    ).toEqual({ status: "forbidden" });
  });

  it("EDITOR의 project:settings는 forbidden이다", () => {
    expect(
      planProjectAccess({ member: { projectId: "p1", role: "EDITOR" }, permission: "project:settings", archivedAt: null }),
    ).toEqual({ status: "forbidden" });
  });
});

describe("planProjectAccess — 통과하면 인가된 projectId를 준다", () => {
  it("EDITOR는 translation:write로 통과하고 projectId·role을 받는다", () => {
    expect(
      planProjectAccess({ member: { projectId: "p1", role: "EDITOR" }, permission: "translation:write", archivedAt: null }),
    ).toEqual({ status: "ok", projectId: "p1", role: "EDITOR" });
  });

  it("OWNER는 셋 다 통과한다", () => {
    for (const permission of ["translation:write", "project:settings", "member:manage"] as const) {
      expect(planProjectAccess({ member: { projectId: "p2", role: "OWNER" }, permission, archivedAt: null })).toEqual({
        status: "ok",
        projectId: "p2",
        role: "OWNER",
      });
    }
  });

  it("projectId는 **멤버십 행의 것**이다 — 클라이언트가 보낸 값이 아니다 (ARCHITECTURE §6.00 ③)", () => {
    const result = planProjectAccess({
      member: { projectId: "authorized-project", role: "OWNER" },
      permission: "translation:write",
      archivedAt: null,
    });
    expect(result).toEqual({ status: "ok", projectId: "authorized-project", role: "OWNER" });
  });

  it("canPerform을 실제로 지난다 — 표가 바뀌면 이 판정도 함께 바뀐다", () => {
    // 권한표에서 EDITOR가 거부되는 칸이 여기서도 거부돼야 한다. 존재 확인이 아니라 값 대조다
    // (POSTMORTEM 2026-09-03 — 테스트 이름만 계약을 주장한 사례).
    const editorDenied = planProjectAccess({
      member: { projectId: "p1", role: "EDITOR" },
      permission: "member:manage",
      archivedAt: null,
    });
    const ownerAllowed = planProjectAccess({
      member: { projectId: "p1", role: "OWNER" },
      permission: "member:manage",
      archivedAt: null,
    });
    expect(editorDenied.status).toBe("forbidden");
    expect(ownerAllowed.status).toBe("ok");
  });
});

/**
 * **보관** (7단계 — sync-runs design §4, 결정 1).
 *
 * ⚠️ **인가 union의 갈래로 둔다.** 페이지·Action이 각자 `archivedAt`을 보게 하면 새 화면 하나가
 * 조용히 빠지는데, 여기 두면 `entry-points.test.ts`가 세는 **모든 진입점이 한 자리에서** 거부된다.
 *
 * ⚠️ **`project:settings`만 통과한다** — 그것이 되돌리는 길이기 때문이다. 전부 막으면 보관이
 * 편도가 되고, 목록에서 숨기는 것과 같은 잠금이 된다.
 */
describe("planProjectAccess — 보관", () => {
  const owner = { projectId: "p1", role: "OWNER" as const };
  const editor = { projectId: "p1", role: "EDITOR" as const };
  const archivedAt = new Date("2026-09-10T00:00:00Z");

  it("보관되면 편집·Publish가 archived로 거부된다", () => {
    expect(planProjectAccess({ member: editor, permission: "translation:write", archivedAt })).toEqual({
      status: "archived",
      projectId: "p1",
      role: "EDITOR",
    });
  });

  it("멤버 관리도 막힌다 — 멈춘 프로젝트에 사람을 더 넣을 이유가 없다", () => {
    expect(planProjectAccess({ member: owner, permission: "member:manage", archivedAt })).toMatchObject({
      status: "archived",
    });
  });

  it("⚠️ `project:settings`만 통과한다 — 되돌리는 길이 거기다", () => {
    expect(planProjectAccess({ member: owner, permission: "project:settings", archivedAt })).toEqual({
      status: "ok",
      projectId: "p1",
      role: "OWNER",
    });
  });

  it("EDITOR는 보관돼도 설정에 못 들어간다 — 권한 판정이 보관보다 먼저다", () => {
    expect(planProjectAccess({ member: editor, permission: "project:settings", archivedAt })).toEqual({
      status: "forbidden",
    });
  });

  it("멤버가 아니면 보관 여부를 알 수 없다 — not-found가 먼저다", () => {
    expect(planProjectAccess({ member: null, permission: "translation:write", archivedAt })).toEqual({
      status: "not-found",
    });
  });

  it("`archivedAt`이 null이면 아무것도 안 바뀐다", () => {
    expect(planProjectAccess({ member: editor, permission: "translation:write", archivedAt: null })).toEqual({
      status: "ok",
      projectId: "p1",
      role: "EDITOR",
    });
  });
});
