import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
it.each(["app/(edit)/projects/[slug]/settings/page.tsx", "app/(edit)/projects/[slug]/(home)/page.tsx", "app/invite/[token]/page.tsx", "lib/keys/query.ts"])("%s가 프로젝트 이미지 조회를 포함한다", path => {
  expect(readFileSync(path, "utf8")).toMatch(/image:\s*true/);
});
