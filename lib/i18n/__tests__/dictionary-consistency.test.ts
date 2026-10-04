import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Messages } from "@/lib/i18n";
import { en } from "@/messages/en";

import { FUNCTION_ARGS } from "./helpers/function-args";

/**
 * **번역 사전 정합성** (ui-locales tasks B1). 키·함수 시그니처는 `satisfies Messages`가 컴파일 시점에 든다 — 여기는 그 밖이다:
 * ①en과 같은 문장(번역 누락) ②함수 값 ③빈 문장 ④용어 ⑥사전 import 자리 ⑦pull·push의 사전 0 ⑧영어 고정 표면의 입구.
 *
 * ⚠️ **검사 대상은 "존재하는 사전"이다** — ko만 있으면 ko만, 둘 다 있으면 둘 다. 사전이 없는 커밋에서는 ①~④가 비어 green이다
 * (⑥~⑧은 소스 검사라 늘 돈다). 사전 파일은 `export const <lang>`으로 사전을 내보낸다.
 */
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const TRANSLATED = ["ko", "es"] as const;
type Translated = (typeof TRANSLATED)[number];

const dictionaries: [Translated, Messages][] = [];
for (const lang of TRANSLATED) {
  const file = join(ROOT, "messages", `${lang}.tsx`);
  if (!existsSync(file)) continue;
  const mod = (await import(file)) as Record<string, unknown>;
  if (!Object.hasOwn(mod, lang)) throw new Error(`messages/${lang}.tsx must export \`${lang}\``);
  dictionaries.push([lang, mod[lang] as Messages]);
}

type Leaf = { path: string; text: string };

/** 보이는 글자 — JSX는 마크업으로 그려 태그까지 비교한다(같은 노드 삽입이 번역에서 빠지면 잡힌다). */
function shown(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(shown).join("");
  if (isValidElement(value)) return renderToStaticMarkup(value);
  return "";
}

/**
 * 사전을 펼친다. 함수는 **대표 인자 표**(`FUNCTION_ARGS`)로 호출한다 — 표가 `Messages`의 함수 경로 전부를 키로 가지므로
 * en에 함수가 늘면 typecheck가 표의 누락을 잡는다.
 */
/** `Messages`가 뺀 영어 고정 네임스페이스(orch D2) — 번역 사전에 없으므로 en에서도 펼치지 않는다. */
const ENGLISH_ONLY = new Set(["mcp", "seo", "crash", "publicDocs.privacy"]);

function leaves(value: unknown, path = "", out: Leaf[] = []): Leaf[] {
  if (ENGLISH_ONLY.has(path)) return out;
  if (typeof value === "string") out.push({ path, text: value });
  else if (typeof value === "function") {
    if (!Object.hasOwn(FUNCTION_ARGS, path)) throw new Error(`FUNCTION_ARGS has no row for ${path}`);
    const args = FUNCTION_ARGS[path as keyof typeof FUNCTION_ARGS] as readonly unknown[];
    out.push({ path, text: shown((value as (...a: readonly unknown[]) => unknown)(...args)) });
  } else if (isValidElement(value)) out.push({ path, text: shown(value) });
  else if (Array.isArray(value)) value.forEach((item, i) => leaves(item, `${path}[${i}]`, out));
  else if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) leaves(child, path === "" ? key : `${path}.${key}`, out);
  }
  return out;
}

/**
 * **en과 같아도 되는 키 경로** — 값이 아니라 경로로 허용한다(design §2): es에는 en과 철자가 같은 낱말(`Error`·`General`·`Total`)이 많아
 * 값으로 허용하면 다른 키의 누락까지 통과한다. 경로 하나가 그 아래 자식 전부를 덮는다(`a.b`는 `a.b.c`·`a.b[0]`을 덮고 `a.bc`는 안 덮는다).
 */
const SAME_AS_EN: Readonly<Record<Translated, readonly string[]>> = {
  // 랜딩 목업의 가짜 리포 데이터(파일명·키·커밋 수)는 일부러 en 그대로다(W2 요청 — 2026-10-04).
  ko: ["landing.mockup"],
  es: ["landing.mockup"],
};

const covers = (allowed: string, path: string): boolean =>
  path === allowed || path.startsWith(`${allowed}.`) || path.startsWith(`${allowed}[`);

/**
 * **쓰지 않는 말** — DESIGN §10.1 개념 표 ko·es 열의 정본을 그대로 든다(ui-locales B2). 표를 고치면 이 목록도 같은 커밋에서 고친다.
 * 형: `[쓰지 않는 말, 쓰는 말]`.
 */
const BANNED_TERMS: Readonly<Record<Translated, readonly (readonly [banned: string, use: string])[]>> = {
  ko: [["발행", "게시"]],
  es: [],
};

const enLeaves = new Map(leaves(en).map(({ path, text }) => [path, text]));

/** ① en과 같은 문장 중 허용 목록 밖의 경로. */
const untranslated = (found: readonly Leaf[], lang: Translated): string[] =>
  found.filter(({ path, text }) => enLeaves.get(path) === text && !SAME_AS_EN[lang].some((allowed) => covers(allowed, path))).map(({ path }) => path);
/** ③ en이 비어 있지 않은 자리의 빈 문장. */
const emptied = (found: readonly Leaf[]): string[] =>
  found.filter(({ path, text }) => text.trim() === "" && (enLeaves.get(path) ?? "").trim() !== "").map(({ path }) => path);
/** ④ 쓰지 않는 말. */
const bannedHits = (found: readonly Leaf[], lang: Translated): string[] =>
  found.flatMap(({ path, text }) => BANNED_TERMS[lang].filter(([banned]) => text.includes(banned)).map(([banned, use]) => `${path}: ${banned} → ${use}`));

describe.each(dictionaries)("사전 %s", (lang, dict) => {
  const found = leaves(dict);

  it("사전을 실제로 펼쳤다 — 0건은 방어선이 아니다", () => {
    expect(found.length).toBeGreaterThan(1000);
  });

  it("① en과 같은 문장은 허용 목록의 키 경로에만 있다 — 번역 누락", () => {
    expect(untranslated(found, lang)).toEqual([]);
  });

  it("③ 빈 문장이 없다 — en이 비어 있는 자리만 예외다", () => {
    expect(emptied(found)).toEqual([]);
  });

  it("④ 쓰지 않는 말이 없다 — DESIGN §10.1의 그 언어 열", () => {
    expect(bannedHits(found, lang)).toEqual([]);
  });

  /** POSTMORTEM 2026-09-14 — 남을 가리키는 문구는 도착한 화면에 실제로 있는 컨트롤을 부른다. 번역에서도 같다. */
  it("④ 링크 라벨이 도착 화면의 버튼 이름을 든다", () => {
    expect(dict.repositorySync.sendFirst).toContain(dict.translations.publish.button);
    expect(dict.projects.banner.action.send).toContain(dict.translations.publish.button);
  });
});

/** 사전이 아직 없는 커밋에서도 판정식이 공허하지 않다 — en을 조금 고친 가짜 사전으로 셋을 먹인다. */
describe("판정식 메타 — 가짜 사전", () => {
  const fake = (label: string) => leaves({ ...en, search: { ...en.search, label } });

  it("① 번역한 자리는 통과하고 en 그대로인 자리·함수 값은 잡히며 허용 경로는 빠진다", () => {
    const same = untranslated(fake("검색"), "ko");
    expect(same).not.toContain("search.label");
    expect(same).toContain("search.placeholder");
    expect(same).toContain("search.results");
    expect(same.some((path) => covers("landing.mockup", path))).toBe(false);
  });

  it("③ 빈 문장을 잡는다", () => {
    expect(emptied(fake(""))).toEqual(["search.label"]);
  });

  it("④ 쓰지 않는 말을 잡는다", () => {
    expect(bannedHits(fake("발행"), "ko")).toEqual(["search.label: 발행 → 게시"]);
  });
});

describe("허용 목록 메타", () => {
  it("SAME_AS_EN의 경로가 en에 실재한다 — 키 이름이 바뀌면 예외가 조용히 죽는다", () => {
    const paths = [...enLeaves.keys()];
    const stale = TRANSLATED.flatMap((lang) => SAME_AS_EN[lang].filter((allowed) => !paths.some((path) => covers(allowed, path))));
    expect(stale).toEqual([]);
  });

  it("경로 허용은 자식만 덮고 형제로 새지 않는다 (판정식 메타)", () => {
    expect(covers("a.b", "a.b")).toBe(true);
    expect(covers("a.b", "a.b.c")).toBe(true);
    expect(covers("a.b", "a.b[0]")).toBe(true);
    expect(covers("a.b", "a.bc")).toBe(false);
    expect(covers("a.b", "a")).toBe(false);
  });

  it("en을 펼치면 함수 값도 문장으로 나온다 — 대표 인자 표가 실제로 쓰인다", () => {
    expect(enLeaves.get("landing.hero.latest")).toBe(en.landing.hero.latest("X"));
    // JSX를 돌려주는 함수는 그려서 견준다 — 노드 자리에 대표 인자가 들어간다.
    expect(enLeaves.get("repositorySync.body")).toBe(shown(en.repositorySync.body("X")));
    expect(enLeaves.get("repositorySync.body")).toContain(" X ");
  });
});

// ── 소스 검사 ⑥~⑧ ───────────────────────────────────────────────────────────

const SKIP_DIR = new Set(["__tests__", "node_modules", "generated"]);
const SOURCE_ROOTS = ["app", "components", "lib", "messages", "scripts"];
const ROOT_FILES = ["auth.ts", "middleware.ts", "next.config.ts", "prisma.config.ts"];

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".") || SKIP_DIR.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(tsx?|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

const SOURCES = [...SOURCE_ROOTS.flatMap((dir) => sourceFiles(join(ROOT, dir))), ...ROOT_FILES.map((f) => join(ROOT, f)).filter(existsSync)]
  .map((file) => ({ path: relative(ROOT, file), code: readFileSync(file, "utf8") }));

/** 모듈 지정자 전부 — 정적(`from`)·부수효과(`import "…"`)·동적(`import("…")`)·재수출. `import type`은 `values`가 뺀다. */
function specifiers(code: string, { values = false } = {}): string[] {
  const body = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/gm, "$1");
  const out: string[] = [];
  for (const match of body.matchAll(/(?:^|[\s;])(import|export)(\s+type)?\b([^;"'`]*?)\bfrom\s*["']([^"']+)["']/g)) {
    if (values && match[2] !== undefined) continue;
    out.push(match[4] ?? "");
  }
  for (const match of body.matchAll(/(?:^|[\s;])import\s*["']([^"']+)["']/g)) out.push(match[1] ?? "");
  for (const match of body.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) out.push(match[1] ?? "");
  return out;
}

const importers = (pattern: RegExp, { values = false } = {}): string[] =>
  SOURCES.filter(({ code }) => specifiers(code, { values }).some((spec) => pattern.test(spec))).map(({ path }) => path).sort();

describe("소스 검사 — 사전을 어디서 읽나", () => {
  it("스캐너가 지정자 셋(정적·부수효과·동적)을 집고 주석·타입 import는 가린다 (메타)", () => {
    const code = [
      'import { ko } from "@/messages/ko";',
      'import "@/messages/es";',
      'const p = import("@/messages/ko-privacy");',
      'import type { Messages } from "@/lib/i18n";',
      '// import { x } from "@/messages/zz";',
      'export { y } from "./y";',
    ].join("\n");
    expect(specifiers(code)).toEqual(["@/messages/ko", "@/lib/i18n", "./y", "@/messages/es", "@/messages/ko-privacy"]);
    expect(specifiers(code, { values: true })).toEqual(["@/messages/ko", "./y", "@/messages/es", "@/messages/ko-privacy"]);
  });

  it("스캐너가 실제 소스를 걸었다 — 0건은 방어선이 아니다", () => {
    expect(SOURCES.length).toBeGreaterThan(500);
    expect(importers(/(^|\/)messages\/en(\.tsx)?$/).length).toBeGreaterThan(0);
  });

  /** design §3.3 — 다른 클라이언트 모듈이 ko·es를 import하면 그 순간 모든 사용자 번들에 실린다. 방침 ko 본도 페이지 하나만 읽는다(§8). */
  it.each([
    // 서버 입구(`lib/i18n/server.ts`, server-only)는 클라이언트 그래프 밖이라 번들에 싣지 않는다.
    ["ko", ["components/i18n/ko-messages.ts", "lib/i18n/server.ts"]],
    ["es", ["components/i18n/es-messages.ts", "lib/i18n/server.ts"]],
    ["ko-privacy", ["app/privacy/page.tsx"]],
  ] as const)("⑥ messages/%s를 import하는 비테스트 소스는 정해진 파일뿐이다", (name, allowed) => {
    const extra = importers(new RegExp(`(^|/)messages/${name}(\\.tsx)?$`)).filter((path) => !(allowed as readonly string[]).includes(path));
    expect(extra).toEqual([]);
  });

  /** design §10 — cron에는 누구의 언어로 쓸지 정할 사용자가 없다. pull·push 결과는 코드를 싣고 문장은 받는 쪽이 조립한다(B1′). */
  it("⑦ lib/pull/**·lib/push/**는 사전을 값으로 import하지 않는다", () => {
    const offenders = SOURCES
      .filter(({ path }) => path.startsWith("lib/pull/") || path.startsWith("lib/push/"))
      .filter(({ code }) => specifiers(code, { values: true }).some((spec) => /^@\/lib\/i18n(\/|$)|(^|\/)messages\//.test(spec) || /^\.\.?\/.*i18n/.test(spec)))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  /**
   * design §3.2 — 공유 코어는 `m`을 인자로만 받는다. 코어가 스스로 언어를 물으면 MCP 응답이 요청자의 언어를 따라간다.
   * 영어 고정 표면(MCP·초대 메일·SEO)은 요청의 사전 입구(`getMessages`·`useMessages`)를 쓰지 않는다.
   */
  it("⑧ 영어 고정 표면은 요청의 사전 입구를 읽지 않고, lib/**는 lib/i18n/server를 읽지 않는다", () => {
    const entry = /^@\/lib\/i18n\/server$|^@\/components\/i18n\/messages-provider$/;
    const fixed = SOURCES
      .filter(({ path }) => ["lib/mcp/", "lib/invitation-email/", "lib/seo/"].some((prefix) => path.startsWith(prefix)))
      .filter(({ code }) => specifiers(code).some((spec) => entry.test(spec)))
      .map(({ path }) => path);
    expect(fixed).toEqual([]);
    const core = SOURCES
      .filter(({ path }) => path.startsWith("lib/") && path !== "lib/i18n/server.ts")
      .filter(({ code }) => specifiers(code).some((spec) => /^@\/lib\/i18n\/server$|(^|\/)i18n\/server$/.test(spec)))
      .map(({ path }) => path);
    expect(core).toEqual([]);
  });
});
