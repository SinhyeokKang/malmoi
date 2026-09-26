import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { config as middlewareConfig } from "../../middleware";
import { isProtectedPath } from "@/lib/auth/cookie";

/**
 * **인가 없이 실행되는 서버 진입점이 0인지 소스에서 센다** (ARCHITECTURE §6.1).
 *
 * ⚠️ 읽어서 판정하는 것은 한 번 지나면 무너진다. `lib/adapters/__tests__/contract.ts`가 `ADAPTERS`를
 * 순회해 매트릭스를 강제하는 것과 같은 성질의 **상시 방어선**이다 — 새 Action·새 페이지가 인가를
 * 안 지나면 여기서 red가 된다.
 *
 * **예외는 이름으로 고정한다.** 경계가 다른 진입점들이고, 각자 자기 인증을 한다:
 * - `/api/push` — Bearer `PUSH_TOKEN` (CI가 부른다. 사람이 아니다)
 * - `/api/pull` — `CRON_SECRET` (Vercel Cron)
 * - `/api/auth/[...nextauth]` — Auth.js 핸들러 자체
 * - `/` — **공개 랜딩이다**. 세션이 있으면 `/projects`로 보내고, 없거나 못 읽으면 랜딩을 그린다(`rootView`)
 * - `/signin` — 로그인 화면. 세션이 없는 사람이 보는 화면이고, 여기가 막히면 아무도 못 들어온다
 * - `/privacy`·`/docs` — 공개 문서. 로그인 없이 읽혀야 하고, 로그인 화면 푸터가 가리킨다
 * - `/invite/[token]` — **수락 전엔 멤버가 아니다.** 토큰이 인가를 대신한다 (membership.test.ts)
 * - `/api/github/callback` — GitHub이 브라우저를 되돌리는 지점. `requireUser`로 스스로 인증하고,
 *   state가 무효면 slug를 못 믿어 `/projects?e=`로 간다 (`matcher`에 넣으면 `code`가 사라진다)
 *
 * 목록에 이름을 더하려면 **왜 그 진입점이 프로젝트 인가를 안 지나는지**가 함께 설명돼야 한다.
 *
 * ⚠️ **`requireUser`는 프로젝트 인가가 아니다** (2026-09-09, sec-audit 발견 14). 전에는 `GUARDS`에
 * 섞여 있어 **프로젝트 스코프 Action이 `requireUser()`만 불러도 green**이었다. 지금은 갈라져 있고,
 * `requireUser`로 충분한 export는 **이름으로** 고정한다 — 전부 **사용자 소유 행**만 만지거나
 * 인가할 프로젝트가 아직 없는 생성 경로다 (ARCHITECTURE §6.1).
 *
 * ⚠️ **`invite/actions.ts`의 면제도 파일이 아니라 export 단위다.** 파일 단위였을 때는 그 파일에
 * export가 하나 늘면 검사 밖이었다.
 */

const APP = fileURLToPath(new URL("..", import.meta.url));
/** 리포 루트 — `app/` 밖의 발신처를 읽는다 (아래 `EXTRA_EMITTERS`). */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** 프로젝트 인가를 지나지 않아도 되는 진입점. 경로는 `app/` 기준이다. */
const EXEMPT = new Set([
  "api/push/route.ts",
  /**
   * CI 파싱 실패 보고 (PRODUCT §7.8). **세션 인가가 아니라 그 프로젝트의 push 토큰이
   * 대신한다** — `/api/push`와 같은 계보이고, 호출자가 사람이 아니라 GitHub Actions다.
   */
  "api/push/failure/route.ts",
  "api/pull/route.ts",
  "api/auth/[...nextauth]/route.ts",
  "page.tsx",
  "signin/page.tsx",
  "privacy/page.tsx",
  "docs/[[...slug]]/page.tsx",
  "invite/[token]/page.tsx",
  /**
   * 병합 안내 (account-linking T2). **인가가 없고 challenge가 대신한다** — 비로그인이 봐야 하는
   * 화면이라 1차 차단의 보호 경로에도 없다(아래 `PUBLIC` 부정 단언).
   */
  "signin/link/[challenge]/page.tsx",
]);

/** 인가를 지났다고 인정하는 호출. 둘 다 결국 `planProjectAccess`로 간다. */
const PROJECT_GUARDS = ["requireProjectAccess", "getProjectAccess", "requireSurfaceAccess", "getSurfaceAccess"];
/** 로그인만 확인한다 — **프로젝트 인가가 아니다.** 아래 목록의 export에서만 충분하다. */
const USER_GUARD = "requireUser";
/** 파일·페이지 수준에서 인정하는 호출 전부. 페이지는 export 단위 검사를 안 받는다. */
const GUARDS = [...PROJECT_GUARDS, USER_GUARD];

/**
 * `requireUser` **하나로 충분한** Server Action의 `파일#export`.
 *
 * 셋 다 같은 이유다 — **인가할 프로젝트가 없거나**(생성 경로) **행이 사용자 소유**다(`Account`).
 * 여기 이름을 더하려면 그 둘 중 어느 쪽인지 적는다.
 */
const USER_SCOPED_ACTIONS = new Set([
  // Session revocation affects only the authenticated user, including users without projects.
  "account/actions.ts#startSessionRevocation",
  // `Account`는 사용자 소유다 — 프로젝트가 없는 사용자도 자기 로그인 수단을 해제할 수 있어야 한다.
  "account/actions.ts#unlinkLoginMethod",
  // Login-method challenges belong to the authenticated User.
  "account/actions.ts#startLoginMethodConnect",
  // Profile images belong to the authenticated User, not a project.
  "account/actions.ts#uploadProfileImage",
  "account/actions.ts#deleteProfileImage",
  // The display name is the user's own — a person with no project still owns it.
  "account/actions.ts#updateProfileName",
  // 생성 경로 — 아직 프로젝트가 없다 (ARCHITECTURE §6.1)
  "projects/actions.ts#listConnectableRepos",
  "projects/actions.ts#detectRepoFormats",
  "projects/actions.ts#listRepoBranches",
  "projects/actions.ts#loadCandidateSample",
  "projects/actions.ts#confirmManualFormat",
  "projects/actions.ts#createProject",
  // `Account`는 사용자 소유다 — 프로젝트를 하나도 안 만든 사용자도 도달해야 한다 (2026-09-07 리뷰 🟡9)
  "projects/actions.ts#startGithubConnectForUser",
  "projects/actions.ts#disconnectGithub",
]);

/**
 * 소스 스캔 판정 전에 주석을 벗긴다 (POSTMORTEM 2026-09-18). 이 리포는 "왜"를 주석에 적어 가드·식별자
 * 이름을 인용하는 주석이 흔하고, 벗기지 않으면 인용 하나가 호출·읽기로 세어진다.
 */
function stripComments(source: string): string {
  // 줄 끝 주석도 지운다 — `:` 뒤의 `//`(URL)만 남긴다. `error-codes.test.ts`와 같은 식이다 (audit #80).
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/gm, "$1");
}

/**
 * export 하나의 인가 판정. ⚠️ **`requireUser`는 이름이 목록에 있을 때만 인정한다** — 프로젝트 스코프
 * Action이 로그인만 확인하고 남의 프로젝트를 만지는 것이 정확히 이 검사가 막아야 하는 것이다.
 */
function exportGuarded(body: string, id: string): boolean {
  const code = stripComments(body);
  return PROJECT_GUARDS.some((g) => code.includes(`${g}(`)) || (USER_SCOPED_ACTIONS.has(id) && hasUserGuard(code));
}

/** readSession 호출만으로는 부족하다 — 비로그인·장애 두 갈래가 즉시 반환해야 인증이다. */
function hasUserGuard(body: string): boolean {
  if (body.includes("requireUser(")) return true;
  return body.includes("await readSession()") &&
    /if \(session.status === "none"\) return \{ ok: false, error: "unauthorized" \}/.test(body) &&
    /if \(session.status === "unavailable"\) return \{ ok: false, error: "unavailable" \}/.test(body);
}

/**
 * **줄 끝 주석도 벗긴다** (audit #80). 줄 머리 `//`만 지우면 `doThing(); // requireProjectAccess(…)` 같은 인용 한 줄이
 * 가드로 세어져 인가 없는 export가 green이 된다. 짝: 같은 호출이 코드면 가드로 센다. URL의 `//`는 코드로 남는다.
 */
it("줄 끝 주석 속 가드 이름은 가드로 세지 않는다", () => {
  expect(exportGuarded("await doThing(); // requireProjectAccess(prisma, …) 는 호출부가 한다", "x.ts#f")).toBe(false);
  expect(exportGuarded("await requireProjectAccess(prisma, slug);", "x.ts#f")).toBe(true);
  expect(stripComments('const u = "https://github.com"; // note').trimEnd()).toBe('const u = "https://github.com";');
});

it("사용자 Action의 readSession은 두 거부 반환 없이는 인증으로 인정하지 않는다", () => {
  const read = "const session = await readSession();";
  const none = 'if (session.status === "none") return { ok: false, error: "unauthorized" };';
  const outage = 'if (session.status === "unavailable") return { ok: false, error: "unavailable" };';
  expect(hasUserGuard(read)).toBe(false);
  expect(hasUserGuard(read + none)).toBe(false);
  expect(hasUserGuard(read + outage)).toBe(false);
  expect(hasUserGuard(read + none + outage)).toBe(true);
});

/**
 * **인가를 아예 안 지나는 export.** 파일 단위였던 면제를 export 단위로 좁힌 자리다 —
 * 파일 면제는 그 파일에 export가 하나 늘면 조용히 검사 밖이었다.
 *
 * `acceptInvitation`은 `requireUser`도 안 부른다(`readSession`을 직접 읽는다): **수락 전엔 멤버가
 * 아니고**, 인가를 대신하는 것은 단일 사용 토큰과 provider가 검증한 이메일 대조다 (ARCHITECTURE §6.02,
 * membership.test.ts).
 */
const EXEMPT_ACTIONS = new Set(["invite/actions.ts#acceptInvitation"]);

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

/** 그룹·슬롯은 URL에 없고 (.) 인터셉트는 같은 층의 경로다 — 파일 경로로 matcher를 검사하면 오판한다. */
function normalize(rel: string): string {
  return rel
    .split("/")
    .filter((part) => !part.startsWith("@") && !(part.startsWith("(") && part.endsWith(")")))
    .map((part) => part.replace(/^\(\.\)/, ""))
    .join("/");
}

it("인터셉트와 직접 진입을 같은 공개 경로로 판정한다", () => {
  expect(normalize("(edit)/projects/@modal/(.)new/page.tsx")).toBe("projects/new/page.tsx");
  expect(normalize("(edit)/projects/(list)/new/page.tsx")).toBe("projects/new/page.tsx");
});

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

  /**
   * ⚠️ **이름이 아니라 호출(`g(`)을 센다** (2026-09-18, launch-readiness L2.4). 이름만 보면 `import`
   * 줄이 그것을 들고 있어, 호출을 지운 라우트가 green이었다 — `/api/github/setup`에서 뮤테이션으로 잡혔다.
   */
  const callsGuard = (source: string): boolean => {
    const code = stripComments(source);
    return GUARDS.some((g) => code.includes(`${g}(`));
  };

  it("가드 판정은 import·주석이 아니라 호출을 본다", () => {
    const imported = 'import { requireUser } from "@/lib/auth/session";\nexport async function GET() {}';
    expect(callsGuard(imported)).toBe(false);
    expect(callsGuard(imported + "\n/** `requireUser()`를 지난다 */\n// requireUser()")).toBe(false);
    expect(callsGuard(imported + "\nawait requireUser();")).toBe(true);
  });

  /** export 단위 판정도 같은 착시를 막는다 — 함수 안 주석이 가드를 인용해도 호출이 아니다. */
  it("Action export 판정도 주석 인용을 호출로 세지 않는다", () => {
    const quoted = 'export async function f(slug: string) {\n  // getProjectAccess()를 지난 뒤 부른다\n  return slug;\n}';
    expect(exportGuarded(quoted, "x/actions.ts#f")).toBe(false);
    expect(exportGuarded(quoted + "\nawait getProjectAccess({ slug });", "x/actions.ts#f")).toBe(true);
    const userQuoted = 'export async function g() {\n  /** requireUser()면 충분하다 */\n}';
    expect(exportGuarded(userQuoted, "projects/actions.ts#createProject")).toBe(false);
  });

  // Action 파일은 아래 export 단위 검사가 맡는다 — 파일 단위로 보면 `invite/actions.ts`처럼 export가
  // 면제된 파일이 이름 언급 하나로 통과하던 것과 같은 착시가 된다.
  it("예외가 아닌 페이지·라우트는 전부 인가를 지난다", () => {
    const unguarded = ENTRY_POINTS.filter(
      (e) => !e.path.endsWith("actions.ts") && !EXEMPT.has(e.path) && !callsGuard(e.source),
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
        const id = `${file.path}#${mark.name}`;
        if (EXEMPT_ACTIONS.has(id)) continue;
        if (!exportGuarded(body, id)) unguarded.push(id);
      }
    }
    expect(unguarded).toEqual([]);
  });

  it("`requireUser` 면제 목록이 전부 실재한다 — 낡은 이름이 검사를 넓힌 채 남지 않는다", () => {
    const found = new Set<string>();
    for (const file of ENTRY_POINTS.filter((e) => e.path.endsWith("actions.ts"))) {
      for (const mark of actionExports(file.source)) found.add(`${file.path}#${mark.name}`);
    }
    for (const id of [...USER_SCOPED_ACTIONS, ...EXEMPT_ACTIONS]) expect(found, id).toContain(id);
  });

  /**
   * ⚠️ **자기 "0건 아님" 가드다.** 이 파일의 검사 하나가 2026-09-08에 조용해진 전례가 있다
   * (쿼리 수신자 검사 — 화면이 경로를 `routes.*`로 옮기면서 리터럴이 0건이 됐다).
   */
  it("갈라진 판정이 실제로 red를 낸다 — 프로젝트 스코프 Action이 `requireUser`만 부르면 잡힌다", () => {
    const source = 'export async function updateThing(slug: string) { await requireUser(); }';
    const marks = actionExports(source);
    expect(marks.map((m) => m.name)).toEqual(["updateThing"]);
    const id = "projects/[slug]/settings/actions.ts#updateThing";
    expect(USER_SCOPED_ACTIONS.has(id)).toBe(false);
    const accepted = USER_SCOPED_ACTIONS.has(id) ? GUARDS : PROJECT_GUARDS;
    expect(exportGuarded(source, id)).toBe(false);
    expect(accepted.some((g) => source.includes(`${g}(`))).toBe(false);
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
    // 보이고 번역 데이터는 조회조차 하지 않는다 — 새는 것이 그것이 전부라 허용한다 (ARCHITECTURE §6.1).
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
/** `/invite/${token}` · `/projects/[slug]` → `/invite/*` · `/projects/*`. 두 표기를 같은 모양으로 만든다. */
function shape(path: string): string {
  // ⚠️ **optional catch-all(`/[[...slug]]`)은 앞 `/`까지 `*` 하나다** — 세그먼트가 0개여도 선다(`/docs`). 그냥 두면 아래
  // `\[[^\]]*\]`가 `[[...slug]`만 먹어 `/docs/*]`가 됐다. 연달은 `*`는 하나로 접는다 — 생성기의 `${page}${anchor}`가 `**`다.
  return path
    .replace(/\/\[\[\.\.\.[^\]]*\]\]/g, "*")
    .replace(/\$\{[^}]*\}/g, "*")
    .replace(/\[[^\]]*\]/g, "*")
    .replace(/\*+/g, "*");
}

describe("shape — 두 표기를 같은 모양으로", () => {
  it("optional catch-all은 세그먼트 0개도 덮는 `*` 하나다 — `/docs/*]`가 되지 않는다", () => {
    expect(shape("/docs/[[...slug]]")).toBe("/docs*");
    expect(shape("/docs${docPage(page)}${docAnchor(anchor)}")).toBe("/docs*");
    expect(shape("/projects/[slug]/logs")).toBe("/projects/*/logs");
    expect(shape("/invite/${token}")).toBe("/invite/*");
  });
});

describe("죽은 라우트 링크", () => {
  const ROUTES = new Set(ENTRY_POINTS.filter((e) => e.path.endsWith("page.tsx")).map((e) =>
    "/" + e.path.replace(/\/page\.tsx$/, "").replace(/^page\.tsx$/, ""),
  ));

  /**
   * ⚠️ **`lib/routes.ts`도 읽는다** (PRODUCT §7.7). 링크 생성이 그 파일 한 곳으로
   * 모이면서, `app/` 아래만 스캔하는 이 검사가 **가장 중요한 파일을 못 보게** 됐다.
   */
  const LINK_SOURCES = [
    ...ENTRY_POINTS,
    { path: "lib/routes.ts", source: readFileSync(join(APP, "../lib/routes.ts"), "utf8") },
  ];

  it("app/ 아래 라우트 목록을 읽었다", () => {
    expect(ROUTES.size).toBeGreaterThan(2);
  });

  it("링크 생성기(lib/routes.ts)를 스캔 대상에 넣었다", () => {
    expect(LINK_SOURCES.some((e) => e.path === "lib/routes.ts")).toBe(true);
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

  /**
   * ⚠️ **동적 경로가 이 검사의 사각지대였다.** `STATIC_PATH`는 `${…}`가 없는 리터럴만 잡는데,
   * **2026-09-05 사고가 정확히 동적 경로였다**(`/keys?ns=…` → `/projects/${slug}/translations`).
   * "쿼리 파라미터의 수신자"가 이미 쓰는 `shape()` 정규화(`${…}`·`[…]` → `*`)를 여기에도 적용해
   * `lib/routes.ts`의 템플릿을 실재 라우트와 대조한다.
   */
  const TEMPLATE_PATH = /["'`](\/[a-z][A-Za-z0-9/\-]*(?:\$\{[^}]*\}[A-Za-z0-9/\-]*)+)(?:[?"'`])/g;

  it("검사식이 템플릿 경로를 잡고 정적 경로와 겹치지 않는다", () => {
    const found = [...[
      "const a = `/projects/${slug}/translations`;",
      'const b = "/projects/new";',
    ].join("\n").matchAll(TEMPLATE_PATH)].map((m) => m[1]);
    expect(found).toEqual(["/projects/${slug}/translations"]);
  });

  it("템플릿으로 만든 경로도 실재하는 라우트를 가리킨다", () => {
    const ROUTE_SHAPES = [...ROUTES].map(shape);
    const dead: string[] = [];
    const seen: string[] = [];
    for (const entry of LINK_SOURCES) {
      const code = entry.source
        .split("\n")
        .filter((l) => !/^\s*(\*|\/\/)/.test(l))
        .join("\n");
      for (const m of code.matchAll(TEMPLATE_PATH)) {
        const path = shape(m[1] ?? "");
        if (path.startsWith("/api")) continue;
        seen.push(path);
        const known = ROUTE_SHAPES.some((r) => r === path || r.startsWith(path + "/"));
        if (!known) dead.push(`${entry.path}: ${path}`);
      }
    }
    expect(dead).toEqual([]);
    // 실제로 걸었다 — 0건 통과를 성공으로 읽지 않는다.
    expect(seen.length).toBeGreaterThan(0);
  });

  it("코드가 만드는 경로 리터럴이 실재하는 라우트를 가리킨다", () => {
    const dead: string[] = [];
    for (const entry of LINK_SOURCES) {
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
  const ROUTES_SOURCE = readFileSync(join(APP, "../lib/routes.ts"), "utf8");
  // 링크·쿼리의 수신자는 직접 진입 페이지다. 같은 URL의 null 슬롯을 고르면 수신 계약이 없는 것으로 오판한다.
  // 슬롯의 인가 검사는 위 ENTRY_POINTS 전수 검사에 그대로 남는다.
  const PAGES = ENTRY_POINTS.filter((e) => e.path.endsWith("page.tsx") && !e.rel.split("/").some((part) => part.startsWith("@"))).map((e) => ({
    shape: shape("/" + e.path.replace(/\/?page\.tsx$/, "")),
    source: e.source,
    path: e.path,
  }));

  /**
   * `lib/routes.ts`의 각 항목 → 그 경로의 shape. **리터럴을 여기 복사하지 않고 그 파일에서 읽는다** —
   * 복사하면 라우트를 옮길 때 이 테스트가 옛 경로를 정답으로 들고 조용히 통과한다(2026-09-05 사고의 형).
   */
  function routeShapes(source: string): Map<string, string> {
    const out = new Map<string, string>();
    const re = /(\w+):\s*\([^)]*\)[^=]*=>\s*(?:withQuery\(\s*)?[`"']([^`"']+)[`"']/g;
    for (const m of source.matchAll(re)) out.set(m[1] ?? "", shape(m[2] ?? ""));
    return out;
  }

  /**
   * 진입점 소스가 만드는 "경로 + 쿼리". **두 형태를 다 본다**:
   *
   * 1. 경로 리터럴 — `` `/invite/${token}?e=${error}` ``
   * 2. **생성기 호출** — `` `${routes.invite(token)}?e=${error}` ``
   * 3. **생성기의 쿼리 인자** — `routes.account({ sessionRevocation })`
   *
   * ⚠️ **2번이 없으면 이 검사가 조용히 0건이 된다** (2026-09-08 실측). ship 4가 화면들의 경로 리터럴을
   * `routes.*`로 옮기면서 1번 패턴이 한 줄도 남지 않았고, 아래 "0건이 되지 않는다" 가드가 그것을 잡았다 —
   * 가드가 없었으면 "쿼리를 보내놓고 읽는 쪽이 없다"는 부류(issue #2)가 다시 사각지대로 들어갔다.
   *
   * ⚠️ **3번은 2026-09-11에 붙었다.** 그전까지 앞의 둘은 **문자열 보간 안의 `?key=`만** 봤는데,
   * `routes.*`가 쿼리를 인자로 받기 시작하면서(`signIn({ error })`·`projects({ q })`·
   * `account({ sessionRevocation })`·`logs({ cursor })`) 그 형태가 **네 자리 전부 검사 밖**이었다 —
   * 옮기는 것 자체가 검사를 회피시키는 모양이었고, `routes.ts` 주석은 반대로 적고 있었다.
   */
  const ROUTE_PATHS = routeShapes(ROUTES_SOURCE);

  /**
   * ⚠️ **진입점 밖에서도 쿼리를 실어 보낸다.** 목록 본문이 `components/projects/project-list.tsx`로
   * 내려가면서(new-project-modal T8) `routes.projects({ q })`·`routes.newProject({ … })`가
   * `app/` 밖으로 나갔다 — 이 목록이 없으면 그 자리가 조용히 사각지대다. **옮기는 것 자체가 검사를
   * 회피시키는 모양**이고, 그것이 이 절의 3번 패턴이 2026-09-11에 붙은 이유이기도 하다.
   */
  const EXTRA_EMITTERS = [
    "components/projects/project-list.tsx",
    /**
     * ⚠️ **2026-09-13에 들어왔다** (DESIGN §6.63). 필터 탭이 사라지면서 `routes.projects({ q })`의
     * **유일한 발신처**가 이 파일이 됐다 — 목록 본문에는 인자 없는 `routes.projects()`만 남는다.
     * 안 넣으면 이 절이 "검사 밖으로 옮겨졌다"를 스스로 반복한다.
     */
    "components/projects/search-input.tsx",
    /**
     * ⚠️ **Logs의 좁히는 축 전부가 여기서 나간다** (logs-rework T6b) — 필터 다섯·검색·[Clear]가
     * `routes.logs({ … })`를 부르는 **유일한 발신처**이고, 화면 파일에는 인자 없는 호출만 남는다.
     * 안 넣으면 이 절이 "검사 밖으로 옮겨졌다"를 또 반복한다.
     */
    "components/logs/log-filters.tsx",
    /**
     * ⚠️ **Home의 Recent logs가 `routes.project(slug, { event })`를 낸다** (logs-rework T8b) —
     * 상세를 **Home 위에서** 여는 유일한 발신처이고, Home 화면 파일에는 인자 없는 호출만 남는다.
     */
    "components/home/logs-card.tsx",
  ];

  const SOURCES = [
    ...ENTRY_POINTS,
    ...EXTRA_EMITTERS.map((rel) => ({ path: rel, source: readFileSync(join(ROOT, rel), "utf8") })),
  ];

  it("추가 발신처가 전부 실재한다 — 낡은 경로가 목록에 남지 않는다", () => {
    for (const rel of EXTRA_EMITTERS) expect(existsSync(join(ROOT, rel)), rel).toBe(true);
  });

  const EMITTED = SOURCES.flatMap((e) => {
    const code = e.source
      .split("\n")
      .filter((l) => !/^\s*(\*|\/\/)/.test(l))
      .join("\n");
    const literal = [
      ...code.matchAll(/["'`](\/[a-z][A-Za-z0-9/[\]$_{}.-]*)\?([A-Za-z_][A-Za-z0-9_]*)=/g),
    ].map((m) => ({ from: e.path, target: shape(m[1] ?? ""), key: m[2] ?? "" }));
    const generated = [...code.matchAll(/routes\.(\w+)\([^)]*\)\}\?([A-Za-z_][A-Za-z0-9_]*)=/g)].flatMap(
      (m) => {
        const target = ROUTE_PATHS.get(m[1] ?? "");
        // 생성기에 없는 이름이면 아래 "죽은 라우트 링크"가 잡는 부류다 — 여기서 조용히 버리지 않는다.
        return target === undefined ? [] : [{ from: e.path, target, key: m[2] ?? "" }];
      },
    );
    /**
     * `routes.foo({ a, b: x })` → 그 객체의 키들. **값은 안 본다** — 키가 계약이고, 값은 화면이
     * 어떻게 채우든 수신자가 같아야 한다.
     */
    const passed = [...code.matchAll(/routes\.(\w+)\(\s*(?:[^(){}]*,\s*)?\{([^}]*)\}/g)].flatMap((m) => {
      const target = ROUTE_PATHS.get(m[1] ?? "");
      if (target === undefined) return [];
      return [...(m[2] ?? "").matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*[,:}]/g)].map((k) => ({
        from: e.path,
        target,
        key: k[1] ?? "",
      }));
    });
    return [...literal, ...generated, ...passed];
  });

  it("쿼리를 실어 보내는 자리를 하나 이상 찾았다 — 스캐너가 조용히 0건이 되지 않는다", () => {
    expect(EMITTED.length).toBeGreaterThan(0);
  });

  it("`routes.ts`에서 경로를 읽어냈다 — 이름→shape 표가 비면 생성기 형태가 전부 버려진다", () => {
    expect(ROUTE_PATHS.get("projects")).toBe("/projects");
    expect(ROUTE_PATHS.get("invite")).toBe("/invite/*");
    expect(ROUTE_PATHS.get("translations")).toBe("/projects/*/translations");
  });

  /** ⚠️ 세 형태를 각각 먹인다 — 하나를 못 집으면 그 부류가 조용히 사각지대로 들어간다. */
  it("리터럴·생성기 호출·쿼리 인자를 다 집는다", () => {
    expect(EMITTED.some((x) => x.target === "/invite/*" && x.key === "e")).toBe(true);
    expect(EMITTED.some((x) => x.target === "/projects" && x.key === "e")).toBe(true);
    // 3번 — 인자 객체. 이 셋이 2026-09-11까지 전부 검사 밖이었다.
    expect(EMITTED.some((x) => x.target === "/account" && x.key === "sessionRevocation")).toBe(true);
    // ⚠️ **`filter`가 아니라 `q`다** — 필터 축이 2026-09-13에 사라졌고(DESIGN §6.63),
    // 그것을 실어 보내던 자리가 검색창 하나로 줄었다.
    expect(EMITTED.some((x) => x.target === "/projects" && x.key === "q")).toBe(true);
  });

  /**
   * ⚠️ **링크 생성기가 이 검사의 사각지대였다** (2026-09-08 code-review 🟡3). `lib/routes.ts`는 쿼리를
   * `URLSearchParams`로 조립하므로 `"/path?key="` 리터럴이 **한 줄도 없다** — 위 `EMITTED` 정규식이
   * 조용히 0건을 낸다. 그래서 그 파일은 **타입에서** 키를 읽어 대상 페이지와 대조한다.
   *
   * 아직 수신자가 없는 키는 **이름으로 고정한다**(축소형 — `no-korean-ui`·`focus-ring`과 같은 형).
   *
   * ⚠️ **2026-09-15에 비었다** — `state`가 번역 화면에 실제로 붙었다 (project-home T7).
   */
  const PENDING_QUERY_KEYS: string[] = [];

  /**
   * 타입에서 쿼리 키 이름을 뽑는다. **주석을 먼저 벗긴다** — 설명 안의 `낱말:`이 필드로 잡히면
   * 이 검사가 자기 대상을 잘못 세고, 그건 조용한 오탐이다.
   *
   * ⚠️ **형이 둘이다** (2026-09-12): 생성기 쪽은 `type X = { ns?: string; … }` 리터럴이고, 화면 쪽은
   * 배열을 경계에서 접느라 `type X = Raw<"ns" | "locales">`다. **앞것만 읽으면** 화면이 `Raw`로
   * 옮겨가는 순간 `ACCEPTED`가 빈 배열이 되어 이 검사가 **통째로 무력해진다**(실측: 그 커밋에서
   * "생성기가 내는 키를 화면이 받는다"가 red가 아니라 **모든 키를 미수신으로** 보고했다).
   */
  function queryKeysOf(source: string, typeName: string): string[] {
    const bare = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/gm, "$1");
    const literal = new RegExp(`type ${typeName} = \\{([\\s\\S]*?)\\};`).exec(bare)?.[1];
    if (literal !== undefined) return [...literal.matchAll(/(\w+)\??\s*:/g)].map((m) => m[1] ?? "");
    const raw = new RegExp(`type ${typeName} = Raw<([^>]*)>;`).exec(bare)?.[1] ?? "";
    return [...raw.matchAll(/"([^"]+)"/g)].map((m) => m[1] ?? "");
  }

  const TRANSLATIONS_PAGE = ENTRY_POINTS.find((e) => e.path === "projects/[slug]/translations/page.tsx");
  /** 번역 화면이 **실제로 받는** 쿼리 키. 그 페이지의 `type Search`가 계약이다. */
  const ACCEPTED = queryKeysOf(TRANSLATIONS_PAGE?.source ?? "", "Search");

  /** ⚠️ 두 형을 각각 먹인다 — 하나를 못 집으면 그쪽이 조용히 빈 목록이 되고 검사가 장식이 된다. */
  it("리터럴과 `Raw<…>` 두 형에서 키를 뽑는다", () => {
    expect(queryKeysOf('type S = { ns?: string; q?: string };', "S")).toEqual(["ns", "q"]);
    expect(queryKeysOf('type S = Raw<"ns" | "locales" | "q">;', "S")).toEqual(["ns", "locales", "q"]);
    expect(queryKeysOf("const other = 1;", "S")).toEqual([]);
  });

  it("양쪽 타입에서 쿼리 키를 읽어냈다 — 스캐너가 조용히 0건이 되지 않는다", () => {
    expect(queryKeysOf(ROUTES_SOURCE, "TranslationsQuery")).toEqual(["ns", "locales", "q", "state", "scope", "completion", "missingLocale", "cursor", "key", "keySurface", "language"]);
    expect(ACCEPTED.length).toBeGreaterThan(0);
  });

  it("생성기가 내는 쿼리 키를 번역 화면이 받는다", () => {
    const unread = queryKeysOf(ROUTES_SOURCE, "TranslationsQuery").filter(
      (key) => !PENDING_QUERY_KEYS.includes(key) && !ACCEPTED.includes(key),
    );
    expect(unread).toEqual([]);
  });

  it("대기 목록에 낡은 항목이 없다 — 화면이 받기 시작하면 목록에서 뺀다", () => {
    expect(PENDING_QUERY_KEYS.filter((key) => ACCEPTED.includes(key))).toEqual([]);
  });

  // 주석을 벗기고 센다 (POSTMORTEM 2026-09-18) — 페이지 주석이 `searchParams`를 설명하는 일이 흔하다.
  const readsSearchParams = (source: string): boolean => stripComments(source).includes("searchParams");

  it("수신 판정은 주석 속 `searchParams` 언급을 읽기로 세지 않는다", () => {
    const page = "export default async function Page() {\n  // searchParams는 안 읽는다\n  return null;\n}";
    expect(readsSearchParams(page)).toBe(false);
    expect(readsSearchParams(page.replace("Page()", "Page({ searchParams }: Props)"))).toBe(true);
  });

  it("보낸 쿼리를 대상 페이지가 읽는다", () => {
    const unread: string[] = [];
    for (const emit of EMITTED) {
      const page = PAGES.find((p) => p.shape === emit.target);
      // 대상이 이 앱의 페이지가 아니면(외부 URL·API) 이 검사의 대상이 아니다.
      if (page === undefined) continue;
      if (!readsSearchParams(page.source)) {
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
 * **`(edit)` 아래 새 페이지가 1차 차단의 보호 경로에 든다.**
 *
 * 1차 차단은 미들웨어 하나이고(ARCHITECTURE §6.1), 보호 경로에 없는 라우트는 **쿠키 검사를 아예
 * 지나지 않는다.** 본판정이 진입점에 있으니 데이터가 새지는 않지만, 비로그인 사용자가 로그인
 * 화면 대신 `requireUser`의 redirect에 도달하는 경로가 하나 더 늘고 그 차이는 눈에 안 보인다
 * (2026-09-07, T7이 `/projects/new`를 더하면서 자동 검사가 없다는 것이 드러났다).
 *
 * ⚠️ **matcher와 보호 경로가 갈렸다** (sec-audit-3 #11). CSP nonce를 미들웨어가 발급하므로 matcher는
 * **모든 페이지**를 덮고, 로그인으로 돌려보낼지는 `isProtectedPath`가 정한다. 옛 규칙 "보호 라우트는
 * matcher에 추가한다"는 이제 **`isProtectedPath`에 추가한다**이다.
 *
 * ⚠️ **`(edit)` 밖은 대상이 아니다** — `/`(랜딩)와 `/invite/[token]`은 **일부러** 보호 경로 밖이고,
 * 후자는 넣으면 초대 토큰이 로그인 화면으로 302되며 사라진다.
 */
describe("보호 라우트가 1차 차단에 걸린다 — matcher는 전 페이지다", () => {
  /** `[slug]` 같은 동적 세그먼트는 구체 값으로 바꿔 대조한다 — 패턴 대 패턴은 비교할 수 없다. */
  const PROTECTED = ENTRY_POINTS.filter((e) => e.rel.startsWith("(edit)/") && e.rel.endsWith("page.tsx")).map(
    (e) => "/" + e.path.replace(/\/?page\.tsx$/, "").replace(/\[[^\]]*\]/g, "sample"),
  );
  /**
   * ⚠️ **하드코딩이다** — `PROTECTED`는 `(edit)/` 아래에서만 만들어지므로, 여기 등재하지 않으면
   * "보호 경로가 아니다"를 재는 대상이 아예 없다 (POSTMORTEM 2026-09-07).
   */
  const PUBLIC = ["/", "/signin", "/signin/link/sample", "/invite/sample", "/privacy", "/docs", "/docs/setup/workflow"];

  /** Next matcher의 `source` — 이 모양(정규식 그룹 하나)은 path-to-regexp와 JS 정규식이 같게 읽는다. */
  const MATCHERS = (middlewareConfig.matcher as readonly string[]).map((source) => new RegExp(`^${source}$`));
  const matched = (path: string) => MATCHERS.some((re) => re.test(path));

  it("보호 페이지를 실제로 읽었다 — 파싱이 조용히 0건이 되지 않는다", () => {
    expect(MATCHERS.length).toBeGreaterThan(0);
    expect(PROTECTED.length).toBeGreaterThan(1);
  });

  it("판정이 실제로 가른다 — 공허하게 통과하지 않는다", () => {
    expect(isProtectedPath("/projects")).toBe(true);
    expect(isProtectedPath("/projects/new")).toBe(true);
    expect(isProtectedPath("/projects/sample/settings")).toBe(true);
    expect(isProtectedPath("/account")).toBe(true);
    // 접두 문자열만 같은 경로는 보호 대상이 아니다 — 이 줄이 위 넷을 의미 있게 만든다.
    expect(isProtectedPath("/projectsx")).toBe(false);
    expect(isProtectedPath("/invite/sample")).toBe(false);
  });

  it("(edit) 아래 모든 페이지가 보호 경로다", () => {
    expect(PROTECTED.filter((path) => !isProtectedPath(path))).toEqual([]);
  });

  /**
   * ⚠️ **로그인 화면을 보호 경로에 넣으면 로그인이 통째로 죽는다** (8-1a).
   *
   * `shouldRedirectToLogin`은 경로를 보지 않는다 — 목적지 제외 규칙이 한 줄도 없으므로, `/signin`이
   * 보호 경로에 들면 쿠키 없는 모든 `GET /signin`이 **자기 자신으로 307을 돈다**(`ERR_TOO_MANY_REDIRECTS`).
   * 이 단언이 필요한 이유는 **반대 방향의 압력이 규칙으로 박혀 있어서다** — "새 보호 라우트를 추가한다"를
   * 그대로 따르는 사람이 정확히 이 함정을 밟는다.
   *
   * ⚠️ **비로그인으로 열려야 하는 라우트 전부가 대상이다** — `/`(랜딩)·`/signin`·`/invite`
   * (토큰이 302되며 사라진다, ARCHITECTURE §6.1)·공개 문서 둘.
   */
  it("비로그인 진입점은 보호 경로 밖이다 — 넣으면 자기 자신으로 307을 돈다", () => {
    expect(PUBLIC.filter((path) => isProtectedPath(path))).toEqual([]);
  });

  /** CSP는 미들웨어만 낸다(§8 — 헤더 하나) — matcher 밖의 페이지는 **정책 없이** 나간다. */
  it("모든 페이지가 matcher에 걸린다 — 보호든 공개든 CSP를 받는다", () => {
    expect([...PROTECTED, ...PUBLIC].filter((path) => !matched(path))).toEqual([]);
  });

  it("정적 자산은 matcher 밖이다 — 폰트·청크마다 미들웨어를 타지 않는다", () => {
    const ASSETS = ["/_next/static/chunks/app.js", "/_next/image", "/fonts/pretendard/x.woff2", "/guide/setup.png", "/brand/logo.svg", "/email/logo.png", "/flags/fr.svg", "/icon.svg"];
    expect(ASSETS.filter(matched)).toEqual([]);
  });

  /**
   * GitHub이 브라우저를 되돌리는 지점(설치·인가·리포 선택 변경이 전부 callback으로 온다). 로그인은 필요하지만(`requireUser`)
   * 로그인 화면으로 302되면 쿼리(`code`·`setup_action`)가 사라진다 (POSTMORTEM 2026-09-06 "쿼리 수신자").
   * ⚠️ **`/api/*`는 matcher 자체에서 빠진다** — CLAUDE.md "`middleware.ts` matcher에 넣지 않는다"가 그대로 참이다.
   */
  it("GitHub 복귀 지점은 matcher 밖이다 — 302되면 쿼리가 사라진다", () => {
    const RETURNS = ["/api/github/callback", "/api/auth/callback/github"];
    expect(RETURNS.filter(matched)).toEqual([]);
    expect(RETURNS.filter((path) => isProtectedPath(path))).toEqual([]);
    // 대조군: 같은 판정이 보호 경로는 덮는다고 말한다 — 0건이 판정 고장이 아니다.
    expect(matched("/projects/new") && isProtectedPath("/projects/new")).toBe(true);
  });
});

it.each(["runRepositoryImport", "checkOpenPullRequest"])("%s는 OWNER의 project:settings로 인가한다", name => {
  const source = readFileSync(join(APP, "(edit)/projects/actions.ts"), "utf8");
  const declaration = source.match(new RegExp(`export async function ${name}\\b[\\s\\S]*?(?=\\nexport |$)`))?.[0];
  expect(declaration).toBeDefined();
  expect(declaration).toMatch(/getProjectAccess\([\s\S]*?permission:\s*["']project:settings["']/);
});
