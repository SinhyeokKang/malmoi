// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
const action = vi.hoisted(() => vi.fn());
vi.mock("@/app/search/actions", () => ({ loadSearchMembershipsAction: action }));
beforeEach(() => { vi.resetModules(); action.mockReset(); });

it("호출마다 Action을 새로 불러 변경된 멤버십을 반환한다", async () => {
  action.mockResolvedValueOnce({ ok: true, memberships: [{ slug: "before" }] }).mockResolvedValueOnce({ ok: true, memberships: [{ slug: "after" }] });
  const { loadSearchMemberships } = await import("../load-memberships");
  expect(await loadSearchMemberships()).toEqual({ ok: true, memberships: [{ slug: "before" }] });
  expect(await loadSearchMemberships()).toEqual({ ok: true, memberships: [{ slug: "after" }] });
  expect(action).toHaveBeenCalledTimes(2);
});

// 실패를 비로그인(null)으로 접지 않는다 — 종류가 상태 줄 문장을 가른다(search-ux-unify C1). throw는 unavailable이다.
it.each([["unauthorized", "unauthorized"], ["unavailable", "unavailable"], ["network", "unavailable"]])("%s 실패는 %s이고 다음 호출을 막지 않는다", async (error, expected) => {
  if (error === "network") action.mockRejectedValueOnce(new Error("offline"));
  else action.mockResolvedValueOnce({ ok: false, error });
  action.mockResolvedValueOnce({ ok: true, memberships: [] });
  const { loadSearchMemberships } = await import("../load-memberships");
  expect(await loadSearchMemberships()).toEqual({ ok: false, error: expected });
  expect(await loadSearchMemberships()).toEqual({ ok: true, memberships: [] });
  expect(action).toHaveBeenCalledTimes(2);
});
