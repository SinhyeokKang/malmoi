import { expect, it, vi } from "vitest";
vi.mock("@/lib/auth/session", () => ({ requireUser: async () => ({ userId: "u" }) }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({}) }));
vi.mock("@/lib/keys/query", () => ({ loadProjectList: async () => [] }));
import Page from "../projects/page";

it("중복 q 파라미터가 프로젝트 목록을 오류로 보내지 않는다", async () => {
  await expect(Page({ searchParams: Promise.resolve({ q: ["a", "b"] }) })).resolves.toBeDefined();
});

/**
 * `/projects/new`는 목록 **위의 모달 딥링크**다 (new-project-modal §1.4). 그래서 그 라우트도
 * `?q=`·`?filter=`를 받아 **뒤 목록에 반영**해야 한다 — 닫으면 그 값을 들고 `/projects`로 돌아간다.
 */
vi.mock("@/app/(edit)/projects/actions", () => ({
  listConnectableRepos: async () => ({ ok: true, repos: [] }),
}));
const { default: NewPage } = await import("../projects/new/page");

it("`?e=`와 중복 `q`가 함께 와도 모달 라우트가 오류로 가지 않는다", async () => {
  await expect(
    NewPage({ searchParams: Promise.resolve({ e: "slug-taken", q: ["a", "b"] }) }),
  ).resolves.toBeDefined();
});

it("`q`·`filter`가 뒤 목록에 실려 넘어간다 — 열기 직전과 같은 목록이다", async () => {
  const listed: { q?: string; filter?: string }[] = [];
  vi.doMock("@/components/projects/project-list", () => ({
    ProjectList: (props: { q?: string; filter?: string }) => {
      listed.push({ q: props.q, filter: props.filter });
      return null;
    },
  }));
  const { default: Page } = await import("../projects/new/page");

  await Page({ searchParams: Promise.resolve({ q: "format", filter: "active" }) });

  expect(listed.at(-1)).toEqual({ q: "format", filter: "active" });
});
