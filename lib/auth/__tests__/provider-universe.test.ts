import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { ts } from "ts-morph";
import { describe, expect, it } from "vitest";

/**
 * **로그인 공급자 우주(universe)의 손 사본이 0이다** (gitlab-oauth design §3) — 셋째 공급자가 들어오며 `["github", "google"]` 사본을 전부
 * `LOGIN_PROVIDERS` 파생으로 모았다. 사본이 하나라도 남으면 그 판정만 GitLab을 모른다 — callback 가로채기(`roundtrip.ts`)에서 그것은 보안 경계다.
 *
 * ⚠️ **지울 모양을 세지 않는다** (POSTMORTEM 2026-09-18 — 가드가 엉뚱한 것을 셌다). `"github", "google"`을 세면 치환 뒤 생길 셋 배열·`!==`·
 * 유니온·정규식을 못 잡는다. `"github"`·`"gitlab"`은 `Project.repoHost`가 같은 리터럴을 써서 표지가 될 수 없고, **`google`은 로그인 공급자
 * 뜻으로만 쓰인다** — 모든 우주 사본은 `google`을 이름으로 부르므로 그것이 표지다.
 *
 * 세는 것: 문자열 리터럴 값 **전체**가 `google` · 정규식(리터럴·문자열·템플릿 조각)의 **교대 항** `google`. 세지 않는 것: 주석(AST에 노드가
 * 없다) · URL 부분 문자열(`accounts.google.com`) · 대문자 표기(`Google`·`GoogleIcon`) · 객체 키 식별자(`google:` — `Record<LoginProvider, …>`라
 * typecheck가 지킨다).
 */

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const ROOTS = ["app", "lib", "components"];
/** `ROOTS` 밖의 루트 파일 — 빠지면 `auth.ts`의 provider 목록이 영원히 조용하다(POSTMORTEM 2026-09-07 "좁은 검사는 자기 좁음을 신고할 수 없다"). */
const ROOT_FILES = ["auth.ts", "middleware.ts"];
const SKIP_DIR = new Set(["__tests__", "node_modules", "generated"]);

/**
 * `google` 토큰이 있어도 되는 파일 — 각자 사유가 있다. **목록 안은 ≥1 자리**를 단언한다(낡은 항목 금지 — `no-korean-ui.test.ts`와 같은 형).
 */
const ALLOWED = [
  // 우주 정의 — `LoginProvider`·`LOGIN_PROVIDERS`.
  "lib/login-link/policy.ts",
  // env 이름 표·상태 객체 — SH-15 AST 게이트가 리터럴을 뽑는다(`Record<LoginProvider, …>`라 빠지면 typecheck가 잡는다).
  "lib/auth/login-providers.ts",
  // 공급자별 이메일 증명 갈래 — 공급자마다 증거의 모양이 달라 우주 순회로 쓸 수 없다.
  "lib/auth/email.ts",
  // provider 객체와 그 `profile` 갈래.
  "auth.ts",
];

const ALTERNATION = /(?:^|[|(:])google(?=[|)]|$)/;

/** 소스 하나의 `google` 토큰 자리(줄 번호). AST라 주석은 원리적으로 안 센다. */
function googleTokens(code: string, fileName = "x.tsx"): number[] {
  const file = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lines: number[] = [];
  const hit = (node: ts.Node) => lines.push(file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1);
  file.forEachChild(function visit(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (node.text === "google" || ALTERNATION.test(node.text)) hit(node);
    } else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      if (ALTERNATION.test(node.text)) hit(node);
    } else if (ts.isRegularExpressionLiteral(node)) {
      // `/…/flags`에서 본문만 — 플래그·구분자가 교대 항 판정에 끼지 않게.
      const body = node.text.slice(1, node.text.lastIndexOf("/"));
      if (ALTERNATION.test(body)) hit(node);
    }
    node.forEachChild(visit);
  });
  return lines;
}

function sources(): { path: string; code: string }[] {
  const out: { path: string; code: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (SKIP_DIR.has(name)) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push({ path: relative(ROOT, full), code: readFileSync(full, "utf8") });
    }
  };
  for (const dir of ROOTS) walk(join(ROOT, dir));
  for (const file of ROOT_FILES) out.push({ path: file, code: readFileSync(join(ROOT, file), "utf8") });
  return out;
}

describe("로그인 공급자 우주 — google 토큰 판정", () => {
  const scanned = sources();

  it("허용 파일 밖에서 공급자 id `google`이 단독 토큰으로 나오지 않는다", () => {
    const offenders = scanned
      .filter((s) => !ALLOWED.includes(s.path))
      .flatMap((s) => googleTokens(s.code, s.path).map((line) => `${s.path}:${line}`));
    expect(offenders).toEqual([]);
  });

  it("허용 파일은 실재하고 각각 ≥1 자리가 있다 (낡은 항목 금지)", () => {
    for (const path of ALLOWED) {
      const source = scanned.find((s) => s.path === path);
      expect(source, path).toBeDefined();
      expect(googleTokens(source!.code, path).length, path).toBeGreaterThan(0);
    }
  });

  it("스캔 범위가 루트 파일을 포함한다", () => {
    for (const file of ROOT_FILES) expect(scanned.some((s) => s.path === file), file).toBe(true);
  });
});

/**
 * 검출기 자체의 메타 테스트 — 판정이 좁아지면 위 검사도 조용히 좁아진다. 치환 뒤 사본이 다시 생길 모양 넷이 각각 잡히고, 세지 않기로 한 모양이
 * 각각 빠지는지 고정한다(실제 파일에 되넣는 뮤테이션 관측은 인계에 남긴다).
 */
describe("googleTokens — 판정 모양", () => {
  it.each([
    ["셋 배열", `const all = ["github", "gitlab", "google"];`],
    ["!== 비교", `if (p !== "github" && p !== "google") throw new Error();`],
    ["유니온 타입", `type P = "github" | "google";`],
    ["정규식 교대", `const re = /^\\/api\\/auth\\/callback\\/(github|google)$/;`],
    ["정규식 문자열", "const re = new RegExp(`^/callback/(github|gitlab|google)$`);"],
    ["Prisma in", `findMany({ where: { provider: { in: ["github", "google"] } } });`],
    ["switch case", `switch (p) { case "google": break; }`],
  ])("잡는다 — %s", (_label, code) => {
    expect(googleTokens(code)).toHaveLength(1);
  });

  it.each([
    ["줄 주석", `// provider === "google"`],
    ["블록 주석", `/* (github|google) */ const x = 1;`],
    ["JSDoc", `/** \`["github", "google"]\` */ export const y = 2;`],
    ["URL 부분 문자열", `const u = "https://accounts.google.com/o/oauth2";`],
    ["대문자 표기", `const label = "Google"; <GoogleIcon />;`],
    ["객체 키 식별자", `const s = { github: 1, google: 2 };`],
    ["Google provider import", `import Google from "next-auth/providers/google";`],
  ])("세지 않는다 — %s", (_label, code) => {
    expect(googleTokens(code)).toEqual([]);
  });
});
