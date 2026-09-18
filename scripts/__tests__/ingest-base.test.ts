import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, expect, it } from "vitest";

/**
 * **`pnpm ingest --base`가 적재 경로와 같은 검증을 지난다** (launch-readiness L7.3, audit #41).
 *
 * base가 키 집합의 진실이라 탐지되지 않은 로케일을 base로 받으면 진짜 base에만 있는 키가 미리보기에서 빠진다 —
 * `assemblePushInput`은 던지는데 ingest만 바깥 조립을 따로 들고 있어서 조용히 통과했다(ARCHITECTURE §5.5.0).
 * 스크립트를 **실제로 띄운다** — DB·네트워크에 닿지 않는 유일한 CLI라 가능하다.
 */
const repo = mkdtempSync(join(tmpdir(), "malmoi-ingest-base-"));
mkdirSync(join(repo, "locales"));
writeFileSync(join(repo, "locales/en.json"), `${JSON.stringify({ hello: "Hello", bye: "Bye" }, null, 2)}\n`);
writeFileSync(join(repo, "locales/ko.json"), `${JSON.stringify({ hello: "안녕" }, null, 2)}\n`);
afterAll(() => rmSync(repo, { recursive: true, force: true }));

const ingest = (...args: string[]) =>
  spawnSync(join("node_modules", ".bin", "tsx"), ["scripts/ingest.ts", repo, ...args], { encoding: "utf8" });

it("탐지되지 않은 로케일을 --base로 주면 0이 아닌 코드로 끝난다", () => {
  const run = ingest("--base", "de");
  expect(run.status).not.toBe(0);
  expect(run.stderr).toContain("base locale de");
}, 30_000);

it("탐지된 로케일이면 0으로 끝나고 그것을 base로 쓴다 (짝)", () => {
  const run = ingest("--base", "ko");
  expect(run.status).toBe(0);
  expect(run.stdout).toContain("(base: ko)");
}, 30_000);
