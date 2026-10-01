import { existsSync } from "node:fs";
import { beforeEach, expect, it, vi } from "vitest";

/**
 * **프로젝트 셸 안의 맞지 않는 주소는 셸 안 404 형이다** (malmoi#167) — 맞는 라우트가 없으면 Next가 루트 `app/not-found.tsx`
 * (`RootFallback` — 패널·글리프 없는 셸 밖 형)를 그렸다. `[slug]` 아래 catch-all이 `notFound()`를 던져 `[slug]/not-found`가 든다.
 * ⚠️ 인가를 먼저 지난다 — 모르는 slug·비멤버는 지금처럼 목록으로 redirect되고, 404 형으로 존재 여부를 흘리지 않는다.
 */
const state = vi.hoisted(() => ({
  access: vi.fn(),
  notFound: vi.fn(() => { throw new Error("not-found"); }),
}));
vi.mock("next/navigation", () => ({ notFound: state.notFound }));
vi.mock("@/lib/auth/session", () => ({ requireProjectAccess: state.access }));

const DIR = "app/(edit)/projects/[slug]/[...rest]";
const render = () => import(`../projects/[slug]/[...rest]/page`).then(({ default: Page }) =>
  Page({ params: Promise.resolve({ slug: "demo", rest: ["nope"] }) }));

beforeEach(() => {
  state.access.mockReset();
  state.notFound.mockClear();
});

it("멤버의 맞지 않는 하위 주소는 인가를 지난 뒤 notFound를 던진다", async () => {
  state.access.mockResolvedValue({ projectId: "p", role: "EDITOR", userId: "u", archived: false });
  await expect(render()).rejects.toThrow("not-found");
  expect(state.access).toHaveBeenCalledWith({ slug: "demo", permission: "translation:write" });
});

it("인가가 redirect하면 notFound에 닿지 않는다 — 모르는 slug는 지금처럼 목록으로 간다", async () => {
  state.access.mockRejectedValue(new Error("redirect:/projects?e=not-found"));
  await expect(render()).rejects.toThrow("redirect:/projects?e=not-found");
  expect(state.notFound).not.toHaveBeenCalled();
});

it("필수 catch-all이고 자기 경계가 없다 — 프로젝트 Home을 가리지 않고 `[slug]/not-found`가 든다", () => {
  // 선택 catch-all(`[[...rest]]`)은 `/projects/<slug>` 자체와 겹친다.
  expect(existsSync(`${DIR}/page.tsx`)).toBe(true);
  expect(existsSync(`${DIR}/not-found.tsx`)).toBe(false);
  expect(existsSync("app/(edit)/projects/[slug]/[[...rest]]")).toBe(false);
});
