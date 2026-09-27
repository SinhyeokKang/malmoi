import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

/**
 * **`pnpm guide:check`는 결과로 실패하지 않는다** — 인자 오류만 2다(`pnpm scan`과 같은 규약). stale은 "다시 찍어라"는
 * 신호이고 `/push`·`/guide-shots`가 출력을 인용할 뿐 막지 않는다. 결과를 exit code로 올리는 줄이 생기면 누군가 그것을
 * 게이트로 쓰기 시작한다.
 *
 * 소스를 센다 — 진입점이 import 순간 `process.argv`를 읽고 git을 부른다.
 */
const source = readFileSync("scripts/guide-check.ts", "utf8");

it("exit code는 인자 오류의 2 하나뿐이다", () => {
  const exits = [...source.matchAll(/process\.exit\(([^)]*)\)/g)].map((m) => m[1]!.trim());
  expect(exits).toEqual(["2"]);
  expect(source).not.toMatch(/process\.exitCode/);
});
