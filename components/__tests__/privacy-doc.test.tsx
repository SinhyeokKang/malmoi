// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { PrivacyDoc } from "@/components/privacy/privacy-doc";
import { m } from "@/lib/i18n";

import { find, render } from "./helpers/dom";

/**
 * `/privacy` 읽기 그릇 (시안 `Landing.dc.html` 1e — DESIGN §6.616). 본문은 사전 그대로이고 그릇만 바뀐다.
 */
const privacy = m.publicDocs.privacy;
const doc = () => render(<PrivacyDoc />);
/** DESIGN §7의 링 셋 — 하나라도 빠지면 브라우저 기본 outline이 그려진다. */
const RING = ["focus-visible:ring-ring", "focus-visible:ring-2", "focus-visible:outline-none"];

describe("PrivacyDoc — 구조", () => {
  it("h1이 하나이고 방침 제목이다", async () => {
    const { container } = await doc();
    expect([...container.querySelectorAll("h1")].map((h) => h.textContent)).toEqual([privacy.title]);
  });

  it("절 일곱이 자기 h2로 이름을 갖는다", async () => {
    const { container } = await doc();
    const sections = [...container.querySelectorAll("section")];
    expect(sections.map((s) => s.getAttribute("aria-labelledby"))).toEqual(privacy.sections.map((s) => s.id));
    for (const section of sections) {
      const id = section.getAttribute("aria-labelledby") ?? "";
      expect(section.querySelector(`h2#${id}`)).not.toBeNull();
    }
    expect(sections).toHaveLength(7);
  });

  /** 목차가 누른 절로 포커스를 옮긴다(`toc.tsx`) — 제목이 포커스를 받을 수 있어야 하고 링을 그리지 않는다. */
  it("절 제목이 프로그램 포커스를 받는다", async () => {
    const { container } = await doc();
    for (const h2 of container.querySelectorAll("h2")) {
      expect(h2.getAttribute("tabindex")).toBe("-1");
      expect(h2.className).toContain("focus:outline-none");
    }
  });

  it("시행일이 라벨과 함께 `<time dateTime>`으로 선다", async () => {
    const { container } = await doc();
    const time = find(container, "time");
    expect(time.getAttribute("datetime")).toBe(privacy.effectiveDate);
    expect(time.parentElement?.textContent).toBe(`${m.publicDocs.effectiveDate} ${privacy.effectiveDate}`);
  });

  /** POSTMORTEM 2026-09-19 — 가로 스크롤은 표 자기 컨테이너가 든다. 키보드로 닿으려면 region·tabIndex·이름 셋. */
  it("표 둘이 이름 있는 region 안에서 키보드로 스크롤된다", async () => {
    const { container } = await doc();
    const regions = [...container.querySelectorAll('[role="region"]')];
    expect(regions).toHaveLength(2);
    for (const region of regions) {
      expect(region.getAttribute("tabindex")).toBe("0");
      expect(region.getAttribute("aria-label")).toBeTruthy();
      expect(region.querySelector("table")?.getAttribute("aria-label")).toBe(region.getAttribute("aria-label"));
      expect(region.className).toContain("overflow-auto");
    }
  });

  /** 표 안에 포커스 가능한 것이 없어 region 자신이 Tab을 받는다 — 링이 없으면 기본 outline이 선다(DESIGN §7). */
  it("표 region이 포커스 링 셋을 든다", async () => {
    const { container } = await doc();
    const regions = [...container.querySelectorAll('[role="region"]')];
    expect(regions).toHaveLength(2);
    for (const region of regions) expect(region.className.split(/\s+/)).toEqual(expect.arrayContaining(RING));
  });

  /** 사전이 맨몸으로 내놓는 `<a>`(mailto)라 링도 절 래퍼의 `[&_a]:` 변형이 건다. */
  it("본문 링크가 포커스 링 셋을 든다", async () => {
    const { container } = await doc();
    const sections = [...container.querySelectorAll("section")];
    expect(sections.some((section) => section.querySelector("a") !== null)).toBe(true);
    for (const section of sections) {
      expect(section.className.split(/\s+/)).toEqual(expect.arrayContaining(RING.map((cls) => `[&_a]:${cls}`)));
    }
  });

  it("본문 링크가 파랑이다 — 절 래퍼의 `[&_a]:` 변형", async () => {
    const { container } = await doc();
    for (const section of container.querySelectorAll("section")) {
      expect(section.className).toContain("[&_a]:text-blue-600");
    }
  });

  /** 헤더가 나가는 길을 든다 — 옛 1열 그릇의 복귀 링크를 싣지 않는다. */
  it("복귀 링크가 없다", async () => {
    const { container } = await doc();
    const labels = [...container.querySelectorAll("a")].map((a) => a.textContent);
    expect(labels).not.toContain("Back to projects");
    expect(labels).not.toContain("Back to sign in");
  });

  it("오른쪽 칸이 절마다 항목을 둔 `On this page` 목차다", async () => {
    const { container } = await doc();
    const nav = find(container, "nav");
    expect(document.getElementById(nav.getAttribute("aria-labelledby") ?? "")?.textContent).toBe(privacy.toc);
    expect(privacy.toc).toBe("On this page");
    // 라벨은 짧은 라벨 → 제목 폴백이다(아래 #117). 여기서는 절마다 하나씩 선다는 것만 센다.
    expect([...nav.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(privacy.sections.map((s) => `#${s.id}`));
  });

  it("`<main>`을 그리지 않는다 — 랜드마크는 공개 셸의 것 하나다", async () => {
    const { container } = await doc();
    expect(container.querySelectorAll("main")).toHaveLength(0);
  });
});

describe("PrivacyDoc — 그릇 (시안 1e)", () => {
  it("컨테이너 1120 · 본문 720 + 목차 200 · 간격 64 · 상하 120", async () => {
    const { container } = await doc();
    const grid = container.firstElementChild;
    expect(grid?.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["mx-auto", "max-w-[1120px]", "px-10", "py-30", "grid", "grid-cols-[minmax(0,720px)_200px]", "justify-between", "gap-16"]),
    );
  });

  it("본문은 16/1.75이고 보조 색이 아니다", async () => {
    const { container } = await doc();
    for (const p of container.querySelectorAll("section p")) {
      expect(p.className).toContain("text-prose");
      expect(p.className).toContain("leading-[1.75]");
      expect(p.className).not.toContain("text-muted-foreground");
    }
  });

  it("첫 절은 48, 이후는 56 위에 선다", async () => {
    const { container } = await doc();
    const tops = [...container.querySelectorAll("section")].map((s) => s.className.split(/\s+/).find((c) => /^mt-/.test(c)));
    expect(tops).toEqual(["mt-12", ...Array(6).fill("mt-14")]);
  });
});

/** QA 이슈 넷(#115–#118) — 시안 Prototype `isPrivacy`와의 차이. `/docs`의 표는 `DocTable` 그대로여야 한다. */
describe("PrivacyDoc — 급 (DESIGN §6.616)", () => {
  const classes = (node: Element | null | undefined) => node?.className.split(/\s+/) ?? [];

  it("h1 36/1.3/600 · h2 24/1.4/600", async () => {
    const { container } = await doc();
    expect(classes(container.querySelector("h1"))).toEqual(expect.arrayContaining(["text-4xl", "leading-[1.3]", "font-semibold"]));
    const headings = [...container.querySelectorAll("h2")];
    expect(headings).toHaveLength(privacy.sections.length);
    for (const h2 of headings) expect(classes(h2)).toEqual(expect.arrayContaining(["text-2xl", "leading-[1.4]", "font-semibold"]));
  });

  /** 하드 해시 착지(`scroll-mt-12`)와 목차 클릭 착지(`privacy-toc.test.tsx`의 `top − 48`)가 같은 48이어야 한다. */
  it("절 제목이 스크롤러 윗변 48 아래에 착지한다(`scroll-mt-12`)", async () => {
    const { container } = await doc();
    for (const h2 of container.querySelectorAll("h2")) expect(classes(h2)).toContain("scroll-mt-12");
  });

  it("구분선이 도입 아래 40이다", async () => {
    const { container } = await doc();
    expect(classes(container.querySelector("hr"))).toEqual(expect.arrayContaining(["border-border", "mt-10"]));
  });

  it("표 머리 13 muted · 셀 행간 1.6", async () => {
    const { container } = await doc();
    const regions = [...container.querySelectorAll('[role="region"]')];
    expect(regions).toHaveLength(2);
    for (const region of regions) {
      expect(classes(region)).toEqual(expect.arrayContaining(["[&_th]:text-xs", "[&_th]:text-muted-foreground", "[&_td]:leading-[1.6]"]));
    }
  });

  it("목차 — sticky 48 · 제목 13/500 · 항목 13/1.5 · 6/0/6/12", async () => {
    const { container } = await doc();
    const nav = find(container, "nav");
    expect(classes(nav)).toEqual(expect.arrayContaining(["sticky", "top-12", "self-start"]));
    expect(classes(document.getElementById(nav.getAttribute("aria-labelledby") ?? ""))).toEqual(expect.arrayContaining(["text-xs", "font-medium"]));
    const links = [...nav.querySelectorAll("a")];
    expect(links.length).toBe(privacy.sections.length);
    for (const a of links) expect(classes(a)).toEqual(expect.arrayContaining(["text-xs", "leading-[1.5]", "py-1.5", "pr-0", "pl-3"]));
  });
});

describe("PrivacyDoc — 시안 대조 교정", () => {
  const classes = (node: Element | null | undefined) => node?.className.split(/\s+/) ?? [];

  it("#115 표 래퍼 radius가 12다(`rounded-lg`) — `rounded-xl`은 16이다", async () => {
    const { container } = await doc();
    for (const region of container.querySelectorAll('[role="region"]')) {
      expect(classes(region)).toContain("rounded-lg");
      expect(classes(region)).not.toContain("rounded-xl");
    }
  });

  it("#116 머리 칸 10/16 · 행간 1.6, 셀·머리 자간 0.015em", async () => {
    const { container } = await doc();
    for (const region of container.querySelectorAll('[role="region"]')) {
      expect(classes(region)).toEqual(
        expect.arrayContaining(["[&_th]:py-2.5", "[&_th]:px-4", "[&_th]:leading-[1.6]", "[&_:is(th,td)]:tracking-[0.015em]"]),
      );
    }
  });

  /** 폭은 열 수에서 온다 — 방침 문구를 보지 않는다. 3열 표만 34% / 26% / 나머지다. */
  it("#116 3열 표의 열 폭이 34% / 26% / 나머지다", async () => {
    const { container } = await doc();
    const regions = [...container.querySelectorAll('[role="region"]')];
    expect(regions.map((r) => r.querySelectorAll("thead th").length)).toEqual([3, 3]);
    for (const region of regions) {
      expect(classes(region)).toEqual(expect.arrayContaining(["[&_th:nth-child(1)]:w-[34%]", "[&_th:nth-child(2)]:w-[26%]"]));
    }
  });

  it("#117 목차는 짧은 라벨이 있으면 그것을, 없으면 절 제목을 쓴다", async () => {
    const { container } = await doc();
    const links = [...find(container, "nav").querySelectorAll("a")];
    expect(links.map((a) => a.textContent)).toEqual(
      privacy.sections.map((s) => (Object.hasOwn(privacy.tocLabels, s.id) ? privacy.tocLabels[s.id as keyof typeof privacy.tocLabels] : s.heading)),
    );
    expect(links.find((a) => a.getAttribute("href") === "#deletion")?.textContent).toBe("Deleting your data");
    // 절 제목은 그대로다 — 본문(해시 대상)은 바뀌지 않는다.
    expect(container.querySelector("h2#deletion")?.textContent).toBe(privacy.sections.find((s) => s.id === "deletion")?.heading);
  });

  it("#118 절 문단도 도입처럼 `text-pretty`다", async () => {
    const { container } = await doc();
    for (const p of container.querySelectorAll("section p")) expect(classes(p)).toContain("text-pretty");
  });
});
