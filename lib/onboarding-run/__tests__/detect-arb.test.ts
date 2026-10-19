import { afterEach, expect, it, vi } from "vitest";
import type { RepoReader } from "@/lib/repo-host/reader";

/**
 * **`l10n.yaml`이 가리키는 ARB가 2패스 probe 예산 안에 든다** (리뷰 R1). 1패스 후보 상한(JSON류 5)이 설정 대상을 밀어내면 2패스가 그 후보를
 * 내용 없이 만나 검증에서 떨어뜨렸다 — 모든 파일을 읽는 CLI·survey에서는 안 보여 코퍼스가 못 잡는다. 그래서 실제 `detectFormats`를 가짜 리더로 돌려
 * **실제로 읽은 경로**와 최종 후보를 함께 본다.
 */
const reader = vi.hoisted(() => ({ files: new Map<string, string>(), reads: [] as string[] }));

vi.mock("@/lib/onboarding-run/access", () => ({
  checkRepoAccess: async () => ({ status: "ok", host: "github", repoOwner: "owner", repoName: "repo", installationId: "10", repositoryId: "42", defaultBranch: "main" }),
}));
vi.mock("@/lib/repo-host", () => ({
  openRepoReader: async (): Promise<RepoReader> => ({
    snapshot: async () => ({
      status: "ok", headSha: "a".repeat(40), headCommittedAt: "2026-10-19T00:00:00Z",
      files: [...reader.files].map(([path, content]) => ({ path, sha: `sha:${path}`, size: content.length })),
    }),
    sizes: async (snapshot, paths) => ({ status: "ok", sizes: new Map(snapshot.files.filter((f) => paths.includes(f.path)).map((f) => [f.path, f.size!])) }),
    blob: async (sha) => {
      const path = sha.slice("sha:".length);
      reader.reads.push(path);
      return reader.files.get(path);
    },
  }),
}));

afterEach(() => {
  reader.files.clear();
  reader.reads.length = 0;
  vi.unstubAllEnvs();
});

const arb = (extra: Record<string, string> = {}) => JSON.stringify({ greeting: "Hello", ...extra });

it("설정 대상이 1패스 순위 밖이어도 내려받아 1순위가 된다 — p0–p4 재현", async () => {
  vi.stubEnv("APP_SIGNING_SECRET", "s".repeat(32));
  for (let i = 0; i < 5; i += 1) for (const l of ["en", "ko", "ja"]) reader.files.set(`packages/p${i}/l10n/app_${l}.arb`, arb());
  reader.files.set("lib/l10n/app_en.arb", arb());
  reader.files.set("lib/l10n/app_ko.arb", arb());
  reader.files.set("l10n.yaml", "arb-dir: lib/l10n\ntemplate-arb-file: app_ko.arb\n");

  const { detectFormats } = await import("@/lib/onboarding-run/detect");
  const result = await detectFormats({} as import("@/generated/prisma/client").PrismaClient, { userId: "user" }, { owner: "owner", repo: "repo" });

  expect(reader.reads).toContain("lib/l10n/app_en.arb");
  expect(reader.reads).toContain("lib/l10n/app_ko.arb");
  // 예산은 그대로다 — 설정 하나 + JSON류 상위 5 × 표본. 설정을 두 번 읽지 않는다.
  expect(reader.reads.filter((p) => p === "l10n.yaml")).toHaveLength(1);
  expect(reader.reads.filter((p) => p.startsWith("packages/"))).toHaveLength(4 * 3);
  if (!result.ok) throw new Error(JSON.stringify(result));
  // 기준 언어도 설정의 템플릿(ko)이다(R3) — 확정 서명까지 그 값으로 간다.
  expect(result.candidates[0]).toMatchObject({ adapter: "arb-catalog", pathTemplate: "lib/l10n/app_{locale}.arb", baseLocale: "ko" });
  expect(result.candidates.map((c) => c.pathTemplate)).toContain("packages/p0/l10n/app_{locale}.arb");
});

it("설정이 없으면 지금까지와 같다 — 로케일이 많은 쪽이 1순위이고 추가 읽기가 없다", async () => {
  vi.stubEnv("APP_SIGNING_SECRET", "s".repeat(32));
  for (const l of ["en", "ko", "ja"]) reader.files.set(`packages/p0/l10n/app_${l}.arb`, arb());
  reader.files.set("lib/l10n/app_en.arb", arb());
  reader.files.set("lib/l10n/app_ko.arb", arb());

  const { detectFormats } = await import("@/lib/onboarding-run/detect");
  const result = await detectFormats({} as import("@/generated/prisma/client").PrismaClient, { userId: "user" }, { owner: "owner", repo: "repo" });
  if (!result.ok) throw new Error(JSON.stringify(result));
  expect(result.candidates[0]).toMatchObject({ pathTemplate: "packages/p0/l10n/app_{locale}.arb", baseLocale: "en" });
  expect(reader.reads).not.toContain("l10n.yaml");
});
