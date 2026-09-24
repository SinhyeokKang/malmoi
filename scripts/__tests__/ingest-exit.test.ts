import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

/**
 * **`pnpm ingest`는 exit code를 낮추지 않는다** (audit #53). 왕복 게이트가 의미 손실로 `exitCode = 1`을 세운 뒤, 마지막 줄의
 * `result.errors.length ? 1 : 0`이 read 에러 0이면 그것을 0으로 덮었다 — "❌ 데이터 손실"을 찍고 성공으로 끝났다.
 *
 * ⚠️ 소스를 센다 — read 에러 0 + 의미 손실을 동시에 내는 픽스처는 **어댑터 버그 그 자체**라(#51이 그런 버그였다)
 * 고치는 순간 사라진다. 판정 자리는 "0을 대입하는 줄이 없다" 하나다.
 */
const source = readFileSync("scripts/ingest.ts", "utf8");

it("exitCode에 0이 될 수 있는 값을 대입하지 않는다", () => {
  const assignments = [...source.matchAll(/process\.exitCode\s*=\s*([^;]+);/g)].map((m) => m[1]!.trim());
  expect(assignments.length).toBeGreaterThan(0);
  expect(assignments.filter((value) => value !== "1")).toEqual([]);
});
