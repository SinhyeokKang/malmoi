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

/**
 * apple-strings도 같은 판정이다(지휘자 결정 2026-10-19 — design §2.1 "보고"). Apple 의미대로 나중 값이 적재되고 write도 그 리터럴만 고쳐 잃는 번역이
 * 없다. 재측정에서 `.strings` 정답 리포 PayForMe가 중복 2건이라 `duplicate-key`면 그 리포 CI가 영구 red였다.
 */
it("apple-strings 중복 키는 경고 한 줄과 함께 exit 0이고 적재를 보낸다", async () => {
  const url = await fakeServer();
  const dir = fixtureRepo({
    "App/en.lproj/Localizable.strings": '"a" = "first";\n"b" = "B";\n"a" = "A";\n',
    "App/ko.lproj/Localizable.strings": '"a" = "가";\n"b" = "나";\n',
  });
  const result = await push(dir, url);
  expect(result.code, result.out).toBe(0);
  expect(received).toEqual(["/api/push"]);
  expect(result.out).toMatch(/App\/en\.lproj\/Localizable\.strings {2}a — /);
}, 60000);

/**
 * apple-xcstrings도 같은 판정이다(지휘자 결정 14). 카탈로그의 같은 이름은 Xcode 26.6처럼 앞의 것을 읽고 write도 그 사본만 고친다. 정답 리포 HealthGPT의
 * 카탈로그가 이 모양이다(옛 Xcode가 쓴 `"LLM Settings"` 두 번 — 앞은 en 셀, 뒤는 빈 객체). 복수형 키(unmanaged)도 red가 아니다.
 */
it("apple-xcstrings 중복 키는 경고 한 줄과 함께 exit 0이고 적재를 보낸다", async () => {
  const url = await fakeServer();
  const cell = (value: string) => ({ stringUnit: { state: "translated", value } });
  const plural = { variations: { plural: { one: cell("%lld item"), other: cell("%lld items") } } };
  const body = JSON.stringify({ sourceLanguage: "en", strings: { "%lld items": { localizations: { en: plural } }, "LLM Settings": { localizations: { en: cell("LLM Settings") } }, Save: {} }, version: "1.0" }, null, 2)
    .replace(/": /g, '" : ')
    .replace('    "Save" : {}', '    "LLM Settings" : {\n\n    },\n    "Save" : {}');
  const result = await push(fixtureRepo({ "App/Localizable.xcstrings": body }), url);
  expect(result.code, result.out).toBe(0);
  expect(received).toEqual(["/api/push"]);
  expect(result.out).toMatch(/App\/Localizable\.xcstrings {2}LLM Settings — /);
}, 60000);

/**
 * **`unmanaged`도 red가 아니다** (2026-10-01 doc-check C2 사용자 판정 · ARCHITECTURE §1 "read 오류의 두 갈래"). surgical writer가
 * 파일에 그대로 남기는 값(코드의 식·YAML 숫자)이라 잃는 번역이 없다 — 서버 적재가 통과시키는 항목으로 대상 리포 CI를 막지 않는다.
 */
it.each([
  ["code-dict 비리터럴 값", { "src/locale/en.ts": "const x = 'X';\nexport default {\n  a: x,\n  b: 'B',\n}\n", "src/locale/ko.ts": "export default {\n  b: '나',\n}\n" }],
  ["yaml 숫자 값", { "locales/en.yml": "a: 3\nb: B\n", "locales/ko.yml": "b: 비\n" }],
])("%s(unmanaged)는 exit 0이고 적재를 보낸다", async (_name, files) => {
  const url = await fakeServer();
  const result = await push(fixtureRepo(files), url);
  expect(result.code, result.out).toBe(0);
  expect(received).toEqual(["/api/push"]);
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
