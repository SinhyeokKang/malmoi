import { execFile, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, expect, it } from "vitest";

/**
 * **중복 키의 CI 판정** (B7a r1, 2026-09-24 사용자 결정 · docs/ACTIONS.md §3). code-dict·ts-dict의 중복 프로퍼티는 JS 의미대로
 * 마지막 값이 적재되고 write도 그 자리를 고친다 — 경고(`duplicate-property`)이고 **exit 0**이며 `/api/push`까지 간다.
 * 대조: YAML·JSON의 `duplicate-key`는 값 하나가 사라지는 파일이라 **exit 1**이고 서버에 적재를 보내지 않는다.
 * `push-failure-report.test.ts`와 같은 이유로 실제로 돌린다.
 */
const root = fileURLToPath(new URL("../../", import.meta.url));
const run = promisify(execFile);
let server: Server | undefined;
const received: string[] = [];
afterEach(() => { server?.close(); server = undefined; received.length = 0; });

async function fakeServer(): Promise<string> {
  server = createServer((req, res) => {
    req.on("data", () => {});
    req.on("end", () => { received.push(req.url ?? ""); res.writeHead(200).end(JSON.stringify({ ok: true })); });
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}`;
}

function fixtureRepo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "malmoi-dup-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  const git = (...args: string[]) => execFileSync("git", ["-C", dir, ...args], { stdio: "ignore" });
  git("init", "-q"); git("config", "user.email", "t@example.com"); git("config", "user.name", "t"); git("add", "-A"); git("commit", "-qm", "fixture");
  return dir;
}

async function push(dir: string, url: string) {
  try {
    const { stdout, stderr } = await run("pnpm", ["exec", "tsx", "scripts/push-local.ts", dir, "--project", "acme", "--url", url], {
      cwd: root, env: { ...process.env, PUSH_TOKEN: "fixture-token" },
    });
    return { code: 0, out: stdout + stderr };
  } catch (error) {
    const e = error as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

it("code-dict 중복 프로퍼티는 경고 한 줄과 함께 exit 0이고 적재를 보낸다", async () => {
  const url = await fakeServer();
  const dir = fixtureRepo({
    "src/locale/en.ts": "export default {\n  a: 'first',\n  b: 'B',\n  a: 'A',\n}\n",
    "src/locale/ko.ts": "export default {\n  a: '가',\n  b: '나',\n}\n",
  });
  const result = await push(dir, url);
  expect(result.code, result.out).toBe(0);
  expect(received).toEqual(["/api/push"]);
  expect(result.out).toMatch(/src\/locale\/en\.ts {2}a — /);
}, 60000);

it.each([
  ["yaml 같은 이름", { "locales/en.yml": "a: one\na: two\nb: B\n", "locales/ko.yml": "a: 하나\nb: 비\n" }],
  ["json 평탄화 충돌", { "locales/en.json": '{"a.b": "flat", "a": {"b": "nested"}, "c": "C"}\n', "locales/ko.json": '{"c": "씨"}\n' }],
])("대조: %s의 duplicate-key는 exit 1이고 적재를 보내지 않는다", async (_name, files) => {
  const url = await fakeServer();
  const result = await push(fixtureRepo(files), url);
  expect(result.code, result.out).toBe(1);
  expect(received).toEqual(["/api/push/failure"]);
}, 60000);
