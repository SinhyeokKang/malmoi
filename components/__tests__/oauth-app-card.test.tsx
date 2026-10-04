import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { AppCard } from "@/components/oauth/app-card";
import { IconTile } from "@/components/ui/icon-tile";
import { en } from "@/messages/en";

/**
 * 동의 화면 앱 카드의 칩 (mcp-oauth — 2026-09-29 사용자 판정). 시안은 32/8이었지만 칸 규격은 둘뿐이고(`IconTile`), 앱 카드는 **`lg`(40)**다 —
 * 이 화면에서 앱이 주인공이라 빈 상태 칸과 같은 무게를 준다. 클래스를 박지 않고 `IconTile lg`의 출력과 같은지를 본다.
 */
it("앱 카드 칩은 IconTile lg다", () => {
  const card = renderToStaticMarkup(<AppCard m={en} name="Claude Code" ident="claude.ai/oauth/claude-code-client-metadata" />);
  const lg = renderToStaticMarkup(<IconTile size="lg" />).match(/class="([^"]+)"/)?.[1];
  expect(lg).toBeTruthy();
  expect(card).toContain(`class="${lg}"`);
});
