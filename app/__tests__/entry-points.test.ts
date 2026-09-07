import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * **인가 없이 실행되는 서버 진입점이 0인지 소스에서 센다** (spec 완료 조건 6).
 *
 * ⚠️ 읽어서 판정하는 것은 한 번 지나면 무너진다. `lib/adapters/__tests__/contract.ts`가 `ADAPTERS`를
 * 순회해 매트릭스를 강제하는 것과 같은 성질의 **상시 방어선**이다 — 새 Action·새 페이지가 인가를
 * 안 지나면 여기서 red가 된다.
 *
 * **예외는 이름으로 고정한다.** 경계가 다른 진입점들이고, 각자 자기 인증을 한다:
 * - `/api/push` — Bearer `PUSH_TOKEN` (CI가 부른다. 사람이 아니다)
 * - `/api/pull` — `CRON_SECRET` (Vercel Cron)
 * - `/api/auth/[...nextauth]` — Auth.js 핸들러 자체
 * - `/` — 로그인 화면. 세션이 없는 사람이 보는 유일한 화면이다
 * - `/invite/[token]` — **수락 전엔 멤버가 아니다.** 토큰이 인가를 대신한다 (membership.test.ts)
 *
 * 목록에 이름을 더하려면 **왜 그 진입점이 프로젝트 인가를 안 지나는지**가 함께 설명돼야 한다.
 */

const APP = fileURLToPath(new URL("..", import.meta.url));

/** 프로젝트 인가를 지나지 않아도 되는 진입점. 경로는 `app/` 기준이다. */
const EXEMPT = new Set([
  "api/push/route.ts",
  "api/pull/route.ts",
  "api/auth/[...nextauth]/route.ts",
  "page.tsx",
  "invite/[token]/page.tsx",
  "invite/actions.ts",
]);

/** 인가를 지났다고 인정하는 호출. 셋 다 결국 `planProjectAccess`로 간다. */
const GUARDS = ["requireProjectAccess", "getProjectAccess", "requireUser"];

/**
 * `"use server"` 파일이 내보내는 **공개 엔드포인트**의 선언 위치. 형태가 둘이라 둘을 다 본다 —
 * `export async function f()`와 `export const f = async () => {}`. 값 export(`= 7`)와
 * `export type`은 엔드포인트가 아니라 대상이 아니다.
 */
function actionExports(source: string): { name: string; at: number }[] {
  const re = /export\s+(?:async\s+function\s+(\w+)|const\s+(\w+)\s*(?::[^=;]+)?=\s*async\b)/g;
  return [...source.matchAll(re)].map((m) => ({ name: m[1] ?? m[2] ?? "", at: m.index }));
}

function walk(dir: string, base = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    // 테스트와 레이아웃은 진입점이 아니다 — 레이아웃은 차단 지점이 될 수 없다(병렬 렌더).
    if (entry === "__tests__" || entry === "node_modules") continue;
    const full = join(dir, entry);
    const rel = base === "" ? entry : `${base}/${entry}`;
    if (statSync(full).isDirectory()) {
      out.push(...walk(full, rel));
      continue;
    }
    if (/^(page\.tsx|route\.ts|actions\.ts)$/.test(entry)) out.push(rel);
  }
  return out;
}

/** 라우트 그룹 `(edit)`은 URL에 없고 예외 목록도 URL 기준이라 지운다. */
function normalize(rel: string): string {
  return rel
    .split("/")
    .filter((part) => !(part.startsWith("(") && part.endsWith(")")))
    .join("/");
}

const ENTRY_POINTS = walk(APP).map((rel) => ({
  rel,
  path: normalize(rel),
  source: readFileSync(join(APP, rel), "utf8"),
}));

describe("서버 진입점", () => {
  it("하나 이상 찾았다 — 스캐너가 조용히 0건이 되지 않는다", () => {
    // 글롭이 깨져 0건이 되면 이 테스트 전체가 공허하게 통과한다
    // (`vitest.config.ts`가 `passWithNoTests`를 안 켜는 것과 같은 이유).
    expect(ENTRY_POINTS.length).toBeGreaterThan(3);
  });

  it("예외 목록의 이름이 전부 실재한다 — 낡은 예외가 남지 않는다", () => {
    const found = new Set(ENTRY_POINTS.map((e) => e.path));
    for (const name of EXEMPT) expect(found).toContain(name);
  });

  it("예외가 아닌 진입점은 전부 인가를 지난다", () => {
    const unguarded = ENTRY_POINTS.filter(
      (e) => !EXEMPT.has(e.path) && !GUARDS.some((g) => e.source.includes(g)),
    ).map((e) => e.path);
    expect(unguarded).toEqual([]);
  });

  it("Server Action 파일의 모든 export가 인가를 지난다", () => {
    // `"use server"` 파일은 export 하나하나가 공개 엔드포인트다 — 파일에 호출이 한 번
    // 있다는 것으로는 부족하고, 각 함수가 스스로 불러야 한다.
    const actionFiles = ENTRY_POINTS.filter(
      (e) => e.path.endsWith("actions.ts") && !EXEMPT.has(e.path),
    );
    expect(actionFiles.length).toBeGreaterThan(0);

    const unguarded: string[] = [];
    for (const file of actionFiles) {
      const marks = actionExports(file.source);
      expect(marks.length, file.path).toBeGreaterThan(0);
      for (const [i, mark] of marks.entries()) {
        // 다음 export 선언까지가 그 함수의 범위다 — 파일 어딘가에 호출이 있다는 것으로는 부족하다.
        const body = file.source.slice(mark.at, marks[i + 1]?.at ?? file.source.length);
        if (!GUARDS.some((g) => body.includes(g))) unguarded.push(`${file.path}#${mark.name}`);
      }
    }
    expect(unguarded).toEqual([]);
  });

  /**
   * ⚠️ **`export async function`만 보던 시절이 있었다** (2026-09-07 리뷰 🟡6). Server Action은
   * `export const x = async () => {}`로도 선언되고 그 형태는 **인가 없이 통째로 검사 밖**이었다 —
   * 지금 그런 export가 0건이라 조용했을 뿐이다. 아래가 두 형태를 각각 먹여 스캐너가 집는지 센다
   * (`credential-separation`·`focus-ring`의 메타 테스트와 같은 계보 — POSTMORTEM 2026-09-07).
   */
  it("두 선언 형태를 다 집는다 — `export async function`과 `export const … = async`", () => {
    const fake = [
      "export async function a() { await requireUser(); }",
      "export const b = async () => { await requireUser(); };",
      "export const c: Handler = async (x) => { return x; };",
      // 값 export는 엔드포인트가 아니다 — 잡으면 방어선이 항상 red다.
      "export const NOT_AN_ACTION = 7;",
      'export type Result = { ok: true };',
    ].join("\n");
    expect(actionExports(fake).map((m) => m.name)).toEqual(["a", "b", "c"]);
  });
});

describe("차단 규칙", () => {
  it("조건부 렌더로 인증을 막지 않는다 (POSTMORTEM 2026-08-31)", () => {
    // App Router는 레이아웃과 페이지를 병렬로 렌더한다 — `if (!session) return <Denied/>`는
    // 표시를 막을 뿐이고 페이지는 이미 실행돼 RSC 페이로드에 데이터가 실린다(실측 1.3MB).
    // `?.user`·중괄호·괄호를 낀 형태까지 잡는다 — 좁은 패턴은 안 잡고도 잡은 척한다.
    const CONDITIONAL_RENDER = /if \(!session[^)]*\)\s*\{?\s*return\s*\(?\s*</;

    // ⚠️ **`/invite/[token]`만 예외다.** 비로그인에게 **마스킹한 이메일·프로젝트 이름·역할**만
    // 보이고 번역 데이터는 조회조차 하지 않는다 — 새는 것이 그것이 전부라 허용한다 (design §4.1).
    for (const entry of ENTRY_POINTS.filter((e) => e.path !== "invite/[token]/page.tsx")) {
      expect(entry.source).not.toMatch(CONDITIONAL_RENDER);
    }
  });

  it("허용 핸들 목록이 남아 있지 않다 — 인가는 ProjectMember가 한다", () => {
    for (const entry of ENTRY_POINTS) {
      expect(entry.source).not.toContain("AUTH_ALLOWED_LOGINS");
    }
  });

  it("편집 경로가 ACTIVE_PROJECT_SLUG를 읽지 않는다 — 프로젝트는 URL과 멤버십이 정한다", () => {
    const editPaths = ENTRY_POINTS.filter((e) => !e.path.startsWith("api/"));
    for (const entry of editPaths) {
      expect(entry.source).not.toContain("ACTIVE_PROJECT_SLUG");
    }
  });
});

/**
 * **삭제된 라우트를 가리키는 링크가 없다.**
 *
 * 2026-09-05 preview 실측에서 잡힌 부류다: `/keys`를 `/projects/[slug]/translations`로 옮기면서
 * 페이지 **안의 링크 생성기**(`qs()`)가 `/keys`를 하드코딩한 채 남아, 사이드바의 네임스페이스·기준
 * 로케일 링크가 전부 404로 갔다. **타입도 테스트도 못 본다** — 문자열이고, 이 리포엔 페이지를
 * 렌더하는 테스트가 없다.
 *
 * ⚠️ 주석 속 인용은 잡지 않는다 — 회고가 그 경로를 근거로 들고 있고, 그건 지우면 안 되는 기록이다.
 */
describe("죽은 라우트 링크", () => {
  const ROUTES = new Set(ENTRY_POINTS.filter((e) => e.path.endsWith("page.tsx")).map((e) =>
    "/" + e.path.replace(/\/page\.tsx$/, "").replace(/^page\.tsx$/, ""),
  ));

  it("app/ 아래 라우트 목록을 읽었다", () => {
    expect(ROUTES.size).toBeGreaterThan(2);
  });

  /**
   * ⚠️ **정적 경로는 세그먼트 수와 무관하게 잡는다** (2026-09-07, T6). 전에는 한 세그먼트
   * (`/projects`·`/invite`)만 봤고, 그래서 `/projects/new`처럼 **여러 세그먼트가 전부 정적인**
   * 링크가 검사 밖이었다 — callback이 `/projects/new?e=`로 보내는데 그 라우트가 없으면 사용자는
   * 404를 만난다. 템플릿 리터럴(`/projects/${slug}/…`)은 여전히 밖이다: `${`를 문자 클래스에
   * 넣으면 어느 라우트와 대조할지 정할 수 없다 (T7의 `[manual]`이 그것을 본다).
   */
  const STATIC_PATH = /["'`](\/[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)*)(?:[?"'`])/g;

  it("검사식이 여러 세그먼트의 정적 경로를 잡는다 — 좁은 패턴은 안 잡고도 잡은 척한다", () => {
    const found = [...'const to = "/projects/new";'.matchAll(STATIC_PATH)].map((m) => m[1]);
    expect(found).toEqual(["/projects/new"]);
  });

  it("코드가 만드는 경로 리터럴이 실재하는 라우트를 가리킨다", () => {
    const dead: string[] = [];
    for (const entry of ENTRY_POINTS) {
      // 주석 줄은 뺀다 — POSTMORTEM 인용이 옛 경로를 들고 있다.
      const code = entry.source
        .split("\n")
        .filter((l) => !/^\s*(\*|\/\/)/.test(l))
        .join("\n");
      for (const m of code.matchAll(STATIC_PATH)) {
        const path = m[1] ?? "";
        // API·인증 경로와 루트는 이 검사의 대상이 아니다.
        if (path === "/" || path.startsWith("/api")) continue;
        const known = [...ROUTES].some((r) => r === path || r.startsWith(path + "/"));
        if (!known) dead.push(`${entry.path}: ${path}`);
      }
    }
    expect(dead).toEqual([]);
  });
});


/**
 * **쿼리로 넘긴 실패 사유를 읽는 쪽이 있다.**
 *
 * 2026-09-06 preview 실측에서 잡힌 부류다(issue #2): `app/invite/[token]/page.tsx`의 Server Action이
 * 실패를 `redirect(\`/invite/${token}?e=${error}\`)`로 넘기는데 **그 페이지가 `searchParams`를 받지도
 * 읽지도 않았다.** 주소창만 바뀌고 화면은 그대로라, 사용자에게는 버튼이 안 눌린 것으로 보인다.
 *
 * ⚠️ **타입도 테스트도 원리적으로 못 본다** — 보내는 쪽과 받는 쪽 사이에 계약이 없다. 문자열이
 * 한쪽에서 만들어지고 다른 쪽에서 **안 읽히는 것이 정상적인 코드**이기 때문이다. 그래서 "죽은
 * 라우트 링크"와 같은 층의 소스 대조로 센다.
 */
describe("쿼리 파라미터의 수신자", () => {
  /** `/invite/${token}` · `/projects/[slug]` → `/invite/*` · `/projects/*`. 두 표기를 같은 모양으로 만든다. */
  function shape(path: string): string {
    return path.replace(/\$\{[^}]*\}/g, "*").replace(/\[[^\]]*\]/g, "*");
  }

  const PAGES = ENTRY_POINTS.filter((e) => e.path.endsWith("page.tsx")).map((e) => ({
    shape: shape("/" + e.path.replace(/\/?page\.tsx$/, "")),
    source: e.source,
    path: e.path,
  }));

  /** 진입점 소스가 만드는 "경로 + 쿼리" 리터럴. 주석 줄은 뺀다. */
  const EMITTED = ENTRY_POINTS.flatMap((e) => {
    const code = e.source
      .split("\n")
      .filter((l) => !/^\s*(\*|\/\/)/.test(l))
      .join("\n");
    return [...code.matchAll(/["'`](\/[a-z][A-Za-z0-9/[\]$_{}.-]*)\?([A-Za-z_][A-Za-z0-9_]*)=/g)].map(
      (m) => ({ from: e.path, target: shape(m[1] ?? ""), key: m[2] ?? "" }),
    );
  });

  it("쿼리를 실어 보내는 자리를 하나 이상 찾았다 — 스캐너가 조용히 0건이 되지 않는다", () => {
    expect(EMITTED.length).toBeGreaterThan(0);
  });

  it("보낸 쿼리를 대상 페이지가 읽는다", () => {
    const unread: string[] = [];
    for (const emit of EMITTED) {
      const page = PAGES.find((p) => p.shape === emit.target);
      // 대상이 이 앱의 페이지가 아니면(외부 URL·API) 이 검사의 대상이 아니다.
      if (page === undefined) continue;
      if (!page.source.includes("searchParams")) {
        unread.push(`${emit.from} → ${emit.target}?${emit.key}= (${page.path}가 searchParams를 안 읽는다)`);
      }
    }
    expect(unread).toEqual([]);
  });
});

/**
 * **`auth()`는 `lib/auth/read-session.ts`만 직접 부른다.** 그 래퍼는 어댑터 예외를 삼키고 `null`을 돌려주므로
 * 직접 부르는 진입점은 DB 장애를 "비로그인"으로 접는다 (POSTMORTEM 2026-09-06). `readSession`이 logger 경로로
 * `unavailable`을 가르는 유일한 자리라, 그 밖의 호출은 방어선을 우회한 것이다. 2026-09-06까지는 grep 규율로만
 * 지켰다 — 여기서 상시로 센다. `GUARDS`에는 넣지 않는다: `readSession`은 인증이지 프로젝트 인가가 아니다.
 */
describe("세션 읽기 단일 진입점", () => {
  const ROOT = fileURLToPath(new URL("../..", import.meta.url));
  const DIRECT_AUTH_CALL = /\bawait\s+auth\(\)|[^.\w]auth\(\)\s*\.then/;
  const IMPORTS_AUTH = /import\s*\{[^}]*\bauth\b[^}]*\}\s*from\s*["']@\/auth["']/;

  function walkAll(dir: string, base = ""): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      if (entry === "__tests__" || entry === "node_modules" || entry.startsWith(".")) continue;
      const full = join(dir, entry);
      const rel = base === "" ? entry : `${base}/${entry}`;
      if (statSync(full).isDirectory()) out.push(...walkAll(full, rel));
      else if (/\.tsx?$/.test(entry)) out.push(rel);
    }
    return out;
  }

  const SOURCES = [...walkAll(join(ROOT, "app"), "app"), ...walkAll(join(ROOT, "lib"), "lib"), "middleware.ts"]
    .map((rel) => ({ rel, source: readFileSync(join(ROOT, rel), "utf8") }));

  it("검사식이 직접 호출을 실제로 잡는다 — 스캐너가 공허하게 통과하지 않는다", () => {
    expect(DIRECT_AUTH_CALL.test("const session = await auth();")).toBe(true);
    expect(IMPORTS_AUTH.test('import { auth, signIn } from "@/auth";')).toBe(true);
    // signIn·signOut만 가져오는 것은 허용이다 — 세션을 읽지 않는다.
    expect(IMPORTS_AUTH.test('import { signIn, signOut } from "@/auth";')).toBe(false);
  });

  it("read-session.ts 밖에서 auth()를 직접 부르지 않는다", () => {
    const offenders = SOURCES
      .filter((f) => f.rel !== "lib/auth/read-session.ts")
      .filter((f) => DIRECT_AUTH_CALL.test(f.source) || IMPORTS_AUTH.test(f.source))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("read-session.ts는 여전히 @/auth의 auth를 가져온다 — 진입점이 사라지면 이 검사가 공허해진다", () => {
    // 호출 형태는 `withOutageFlag(() => auth())`라 `await auth()` 패턴엔 안 걸린다 — import로 본다.
    const rs = SOURCES.find((f) => f.rel === "lib/auth/read-session.ts");
    expect(rs && IMPORTS_AUTH.test(rs.source)).toBe(true);
  });
});


/**
 * **`(edit)` 아래 새 페이지가 `middleware.ts`의 `matcher`에 덮인다.**
 *
 * 1차 차단은 미들웨어 하나이고(ARCHITECTURE §6.1), matcher에 없는 라우트는 **쿠키 검사를 아예
 * 지나지 않는다.** 본판정이 진입점에 있으니 데이터가 새지는 않지만, 비로그인 사용자가 로그인
 * 화면 대신 `requireUser`의 redirect에 도달하는 경로가 하나 더 늘고 그 차이는 눈에 안 보인다 —
 * CLAUDE.md·middleware.ts 주석이 **"새 보호 라우트를 추가하면 여기도 추가한다"**를 규칙으로만
 * 두고 있었다 (2026-09-07, T7이 `/projects/new`를 더하면서 자동 검사가 없다는 것이 드러났다).
 *
 * ⚠️ **`(edit)` 밖은 대상이 아니다** — `/`(로그인)와 `/invite/[token]`은 **일부러** matcher 밖이고,
 * 후자는 넣으면 초대 토큰이 `/`로 302되며 사라진다 (design §4.1).
 */
describe("보호 라우트가 미들웨어 matcher에 있다", () => {
  const ROOT = fileURLToPath(new URL("../..", import.meta.url));
  const MIDDLEWARE = readFileSync(join(ROOT, "middleware.ts"), "utf8");

  /** `matcher: [...]` 안의 문자열 리터럴. 배열이 사라지면 아래 "하나 이상" 검사가 잡는다. */
  const PATTERNS = (() => {
    const at = MIDDLEWARE.indexOf("matcher:");
    if (at === -1) return [];
    const open = MIDDLEWARE.indexOf("[", at);
    const close = MIDDLEWARE.indexOf("]", open);
    if (open === -1 || close === -1) return [];
    return [...MIDDLEWARE.slice(open, close).matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1] ?? "");
  })();

  /**
   * Next matcher 문법 → 정규식. `:path*`는 **세그먼트 0개 이상**이라 `/projects` 자신도 덮고,
   * `:param`은 한 세그먼트다. 이 변환이 틀리면 아래 자기검사가 red가 된다.
   */
  function covers(pattern: string, path: string): boolean {
    const source = pattern
      .replace(/\/:[A-Za-z]+\*/g, "(?:/[^]*)?")
      .replace(/\/:[A-Za-z]+/g, "/[^/]+");
    return new RegExp(`^${source}$`).test(path);
  }

  /** `[slug]` 같은 동적 세그먼트는 구체 값으로 바꿔 대조한다 — 패턴 대 패턴은 비교할 수 없다. */
  const PROTECTED = ENTRY_POINTS.filter((e) => e.rel.startsWith("(edit)/") && e.rel.endsWith("page.tsx")).map(
    (e) => "/" + e.path.replace(/\/?page\.tsx$/, "").replace(/\[[^\]]*\]/g, "sample"),
  );

  it("matcher 패턴과 보호 페이지를 실제로 읽었다 — 파싱이 조용히 0건이 되지 않는다", () => {
    expect(PATTERNS.length).toBeGreaterThan(0);
    expect(PROTECTED.length).toBeGreaterThan(1);
  });

  it("변환이 실제로 판정한다 — 공허하게 통과하지 않는다", () => {
    expect(covers("/projects/:path*", "/projects")).toBe(true);
    expect(covers("/projects/:path*", "/projects/new")).toBe(true);
    expect(covers("/projects/:path*", "/projects/sample/settings")).toBe(true);
    // 좁은 패턴은 하위 라우트를 덮지 못한다 — 이 줄이 위 셋을 의미 있게 만든다.
    expect(covers("/projects", "/projects/new")).toBe(false);
    expect(covers("/projects/:path*", "/invite/sample")).toBe(false);
  });

  it("(edit) 아래 모든 페이지가 어느 패턴에든 걸린다", () => {
    const uncovered = PROTECTED.filter((path) => !PATTERNS.some((pattern) => covers(pattern, path)));
    expect(uncovered).toEqual([]);
  });
});
