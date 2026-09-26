import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { headings, parseMd } from "@/lib/guide/parse";
import { flattenNav, parseSummary, slugToFile } from "@/lib/guide/summary";

/**
 * **앱이 가리키는 문서 링크가 원고에 실재한다** — `routes.docs(page?, anchor?)`의 호출을 `app`·`components`·`lib`에서
 * 전수로 읽는다. 경로 문자열은 타입이 못 보고(POSTMORTEM 2026-09-05), 원고의 제목·앵커는 설정 화면과 다른 커밋에서 움직인다.
 *
 * ⚠️ **인자가 리터럴이 아니면 red다** — 변수면 어느 페이지를 가리키는지 소스에서 판정할 수 없다. SUMMARY에서 온 slug를
 * 잇는 자리는 `docHref`(`lib/guide/href.ts`)이고 이 생성기를 부르지 않는다.
 */
const ROOT = process.cwd();
const GUIDE = join(ROOT, "guide");
const SKIP = new Set(["__tests__", "node_modules"]);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

/** 주석 속 `routes.docs(…)` 예시는 호출이 아니다. */
const bare = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/gm, "$1");

type Call = { at: string; args: string[] };

export function docsCalls(source: string, at: string): Call[] {
  return [...bare(source).matchAll(/routes\.docs\(([^)]*)\)/g)].map((match) => ({
    at,
    args: (match[1] ?? "").split(",").map((arg) => arg.trim()).filter((arg) => arg !== ""),
  }));
}

const LITERAL = /^"([^"\\]*)"$/;

describe("docsCalls — 스캐너", () => {
  it("인자 없는 호출 · 리터럴 둘 · 변수를 가른다", () => {
    const calls = docsCalls('a(routes.docs()); b(routes.docs("setup/workflow", "workflow")); c(routes.docs(slug)); // routes.docs(x)', "x.ts");
    expect(calls.map((call) => call.args)).toEqual([[], ['"setup/workflow"', '"workflow"'], ["slug"]]);
  });
});

describe("`routes.docs(...)` 호출 대상", () => {
  const files = flattenNav(parseSummary(parseMd(readFileSync(join(GUIDE, "SUMMARY.md"), "utf8")))).map((item) => item.file);
  const calls = ["app", "components", "lib"].flatMap((dir) =>
    sources(join(ROOT, dir)).flatMap((path) => docsCalls(readFileSync(path, "utf8"), relative(ROOT, path))),
  );

  it("호출을 실제로 찾았다 — 0건 통과를 성공으로 읽지 않는다", () => {
    expect(calls.length).toBeGreaterThan(4);
    expect(calls.some((call) => call.args.length === 2)).toBe(true);
  });

  it("인자가 전부 문자열 리터럴이다", () => {
    const loose = calls.filter((call) => call.args.length > 2 || call.args.some((arg) => !LITERAL.test(arg)));
    expect(loose.map((call) => `${call.at}: routes.docs(${call.args.join(", ")})`)).toEqual([]);
  });

  it("대상 페이지와 앵커가 원고에 있다", () => {
    const missing = calls.flatMap((call) => {
      const [page = "", anchor] = call.args.map((arg) => LITERAL.exec(arg)?.[1] ?? "");
      const file = slugToFile(page === "" ? [] : page.split("/"), files);
      if (file === null) return [`${call.at}: page "${page}"`];
      if (anchor === undefined) return [];
      const ids = headings(parseMd(readFileSync(join(GUIDE, file), "utf8"))).map((heading) => heading.id);
      return ids.includes(anchor) ? [] : [`${call.at}: ${page}#${anchor}`];
    });
    expect(missing).toEqual([]);
  });
});
