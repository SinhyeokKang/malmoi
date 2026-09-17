// @vitest-environment jsdom
import { act, Suspense, useState, type ComponentProps, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { find, render } from "./helpers/dom";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
// Keep React transitions real; only replace the framework's navigation dispatch.
vi.mock("next/link", () => ({
  default: ({ href, onNavigate, children, ...props }: Omit<ComponentProps<"a">, "href"> & {
    href: string; children: ReactNode; onNavigate?: (event: { preventDefault(): void }) => void;
  }) => <a {...props} href={href} onClick={(event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    let prevented = false;
    onNavigate?.({ preventDefault: () => { prevented = true; } });
    if (!prevented) navigation.push(href);
  }}>{children}</a>,
}));

import { NewProjectButton } from "@/components/projects/new-project-button";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";

beforeEach(() => navigation.push.mockReset());

it.each([undefined, "hello & 말모이"])("검색 %s를 유지하며 모달 도착까지 로딩하고 중복 전환을 막는다", async (q) => {
  let ready = false;
  let finish = () => {};
  const waiting = new Promise<void>((resolve) => { finish = resolve; });
  function Destination({ active }: { active: boolean }) {
    if (!active) return null;
    if (!ready) throw waiting;
    return <div role="dialog">New project modal</div>;
  }
  function Harness() {
    const [active, setActive] = useState(false);
    navigation.push.mockImplementation(() => setActive(true));
    return <Suspense fallback={<p>Loading route</p>}>
      <NewProjectButton q={q} />
      <Destination active={active} />
    </Suspense>;
  }
  const { container } = await render(<Harness />);
  const link = find<HTMLAnchorElement>(container, "a");
  expect(link.getAttribute("href")).toBe(routes.newProject({ q }));
  expect(link.textContent).toBe(m.common.nav.newProject);
  expect(link.querySelector(".animate-spin")).toBeNull();
  await act(async () => link.click());
  expect(link.getAttribute("aria-busy")).toBe("true");
  expect(link.getAttribute("aria-disabled")).toBe("true");
  expect(link.querySelector(".animate-spin")).not.toBeNull();
  expect(link.querySelector(".lucide-plus")).toBeNull();
  expect(link.textContent).toBe(m.common.nav.newProject);
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => link.click());
  expect(navigation.push).toHaveBeenCalledExactlyOnceWith(routes.newProject({ q }));
  await act(async () => { ready = true; finish(); await waiting; });
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  expect(link.getAttribute("aria-busy")).not.toBe("true");
  expect(link.getAttribute("aria-disabled")).not.toBe("true");
  expect(link.querySelector(".animate-spin")).toBeNull();
  expect(link.querySelector(".lucide-plus")).not.toBeNull();
});
