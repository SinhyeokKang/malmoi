import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { planPullChanges } from "../pull/plan";
import { blobSha } from "../githash";
import { encodeFileContent } from "../file-encoding";
import { buildCommitActions, decodeBlob } from "../gitlab/plan";
import { fileProbe, unreadableLocaleFiles } from "../../scripts/format";

const content = '"hello" = "안녕 😀";\n';
const encoding = "utf-16be-bom" as const;
const bytes = encodeFileContent(content, encoding);

it("변경 없는 UTF-16 파일은 upsert 0이며 순수 계획에는 API 호출이 없다", () => {
  expect(planPullChanges([{ path: "ko.strings", content, encoding }], [{ path: "ko.strings", sha: blobSha(bytes) }])).toEqual([]);
});
it("변경된 파일의 인코딩은 쓰기 경계까지 전달된다", () => {
  expect(planPullChanges([{ path: "ko.strings", content, encoding }], [])).toEqual([{ kind: "upsert", path: "ko.strings", content, encoding }]);
});
it("GitLab은 UTF-16만 base64로 보내고 UTF-8 본문은 유지한다", () => {
  expect(buildCommitActions([
    { kind: "upsert", path: "ko.strings", content, encoding, inBase: true },
    { kind: "upsert", path: "en.json", content: "{}", inBase: false },
  ])).toEqual([
    { action: "update", file_path: "ko.strings", content: bytes.toString("base64"), encoding: "base64" },
    { action: "create", file_path: "en.json", content: "{}", encoding: "text" },
  ]);
});
it("GitLab 디코더는 경로로 UTF-16을 판별하고 손상은 parse-failed로 거부한다", () => {
  expect(decodeBlob({ encoding: "base64", content: bytes.toString("base64") }, "ko.strings")).toEqual({ content, encoding });
  expect(() => decodeBlob({ encoding: "base64", content: "/v/YAA==" }, "ko.strings")).toThrow(expect.objectContaining({ code: "parse-failed", path: "ko.strings" }));
});
it("CI probe가 UTF-16을 읽으며 손상된 선택 파일은 unreadable로 남긴다", () => {
  const root = mkdtempSync(join(tmpdir(), "encoding-wiring-"));
  try {
    writeFileSync(join(root, "ko.strings"), bytes);
    writeFileSync(join(root, "bad.strings"), Buffer.from("fffe00d8", "hex"));
    const failures = new Set<string>();
    const probe = fileProbe(root, failures);
    expect(probe("ko.strings")).toBe(content);
    expect(probe("bad.strings")).toBeUndefined();
    expect(unreadableLocaleFiles([{ path: "bad.strings", content: "" }], failures)).toEqual(["bad.strings"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
describe("로케일 리더의 바이트 경계", () => {
  it.each(["lib/github.ts", "lib/gitlab/plan.ts", "scripts/format.ts", "lib/survey/run.ts"])("%s에 직접 UTF-8 디코드가 없다", path => {
    const source = readFileSync(path, "utf8");
    expect(source).not.toMatch(/\.toString\(\s*(["']utf-?8["'])?\s*\)|readFileSync\([^;]*?["']utf-?8["']|new TextDecoder\(/);
    expect(source).toMatch(/decodeLocaleFile/);
  });
});
