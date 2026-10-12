import { describe, expect, it } from "vitest";

import { GitLabHttpError } from "@/lib/gitlab/transport";

import { planMemberAccess, planProjectMeta } from "../access-plan";

/**
 * 호출자 GitLab 리포 권한 (design §3 `checkRepoAccess` · tasks §2 B2). 입력은 `members/all/<user id>`(상속 포함 유효 권한)와 `GET /projects/<id>`다.
 */
const member = (level: number) => ({ ok: true as const, body: { id: 31337, username: "ox501501", access_level: level } });
const failed = (status: number, scope = false) => ({ ok: false as const, error: new GitLabHttpError("/projects/1/members/all/2", status, scope) });

describe("planMemberAccess", () => {
  it("쓰기는 Maintainer(40) 이상 — 그룹에서 상속한 Maintainer도 members/all이 40으로 준다", () => {
    expect(planMemberAccess(member(40), true)).toBe("ok");
    expect(planMemberAccess(member(50), true)).toBe("ok");
    expect(planMemberAccess(member(30), true)).toBe("read-only");
  });

  it("읽기는 Reporter(20) 이상 — Developer·Reporter OWNER의 Sync·브랜치 목록은 통과한다", () => {
    expect(planMemberAccess(member(30), false)).toBe("ok");
    expect(planMemberAccess(member(20), false)).toBe("ok");
  });

  it("⚠️ Guest(10)는 읽기도 거부다 — private 코드를 못 읽는다", () => {
    expect(planMemberAccess(member(10), false)).toBe("forbidden");
    expect(planMemberAccess(member(10), true)).toBe("forbidden");
  });

  it("⚠️ 초대 수락·승인 대기 멤버는 access level이 실려도 거부다(R-B ⚪3) — 쓰기가 늦게 403/404로 드러나지 않게", () => {
    for (const pending of [{ state: "awaiting" }, { membership_state: "awaiting" }, { state: "active", membership_state: "awaiting" }]) {
      expect(planMemberAccess({ ok: true, body: { id: 1, access_level: 50, ...pending } }, true), JSON.stringify(pending)).toBe("forbidden");
    }
    expect(planMemberAccess({ ok: true, body: { id: 1, access_level: 50, state: "active", membership_state: "active" } }, true)).toBe("ok");
  });

  it("404(멤버 아님)·403은 거부다", () => {
    expect(planMemberAccess(failed(404), false)).toBe("forbidden");
    expect(planMemberAccess(failed(403), true)).toBe("forbidden");
  });

  it("⚠️ 401·403 insufficient_scope는 reconnect다 — unavailable로 접지 않는다", () => {
    expect(planMemberAccess(failed(401), false)).toBe("reconnect");
    expect(planMemberAccess(failed(403, true), false)).toBe("reconnect");
  });

  it("⚠️ access level이 없는 응답은 거부가 아니라 unavailable이다", () => {
    expect(planMemberAccess({ ok: true, body: { id: 1, username: "x" } }, false)).toBe("unavailable");
    expect(planMemberAccess({ ok: true, body: { access_level: "40" } }, true)).toBe("unavailable");
  });

  it("429·5xx·네트워크는 unavailable이다", () => {
    expect(planMemberAccess(failed(429), true)).toBe("unavailable");
    expect(planMemberAccess(failed(502), true)).toBe("unavailable");
    expect(planMemberAccess({ ok: false, error: new TypeError("fetch failed") }, true)).toBe("unavailable");
  });
});

describe("planProjectMeta", () => {
  const META = {
    id: 87515176, path_with_namespace: "group/sub/malmoi-gitlab-test", default_branch: "main", archived: false, repository_object_format: "sha1",
    runners_token: "GR1348941-must-not-leak", permissions: { project_access: null, group_access: { access_level: 50 } },
  };

  it("하위 그룹을 보존한다 — owner는 namespace 전체, name은 마지막 조각이다", () => {
    expect(planProjectMeta({ ok: true, body: META }, "87515176")).toEqual({
      status: "ok", repositoryId: "87515176", owner: "group/sub", name: "malmoi-gitlab-test", defaultBranch: "main", archived: false,
    });
  });

  it("⚠️ 결과에 응답의 다른 필드(러너 토큰 등)가 실리지 않는다", () => {
    expect(JSON.stringify(planProjectMeta({ ok: true, body: META }, "87515176"))).not.toContain("GR1348941");
  });

  it("SHA-256 리포는 unsupported다 — 형식 필드가 없으면 sha1로 읽는다", () => {
    expect(planProjectMeta({ ok: true, body: { ...META, repository_object_format: "sha256" } }, "87515176")).toEqual({ status: "unsupported" });
    const { repository_object_format: _, ...legacy } = META;
    expect(planProjectMeta({ ok: true, body: legacy }, "87515176")).toMatchObject({ status: "ok" });
  });

  it("보관 여부를 그대로 준다 — 쓰기 경로만 거부한다(호출부)", () => {
    expect(planProjectMeta({ ok: true, body: { ...META, archived: true } }, "87515176")).toMatchObject({ status: "ok", archived: true });
  });

  it("응답 id가 요청 id와 다르면 unavailable이다", () => {
    expect(planProjectMeta({ ok: true, body: META }, "1")).toEqual({ status: "unavailable" });
  });

  it("404는 forbidden(접근 상실), 401은 reconnect, 5xx는 unavailable이다", () => {
    expect(planProjectMeta({ ok: false, error: new GitLabHttpError("/projects/1", 404, false) }, "1")).toEqual({ status: "forbidden" });
    expect(planProjectMeta({ ok: false, error: new GitLabHttpError("/projects/1", 401, false) }, "1")).toEqual({ status: "reconnect" });
    expect(planProjectMeta({ ok: false, error: new GitLabHttpError("/projects/1", 500, false) }, "1")).toEqual({ status: "unavailable" });
  });

  it("기본 브랜치가 없는 빈 리포는 main으로 둔다", () => {
    expect(planProjectMeta({ ok: true, body: { ...META, default_branch: null } }, "87515176")).toMatchObject({ defaultBranch: "main" });
  });
});
