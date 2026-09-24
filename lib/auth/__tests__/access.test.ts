import { describe, expect, it } from "vitest";

import { planLockedAccess, planProjectAccess } from "../access";

/**
 * 프로젝트 인가의 판정 전부 (ARCHITECTURE §6.1). 껍데기(`requireProjectAccess`)는 조회와 redirect만 하고
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
    ).toEqual({ status: "ok", projectId: "p1", role: "EDITOR", archived: false });
  });

  it("OWNER는 셋 다 통과한다", () => {
    for (const permission of ["translation:write", "project:settings", "member:manage"] as const) {
      expect(planProjectAccess({ member: { projectId: "p2", role: "OWNER" }, permission, archivedAt: null })).toEqual({
        status: "ok",
        projectId: "p2",
        role: "OWNER",
        archived: false,
      });
    }
  });

  it("projectId는 **멤버십 행의 것**이다 — 클라이언트가 보낸 값이 아니다 (ARCHITECTURE §6.00 ③)", () => {
    const result = planProjectAccess({
      member: { projectId: "authorized-project", role: "OWNER" },
      permission: "translation:write",
      archivedAt: null,
    });
    expect(result).toEqual({ status: "ok", projectId: "authorized-project", role: "OWNER", archived: false });
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
 * **보관** (7단계 — ARCHITECTURE §5.6.4).
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
      archived: true,
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
      archived: false,
    });
  });
});

/**
 * **보관된 프로젝트의 읽기 허용** (logs-rework spec 완료조건 11 · T4a).
 *
 * ⚠️ **읽기 허용이 쓰기 허용을 뜻하지 않는다.** 정책이 인자라 Server Action은 계속 기본값을 쓰고,
 * 그 기본값이 `block`이라 **정책을 안 주는 진입점은 새로 생겨도 막힌다**(fail-closed).
 */
describe("planProjectAccess — archivedPolicy", () => {
  const owner = { projectId: "p1", role: "OWNER" } as const;
  const editor = { projectId: "p1", role: "EDITOR" } as const;
  const archivedAt = new Date("2026-09-10T00:00:00Z");

  it("정책을 안 주면 지금까지와 같다 — 기본이 block이다", () => {
    expect(planProjectAccess({ member: editor, permission: "translation:write", archivedAt })).toEqual({
      status: "archived",
      projectId: "p1",
      role: "EDITOR",
    });
  });

  it("read면 두 역할 모두 통과하고, 보관 사실을 함께 싣는다", () => {
    for (const member of [owner, editor]) {
      expect(
        planProjectAccess({ member, permission: "translation:write", archivedAt, archivedPolicy: "read" }),
        member.role,
      ).toEqual({ status: "ok", projectId: "p1", role: member.role, archived: true });
    }
  });

  /** ⚠️ **읽기 허용이 쓰기 허용이 아니다** — 같은 permission이라도 정책을 안 주면 그대로 막힌다. */
  it("같은 permission이라도 정책이 block이면 막힌다 — 갈래마다 센다", () => {
    for (const member of [owner, editor]) {
      for (const policy of ["block", undefined] as const) {
        expect(
          planProjectAccess({ member, permission: "translation:write", archivedAt, archivedPolicy: policy }).status,
          `${member.role}/${policy}`,
        ).toBe("archived");
      }
    }
  });

  it("read가 부족한 권한을 열어 주지 않는다 — 판정 순서는 그대로다", () => {
    expect(
      planProjectAccess({ member: editor, permission: "member:manage", archivedAt, archivedPolicy: "read" }),
    ).toEqual({ status: "forbidden" });
  });

  /** 제거된 멤버는 과거 참여자여도 `not-found`다 — 정책이 그 판정을 앞지르지 않는다. */
  it("멤버가 아니면 read여도 not-found다", () => {
    expect(
      planProjectAccess({ member: null, permission: "translation:write", archivedAt, archivedPolicy: "read" }),
    ).toEqual({ status: "not-found" });
  });

  it("보관이 아닌 프로젝트에서 read는 아무것도 바꾸지 않는다", () => {
    expect(
      planProjectAccess({ member: editor, permission: "translation:write", archivedAt: null, archivedPolicy: "read" }),
    ).toEqual({ status: "ok", projectId: "p1", role: "EDITOR", archived: false });
  });
});

/**
 * **잠금 안 쓰기 판정** (감사 #9·#10·#26 — ARCHITECTURE §5.6.4). 입력은 잠금 뒤 다시 읽은 값이고, 판정은
 * `planProjectAccess` 위에 쓰기 규칙 하나를 얹는다: 보관된 프로젝트의 `project:settings` 쓰기는 보관 토글(`archiveToggle`)만 통과한다.
 */
describe("planLockedAccess — 잠금 뒤 다시 읽은 값으로 쓰기를 판정한다", () => {
  const owner = { projectId: "p1", role: "OWNER" as const };
  const editor = { projectId: "p1", role: "EDITOR" as const };
  const archivedAt = new Date("2026-09-24T00:00:00Z");

  it("멤버가 사라졌으면 not-found다", () => {
    expect(planLockedAccess({ member: null, permission: "project:settings", archivedAt: null })).toEqual({ status: "not-found" });
  });

  it("OWNER가 EDITOR로 강등됐으면 forbidden이다", () => {
    expect(planLockedAccess({ member: editor, permission: "member:manage", archivedAt: null })).toEqual({ status: "forbidden" });
  });

  it("보관된 프로젝트의 설정 쓰기는 archived다 — 보관 = Restore만", () => {
    expect(planLockedAccess({ member: owner, permission: "project:settings", archivedAt })).toEqual({ status: "archived" });
  });

  it("보관 토글은 보관된 프로젝트에서 통과한다 (대조: 같은 입력에서 archiveToggle만 다르다)", () => {
    expect(planLockedAccess({ member: owner, permission: "project:settings", archivedAt, archiveToggle: true })).toEqual({ status: "ok", role: "OWNER" });
  });

  it("보관 토글이 권한 부족을 열어 주지 않는다", () => {
    expect(planLockedAccess({ member: editor, permission: "project:settings", archivedAt, archiveToggle: true })).toEqual({ status: "forbidden" });
  });

  it("번역 쓰기도 보관이면 archived다", () => {
    expect(planLockedAccess({ member: editor, permission: "translation:write", archivedAt })).toEqual({ status: "archived" });
  });

  it("표면이 없거나 보관됐으면 not-found다 — 진입점의 getSurfaceAccess와 같은 낱말", () => {
    expect(planLockedAccess({ member: editor, permission: "translation:write", archivedAt: null, surface: null })).toEqual({ status: "not-found" });
    expect(planLockedAccess({ member: editor, permission: "translation:write", archivedAt: null, surface: { archivedAt } })).toEqual({ status: "not-found" });
    expect(planLockedAccess({ member: editor, permission: "translation:write", archivedAt: null, surface: { archivedAt: null } })).toEqual({ status: "ok", role: "EDITOR" });
  });

  it("활성 프로젝트의 멤버는 통과한다", () => {
    expect(planLockedAccess({ member: owner, permission: "project:settings", archivedAt: null })).toEqual({ status: "ok", role: "OWNER" });
  });
});
