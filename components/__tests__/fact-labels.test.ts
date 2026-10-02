import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

/**
 * **사실 라벨은 `text-muted-foreground` 하나다** (ux-drift-unify 4-Y22) — `gray-dim`은 흰 면에서 12px 대비가 모자라고
 * (Home attention 카드가 먼저 올렸다), Account만 자간까지 달랐다. 만료 행을 흐리게 하는 `gray-dim`(값 쪽)은 등재된 이탈이라 여기서 세지 않는다.
 * Account 라벨의 자간은 `text-xs`가 든다(T1) — 이 테스트는 색만 센다.
 */
const LABELS: [file: string, pattern: RegExp][] = [
  ["app/(edit)/account/page.tsx", /<(?:span|label)[^>]*className="[^"]*text-xs[^"]*"[^>]*>\{m\.account\.profile\.\w+\}/g],
  ["components/settings/general-card.tsx", /<(?:span|label)[^>]*className="[^"]*text-xs[^"]*"[^>]*>\{m\.settings\.general\.\w+\}/g],
  ["components/mcp/token-card.tsx", /<dt className="[^"]*"/g],
  ["components/mcp/connected-apps-card.tsx", /<dt className="[^"]*"/g],
];

it.each(LABELS)("%s의 사실 라벨이 muted 한 벌이다", (file, pattern) => {
  const found = readFileSync(file, "utf8").match(pattern) ?? [];
  expect(found.length).toBeGreaterThan(0);
  for (const tag of found) {
    expect(tag).toContain("text-muted-foreground");
    expect(tag).not.toContain("gray-dim");
  }
});
