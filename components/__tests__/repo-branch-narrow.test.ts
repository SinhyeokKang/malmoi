import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * **새 프로젝트 ① Branch 행 — 좁은 목록에서 적층** (malmoi#224 · responsive-app DS). 한 줄 flex에 Select 220 `shrink-0`이라 375(목록 311)에서
 * 카드 밖으로 나가고 설명이 폭 0으로 사라졌다. 리포 목록이 `@container`를 선언하고 640 미만이면 라벨 / 컨트롤(전폭) / 설명이 DOM 순서대로
 * 줄을 나눈다. 넓은 폭(1280)은 한 줄 220 그대로다. jsdom은 컨테이너 쿼리를 못 잰다 — 클래스 계약이다.
 */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const repo = readFileSync(join(ROOT, "components/onboarding/steps/repo.tsx"), "utf8");

describe("Branch 행 — 640 미만 적층", () => {
  it("리포 목록이 컨테이너를 선언한다(질의는 자손 행)", () => {
    expect(repo).toMatch(/<ul className="@container border-border overflow-hidden rounded-md border">/);
  });

  it("행이 감기고 라벨·설명은 좁은 폭에서 한 줄 전체다", () => {
    expect(repo).toMatch(/function BranchShell[\s\S]*?className="border-border flex flex-wrap items-center gap-x-3 gap-y-1\.5 border-t p-3 pl-20"/);
    expect(repo).toMatch(/id="repo-branch-label"[^>]*className="[^"]*@max-form:basis-full/);
    expect(repo).toMatch(/text-foreground\/60 min-w-0 flex-1 text-xs leading-body @max-form:basis-full/);
  });

  it("컨트롤 폭은 래퍼가 든다 — 넓으면 220, 좁으면 남는 폭 · 넘지 않는다", () => {
    const wrappers = repo.match(/<div className="flex w-\[220px\] max-w-full shrink-0 @max-form:min-w-0 @max-form:flex-1">/g) ?? [];
    expect(wrappers).toHaveLength(2);
    expect(repo).toMatch(/<SelectTrigger width="full" id="repo-branch"/);
    expect(repo).toMatch(/<Input width="full"\s+id="repo-branch"/);
    expect(repo).toMatch(/<Skeleton className="h-9 w-\[220px\] max-w-full shrink-0 rounded-md @max-form:flex-1" \/>/);
    expect(repo).not.toMatch(/width=\{220\}/);
  });
});
