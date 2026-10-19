import { afterEach, expect, it, vi } from "vitest";
import type { RepoReader } from "@/lib/repo-host/reader";

/**
 * **Android 후보가 2패스 probe 예산 안에 든다** (android-strings design §5·§9 — arb 리뷰 R1 · apple 리뷰 Y5와 같은 부류). 멀티 모듈·flavor로
 * `strings.xml` 후보가 1패스 상위 `PROBE_LIMITS.jsonLike`(5)를 넘으면, 내용 없이 2패스를 만난 후보는 검증에서 떨어진다 — 모든 파일을 읽는
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

it("flavor·빌드 타입·테스트 소스셋이 많아도 main 소스셋의 기준 파일과 언어 파일을 내려받고 main이 Android 1순위다", async () => {
  vi.stubEnv("APP_SIGNING_SECRET", "s".repeat(32));
  const locales = ["de", "fr", "ko"];
  // 사전순으로 main보다 앞서는 flavor·빌드 타입·테스트 소스셋 일곱 — 로케일 수와 깊이가 같아 경로순이면 main이 8번째로 probe 예산(5) 밖이다.
  const dirs = ["alpha", "androidTest", "beta", "canary", "debug", "dev", "fdroid", "main", "release"].map((set) => `app/src/${set}/res`);
  for (const dir of dirs) {
    reader.files.set(`${dir}/values/strings.xml`, `<resources>\n    <string name="title">${dir}</string>\n</resources>\n`);
    for (const l of locales) reader.files.set(`${dir}/values-${l}/strings.xml`, `<resources>\n    <string name="title">${l}</string>\n</resources>\n`);
  }
  // 리소스 디렉터리 밖의 `strings.xml`과 빌드 산출물은 후보가 아니다.
  reader.files.set("docs/values/strings.xml", "<resources/>");
  reader.files.set("app/build/intermediates/res/values/strings.xml", "<resources/>");

  await detect();
  expect(reader.reads).toEqual(expect.arrayContaining(["app/src/main/res/values/strings.xml", "app/src/main/res/values-de/strings.xml"]));
  expect(reader.reads.some((p) => p.includes("/build/") || p.startsWith("docs/"))).toBe(false);
  // 예산 — 후보 5 × (기준 파일 1 + 표본 3).
  expect(reader.reads).toHaveLength(5 * 4);
  // 2패스 탐지가 내려받은 내용으로 고른 Android 1순위 — 요약(기준 언어 입력, T3.2b)과 무관한 경로 선택이다.
  const { detectCandidatesAcross } = await import("@/lib/adapters");
  const downloaded = new Map(reader.reads.map((p) => [p, reader.files.get(p)!]));
  expect(detectCandidatesAcross([...reader.files.keys()], (p) => downloaded.get(p))[0]).toMatchObject({
    adapter: "android-strings", pathTemplate: "app/src/main/res/values-{locale}/strings.xml", basePath: "app/src/main/res/values/strings.xml",
  });
});

/** orch 결정 7 — Flutter 앱의 Android 셸(`android/app/src/main/res/values/strings.xml`)은 ARB 정답의 1순위를 빼앗지 않는다. 실제 2패스에서 강등 분기를 밟는다. */
it("Flutter 앱(pubspec.yaml)의 Android 셸은 언어가 더 많아도 뒤로 가고 ARB가 예산 안에서 1순위다", async () => {
  vi.stubEnv("APP_SIGNING_SECRET", "s".repeat(32));
  reader.files.set("pubspec.yaml", "name: app\n");
  for (const locale of ["en", "ko"]) reader.files.set(`lib/l10n/app_${locale}.arb`, JSON.stringify({ greeting: "Hello" }));
  reader.files.set("android/app/src/main/res/values/strings.xml", '<resources>\n    <string name="app_name">App</string>\n</resources>\n');
  for (const locale of ["ko", "ja", "de"]) reader.files.set(`android/app/src/main/res/values-${locale}/strings.xml`, '<resources>\n    <string name="app_name">App</string>\n</resources>\n');
  const result = await detect();
  if (!result.ok) throw new Error(JSON.stringify(result));
  expect(reader.reads).toEqual(expect.arrayContaining(["lib/l10n/app_en.arb", "lib/l10n/app_ko.arb"]));
  expect(result.candidates[0]).toMatchObject({ adapter: "arb-catalog", pathTemplate: "lib/l10n/app_{locale}.arb", baseLocale: "en" });
});

it("대조: pubspec.yaml이 없으면 `android/`는 셸이 아니다 — 언어가 많은 Android 후보가 앞이다", async () => {
  vi.stubEnv("APP_SIGNING_SECRET", "s".repeat(32));
  for (const locale of ["en", "ko"]) reader.files.set(`lib/l10n/app_${locale}.arb`, JSON.stringify({ greeting: "Hello" }));
  reader.files.set("android/app/src/main/res/values/strings.xml", '<resources>\n    <string name="app_name">App</string>\n</resources>\n');
  for (const locale of ["ko", "ja", "de"]) reader.files.set(`android/app/src/main/res/values-${locale}/strings.xml`, '<resources>\n    <string name="app_name">App</string>\n</resources>\n');
  await detect();
  const { detectCandidatesAcross } = await import("@/lib/adapters");
  const paths = [...reader.files.keys()];
  expect(detectCandidatesAcross(paths).map((c) => c.adapter)).toEqual(["android-strings", "arb-catalog"]);
});
