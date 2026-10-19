import { describe, expect, it, vi } from "vitest";
import { sizesFromSnapshot, type RepoReader, type RepoSnapshot } from "@/lib/repo-host/reader";
import { prepareSurfaceImport, type SurfaceImportInput } from "../surface";

const snapshot: Extract<RepoSnapshot, { status: "ok" }> = {
  status: "ok", headSha: "a".repeat(40), headCommittedAt: "2026-09-15T00:00:00Z",
  files: ["en", "ko", "fr"].map(locale => ({ path: `i18n/${locale}.json`, sha: locale, size: 100 })),
};
const input: SurfaceImportInput = {
  projectId: "p", projectSlug: "fixture", mode: "repository", snapshot,
  token: "run", startedAt: new Date("2026-09-15T00:00:00Z"),
  surface: { id: "s", slug: "default", adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en", basePath: null, nested: false, nestedByPath: null },
};
const reader = (content: string | undefined): RepoReader => ({ sizes: async (snapshot, paths) => sizesFromSnapshot(snapshot, paths), snapshot: vi.fn(), blob: vi.fn().mockResolvedValue(content) });
describe("prepareSurfaceImport", () => {
  it("정상 빈 카탈로그만 내부 empty 결과로 준비한다", async () => {
    expect(await prepareSurfaceImport(reader("{}"), input)).toMatchObject({ kind: "empty", result: { count: 0, failed: 0 } });
  });
  it("첫 적재는 정상 빈 카탈로그도 실패다", async () => {
    expect(await prepareSurfaceImport(reader("{}"), { ...input, mode: "first" })).toMatchObject({ kind: "failed" });
  });
  it.each([undefined, "{", "[]", "null"])("다운로드/파싱/컨테이너 실패 %s는 empty가 아니다", async content => {
    expect(await prepareSurfaceImport(reader(content), input)).toMatchObject({ kind: "failed" });
  });
  it("리포 스냅샷 커밋과 기존 생산자의 payload를 준비한다", async () => {
    expect(await prepareSurfaceImport(reader('{"hello":"Hello"}'), input)).toMatchObject({ kind: "payload", payload: { commitSha: snapshot.headSha, commitAt: snapshot.headCommittedAt, keys: [{ key: "hello" }], refs: [] }, result: { count: 1, failed: 0 } });
  });
  it("일부 다운로드 실패를 원래 경로와 함께 보고한다", async () => {
    const repo: RepoReader = { sizes: async (snapshot, paths) => sizesFromSnapshot(snapshot, paths), snapshot: vi.fn(), blob: vi.fn().mockImplementation(async sha => sha === "fr" ? undefined : '{"hello":"Hello"}') };
    expect(await prepareSurfaceImport(repo, input)).toMatchObject({ kind: "payload", result: { count: 1, failed: 1, errors: [{ path: "i18n/fr.json", code: "download-failed" }] } });
  });
  it("크기 예산 실패를 빈 성공으로 바꾸지 않는다", async () => {
    expect(await prepareSurfaceImport(reader("{}"), { ...input, snapshot: { ...snapshot, files: snapshot.files.map(file => ({ ...file, size: undefined })) } })).toMatchObject({ kind: "failed", error: "resource-limit" });
  });
});

it.each(["first", "repository"] as const)("Android %s 적재는 저장된 기준 코드를 values/에 연결하고 관측된 번역 파일도 유지한다", async mode => {
  const basePath = "app/src/main/res/values/strings.xml";
  const pathTemplate = "app/src/main/res/values-{locale}/strings.xml";
  const files = new Map([[basePath, '<resources><string name="title">English</string></resources>'], [pathTemplate.replace("{locale}", "de"), '<resources><string name="title">Deutsch</string></resources>']]);
  for (const code of ["car", "de-land"]) files.set(pathTemplate.replace("{locale}", code), `<resources><string name="title">${code}</string></resources>`);
  const androidSnapshot = { ...snapshot, files: [...files].map(([path, content]) => ({ path, sha: path, size: content.length })) };
  const repo: RepoReader = { sizes: async (s, paths) => sizesFromSnapshot(s, paths), snapshot: vi.fn(), blob: async sha => files.get(sha) };
  const result = await prepareSurfaceImport(repo, { ...input, mode, snapshot: androidSnapshot, surface: { ...input.surface, adapter: "android-strings", pathTemplate, basePath, baseLocale: "en" } });
  expect(result.kind).toBe("payload");
  if (result.kind !== "payload") return;
  expect(result.payload).toMatchObject({ locales: ["de", "en"], format: { basePath, baseLocale: "en" }, keys: [{ key: "title", sourceText: "English" }] });
  expect(result.payload.translations).toEqual(expect.arrayContaining([expect.objectContaining({ locale: "de", value: "Deutsch" }), expect.objectContaining({ locale: "en", value: "English" })]));
});
