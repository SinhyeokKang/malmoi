import { describe, expect, it } from "vitest";

import { planProjectAccess } from "../access";

/**
 * 프로젝트 인가의 판정 전부 (design §3). 껍데기(`requireProjectAccess`)는 조회와 redirect만 하고
 * **여기서 아무 I/O도 하지 않는다** — `checkBearer`(`lib/push/auth.ts`)·`planSave`와 같은 결이다.
 *
 * ⚠️ **"slug가 없다"와 "멤버가 아니다"를 같은 `not-found`로 접는다** (SAAS §7.7 — "URL을 안다는
 * 사실은 접근 권한이 아니다"). 호출부가 프로젝트를 못 찾으면 `member: null`을 넘긴다. 둘을
 * 403/404로 가르면 **프로젝트 존재 여부가 샌다.**
 *
 * `forbidden`은 **멤버이지만 permission이 모자란** 경우에만 쓴다 — 그래야 화면이 "권한이 없다"와
 * "그런 프로젝트가 없다"를 다르게 말할 수 있다.
 */

describe("planProjectAccess — 멤버십이 없으면 not-found", () => {
  it("member가 null이면 not-found다 (프로젝트 부재도 호출부가 여기로 접어 넘긴다)", () => {
    expect(planProjectAccess({ member: null, permission: "translation:write" })).toEqual({
      status: "not-found",
    });
  });

  it("permission이 무엇이든 member가 null이면 not-found다 — fail-closed", () => {
    expect(planProjectAccess({ member: null, permission: "member:manage" })).toEqual({
      status: "not-found",
    });
    expect(planProjectAccess({ member: null, permission: "project:settings" })).toEqual({
      status: "not-found",
    });
  });
});

describe("planProjectAccess — 멤버이지만 권한이 모자라면 forbidden", () => {
  it("EDITOR의 member:manage는 forbidden이다 — not-found가 아니다", () => {
    expect(
      planProjectAccess({ member: { projectId: "p1", role: "EDITOR" }, permission: "member:manage" }),
    ).toEqual({ status: "forbidden" });
  });

  it("EDITOR의 project:settings는 forbidden이다", () => {
    expect(
      planProjectAccess({ member: { projectId: "p1", role: "EDITOR" }, permission: "project:settings" }),
    ).toEqual({ status: "forbidden" });
  });
});

describe("planProjectAccess — 통과하면 인가된 projectId를 준다", () => {
  it("EDITOR는 translation:write로 통과하고 projectId·role을 받는다", () => {
    expect(
      planProjectAccess({ member: { projectId: "p1", role: "EDITOR" }, permission: "translation:write" }),
    ).toEqual({ status: "ok", projectId: "p1", role: "EDITOR" });
  });

  it("OWNER는 셋 다 통과한다", () => {
    for (const permission of ["translation:write", "project:settings", "member:manage"] as const) {
      expect(planProjectAccess({ member: { projectId: "p2", role: "OWNER" }, permission })).toEqual({
        status: "ok",
        projectId: "p2",
        role: "OWNER",
      });
    }
  });

  it("projectId는 **멤버십 행의 것**이다 — 클라이언트가 보낸 값이 아니다 (SAAS §5.2)", () => {
    const result = planProjectAccess({
      member: { projectId: "authorized-project", role: "OWNER" },
      permission: "translation:write",
    });
    expect(result).toEqual({ status: "ok", projectId: "authorized-project", role: "OWNER" });
  });

  it("canPerform을 실제로 지난다 — 표가 바뀌면 이 판정도 함께 바뀐다", () => {
    // 권한표에서 EDITOR가 거부되는 칸이 여기서도 거부돼야 한다. 존재 확인이 아니라 값 대조다
    // (POSTMORTEM 2026-09-03 — 테스트 이름만 계약을 주장한 사례).
    const editorDenied = planProjectAccess({
      member: { projectId: "p1", role: "EDITOR" },
      permission: "member:manage",
    });
    const ownerAllowed = planProjectAccess({
      member: { projectId: "p1", role: "OWNER" },
      permission: "member:manage",
    });
    expect(editorDenied.status).toBe("forbidden");
    expect(ownerAllowed.status).toBe("ok");
  });
});
