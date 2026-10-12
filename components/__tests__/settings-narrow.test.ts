import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * **Settings 좁은 폭 — 새 구조 없음, 남은 고정 폭만 상한으로** (responsive-app A5 · 시안 AT4 노트 "현 코드 구조 그대로").
 * 필드별 Save · 라벨 muted xs · 기준 브랜치 행 자기 Save는 그대로이고(`PanelFacts`·`@max-form` 규칙), 375 카드(291) 안에서 넘치는
 * 고정 폭 골격·긴 경로만 고친다. jsdom은 폭을 못 재 소스로 센다.
 */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("Settings — 고정 폭은 상한이다", () => {
  it("로딩 골격의 320·240 칸이 카드 폭을 넘지 않는다", () => {
    const loading = read("app/(edit)/projects/[slug]/settings/loading.tsx");
    expect(loading).not.toMatch(/w-\[320px\] shrink-0/);
    expect(loading).not.toMatch(/w-60 shrink-0/);
    expect(loading).toMatch(/w-\[320px\] max-w-full/);
    expect(loading).toMatch(/w-60 max-w-full/);
  });

  it("기준 브랜치 조회 중 골격도 상한이다", () => {
    expect(read("components/settings/repository-form.tsx")).toMatch(/<Skeleton className="h-9 w-60 max-w-full rounded-md" \/>/);
  });

  it("CI 카드의 워크플로 경로는 감긴다", () => {
    expect(read("components/settings/ci-card.tsx")).toMatch(/text-muted-foreground text-xs break-all">\{CI_PATH\[host\]\}/);
  });
});
