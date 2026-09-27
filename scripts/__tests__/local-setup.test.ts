import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

/**
 * **스크립트는 `.env.local` 로드와 PrismaClient 조립을 `scripts/local.ts`(+ dotenv 잎 `local-env.ts`)로 한다** (launch-readiness L7.4).
 * 여섯 스크립트가 각자 조립하면서 `quiet`·`log: []`가 갈렸다 — credentials 스크립트의 `log: []`는 Prisma가 인자를
 * 찍지 않게 하는 방어인데 사본마다 따로 기억해야 했다.
 */
const dir = fileURLToPath(new URL("..", import.meta.url));
// `local-env.ts`는 `local.ts`의 dotenv 절반이다 — `push:local`이 Prisma 없이 물 수 있게 떼었다(`push-local-graph.test.ts`).
const scripts = readdirSync(dir).filter((f) => f.endsWith(".ts") && f !== "local.ts" && f !== "local-env.ts");

it.each(scripts)("%s — dotenv·PrismaClient를 직접 조립하지 않는다", (file) => {
  const source = readFileSync(`${dir}/${file}`, "utf8");
  expect(source).not.toMatch(/new PrismaClient\(/);
  expect(source).not.toMatch(/config\(\{ path: "\.env\.local"/);
});
