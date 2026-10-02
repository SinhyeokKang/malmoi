// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
const action = vi.hoisted(() => vi.fn());
vi.mock("@/app/search/actions", () => ({ loadSearchMembershipsAction: action }));
beforeEach(() => { vi.resetModules(); action.mockReset(); });

it("호출마다 Action을 새로 불러 변경된 멤버십을 반환한다", async () => {
  action.mockResolvedValueOnce({ ok: true, memberships: [{ slug: "before" }] }).mockResolvedValueOnce({ ok: true, memberships: [{ slug: "after" }] });
  const { loadSearchMemberships } = await import("../load-memberships");
  expect(await loadSearchMemberships()).toEqual([{ slug: "before" }]);
  expect(await loadSearchMemberships()).toEqual([{ slug: "after" }]);
  expect(action).toHaveBeenCalledTimes(2);
});

it.each(["unauthorized", "unavailable", "network"])("%s 실패는 null이고 다음 호출을 막지 않는다", async error => {
  if (error === "network") action.mockRejectedValueOnce(new Error("offline"));
  else action.mockResolvedValueOnce({ ok: false, error });
  action.mockResolvedValueOnce({ ok: true, memberships: [] });
  const { loadSearchMemberships } = await import("../load-memberships");
  expect(await loadSearchMemberships()).toBeNull();
  expect(await loadSearchMemberships()).toEqual([]);
  expect(action).toHaveBeenCalledTimes(2);
});
