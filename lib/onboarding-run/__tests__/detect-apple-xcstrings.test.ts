import { afterEach, describe, expect, it, vi } from "vitest";
import type { RepoReader } from "@/lib/repo-host/reader";

/**
 * **`.xcstrings`가 2패스 probe 예산 안에서 내려받혀 후보가 된다** (apple-strings design §5 — arb 리뷰 R1과 같은 부류). 카탈로그는 언어 목록이 파일 **안**에
 * 있어 경로만 보는 1패스에서는 후보가 될 수 없다 — 씨앗(`xcstringsProbePaths`)이 내려받지 않으면 2패스에 내용이 없어 **조용히** 사라진다. 모든 파일을 읽는
 * CLI·survey에서는 안 보이므로 실제 `detectFormats`를 가짜 리더로 돌려 **실제로 읽은 경로**와 최종 후보를 함께 본다.
 */
/** `unsized` — 트리가 크기를 싣지 않는 경로(GitLab 트리처럼). 크기는 리더의 `sizes`가 따로 답한다. */
const reader = vi.hoisted(() => ({ files: new Map<string, string>(), reads: [] as string[], unsized: new Set<string>() }));

vi.mock("@/lib/onboarding-run/access", () => ({
  checkRepoAccess: async () => ({ status: "ok", host: "github", repoOwner: "owner", repoName: "repo", installationId: "10", repositoryId: "42", defaultBranch: "main",
    connect: { status: "ok", installationId: "10", repoOwner: "owner", repoName: "repo" } }),
}));
vi.mock("@/lib/repo-host", () => ({
  openRepoReader: async (): Promise<RepoReader> => ({
    snapshot: async () => ({
      status: "ok", headSha: "a".repeat(40), headCommittedAt: "2026-10-19T00:00:00Z",
      files: [...reader.files].map(([path, content]) => ({ path, sha: `sha:${path}`, ...(reader.unsized.has(path) ? {} : { size: content.length }) })),
    }),
    sizes: async (_snapshot, paths) => ({ status: "ok", sizes: new Map(paths.flatMap((p) => { const c = reader.files.get(p); return c === undefined ? [] : [[p, c.length] as const]; })) }),
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
  reader.unsized.clear();
  vi.unstubAllEnvs();
});

const detect = async () => {
  const { detectFormats } = await import("@/lib/onboarding-run/detect");
  return detectFormats({} as import("@/generated/prisma/client").PrismaClient, { userId: "user" }, { owner: "owner", repo: "repo" });
};

const cell = (value: string) => ({ stringUnit: { state: "translated", value } });
/** Xcode 서식 카탈로그 — 키 `Hello`에 언어 셀을 준다. */
function catalog(sourceLanguage: string, locales: readonly string[]): string {
  const localizations = Object.fromEntries(locales.map((l) => [l, cell(`Hello ${l}`)]));
  return JSON.stringify({ sourceLanguage, strings: { Hello: { localizations }, Bye: {} }, version: "1.0" }, null, 2).replace(/": /g, '" : ');
}

it("네이티브 iOS 앱: `.strings` 테이블이 1패스 상위 5를 채워도 `Localizable.xcstrings`를 내려받아 1순위가 되고 기준 언어는 sourceLanguage다", async () => {
  vi.stubEnv("APP_SIGNING_SECRET", "s".repeat(32));
  for (const locale of ["Base", "en", "de", "ja"]) {
    for (const table of ["AAbout", "Account", "Alerts", "InfoPlist", "LaunchScreen", "Main", "Settings"]) {
      reader.files.set(`App/${locale}.lproj/${table}.strings`, `"${table}.title" = "${table}";\n`);
    }
  }
  // 기준 언어가 en이 아니다 — 공용 추정(en 우선)이 아니라 카탈로그의 sourceLanguage가 기본 기준 언어다.
  reader.files.set("App/Localizable.xcstrings", catalog("de", ["de", "en", "fr", "ja", "ko"]));
  reader.files.set("App/mul.lproj/Main.xcstrings", catalog("en", ["en", "de"]));
  // 의존성·번들 안의 카탈로그는 씨앗이 아니다.
  reader.files.set("Pods/Lib/Localizable.xcstrings", catalog("en", ["en"]));
  reader.files.set("App/Vendor/Kit.framework/Localizable.xcstrings", catalog("en", ["en"]));

  const result = await detect();
  if (!result.ok) throw new Error(JSON.stringify(result));
  expect(reader.reads).toEqual(expect.arrayContaining(["App/Localizable.xcstrings", "App/mul.lproj/Main.xcstrings"]));
  expect(reader.reads.some((p) => p.startsWith("Pods/") || p.includes(".framework/"))).toBe(false);
  // 예산: `.strings` 후보 5 × 표본 3 + 카탈로그 씨앗 2.
  expect(reader.reads).toHaveLength(5 * 3 + 2);
  expect(result.candidates[0]).toMatchObject({
    adapter: "apple-xcstrings", pathTemplate: "App/Localizable.xcstrings", baseLocale: "de", locales: ["de", "en", "fr", "ja", "ko"],
    keys: { status: "counted", count: 2 },
  });
  expect(result.candidates.map((c) => c.pathTemplate)).toContain("App/mul.lproj/Main.xcstrings");
});

it("카탈로그가 많아도 씨앗은 둘이고 사전순 뒤의 `Localizable.xcstrings`가 그 안에 든다", async () => {
  vi.stubEnv("APP_SIGNING_SECRET", "s".repeat(32));
  for (const name of ["AboutWindow", "Alert", "InfoPlist", "MainMenu", "Preferences"]) reader.files.set(`Mac/${name}.xcstrings`, catalog("en", ["en", "de"]));
  reader.files.set("Mac/Localizable.xcstrings", catalog("en", ["en", "de", "fr"]));
  const result = await detect();
  if (!result.ok) throw new Error(JSON.stringify(result));
  expect(reader.reads).toHaveLength(2);
  expect(reader.reads).toContain("Mac/Localizable.xcstrings");
  expect(result.candidates[0]).toMatchObject({ adapter: "apple-xcstrings", pathTemplate: "Mac/Localizable.xcstrings", baseLocale: "en" });
});

/**
 * Flutter 앱의 `ios/Runner`·`macos/Runner`는 플랫폼 셸이다 — 카탈로그(`InfoPlist.xcstrings`)도 `.strings` 셸과 같이 맨 뒤다(`isFlutterShell`, apple-strings
 * 리뷰 Y5와 같은 부류). ARB 정답 14개 리포의 1순위를 Apple 후보가 빼앗으면 회귀다(spec 완료 조건 3).
 */
it("Flutter 앱: ARB가 예산 안에서 1순위이고 셸의 `.strings`·`.xcstrings`는 빠지지 않고 뒤에 남는다", async () => {
  vi.stubEnv("APP_SIGNING_SECRET", "s".repeat(32));
  reader.files.set("pubspec.yaml", "name: app\n");
  for (const locale of ["en", "ko"]) reader.files.set(`lib/l10n/app_${locale}.arb`, JSON.stringify({ greeting: "Hello" }));
  for (const locale of ["en", "ko", "ja"]) {
    for (const table of ["InfoPlist", "Localizable", "Main", "LaunchScreen"]) reader.files.set(`ios/Runner/${locale}.lproj/${table}.strings`, `"${table}.t" = "T";\n`);
  }
  reader.files.set("ios/Runner/InfoPlist.xcstrings", catalog("en", ["en", "ko", "ja", "de", "fr"]));
  reader.files.set("macos/Runner/Localizable.xcstrings", catalog("en", ["en", "ko", "ja", "de"]));

  const result = await detect();
  if (!result.ok) throw new Error(JSON.stringify(result));
  expect(reader.reads).toEqual(expect.arrayContaining(["lib/l10n/app_en.arb", "lib/l10n/app_ko.arb", "ios/Runner/InfoPlist.xcstrings", "macos/Runner/Localizable.xcstrings"]));
  // ARB 2 + 셸 `.strings` 4 × 3 + 카탈로그 씨앗 2.
  expect(reader.reads).toHaveLength(2 + 4 * 3 + 2);
  expect(result.candidates[0]).toMatchObject({ adapter: "arb-catalog", pathTemplate: "lib/l10n/app_{locale}.arb", baseLocale: "en" });
  const rest = result.candidates.slice(1).map((c) => c.adapter);
  expect(rest).toContain("apple-xcstrings");
  expect(rest.every((a) => a === "apple-strings" || a === "apple-xcstrings")).toBe(true);
});

/**
 * **RX-Y2 · 지휘자 결정 16** — 씨앗은 트리가 알려 준 크기가 파일당 예산(2,000,000 바이트)을 넘는 카탈로그를 건너뛰고 다음 후보를 고른다. 전에는 큰 카탈로그
 * 하나가 씨앗에 들면 내려받기 예산이 탐지 **전체**를 `resource-limit`으로 끝내 같은 리포의 정상 `.strings`·xcstrings 후보까지 사라졌다(정답 리포
 * iTerm2 7.1MB · Shotnix 2.2MB). 그 카탈로그는 어차피 적재할 수 없다 — 사용자가 직접 고르면 지금처럼 `resource-limit`이다.
 */
const BIG = 2_000_001;
/** 유효한 카탈로그인데 파일이 예산보다 크다 — 셀 값 하나로 키운다. */
const bigCatalog = () => {
  const head = catalog("en", ["en", "de", "fr", "ja", "ko", "es"]);
  return head.replace('"Hello en"', `"${"x".repeat(BIG)}"`);
};

describe("큰 카탈로그 — 씨앗에서 건너뛴다", () => {
  it("큰 카탈로그가 1순위 자리여도 탐지가 실패하지 않고 정상 `.strings`·카탈로그 후보가 남는다", async () => {
    vi.stubEnv("APP_SIGNING_SECRET", "s".repeat(32));
    for (const locale of ["en", "de", "ja"]) {
      for (const table of ["AAbout", "Account", "Alerts", "InfoPlist", "LaunchScreen", "Main", "Settings"]) reader.files.set(`App/${locale}.lproj/${table}.strings`, `"${table}.t" = "T";\n`);
    }
    // 사전순으로 정상 카탈로그보다 앞이다 — 크기를 안 보면 씨앗 1순위다.
    reader.files.set("A/Localizable.xcstrings", bigCatalog());
    reader.files.set("App/Localizable.xcstrings", catalog("en", ["en", "de", "fr", "ja", "ko"]));
    reader.files.set("App/mul.lproj/Main.xcstrings", catalog("en", ["en", "de"]));
    expect(reader.files.get("A/Localizable.xcstrings")!.length).toBeGreaterThan(2_000_000);

    const result = await detect();
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(reader.reads).not.toContain("A/Localizable.xcstrings");
    // 씨앗 둘·합계 예산은 그대로다 — 큰 파일 자리를 다음 후보가 채운다.
    expect(reader.reads).toEqual(expect.arrayContaining(["App/Localizable.xcstrings", "App/mul.lproj/Main.xcstrings"]));
    expect(reader.reads).toHaveLength(5 * 3 + 2);
    expect(result.candidates[0]).toMatchObject({ adapter: "apple-xcstrings", pathTemplate: "App/Localizable.xcstrings" });
    expect(result.candidates.some((c) => c.adapter === "apple-strings")).toBe(true);
    expect(result.candidates.map((c) => c.pathTemplate)).not.toContain("A/Localizable.xcstrings");
  });

  it("큰 카탈로그뿐인 리포에서도 `.strings` 후보가 남는다", async () => {
    vi.stubEnv("APP_SIGNING_SECRET", "s".repeat(32));
    for (const locale of ["en", "de"]) reader.files.set(`App/${locale}.lproj/Localizable.strings`, '"a" = "A";\n');
    reader.files.set("App/Localizable.xcstrings", bigCatalog());
    const result = await detect();
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(reader.reads).not.toContain("App/Localizable.xcstrings");
    expect(result.candidates.map((c) => c.adapter)).toEqual(["apple-strings"]);
  });

  /** 트리가 크기를 주지 않는 호스트(GitLab)에서는 모르는 크기를 작다고 보지 않는다 — 지금 동작 그대로 씨앗이 되고, 내려받기 예산이 리더의 `sizes`로 거부한다. */
  it("트리에 크기가 없으면 지금처럼 씨앗이 되고 예산이 탐지를 `resource-limit`으로 끝낸다", async () => {
    vi.stubEnv("APP_SIGNING_SECRET", "s".repeat(32));
    for (const locale of ["en", "de"]) reader.files.set(`App/${locale}.lproj/Localizable.strings`, '"a" = "A";\n');
    reader.files.set("App/Localizable.xcstrings", bigCatalog());
    reader.unsized.add("App/Localizable.xcstrings");
    expect(await detect()).toEqual({ ok: false, error: "resource-limit" });
  });

  it("사용자가 큰 카탈로그를 직접 고르면 지금처럼 `resource-limit`이다", async () => {
    vi.stubEnv("APP_SIGNING_SECRET", "s".repeat(32));
    reader.files.set("App/Localizable.xcstrings", bigCatalog());
    const { createProjectFromRepo } = await import("@/lib/onboarding-run/create");
    const prisma = {
      projectMember: { count: async () => 0 },
      user: { findUnique: async () => null },
      project: { findUnique: async () => null },
    } as unknown as import("@/generated/prisma/client").PrismaClient;
    const result = await createProjectFromRepo(prisma, { userId: "user" }, {
      owner: "owner", repo: "repo", slug: "big", name: "Big", baseBranch: "main", manual: true,
      surfaces: [{ adapter: "apple-xcstrings", pathTemplate: "App/Localizable.xcstrings", baseLocale: "en" }],
    });
    expect(result).toMatchObject({ ok: false, error: "resource-limit" });
    expect(reader.reads).toEqual([]);
  });
});
