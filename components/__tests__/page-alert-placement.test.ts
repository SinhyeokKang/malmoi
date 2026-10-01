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

/**
 * 본문 여는 태그와 Alert 사이에 다른 블록이 없는가. 허용하는 것은 Alert를 감싸는 **마지막** 조건식 `{… && ` 하나다.
 * ⚠️ `[^{}<]`여야 한다 — `[^<]`면 첫 `{`부터 걷어서 `{archived && archive}\n{notice !== null && `가 통째로 빈 문자열이 되고,
 * 카드를 Alert 위로 올려도 이 검사가 지나간다(U12 r1 리뷰).
 */
const isFirstBlock = (source: string, alert: RegExp) => {
  const bodyOpen = source.search(/<PanelBody\b/);
  const at = source.search(alert);
  const between = source.slice(source.indexOf(">", bodyOpen) + 1, at);
  return between.replace(/\{[^{}<]*$/, "").trim() === "";
};

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
    expect(isFirstBlock(source, alert), path).toBe(true);
  });

  /** 역검사 — 검사가 공회전하지 않는다. Settings의 실제 두 줄을 뒤바꾸면(보관 카드가 Alert 위) red여야 한다. */
  it("다른 블록이 Alert 앞에 서면 잡는다", () => {
    const alert = /<Alert variant="danger">\{notice\}<\/Alert>/;
    const ok = '<PanelBody className="space-y-4">\n  {notice !== null && <Alert variant="danger">{notice}</Alert>}\n  {archived && archive}\n</PanelBody>';
    const swapped = '<PanelBody className="space-y-4">\n  {archived && archive}\n  {notice !== null && <Alert variant="danger">{notice}</Alert>}\n</PanelBody>';
    const element = '<PanelBody className="space-y-4">\n  <GeneralCard />\n  {notice !== null && <Alert variant="danger">{notice}</Alert>}\n</PanelBody>';
    expect(isFirstBlock(ok, alert)).toBe(true);
    expect(isFirstBlock(swapped, alert)).toBe(false);
    expect(isFirstBlock(element, alert)).toBe(false);
  });

  it("PanelHeader가 notice 슬롯을 더는 받지 않는다", () => {
    const source = readFileSync(join(ROOT, "components/shell/content-panel.tsx"), "utf8");
    expect(source).not.toMatch(/notice\??:\s*ReactNode/);
  });
});
