import { afterEach, expect, it, vi } from "vitest";
import type { RepoReader } from "@/lib/repo-host/reader";

/**
 * **`.xcstrings`가 2패스 probe 예산 안에서 내려받혀 후보가 된다** (apple-strings design §5 — arb 리뷰 R1과 같은 부류). 카탈로그는 언어 목록이 파일 **안**에
 * 있어 경로만 보는 1패스에서는 후보가 될 수 없다 — 씨앗(`xcstringsProbePaths`)이 내려받지 않으면 2패스에 내용이 없어 **조용히** 사라진다. 모든 파일을 읽는
 * CLI·survey에서는 안 보이므로 실제 `detectFormats`를 가짜 리더로 돌려 **실제로 읽은 경로**와 최종 후보를 함께 본다.
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
