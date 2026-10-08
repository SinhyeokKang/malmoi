import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const files = [
    { path: "normal.txt", sha: "normal", mode: "100644" },
    { path: "executable", sha: "executable", mode: "100755" },
    { path: "symlink", sha: "link", mode: "120000" },
  ];
  return {
    files,
    snapshot: vi.fn(),
    tree: vi.fn(),
    disconnect: vi.fn(),
  };
});

vi.mock("../../lib/env", () => ({ requireEnv: () => "unused-test-value" }));
vi.mock("../local", () => ({
  loadLocalEnv: vi.fn(),
  scriptPrisma: () => ({
    project: { findUnique: async () => ({ id: "p", slug: "test", repoOwner: "o", repoName: "r", baseBranch: "main",
      installationId: "1", repositoryId: "2", defaultSurface: { slug: "default", adapterName: null, lastCommitSha: null } }) },
    locale: { findMany: async () => [] },
    $disconnect: mocks.disconnect,
  }),
}));
vi.mock("../../lib/github", () => ({
  probeRepo: async () => ({ status: "ok", installationId: "1", fullName: "o/r" }),
  openRepoReader: async () => ({ snapshot: mocks.snapshot }),
  createGitClient: async () => ({ getRefSha: async () => "head", getTree: mocks.tree }),
}));

const argv = process.argv;
const exitCode = process.exitCode;
afterEach(() => {
  process.argv = argv;
  process.exitCode = exitCode;
  vi.restoreAllMocks();
});

it.each([false, true])("GitHub smoke compares blob counts and retains real mismatch diagnostics (missing=%s)", async (missing) => {
  vi.resetModules();
  mocks.disconnect.mockClear();
  mocks.snapshot.mockResolvedValue({ status: "ok", headSha: "head", headCommittedAt: "2026-10-07T00:00:00Z",
    files: missing ? mocks.files.slice(1) : mocks.files });
  mocks.tree.mockResolvedValue([...mocks.files,
    { path: "directory", sha: "dir", mode: "040000" },
    { path: "submodule", sha: "module", mode: "160000" },
  ]);
  process.argv = ["node", "smoke-github.ts", "test"];
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  await import("../smoke-github");
  await vi.waitFor(() => expect(mocks.disconnect).toHaveBeenCalledOnce());
  expect(error).not.toHaveBeenCalled();
  const lines = log.mock.calls.flat().join("\n");
  expect(lines).toContain("트리 blob: 3개");
  if (missing) expect(lines).toContain("스냅샷 파일 수가 다르다: 2 vs 3");
  else expect(lines).not.toContain("스냅샷 파일 수가 다르다");
});
