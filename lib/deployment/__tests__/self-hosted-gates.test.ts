import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { ts } from "ts-morph";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

import { LOGIN_PROVIDER_ENV } from "@/lib/auth/login-providers";

import { SELF_HOSTED_ENV } from "../preflight";
import { NIGHTLY_PULL } from "../schedule";

/**
 * **self-hosted 경로를 상시로 지키는 게이트** (self-hosting spec SH-15). 컨테이너 CI가 없으므로, hosted 전용 전제가 새로 들어오는
 * 순간을 `pnpm test`가 잡는다.
 *
 * ① hosted 도메인 리터럴·`MALMOI_ORIGIN`·`VERCEL_ENV`가 허용 목록 밖의 비테스트 소스에 0
 * ② `requireEnv`·`optionalEnv`가 읽는 env 이름 전부가 preflight 표(`SELF_HOSTED_ENV`)에 분류되고 `.env.example`·compose 예제와 맞는다.
 *   `process.env` 직접 읽기와 Auth.js의 암묵 읽기도 센다
 * ③ Dockerfile의 Node 메이저 == `.nvmrc`, pnpm == `packageManager`, `.npmrc`가 설치 전에 이미지에 복사된다
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
    // 점 디렉터리를 건너뛰지 않는다 — `app/.well-known/**`가 OAuth issuer·resource를 광고하는 생산 엔드포인트다(Astra 교차 리뷰 🟡2).
    if (SKIP_DIR.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(tsx?|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

/** `source`는 주석을 벗긴 문자열(① 토큰 세기), `raw`는 원문(② AST 뽑기 — 정규식 벗기기가 문자열 안의 `/*`를 깨지 않게)이다. */
function scanned(): { path: string; source: string; raw: string }[] {
  return [...ROOTS.flatMap((root) => sourceFiles(join(ROOT, root))), ...ROOT_FILES.map((f) => join(ROOT, f))].map((file) => {
    const raw = readFileSync(file, "utf8");
    return { path: relative(ROOT, file), source: stripComments(raw), raw };
  });
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

  // 점으로 시작하는 디렉터리를 건너뛰었을 때 OAuth issuer·resource를 광고하는 생산 엔드포인트가 통째로 빠졌다(Astra 교차 리뷰 🟡2).
  it("`app/.well-known/**`도 건다 — 외부에 origin을 광고하는 엔드포인트다", () => {
    const paths = scanned().map(({ path }) => path);
    expect(paths).toContain("app/.well-known/oauth-authorization-server/route.ts");
    expect(paths).toContain("app/.well-known/oauth-protected-resource/api/mcp/route.ts");
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

/**
 * 해석할 수 없는 읽기의 허용 목록 — 파일별로 정확히 같아야 한다. 늘면 이름을 리터럴로 넘기고, 줄면 행을 고친다.
 * `storage.ts`는 실패를 `CredentialError`로 바꾸는 같은 파일의 래퍼(`requireEnv(name)` → `readEnv(name)`)이고, 그 래퍼의 호출은 이름이
 * `requireEnv`라 리터럴로 읽힌다.
 */
const UNRESOLVED_ALLOWED: Record<string, string[]> = { "lib/credentials/storage.ts": ["name"] };

const ENV_READERS: ReadonlySet<string> = new Set(["requireEnv", "optionalEnv"]);
const ENV_NAME = /^[A-Z][A-Z0-9_]*$/;

/** 이름 인자를 펼친다 — 리터럴·삼항·괄호·`TEMPLATE_EXPANSIONS`의 조립만 읽고, 그 밖은 원문 그대로 `unresolved`다. */
function resolveEnvArgument(node: ts.Expression, file: ts.SourceFile): { names: string[]; unresolved: string[] } {
  if (ts.isParenthesizedExpression(node)) return resolveEnvArgument(node.expression, file);
  if (ts.isConditionalExpression(node)) {
    const [a, b] = [resolveEnvArgument(node.whenTrue, file), resolveEnvArgument(node.whenFalse, file)];
    return { names: [...a.names, ...b.names], unresolved: [...a.unresolved, ...b.unresolved] };
  }
  let candidates: string[] | undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) candidates = [node.text];
  else if (ts.isTemplateExpression(node)) {
    candidates = [node.head.text];
    for (const span of node.templateSpans) {
      const hole = `\${${span.expression.getText(file)}}`;
      if (!Object.hasOwn(TEMPLATE_EXPANSIONS, hole)) { candidates = undefined; break; }
      candidates = candidates.flatMap((prefix) => TEMPLATE_EXPANSIONS[hole]!.map((value) => prefix + value + span.literal.text));
    }
  }
  if (candidates === undefined || !candidates.every((name) => ENV_NAME.test(name))) return { names: [], unresolved: [node.getText(file)] };
  return { names: candidates, unresolved: [] };
}

/**
 * `requireEnv`·`optionalEnv` 호출의 env 이름을 AST로 뽑는다(별칭 import 포함). **해석하지 못한 인자와 값으로 넘긴 함수는 `unresolved`다** —
 * 정규식 뽑기는 작은따옴표·식별자 인자를 조용히 흘렸다(Astra 교차 리뷰 🟡2, POSTMORTEM 2026-09-08 "검사 밖의 대상은 계속 green").
 */
function envNamesIn(source: string, fileName = "x.tsx"): { names: string[]; unresolved: string[] } {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const readers = new Set(ENV_READERS);
  file.forEachChild(function collect(node) {
    if (ts.isImportSpecifier(node) && ENV_READERS.has((node.propertyName ?? node.name).text)) readers.add(node.name.text);
    node.forEachChild(collect);
  });

  const names = new Set<string>();
  const unresolved: string[] = [];
  file.forEachChild(function visit(node) {
    if (ts.isIdentifier(node) && readers.has(node.text)) {
      const parent = node.parent;
      const callee = ts.isCallExpression(parent) && parent.expression === node;
      const declared = ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent) || (ts.isFunctionDeclaration(parent) && parent.name === node);
      if (callee) {
        const [arg] = parent.arguments;
        if (arg === undefined) unresolved.push("(no argument)");
        else {
          const result = resolveEnvArgument(arg, file);
          for (const name of result.names) names.add(name);
          unresolved.push(...result.unresolved);
        }
      } else if (!declared) unresolved.push(node.text);
    }
    node.forEachChild(visit);
  });
  return { names: [...names], unresolved };
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
    const names = new Set<string>();
    const unresolved: Record<string, string[]> = {};
    for (const { path, raw } of scanned()) {
      const result = envNamesIn(raw, path);
      for (const name of result.names) names.add(name);
      if (result.unresolved.length > 0) unresolved[path] = result.unresolved;
    }
    return { names: [...names].sort(), unresolved };
  };
  const example = () => exampleKeys(readFileSync(join(ROOT, ".env.example"), "utf8"));

  it("뽑기가 리터럴·삼항·조립 이름을 다 건진다", () => {
    expect(envNamesIn('requireEnv("A_B"); optionalEnv(target === "prod" ? "C_PROD" : "C", env); requireEnv(`${kind}_KEYS`);').names.sort())
      .toEqual(["A_B", "C", "C_PROD", "PII_KEYS", "TOKEN_KEYS"]);
    expect(envNamesIn("requireEnv(`${other}_KEYS`)").unresolved).toEqual(["`${other}_KEYS`"]);
  });

  // 정규식 뽑기는 아래 모양을 `{ names: [], unexpanded: [] }`로 흘려 새 의존성이 green으로 나갔다(Astra 교차 리뷰 🟡2).
  it("작은따옴표·템플릿 리터럴·별칭 import도 이름으로 읽는다", () => {
    expect(envNamesIn("requireEnv('NEW_SECRET')").names).toEqual(["NEW_SECRET"]);
    expect(envNamesIn("optionalEnv(`PLAIN_TEMPLATE`)").names).toEqual(["PLAIN_TEMPLATE"]);
    expect(envNamesIn('import { requireEnv as readEnv } from "@/lib/env";\nreadEnv("ALIASED");').names).toEqual(["ALIASED"]);
    expect(envNamesIn('import { optionalEnv as o } from "../lib/env";\no(("WRAPPED"));').names).toEqual(["WRAPPED"]);
  });

  it("해석할 수 없는 인자·값으로 넘긴 함수는 명시적으로 실패한다", () => {
    expect(envNamesIn('const name = "NEW_SECRET"; requireEnv(name)')).toEqual({ names: [], unresolved: ["name"] });
    expect(envNamesIn('requireEnv(prefix + "_KEY")').unresolved).toEqual(['prefix + "_KEY"']);
    expect(envNamesIn("requireEnv()").unresolved).toEqual(["(no argument)"]);
    expect(envNamesIn('requireEnv("lower_case")').unresolved).toEqual(['"lower_case"']);
    expect(envNamesIn('["A"].map(optionalEnv)').unresolved).toEqual(["optionalEnv"]);
    expect(envNamesIn('import { requireEnv as readEnv } from "@/lib/env";\nconst f = readEnv;').unresolved).toEqual(["readEnv"]);
  });

  it("주석·선언은 읽기가 아니다", () => {
    expect(envNamesIn('// requireEnv("IN_COMMENT")\nexport function requireEnv(name: string) { return name; }')).toEqual({ names: [], unresolved: [] });
  });

  it("스캐너가 실제 읽기를 건졌다 — 조용히 0건이 되지 않는다", () => {
    const { names, unresolved } = read();
    expect(unresolved).toEqual(UNRESOLVED_ALLOWED);
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

// ── ②-b 직접 읽기 — `requireEnv`·`optionalEnv`를 지나지 않는 env (B1 리뷰 🟡4) ──────────────────

/**
 * `process.env.X`·`process.env["X"]`·`process.env[변수]`·`process.env` 통째 넘기기를 파일별·이름별 개수로 센다. ②의 뽑기는
 * `requireEnv`·`optionalEnv` 인자만 보므로, 여기를 지나지 않으면 새 직접 읽기가 preflight 표 밖으로 조용히 빠진다.
 * `*`는 맵 통째(주입 기본값·판정 입력), `[]`는 계산된 이름이다 — 둘 다 받는 쪽이 무엇을 읽는지 사람이 봐야 한다.
 */
const DIRECT_READS_ALLOWED: Record<string, Record<string, number>> = {
  "components/analytics.tsx": { NODE_ENV: 1 },
  "lib/app-version.ts": { APP_VERSION: 1 },
  "lib/env.ts": { "*": 2 },
  "lib/operator/user.ts": { "*": 1 },
  "lib/credentials/command.ts": { "*": 1 },
  "lib/deployment/mode.ts": { MALMOI_ORIGIN: 1, VERCEL_ENV: 1 },
  "middleware.ts": { NODE_ENV: 1, VERCEL_ENV: 1 },
  "prisma.config.ts": { PRISMA_TARGET: 1, "[]": 1 },
  "scripts/finalize-credentials.ts": { "*": 1 },
  "scripts/preflight.ts": { "*": 1 },
};

/** 앱 설정이 아니라 플랫폼·빌드·스크립트가 세우는 이름 — preflight 표에 들지 않는다. */
const NOT_OPERATOR_SET: Record<string, string> = {
  NODE_ENV: "next가 세운다",
  APP_VERSION: "next.config.ts의 env가 빌드 때 박는다",
  PRISMA_TARGET: "package.json 스크립트·finalizeDeploy가 세운다",
};

function directReads(source: string): Record<string, number> {
  const out: Record<string, number> = Object.create(null);
  for (const m of source.matchAll(/\bprocess\.env\b(?:\.([A-Za-z_][A-Za-z0-9_]*)|\[\s*(?:"([^"]+)"|'([^']+)'|[^\]]*)\])?/g)) {
    const name = m[1] ?? m[2] ?? m[3] ?? (m[0].includes("[") ? "[]" : "*");
    out[name] = (out[name] ?? 0) + 1;
  }
  return out;
}

describe("SH-15 ② — process.env 직접 읽기는 파일별 허용 목록 안에서만 (🟡4)", () => {
  const current = () => {
    const out: Record<string, Record<string, number>> = {};
    for (const { path, source } of scanned()) {
      const reads = directReads(source);
      if (Object.keys(reads).length > 0) out[path] = { ...reads };
    }
    return out;
  };

  it("모양마다 이름을 가른다", () => {
    expect({ ...directReads('process.env.A; process.env["B"]; process.env[t]; f(process.env); process.env.A') })
      .toEqual({ A: 2, B: 1, "[]": 1, "*": 1 });
  });

  it("현재 트리가 허용 목록과 정확히 같다 — 늘면 requireEnv·optionalEnv로 옮기고, 줄면 행을 고친다", () => {
    expect(current()).toEqual(DIRECT_READS_ALLOWED);
  });

  it("직접 읽는 이름도 전부 preflight 표에 분류되거나 플랫폼이 세운다", () => {
    const names = Object.values(DIRECT_READS_ALLOWED).flatMap((reads) => Object.keys(reads)).filter((n) => n !== "*" && n !== "[]");
    for (const name of names) expect(Object.hasOwn(SELF_HOSTED_ENV, name) || Object.hasOwn(NOT_OPERATOR_SET, name), name).toBe(true);
  });
});

// ── ②-c Auth.js가 암묵적으로 읽는 provider 자격증명 (🟡4) ───────────────────────────────────────

/** `next-auth/providers/<id>` import에서 provider id를 뽑는다. Auth.js v5는 `AUTH_<ID>_ID`·`AUTH_<ID>_SECRET`을 스스로 읽는다. */
function authProviders(source: string): string[] {
  return [...source.matchAll(/from\s+["']next-auth\/providers\/([a-z0-9-]+)["']/g)].map((m) => m[1]!);
}

function providerEnvNames(id: string): string[] {
  const upper = id.toUpperCase().replaceAll("-", "_");
  return [`AUTH_${upper}_ID`, `AUTH_${upper}_SECRET`];
}

describe("SH-15 ② — Auth.js provider 자격증명이 preflight 표에 있다 (🟡4)", () => {
  it("뽑기가 provider import를 건진다", () => {
    expect(authProviders('import GitHub from "next-auth/providers/github";\nimport X from "next-auth/providers/microsoft-entra-id";'))
      .toEqual(["github", "microsoft-entra-id"]);
    expect(providerEnvNames("microsoft-entra-id")).toEqual(["AUTH_MICROSOFT_ENTRA_ID_ID", "AUTH_MICROSOFT_ENTRA_ID_SECRET"]);
  });

  /**
   * 로그인 공급자는 **하나 이상의 완전한 쌍**이다 (optional-login-providers spec §4.1) — 넷은 단독으로 `optional`이고 쌍 제약은
   * preflight의 쌍 규칙이 든다. 그 규칙이 보는 표(`LOGIN_PROVIDER_ENV`)에 provider가 빠지면 반쪽이 조용히 기동하므로 등재를 센다.
   */
  it("auth.ts의 provider마다 LOGIN_PROVIDER_ENV에 등재되고 그 이름이 optional이다", () => {
    const providers = authProviders(readFileSync(join(ROOT, "auth.ts"), "utf8"));
    expect(providers.length).toBeGreaterThan(0);
    const table: Record<string, string> = SELF_HOSTED_ENV;
    const registered: Record<string, { id: string; secret: string }> = LOGIN_PROVIDER_ENV;
    for (const id of providers) {
      expect(Object.hasOwn(registered, id), id).toBe(true);
      expect([registered[id]!.id, registered[id]!.secret], id).toEqual(providerEnvNames(id));
      for (const name of providerEnvNames(id)) expect(table[name], name).toBe("optional");
    }
    for (const name of ["AUTH_SECRET", "AUTH_URL", "AUTH_TRUST_HOST"]) expect(table[name], name).toBe("required");
  });

  /**
   * ⚠️ **compose가 넷을 `${X:-}`로 넘긴다** — `${X}`는 미설정이면 경고를 찍고(쓰지 않는 공급자를 비워 둔 운영자에게 매 기동 소음이다),
   * `${X:?}`는 기동을 막는다(쌍 하나면 되는 규칙과 모순). 값이 없으면 빈 문자열 = absent이고 판정은 preflight가 한다.
   * `composeProblems`는 보간 문법의 종류를 보지 않으므로 여기서 따로 센다.
   */
  it("compose web이 로그인 공급자 넷을 빈 기본값(${X:-})으로 넘긴다", () => {
    const web = composeServices(readFileSync(join(ROOT, "deploy/compose.yaml"), "utf8")).web?.environment ?? {};
    for (const names of Object.values(LOGIN_PROVIDER_ENV)) {
      for (const name of [names.id, names.secret]) expect(web[name], name).toBe(`\${${name}:-}`);
    }
  });
});

// ── ③ Dockerfile ↔ .nvmrc·packageManager·.npmrc ───────────────────────────────────────────────

function dockerfileProblems(input: { dockerfile: string; nvmrc: string; packageManager: string; dockerignore: string }): string[] {
  const problems: string[] = [];
  const lines = input.dockerfile.split("\n").map((l) => l.trim()).filter((l) => l !== "" && !l.startsWith("#"));
  const froms = lines.filter((l) => /^FROM\s/i.test(l));
  const nodeMajors = froms.map((l) => /^FROM\s+(?:--platform=\S+\s+)?node:(\d+)/i.exec(l)?.[1]);
  if (froms.length === 0 || nodeMajors.some((m) => m === undefined)) problems.push("base is not node:<major>");
  // `postgresql-client`의 메이저는 배포판이 정한다 — bootstrap의 `\getenv`가 psql 15+를 요구한다(bullseye는 13).
  if (froms.some((l) => !/^FROM\s+(?:--platform=\S+\s+)?node:\d+[\w.-]*-(bookworm|trixie)\b/i.test(l))) problems.push("base distro lacks psql 15+");
  else if (nodeMajors.some((m) => m !== input.nvmrc.trim())) problems.push("node major != .nvmrc");

  const pnpm = /^pnpm@(\S+)$/.exec(input.packageManager)?.[1];
  const prepared = [...input.dockerfile.matchAll(/corepack prepare pnpm@(\S+)/g)].map((m) => m[1]);
  if (prepared.length === 0 || prepared.some((v) => v !== pnpm)) problems.push("pnpm != packageManager");

  const installAt = lines.findIndex((l) => /pnpm install --frozen-lockfile/.test(l));
  const npmrcAt = lines.findIndex((l) => /^COPY\s/i.test(l) && /(^|\s)\.npmrc(\s|$)/.test(l));
  if (installAt < 0) problems.push("no frozen install");
  if (npmrcAt < 0 || (installAt >= 0 && npmrcAt > installAt)) problems.push(".npmrc not copied before install");

  const users = lines.filter((l) => /^USER\s/i.test(l));
  if (users.length === 0 || /^USER\s+(root|0)(\s|:|$)/i.test(users.at(-1)!)) problems.push("runs as root");
  if (!/postgresql-client/.test(input.dockerfile)) problems.push("no psql");
  // 줄 이음을 먼저 펴서 둘째 줄·둘째 토큰(`ENV A=1 RESEND_API_KEY=x`)도 본다.
  const joined = input.dockerfile.replace(/\\\r?\n/g, " ");
  if (/^(ARG|ENV)\s+.*?\b\w*(SECRET|TOKEN|PASSWORD|_KEY)\w*\s*=?/im.test(joined)) problems.push("secret-looking build arg/env");
  // 런타임 사용자는 쓰기 대상만 소유한다 — 코드·node_modules·.next를 고쳐 쓸 수 없게 install·build는 root로 한다.
  const userNodeAt = lines.findIndex((l) => /^USER\s+node\b/i.test(l));
  const buildAt = lines.findIndex((l) => /pnpm build/.test(l));
  if (/--chown=node/.test(input.dockerfile) || userNodeAt < 0 || userNodeAt < buildAt) problems.push("node owns app code");

  const ignored = new Set(input.dockerignore.split("\n").map((l) => l.trim()).filter((l) => l !== "" && !l.startsWith("#")));
  // `**/__tests__`: 이미지에 테스트·픽스처를 싣지 않는다(B7 실습 ⚪) — 빌드는 테스트를 import하지 않는다.
  for (const entry of ["**/.env*", ".git", ".scratch", "node_modules", ".next", "**/*.pem", "**/__tests__"]) if (!ignored.has(entry)) problems.push(`.dockerignore lacks ${entry}`);
  return problems;
}

describe("SH-15 ③ — Dockerfile ↔ .nvmrc·packageManager·.npmrc", () => {
  const current = () => ({
    dockerfile: readFileSync(join(ROOT, "Dockerfile"), "utf8"),
    nvmrc: readFileSync(join(ROOT, ".nvmrc"), "utf8"),
    packageManager: (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { packageManager: string }).packageManager,
    dockerignore: readFileSync(join(ROOT, ".dockerignore"), "utf8"),
  });

  it("현재 트리가 맞는다", () => {
    expect(dockerfileProblems(current())).toEqual([]);
  });

  it("어긋나면 red다", () => {
    const base = current();
    expect(dockerfileProblems({ ...base, nvmrc: "22\n" })).toContain("node major != .nvmrc");
    expect(dockerfileProblems({ ...base, packageManager: "pnpm@9.0.0" })).toContain("pnpm != packageManager");
    expect(dockerfileProblems({ ...base, dockerfile: base.dockerfile.replace(/^COPY[^\n]*\.npmrc[^\n]*$/m, "COPY package.json ./") }))
      .toContain(".npmrc not copied before install");
    expect(dockerfileProblems({ ...base, dockerfile: `${base.dockerfile}\nUSER root\n` })).toContain("runs as root");
    expect(dockerfileProblems({ ...base, dockerfile: `${base.dockerfile}\nARG RESEND_API_KEY\n` })).toContain("secret-looking build arg/env");
    expect(dockerfileProblems({ ...base, dockerfile: `${base.dockerfile}\nENV A=1 \\\n    CRON_SECRET=x\n` })).toContain("secret-looking build arg/env");
    expect(dockerfileProblems({ ...base, dockerfile: base.dockerfile.replace("bookworm", "bullseye") })).toContain("base distro lacks psql 15+");
    expect(dockerfileProblems({ ...base, dockerfile: base.dockerfile.replace(/^USER node$/m, "").replace(/^WORKDIR \/app$/m, "WORKDIR /app\nUSER node") }))
      .toContain("node owns app code");
    expect(dockerfileProblems({ ...base, dockerignore: base.dockerignore.replace("**/.env*", "") })).toContain(".dockerignore lacks **/.env*");
    expect(dockerfileProblems({ ...base, dockerignore: base.dockerignore.replace("**/__tests__", "") })).toContain(".dockerignore lacks **/__tests__");
  });
});

// ── ② compose 예제 ↔ preflight 표, 기동 순서 ─────────────────────────────────────────────────────

type ComposeService = {
  environment?: Record<string, string | number | boolean | null>;
  ports?: unknown[];
  depends_on?: Record<string, { condition?: string }>;
  healthcheck?: unknown;
  image?: string;
  build?: unknown;
  volumes?: (string | { type?: string; source?: string })[];
  volumes_from?: unknown;
};

/** compose 자신의 변수 — 앱이 읽지 않는다. 비밀번호는 서비스별로 갈라 준다(superuser는 postgres에만). */
const COMPOSE_ONLY = ["MALMOI_IMAGE", "POSTGRES_PASSWORD", "MIGRATE_DB_PASSWORD", "RUNTIME_DB_PASSWORD"] as const;

function composeServices(source: string): Record<string, ComposeService> {
  return (parseYaml(source) as { services: Record<string, ComposeService> }).services;
}

/** `${NAME}`·`${NAME:?msg}`·`${NAME:-}`에서 이름을 뽑는다. `$$`는 compose 이스케이프다. */
function interpolated(source: string): string[] {
  return [...new Set([...source.replaceAll("$$", "").matchAll(/\$\{([A-Z][A-Z0-9_]*)/g)].map((m) => m[1]!))].sort();
}

function composeProblems(input: { compose: string; example: readonly string[] }): string[] {
  const problems: string[] = [];
  const services = composeServices(input.compose);
  const table: Record<string, string> = SELF_HOSTED_ENV;
  const want = Object.entries(table).filter(([, kind]) => kind === "required" || kind === "optional").map(([name]) => name).sort();
  const webEnv = Object.keys(services.web?.environment ?? {}).sort();
  if (JSON.stringify(webEnv) !== JSON.stringify(want)) {
    for (const name of want) if (!webEnv.includes(name)) problems.push(`web lacks ${name}`);
    for (const name of webEnv) if (!want.includes(name)) problems.push(`web has unclassified-or-extra ${name}`);
  }
  for (const [service, def] of Object.entries(services)) {
    for (const name of Object.keys(def.environment ?? {})) if (table[name] === "hosted-only") problems.push(`${service} has hosted-only ${name}`);
  }
  for (const name of Object.keys(services.scheduler?.environment ?? {})) if (!["CRON_SECRET", "TZ"].includes(name)) problems.push(`scheduler has ${name}`);
  for (const [service, def] of Object.entries(services)) {
    if (service !== "postgres" && JSON.stringify(def.environment ?? {}).includes("POSTGRES_PASSWORD")) problems.push(`${service} sees POSTGRES_PASSWORD`);
  }

  const used = interpolated(input.compose);
  const example = [...input.example].sort();
  for (const name of used) if (!example.includes(name)) problems.push(`interpolated but missing from deploy/.env.example: ${name}`);
  for (const name of example) if (!used.includes(name)) problems.push(`in deploy/.env.example but unused: ${name}`);
  for (const name of example) {
    if (!Object.hasOwn(table, name) && !(COMPOSE_ONLY as readonly string[]).includes(name)) problems.push(`unclassified: ${name}`);
  }
  return problems;
}

function orderProblems(compose: string): string[] {
  const problems: string[] = [];
  const s = composeServices(compose);
  const cond = (service: string, dep: string) => s[service]?.depends_on?.[dep]?.condition;
  if (cond("migrate", "postgres") !== "service_healthy") problems.push("migrate before postgres healthy");
  if (cond("web", "migrate") !== "service_completed_successfully") problems.push("web before migrate succeeded");
  if (cond("scheduler", "web") !== "service_healthy") problems.push("scheduler before web healthy");
  if (cond("proxy", "web") !== "service_healthy") problems.push("proxy before web healthy");
  if (s.postgres?.healthcheck === undefined || s.web?.healthcheck === undefined) problems.push("missing healthcheck");
  const probe = (name: string) => JSON.stringify((s[name]?.healthcheck as { test?: unknown } | undefined)?.test ?? "");
  // 소켓으로 물으면 initdb 동안의 임시 서버(listen_addresses='')를 healthy로 본다 — migrate의 TCP 접속이 거부된다.
  if (!/"-h","127\.0\.0\.1"/.test(probe("postgres"))) problems.push("postgres healthcheck not over TCP");
  // web readiness = DB ping + 자기 포트 리슨. 공개 route를 부르지 않는다(design §5).
  const web = probe("web");
  if (!/pg_isready/.test(web) || !/connect\(3000,\s*'127\.0\.0\.1'\)/.test(web)) problems.push("web healthcheck lacks db ping or listen check");
  if (/https?:\/\/|curl|wget|fetch\(/.test(web)) problems.push("web healthcheck calls a route");
  for (const name of ["postgres", "migrate", "web", "scheduler"]) if (s[name]?.ports !== undefined) problems.push(`${name} publishes ports`);
  if (s.migrate?.image === undefined || s.migrate.image !== s.web?.image) problems.push("migrate and web use different images");
  if (!/^postgres:17[.\d-]/.test(s.postgres?.image ?? "")) problems.push("postgres not pinned to 17");
  return problems;
}

/** 업로드 볼륨(`uploads`)의 마운트 주체. 짧은 문법(`uploads:/path[:ro]`)과 긴 문법(`source: uploads`)을 다 보고, `volumes_from`은 통째로 거부한다. */
function uploadVolumeProblems(compose: string): string[] {
  const problems: string[] = [];
  const mounts = (def: ComposeService) =>
    (def.volumes ?? []).some((v) => (typeof v === "string" ? v.split(":")[0] === "uploads" : v.source === "uploads"));
  for (const [service, def] of Object.entries(composeServices(compose))) {
    if (def.volumes_from !== undefined) problems.push(`${service} uses volumes_from`);
    if (service !== "web" && mounts(def)) problems.push(`${service} mounts uploads`);
    if (service === "web" && !mounts(def)) problems.push("web does not mount uploads");
  }
  return problems;
}

describe("SH-15 ② — compose 예제 ↔ preflight 표, 기동 순서", () => {
  const compose = () => readFileSync(join(ROOT, "deploy/compose.yaml"), "utf8");
  const example = () => exampleKeys(readFileSync(join(ROOT, "deploy/.env.example"), "utf8"));

  it("현재 트리가 맞는다", () => {
    expect(composeProblems({ compose: compose(), example: example() })).toEqual([]);
    expect(orderProblems(compose())).toEqual([]);
  });

  it("뽑기가 기본값·필수 표기·이스케이프를 다룬다", () => {
    expect(interpolated("a: ${A:?set A}\nb: ${B:-}\nc: $${NOT}\nd: ${A}")).toEqual(["A", "B"]);
  });

  it("어긋나면 red다", () => {
    const base = compose();
    expect(composeProblems({ compose: base, example: example().filter((n) => n !== "CRON_SECRET") }))
      .toContain("interpolated but missing from deploy/.env.example: CRON_SECRET");
    expect(composeProblems({ compose: base, example: [...example(), "STRAY"] })).toContain("in deploy/.env.example but unused: STRAY");
    expect(composeProblems({ compose: base.replace(/^(\s+)RESEND_API_KEY:.*$/m, ""), example: example() })).toContain("web lacks RESEND_API_KEY");
    expect(composeProblems({ compose: base.replace(/^(\s+)RESEND_API_KEY:(.*)$/m, "$1RESEND_API_KEY:$2\n$1INVITATION_EMAIL_ORIGIN: x"), example: example() }))
      .toContain("web has hosted-only INVITATION_EMAIL_ORIGIN");
    expect(orderProblems(base.replace("condition: service_completed_successfully", "condition: service_started"))).toContain("web before migrate succeeded");
    expect(orderProblems(base.replace('"-h", "127.0.0.1", ', ""))).toContain("postgres healthcheck not over TCP");
    expect(orderProblems(base.replace("connect(3000,'127.0.0.1')", "connect(1,'x')"))).toContain("web healthcheck lacks db ping or listen check");
  });
});

// ── 업로드 볼륨은 web만 마운트한다 (ARCHITECTURE §7 "self-hosted 업로드 볼륨") ───────────────────────

describe("compose — 업로드 볼륨을 마운트하는 서비스는 web 하나다", () => {
  const compose = () => readFileSync(join(ROOT, "deploy/compose.yaml"), "utf8");

  it("현재 트리가 맞는다", () => {
    expect(uploadVolumeProblems(compose())).toEqual([]);
  });

  // 둘째 쓰기 주체가 생기면 검사와 사용 사이의 링크 교체로 web이 자기 파일시스템(`/proc/self/environ` 등)을 이미지 경로로 내보낸다.
  it("다른 서비스가 마운트하면 red다 — 짧은 문법·긴 문법·volumes_from·web의 마운트 제거", () => {
    const base = compose();
    const scheduler = "    networks: [edge]\n\nnetworks:";
    expect(base).toContain(scheduler);
    expect(uploadVolumeProblems(base.replace(scheduler, "    volumes:\n      - uploads:/data/uploads:ro\n    networks: [edge]\n\nnetworks:")))
      .toEqual(["scheduler mounts uploads"]);
    expect(uploadVolumeProblems(base.replace(scheduler, "    volumes:\n      - type: volume\n        source: uploads\n        target: /x\n    networks: [edge]\n\nnetworks:")))
      .toEqual(["scheduler mounts uploads"]);
    expect(uploadVolumeProblems(base.replace(scheduler, "    volumes_from: [web]\n    networks: [edge]\n\nnetworks:")))
      .toEqual(["scheduler uses volumes_from"]);
    expect(uploadVolumeProblems(base.replace("      - uploads:/data/uploads\n", ""))).toEqual(["web does not mount uploads"]);
  });
});

// ── 스케줄러 ↔ NIGHTLY_PULL (design §6) ─────────────────────────────────────────────────────────

describe("scheduler — crontab 식·경로가 NIGHTLY_PULL과 같다", () => {
  const crontab = () => readFileSync(join(ROOT, "deploy/scheduler/crontab"), "utf8");
  const script = () => readFileSync(join(ROOT, "deploy/scheduler/nightly-pull.sh"), "utf8");

  it("cron 항목이 정확히 하나이고 식이 같다", () => {
    const entries = crontab().split("\n").map((l) => l.trim()).filter((l) => l !== "" && !l.startsWith("#"));
    expect(entries).toHaveLength(1);
    expect(entries[0]!.split(/\s+/).slice(0, 5).join(" ")).toBe(NIGHTLY_PULL.schedule);
  });

  it("호출이 내부 web의 같은 경로를 시간 상한과 함께 GET한다", () => {
    const body = script();
    expect(body).toContain(`http://web:3000${NIGHTLY_PULL.path}`);
    expect(body).toMatch(/curl -fsS --max-time 300 /);
    expect(body).not.toMatch(/-X\s*POST|--data|\s-d\s/);
  });
});

// ── proxy 예제 (design §2·§5) ───────────────────────────────────────────────────────────────────

/**
 * proxy access log가 비밀을 남기지 않는가 (B7 실습 🟡 — 기본 형식이 `$request`로 `/invite/<token>`·OAuth `code`·`state`를 남겼다).
 * 형식은 query·referer 없이 `$uri`를 가린 변수만 쓰고, 모든 server가 그 형식을 명시한다 — 명시하지 않은 server는 이미지 기본
 * (`nginx.conf`의 `main`)을 상속하고, 같은 레벨에 둘을 두면 둘 다 기록된다.
 */
function nginxLogProblems(conf: string): string[] {
  const problems: string[] = [];
  const format = /log_format\s+malmoi_redacted\s+([^;]+);/.exec(conf)?.[1];
  if (format === undefined) problems.push("no malmoi_redacted log_format");
  else {
    for (const leak of [/\$request\b/, /\$request_uri\b/, /\$request_body\b/, /\$args\b/, /\$query_string\b/, /\$arg_/, /\$http_referer\b/, /\$uri\b/]) {
      if (leak.test(format)) problems.push(`format leaks ${leak.source}`);
    }
    if (!format.includes("$malmoi_log_uri")) problems.push("format lacks $malmoi_log_uri");
  }
  const map = /map\s+\$uri\s+\$malmoi_log_uri\s*\{([^}]*)\}/.exec(conf)?.[1] ?? "";
  for (const prefix of ["/invite/", "/signin/link/"]) if (!map.includes(`~^${prefix}`)) problems.push(`map does not mask ${prefix}`);
  if (!/default\s+\$uri;/.test(map)) problems.push("map lacks default $uri");
  const servers = [...conf.matchAll(/^server\s*\{/gm)].length;
  const redacted = [...conf.matchAll(/^\s*access_log\s+\S+\s+malmoi_redacted;/gm)].length;
  const all = [...conf.matchAll(/^\s*access_log\b/gm)].length;
  if (servers === 0 || redacted !== servers || all !== redacted) problems.push("every server must log with malmoi_redacted only");
  if (/\b(combined|main)\s*;/.test(conf)) problems.push("uses a default log format");
  return problems;
}

describe("nginx 예제 — Host 전달·HSTS 덮어쓰기·rate limit", () => {
  const conf = () => readFileSync(join(ROOT, "deploy/nginx/malmoi.conf"), "utf8");
  const snippet = () => readFileSync(join(ROOT, "deploy/nginx/proxy-common.conf"), "utf8");
  const live = (source: string) => source.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");

  it("access log가 query·referer·토큰 경로를 남기지 않는다 — 기본 형식을 쓰지 않는다", () => {
    expect(nginxLogProblems(live(conf()))).toEqual([]);
  });

  it("어긋나면 red다", () => {
    const base = live(conf());
    expect(nginxLogProblems(base.replace(/access_log\s+\S+\s+malmoi_redacted;/, ""))).toContain("every server must log with malmoi_redacted only");
    expect(nginxLogProblems(base.replace("$malmoi_log_uri $server_protocol", "$request_uri $server_protocol"))).toContain("format leaks \\$request_uri\\b");
    expect(nginxLogProblems(base.replace("~^/invite/", "~^/invited/"))).toContain("map does not mask /invite/");
    expect(nginxLogProblems(`${base}\naccess_log /var/log/nginx/access.log combined;`)).toContain("uses a default log format");
  });

  it("원래 Host·스킴을 넘긴다 — 기본값 $proxy_host면 requestOrigin이 전부 null이다", () => {
    expect(live(snippet())).toMatch(/proxy_set_header Host \$host;/);
    expect(live(snippet())).toMatch(/proxy_set_header X-Forwarded-Proto \$scheme;/);
  });

  it("앱의 HSTS를 숨기고 하나로 덮어쓴다 — includeSubDomains·preload 없이", () => {
    expect(live(snippet())).toMatch(/proxy_hide_header Strict-Transport-Security;/);
    expect(live(snippet())).toMatch(/add_header Strict-Transport-Security "max-age=63072000" always;/);
  });

  it("두 무인증 진입점이 IP당 600/60s 카운터 하나를 나눠 쓰고 초과는 429다", () => {
    const body = live(conf());
    expect(body).toMatch(/limit_req_zone \$binary_remote_addr zone=malmoi_public:\S+ rate=600r\/m;/);
    expect(body).toMatch(/limit_req_status 429;/);
    for (const location of [/location \^~ \/api\/images\/ \{[^}]*limit_req zone=malmoi_public/, /location = \/oauth\/authorize \{[^}]*limit_req zone=malmoi_public/]) {
      expect(body).toMatch(location);
    }
  });

  it("web을 요청마다 다시 해석한다 — web만 재생성돼도 옛 IP로 502가 나지 않게", () => {
    const body = live(conf());
    expect(body).toMatch(/resolver 127\.0\.0\.11 valid=10s ipv6=off;/);
    expect(body).not.toMatch(/upstream\s/);
    const passes = [...body.matchAll(/proxy_pass\s+([^;]+);/g)].map((m) => m[1]!.trim());
    expect(passes.length).toBeGreaterThanOrEqual(3);
    for (const target of passes) expect(target).toBe("$malmoi_web");
  });

  it("스트리밍 렌더를 버퍼에 묶지 않고, 전달 Host를 덮어쓴다", () => {
    expect(live(snippet())).toMatch(/proxy_buffering off;/);
    expect(live(snippet())).toMatch(/proxy_set_header X-Forwarded-Host \$host;/);
  });

  it("모든 location이 공통 조각을 문다 — add_header는 상속되지 않는다", () => {
    const locations = [...live(conf()).matchAll(/location [^{]+\{([^}]*)\}/g)].map((m) => m[1]!);
    const proxied = locations.filter((body) => body.includes("proxy_pass"));
    expect(proxied.length).toBeGreaterThanOrEqual(3);
    for (const body of proxied) expect(body).toContain("include /etc/nginx/snippets/proxy-common.conf;");
  });
});
