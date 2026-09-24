import { expect, it, vi } from "vitest";
vi.mock("@/lib/auth/session", () => ({ requireUser: async () => ({ userId: "u" }) }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({}) }));
vi.mock("@/lib/keys/query", () => ({ loadProjectList: async () => [] }));
import Page from "../projects/(list)/page";

it("중복 q 파라미터가 프로젝트 목록을 오류로 보내지 않는다", async () => {
  await expect(Page({ searchParams: Promise.resolve({ q: ["a", "b"] }) })).resolves.toBeDefined();
});

/**
 * `/projects/new`는 목록 **위의 모달 딥링크**다 (DESIGN §6.7). 그래서 그 라우트도
 * `?q=`·`?filter=`를 받아 **뒤 목록에 반영**해야 한다 — 닫으면 그 값을 들고 `/projects`로 돌아간다.
 */
vi.mock("@/app/(edit)/projects/actions", () => ({
  listConnectableRepos: async () => ({ ok: true, repos: [] }),
}));
const { default: NewPage } = await import("../projects/(list)/new/page");

it("`?e=`와 중복 `q`가 함께 와도 모달 라우트가 오류로 가지 않는다", async () => {
  await expect(
    NewPage({ searchParams: Promise.resolve({ e: "slug-taken", q: ["a", "b"] }) }),
  ).resolves.toBeDefined();
});

/**
 * ⚠️ **`filter`는 더 이상 넘어가지 않는다** (DESIGN §6.63) — 그 키가 주소에 있어도 조용히
 * 무시되고, 뒤 목록은 `q`만 들고 열기 직전과 같은 상태로 남는다.
 *
 * ⚠️ **뒤 목록이 `q`를 prop으로 받지 않는다** (audit-ux #17) — 목록이 주소창(`useSearchParams`)에서 직접
 * 읽으므로 같은 `?q=`가 그대로 걸러진다. 닫을 때 들고 갈 값은 모달의 `backQuery`가 든다.
 */
it("`q`가 모달의 복귀 값에 실린다 — 뒤 목록은 주소에서 같은 값을 읽는다", async () => {
  const tree = await NewPage({ searchParams: Promise.resolve({ q: "format", filter: "active" }) });

  // 모달 뒤 목록은 `<ContentPanel>`의 첫 자식이다 — 렌더 없이 props만 본다.
  const children = (tree as { props: { children: unknown[] } }).props.children;
  const list = children.find(
    (child): child is { props: { q?: string; filter?: string } } =>
      typeof child === "object" && child !== null && "props" in child && "all" in (child as { props: object }).props,
  );
  const modal = children.find(
    (child): child is { props: { backQuery: unknown } } =>
      typeof child === "object" && child !== null && "props" in child && "backQuery" in (child as { props: object }).props,
  );

  expect(list).toBeDefined();
  expect(list?.props).not.toHaveProperty("q");
  expect(list?.props).not.toHaveProperty("filter");
  expect(modal?.props.backQuery).toEqual({ q: "format" });
});
