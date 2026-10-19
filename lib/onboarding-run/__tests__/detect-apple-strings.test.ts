import { afterEach, expect, it, vi } from "vitest";
import type { RepoReader } from "@/lib/repo-host/reader";

/**
 * **`Localizable.strings`가 2패스 probe 예산 안에 든다** (apple-strings design §5 — arb 리뷰 R1과 같은 부류). iOS 리포는 테이블(스토리보드·`InfoPlist`)마다
 * 후보가 하나라 1패스 상위 `PROBE_LIMITS.jsonLike`(5)개를 테이블이 다 차지할 수 있다. 내용 없이 2패스를 만난 후보는 검증에서 떨어진다 — 모든 파일을
 * 읽는 CLI·survey에서는 안 보이므로 실제 `detectFormats`를 가짜 리더로 돌려 **실제로 읽은 경로**와 최종 후보를 함께 본다.
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

it("테이블이 다섯을 넘어 `Localizable`이 사전순 6번째여도 내려받아 1순위가 된다", async () => {
  vi.stubEnv("APP_SIGNING_SECRET", "s".repeat(32));
  // 사전순으로 `Localizable` 앞에 다섯 테이블이 선다. `Base.lproj`는 로케일이 아니다.
  const tables = ["AAbout", "Account", "Alerts", "InfoPlist", "LaunchScreen", "Localizable", "Main"];
  for (const locale of ["Base", "en", "en-GB", "pt-BR", "zh-Hans"]) {
    for (const table of tables) reader.files.set(`App/${locale}.lproj/${table}.strings`, `/* ${table} */\n"${table}.title" = "${table}";\n`);
  }
  // 스토어 메타데이터의 `.strings`(fastlane)는 후보가 아니다.
  for (const locale of ["en", "ko", "ja"]) reader.files.set(`fastlane/screenshots/${locale}.lproj/title.strings`, '"t" = "T";\n');

  const result = await detect();
  if (!result.ok) throw new Error(JSON.stringify(result));
  expect(reader.reads).toContain("App/en.lproj/Localizable.strings");
  expect(reader.reads.some((p) => p.startsWith("fastlane/"))).toBe(false);
  // 예산은 그대로다 — 후보 5 × 표본 3.
  expect(reader.reads).toHaveLength(5 * 3);
  // `.lproj` 이름 그대로가 로케일이고 `Base`는 빠진다. 기준 언어는 en이다.
  expect(result.candidates[0]).toMatchObject({ adapter: "apple-strings", pathTemplate: "App/{locale}.lproj/Localizable.strings", baseLocale: "en", locales: ["en", "en-GB", "pt-BR", "zh-Hans"] });
});

/**
 * 리뷰 Y5 — Flutter 앱의 iOS·macOS 셸 강등(`isFlutterShell`)이 실제 2패스에서 도는가. 셸 테이블이 여섯이라 1패스 상위 5를 셸이 다 차지할 수 있고,
 * 로케일도 ARB(2)보다 많다(3). 강등이 없으면 ARB가 6번째로 밀려 내용 없이 2패스를 만나 탈락한다.
 */
function flutterTree(withPubspec: boolean): void {
  if (withPubspec) reader.files.set("pubspec.yaml", "name: app\n");
  for (const locale of ["en", "ko"]) reader.files.set(`lib/l10n/app_${locale}.arb`, JSON.stringify({ greeting: "Hello" }));
  for (const locale of ["en", "ko", "ja"]) {
    for (const table of ["InfoPlist", "Localizable", "Main", "LaunchScreen"]) reader.files.set(`ios/Runner/${locale}.lproj/${table}.strings`, `"${table}.t" = "T";\n`);
    for (const table of ["InfoPlist", "MainMenu"]) reader.files.set(`macos/Runner/${locale}.lproj/${table}.strings`, `"${table}.t" = "T";\n`);
  }
}

it("Flutter 앱(pubspec.yaml)의 iOS·macOS 셸은 로케일이 더 많아도 뒤로 가고 ARB가 예산 안에서 1순위다", async () => {
  vi.stubEnv("APP_SIGNING_SECRET", "s".repeat(32));
  flutterTree(true);
  const result = await detect();
  if (!result.ok) throw new Error(JSON.stringify(result));
  expect(reader.reads).toEqual(expect.arrayContaining(["lib/l10n/app_en.arb", "lib/l10n/app_ko.arb"]));
  expect(reader.reads).toHaveLength(2 + 4 * 3);
  expect(result.candidates[0]).toMatchObject({ adapter: "arb-catalog", pathTemplate: "lib/l10n/app_{locale}.arb", baseLocale: "en" });
  // 셸은 빠지지 않는다 — 예산 안에 든 셸 후보는 목록에 남는다(둘째 소스로 연결할 수 있다).
  expect(result.candidates.slice(1).every((c) => c.adapter === "apple-strings")).toBe(true);
  expect(result.candidates.length).toBeGreaterThan(1);
});

it("대조: pubspec.yaml이 없는 네이티브 앱의 `ios/`는 셸이 아니다 — 로케일이 많은 Apple 테이블이 앞이고 ARB는 예산 밖이다", async () => {
  vi.stubEnv("APP_SIGNING_SECRET", "s".repeat(32));
  flutterTree(false);
  const result = await detect();
  if (!result.ok) throw new Error(JSON.stringify(result));
  expect(reader.reads.some((p) => p.endsWith(".arb"))).toBe(false);
  expect(reader.reads).toHaveLength(5 * 3);
  expect(result.candidates[0]).toMatchObject({ adapter: "apple-strings", pathTemplate: "ios/Runner/{locale}.lproj/Localizable.strings" });
});
