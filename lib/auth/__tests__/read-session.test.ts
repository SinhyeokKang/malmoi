import { beforeEach, expect, it, vi } from "vitest";

/**
 * **한 렌더에서 `auth()`가 한 번만 돈다** (audit-ux #32). 셸 레이아웃·페이지·`@modal`의 `requireUser`가 각자
 * `readSession`을 불러 같은 요청이 세션 조회를 여러 번 했다.
 *
 * React `cache`의 범위는 서버 렌더 하나다 — 노드 테스트에는 그 dispatcher가 없어 `cache`가 그냥 통과하므로,
 * 여기서는 **그 범위 하나를 흉내 내는** 가짜로 바꿔 "감쌌는가"를 잰다. 범위 자체의 성질(Server Action 본문은
 * 렌더 밖이라 캐시되지 않는다)은 React의 몫이고 `read-session.ts` 주석이 근거를 든다.
 */
const hoisted = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/auth", () => ({ auth: hoisted.auth }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T,>(fn: () => T) => {
    let slot: { value: T } | undefined;
    return () => (slot ??= { value: fn() }).value;
  },
}));

beforeEach(() => {
  vi.resetModules();
  hoisted.auth.mockReset();
  hoisted.auth.mockResolvedValue({ user: { id: "u1", name: "Kim", email: "k@x.com", image: null } });
});

it("같은 렌더 범위에서 두 번 읽어도 auth()는 한 번이다", async () => {
  const { readSession } = await import("../read-session");
  const [a, b] = await Promise.all([readSession(), readSession()]);
  expect(a).toEqual({ status: "ok", userId: "u1", name: "Kim", email: "k@x.com", image: null });
  expect(b).toEqual(a);
  expect(hoisted.auth).toHaveBeenCalledTimes(1);
});

it("범위가 새로 서면(다음 요청) 다시 읽는다 — 폐기된 세션이 다음 요청까지 살아남지 않는다", async () => {
  const first = await import("../read-session");
  await first.readSession();
  vi.resetModules();
  hoisted.auth.mockResolvedValue(null);
  const second = await import("../read-session");
  expect(await second.readSession()).toEqual({ status: "none" });
  expect(hoisted.auth).toHaveBeenCalledTimes(2);
});
