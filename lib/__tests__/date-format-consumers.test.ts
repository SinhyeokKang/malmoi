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

/**
 * ② **공개 셸은 로그인 여부와 무관하게 UTC다**(user-timezone design §4) — changelog의 `Dates are in UTC.`가 참이어야 한다.
 * 공개 셸 경로가 보는 사람의 날짜 형 입구(`getDateStyle`·`useDateStyle`)를 읽으면 로그인한 방문자에게 그 시간대가 샌다.
 * ③ **공유 코어(`lib/**`)는 `getDateStyle`을 부르지 않는다** — 코어가 스스로 물으면 MCP 응답이 요청자의 시간대를 따라간다(ui-locales B1⑧ 확장).
 * ⚠️ 둘 다 부정 검사라 입구 이름이 바뀌면 공허하게 green이다 — 센티넬이 입구가 그 이름으로 export되는지 먼저 본다.
 */
const PUBLIC_SHELL = [
  "app/page.tsx", "app/changelog/", "app/privacy/", "app/docs/",
  // 세션 없이 도는 계정 병합 확인 — 보는 사람의 계정이 정해지기 전이라 고를 시간대가 없다(design §4 고정 표면).
  "app/signin/link/[challenge]/",
  "components/public-shell/", "components/changelog/", "components/privacy/", "components/landing/", "components/docs/",
];

it("센티넬 — 날짜 형 입구가 그 이름으로 export된다", () => {
  expect(readFileSync("lib/i18n/server.ts", "utf8")).toMatch(/export const getDateStyle\b/);
  expect(readFileSync("components/i18n/messages-provider.tsx", "utf8")).toMatch(/export function useDateStyle\b/);
});

it("공개 셸 경로가 getDateStyle·useDateStyle을 읽지 않는다", () => {
  const files = scanned().filter(({ path }) => PUBLIC_SHELL.some((prefix) => path === prefix || path.startsWith(prefix)));
  expect(files.length).toBeGreaterThan(5);
  expect(files.filter(({ text }) => /\b(getDateStyle|useDateStyle)\b/.test(text)).map(({ path }) => path)).toEqual([]);
});

it("lib/**는 getDateStyle을 읽지 않는다 (lib/i18n/server.ts 자신 제외)", () => {
  const core = scanned().filter(({ path }) => path.startsWith("lib/") && path !== "lib/i18n/server.ts");
  expect(core.filter(({ text }) => /\bgetDateStyle\b/.test(text)).map(({ path }) => path)).toEqual([]);
});

/**
 * ⑤ **생산자를 우회한 시각이 없다** — `toISOString().slice(11, 16)`은 라벨 없는 UTC `HH:mm`이다(옛 Logs 행). 시각은 `formatClock`·`formatMinute`가 낸다.
 * 같은 자리를 `substring`·`substr`로 잘라도 같은 우회다.
 */
it("app/**·components/**에 toISOString()의 11번째 글자부터 자르는 시각이 0건이다", () => {
  const ui = scanned().filter(({ path }) => path.startsWith("app/") || path.startsWith("components/"));
  expect(ui.filter(({ text }) => /toISOString\(\)\.(slice|substring|substr)\(11/.test(text)).map(({ path }) => path)).toEqual([]);
});

/**
 * ⑥ **앱 화면은 보는 사람의 시간대를 넘긴다** — `timeZone: "UTC"` 리터럴은 고정 표면에만 선다(design §4). 앱 화면의 호출부가 `"UTC"`로
 * 되돌아가면(T1이 이름만 옮기며 둔 자리처럼) 출력이 지금과 바이트 같아 다른 테스트가 green인 채로 사용자 시간대가 조용히 사라진다.
 * 그래서 리터럴이 나오는 파일 집합이 허용 목록과 **정확히** 같아야 한다 — 새 고정 표면은 이유와 함께 여기 등재한다.
 */
const FIXED_UTC = [
  // 세션 없는 계정 병합 확인 — 고를 시간대가 아직 없다.
  "app/signin/link/[challenge]/page.tsx",
  // 공개 셸 — changelog의 `Dates are in UTC.`가 로그인 여부와 무관하게 참이어야 한다.
  "components/changelog/release-entry.tsx",
  // 공개 셸 — 방침 시행일·개정 이력은 모두에게 같은 날짜다.
  "components/privacy/privacy-doc.tsx",
  // provider 밖(global-error·provider 없는 DOM 테스트)의 기본값 — 고르지 않은 사람과 같은 UTC다.
  "components/i18n/messages-provider.tsx",
  // MCP는 세션·쿠키를 읽지 않아 보는 사람의 시간대가 없다(④).
  "lib/mcp/tools/project.ts",
];

it("timeZone: \"UTC\" 리터럴이 나오는 app/**·components/**·lib/** 파일이 고정 표면 목록과 정확히 같다", () => {
  const files = scanned()
    .filter(({ path }) => ["app/", "components/", "lib/"].some((prefix) => path.startsWith(prefix)))
    .filter(({ text }) => /\btimeZone\s*:\s*["']UTC["']/.test(text))
    .map(({ path }) => path)
    .sort();
  expect(files).toEqual([...FIXED_UTC].sort());
});
