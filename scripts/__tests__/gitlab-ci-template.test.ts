import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

import { renderProjectGitlabCiYaml } from "@/lib/onboarding/gitlab-ci";
import { SKIP_MARKER } from "@/lib/pull/payload";

/**
 * **GitLab CI 원본(`.gitlab/malmoi-i18n-push/`)의 계약** (gitlab-repositories D1). `action-setup.test.ts`의 짝 — 셸이라 순수 함수가
 * 없어서 텍스트로 순서와 모양을 센다. 생성 job(`lib/onboarding/gitlab-ci.ts`)이 clone·SHA 대조 뒤 `push.sh`를 부르고, `push.sh`가
 * 설치 뒤 `run.ts`를, `run.ts`가 `push:local`을 부른다 — 페이로드 생산자는 여전히 `lib/push/payload.ts` 하나다.
 */

const DIR = join(".gitlab", "malmoi-i18n-push");
const sh = readFileSync(join(DIR, "push.sh"), "utf8");
const run = readFileSync(join(DIR, "run.ts"), "utf8");
/** 주석 줄을 뺀다 — 셸은 `#`만(`*"…"*)` 패턴이 `*`로 시작한다), TS는 `//`·블록 주석. */
const code = (src: string) => src.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
const tsCode = (src: string) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l)).join("\n");
const valueImports = (src: string) =>
  [...tsCode(src).matchAll(/^\s*import\s+(?!type\s)[^'";]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);

describe("push.sh", () => {
  it("bash이고 실행 비트가 있고 실패에서 멈춘다", () => {
    expect(sh.startsWith("#!/usr/bin/env bash\n")).toBe(true);
    expect(statSync(join(DIR, "push.sh")).mode & 0o111).not.toBe(0);
    expect(code(sh)).toContain("set -euo pipefail");
  });

  it("루프 가드 둘째 겹 — 커밋 메시지의 마커를 의존성 설치 전에 본다", () => {
    const body = code(sh);
    const guard = body.indexOf(`*"${SKIP_MARKER}"*`);
    expect(guard).toBeGreaterThan(0);
    expect(body).toContain("CI_COMMIT_MESSAGE");
    expect(guard).toBeLessThan(body.indexOf("pnpm install"));
    // 가드는 스킵(exit 0)이다 — red가 아니다.
    expect(body.slice(guard, body.indexOf("esac", guard))).toContain("exit 0");
  });

  it("`pnpm install --frozen-lockfile`이 하나이고 pnpm 버전은 packageManager에서 읽는다", () => {
    const body = code(sh);
    expect(body.match(/pnpm install/g)).toHaveLength(1);
    expect(body).toContain("pnpm install --frozen-lockfile");
    expect(body).toContain("packageManager");
  });

  it("run.ts를 tsx로 부른다", () => {
    expect(code(sh)).toMatch(/pnpm exec tsx \.gitlab\/malmoi-i18n-push\/run\.ts/);
  });
});

describe("run.ts", () => {
  it("값 import가 node 내장과 CI 입력 변환뿐이다 — Prisma·server-only 그래프에 닿지 않는다(push-local-graph와 같은 이유)", () => {
    const specs = valueImports(run);
    expect(specs.length).toBeGreaterThan(0);
    for (const s of specs) expect(s === "../../lib/cli/gitlab-ci-input" || s?.startsWith("node:")).toBe(true);
    // 순수 모듈의 import도 잎 셋뿐이다 — 늘면 여기서 그래프를 다시 본다.
    expect(valueImports(readFileSync(join("lib", "cli", "gitlab-ci-input.ts"), "utf8")).sort()).toEqual(["@/lib/deployment/mode", "@/lib/pull/payload", "@/lib/pull/sync-branch"]);
  });

  it("생산자는 push:local이다 — 페이로드를 여기서 조립하지 않는다", () => {
    expect(tsCode(run)).toContain('"push:local"');
    expect(tsCode(run)).not.toMatch(/\/api\/push/);
  });

  it("열린 MR 조회는 JOB-TOKEN으로 GET만 하고 5초에 끊는다(안내 전용 — 실패가 red가 아니다)", () => {
    const body = tsCode(run);
    expect(body).toContain('"JOB-TOKEN"');
    expect(body).not.toMatch(/method:\s*"(POST|PUT|DELETE|PATCH)"/);
    expect(body).toContain("AbortSignal.timeout(5000)");
  });
});

/**
 * **실행으로 고정한다** (R-D1 🟡3). 마커 스킵과 SHA 대조는 공급망·루프 방어선이라 텍스트 검사로는 "줄이 있다"만 안다 — bash로 돌려
 * exit code와 출력을 본다. 네트워크·실 clone은 없다: 가짜 `npm`·`pnpm`을 PATH 앞에 두고, SHA 대조는 임시 git 리포에서 돈다.
 */
describe("실행 — push.sh 마커 스킵", () => {
  const temps: string[] = [];
  afterEach(() => {
    for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  /** 불리면 표식 파일을 남기고 실패하는 가짜 `npm`·`pnpm`. */
  function fakeBin(): { bin: string; called: string } {
    const bin = mkdtempSync(join(tmpdir(), "malmoi-gl-bin-"));
    temps.push(bin);
    const called = join(bin, "called");
    for (const name of ["npm", "pnpm"]) {
      writeFileSync(join(bin, name), `#!/usr/bin/env bash\necho "${name} $*" >> "${called}"\nexit 7\n`);
      chmodSync(join(bin, name), 0o755);
    }
    return { bin, called };
  }

  const runSh = (message: string, bin: string) =>
    spawnSync("bash", [resolve(DIR, "push.sh")], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}`, CI_COMMIT_MESSAGE: message },
    });

  it("마커가 있으면 exit 0이고 npm·pnpm을 부르지 않는다 — merge commit 모양(마커가 둘째 문단)", () => {
    const { bin, called } = fakeBin();
    const res = runSh(`Merge branch 'malmoi-i18n/sync-web' into 'main'\n\nmalmoi-i18n: sync translations ${SKIP_MARKER}`, bin);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain(SKIP_MARKER);
    expect(() => readFileSync(called, "utf8")).toThrow();
  });

  it("마커가 없으면 설치로 간다 — 가짜 npm이 불려 그 실패로 멈춘다(가드가 스킵의 원인임을 확인하는 짝)", () => {
    const { bin, called } = fakeBin();
    const res = runSh("feat: add checkout strings", bin);
    expect(res.status).toBe(7);
    expect(readFileSync(called, "utf8")).toMatch(/^npm install --global/);
  });
});

describe("실행 — 생성 job의 SHA 대조 줄", () => {
  const temps: string[] = [];
  afterEach(() => {
    for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  const script = (parse(renderProjectGitlabCiYaml({ slug: "x", baseBranch: "main", surfaces: [{ surfaceSlug: "default", pathTemplate: "i18n/{locale}.json" }] })) as Record<string, { script?: string[] }>)[".malmoi-i18n-x"]?.script ?? [];
  const checkLine = script.find((l) => l.includes("rev-parse HEAD"));

  /** 생성 job과 같은 자리(`.malmoi`)에 커밋 하나짜리 리포를 만들고 그 HEAD SHA를 준다. */
  function checkout(): { cwd: string; head: string } {
    const cwd = mkdtempSync(join(tmpdir(), "malmoi-gl-job-"));
    temps.push(cwd);
    const repo = join(cwd, ".malmoi");
    const git = (...args: string[]) => spawnSync("git", ["-C", repo, "-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" });
    spawnSync("git", ["init", "-q", repo]);
    writeFileSync(join(repo, "f"), "x");
    git("add", "f");
    git("commit", "-qm", "c");
    return { cwd, head: git("rev-parse", "HEAD").stdout.trim() };
  }

  const runCheck = (cwd: string, sha: string) =>
    spawnSync("bash", ["-c", checkLine!], { cwd, encoding: "utf8", env: { ...process.env, MALMOI_I18N_PUSH_SHA: sha } });

  it("대조 줄이 있다", () => {
    expect(checkLine).toBeDefined();
  });

  it("발행 전 값(`unreleased`)이면 red이고 이유를 말한다 — fail-closed", () => {
    const { cwd } = checkout();
    const res = runCheck(cwd, "unreleased");
    expect(res.status).not.toBe(0);
    expect(res.stdout).toContain("does not match the pinned commit");
  });

  it("다른 커밋의 SHA면 red다 — 태그가 옮겨져도 박힌 SHA 밖의 코드를 돌리지 않는다", () => {
    const { cwd } = checkout();
    expect(runCheck(cwd, "0".repeat(40)).status).not.toBe(0);
  });

  it("HEAD와 같은 SHA면 통과한다", () => {
    const { cwd, head } = checkout();
    expect(head).toMatch(/^[0-9a-f]{40}$/);
    expect(runCheck(cwd, head).status).toBe(0);
  });
});

describe("typecheck 범위", () => {
  it("`.gitlab/**/*.ts`가 tsconfig include에 있다 — `**`는 점 디렉터리를 건너뛰어 run.ts가 typecheck 밖이 된다(R-D1 🟡1)", () => {
    const tsconfig = JSON.parse(readFileSync("tsconfig.json", "utf8")) as { include: string[] };
    expect(tsconfig.include).toContain(".gitlab/**/*.ts");
  });
});
