// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

/**
 * ⚠️ **위의 `next/link` mock은 구현의 전제를 스스로 정의한다** — "수정키 클릭에는 `onNavigate`가
 * 안 불린다"도, "`preventDefault()`가 Next의 이동을 취소한다"도 mock이 그렇게 써서 참이 된다.
 * 그 둘이 거짓이면 새 탭 클릭이 죽거나 이동이 두 번 일어나는데, **위 테스트는 전부 green이다.**
 *
 * 그래서 전제를 **설치된 Next 소스**에 고정한다(`budget.test.ts`가 `yaml` 내부에 하는 것과 같은
 * 계보다). 공개 API가 아니므로 버전이 올라가면 조용히 모양이 바뀌고, **그때 red를 내는 자리가
 * 여기뿐이다** — 그 red는 "Next가 깨졌다"가 아니라 "mock을 다시 보라"는 신호다.
 */
it("Next Link의 수정키·preventDefault 전제가 설치된 버전에서 유지된다", () => {
  // ⚠️ `import.meta.url`로 루트를 잡지 않는다 — 이 파일은 jsdom이라 그 값이 `file:`이 아니고
  //    `fileURLToPath`가 던진다(node 환경인 `projects-screen.test.ts`와 갈리는 지점이다).
  const source = readFileSync(join(process.cwd(), "node_modules/next/dist/client/app-dir/link.js"), "utf8");
  const from = source.indexOf("function linkClicked");
  expect(from).toBeGreaterThan(-1);
  const body = source.slice(from, source.indexOf("\nfunction ", from + 1));
  const skipsModified = body.indexOf("isModifiedEvent(e)");
  const callsOnNavigate = body.indexOf("onNavigate({");
  expect(skipsModified).toBeGreaterThan(-1);
  // ⚠️ 순서가 계약이다 — 수정키 조기 return이 `onNavigate` 호출보다 **앞**이어야 새 탭이 산다.
  expect(callsOnNavigate).toBeGreaterThan(skipsModified);
  // 그 호출이 넘긴 `preventDefault`를 Next가 실제로 읽어 dispatch를 접는다.
  expect(body).toContain("isDefaultPrevented");
});
