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
 *
 * ⚠️ **위 판정은 2갈래 삼항을 원리적으로 못 본다** (R-A 🟡1) — `provider === "github" ? <GithubIcon /> : <GoogleIcon />`·`… ? m.signIn.github :
 * m.signIn.google`에는 `google` 문자열 토큰이 없다(식별자·속성 접근이다). 화면 여덟 자리가 그 꼴이었고 셋째 공급자를 Google 글리프·라벨로
 * 떨어뜨렸다. 그래서 둘째 판정이 그 꼴의 **google 쪽 꼬리**를 센다: `GoogleIcon` 참조(대응표 `brand-icons.tsx` 밖 0) · 속성 접근 `.google`
 * (`m.signIn.google`·`m.link.providers.google` — 스캔 범위 전체에서 0, 라벨은 `m.signIn[provider]`로 인덱싱한다).
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

/** 공급자 → 글리프 대응표의 집 — `GoogleIcon`을 이름으로 부를 수 있는 유일한 파일이다(`ProviderIcon`·`BrandGlyph`가 그것을 감싼다). */
const GLYPH_HOME = "components/signin/brand-icons.tsx";

/**
 * 손 삼항의 google 쪽 꼬리(줄 번호) — `GoogleIcon` 식별자 참조(import 포함)와 속성 접근 `.google`. 주석은 AST라 안 센다. `GoogleIcon`은
 * `glyphHome`이면 세지 않는다(정의·대응표).
 */
function googleBranches(code: string, fileName = "x.tsx", glyphHome = false): number[] {
  const file = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lines: number[] = [];
  const hit = (node: ts.Node) => lines.push(file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1);
  file.forEachChild(function visit(node) {
    if (ts.isPropertyAccessExpression(node) && node.name.text === "google") hit(node.name);
    else if (ts.isIdentifier(node) && node.text === "GoogleIcon" && !glyphHome) hit(node);
    node.forEachChild(visit);
  });
  return lines;
}

/**
 * 루트별 스캔 파일 수의 하한 (R-A 🟡2) — 확장자 필터·`SKIP_DIR`이 잘못 넓어지면 `app`·`components`가 조용히 0파일이 되고 위 판정이 공허하게 green이다
 * (POSTMORTEM 2026-09-07 "좁은 검사는 자기 좁음을 신고할 수 없다"). 2026-10-13 실측 app 89 · components 208 · lib 435의 절반 남짓이다.
 */
const FLOOR: Readonly<Record<string, number>> = { app: 50, components: 100, lib: 200 };

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

  /**
   * 하한은 "필터가 넓어져 0파일"만 잡는다 — 이관한 여덟 자리의 파일 다섯이 표적 제외(`SKIP_DIR`에 `invite`·`oauth` 등)로 빠지면 하한을 넘긴 채
   * 그 화면에 삼항이 돌아와도 green이었다(R-D ⚪2). 그래서 그 파일들이 스캔에 있음을 이름으로 단언한다.
   */
  it("손 삼항을 이관한 파일들이 스캔 범위에 있다", () => {
    for (const file of ["app/signin/page.tsx", "app/invite/[token]/page.tsx", "app/oauth/authorize/page.tsx", "app/signin/link/[challenge]/page.tsx", "components/account/login-methods.tsx"]) {
      expect(scanned.some((s) => s.path === file), file).toBe(true);
    }
  });

  it("루트마다 스캔 파일 수가 하한 이상이다 — 필터가 넓어져 공허하게 green이 되지 않는다", () => {
    expect(Object.keys(FLOOR).sort()).toEqual([...ROOTS].sort());
    for (const [root, floor] of Object.entries(FLOOR)) expect(scanned.filter((s) => s.path.startsWith(`${root}/`)).length, root).toBeGreaterThanOrEqual(floor);
  });
});

describe("로그인 공급자 우주 — 2갈래 삼항의 google 꼬리", () => {
  const scanned = sources();

  it("`GoogleIcon`은 대응표 밖에서, `.google` 속성 접근은 어디서도 나오지 않는다", () => {
    const offenders = scanned.flatMap((s) => googleBranches(s.code, s.path, s.path === GLYPH_HOME).map((line) => `${s.path}:${line}`));
    expect(offenders).toEqual([]);
  });

  it("대응표의 집은 실재하고 `GoogleIcon`을 정의한다 (낡은 예외 금지)", () => {
    const home = scanned.find((s) => s.path === GLYPH_HOME);
    expect(home).toBeDefined();
    expect(googleBranches(home!.code, GLYPH_HOME)).not.toEqual([]);
  });
});

describe("googleBranches — 판정 모양", () => {
  it.each([
    ["글리프 삼항", `const icon = provider === "github" ? <GithubIcon /> : <GoogleIcon />;`],
    ["라벨 삼항", `const label = provider === "github" ? m.signIn.github : m.signIn.google;`],
    ["링크 라벨", `const name = m.link.providers.google;`],
    ["GoogleIcon import만", `import { GoogleIcon } from "@/components/signin/brand-icons";`],
  ])("잡는다 — %s", (_label, code) => {
    expect(googleBranches(code).length).toBeGreaterThan(0);
  });

  it.each([
    ["주석", `// provider === "github" ? <GithubIcon /> : <GoogleIcon />`],
    ["인덱싱", `const label = m.signIn[provider];`],
    ["대응 컴포넌트", `<ProviderIcon provider={provider} />;`],
    ["URL 부분 문자열", `const u = "https://accounts.google.com";`],
  ])("세지 않는다 — %s", (_label, code) => {
    expect(googleBranches(code)).toEqual([]);
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
