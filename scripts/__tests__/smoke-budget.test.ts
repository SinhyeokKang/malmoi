import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

/**
 * **GitHub 스모크도 다운로드 예산을 지난다** (launch-readiness L7.3, audit #46). 스모크는 "진입점으로 돈다"가 요지인데
 * blob 루프를 손으로 짜 `readFiles`의 예산 검사 둘을 건너뛰었다 — 예산을 넘는 리포에서 프로덕션은 거부하고 스모크는 통과한다.
 *
 * 소스 스캔인 이유: 실 API라 `pnpm test`에서 돌 수 없고(`required-args.test.ts`와 같은 결), `lib/import/read.ts`는
 * `server-only`라 react-server 조건 없는 tsx에서 import하면 죽는다 — 그래서 같은 두 함수를 직접 부른다.
 */
const source = readFileSync(fileURLToPath(new URL("../smoke-github.ts", import.meta.url)), "utf8");

it("blob을 받기 전에 개수·크기 예산을 재고, 받는 동안 누적 바이트를 잰다", () => {
  expect(source).toMatch(/checkDownloadBudget\(targets, snapshot\.files\)/);
  expect(source).toMatch(/checkContentBudget\(path, text, totalBytes\)/);
});
