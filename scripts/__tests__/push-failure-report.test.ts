import { execFile, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, expect, it } from "vitest";

/**
 * **CI 파싱 실패 보고의 생산자 쪽** (docs/ACTIONS.md "적재 실패는 말모이에도 남는다"). `scripts/push-local.ts`는 `tsx`
 * 진입점이라 import만 해도 `process.argv`를 읽고 네트워크에 닿는다 — 그래서 소스 스캔이 아니라
 * **실제로 돌려서** 본다 (`required-args.test.ts`가 소스 스캔인 것과 갈리는 지점이다: 여기서 묻는 것은
 * "무엇이 쓰여 있나"가 아니라 **"무엇을 보냈나"**다).
 *
 * 이 파일이 지키는 것 넷:
 *
 * 1. **보고가 원래 실패를 가리지 않는다** — 정상 수신·404·타임아웃 어느 쪽이든 CLI는 exit 1이다.
 *    보고는 부가 신호이고 CI를 red로 유지하는 것이 본래 계약이다.
 * 2. **실패 경로에서 `/api/push`를 부르지 않는다** — 읽지 못한 파일로 적재를 시도하면 strict 덮어쓰기가
 *    그 로케일을 통째로 비운다.
 * 3. **본문에 파서 원문·토큰·소스 문자열이 없다** — 저장되는 것은 코드 하나다.
 * 4. **탐지 단계의 탈락도 보고된다** — 깨진 파일 하나뿐이면 후보가 0이 되어 조용히 끝나던 갈래다.
 */

const root = fileURLToPath(new URL("../../", import.meta.url));
const run = promisify(execFile);

let server: Server | undefined;
const received: { path: string; body: string; auth: string | undefined }[] = [];

afterEach(() => {
  server?.close();
  server = undefined;
  received.length = 0;
});

/** `reply`가 undefined면 응답하지 않는다 — CLI의 5초 제한을 실제로 태우는 갈래다. */
async function fakeServer(reply: number | undefined): Promise<string> {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received.push({ path: req.url ?? "", body, auth: req.headers.authorization });
      if (reply === undefined) return;
      res.writeHead(reply).end(reply === 200 ? JSON.stringify({ ok: true }) : undefined);
    });
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}`;
}

/** 폐기용 리포 하나를 임시로 만든다 — `push:local`이 `git rev-parse HEAD`를 부른다. */
function fixtureRepo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "malmoi-push-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  const git = (...args: string[]) => execFileSync("git", ["-C", dir, ...args], { stdio: "ignore" });
  git("init", "-q");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  git("add", "-A");
  git("commit", "-qm", "fixture");
  return dir;
}

const BROKEN = '{ "greeting": "hello",, }';
const GOOD = '{\n  "greeting": "hello"\n}\n';

async function push(dir: string, url: string, extra: string[] = []) {
  try {
    const { stdout, stderr } = await run("pnpm", ["exec", "tsx", "scripts/push-local.ts", dir, "--project", "acme", "--url", url, ...extra], {
      cwd: root,
      env: { ...process.env, PUSH_TOKEN: "fixture-token" },
    });
    return { code: 0, out: stdout + stderr };
  } catch (error) {
    const e = error as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

it("reports a parse failure and still exits 1, without calling /api/push", async () => {
  const url = await fakeServer(204);
  const dir = fixtureRepo({ "locales/en.json": GOOD, "locales/ko.json": BROKEN });
  const { code } = await push(dir, url);

  expect(code).toBe(1);
  expect(received.map((r) => r.path)).toEqual(["/api/push/failure"]);
  const report = JSON.parse(received[0]!.body);
  expect(report).toMatchObject({ projectSlug: "acme", code: "parse-failed" });
  expect(received[0]!.auth).toBe("Bearer fixture-token");
}, 60000);

it("pins a lower-ranked surface and carries its identity through both producers", async () => {
  const url = await fakeServer(200);
  const dir = fixtureRepo({ "a/en.json": GOOD, "a/ko.json": GOOD, "b/en.json": '{"chosen":"Selected"}', "b/ko.json": '{"chosen":"Selected"}' });
  const result = await push(dir, url, ["--surface", "web", "--path-template", "b/{locale}.json"]);
  expect(result.code, result.out).toBe(0);
  expect(JSON.parse(received[0]!.body)).toMatchObject({ surfaceSlug: "web", format: { pathTemplate: "b/{locale}.json" }, keys: [expect.objectContaining({ key: "chosen" })] });
  received.length = 0;
  const broken = fixtureRepo({ "b/en.json": GOOD, "b/ko.json": BROKEN });
  expect((await push(broken, url, ["--surface", "web", "--path-template", "b/{locale}.json"])).code).toBe(1);
  expect(JSON.parse(received[0]!.body)).toMatchObject({ surfaceSlug: "web", code: "parse-failed" });
}, 60000);

/** 깨진 파일 하나뿐이면 탐지가 후보를 못 만든다 — 그 갈래가 무음이던 자리다. */
it("reports prepare-failed when detection itself finds nothing", async () => {
  const url = await fakeServer(204);
  const dir = fixtureRepo({ "locales/en.json": BROKEN });
  const { code } = await push(dir, url);

  expect(code).toBe(1);
  expect(JSON.parse(received[0]?.body ?? "{}")).toMatchObject({ code: "prepare-failed" });
}, 60000);

/** 보고 본문은 코드 하나다 — 파서 원문도, 토큰도, 소스 문자열도 실리지 않는다. */
it("never carries the parser detail, the token, or a source string", async () => {
  const url = await fakeServer(204);
  const dir = fixtureRepo({ "locales/en.json": GOOD, "locales/ko.json": BROKEN });
  await push(dir, url);

  const body = received[0]?.body ?? "";
  expect(body).not.toContain("fixture-token");
  expect(body).not.toContain("hello");
  expect(body).not.toMatch(/SyntaxError|Unexpected|position \d/i);
  expect(Object.keys(JSON.parse(body)).sort()).toEqual(["code", "commitAt", "commitSha", "projectSlug", "surfaceSlug"]);
}, 60000);

/**
 * ⚠️ **옛 서버는 이 경로를 모른다** (404). 서버를 먼저 릴리스하는 순서를 지켜도 그 사이에 새 스크립트가
 * 옛 배포를 칠 수 있고, 그때 원래 CI 실패가 보고 실패로 바뀌면 안 된다.
 */
it("keeps exit 1 when the server does not know the endpoint", async () => {
  const url = await fakeServer(404);
  const dir = fixtureRepo({ "locales/en.json": GOOD, "locales/ko.json": BROKEN });
  const { code, out } = await push(dir, url);

  expect(code).toBe(1);
  expect(out).toMatch(/404/);
}, 60000);

/** 응답이 없으면 5초에 끊고 그냥 끝낸다 — 재시도하지 않는다. */
it("keeps exit 1 when the report times out", async () => {
  const url = await fakeServer(undefined);
  const dir = fixtureRepo({ "locales/en.json": GOOD, "locales/ko.json": BROKEN });
  const { code } = await push(dir, url);

  expect(code).toBe(1);
  expect(received).toHaveLength(1);
}, 60000);
