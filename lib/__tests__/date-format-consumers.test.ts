import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

/**
 * **한 개념 안에서 날짜 형이 갈리지 않는다** (ux-drift-unify 2-Y19). 보관 시각은 날짜만(`formatDay` — Logs의 "Archived on {date}."와 같다),
 * 가입 시점은 달(`formatMonth`)이고 둘 다 `lib/date-format.ts`가 만든다 — 로케일 포맷터(`Intl`)는 ICU·TZ에 기대므로 화면 코드에 두지 않는다.
 */
it("계정 병합 확인의 가입 시점이 formatMonth다 — Intl을 쓰지 않는다", () => {
  const src = readFileSync("app/signin/link/[challenge]/page.tsx", "utf8");
  expect(src).toContain("formatMonth(");
  expect(src).not.toContain("Intl.");
});

it("Settings 보관 카드의 보관 시각이 날짜만이다", () => {
  const src = readFileSync("app/(edit)/projects/[slug]/settings/page.tsx", "utf8");
  expect(src).toContain("formatDay(project.archivedAt");
  expect(src).not.toContain("formatMinute");
});

const SOURCE_ROOTS = ["app", "components", "lib", "messages"];
const ROOT_FILES = ["auth.ts", "middleware.ts"];
const SKIP = new Set(["__tests__", "node_modules", "generated"]);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name.startsWith(".") || SKIP.has(name)) return [];
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

/** 주석 속 언급은 세지 않는다 — 규칙을 설명하는 주석이 규칙을 어기는 것은 아니다. */
const code = (path: string) => readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/gm, "$1");

const scanned = () => [...SOURCE_ROOTS.flatMap(sources), ...ROOT_FILES].map((path) => ({ path, text: code(path) }));

/**
 * ① **`Intl.DateTimeFormat`은 `lib/date-format.ts`에서만** 쓴다(user-timezone A4) — 그 파일이 `timeZone`을 명시한 숫자 부품 추출에만 쓴다.
 * 다른 자리에서 쓰면 런타임 TZ·ICU 로케일 문자열이 화면에 새고, 서버와 브라우저가 다른 글자를 낸다(하이드레이션).
 */
it("스캐너가 실제로 파일을 걸었다 — 조용히 0건이 되지 않는다", () => {
  expect(scanned().length).toBeGreaterThan(100);
  expect(scanned().some(({ path }) => path === "lib/date-format.ts")).toBe(true);
});

it("Intl.DateTimeFormat은 lib/date-format.ts에서만 쓴다", () => {
  expect(scanned().filter(({ text }) => text.includes("DateTimeFormat")).map(({ path }) => path)).toEqual(["lib/date-format.ts"]);
});

it("날짜·시각의 toLocale* 포맷터가 0건이다 (POSTMORTEM 2026-09-20)", () => {
  expect(scanned().filter(({ text }) => /\.toLocale(Date|Time)String\(/.test(text)).map(({ path }) => path)).toEqual([]);
});

/**
 * ④ **MCP `list_events`는 UTC 자정으로 끊는다** — MCP는 세션·쿠키를 읽지 않아 보는 사람의 시간대가 없다. 공유 코어 `loadEvents`가
 * 시간대를 필수로 받으므로 호출부가 명시한다.
 */
it("MCP의 loadEvents 호출이 전부 timeZone: \"UTC\"를 넘긴다", () => {
  const src = readFileSync("lib/mcp/tools/project.ts", "utf8");
  const calls = src.match(/\bloadEvents\(/g) ?? [];
  expect(calls.length).toBeGreaterThan(0);
  expect(src.match(/\bloadEvents\([^;]*\{ timeZone: "UTC" \}\);/g) ?? []).toHaveLength(calls.length);
});
