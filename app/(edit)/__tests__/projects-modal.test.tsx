import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(), loadProjectList: vi.fn(), listConnectableRepos: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({}) }));
vi.mock("@/lib/keys/query", () => ({ loadProjectList: mocks.loadProjectList }));
vi.mock("@/app/(edit)/projects/actions", () => ({ listConnectableRepos: mocks.listConnectableRepos }));

import DirectPage from "../projects/(list)/new/page";
import InterceptedPage from "../projects/@modal/(.)new/page";
import EmptySlot from "../projects/@modal/[...rest]/page";
import EmptyRoot from "../projects/@modal/page";
import DefaultSlot from "../projects/@modal/default";
import Layout from "../projects/layout";
import { NewProjectModal } from "../projects/new-project-modal";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ userId: "u1" });
  mocks.loadProjectList.mockResolvedValue({ rows: [] });
  mocks.listConnectableRepos.mockResolvedValue({ ok: true, repos: [] });
});

it("인터셉트는 인가 뒤 모달만 반환하고 배경 목록을 조회하지 않는다", async () => {
  const tree = await InterceptedPage({ searchParams: Promise.resolve({ q: ["format", "ignored"], e: "unavailable" }) });
  expect(mocks.requireUser).toHaveBeenCalledOnce();
  expect(mocks.loadProjectList).not.toHaveBeenCalled();
  expect(tree.type).toBe(NewProjectModal);
  expect(tree.props).toMatchObject({ closeMode: "back", backQuery: { q: "format" }, initialError: "unavailable" });
});

it("직접 진입은 인가된 사용자의 목록과 목록 복귀 모달을 함께 반환한다", async () => {
  const tree = await DirectPage({ searchParams: Promise.resolve({ q: "format" }) });
  expect(mocks.loadProjectList).toHaveBeenCalledWith({}, "u1");
  // 뒤 목록은 검색어를 prop으로 받지 않는다 — 주소창(`useSearchParams`)에서 읽는다 (audit-ux #17).
  expect(tree.props.children[0].props).toMatchObject({ all: [] });
  expect(tree.props.children[0].props).not.toHaveProperty("q");
  expect(tree.props.children[1].props.backQuery).toEqual({ q: "format" });
  expect(tree.props.children[1].type).toBe(NewProjectModal);
  expect(tree.props.children[1].props.closeMode).toBe("list");
});

it.each([DirectPage, InterceptedPage])("인가가 거부되면 목록·리포 조회 전에 중단한다", async (Page) => {
  mocks.requireUser.mockRejectedValue(new Error("unauthorized"));
  await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow("unauthorized");
  expect(mocks.loadProjectList).not.toHaveBeenCalled();
  expect(mocks.listConnectableRepos).not.toHaveBeenCalled();
});

it.each(["back", "list"] as const)("리포 대기 중에도 모달 껍데기에 닫기 문맥을 전달한다: %s", (closeMode) => {
  const tree = NewProjectModal({ closeMode, backQuery: { q: "format" }, initialError: undefined });
  expect(tree.props.fallback.props).toMatchObject({ repos: undefined, closeMode, backQuery: { q: "format" } });
  expect(tree.props.children.props.closeMode).toBe(closeMode);
  expect(mocks.listConnectableRepos).not.toHaveBeenCalled();
});

it("공통 레이아웃은 기존 자식과 슬롯에 마크업을 추가하지 않는다", () => {
  expect(renderToStaticMarkup(Layout({ children: <main>list</main>, modal: <aside>modal</aside> })))
    .toBe("<main>list</main><aside>modal</aside>");
});

it("기본 슬롯과 다른 프로젝트 경로는 모달을 렌더하지 않는다", async () => {
  expect(DefaultSlot()).toBeNull();
  expect(await EmptySlot()).toBeNull();
  expect(await EmptyRoot()).toBeNull();
  expect(mocks.requireUser).toHaveBeenCalledTimes(2);
});


it.each(["back", "list"] as const)("리포 조회 완료 뒤에도 닫기 문맥과 검색을 보존한다: %s", async (closeMode) => {
  const tree = NewProjectModal({ closeMode, backQuery: { q: "format" }, initialError: "unavailable" });
  const loader = tree.props.children;
  const loaded = await loader.type(loader.props);
  expect(mocks.listConnectableRepos).toHaveBeenCalledOnce();
  expect(mocks.loadProjectList).not.toHaveBeenCalled();
  expect(loaded.props).toMatchObject({ repos: [], closeMode, backQuery: { q: "format" }, initialError: "unavailable" });
});
