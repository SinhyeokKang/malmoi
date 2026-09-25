// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/components/__tests__/helpers/dom";
import type { SessionRead } from "@/lib/auth/read-session";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";

/**
 * **루트(`/`)의 세 갈래** (landing T7) — `ok`는 여전히 `/projects`(2026-09-10 결정), `none`·`unavailable`은 랜딩이다.
 *
 * ⚠️ `unavailable`도 랜딩이다(옛: `/signin?error=Unavailable`) — 공개 화면이 세션 장애로 안 열리는 것이 더 나쁘다.
 * 장애 신호는 보호 라우트의 `rejectTarget`이 계속 든다(`lib/auth/__tests__/landing.test.ts`).
 */
const mocks = vi.hoisted(() => ({
  status: "none" as SessionRead["status"],
  redirect: vi.fn((to: string) => { throw new Error(`NEXT_REDIRECT ${to}`); }),
}));

vi.mock("@/lib/auth/read-session", () => ({ readSession: async () => ({ status: mocks.status }) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

beforeEach(() => {
  mocks.redirect.mockClear();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});

async function page(status: SessionRead["status"]) {
  mocks.status = status;
  const { default: Root } = await import("@/app/page");
  return Root();
}

describe("`/` — 세션이 있으면 여전히 프로젝트 목록이다", () => {
  it("`ok` → `/projects`로 redirect하고 랜딩을 그리지 않는다", async () => {
    await expect(page("ok")).rejects.toThrow(`NEXT_REDIRECT ${routes.projects()}`);
    expect(mocks.redirect).toHaveBeenCalledWith(routes.projects());
  });
});

describe.each(["none", "unavailable"] as const)("`/` — `%s`는 랜딩이다", (status) => {
  it("본문 랜드마크 하나 · 히어로 h1 · 섹션 이름 · CTA가 `/signin`", async () => {
    const { container } = await render(await page(status));
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(container.querySelectorAll("main")).toHaveLength(1);

    const h1 = container.querySelector("h1");
    expect(h1?.textContent).toBe(m.landing.hero.title.join(""));
    expect(container.querySelectorAll("h1 br")).toHaveLength(1);
    expect(container.querySelector("[aria-label='How Malmoi works']")).not.toBeNull();

    // 섹션마다 이름이 있다(POSTMORTEM 2026-09-15) — 히어로·CTA는 자기 제목으로.
    for (const section of container.querySelectorAll("section")) {
      const named = section.hasAttribute("aria-label") || (section.getAttribute("aria-labelledby") ?? "") !== "";
      expect(named).toBe(true);
      const labelledBy = section.getAttribute("aria-labelledby");
      if (labelledBy) expect(container.querySelector(`[id="${labelledBy}"]`)).not.toBeNull();
    }

    const closing = container.querySelector("h2");
    expect(closing?.textContent).toBe(m.landing.closing.title);

    const starts = [...container.querySelectorAll("main a")].filter((a) => a.textContent === m.landing.shell.getStarted);
    // 히어로 · 마무리 CTA — 헤더의 것은 `<main>` 밖이다.
    expect(starts).toHaveLength(2);
    for (const a of starts) expect(a.getAttribute("href")).toBe(routes.signIn());
    const docs = [...container.querySelectorAll("main a")].filter((a) => a.textContent === m.landing.shell.docs);
    expect(docs.map((a) => a.getAttribute("href"))).toEqual([routes.docs()]);
  });

  it("목업 프레임은 `aria-hidden`이고 캡션 다섯은 숨은 `<ol>`이 든다", async () => {
    const { container } = await render(await page(status));
    expect(container.querySelector("[data-landing-frame]")?.getAttribute("aria-hidden")).toBe("true");
    expect([...container.querySelectorAll("ol li")].map((li) => li.textContent)).toEqual([...m.landing.stage.captions]);
  });
});
