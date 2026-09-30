import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * **페이지 수준 Alert는 본문과 함께 스크롤한다** (2026-10-01 사용자 — *"Alert도 Body와 같이 그냥 스크롤 됐으면 좋겠어"*).
 *
 * ⚠️ **옛 규칙의 반대다** — POSTMORTEM 2026-09-06("본문에 두면 사유가 스크롤로 사라진다")을 근거로 넷이 머리 띠 안이나
 * 머리와 본문 사이에 섰다. 사용자가 뒤집었다: 머리는 제목·툴바 **한 띠**로 고정되고, 배너는 자기가 설명하는 콘텐츠와 같이
 * 움직인다. 첫 화면 위치는 그대로다 — 본문의 첫 블록이다.
 *
 * 구조(어느 태그 안인가)는 소스가 말한다 — 페이지는 DB·세션 없이 렌더되지 않는다. `PanelBody`가 스크롤 컨테이너라는
 * 사실은 `panel-header.test.tsx`가, `HomeNotices`가 그 안에서 격자 전폭을 쓰는 것은 `home-actions.test.tsx`가 잰다.
 */
const ROOT = process.cwd();
// 주석을 걷는다 — 옛 자리를 설명하는 주석이 `<Alert`를 **말만 해도** 태그로 세지 않게.
const strip = (source: string) => source.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const PAGES: Array<[path: string, alert: RegExp]> = [
  ["app/(edit)/projects/[slug]/settings/page.tsx", /<Alert variant="danger">\{notice\}<\/Alert>/],
  ["app/(edit)/projects/[slug]/(home)/page.tsx", /<HomeNotices\b/],
  ["app/(edit)/account/page.tsx", /<DismissibleAlert>\{notice\}<\/DismissibleAlert>/],
  ["components/projects/project-list.tsx", /<Alert variant="danger">\{message\}<\/Alert>/],
];

describe("페이지 수준 Alert가 PanelBody 안 첫 블록이다", () => {
  it.each(PAGES)("%s", (path, alert) => {
    const source = strip(readFileSync(join(ROOT, path), "utf8"));
    const headEnd = source.search(/<\/PanelHeader>|<PanelHeader\b[^>]*\/>/);
    const bodyOpen = source.search(/<PanelBody\b/);
    const bodyClose = source.indexOf("</PanelBody>");
    const at = source.search(alert);
    expect(at, "Alert not found").toBeGreaterThan(-1);
    expect(headEnd).toBeGreaterThan(-1);
    expect(bodyOpen).toBeGreaterThan(headEnd);
    // 머리 띠 안도, 머리와 본문 사이도 아니다 — 본문 안이다.
    expect(at).toBeGreaterThan(bodyOpen);
    expect(at).toBeLessThan(bodyClose);
    // 첫 블록이다 — 여는 태그와 Alert 사이에 다른 요소가 없다(조건식 `{… && ` 만 허용).
    const between = source.slice(source.indexOf(">", bodyOpen) + 1, at);
    expect(between.replace(/\{[^<]*$/, "").trim(), path).toBe("");
  });

  it("PanelHeader가 notice 슬롯을 더는 받지 않는다", () => {
    const source = readFileSync(join(ROOT, "components/shell/content-panel.tsx"), "utf8");
    expect(source).not.toMatch(/notice\??:\s*ReactNode/);
  });
});
