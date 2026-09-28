// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { ReleaseEntry } from "@/components/changelog/release-entry";
import { SECTION_HEADING, SUB_HEADING } from "@/components/docs/classes";
import { m } from "@/lib/i18n";
import { releaseTagUrl } from "@/lib/links";

import { render } from "./helpers/dom";

/**
 * `/changelog`의 항목 하나 (design "렌더"). 본문은 GitHub 원문이라 **사전을 지나지 않는 유일한 공개 텍스트**이고,
 * 그래서 렌더러가 방어선이다 — raw HTML은 글자로, 이미지는 링크로, `javascript:`는 걷힌다.
 */

const BODY = `## Highlights

A new version of the GitHub Action. See [the docs](https://mal-moi.com/docs) or [below](#fixes).

## Features

### GitHub Action
- **Action v2 on Node 24.** Uses \`malmoi-i18n-push-v2\`.

#### Deep heading

<script>alert(1)</script>

<img src=x onerror="alert(1)">

![Settings screen](https://github.com/user-attachments/assets/abc)

![Ref shot][shot]

See [protocol-relative](//example.com/x).

[shot]: https://github.com/user-attachments/assets/ref

[Bad](javascript:alert(1))

**Full changelog:** https://github.com/SinhyeokKang/malmoi/compare/v1.0.0...v1.0.1
`;

const release = { tag: "v1.0.1", publishedAt: "2026-09-27T16:34:14Z", body: BODY };

async function entry() {
  return (await render(<ReleaseEntry release={release} />)).container;
}

describe("ReleaseEntry — 머리", () => {
  /** 2026-09-28 사용자 — 버전 글자가 곧 그 판의 GitHub Release 링크다(옛 자기 앵커 + 본문 아래 `View on GitHub` 대체). 글리프 없음. */
  it("버전 h1은 해시 착지 대상이고, 글자가 그 판의 Release로 새 탭에서 간다", async () => {
    const container = await entry();
    const h1 = container.querySelector("h1");
    expect(h1?.id).toBe("v1.0.1");
    expect(h1?.getAttribute("tabindex")).toBe("-1");
    expect(h1?.className).toContain("scroll-mt-12");
    const anchor = h1?.querySelector("a");
    expect(anchor?.getAttribute("href")).toBe(releaseTagUrl("v1.0.1"));
    expect(anchor?.textContent).toBe("v1.0.1");
    expect(anchor?.getAttribute("target")).toBe("_blank");
    expect(anchor?.getAttribute("rel")).toBe("noreferrer");
    expect(anchor?.querySelector("svg")).toBeNull();
  });

  it("구역의 이름은 버전 h1이다 — 이름 없는 section이 없다", async () => {
    const container = await entry();
    expect(container.querySelector("section")?.getAttribute("aria-labelledby")).toBe("v1.0.1");
  });

  it("날짜는 UTC 날짜 형이고 dateTime에 원 ISO가 든다", async () => {
    const container = await entry();
    const time = container.querySelector("time");
    expect(time?.textContent).toBe("Sep 27, 2026");
    expect(time?.getAttribute("datetime")).toBe("2026-09-27T16:34:14Z");
  });
});

describe("ReleaseEntry — 본문", () => {
  /** 2026-09-28 사용자 — 버전 h1, 본문 큰 제목 h2 식으로 태그째 한 단계씩 올렸다. */
  it("원문 ##는 버전과 같은 h1이고 모양은 공개 문서 공통 급이다 — 버전 30 > 절 24 > 소제목 20", async () => {
    const container = await entry();
    const [version, ...body] = [...container.querySelectorAll("h1")];
    expect(version?.className).toContain("text-3xl");
    expect(body.map((h) => h.textContent)).toEqual(["Highlights", "Features"]);
    expect(body[0]?.className).toBe(SECTION_HEADING);
    expect(container.querySelector("h2")?.textContent).toBe("GitHub Action");
    expect(container.querySelector("h2")?.className).toBe(SUB_HEADING);
  });

  it("raw HTML은 요소가 아니라 글자로 선다", async () => {
    const container = await entry();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<script>alert(1)</script>");
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
  });

  it("마크다운 이미지는 <img>가 아니라 alt 글자의 링크다", async () => {
    const container = await entry();
    expect(container.querySelectorAll("img")).toHaveLength(0);
    const link = [...container.querySelectorAll("a")].find((a) => a.textContent === "Settings screen");
    expect(link?.getAttribute("href")).toBe("https://github.com/user-attachments/assets/abc");
  });

  it("참조형 이미지도 <img>가 아니라 새 탭 링크다", async () => {
    const container = await entry();
    expect(container.querySelectorAll("img")).toHaveLength(0);
    const link = [...container.querySelectorAll("a")].find((a) => a.textContent === "Ref shot");
    expect(link?.getAttribute("href")).toBe("https://github.com/user-attachments/assets/ref");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noreferrer");
  });

  it("`javascript:` href는 걷힌다", async () => {
    const container = await entry();
    const bad = [...container.querySelectorAll("a")].find((a) => a.textContent === "Bad");
    expect(bad?.getAttribute("href") ?? "").not.toContain("javascript");
  });

  it("외부 링크는 새 탭 + noreferrer · 문서 안 링크는 그대로", async () => {
    const container = await entry();
    const byText = (text: string) => [...container.querySelectorAll("a")].find((a) => a.textContent === text);
    // 프로토콜 상대(`//host`)도 외부다 — 원고 판정(`resolveDocLink`)과 같다.
    for (const text of ["the docs", "Settings screen", "protocol-relative"]) {
      expect(byText(text)?.getAttribute("target")).toBe("_blank");
      expect(byText(text)?.getAttribute("rel")).toBe("noreferrer");
    }
    expect(byText("below")?.getAttribute("target")).toBeNull();
    expect(byText("the docs")?.className).toContain("text-blue-600");
  });

  it("끝의 Full changelog 줄은 없다", async () => {
    const container = await entry();
    expect(container.textContent).not.toContain("Full changelog");
  });
});

describe("ReleaseEntry — 버튼 없음", () => {
  it("본문 아래 `View on GitHub` 버튼이 없다 — 버전 글자가 대신한다", async () => {
    const container = await entry();
    expect(container.textContent).not.toContain("View on GitHub");
    expect(container.querySelectorAll(`a[href="${releaseTagUrl("v1.0.1")}"]`)).toHaveLength(1);
  });
});
