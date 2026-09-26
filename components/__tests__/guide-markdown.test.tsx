// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { GuideMarkdown } from "@/components/docs/guide-markdown";
import { parseMd } from "@/lib/guide/parse";

import { render } from "./helpers/dom";

const MD = `# Add the workflow

Add **one file** to the repository.

## Where it goes {#workflow}

Read [formats](../reference/formats.md#formats), [this section](#workflow), or [GitHub](https://github.com).

[Bad](javascript:alert(1))

<b>raw html</b>

| Name | Value |
|---|---|
| a | \`1\` |

\`\`\`yaml title=".github/workflows/malmoi-i18n.yml"
on: push
\`\`\`

\`\`\`
plain
\`\`\`

> Heads up.

![The settings screen](/guide/settings.webp "Open Settings first")

## Next {#next}

Done.
`;

const renderGuide = (md = MD) => render(<GuideMarkdown tree={parseMd(md)} file="setup/workflow.md" />);

describe("GuideMarkdown — 요소 매핑 (DESIGN §6.61)", () => {
  it("h2가 `{#id}`를 `id`로 들고 표식을 글자에서 뗀다 · 포커스 대상이다", async () => {
    const { container } = await renderGuide();
    const h2 = container.querySelector("h2#workflow");
    expect(h2?.textContent).toBe("Where it goes");
    expect(h2?.getAttribute("tabindex")).toBe("-1");
    expect(container.querySelectorAll("h1")).toHaveLength(1);
  });

  it("굵게는 500이다 — 브라우저 기본 700이 아니다", async () => {
    const { container } = await renderGuide();
    expect(container.querySelector("strong")?.className).toContain("font-medium");
  });

  it("링크 — 상대 `.md`는 앱 경로 · 외부는 새 탭 · 모두 파랑과 링", async () => {
    const { container } = await renderGuide();
    const links = [...container.querySelectorAll("a")];
    const byText = (text: string) => links.find((a) => a.textContent === text)!;
    expect(byText("formats").getAttribute("href")).toBe("/docs/reference/formats#formats");
    expect(byText("this section").getAttribute("href")).toBe("/docs/setup/workflow#workflow");
    expect(byText("GitHub").getAttribute("target")).toBe("_blank");
    expect(byText("GitHub").getAttribute("rel")).toBe("noreferrer");
    expect(byText("formats").getAttribute("target")).toBeNull();
    for (const a of links) expect(a.className).toContain("focus-visible:ring-2");
  });

  /**
   * ⚠️ raw HTML은 **버려지지 않고 글자로** 선다(react-markdown 10 — `rehype-raw` 없음 · `skipHtml` 끔). 요소로는 안 서므로
   * 실행 위험은 없지만 화면에 태그가 보이므로, 원고에 HTML이 0인 것은 게이트(`lib/guide/rules.ts`)가 막는다.
   */
  it("`javascript:` 링크는 기본 `urlTransform`이 걷는다 · raw HTML은 요소가 아니라 글자로 선다", async () => {
    const { container } = await renderGuide();
    const bad = [...container.querySelectorAll("a")].find((a) => a.textContent === "Bad");
    expect(bad?.getAttribute("href") ?? "").not.toContain("javascript");
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toContain("<b>raw html</b>");
  });

  it("표는 region과 `<table>` 둘 다 가장 가까운 헤딩 이름을 든다", async () => {
    const { container } = await renderGuide();
    const region = container.querySelector('[role="region"][aria-label="Where it goes"]');
    expect(region?.getAttribute("tabindex")).toBe("0");
    expect(region?.querySelector("table")?.getAttribute("aria-label")).toBe("Where it goes");
    expect(region?.querySelector("th")?.getAttribute("scope")).toBe("col");
  });

  it("코드 블록 — 파일명이 있으면 바에 서고 region 이름이 된다 · 없으면 `Code`", async () => {
    const { container } = await renderGuide();
    const blocks = [...container.querySelectorAll("pre")];
    expect(blocks.map((pre) => pre.getAttribute("aria-label"))).toEqual([".github/workflows/malmoi-i18n.yml", "Code"]);
    expect(blocks[0]?.textContent).toBe("on: push");
    // 이름을 든 노드가 곧 스크롤 region이다 — 이름만 있고 role이 없으면 랜드마크 목록에 안 선다(POSTMORTEM 2026-09-19)
    expect(blocks.every((pre) => pre.getAttribute("role") === "region" && pre.getAttribute("tabindex") === "0")).toBe(true);
    // 알림 자리는 처음부터 DOM에 있다 — 나중에 붙은 live region은 무시된다
    expect(container.querySelectorAll('[role="status"][aria-live="polite"]').length).toBeGreaterThanOrEqual(2);
  });

  it("인용은 info Alert다", async () => {
    const { container } = await renderGuide();
    expect(container.querySelector("[data-alert]")?.textContent).toContain("Heads up.");
    expect(container.querySelector("blockquote")).toBeNull();
  });

  it("이미지 문단은 `<p>` 없이 `<figure>`로 선다 · 제목이 캡션이다 · lazy", async () => {
    const { container } = await renderGuide();
    const figure = container.querySelector("figure");
    expect(figure?.parentElement?.tagName).not.toBe("P");
    expect(figure?.querySelector("img")?.getAttribute("alt")).toBe("The settings screen");
    expect(figure?.querySelector("img")?.getAttribute("loading")).toBe("lazy");
    expect(figure?.querySelector("figcaption")?.textContent).toBe("Open Settings first");
  });

  it("같은 트리를 두 번 렌더해도 같다 — 로더의 `cache`가 든 트리를 바꾸지 않는다", async () => {
    const tree = parseMd(MD);
    await render(<GuideMarkdown tree={tree} file="setup/workflow.md" />);
    const again = await render(<GuideMarkdown tree={tree} file="setup/workflow.md" />);
    // ⚠️ `querySelector("#id")`를 쓰지 않는다 — jsdom은 id를 문서 단위로 찾아 앞 컨테이너의 같은 id에 걸리면 null을 준다.
    expect([...again.container.querySelectorAll("h2")].find((h) => h.id === "workflow")?.textContent).toBe("Where it goes");
  });
});
