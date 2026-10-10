import { describe, expect, it } from "vitest";

import { navDrawerFooterItems, navFooterItems } from "@/lib/shell/nav";
import { routes } from "@/lib/routes";
import { en } from "@/messages/en";

/**
 * **서랍 바닥** (responsive-app AT1b · AT1d) — 헤더에서 빠진 `New project`가 바닥 첫 행으로 온다. 프로젝트 밖에서는 목록 구역이 이미
 * `New project`로 끝나서 바닥에 다시 두지 않는다. 나머지는 고정 LNB 바닥과 같은 Changelog · Docs다.
 */
describe("navDrawerFooterItems", () => {
  it("프로젝트 안이면 New project · Changelog · Docs다", () => {
    const items = navDrawerFooterItems(en, true);
    expect(items.map((item) => item.href)).toEqual([routes.newProject(), routes.changelog(), routes.docs()]);
    expect(items.slice(1)).toEqual(navFooterItems(en));
  });

  it("프로젝트 밖이면 고정 LNB 바닥과 같다", () => {
    expect(navDrawerFooterItems(en, false)).toEqual(navFooterItems(en));
  });
});
