import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { visit } from "unist-util-visit";

import { en } from "@/messages/en";
import { PROJECT_LIMIT } from "@/lib/onboarding/create-plan";
import { PROJECT_SLUG_MAX } from "@/lib/onboarding/slug";
import { INVITATION_HOURLY_LIMIT } from "@/lib/invitation-email/limits";
import { MEMBER_LIMIT } from "@/lib/auth/invitation";
import { SKIP_MARKER } from "@/lib/pull/payload";
import { KEY_QUERY_MIN, SEARCH_GROUP_LIMIT } from "@/lib/search/match";
import { Q_MAX_LENGTH } from "@/lib/translations/query";
import { allowedActions } from "./helpers/allowed-actions";
import { servedGuideFiles } from "./helpers/served";
import { collectLinks, collectUiLabels } from "../collect";
import { dictionaryStrings } from "../dictionary";
import { dictDigest, shotDictKeys } from "../stale";
import { parseMd, headings, toText } from "../parse";
import { sectionByAnchor, leadParagraph, parseMdTable } from "../sections";
import { flattenNav, parseSummary, slugToFile } from "../summary";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
// 원문은 en 트리, 비서빙 매뉴얼(AUTHORING·SHOOTING)은 언어와 무관하게 guide/ 루트다
const MANUALS = join(ROOT, "guide");
const GUIDE = join(MANUALS, "en");
const read = (file: string) => readFileSync(join(GUIDE, file), "utf8");
const tree = (file: string) => parseMd(read(file));
const manual = (file: string) => parseMd(readFileSync(join(MANUALS, file), "utf8"));
const files = () => servedGuideFiles(GUIDE);
const nav = () => flattenNav(parseSummary(tree("SUMMARY.md")));

/**
 * **접근 이름에만 붙는 사전 값** — 필터 트리거는 현재 값(`Any state`)을 보이고 축 이름(`State`)은 `aria-label`에만 있다.
 * 가이드가 이것을 굵게 쓰면 독자는 화면에 없는 글자를 찾는다(ux-drift-unify 7-#3). 다른 키에 같은 문자열이 보이는 라벨로
 * 있으면 그쪽 근거로 통과한다 — 이 목록은 값이 아니라 경로를 뺀다.
 */
const ARIA_ONLY: ReadonlySet<string> = new Set([
  "logs.filters.axis",
  "translations.workspace.filters.state.axis",
]);

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

  it("굵은 라벨은 사전(보이는 문자열) 또는 AUTHORING 허용 목록에만 있다", () => {
    const allowed = new Set(dictionaryStrings(en, ARIA_ONLY));
    const external = parseMdTable(manual("AUTHORING.md"), "external-labels") ?? [];
    for (const row of external) allowed.add(row["라벨"] ?? "");
    for (const file of files()) {
      for (const label of collectUiLabels(tree(file))) expect(allowed, `${file}:${label.line} ${label.text}`).toContain(label.text);
    }
  });

  it("ARIA_ONLY의 경로가 사전에 실재한다 — 키 이름이 바뀌면 거름망이 조용히 비는 것을 막는다", () => {
    for (const path of ARIA_ONLY) {
      let value: unknown = en;
      for (const key of path.split(".")) value = value !== null && typeof value === "object" && Object.hasOwn(value, key) ? (value as Record<string, unknown>)[key] : undefined;
      expect(value, path).toBeDefined();
      expect(typeof value === "function", path).toBe(false);
    }
  });

  it("aria 전용 축 이름을 굵은 라벨로 쓰면 red다 (카나리아)", () => {
    const visible = dictionaryStrings(en, ARIA_ONLY);
    for (const axis of [en.logs.filters.axis.kind, en.logs.filters.axis.actor, en.translations.workspace.filters.state.axis]) expect(visible.has(axis), axis).toBe(false);
  });

  it("촬영 매핑의 dict: 소스가 사전의 문자열 키다 — 오타면 guide:check가 deleted만 말한다", () => {
    const rows = parseMdTable(manual("SHOOTING.md"), "shots") ?? [];
    const keys = shotDictKeys(rows.map((row) => ({ asset: row["에셋"] ?? "", sources: row["소스"] ?? "", blobs: row["blob"] ?? "" })));
    expect(keys.length).toBeGreaterThanOrEqual(2);
    for (const key of keys) expect(dictDigest(en, key), key).not.toBeNull();
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

  // 산문은 작은 수를 낱말로 쓴다("at least two characters") — `toContain(String(CONST))`로는 못 묶어 낱말 대응표를 둔다.
  // 상수가 표 밖 값으로 바뀌면 `undefined`가 들어가 red다(search-ux-unify C25).
  it("전역 검색 절의 숫자가 검색 상수와 같다", () => {
    const WORDS: Readonly<Record<number, string>> = { 2: "two", 5: "five" };
    const search = sectionByAnchor(tree("translate/edit.md"), "global-search");
    expect(search).toContain(`at least ${WORDS[KEY_QUERY_MIN]} characters`);
    expect(search).toContain(`up to ${WORDS[SEARCH_GROUP_LIMIT]} results`);
    expect(search).toContain(`first ${Q_MAX_LENGTH} characters`);
    // 그룹명은 라벨 게이트로 안 묶인다 — 같은 낱말이 사전의 다른 자리에 있어서다. 사전 값으로 직접 단언한다.
    for (const group of Object.values(en.search.groups)) expect(search, group).toContain(group);
  });

  // 에이전트 연결 조각의 정본은 가이드다 — `/mcp`의 Connect 카드를 걷은 뒤(2026-09-30) 앱 안 사본이 없다. 토큰은 원문이 아니라 환경변수 참조다.
  it("AI 에이전트 연결 조각이 토큰 원문 대신 MALMOI_TOKEN을 참조한다", () => {
    expect(sectionByAnchor(tree("ai-agents/token.md"), "token")).toContain("MALMOI_TOKEN");
    expect(sectionByAnchor(tree("ai-agents/prompts.md"), "push-token")).toContain("gh secret set PUSH_TOKEN --repo OWNER/REPO");
  });
});

function requirePathDir(file: string): string {
  const parts = file.split("/");
  parts.pop();
  return parts.join("/");
}
