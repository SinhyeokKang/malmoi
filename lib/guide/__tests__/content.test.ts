import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
import type { UiLocale } from "@/lib/i18n/locales";
import { BANNED_TERMS } from "@/lib/i18n/__tests__/helpers/banned-terms";
import { guideTrees, servedGuideFiles } from "./helpers/served";
import { collectLinks, collectUiLabels } from "../collect";
import { dictionaryStrings } from "../dictionary";
import { dictDigest, shotDictKeys } from "../stale";
import { parseMd, headings, toText } from "../parse";
import { sectionByAnchor, leadParagraph, parseMdTable } from "../sections";
import { flattenNav, parseSummary, slugToFile } from "../summary";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
// 비서빙 매뉴얼(AUTHORING·SHOOTING)은 언어와 무관하게 guide/ 루트다. 원고 게이트는 존재하는 언어 트리마다 돈다(ui-locales I3)
const MANUALS = join(ROOT, "guide");
const manual = (file: string) => parseMd(readFileSync(join(MANUALS, file), "utf8"));
const TREES = guideTrees(MANUALS);

/**
 * 그 언어의 사전 — **있는 것만**. 번역 원고와 사전은 다른 커밋에서 들어오므로 사전이 없는 언어의 라벨 대조는 사전이 들어올 때
 * 붙는다(dictionary-consistency와 같은 규칙). 원고가 고르는 라벨은 화면에 실제로 보이는 그 언어의 문자열이어야 한다.
 */
const DICTIONARIES: Partial<Record<UiLocale, unknown>> = Object.fromEntries(
  await Promise.all(
    TREES.filter(({ uiLocale }) => existsSync(join(ROOT, "messages", `${uiLocale}.tsx`))).map(async ({ uiLocale }) => {
      const mod: Record<string, unknown> = await import(pathToFileURL(join(ROOT, "messages", `${uiLocale}.tsx`)).href);
      // export 이름이 언어 코드와 다르면 라벨 대조가 조용히 skip된다 — skip은 "사전 파일이 없다" 한 뜻이어야 한다
      if (!Object.hasOwn(mod, uiLocale)) throw new Error(`messages/${uiLocale}.tsx must export \`${uiLocale}\``);
      return [uiLocale, mod[uiLocale]] as const;
    }),
  ),
);

/**
 * **인용한 화면 문장** — 산문의 `“…”`·`"…"`는 화면에서 그대로 찾을 문장이라 그 언어 사전에 있어야 한다(W4 R4 🟡3 — en 인용 하나가
 * 사전 문구 변경을 따라가지 못한 채 번역까지 물려받았다). 사전 밖 인용(외부 화면 문구)만 여기에 이유와 함께 둔다.
 */
const EXTERNAL_QUOTES: ReadonlySet<string> = new Set([
  // GitHub Actions가 막힌 action에 남기는 오류 문구 — `setup/allowed-actions.md`
  "not allowed to be used.",
]);

/** 산문의 글자 — 코드(스팬·블록)는 빼고 이미지 alt는 넣는다. alt도 독자가 읽는 문장이다. */
function proseTexts(value: ReturnType<typeof parseMd>): string[] {
  const out: string[] = [];
  visit(value, (node) => {
    if (node.type === "text") out.push(node.value);
    else if (node.type === "image" && node.alt) out.push(node.alt);
  });
  return out;
}

function quotedSentences(text: string): string[] {
  return [...text.matchAll(/“([^”]+)”|"([^"]+)"/g)].map((match) => match[1] ?? match[2] ?? "");
}

/**
 * 산문의 숫자 표현 — 작은 수는 낱말이라(`at least two characters`) `toContain(String(CONST))`로는 못 묶는다. 언어마다 문형이 다르다.
 * 상수가 표 밖 값으로 바뀌면 `undefined`가 들어가 red다(search-ux-unify C25). 트리가 있는데 행이 없는 언어도 red다.
 */
const SEARCH_PROSE: Partial<Record<UiLocale, { min: (n: number) => string; group: (n: number) => string; max: (n: number) => string }>> = {
  en: { min: (n) => `at least ${({ 2: "two" } as Record<number, string>)[n]} characters`, group: (n) => `up to ${({ 5: "five" } as Record<number, string>)[n]} results`, max: (n) => `first ${n} characters` },
  ko: { min: (n) => `${({ 2: "두" } as Record<number, string>)[n]} 글자 이상`, group: (n) => `${({ 5: "다섯" } as Record<number, string>)[n]} 개까지`, max: (n) => `앞의 ${n}자` },
  es: { min: (n) => `al menos ${({ 2: "dos" } as Record<number, string>)[n]} caracteres`, group: (n) => `hasta ${({ 5: "cinco" } as Record<number, string>)[n]} resultados`, max: (n) => `primeros ${n} caracteres` },
};

const CONTENT_FACTS: Record<UiLocale, { paid: RegExp; memberThreshold: RegExp; nameOrigin: RegExp }> = {
  en: { paid: /no paid plans/i, memberThreshold: /can exceed (?:that|the) threshold/i, nameOrigin: /1910s.+Korean dictionary/i },
  ko: { paid: /유료 플랜/, memberThreshold: /기준을 넘을 수/, nameOrigin: /1910년대.+조선어사전 편찬 사업/ },
  es: { paid: /no tiene planes de pago/i, memberThreshold: /puede superar ese umbral/i, nameOrigin: /década de 1910.+diccionario coreano/i },
};

/**
 * **접근 이름에만 붙는 사전 값** — 필터 트리거는 현재 값(`Any state`)을 보이고 축 이름(`State`)은 `aria-label`에만 있다.
 * 가이드가 이것을 굵게 쓰면 독자는 화면에 없는 글자를 찾는다(ux-drift-unify 7-#3). 다른 키에 같은 문자열이 보이는 라벨로
 * 있으면 그쪽 근거로 통과한다 — 이 목록은 값이 아니라 경로를 뺀다.
 */
const ARIA_ONLY: ReadonlySet<string> = new Set([
  "logs.filters.axis",
  "translations.workspace.filters.state.axis",
  // 헤더 Inbox(attention-inbox)의 트리거 이름·행 sr 낱말·불러오는 중 sr 문장 — 화면에 글자가 없다.
  "inbox.label",
  "inbox.unread",
  "inbox.loading",
  // LNB 프로젝트 밖 목록 구역의 랜드마크 이름(sidebar-projects) — 구역에 머리 줄이 없어 화면에 글자가 없다.
  "common.nav.yourProjects",
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

for (const { uiLocale, dir } of TREES) {
const read = (file: string) => readFileSync(join(dir, file), "utf8");
const tree = (file: string) => parseMd(read(file));
const files = () => servedGuideFiles(dir);
const nav = () => flattenNav(parseSummary(tree("SUMMARY.md")));
const dict = DICTIONARIES[uiLocale];

describe(`실물 가이드 본문 게이트 — ${uiLocale}`, () => {
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
      // TODO·TBD는 대문자만 센다 — 스페인어 원고의 낱말 "todo"(모두)는 자리표시자가 아니다
      expect(read(file)).not.toMatch(/\b(?:TODO|TBD)\b/);
      expect(read(file)).not.toMatch(/\blorem\b/i);
      const labels = new Set<string>();
      visit(value, "table", (table) => {
        const label = headingsBefore(value, table);
        expect(label, file).not.toBeNull();
        expect(labels.has(label!), `${file}: ${label}`).toBe(false);
        labels.add(label!);
      });
    }
  });

  it.skipIf(dict === undefined)("굵은 라벨은 그 언어 사전(보이는 문자열) 또는 AUTHORING 허용 목록에만 있다", () => {
    const allowed = new Set(dictionaryStrings(dict, ARIA_ONLY));
    const external = parseMdTable(manual("AUTHORING.md"), "external-labels") ?? [];
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

  it("FAQ and Reference carry the public decision facts, links, formats, and thresholds", () => {
    const facts = CONTENT_FACTS[uiLocale];
    const faq = read("faq.md");
    expect(faq).toMatch(facts.paid);
    expect(faq).toContain("MIT");
    expect(faq).toContain("ICU");
    expect(faq).not.toMatch(/Crowdin|Tolgee/i);
    expect(faq).not.toContain("mal-moi.com/privacy");
    expect(headings(tree("faq.md")).map(({ id }) => id)).toContain("not-supported");

    const formatsLead = leadParagraph(tree("reference/formats.md")) ?? "";
    for (const name of ["JSON", "YAML", "Chrome", "TypeScript", "JavaScript"]) expect(formatsLead).toContain(name);
    const formats = sectionByAnchor(tree("reference/formats.md"), "formats");
    for (const extension of [".json", ".yml", ".yaml", ".ts", ".tsx", ".js", ".mjs"]) expect(formats).toContain(extension);
    expect(formats).toContain("{locale}/common.json");

    const limitsLead = leadParagraph(tree("reference/limits.md")) ?? "";
    for (const fact of ["3", "10", "2 MB"]) expect(limitsLead).toContain(fact);
    expect(sectionByAnchor(tree("reference/limits.md"), "limits")).toMatch(facts.memberThreshold);

    expect(read("README.md")).toMatch(facts.nameOrigin);
    expect(leadParagraph(tree("README.md"))?.length ?? Infinity).toBeLessThanOrEqual(200);
    expect(leadParagraph(tree("account/preferences.md"))?.length ?? Infinity).toBeLessThanOrEqual(200);
  });

  // 산문은 작은 수를 낱말로 쓴다("at least two characters") — `toContain(String(CONST))`로는 못 묶어 낱말 대응표를 둔다.
  // 상수가 표 밖 값으로 바뀌면 `undefined`가 들어가 red다(search-ux-unify C25).
  it("전역 검색 절의 숫자가 검색 상수와 같다", () => {
    const prose = SEARCH_PROSE[uiLocale];
    expect(prose, `SEARCH_PROSE.${uiLocale}`).toBeDefined();
    const search = sectionByAnchor(tree("translate/edit.md"), "global-search");
    expect(search).toContain(prose!.min(KEY_QUERY_MIN));
    expect(search).toContain(prose!.group(SEARCH_GROUP_LIMIT));
    expect(search).toContain(prose!.max(Q_MAX_LENGTH));
  });

  // 그룹명은 라벨 게이트로 안 묶인다 — 같은 낱말이 사전의 다른 자리에 있어서다. 그 언어 사전 값으로 직접 단언한다.
  it.skipIf(dict === undefined)("전역 검색 절이 그 언어 사전의 그룹명을 쓴다", () => {
    const search = sectionByAnchor(tree("translate/edit.md"), "global-search");
    for (const group of Object.values((dict as typeof en).search.groups)) expect(search, group).toContain(group);
  });

  // 에이전트 연결 조각의 정본은 가이드다 — `/mcp`의 Connect 카드를 걷은 뒤(2026-09-30) 앱 안 사본이 없다. 토큰은 원문이 아니라 환경변수 참조다.
  it.skipIf(dict === undefined)("따옴표로 인용한 화면 문장은 그 언어 사전에 있다", () => {
    const allowed = dictionaryStrings(dict);
    for (const file of files()) {
      for (const quote of proseTexts(tree(file)).flatMap(quotedSentences)) {
        expect(allowed.has(quote) || EXTERNAL_QUOTES.has(quote), `${file}: “${quote}”`).toBe(true);
      }
    }
  });

  // 화면과 가이드가 한 개념을 다른 낱말로 부르면 독자가 가이드의 낱말을 화면에서 못 찾는다 — 사전과 같은 금지어 목록이다
  it.skipIf(!Object.hasOwn(BANNED_TERMS, uiLocale))("산문에 그 언어의 쓰지 않는 말이 없다 (DESIGN §10.1)", () => {
    const banned = BANNED_TERMS[uiLocale as keyof typeof BANNED_TERMS];
    const hits = files().flatMap((file) =>
      proseTexts(tree(file)).flatMap((text) => banned.filter(([word]) => text.includes(word)).map(([word, use]) => `${file}: ${word} → ${use}`)),
    );
    expect(hits).toEqual([]);
  });

  it("원고에 호스팅 서비스의 MCP 주소가 박혀 있지 않다 — 주소는 Copy server URL이 준다", () => {
    expect(read("ai-agents/README.md") + read("ai-agents/browser.md") + read("ai-agents/token.md")).not.toContain("mal-moi.com/api/mcp");
  });

  it("AI 에이전트 연결 조각이 토큰 원문 대신 MALMOI_TOKEN을 참조한다", () => {
    expect(sectionByAnchor(tree("ai-agents/token.md"), "token")).toContain("MALMOI_TOKEN");
    expect(sectionByAnchor(tree("ai-agents/prompts.md"), "push-token")).toContain("gh secret set PUSH_TOKEN --repo OWNER/REPO");
  });
});
}

describe("실물 가이드 — 사전 경로 (en)", () => {
  it("인용 추출 — 곡선·곧은 따옴표를 잡고 따옴표 없는 문장은 뺀다", () => {
    expect(quotedSentences("a (“Nothing to send.”) and \"Run\" then plain")).toEqual(["Nothing to send.", "Run"]);
    expect(quotedSentences("no quotes here")).toEqual([]);
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
});

function requirePathDir(file: string): string {
  const parts = file.split("/");
  parts.pop();
  return parts.join("/");
}
