import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { SELF_HOSTED_ENV } from "../preflight";

/**
 * **self-hosted 경로를 상시로 지키는 게이트** (self-hosting spec SH-15). 컨테이너 CI가 없으므로, hosted 전용 전제가 새로 들어오는
 * 순간을 `pnpm test`가 잡는다.
 *
 * ① hosted 도메인 리터럴·`MALMOI_ORIGIN`·`VERCEL_ENV`가 허용 목록 밖의 비테스트 소스에 0
 * ② `requireEnv`·`optionalEnv`가 읽는 env 이름 전부가 preflight 표(`SELF_HOSTED_ENV`)에 분류되고 `.env.example`과 맞는다
 *
 * ⚠️ **허용 목록은 파일별 개수다** — 파일 단위로만 열면 허용된 파일 안에 둘째 리터럴이 들어와도 못 본다. 개수가 줄어도 red다:
 * 읽기를 `lib/deployment/mode.ts`로 옮겼으면 그 커밋에서 행을 지운다(낡은 허용이 다음 추가를 덮지 않게).
 */

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));

const ROOTS = ["app", "components", "lib", "messages", "scripts"];
const ROOT_FILES = ["auth.ts", "middleware.ts", "next.config.ts", "prisma.config.ts"];
const SKIP_DIR = new Set(["__tests__", "node_modules", "generated"]);

/** `brand-spelling.test.ts`·`no-korean-ui.test.ts`와 같은 벗기기 — 정본은 `no-korean-ui.test.ts`다(테스트 모듈끼리 import하면 describe가 두 번 돈다). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/gm, "$1");
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".") || SKIP_DIR.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(tsx?|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

function scanned(): { path: string; source: string }[] {
  return [...ROOTS.flatMap((root) => sourceFiles(join(ROOT, root))), ...ROOT_FILES.map((f) => join(ROOT, f))]
    .map((file) => ({ path: relative(ROOT, file), source: stripComments(readFileSync(file, "utf8")) }));
}

// ── ① 리터럴·직접 읽기 허용 목록 ─────────────────────────────────────────

type Token = "hosted-domain" | "MALMOI_ORIGIN" | "VERCEL_ENV";

const TOKENS: Record<Token, RegExp> = {
  "hosted-domain": /mal-moi\.com/g,
  MALMOI_ORIGIN: /\bMALMOI_ORIGIN\b/g,
  VERCEL_ENV: /\bVERCEL_ENV\b/g,
};

/**
 * 파일별 허용 개수. **배포 모드·hosted 도메인의 집은 `lib/deployment/mode.ts`이고, 나머지 행은 이유가 있는 예외다.**
 */
const ALLOWED: Record<Token, Record<string, number>> = {
  "hosted-domain": {
    "lib/deployment/mode.ts": 2,
    // hosted 개인정보 방침 본문 — self-hosted의 `/privacy`는 운영자 정책으로 redirect한다(design §7).
    "messages/en.tsx": 1,
    "messages/ko-privacy.tsx": 1,
  },
  MALMOI_ORIGIN: {
    "lib/deployment/mode.ts": 4,
    // 주입된 env 맵을 판정한다 — 표의 이름과 사유 보고 자리다.
    "lib/deployment/preflight.ts": 2,
  },
  VERCEL_ENV: {
    "lib/deployment/mode.ts": 4,
    "lib/deployment/preflight.ts": 1,
    // hosted CSP 환경 판정 — Edge라 `lib/env.ts`를 못 쓴다.
    "middleware.ts": 1,
    // hosted robots — 비면 이미 `Disallow: /`다.
    "app/robots.ts": 1,
  },
};

function tokenCounts(files: { path: string; source: string }[], token: Token): Record<string, number> {
  const out: Record<string, number> = {};
  for (const { path, source } of files) {
    const count = [...source.matchAll(TOKENS[token])].length;
    if (count > 0) out[path] = count;
  }
  return out;
}

describe("SH-15 ① — hosted 리터럴·배포 모드 env의 직접 읽기는 허용 목록 안에서만", () => {
  it("스캐너가 실제로 파일을 걸었다", () => {
    expect(scanned().length).toBeGreaterThan(200);
    expect(scanned().some(({ path }) => path === "lib/deployment/mode.ts")).toBe(true);
  });

  it("벗기기가 주석 안의 리터럴을 세지 않고, 문자열 안의 URL은 남긴다", () => {
    expect(tokenCounts([{ path: "x.ts", source: stripComments("// mal-moi.com\n/* VERCEL_ENV */ const a = 1;") }], "hosted-domain")).toEqual({});
    expect(tokenCounts([{ path: "x.ts", source: stripComments('const a = "https://mal-moi.com";') }], "hosted-domain")).toEqual({ "x.ts": 1 });
  });

  it("새 리터럴이 하나 늘면 red다 — 허용된 파일 안이어도", () => {
    const files = [{ path: "lib/deployment/mode.ts", source: '"https://mal-moi.com" "https://dev.mal-moi.com" "https://mal-moi.com/x"' }];
    expect(tokenCounts(files, "hosted-domain")).not.toEqual({ "lib/deployment/mode.ts": ALLOWED["hosted-domain"]["lib/deployment/mode.ts"] });
  });

  // ⚠️ 이 테스트가 red면: 늘었으면 그 리터럴·읽기를 `lib/deployment/mode.ts`로 옮긴다. **줄었으면(읽기를 옮겼으면) `ALLOWED`의 그 행을
  // 같은 커밋에서 고치거나 지운다** — 낡은 허용이 다음 추가를 덮지 않게 개수가 정확히 같아야 통과한다.
  it.each(Object.keys(TOKENS) as Token[])("%s — 현재 트리가 허용 목록과 정확히 같다(줄었으면 ALLOWED 행을 고친다)", (token) => {
    expect(tokenCounts(scanned(), token)).toEqual(ALLOWED[token]);
  });
});

// ── ② env 이름 ↔ preflight 표 ↔ .env.example ──────────────────────────────

/** 이름을 조립하는 자리 — `lib/credentials/storage.ts`의 `${kind}_…`가 PII·TOKEN 둘로 펼쳐진다. 모르는 조립은 red다. */
const TEMPLATE_EXPANSIONS: Record<string, readonly string[]> = { "${kind}": ["PII", "TOKEN"] };

function callArguments(source: string): string[] {
  const out: string[] = [];
  for (const match of source.matchAll(/\b(?:requireEnv|optionalEnv)\(/g)) {
    let depth = 1;
    let i = match.index + match[0].length;
    const start = i;
    for (; i < source.length && depth > 0; i++) {
      if (source[i] === "(") depth++;
      else if (source[i] === ")") depth--;
    }
    out.push(source.slice(start, i - 1));
  }
  return out;
}

/** 호출 인자에서 env 이름을 뽑는다. 펼칠 수 없는 템플릿은 `unexpanded`로 돌려준다. */
function envNamesIn(source: string): { names: string[]; unexpanded: string[] } {
  const names = new Set<string>();
  const unexpanded: string[] = [];
  for (const args of callArguments(source)) {
    for (const m of args.matchAll(/"([A-Z][A-Z0-9_]*)"/g)) names.add(m[1]!);
    for (const m of args.matchAll(/`([^`]*)`/g)) {
      const template = m[1]!;
      const holes = template.match(/\$\{[^}]*\}/g) ?? [];
      const unknown = holes.filter((hole) => !Object.hasOwn(TEMPLATE_EXPANSIONS, hole));
      if (unknown.length > 0) { unexpanded.push(template); continue; }
      let expanded = [template];
      for (const hole of new Set(holes)) expanded = expanded.flatMap((t) => TEMPLATE_EXPANSIONS[hole]!.map((v) => t.replaceAll(hole, v)));
      for (const name of expanded) if (/^[A-Z][A-Z0-9_]*$/.test(name)) names.add(name); else unexpanded.push(template);
    }
  }
  return { names: [...names], unexpanded };
}

function exampleKeys(source: string): string[] {
  return [...source.matchAll(/^#?[ \t]*([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]!);
}

function envGateProblems(input: { read: readonly string[]; table: Readonly<Record<string, string>>; example: readonly string[] }): string[] {
  const problems: string[] = [];
  for (const name of input.read) if (!Object.hasOwn(input.table, name)) problems.push(`read but unclassified: ${name}`);
  for (const name of input.example) if (!Object.hasOwn(input.table, name)) problems.push(`in .env.example but unclassified: ${name}`);
  for (const [name, kind] of Object.entries(input.table)) {
    if ((kind === "required" || kind === "optional") && !input.example.includes(name)) problems.push(`${kind} but missing from .env.example: ${name}`);
  }
  return problems;
}

describe("SH-15 ② — env 이름 ↔ preflight 표 ↔ .env.example", () => {
  const read = () => {
    const results = scanned().map(({ source }) => envNamesIn(source));
    return { names: [...new Set(results.flatMap((r) => r.names))].sort(), unexpanded: results.flatMap((r) => r.unexpanded) };
  };
  const example = () => exampleKeys(readFileSync(join(ROOT, ".env.example"), "utf8"));

  it("뽑기가 리터럴·삼항·조립 이름을 다 건진다", () => {
    expect(envNamesIn('requireEnv("A_B"); optionalEnv(target === "prod" ? "C_PROD" : "C", env); requireEnv(`${kind}_KEYS`);').names.sort())
      .toEqual(["A_B", "C", "C_PROD", "PII_KEYS", "TOKEN_KEYS"]);
    expect(envNamesIn("requireEnv(`${other}_KEYS`)").unexpanded).toEqual(["${other}_KEYS"]);
  });

  it("스캐너가 실제 읽기를 건졌다 — 조용히 0건이 되지 않는다", () => {
    const { names, unexpanded } = read();
    expect(unexpanded).toEqual([]);
    for (const name of ["DATABASE_URL", "PII_ENCRYPTION_KEYS", "TOKEN_ENCRYPTION_KEYS", "DIRECT_URL_PROD", "RESEND_API_KEY"]) expect(names).toContain(name);
    expect(example().length).toBeGreaterThan(20);
  });

  it("어긋난 입력은 red다", () => {
    expect(envGateProblems({ read: ["NEW_VAR"], table: {}, example: [] })).toEqual(["read but unclassified: NEW_VAR"]);
    expect(envGateProblems({ read: [], table: {}, example: ["STRAY"] })).toEqual(["in .env.example but unclassified: STRAY"]);
    expect(envGateProblems({ read: [], table: { NEEDED: "required" }, example: [] })).toEqual(["required but missing from .env.example: NEEDED"]);
    expect(envGateProblems({ read: [], table: { ONLY_HOSTED: "hosted-only", CLI: "command" }, example: [] })).toEqual([]);
  });

  it("현재 트리가 맞는다", () => {
    expect(envGateProblems({ read: read().names, table: SELF_HOSTED_ENV, example: example() })).toEqual([]);
  });
});
