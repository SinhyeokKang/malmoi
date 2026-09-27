// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/components/__tests__/helpers/dom";
import type { SessionRead } from "@/lib/auth/read-session";
import { m } from "@/lib/i18n";
import { FOOTER_LINKS } from "@/lib/links";
import { routes } from "@/lib/routes";

/**
 * **`/privacy`는 공개 셸 안에 선다** (DESIGN §6.616). 세션은 차단이 아니라 **헤더 primary 하나**를 가른다 —
 * 로그인이면 `Open Malmoi`, 아니면(장애 포함) `Get started`.
 */
const mocks = vi.hoisted(() => ({ status: "none" as SessionRead["status"] }));

vi.mock("@/lib/auth/read-session", () => ({ readSession: async () => ({ status: mocks.status }) }));

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => { vi.unstubAllGlobals(); });

async function page(status: SessionRead["status"]) {
  mocks.status = status;
  const { default: Privacy } = await import("@/app/privacy/page");
  return render(await Privacy());
}

const primary = (container: HTMLElement) => {
  const link = container.querySelector("header > div a");
  return [link?.textContent, link?.getAttribute("href")];
};

describe("`/privacy` — 헤더 primary가 세션으로 갈린다", () => {
  it("`ok` → Open Malmoi · `/projects`", async () => {
    const { container } = await page("ok");
    expect(primary(container)).toEqual([m.landing.shell.openMalmoi, routes.projects()]);
  });

  it.each(["none", "unavailable"] as const)("`%s` → Get started · `/signin`", async (status) => {
    const { container } = await page(status);
    expect(primary(container)).toEqual([m.landing.shell.getStarted, routes.signIn()]);
  });
});

describe("`/privacy` — 공개 셸", () => {
  it("본문 랜드마크 하나 안에 방침이 서고, 헤더 링크 어느 것도 current가 아니다", async () => {
    const { container } = await page("none");
    const main = container.querySelectorAll("main");
    expect(main).toHaveLength(1);
    expect(main[0]?.querySelector("h1")?.textContent).toBe(m.publicDocs.privacy.title);
    expect(container.querySelectorAll("header [aria-current]")).toHaveLength(0);
  });

  it("푸터가 공개 셸의 링크 목록이다", async () => {
    const { container } = await page("none");
    expect([...container.querySelectorAll("footer a")].map((a) => a.getAttribute("href"))).toEqual(FOOTER_LINKS.map(({ href }) => href));
  });
});
