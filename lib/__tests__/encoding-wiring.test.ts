import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { planPullChanges } from "../pull/plan";
import { blobSha } from "../githash";
import { encodeFileContent } from "../file-encoding";
import { buildCommitActions } from "../gitlab/plan";
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
// GitLab 읽기 쪽의 UTF-16 판별·손상 거부는 `/raw` 바이트를 읽는 클라이언트에서 잰다 — `lib/gitlab/__tests__/client.test.ts`("getBlobText")·`encoding.test.ts`
// (JSON blob API는 UTF-16을 UTF-8+BOM 사본으로 바꿔 주므로 그 본문을 푸는 순수 디코더는 실물과 다른 입력을 재고 있었다 — apple-strings Q1 결함 D1).
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
  // GitLab 리더는 `client.ts`의 `readBlobText`다 — `/raw` 바이트를 이 경계로 판별한다(apple-strings Q1 결함 D1 뒤 `plan.ts`의 base64 디코더를 지웠다).
  it.each(["lib/github.ts", "lib/gitlab/client.ts", "scripts/format.ts", "lib/survey/run.ts"])("%s에 직접 UTF-8 디코드가 없다", path => {
    const source = readFileSync(path, "utf8");
    expect(source).not.toMatch(/\.toString\(\s*(["']utf-?8["'])?\s*\)|readFileSync\([^;]*?["']utf-?8["']|new TextDecoder\(/);
    expect(source).toMatch(/decodeLocaleFile/);
  });
});
