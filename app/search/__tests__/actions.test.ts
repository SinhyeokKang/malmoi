import { beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { Project } from "ts-morph";

const mock = vi.hoisted(() => ({ session: vi.fn(), search: vi.fn(), memberships: vi.fn(), prisma: {} }));
vi.mock("@/lib/auth/read-session", () => ({ readSession: mock.session }));
vi.mock("@/lib/db", () => ({ getPrisma: () => mock.prisma }));
vi.mock("@/lib/keys/search", () => ({ searchKeys: mock.search }));
vi.mock("@/lib/keys/query", () => ({ loadMemberships: mock.memberships }));
import { searchKeysAction, loadSearchMembershipsAction } from "../actions";

beforeEach(() => {
  vi.clearAllMocks();
  mock.session.mockResolvedValue({ status: "ok", userId: "session-user" });
  mock.search.mockResolvedValue([]);
  mock.memberships.mockResolvedValue([]);
});

it.each(["none", "unavailable"])("%s 세션은 두 Action 모두 명시적으로 거절한다", async status => {
  mock.session.mockResolvedValue({ status });
  const result = { ok: false, error: status === "none" ? "unauthorized" : "unavailable" };
  expect(await searchKeysAction("hello", "p")).toEqual(result);
  expect(await loadSearchMembershipsAction()).toEqual(result);
  expect(mock.search).not.toHaveBeenCalled();
  expect(mock.memberships).not.toHaveBeenCalled();
});

it("검색 코어에는 세션 userId와 순위 힌트만 넘긴다", async () => {
  const hits = [{ id: "found" }];
  mock.search.mockResolvedValue(hits);
  expect(await searchKeysAction("hello", "p")).toEqual({ ok: true, hits });
  expect(mock.search).toHaveBeenLastCalledWith(mock.prisma, { userId: "session-user", q: "hello", activeSlug: "p" });
  await searchKeysAction("hello", ["foreign"]);
  expect(mock.search).toHaveBeenLastCalledWith(mock.prisma, { userId: "session-user", q: "hello", activeSlug: null });
});

it.each([null, undefined, 3, [], {}])("비문자열 %j는 세션 조회보다 먼저 빈 결과다", async q => {
  expect(await searchKeysAction(q, null)).toEqual({ ok: true, hits: [] });
  expect(mock.session).not.toHaveBeenCalled();
  expect(mock.search).not.toHaveBeenCalled();
});

it("1자 질의는 코어의 빈 결과를 그대로 반환한다", async () => {
  expect(await searchKeysAction(" a ", null)).toEqual({ ok: true, hits: [] });
});

it("두 코어 장애는 unavailable로 접는다", async () => {
  mock.search.mockRejectedValue(new Error("database"));
  mock.memberships.mockRejectedValue(new Error("database"));
  expect(await searchKeysAction("hello", null)).toEqual({ ok: false, error: "unavailable" });
  expect(await loadSearchMembershipsAction()).toEqual({ ok: false, error: "unavailable" });
});

it("멤버십은 레이아웃과 같은 일곱 필드만 전달한다", async () => {
  mock.memberships.mockResolvedValue([{ slug: "p", name: "Project", role: "EDITOR", archivedAt: null, image: null, memberCount: 1, sourceCount: 2, keyCount: 3, installationId: "private", surfaces: [{ lastCommitSha: "secret" }], defaultSurfaceSlug: "s" }]);
  const result = await loadSearchMembershipsAction();
  expect(mock.memberships).toHaveBeenCalledWith(mock.prisma, "session-user");
  expect(result).toEqual({ ok: true, memberships: [{ slug: "p", name: "Project", role: "EDITOR", archived: false, image: null, defaultSurfaceSlug: "s", counts: { members: 1, sources: 2, keys: 3 } }] });
});

const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/gm, "$1");
const forbidden = (source: string) => /\brevalidatePath\s*\(|\bconsole\s*\./.test(strip(source));
it("읽기 Action은 재검증·로그 호출이 없고 프로젝트 목록 입력도 없다", () => {
  const paths = ["app/search/actions.ts"];
  expect(paths.length).toBeGreaterThan(0);
  const morph = new Project({ skipAddingFilesFromTsConfig: true });
  for (const path of paths) {
    const source = readFileSync(path, "utf8");
    expect(forbidden(source)).toBe(false);
    const file = morph.createSourceFile("actions.ts", source, { overwrite: true });
    expect(file.getFunctionOrThrow("searchKeysAction").getParameters().map(p => p.getName())).toEqual(["q", "activeSlug"]);
    expect(file.getFunctionOrThrow("loadSearchMembershipsAction").getParameters()).toHaveLength(0);
  }
  expect(forbidden("// console.log(q);\n/* revalidatePath('/') */")).toBe(false);
  expect(forbidden("console.log(q);")).toBe(true);
  expect(forbidden("revalidatePath('/');")).toBe(true);
});
