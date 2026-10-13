import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";

import { ts } from "ts-morph";
import { describe, expect, it } from "vitest";

/**
 * **두 GitHub 자격증명이 소스에서 섞이지 않는다** (ARCHITECTURE §0-6 · CLAUDE.md "두 GitHub 자격증명을
 * 섞지 않는다").
 *
 * - `lib/github.ts` — App **installation** 토큰. 커밋을 만든다. 개인키(`GITHUB_APP_PRIVATE_KEY`)를 문다.
 * - `lib/github-connect/` — **user-to-server** 토큰. **GET만 부른다.** 개인키를 몰라야 한다.
 *
 * OAuth 사용자 토큰이 커밋 경로에 들어가면 커밋이 개인 명의가 되고, 그 사람이 org를 떠나면
 * 파이프라인이 깨진다 (ARCHITECTURE §6). 반대로 App 개인키가 연결 경로로 새면 사용자 인가 판정에
 * 앱 권한이 섞인다.
 *
 * ⚠️ `entry-points.test.ts`와 같은 성질의 **상시 방어선**이다 — 읽어서 한 번 확인하는 것으로는
 * 다음 커밋에 무너진다.
 */

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));

/**
 * App 개인키 경로에만 있어야 하는 것. `lib/github-connect/` 어디에도 없어야 한다.
 *
 * ⚠️ **`\bApp\b`로는 못 가른다.** 사용자 문구가 "이 리포에 App이 설치돼 있지 않아요"라고 말하고
 * 그건 주석이 아니라 코드다 — 넓은 패턴은 잡을 것을 잡는 대신 항상 red가 되어 이 방어선을
 * 통째로 버리게 만든다. **자격증명을 무는 형태**(octokit의 `App` import·생성자·개인키 헬퍼·
 * installation 토큰 발급)만 겨눈다.
 */
const APP_CREDENTIAL =
  /import\s*\{[^}]*\bApp\b[^}]*\}\s*from\s*["']octokit["']|new App\s*\(|parsePrivateKey|GITHUB_APP_PRIVATE_KEY|getInstallationOctokit/;

/**
 * **쓰기 호출.** 사용자 토큰으로 GitHub에 쓰면 커밋이 개인 명의가 되고 권한 면적이 넓어진다.
 *
 * ⚠️ **octokit의 입구가 넷이라 넷을 다 본다**:
 *
 * 1. `request("POST …")` — 리터럴 route
 * 2. `paginate("POST …")` — **실제 코드가 쓰는 형태다**(`user.ts`가 `paginate("GET /user/installations")`),
 *    그래서 가장 그럴듯한 회귀는 그 자리의 동사가 바뀌는 것이다. `request`만 보면 통째로 새는 자리다
 * 3. `rest.*`의 이름 붙은 쓰기 메서드 — 동사로 판정한다(`rest` 아래 메서드 이름은 안정된 규약이다:
 *    `create*`·`update*`·`delete*`·`replace*`·`add*`·`remove*`·`merge`·`set*`)
 * 4. `graphql`의 `mutation` — REST만 겨누면 이 입구가 남는다
 *
 * 1번만 보던 시절엔 나머지 셋이 조용히 통과했고, 그 상태로 문서가 "GET만 부른다"고 단언했다.
 */
const WRITE_CALL =
  /(?:request|paginate)\(\s*["'`](POST|PATCH|PUT|DELETE)\s|\brest\.[A-Za-z]+\.(create|update|delete|replace|add|remove|merge|set)[A-Za-z]*\s*[(,]|graphql\(\s*["'`][\s\S]{0,40}?\bmutation\b/;

/**
 * **사용자 토큰을 다루는 모듈.** `lib/github.ts`가 이걸 물면 커밋 경로에 사용자 토큰이 들어온다.
 *
 * ⚠️ **`lib/github-connect/` 전체를 막지 않는다.** 그 디렉터리에는 순수 판정(`health.ts`의
 * `probeFromError`·`ProbeResult`)도 있고, `probeRepo`가 실패를 분류하려면 그것을 **불러야 한다** —
 * 안 부르고 자체 분기를 두면 판정이 두 벌이 되어 403이 한쪽에서만 `not-installed`가 된다
 * (`/code-review` 2026-09-06이 T2 위험으로 지목한 자리). 막아야 하는 것은 디렉터리가 아니라
 * **토큰을 쥔 모듈**이다.
 */
const USER_TOKEN_IMPORT = /from\s+["'](@\/lib\/github-connect\/(user|token-store)|(\.\.?\/)+github-connect\/(user|token-store))/;

function sourcesIn(dir: string, base: string): { rel: string; source: string }[] {
  const out: { rel: string; source: string }[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "__tests__") continue;
    const full = join(dir, entry);
    const rel = `${base}/${entry}`;
    if (statSync(full).isDirectory()) out.push(...sourcesIn(full, rel));
    // `.tsx`도 읽는다 — 서버 컴포넌트가 토큰 모듈을 물어도 green이던 사각이다(audit A7).
    else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) out.push({ rel, source: readFileSync(full, "utf8") });
  }
  return out;
}

const CONNECT_SOURCES = sourcesIn(join(ROOT, "lib/github-connect"), "lib/github-connect");
const GITHUB_TS = readFileSync(join(ROOT, "lib/github.ts"), "utf8");
/**
 * **온보딩은 GitHub을 아예 모른다** (2026-09-07, ARCHITECTURE §3.1). 순수 판정과 DB 껍데기(`ingest.ts`)만 갖고,
 * App 개인키도 사용자 토큰도 **그리고 `lib/github.ts`도** import하지 않는다 — 두 토큰이 만나는 자리는
 * Server Action 하나여야 한다. 여기에 루트를 더하지 않으면 이 방어선이 새 디렉터리를 자동으로 덮지 않는다.
 */
const ONBOARDING_SOURCES = [
  ...sourcesIn(join(ROOT, "lib/onboarding"), "lib/onboarding"),
  ...sourcesIn(join(ROOT, "lib/account-connect"), "lib/account-connect"),
];
/**
 * **App 토큰을 쓰는 쪽** — 커밋·PR·미리보기·열린 PR 조회 (launch-readiness L4.9). 이쪽은 `@/lib/github`을 정당하게 물고,
 * 사용자 토큰을 물면 두 자격증명이 한 파일에서 만난다. 전에는 이 루트들을 안 훑어 `lib/projects/open-pr.ts` 같은 자리가
 * 2홉 뒤에 사용자 토큰을 물어도 green이었다 (POSTMORTEM "2홉은 못 본다").
 */
// `lib/nightly` — 야간 판정이 head·열린 PR을 installation 토큰으로 읽는다(nightly-sync).
// `lib/repo-host` — 리포 호스트 경계(gitlab-repositories). 소비자가 `lib/github.ts` 대신 이것을 문다 — 경계 자신도 사용자 토큰을 모른다.
const APP_TOKEN_SOURCES = ["lib/pull", "lib/push", "lib/projects", "lib/publish", "lib/import", "lib/nightly", "lib/repo-host"].flatMap((dir) => sourcesIn(join(ROOT, dir), dir));
/**
 * **두 자격증명이 만나는 코어** (mcp-connector T4-c — design §1.3). Server Action과 MCP 도구가 같은 코어를 부르므로 만남점이 Server Action
 * 하나가 아니게 됐다. 규칙은 Server Action과 같다 — **둘 다 import할 수 있고, 쓰기는 App 토큰 경로(`@/lib/github`)만** 한다: App 개인키를
 * 직접 물지 않고(`lib/github.ts`만 문다) octokit 쓰기를 직접 부르지 않는다. ⚠️ `lib/onboarding`·`APP_TOKEN_SOURCES`에 넣으면 사용자 토큰
 * import가 red다 — 거기 넣지 않는다. 새 만남점 루트는 여기 더한다.
 */
// `lib/mcp` — MCP 도구(T6·T7)가 `ensureUserToken`(GET)과 App 토큰 경로 코어를 함께 부른다(design §1.3 · §6 불변식 6).
const MEETING_ROOTS = ["lib/onboarding-run", "lib/mcp"];
const MEETING_SOURCES = MEETING_ROOTS.flatMap((dir) => sourcesIn(join(ROOT, dir), dir));
/**
 * 커밋 경로(App 토큰) 모듈. 온보딩이 이걸 물면 두 자격증명이 한 파일에서 만날 길이 열린다.
 * 리포 호스트 경계(`@/lib/repo-host`)도 같은 경로다 — 그 뒤에 `lib/github.ts`가 있다. 순수 잎(`/target`·`/reader`)은 아니다.
 */
const COMMIT_PATH_IMPORT = /from\s+["'](@\/lib\/github|\.\.\/github|@\/lib\/repo-host)["']/;

/**
 * 주석은 뺀다 — 경계를 설명하는 문장이 그 이름을 인용한다. 블록 주석은 **통째로** 지운다:
 * 한 줄짜리 `/** … *\/`는 줄 앞이 `*`가 아니라 줄 단위 필터로 안 걸린다.
 */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");
}

describe("검사식이 실제로 잡는다 — 스캐너가 공허하게 통과하지 않는다", () => {
  it("교차 import를 넣으면 검사식이 걸린다", () => {
    // POSTMORTEM 2026-09-03: 주석이 계약을 단언했는데 그것을 검사한다는 테스트의 **이름만** 그랬다.
    // 일부러 위반 소스를 만들어 검사식이 red를 낼 수 있음을 보인다.
    expect(APP_CREDENTIAL.test('import { App } from "octokit";')).toBe(true);
    expect(APP_CREDENTIAL.test('import { App, OAuthApp } from "octokit";')).toBe(true);
    expect(APP_CREDENTIAL.test("return new App({ appId })")).toBe(true);
    expect(APP_CREDENTIAL.test('parsePrivateKey(requireEnv("GITHUB_APP_PRIVATE_KEY"))')).toBe(true);
    expect(APP_CREDENTIAL.test("await app.getInstallationOctokit(1)")).toBe(true);
    expect(USER_TOKEN_IMPORT.test('import { exchangeCode } from "@/lib/github-connect/user";')).toBe(true);
    // ⚠️ **상대 경로 깊이가 하나가 아니다** — `lib/onboarding/`에서는 `../github-connect/…`다. 전에는
    // `./github-connect/…`만 잡아 그 깊이가 통째로 새어 있었다 (code-review 2026-09-07 🟡4).
    expect(USER_TOKEN_IMPORT.test('import { ensureUserToken } from "../github-connect/token-store";')).toBe(true);
    expect(USER_TOKEN_IMPORT.test('import { x } from "./github-connect/user";')).toBe(true);
  });

  it("정상 소스는 걸리지 않는다 — 과잉 매칭으로 항상 red가 되지 않는다", () => {
    expect(APP_CREDENTIAL.test('import { OAuthApp } from "octokit";')).toBe(false);
    expect(APP_CREDENTIAL.test('requireEnv("GITHUB_APP_CLIENT_ID")')).toBe(false);
    expect(USER_TOKEN_IMPORT.test('import { createGitClient } from "@/lib/github";')).toBe(false);
    // 순수 판정 import는 허용이다 — 토큰을 쥐지 않는다.
    expect(USER_TOKEN_IMPORT.test('import { probeFromError } from "@/lib/github-connect/health";')).toBe(false);
    // 사용자 문구가 "App"을 말한다 — 이걸 잡으면 방어선이 항상 red라 버려진다.
    expect(APP_CREDENTIAL.test('return "이 리포에 App이 설치돼 있지 않아요.";')).toBe(false);
  });

  it("스캔 대상을 실제로 찾았다", () => {
    expect(CONNECT_SOURCES.length).toBeGreaterThan(3);
    expect(ONBOARDING_SOURCES.length).toBeGreaterThan(3);
    // 여섯 다 들어왔는가 — 한 디렉터리가 이름이 바뀌면 조용히 0개가 된다.
    for (const dir of ["lib/pull", "lib/push", "lib/projects", "lib/publish", "lib/import", "lib/nightly"]) {
      expect(APP_TOKEN_SOURCES.some((f) => f.rel.startsWith(`${dir}/`)), dir).toBe(true);
    }
  });

  it("커밋 경로 import 검사식이 실제로 잡는다", () => {
    expect(COMMIT_PATH_IMPORT.test('import { readRepoSnapshot } from "@/lib/github";')).toBe(true);
    expect(COMMIT_PATH_IMPORT.test('import { probeRepo } from "../github";')).toBe(true);
    expect(COMMIT_PATH_IMPORT.test('import { createGitClient } from "@/lib/repo-host";')).toBe(true);
    expect(COMMIT_PATH_IMPORT.test('import { repoTargetOf } from "@/lib/repo-host/target";')).toBe(false);
    // 이웃 디렉터리는 다른 모듈이다 — 넓게 잡으면 방어선이 항상 red가 된다.
    expect(COMMIT_PATH_IMPORT.test('import { probeFromError } from "@/lib/github-connect/health";')).toBe(false);
    expect(COMMIT_PATH_IMPORT.test('import { logFailure } from "@/lib/github-connect/log";')).toBe(false);
  });
});

describe("온보딩은 두 자격증명을 모른다 (ARCHITECTURE §3.1)", () => {
  it("lib/onboarding/이 App 자격증명을 참조하지 않는다", () => {
    const offenders = ONBOARDING_SOURCES.filter((f) => APP_CREDENTIAL.test(codeOnly(f.source))).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("lib/onboarding/이 사용자 토큰 모듈을 import하지 않는다", () => {
    const offenders = ONBOARDING_SOURCES.filter((f) => USER_TOKEN_IMPORT.test(codeOnly(f.source))).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("lib/onboarding/이 `@/lib/github`을 import하지 않는다 — 스냅샷·blob은 Server Action이 값으로 넘긴다", () => {
    const offenders = ONBOARDING_SOURCES.filter((f) => COMMIT_PATH_IMPORT.test(codeOnly(f.source))).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });
});

describe("App 토큰 경로가 사용자 토큰을 모른다", () => {
  /**
   * **루트 목록이 손 목록이라 새 소비자를 놓친다** (audit #81). 감사 시점에 `lib/import/`가 `@/lib/github`을 세 파일에서
   * 물고 있었는데 목록 밖이라, 거기서 사용자 토큰을 물어도 green이었다. `lib/` 전체에서 커밋 경로를 무는 파일을
   * 찾아 목록 안인지 잰다 — 짝으로 실제 소비자가 0이 아님을 본다.
   */
  it("lib/에서 `@/lib/github`을 무는 파일은 전부 스캔 범위 안이다", () => {
    const scanned = new Set([...APP_TOKEN_SOURCES, ...MEETING_SOURCES].map((f) => f.rel));
    const consumers = sourcesIn(join(ROOT, "lib"), "lib").filter((f) => COMMIT_PATH_IMPORT.test(codeOnly(f.source)));
    expect(consumers.length).toBeGreaterThan(3);
    expect(consumers.map((f) => f.rel).filter((rel) => !scanned.has(rel))).toEqual([]);
  });

  it("lib/pull·push·projects·publish·import·nightly가 사용자 토큰 모듈을 import하지 않는다", () => {
    const offenders = APP_TOKEN_SOURCES.filter((f) => USER_TOKEN_IMPORT.test(codeOnly(f.source))).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });
});

describe("두 자격증명이 만나는 코어 — Server Action과 같은 규칙", () => {
  it("스캔 대상을 실제로 찾았다 — 두 자격증명을 다 무는 파일이 있다", () => {
    expect(MEETING_SOURCES.length).toBeGreaterThan(3);
    // 규칙이 공허하지 않다: 만남점이면 사용자 토큰과 App 토큰 경로를 한 파일에서 무는 자리가 있어야 한다.
    expect(MEETING_SOURCES.some((f) => USER_TOKEN_IMPORT.test(codeOnly(f.source)) && COMMIT_PATH_IMPORT.test(codeOnly(f.source)))).toBe(true);
  });

  it("App 개인키를 직접 참조하지 않는다 — installation 토큰은 `lib/github.ts`만 만든다", () => {
    expect(MEETING_SOURCES.filter((f) => APP_CREDENTIAL.test(codeOnly(f.source))).map((f) => f.rel)).toEqual([]);
  });

  it("octokit 쓰기를 직접 부르지 않는다 — 쓰기는 App 토큰 경로의 함수로만", () => {
    expect(MEETING_SOURCES.filter((f) => WRITE_CALL.test(codeOnly(f.source))).map((f) => f.rel)).toEqual([]);
  });

  it("사용자 토큰 전용 루트(lib/onboarding)·App 토큰 루트와 겹치지 않는다", () => {
    const others = new Set([...ONBOARDING_SOURCES, ...APP_TOKEN_SOURCES].map((f) => f.rel));
    expect(MEETING_SOURCES.filter((f) => others.has(f.rel)).map((f) => f.rel)).toEqual([]);
  });
});

describe("사용자 토큰 경로가 App 개인키를 모른다", () => {
  it("lib/github-connect/ 전체가 App 자격증명을 참조하지 않는다", () => {
    const offenders = CONNECT_SOURCES.filter((f) => APP_CREDENTIAL.test(codeOnly(f.source))).map(
      (f) => f.rel,
    );
    expect(offenders).toEqual([]);
  });

  it("lib/github-connect/ 전체가 쓰기 메서드를 부르지 않는다 — GET만 부른다", () => {
    const offenders = CONNECT_SOURCES.filter((f) => WRITE_CALL.test(codeOnly(f.source))).map(
      (f) => f.rel,
    );
    expect(offenders).toEqual([]);
  });

  /**
   * ⚠️ **가드가 자기 눈으로 못 보는 형태가 있었다** (2026-09-07 `/doc-check`). 전 패턴은 리터럴
   * `request("POST"…)`만 봐서 **octokit이 제공하는 다른 세 입구가 통째로 열려 있었다** — `paginate`의 문자열 route,
   * `rest.*`의 이름 붙은 메서드, `graphql` mutation이다. 지금 코드는 실제로 GET뿐이라 red가 아니었고, 그래서
   * "GET만 부른다"는 문서 단언이 근거 없이 서 있었다.
   *
   * 아래가 그 네 입구를 각각 먹여 **스캐너가 red를 낼 수 있는지** 검사한다. 이게 없으면 패턴을
   * 넓혀도 넓혀졌는지 알 방법이 없다 (`focus-ring`의 "red를 낼 수 있는지"와 같은 계보).
   */
  it("가드가 네 입구를 다 잡는다 — request·paginate·rest.* 쓰기·graphql mutation", () => {
    const writes = [
      'await octokit.request("POST /repos/{o}/{r}/git/blobs", {});',
      'await octokit.request(`PATCH /repos/x`, {});',
      "await octokit.rest.git.createBlob({ owner, repo });",
      "await octokit.rest.pulls.create({ owner, repo });",
      "await octokit.rest.repos.update({ owner, repo });",
      "await octokit.paginate(octokit.rest.issues.create, {});",
      // ⚠️ **실제 코드가 쓰는 형태다** — `user.ts`가 `paginate("GET /user/installations")`처럼 route를
      // 문자열로 넘긴다. 그러므로 가장 그럴듯한 회귀는 그 자리의 동사가 바뀌는 것이다.
      'await octokit.paginate("POST /repos/{o}/{r}/issues");',
      'await octokit.paginate(`DELETE /repos/x`, {});',
      // graphql mutation도 쓰기다 — REST만 겨누면 이 입구가 남는다.
      'await octokit.graphql(`mutation { addComment(input: {}) { id } }`);',
    ];
    for (const line of writes) expect(WRITE_CALL.test(line), line).toBe(true);
  });

  it("가드가 읽기를 오탐하지 않는다", () => {
    const reads = [
      'await octokit.request("GET /user/installations");',
      "await octokit.rest.apps.listInstallationsForAuthenticatedUser();",
      "await octokit.paginate(octokit.rest.apps.listInstallationReposForAuthenticatedUser, {});",
      "const created = row.createdAt;",
      "// createBlob은 커밋 경로의 일이다",
    ];
    for (const line of reads) expect(WRITE_CALL.test(codeOnly(line)), line).toBe(false);
  });
});

describe("커밋 경로가 사용자 토큰을 모른다", () => {
  it("lib/github.ts가 사용자 토큰 모듈을 import하지 않는다", () => {
    expect(USER_TOKEN_IMPORT.test(codeOnly(GITHUB_TS))).toBe(false);
  });

  it("lib/github.ts는 여전히 App 자격증명을 문다 — 경계가 반대로 무너지지 않았다", () => {
    // 이 단언이 없으면 `lib/github.ts`가 빈 파일이 돼도 위 검사가 통과한다.
    expect(APP_CREDENTIAL.test(codeOnly(GITHUB_TS))).toBe(true);
  });
});

/**
 * **GitLab 경계** (gitlab-repositories design §5 · tasks §2 B2). GitLab은 Octokit이 아니라 `fetch`로 부르고 연결자 PAT가 쓰기 신원이라, 위 GitHub
 * 규칙(App 개인키·`rest.*` 쓰기)으로는 지나간다. 여기서 지킬 것은 둘이다:
 *
 * 1. **쓰기(Sync·Publish·야간)는 그 프로젝트가 참조하는 연결의 PAT만 쓴다** — 호출자 자신의 연결(`openGitLabConnection(…, { userId })`)을 열면
 *    다른 사람의 프로젝트에 내 명의로 쓴다. 호출자 연결을 여는 자리는 **호출자 권한·① 목록**뿐이다(`ALLOWED_CALLER_CONNECTION`).
 * 2. **연결 경로(`lib/gitlab-connect/`)는 GET만 부른다** — PAT 검증·권한 조회뿐이다. 비GET `fetch`는 쓰기다(`lib/sync/execution.ts`와 같은 정의).
 *
 * 완전성 기준은 **GitLab 클라이언트 모듈 import**다 — `@/lib/gitlab/…`(transport·C의 client)나 `@/lib/gitlab-connect/connection`(PAT를 여는 유일한
 * 자리)을 무는 lib 파일은 전부 아래 규칙의 스캔 범위 안이어야 한다.
 *
 * ⚠️ **자리는 문법이 아니라 AST로 센다** (audit A2~A7). 정규식 시절엔 화살표 함수가 앞선 `function`에 귀속돼 허용 자리로 보였고(A2), 별칭 import·함수
 * 참조 전달(A3)·`openGitLabToken` 직접 호출(A4)·호스트 구현 호출(A5)·`RepoTarget` 리터럴(A6)·`.tsx`(A7)가 전부 green이었다. 아래 `usages`가 이름이 쓰인
 * 자리를 전부 내고, **호출이 아닌 참조는 `:ref` 자리**라 허용 목록에 들 수 없다.
 */
const GITLAB_CONNECT_SOURCES = sourcesIn(join(ROOT, "lib/gitlab-connect"), "lib/gitlab-connect");
const GITLAB_IO_SOURCES = sourcesIn(join(ROOT, "lib/gitlab"), "lib/gitlab");
/** 자리 고정 검사의 범위 — 서버 컴포넌트(`.tsx`)·`components/`·개발자 스크립트까지(A7). */
const BOUNDARY_SOURCES = ["lib", "app", "components", "scripts"].flatMap((dir) => sourcesIn(join(ROOT, dir), dir));
/** 호출자 자신의 계정 연결을 여는 형태. 프로젝트 쪽은 `{ connectionId }`로 연다. */
const CALLER_CONNECTION = /openGitLabConnection\(\s*[^,]+,\s*\{\s*userId\b/;
/** 호출자 연결을 열어도 되는 자리 — 호출자의 리포 권한(`checkRepoAccess`)과 ①의 리포 목록. 둘 다 그 사람이 무엇을 볼 수 있나를 묻는다(쓰지 않는다). */
const ALLOWED_CALLER_CONNECTION = new Set(["lib/onboarding-run/access.ts", "lib/onboarding-run/gitlab-repos.ts"]);
/**
 * 비GET 요청 — `fetch(…, { method: "POST" })`·transport의 쓰기 메서드·**GitClient 쓰기 메서드**(A5 — 호출자 연결 자리가 `createGitLabClient(…).createPr(`를
 * 부르면 호출자 명의의 쓰기다). GitLab은 Octokit 입구가 없어 메서드 리터럴·메서드 이름이 쓰기의 표지다.
 * ⚠️ `\.delete\(`는 Prisma `x.delete(`도 잡는다(거짓 red) — `lib/gitlab-connect/`의 DB 삭제는 `deleteMany`로 쓴다(R-B ⚪6).
 */
const GITLAB_WRITE =
  /method\s*:\s*["'`](POST|PUT|PATCH|DELETE)["'`]|\.(post|put|patch|delete)\(|\.send\(\s*["'`](POST|PUT|PATCH|DELETE)["'`]|\.graphql\(|\.(publishSnapshot|resetSyncBranch|createPr|updatePrTitle|updatePrBase|closePr)\(/i;
/**
 * **PAT를 여는 호출 자리 전부** (R-C 🟡2) — `파일#함수` 정확 집합이다. `CALLER_CONNECTION`은 `{ userId }` 리터럴 문법만 보므로 변수 간접
 * (`const by = { userId }; openGitLabConnection(prisma, by)`)을 못 잡는다 — 문법이 아니라 **자리**를 센다(`NEW_REPO_TARGET_SITES` 선례).
 * 호출자 연결 둘(그 사람이 무엇을 볼 수 있나 — 쓰지 않는다)과 프로젝트 참조 연결 하나(리포 I/O — `{ connectionId }`). 새 자리가 생기면 red다.
 */
const PAT_OPEN_SITES = [
  "lib/onboarding-run/access.ts#checkGitLabAccess",
  "lib/onboarding-run/gitlab-repos.ts#listGitLabRepositories",
  "lib/repo-host/index.ts#projectConnection",
];
/** `openGitLabConnection`을 import하는 파일 — 위 세 자리의 파일과 같다(A3). 별칭 import는 0이다. */
const PAT_OPEN_IMPORTERS = ["lib/onboarding-run/access.ts", "lib/onboarding-run/gitlab-repos.ts", "lib/repo-host/index.ts"];
/**
 * **봉투를 여는 자리**(A4) — `openGitLabToken`은 `openGitLabConnection` 안과 키 회전(`convertCredentials`)에서만 부른다. 그 밖에서 행을 읽어 직접 열면
 * `openGitLabConnection`의 모든 자리 고정을 지나지 않는다. `gitLabConnection`의 `token` 열을 읽는 쿼리 자리도 같은 집합이다.
 */
const TOKEN_OPEN_SITES = ["lib/credentials/conversion.ts#convertCredentials", "lib/gitlab-connect/connection.ts#openGitLabConnection"];
/** 호스트 구현 모듈(`lib/gitlab/client`)을 값으로 import하는 파일 — 경계 하나와 실 API 스모크(A5). `import type`은 세지 않는다. */
const GITLAB_CLIENT_IMPORTERS = ["lib/repo-host/index.ts", "scripts/smoke-gitlab.ts"];
/** transport를 만드는 자리(A5) — PAT 검증 · 호스트 구현 둘 · 호출자 연결 둘 · 스모크. transport는 원문 PAT를 받으므로 새 자리는 새 신원 경로다. */
const TRANSPORT_SITES = [
  "lib/gitlab-connect/connection.ts#verifyGitLabToken",
  "lib/gitlab/client.ts#loadGitLabHealth",
  "lib/gitlab/client.ts#openProject",
  "lib/onboarding-run/access.ts#checkGitLabAccess",
  "lib/onboarding-run/gitlab-repos.ts#listGitLabRepositories",
  "scripts/smoke-gitlab.ts#main",
];
/**
 * **`host`와 `connectionId`를 함께 든 객체 리터럴**(A6) — GitLab `RepoTarget`·호출자 접근 결과의 모양이다. `newRepoTarget`·`projectReadTarget`을 거치지
 * 않고 대상을 손으로 만들면 `NEW_REPO_TARGET_SITES` 고정을 지나지 않는다(연결자가 아닌 OWNER 명의로 읽는 D21 회귀). 만드는 자리는 대상 생산자 둘·호출자
 * 접근 결과·스모크다.
 */
const TARGET_LITERAL_SITES = [
  "lib/onboarding-run/access.ts#checkGitLabAccess",
  "lib/repo-host/target.ts#newRepoTarget",
  "lib/repo-host/target.ts#repoTargetOf",
  "scripts/smoke-gitlab.ts#main",
];
/** GitLab 클라이언트 모듈 import — 완전성 검사의 기준. */
const GITLAB_CLIENT_IMPORT = /from\s+["'](@\/lib\/gitlab\/[^"']+|@\/lib\/gitlab-connect\/connection|(\.\.?\/)+gitlab\/[^"']+|\.\/connection)["']/;

const parsed = new Map<string, ts.SourceFile>();
function parse(rel: string, source: string): ts.SourceFile {
  const cached = parsed.get(rel);
  if (cached !== undefined && cached.text === source) return cached;
  const file = ts.createSourceFile(rel, source, ts.ScriptTarget.Latest, true, rel.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  parsed.set(rel, file);
  return file;
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

/** 괄호·`as`·`satisfies`·`!`를 벗긴 부모. */
function holderOf(node: ts.Node): ts.Node {
  let at = node.parent;
  while (ts.isParenthesizedExpression(at) || ts.isAsExpression(at) || ts.isSatisfiesExpression(at) || ts.isNonNullExpression(at)) at = at.parent;
  return at;
}

/**
 * 노드를 감싼 **이름 붙은** 선언 — 함수 선언·메서드·이름에 묶인 화살표/함수 식(`const f = () => …`·`{ f: () => … }`). 인자로 넘긴 익명 콜백
 * (`.then((c) => …)`)은 바깥으로 올라간다. 최상위는 `<module>`이다. ⚠️ 정규식 시절엔 화살표가 앞선 `function`에 귀속됐다(A2).
 */
function enclosingName(node: ts.Node): string {
  for (let at: ts.Node | undefined = node.parent; at !== undefined; at = at.parent) {
    if ((ts.isFunctionDeclaration(at) || ts.isMethodDeclaration(at) || ts.isGetAccessorDeclaration(at) || ts.isSetAccessorDeclaration(at)) && at.name !== undefined) return at.name.getText();
    if (ts.isArrowFunction(at) || ts.isFunctionExpression(at)) {
      const holder = holderOf(at);
      if (ts.isVariableDeclaration(holder) || ts.isPropertyAssignment(holder) || ts.isPropertyDeclaration(holder)) return holder.name.getText();
      if (ts.isFunctionExpression(at) && at.name !== undefined) return at.name.text;
    }
  }
  return "<module>";
}

function insideType(node: ts.Node): boolean {
  for (let at: ts.Node | undefined = node.parent; at !== undefined; at = at.parent) if (ts.isTypeNode(at)) return true;
  return false;
}

function insideImport(node: ts.Node): boolean {
  for (let at: ts.Node | undefined = node.parent; at !== undefined; at = at.parent) if (ts.isImportDeclaration(at)) return true;
  return false;
}

/**
 * 이름 `name`이 쓰인 자리(`파일#감싼 선언`). 호출(`name(`·`ns.name(`)이 아닌 값 참조 — 함수 전달·별칭 대입·구조 분해·재수출·`x["name"]` — 는
 * `파일#감싼 선언:ref`로 낸다(A3). 정의(`function name`)·타입 위치·객체 키는 자리가 아니다. `imported`는 그 이름의 값 import, `aliased`는 `as` 별칭이다.
 */
function usages(rel: string, source: string, name: string): { sites: string[]; imported: boolean; aliased: boolean } {
  const sites: string[] = [];
  let imported = false;
  let aliased = false;
  // 글자로 안 나오는 파일은 파싱하지 않는다 — 수백 파일을 이름마다 걸으면 기본 제한 시간(5초)에 걸린다.
  if (!source.includes(name)) return { sites, imported, aliased };
  walk(parse(rel, source), (node) => {
    if (ts.isImportSpecifier(node) || ts.isExportSpecifier(node)) {
      const original = (node.propertyName ?? node.name).getText();
      if (original !== name && node.name.getText() !== name) return;
      if (node.propertyName !== undefined && node.propertyName.getText() !== node.name.getText()) aliased = true;
      if (ts.isImportSpecifier(node)) {
        if (!node.isTypeOnly && !node.parent.parent.isTypeOnly) imported = true;
      } else sites.push(`${rel}#<module>:ref`);
      return;
    }
    if (ts.isStringLiteral(node) && node.text === name && ts.isElementAccessExpression(node.parent) && node.parent.argumentExpression === node) {
      sites.push(`${rel}#${enclosingName(node)}:ref`);
      return;
    }
    if (!ts.isIdentifier(node) || node.text !== name || insideImport(node) || insideType(node)) return;
    const parent = node.parent;
    if (ts.isFunctionDeclaration(parent) && parent.name === node) return;
    if ((ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent) || ts.isMethodSignature(parent) || ts.isPropertyDeclaration(parent) || ts.isMethodDeclaration(parent)) && parent.name === node) return;
    if (ts.isExportSpecifier(parent)) return;
    const callee = ts.isPropertyAccessExpression(parent) && parent.name === node ? parent : node;
    const call = ts.isCallExpression(callee.parent) && callee.parent.expression === callee;
    sites.push(`${rel}#${enclosingName(node)}${call ? "" : ":ref"}`);
  });
  return { sites, imported, aliased };
}

function sitesOf(name: string, files = BOUNDARY_SOURCES): string[] {
  return [...new Set(files.flatMap((f) => usages(f.rel, f.source, name).sites))].sort();
}

/** 모듈 지정자 → 리포 상대 경로(확장자 없음). 별칭 `@/`와 상대 경로만 푼다 — 패키지는 `null`. */
function resolveModule(rel: string, specifier: string): string | null {
  if (specifier.startsWith("@/")) return specifier.slice(2).replace(/\.(ts|tsx)$/, "");
  if (!specifier.startsWith(".")) return null;
  return posix.join(posix.dirname(rel), specifier).replace(/\.(ts|tsx)$/, "");
}

/** `module`을 **값으로** 무는 import·재수출·동적 import가 있나. `import type`(절 전체 또는 이름 전부가 type)은 세지 않는다. */
function importsModuleValue(rel: string, source: string, module: string): boolean {
  let found = false;
  // `@/lib/gitlab/client`·`../gitlab/client`는 마지막 두 조각을 글자로 든다 — 같은 디렉터리의 `./client`만 예외다.
  if (!source.includes(module.split("/").slice(-2).join("/")) && !rel.startsWith(`${posix.dirname(module)}/`)) return false;
  walk(parse(rel, source), (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && resolveModule(rel, node.moduleSpecifier.text) === module) {
      const clause = node.importClause;
      const named = clause?.namedBindings !== undefined && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings.elements : undefined;
      const typeOnly = clause !== undefined && (clause.isTypeOnly || (clause.name === undefined && named !== undefined && named.length > 0 && named.every((element) => element.isTypeOnly)));
      if (!typeOnly) found = true;
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined && ts.isStringLiteral(node.moduleSpecifier) && !node.isTypeOnly && resolveModule(rel, node.moduleSpecifier.text) === module) found = true;
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [argument] = node.arguments;
      if (argument !== undefined && ts.isStringLiteral(argument) && resolveModule(rel, argument.text) === module) found = true;
    }
  });
  return found;
}

/** 같은 파일의 `const NAME = { … }`(래퍼 벗김). 못 찾으면 `undefined`. */
function localObject(file: ts.SourceFile, name: string): ts.ObjectLiteralExpression | undefined {
  let found: ts.ObjectLiteralExpression | undefined;
  walk(file, (node) => {
    if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name) || node.name.text !== name || node.initializer === undefined) return;
    let value: ts.Node = node.initializer;
    while (ts.isAsExpression(value) || ts.isSatisfiesExpression(value) || ts.isParenthesizedExpression(value)) value = value.expression;
    if (ts.isObjectLiteralExpression(value)) found = value;
  });
  return found;
}

function propertyOf(object: ts.ObjectLiteralExpression, key: string): ts.ObjectLiteralElementLike | undefined {
  return object.properties.find((property) => property.name !== undefined && property.name.getText() === key);
}

/** `select` 값이 `token`을 고르는가 — 같은 파일 상수까지 푼다. 풀 수 없으면(다른 모듈의 상수·계산식) **고른다**로 본다(fail-closed). */
function selectsToken(file: ts.SourceFile, select: ts.Expression): boolean {
  const object = ts.isObjectLiteralExpression(select) ? select : ts.isIdentifier(select) ? localObject(file, select.text) : undefined;
  return object === undefined || propertyOf(object, "token") !== undefined || object.properties.some((property) => ts.isSpreadAssignment(property));
}

/** 행 전체 또는 `token` 열을 돌려주는 Prisma 메서드 — `*Many`(개수만)·`count`는 아니다. */
const ROW_RETURNING = new Set(["findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany", "create", "update", "upsert", "delete", "createManyAndReturn", "updateManyAndReturn"]);

/**
 * `GitLabConnection.token`(봉투)을 읽는 자리(A4). 모델 쿼리(`x.gitLabConnection.findUnique(…)` — `select`가 없거나 `token`을 고르면)와 관계 적재
 * (`gitlabConnection: true`·`{ include }`·`token`을 고르는 `{ select }`)를 센다. `where`의 관계 필터(`gitlabConnection: { userId }`)는 읽기가 아니다.
 */
function tokenReadSites(rel: string, source: string): string[] {
  const sites: string[] = [];
  if (!/gitLabConnection|gitlabConnection/.test(source)) return sites;
  const file = parse(rel, source);
  walk(file, (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ROW_RETURNING.has(node.expression.name.text)) {
      const model = node.expression.expression;
      if (!ts.isPropertyAccessExpression(model) || model.name.text !== "gitLabConnection") return;
      const [argument] = node.arguments;
      const select = argument !== undefined && ts.isObjectLiteralExpression(argument) ? propertyOf(argument, "select") : undefined;
      const reads = argument === undefined || !ts.isObjectLiteralExpression(argument) || select === undefined || !ts.isPropertyAssignment(select) || selectsToken(file, select.initializer);
      if (reads) sites.push(`${rel}#${enclosingName(node)}`);
      return;
    }
    if (ts.isPropertyAssignment(node) && node.name.getText() === "gitlabConnection") {
      const value = node.initializer;
      if (value.kind === ts.SyntaxKind.TrueKeyword) sites.push(`${rel}#${enclosingName(node)}`);
      else if (ts.isObjectLiteralExpression(value)) {
        const select = propertyOf(value, "select");
        if (propertyOf(value, "include") !== undefined || (select !== undefined && (!ts.isPropertyAssignment(select) || selectsToken(file, select.initializer)))) sites.push(`${rel}#${enclosingName(node)}`);
      } else if (ts.isIdentifier(value)) sites.push(`${rel}#${enclosingName(node)}`);
    }
  });
  return sites;
}

/**
 * `connectionId`를 `host`와 함께 들거나 **스프레드 위에 덮는** 객체 리터럴의 자리(A6) — 값이 리터럴이든 단축 속성이든 같다. 스프레드 덮기는
 * `{ ...projectTarget, connectionId: callerConnectionId }`(같은 대상에 연결만 호출자 것으로 — D21 회귀의 가장 쉬운 모양)다.
 */
function targetLiteralSites(rel: string, source: string): string[] {
  const sites: string[] = [];
  if (!source.includes("connectionId")) return sites;
  walk(parse(rel, source), (node) => {
    if (!ts.isObjectLiteralExpression(node)) return;
    const keys = new Set(node.properties.map((property) => property.name?.getText()));
    if (keys.has("connectionId") && (keys.has("host") || node.properties.some((property) => ts.isSpreadAssignment(property)))) sites.push(`${rel}#${enclosingName(node)}`);
  });
  return sites;
}

describe("GitLab 경계 — 쓰기는 프로젝트가 참조하는 연결로만", () => {
  it("검사식이 실제로 잡는다 — 호출자 연결 선택·비GET fetch·클라이언트 import", () => {
    // 쓰기 경로가 호출자 세션에서 연결을 고르는 픽스처 — red여야 한다.
    expect(CALLER_CONNECTION.test("const conn = await openGitLabConnection(prisma, { userId: session.userId });")).toBe(true);
    expect(CALLER_CONNECTION.test("await openGitLabConnection(tx, {userId})")).toBe(true);
    expect(CALLER_CONNECTION.test("await openGitLabConnection(prisma, { connectionId: target.connectionId });")).toBe(false);
    // 연결 경로에 비GET fetch를 넣은 픽스처 — red여야 한다.
    for (const line of ['await fetch(url, { method: "POST", body })', "await send(url, { method: 'DELETE' })", "await transport.post(path, body)", 'fetch(u, {method:`PUT`})']) {
      expect(GITLAB_WRITE.test(line), line).toBe(true);
    }
    // C가 더한 transport 쓰기 입구 — 동사마다 red여야 한다(R-C Astra 🟡2). GraphQL도 POST라 연결 경로에서는 쓰기로 센다(연결 경로는 GraphQL을 쓸 이유가 없다).
    for (const line of ['await transport.send("POST", projectPath(id, "repository/commits"), { body })', "await transport.send('PUT', mr(iid), { body })", 'await t.send(`DELETE`, branchPath(id, b))', "await transport.graphql(QUERY, { ids })"]) {
      expect(GITLAB_WRITE.test(line), line).toBe(true);
    }
    // GitClient 쓰기 메서드 여섯 — 호출자 연결 자리가 클라이언트를 만들어 부르면 호출자 명의의 쓰기다(A5).
    for (const method of ["publishSnapshot", "resetSyncBranch", "createPr", "updatePrTitle", "updatePrBase", "closePr"]) {
      expect(GITLAB_WRITE.test(`await client.${method}(input)`), method).toBe(true);
    }
    for (const line of ['await send(url, { method: "GET", headers })', "await transport.get(projectPath(id))", "const sent = await mailer.sendMail(x)", "await client.findOpenPr(branch)", "await client.isPullRequestOpen(1)"]) {
      expect(GITLAB_WRITE.test(line), line).toBe(false);
    }
    expect(GITLAB_CLIENT_IMPORT.test('import { createGitLabTransport } from "@/lib/gitlab/transport";')).toBe(true);
    expect(GITLAB_CLIENT_IMPORT.test('import { openGitLabConnection } from "@/lib/gitlab-connect/connection";')).toBe(true);
    // 순수 판정·오류 갈래는 클라이언트가 아니다.
    expect(GITLAB_CLIENT_IMPORT.test('import { isGitLabConnectError } from "@/lib/gitlab-connect/errors";')).toBe(false);
  });

  it("스캔 대상을 실제로 찾았다 — `.tsx`·`components/`·`scripts/`까지(A7)", () => {
    expect(GITLAB_CONNECT_SOURCES.length).toBeGreaterThan(2);
    expect(GITLAB_IO_SOURCES.length).toBeGreaterThan(0);
    for (const rel of ["app/(edit)/projects/[slug]/settings/page.tsx", "components/onboarding/new-project.tsx", "scripts/smoke-gitlab.ts"]) {
      expect(BOUNDARY_SOURCES.some((f) => f.rel === rel), rel).toBe(true);
    }
  });

  it("호출자 자신의 연결을 여는 자리는 호출자 권한·① 목록뿐이다 — 쓰기 경로(lib/pull·push·projects·publish·import·nightly·repo-host·gitlab)에 없다", () => {
    const offenders = BOUNDARY_SOURCES.filter((f) => CALLER_CONNECTION.test(codeOnly(f.source)) && !ALLOWED_CALLER_CONNECTION.has(f.rel)).map((f) => f.rel);
    expect(offenders).toEqual([]);
    // 허용 목록이 공허하지 않다 — 실제로 호출자 연결을 여는 자리가 있다.
    expect(BOUNDARY_SOURCES.filter((f) => CALLER_CONNECTION.test(codeOnly(f.source))).map((f) => f.rel).sort()).toEqual([...ALLOWED_CALLER_CONNECTION].sort());
  });

  it("app/·components/는 PAT를 열지 않는다 — Server Action·서버 컴포넌트는 코어를 부르고 토큰을 만지지 않는다", () => {
    const uiSources = [...sourcesIn(join(ROOT, "app"), "app"), ...sourcesIn(join(ROOT, "components"), "components")];
    expect(uiSources.some((f) => f.rel.endsWith(".tsx"))).toBe(true);
    expect(uiSources.filter((f) => /\bopenGitLabConnection\b|\bopenGitLabToken\b|\bcreateGitLabTransport\b/.test(codeOnly(f.source))).map((f) => f.rel)).toEqual([]);
  });

  it("lib/gitlab-connect/와 호출자 연결을 여는 자리는 GET만 부른다 — PAT 검증·권한 조회·① 목록뿐이다", () => {
    expect(GITLAB_CONNECT_SOURCES.filter((f) => GITLAB_WRITE.test(codeOnly(f.source))).map((f) => f.rel)).toEqual([]);
    const callerSites = BOUNDARY_SOURCES.filter((f) => ALLOWED_CALLER_CONNECTION.has(f.rel));
    expect(callerSites.map((f) => f.rel).sort()).toEqual([...ALLOWED_CALLER_CONNECTION].sort());
    expect(callerSites.filter((f) => GITLAB_WRITE.test(codeOnly(f.source))).map((f) => f.rel)).toEqual([]);
  });

  it("⚠️ PAT를 여는 자리가 허용 목록과 정확히 같다 — 화살표·별칭·참조 전달·변수 간접도 새 자리라 red다(A2·A3)", () => {
    expect(sitesOf("openGitLabConnection")).toEqual([...PAT_OPEN_SITES].sort());
    const imports = BOUNDARY_SOURCES.map((f) => ({ rel: f.rel, ...usages(f.rel, f.source, "openGitLabConnection") }));
    expect(imports.filter((f) => f.imported).map((f) => f.rel).sort()).toEqual([...PAT_OPEN_IMPORTERS].sort());
    expect(imports.filter((f) => f.aliased).map((f) => f.rel)).toEqual([]);
  });

  it("⚠️ 봉투를 여는 자리·`token` 열을 읽는 자리가 허용 목록과 정확히 같다 — 행을 읽어 `openGitLabToken`을 직접 불러도 red다(A4)", () => {
    expect(sitesOf("openGitLabToken")).toEqual([...TOKEN_OPEN_SITES].sort());
    const imports = BOUNDARY_SOURCES.map((f) => ({ rel: f.rel, ...usages(f.rel, f.source, "openGitLabToken") }));
    expect(imports.filter((f) => f.imported).map((f) => f.rel).sort()).toEqual(TOKEN_OPEN_SITES.map((site) => site.split("#")[0]).sort());
    expect(imports.filter((f) => f.aliased).map((f) => f.rel)).toEqual([]);
    expect([...new Set(BOUNDARY_SOURCES.flatMap((f) => tokenReadSites(f.rel, f.source)))].sort()).toEqual([...TOKEN_OPEN_SITES].sort());
  });

  it("⚠️ 호스트 구현은 경계 하나만 문다 — `lib/gitlab/client` 값 import·transport 생성 자리가 허용 목록과 정확히 같다(A5)", () => {
    expect(BOUNDARY_SOURCES.filter((f) => f.rel !== "lib/gitlab/client.ts" && importsModuleValue(f.rel, f.source, "lib/gitlab/client")).map((f) => f.rel).sort()).toEqual([...GITLAB_CLIENT_IMPORTERS].sort());
    expect(sitesOf("createGitLabTransport")).toEqual([...TRANSPORT_SITES].sort());
    // `createGitLabClient`는 경계(`createGitClient`)와 스모크만 부른다 — 호출자 연결 자리에서 만들면 호출자 명의의 쓰기 클라이언트다.
    expect(sitesOf("createGitLabClient")).toEqual(["lib/repo-host/index.ts#createGitClient", "scripts/smoke-gitlab.ts#main"]);
  });

  it("⚠️ `host`+`connectionId`·스프레드 위 `connectionId` 덮기 객체 리터럴은 대상 생산자·호출자 접근 결과에서만 만든다 — 손으로 만들거나 연결만 바꾼 GitLab 대상은 red다(A6)", () => {
    expect([...new Set(BOUNDARY_SOURCES.flatMap((f) => targetLiteralSites(f.rel, f.source)))].sort()).toEqual([...TARGET_LITERAL_SITES].sort());
  });

  it("GitLab 경로는 GitHub 자격증명을 모른다 — App 개인키·사용자 토큰·커밋 경로 import 없음", () => {
    const sources = [...GITLAB_CONNECT_SOURCES, ...GITLAB_IO_SOURCES];
    expect(sources.filter((f) => APP_CREDENTIAL.test(codeOnly(f.source))).map((f) => f.rel)).toEqual([]);
    expect(sources.filter((f) => USER_TOKEN_IMPORT.test(codeOnly(f.source))).map((f) => f.rel)).toEqual([]);
    expect(sources.filter((f) => COMMIT_PATH_IMPORT.test(codeOnly(f.source))).map((f) => f.rel)).toEqual([]);
  });

  it("GitLab 클라이언트 모듈을 무는 lib 파일은 전부 스캔 범위 안이다 — 새 소비자가 규칙 밖에 서지 않는다", () => {
    const scanned = new Set([...APP_TOKEN_SOURCES, ...MEETING_SOURCES, ...GITLAB_CONNECT_SOURCES, ...GITLAB_IO_SOURCES].map((f) => f.rel));
    const consumers = sourcesIn(join(ROOT, "lib"), "lib").filter((f) => GITLAB_CLIENT_IMPORT.test(codeOnly(f.source)));
    expect(consumers.length).toBeGreaterThan(2);
    expect(consumers.map((f) => f.rel).filter((rel) => !scanned.has(rel))).toEqual([]);
  });
});

/**
 * **스캐너가 사각마다 red를 낼 수 있다** (audit A2~A7 · POSTMORTEM 2026-09-07 "좁은 검사는 자기 좁음을 신고할 수 없다"). 감사가 green으로 재현한 우회
 * 소스를 그대로 먹여 각 헬퍼가 그 자리를 집는지 센다 — 헬퍼가 좁아지면 이 테스트가 red다.
 */
describe("GitLab 경계 스캐너 — 감사의 우회 소스를 집는다", () => {
  it("A2 — 경계 모듈 안의 화살표 함수는 앞선 `function`이 아니라 자기 이름의 자리다", () => {
    const source = [
      "async function projectConnection(target) { return openGitLabConnection(getPrisma(), { connectionId: target.connectionId }); }",
      "export const openCallerPat = async (userId: string) => { const by = { userId }; return openGitLabConnection(getPrisma(), by); };",
      "class Store { async open(userId: string) { return openGitLabConnection(getPrisma(), { userId }); } }",
      "export async function createGitClient(target) { return load(target).then((credential) => createGitLabClient(target, credential)); }",
    ].join("\n");
    expect(usages("lib/repo-host/index.ts", source, "openGitLabConnection").sites).toEqual([
      "lib/repo-host/index.ts#projectConnection",
      "lib/repo-host/index.ts#openCallerPat",
      "lib/repo-host/index.ts#open",
    ]);
    // 인자로 넘긴 익명 콜백은 바깥 선언에 귀속된다 — 경계의 `.then((credential) => …)`.
    expect(usages("lib/repo-host/index.ts", source, "createGitLabClient").sites).toEqual(["lib/repo-host/index.ts#createGitClient"]);
  });

  it("A3 — 별칭 import·함수 참조 전달·별칭 대입·구조 분해·재수출이 걸린다", () => {
    const aliased = 'import { openGitLabConnection as openConn } from "@/lib/gitlab-connect/connection";\nexport async function loadX(userId) { return openConn(getPrisma(), { userId }); }';
    expect(usages("lib/pull/x.ts", aliased, "openGitLabConnection")).toMatchObject({ imported: true, aliased: true });
    const passed = [
      "export async function loadA(userId) { return retry(openGitLabConnection, getPrisma(), { userId }); }",
      "export async function loadB(userId) { const open = openGitLabConnection; return open(getPrisma(), { userId }); }",
      "export async function loadC(userId) { const { openGitLabConnection: open } = conn; return open(getPrisma(), { userId }); }",
      'export async function loadD(userId) { return conn["openGitLabConnection"](getPrisma(), { userId }); }',
      'export { openGitLabConnection as open } from "@/lib/gitlab-connect/connection";',
    ].join("\n");
    expect(usages("lib/pull/x.ts", passed, "openGitLabConnection")).toMatchObject({
      sites: ["lib/pull/x.ts#loadA:ref", "lib/pull/x.ts#loadB:ref", "lib/pull/x.ts#loadC:ref", "lib/pull/x.ts#loadD:ref", "lib/pull/x.ts#<module>:ref"],
      aliased: true,
    });
    // 네임스페이스 호출은 호출 자리다(경계의 `gitlab.createGitLabClient(` 형).
    expect(usages("lib/pull/x.ts", "export async function loadE(u) { return conn.openGitLabConnection(getPrisma(), { userId: u }); }", "openGitLabConnection").sites).toEqual(["lib/pull/x.ts#loadE"]);
    // 정의·타입 위치·객체 키는 자리가 아니다.
    const benign = "export async function openGitLabConnection(p, by) { return null; }\ntype Open = typeof openGitLabConnection;\nconst names = { openGitLabConnection: 1 };";
    expect(usages("lib/gitlab-connect/connection.ts", benign, "openGitLabConnection").sites).toEqual([]);
  });

  it("A4 — 행을 읽어 `openGitLabToken`을 직접 부르면 봉투 자리·`token` 열 자리가 둘 다 걸린다", () => {
    const source = 'import { openGitLabToken } from "@/lib/credentials/storage";\nexport async function loadNightly(prisma, userId) { const row = await prisma.gitLabConnection.findUnique({ where: { userId } }); return openGitLabToken(row.token, { userId }); }';
    expect(usages("lib/nightly/x.ts", source, "openGitLabToken")).toMatchObject({ sites: ["lib/nightly/x.ts#loadNightly"], imported: true });
    expect(tokenReadSites("lib/nightly/x.ts", source)).toEqual(["lib/nightly/x.ts#loadNightly"]);
    const reads = [
      "export async function a(p) { return p.gitLabConnection.findMany(); }",
      "export async function b(p) { return p.gitLabConnection.findFirst({ where: {}, select: { id: true, token: true } }); }",
      "const ROW = { id: true, token: true } as const;\nexport async function c(p) { return p.gitLabConnection.findUnique({ where: {}, select: ROW }); }",
      "export async function d(p) { return p.project.findUnique({ where: {}, include: { gitlabConnection: true } }); }",
      "export async function e(p) { return p.project.findUnique({ where: {}, select: { gitlabConnection: { select: { token: true } } } }); }",
      "export async function f(p) { return p.user.findUnique({ where: {}, select: { gitlabConnection: { select: IMPORTED } } }); }",
    ].join("\n");
    expect(tokenReadSites("lib/x.ts", reads)).toEqual(["lib/x.ts#a", "lib/x.ts#b", "lib/x.ts#c", "lib/x.ts#d", "lib/x.ts#e", "lib/x.ts#f"]);
    const safe = [
      "const VIEW = { username: true, expiresAt: true } as const;\nexport async function a(p) { return p.gitLabConnection.findUnique({ where: {}, select: VIEW }); }",
      "export async function b(p) { return p.project.count({ where: { gitlabConnection: { userId: 'u' } } }); }",
      "export async function c(p) { return p.project.findMany({ select: { gitlabConnection: { select: { expiresAt: true } } } }); }",
      "export async function d(p) { return p.gitLabConnection.updateMany({ where: {}, data: { token: 'sealed' } }); }",
    ].join("\n");
    expect(tokenReadSites("lib/x.ts", safe)).toEqual([]);
  });

  it("A5 — 호스트 구현 import·transport 생성은 자리로, GitClient 쓰기는 메서드 이름으로 걸린다", () => {
    const source = 'import { createGitLabClient } from "@/lib/gitlab/client";\nimport type { GitLabTarget } from "../gitlab/client";\nexport async function checkGitLabAccess(t, c) { const client = await createGitLabClient(t, { token: c.token }); await client.createPr("h", "b", "t", "b"); }';
    expect(importsModuleValue("lib/onboarding-run/access.ts", source, "lib/gitlab/client")).toBe(true);
    expect(importsModuleValue("lib/onboarding-run/access.ts", 'import type { GitLabTarget } from "../gitlab/client";\nimport { type GitLabCredential } from "@/lib/gitlab/client";', "lib/gitlab/client")).toBe(false);
    expect(importsModuleValue("lib/pull/x.ts", 'const m = await import("../gitlab/client");', "lib/gitlab/client")).toBe(true);
    expect(importsModuleValue("lib/gitlab/x.ts", 'import * as c from "./client";', "lib/gitlab/client")).toBe(true);
    expect(GITLAB_WRITE.test(codeOnly(source))).toBe(true);
    expect(usages("lib/pull/x.ts", "export const build = (token: string) => createGitLabTransport(token);", "createGitLabTransport").sites).toEqual(["lib/pull/x.ts#build"]);
  });

  it("A6 — `host`+`connectionId` 리터럴은 값이 리터럴이든 단축 속성이든, 스프레드 위의 `connectionId` 덮기도 걸린다", () => {
    const source = [
      'export async function addSources(repo) { const target = { host: "gitlab" as const, owner: repo.repoOwner, name: repo.repoName, repositoryId: repo.repositoryId, connectionId: repo.connectionId }; }',
      "export function shorthand(host, connectionId) { return { host, connectionId, owner: 'o' }; }",
      "export function swapped(project, callerConnectionId: string) { const t = repoTargetOf(project); return t.status === 'ok' ? { ...t.target, connectionId: callerConnectionId } : null; }",
      "export function oauth(id) { return { connectionId: id, kind: 'oauth' }; }",
      "type T = { host: 'gitlab'; connectionId: string };",
    ].join("\n");
    expect(targetLiteralSites("lib/onboarding-run/add.ts", source)).toEqual(["lib/onboarding-run/add.ts#addSources", "lib/onboarding-run/add.ts#shorthand", "lib/onboarding-run/add.ts#swapped"]);
  });

  it("A7 — `.tsx`를 읽는다 — 서버 컴포넌트의 PAT 열기가 자리로 잡힌다", () => {
    const page = 'import { openGitLabConnection } from "@/lib/gitlab-connect/connection";\nexport default async function SettingsPage() { const c = await openGitLabConnection(getPrisma(), { userId }); return <div>{c?.connectionId}</div>; }';
    expect(usages("app/(edit)/projects/[slug]/settings/page.tsx", page, "openGitLabConnection").sites).toEqual(["app/(edit)/projects/[slug]/settings/page.tsx#SettingsPage"]);
  });
});

/**
 * **새 리포 경로만 호출자 연결로 연다** (gitlab-repositories D21 · R-B 🟡3). `checkRepoAccess`의 GitLab ok가 든 `connectionId`는 **호출자의** 연결이다 —
 * 그것을 대상으로 바꾸는 `newRepoTarget`을 연결된 프로젝트 경로(소스 추가·재탐지·설정 브랜치 목록)에서 부르면 연결자가 아닌 OWNER의 명의로 읽는다.
 * 위 `CALLER_CONNECTION`은 `openGitLabConnection(…, { userId })` 한 문법만 보므로 이 경로를 못 잡는다 — 호출 자리를 `파일#함수`로 고정한다.
 */
const NEW_REPO_TARGET_SITES = [
  "app/(edit)/projects/actions.ts#confirmManualFormat",
  "app/(edit)/projects/actions.ts#loadCandidateSample",
  "lib/onboarding-run/branches.ts#listNewRepoBranches",
  "lib/onboarding-run/create.ts#createProjectFromRepo",
  "lib/onboarding-run/detect.ts#detectFormats",
];

describe("GitLab 경계 — 호출자 연결로 여는 대상은 새 리포 경로뿐", () => {
  it("검사식이 함수 단위로 잡는다 — 연결된 프로젝트 경로의 호출이 red다", () => {
    const fixture = [
      "export async function addSources() { const target = projectReadTarget(repo, connection.target); }",
      "export async function listLinkedBranches() { return listBranches(newRepoTarget(repo)); }",
      "export function newRepoTarget(access) { return access; }",
    ].join("\n");
    expect(usages("lib/onboarding-run/x.ts", fixture, "newRepoTarget").sites).toEqual(["lib/onboarding-run/x.ts#listLinkedBranches"]);
  });

  it("`newRepoTarget` 쓰는 자리가 허용 목록과 정확히 같다 — 소스 추가·재탐지(slug)·설정 브랜치 목록은 `projectReadTarget`이다", () => {
    expect(sitesOf("newRepoTarget", BOUNDARY_SOURCES.filter((f) => f.rel !== "lib/repo-host/target.ts"))).toEqual([...NEW_REPO_TARGET_SITES].sort());
  });
});
