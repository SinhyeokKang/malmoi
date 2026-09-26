import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

/**
 * **`pnpm release:plan`은 인자를 받지 않는다** — 레벨은 `/merge` 3단계 질문이 받고(`/merge <level>` 인자를 두지 않는다),
 * 후보 셋을 한 번에 내므로 다시 부를 일이 없다. 인자가 있으면 2, `error` 판정은 1, 판정 성공은 0이다.
 *
 * 소스를 센다 — 진입점이 import 순간 `process.argv`를 읽고 git·네트워크(`ls-remote`)를 부른다.
 */
const source = readFileSync("scripts/release-plan.ts", "utf8");

it("인자가 하나라도 있으면 exit 2이고, 그 판정이 git 호출보다 앞이다", () => {
  expect(source).toMatch(/process\.argv\.length > 2[\s\S]{0,200}process\.exit\(2\)/);
  const exitAt = source.indexOf("process.exit(2)");
  const gitAt = source.indexOf('git("');
  expect(exitAt).toBeGreaterThan(0);
  expect(gitAt).toBeGreaterThan(0);
  expect(exitAt).toBeLessThan(gitAt);
});

it("태그는 로컬이 아니라 원격에서 읽는다 — 로컬엔 원격에 없는 태그가 있다", () => {
  expect(source).toContain('"ls-remote", "--tags", "--refs", "origin"');
  expect(source).not.toMatch(/"tag", "(-l|--list)"|describe/);
});

it("쓰지 않는다 — 버전 기록은 /merge 4단계의 npm pkg set이다", () => {
  expect(source).not.toMatch(/writeFileSync|"commit"|"push"|"tag"|"pkg", "set"|"version", "--"/);
});

it("exit code는 0·1·2 셋이다 — error 판정만 1", () => {
  const exits = [...source.matchAll(/process\.exit\(([^)]*)\)/g)].map((m) => m[1]!.trim());
  expect(new Set(exits)).toEqual(new Set(["2", 'plan.action === "error" ? 1 : 0']));
});
