import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { visit } from "unist-util-visit";

import { m } from "@/lib/i18n";
import { PROJECT_LIMIT } from "@/lib/onboarding/create-plan";
import { PROJECT_SLUG_MAX } from "@/lib/onboarding/slug";
import { INVITATION_HOURLY_LIMIT } from "@/lib/invitation-email/limits";
import { MEMBER_LIMIT } from "@/lib/auth/invitation";
import { SKIP_MARKER } from "@/lib/pull/payload";
import { allowedActions } from "./helpers/allowed-actions";
import { servedGuideFiles } from "./helpers/served";
import { collectLinks, collectUiLabels } from "../collect";
import { dictionaryStrings } from "../dictionary";
import { parseMd, headings, toText } from "../parse";
import { sectionByAnchor, leadParagraph, parseMdTable } from "../sections";
import { flattenNav, parseSummary, slugToFile } from "../summary";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const GUIDE = join(ROOT, "guide");
const read = (file: string) => readFileSync(join(GUIDE, file), "utf8");
const tree = (file: string) => parseMd(read(file));
const files = () => servedGuideFiles(GUIDE);
const nav = () => flattenNav(parseSummary(tree("SUMMARY.md")));

function headingsBefore(treeValue: ReturnType<typeof parseMd>, node: { position?: { start: { line: number } } }): string | null {
  const line = node.position?.start.line ?? Number.MAX_SAFE_INTEGER;
  let nearest: string | null = null;
  for (const heading of headings(treeValue)) {
    if ((heading.node.position?.start.line ?? Number.MAX_SAFE_INTEGER) >= line) break;
    nearest = heading.text;
  }
  return nearest;
}

describe("실물 가이드 본문 게이트", () => {
  it("모든 내부 링크와 앵커가 SUMMARY의 실제 페이지로 해소된다", () => {
    const listed = new Set(files());
    for (const file of files().filter((file) => file !== "SUMMARY.md")) {
      const value = tree(file);
      for (const link of collectLinks(value)) {
        if (!link.url.endsWith(".md") && !link.url.includes(".md#") && !link.url.startsWith("#")) continue;
        const hash = link.url.indexOf("#");
        const path = hash === -1 ? link.url : link.url.slice(0, hash);
        const anchor = hash === -1 ? null : link.url.slice(hash + 1);
        const target = path === "" ? file : join(requirePathDir(file), path);
        expect(listed, `${file}:${link.line}`).toContain(target.replaceAll("\\", "/"));
        if (anchor) expect(headings(tree(target.replaceAll("\\", "/"))).map(({ id }) => id), `${file}:${link.line}`).toContain(anchor);
      }
    }
  });

  it("도입·자리표시자·이미지·표 이름 규칙을 지킨다", () => {
    for (const file of files().filter((file) => file !== "SUMMARY.md")) {
      const value = tree(file);
      expect(leadParagraph(value), file).not.toBeNull();
      expect(read(file)).not.toMatch(/\b(?:TODO|TBD|lorem)\b/i);
      const labels = new Set<string>();
      visit(value, "table", (table) => {
        const label = headingsBefore(value, table);
        expect(label, file).not.toBeNull();
        expect(labels.has(label!), `${file}: ${label}`).toBe(false);
        labels.add(label!);
      });
    }
  });

  it("굵은 라벨은 사전 또는 AUTHORING 허용 목록에만 있다", () => {
    const allowed = new Set(dictionaryStrings(m));
    const external = parseMdTable(tree("AUTHORING.md"), "external-labels") ?? [];
    for (const row of external) allowed.add(row["라벨"] ?? "");
    for (const file of files()) {
      for (const label of collectUiLabels(tree(file))) expect(allowed, `${file}:${label.line} ${label.text}`).toContain(label.text);
    }
  });

  it("정본 상수와 기존 일곱 절을 원고가 보존한다", () => {
    const limits = sectionByAnchor(tree("reference/limits.md"), "limits");
    expect(limits).toContain(String(PROJECT_LIMIT));
    expect(limits).toContain(String(MEMBER_LIMIT));
    expect(sectionByAnchor(tree("reference/limits.md"), "invitations")).toContain(String(INVITATION_HOURLY_LIMIT));
    expect(limits).toContain(String(PROJECT_SLUG_MAX));
    const formats = sectionByAnchor(tree("reference/formats.md"), "formats");
    for (const path of ["src/locales/{locale}.json", "config/locales/{locale}.yml", "_locales/{locale}/messages.json", "src/locales/{locale}.ts", "src/i18n/namespaces/*.ts"]) expect(formats).toContain(path);
    expect(sectionByAnchor(tree("setup/workflow.md"), "workflow")).toContain(".github/workflows/malmoi-i18n.yml");
    expect(sectionByAnchor(tree("setup/workflow.md"), "push-token")).toContain("PUSH_TOKEN");
    expect(sectionByAnchor(tree("sync/merging.md"), "skip-marker")).toContain(SKIP_MARKER);
    expect(allowedActions()).toHaveLength(4);
    expect(new Set(allowedActions()).size).toBe(4);
    expect(nav().length).toBeGreaterThan(0);
    expect(slugToFile(["setup", "workflow"], nav().map(({ file }) => file))).toBe("setup/workflow.md");
  });
});

function requirePathDir(file: string): string {
  const parts = file.split("/");
  parts.pop();
  return parts.join("/");
}
