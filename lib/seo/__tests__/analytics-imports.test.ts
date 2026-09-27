import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

/**
 * **`@vercel/analytics`를 무는 자리는 둘뿐이다** (seo-geo). 수집 스크립트(`va.vercel-scripts.com/v1/script.js`, 2026-09-27 확인)는
 * 쿠키를 안 쓰고 `localStorage`는 `identify`가 userId/groupId를 줄 때만 쓴다 — `/privacy`의 "stores nothing in your browser"가
 * 그 전제 위에 선다. 그래서 `identify`·`track`(커스텀 이벤트, 비목표)을 부르는 자리가 생기면 red다.
 */
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "__tests__") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

it("`@vercel/analytics` import는 래퍼의 `Analytics`와 허용 목록의 타입뿐이다 — `identify`·`track` 없음", () => {
  const found: string[] = [];
  for (const file of ["app", "components", "lib"].flatMap((dir) => walk(join(ROOT, dir)))) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/^import[^;]*from\s+"(@vercel\/analytics[^"]*)"/gm)) {
      found.push(`${file.slice(ROOT.length)} ${match[0].replace(/\s+/g, " ")}`);
    }
    expect(/\b(identify|track)\s*\(/.test(source) && source.includes("@vercel/analytics"), file).toBe(false);
  }
  expect(found.sort()).toEqual([
    'components/analytics.tsx import { Analytics } from "@vercel/analytics/next"',
    'lib/seo/analytics.ts import type { BeforeSendEvent } from "@vercel/analytics"',
  ]);
});
