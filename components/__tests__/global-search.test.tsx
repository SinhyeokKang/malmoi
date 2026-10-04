// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
let SearchTrigger: typeof import("@/components/search/search-trigger").SearchTrigger;
import type { NavProject } from "@/lib/shell/nav";
import type { KeyHit } from "@/lib/search/key-href";
import { find, input, key, render } from "./helpers/dom";
import { Toc } from "@/components/public-doc-toc";
import { NavigationDim } from "@/components/shell/navigation-dim";

vi.setConfig({ testTimeout: 20_000 });
const mocks = vi.hoisted(() => ({ keys: vi.fn(), memberships: vi.fn(), fetch: vi.fn(), pathRead: vi.fn(), pathname: "/docs/start" }));
vi.mock("@/app/search/actions", () => ({ searchKeysAction: mocks.keys, loadSearchMembershipsAction: mocks.memberships }));
vi.mock("next/navigation", () => ({ usePathname: () => { mocks.pathRead(); return mocks.pathname; } }));
const account = { name: "Tester", email: null, image: null };
const demo: NavProject = { slug: "demo", name: "Demo", role: "OWNER", archived: false, image: null, defaultSurfaceSlug: "web" };
const docs = [{ id: "doc:start", title: "Start", href: "/docs/start", body: "Learn settings demo and publishing" }, { id: "doc:publish", title: "Publishing", href: "/docs/start#publish", body: "Publish translations", anchor: "publish" }];
const hit = (id: string, patch: Partial<KeyHit> = {}): KeyHit => ({ id, key: id, namespace: "_root", sourceText: "Source", surfaceSlug: "web", slug: "demo", name: "Demo", inKey: true, localeCode: null, value: null, ...patch });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve: async (value: T) => { await act(async () => resolve(value)); } }; }
const dialog = () => document.querySelector('[role="dialog"]');
const query = () => find<HTMLInputElement>(document.body, '[role="combobox"]');
const opener = () => find<HTMLButtonElement>(document.body, 'button[aria-label="Search"]');
const options = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')];
const group = (label: string) => [...document.querySelectorAll<HTMLElement>('[role="group"]')].find(el => el.firstElementChild?.textContent === label);
async function open() { await act(async () => { await userEvent.setup().click(opener()); }); }
async function close() { await key(query(), "Escape"); await vi.waitFor(() => expect(dialog()).toBeNull()); }
async function tick(ms = 250) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
beforeEach(async () => { mocks.pathRead.mockReset(); vi.resetModules(); SearchTrigger = (await import("@/components/search/search-trigger")).SearchTrigger; mocks.keys.mockReset().mockResolvedValue({ ok: true, hits: [] }); mocks.memberships.mockReset().mockResolvedValue({ ok: true, memberships: [demo] }); mocks.fetch.mockReset().mockResolvedValue({ ok: true, json: async () => ({ docs }) }); vi.stubGlobal("fetch", mocks.fetch); vi.stubGlobal("matchMedia", (media: string) => ({ media, matches: false, addEventListener() {}, removeEventListener() {} })); mocks.pathname = "/docs/start"; window.history.replaceState(null, "", "/docs/start"); Object.defineProperty(navigator, "platform", { configurable: true, value: "MacIntel" }); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("capsule labels, initial input focus, preview and public anonymous boundaries", async () => {
  await render(<SearchTrigger account={null} />); expect(opener().getAttribute("aria-haspopup")).toBe("dialog"); expect(opener().getAttribute("aria-keyshortcuts")).toBe("Meta+K"); expect(opener().textContent).toContain("Search…"); expect(opener().getAttribute("aria-expanded")).toBe("false"); await open(); expect(opener().getAttribute("aria-expanded")).toBe("true"); expect(document.activeElement).toBe(query()); expect(query().hasAttribute("data-initial-focus")).toBe(true); expect(group("Projects")).toBeUndefined(); expect(group("Keys")).toBeUndefined(); expect(group("Pages")).toBeUndefined(); expect([...document.querySelectorAll('[role="group"]')].map(el => el.firstElementChild?.textContent)).toEqual(["Docs"]); expect(group("Docs")?.textContent).toContain("Go to docs"); expect(document.body.textContent).not.toContain("Changelog"); expect(mocks.memberships).not.toHaveBeenCalled(); await close(); await vi.waitFor(() => expect(document.activeElement).toBe(opener())); expect(opener().getAttribute("aria-expanded")).toBe("false");
});
it("app membership preview reuses supplied rows without loading memberships", async () => {
  mocks.pathname = "/projects/demo"; await render(<SearchTrigger account={account} memberships={[demo, { ...demo, slug: "old", name: "Old", archived: true }]} />); await open(); expect(group("Projects")?.textContent).toContain("Go to your projects"); expect(group("Projects")?.textContent).toContain("Archived"); expect(group("Projects")?.querySelector("svg")).not.toBeNull(); expect(group("Pages")?.textContent).toContain("Home"); expect(mocks.memberships).not.toHaveBeenCalled(); expect(group("Keys")).toBeUndefined();
});
it("signed-in zero projects preview keeps work pages and docs", async () => { await render(<SearchTrigger account={account} memberships={[]} />); await open(); expect(group("Projects")).toBeUndefined(); expect(group("Pages")?.textContent).toContain("MCP connector"); expect(group("Docs")?.textContent).toContain("Go to docs"); });
it("public membership refresh per opening replaces creation, archive and role changes", async () => {
  const view = await render(<SearchTrigger account={account} />); expect(mocks.memberships).not.toHaveBeenCalled(); await open(); expect(mocks.memberships).toHaveBeenCalledTimes(1); await input(query(), "demo"); await view.rerender(<SearchTrigger account={account} />); expect(mocks.memberships).toHaveBeenCalledTimes(1); await close(); const fresh = deferred<{ ok: true; memberships: NavProject[] }>(); mocks.memberships.mockReturnValueOnce(fresh.promise); await open(); expect(mocks.memberships).toHaveBeenCalledTimes(2); expect(group("Projects")).toBeUndefined(); expect(document.body.textContent).toContain("Loading projects…"); await fresh.resolve({ ok: true, memberships: [{ ...demo, archived: true, role: "EDITOR" }, { ...demo, slug: "new", name: "Created" }] }); expect(group("Projects")?.textContent).toContain("Created"); expect(group("Projects")?.textContent).toContain("Archived"); await input(query(), "settings demo"); expect(group("Pages")).toBeUndefined(); await close(); mocks.pathname = "/privacy"; await view.rerender(<SearchTrigger account={account} />); await open(); expect(mocks.memberships).toHaveBeenCalledTimes(3); expect(mocks.fetch).toHaveBeenCalledOnce(); expect(mocks.fetch).toHaveBeenCalledWith("/api/search-index/en");
});
it("closed and reopened membership generations ignore the old response", async () => { const old = deferred<{ ok: true; memberships: NavProject[] }>(); const fresh = deferred<{ ok: true; memberships: NavProject[] }>(); mocks.memberships.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise); await render(<SearchTrigger account={account} />); await open(); await close(); await open(); await fresh.resolve({ ok: true, memberships: [{ ...demo, name: "Fresh" }] }); await old.resolve({ ok: true, memberships: [{ ...demo, name: "Stale" }] }); expect(group("Projects")?.textContent).toContain("Fresh"); expect(document.body.textContent).not.toContain("Stale"); });
it.each([["unauthorized", "Your session ended. Sign in again to search your projects."], ["unavailable", "Projects can't be searched right now. Reopen search to try again."]] as const)("membership %s shows its status line, searches Docs only and skips key search", async (error, line) => { mocks.memberships.mockResolvedValue({ ok: false, error }); await render(<SearchTrigger account={account} />); await open(); await vi.waitFor(() => expect(document.body.textContent).toContain(line)); const status = [...document.querySelectorAll<HTMLElement>('[role="status"] [data-tone]')].find(el => el.textContent === line); expect(status?.dataset.tone).toBe("danger"); expect(status?.classList.contains("text-destructive")).toBe(true); expect([...document.querySelectorAll('[role="group"]')].map(el => el.firstElementChild?.textContent)).toEqual(["Docs"]); vi.useFakeTimers({ shouldAdvanceTime: true }); await input(query(), "demo"); await tick(); expect(group("Projects")).toBeUndefined(); expect(group("Pages")).toBeUndefined(); expect(mocks.keys).not.toHaveBeenCalled(); });
it("pages use token AND immediately, keys send the whole trimmed bounded query at 250ms", async () => { await render(<SearchTrigger account={account} memberships={[demo]} />); await open(); vi.useFakeTimers({ shouldAdvanceTime: true }); const timer = vi.spyOn(globalThis, "setTimeout"); await input(query(), "settings demo"); expect(group("Pages")?.textContent).toContain("Settings"); expect(group("Pages")?.querySelectorAll("mark").length).toBe(2); expect(mocks.keys).not.toHaveBeenCalled(); expect(timer).toHaveBeenCalledWith(expect.any(Function), 250); await tick(); expect(mocks.keys).toHaveBeenCalledWith("settings demo", null); await input(query(), "  a "); await tick(); expect(mocks.keys).toHaveBeenCalledTimes(1); await input(query(), "x".repeat(201)); await tick(); expect(mocks.keys).toHaveBeenLastCalledWith("x".repeat(200), null); });
it("ABA key request race and old pending debounce cannot overwrite current results", async () => { const a = deferred<{ ok: true; hits: KeyHit[] }>(); const b = deferred<{ ok: true; hits: KeyHit[] }>(); const fresh = deferred<{ ok: true; hits: KeyHit[] }>(); mocks.keys.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise).mockReturnValueOnce(fresh.promise); await render(<SearchTrigger account={account} memberships={[demo]} />); await open(); vi.useFakeTimers({ shouldAdvanceTime: true }); await input(query(), "alpha"); await tick(); await input(query(), "beta"); await tick(); await input(query(), "alpha"); await tick(); await fresh.resolve({ ok: true, hits: [hit("Fresh-alpha")] }); await a.resolve({ ok: true, hits: [hit("Old-alpha")] }); await b.resolve({ ok: true, hits: [hit("Old-beta")] }); expect(group("Keys")?.textContent).toContain("Fresh-alpha"); expect(document.body.textContent).not.toContain("Old-"); });
it("key failure leaves local groups, status outside listbox and no pending empty state", async () => { const response = deferred<{ ok: false; error: "unavailable" }>(); mocks.keys.mockReturnValueOnce(response.promise); await render(<SearchTrigger account={account} memberships={[demo]} />); await open(); vi.useFakeTimers({ shouldAdvanceTime: true }); await input(query(), "demo"); expect(document.body.textContent).toContain("Loading keys…"); expect(document.body.textContent).not.toContain("No results"); await tick(); await response.resolve({ ok: false, error: "unavailable" }); expect(group("Projects")?.textContent).toContain("Demo"); expect(document.body.textContent).toContain("Keys can't be searched right now. Edit your search to try again."); expect(document.body.textContent).not.toContain("No results"); expect(find(document.body, '[role="listbox"]').querySelector('[role="status"]')).toBeNull(); });
it("key search session end says so instead of the unavailable line", async () => { mocks.keys.mockResolvedValue({ ok: false, error: "unauthorized" }); await render(<SearchTrigger account={account} memberships={[demo]} />); await open(); vi.useFakeTimers({ shouldAdvanceTime: true }); await input(query(), "unmatched"); await tick(); await vi.waitFor(() => expect(document.body.textContent).toContain("Your session ended. Sign in again to search your projects.")); expect(document.body.textContent).not.toContain("Keys can't be searched"); expect(document.body.textContent).not.toContain("No results"); });
it("docs failure can retry next opening and zero settled hits has no exit button", async () => { mocks.fetch.mockRejectedValueOnce(new Error("offline")); await render(<SearchTrigger account={null} />); await open(); expect(document.body.textContent).toContain("Docs can't be searched right now. Reopen search to try again."); await input(query(), "unmatched"); expect(document.body.textContent).not.toContain('No results for “unmatched”'); expect([...dialog()!.querySelectorAll("button")].map(button => button.getAttribute("aria-label"))).toEqual(["Clear search"]); await close(); await open(); expect(mocks.fetch).toHaveBeenCalledTimes(2); });
it("settled zero results put NoMatch at the top of the list slot, before the listbox", async () => { await render(<SearchTrigger account={null} />); await open(); await vi.waitFor(() => expect(document.body.textContent).not.toContain("Loading docs…")); await input(query(), "unmatched"); const title = [...dialog()!.querySelectorAll("*")].find(el => el.children.length === 0 && el.textContent === "No results for “unmatched”"); expect(title).toBeDefined(); const listbox = find(document.body, '[role="listbox"]'); expect(title!.compareDocumentPosition(listbox) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); expect(listbox.contains(title!)).toBe(false); });
// #177 — 0건 블록은 목록 슬롯의 위 여백(`py-2`의 8) 안에 선다. 목록 밖 형제라 같은 8을 블록이 직접 든다.
it("settled zero results sit inside the list slot's top padding", async () => { await render(<SearchTrigger account={null} />); await open(); await vi.waitFor(() => expect(document.body.textContent).not.toContain("Loading docs…")); await input(query(), "unmatched"); const title = [...dialog()!.querySelectorAll("*")].find(el => el.children.length === 0 && el.textContent === "No results for “unmatched”")!; const block = title.closest(".p-8")!; expect(block.classList.contains("mt-2")).toBe(true); expect(find(document.body, '[role="listbox"]').classList.contains("py-2")).toBe(true); });
it("pending docs show status without NoMatch while local results are immediately usable", async () => { const response = deferred<{ ok: true; json: () => Promise<{ docs: typeof docs }> }>(); mocks.fetch.mockReturnValueOnce(response.promise); await render(<SearchTrigger account={account} memberships={[demo]} />); await open(); expect(group("Projects")?.textContent).toContain("Demo"); expect(document.body.textContent).toContain("Loading docs…"); await input(query(), "absent"); expect(document.body.textContent).not.toContain("No results"); await response.resolve({ ok: true, json: async () => ({ docs }) }); });
it.each(["double  space", "tab\tspace", "line\nbreak"])("original whole-string %j remains highlighted and description has normal collapsing nowrap CSS", async literal => { mocks.keys.mockResolvedValue({ ok: true, hits: [hit("key", { inKey: false, sourceText: "prefix ".repeat(50) + literal + " end", localeCode: "ko", value: "prefix ".repeat(50) + literal + " end" })] }); await render(<SearchTrigger account={account} memberships={[demo]} />); await open(); vi.useFakeTimers({ shouldAdvanceTime: true }); if (literal.includes("\n")) {
    // HTML single-line inputs strip LF. Inject the actual React consumer value to prove literal highlighting independently of browser editing.
    Object.defineProperty(query(), "value", { configurable: true, get: () => literal });
    await act(async () => { query().dispatchEvent(new Event("input", { bubbles: true })); });
  } else await input(query(), literal);
  await tick(); const result = group("Keys"); expect(result).toBeDefined(); const mark = find<HTMLElement>(result!, "mark"); expect(mark.textContent).toBe(literal); const description = mark.closest(".whitespace-nowrap"); expect(description).not.toBeNull(); expect(description!.className).not.toMatch(/whitespace-pre/); expect(result?.querySelector('[data-search-locale]')?.textContent).toBe("ko"); });
it("key-only hit shows source introduction; original and docs later matches get snippet marks", async () => { mocks.keys.mockResolvedValue({ ok: true, hits: [hit("Publish", { sourceText: "Introduction" }), hit("source", { inKey: false, sourceText: "prefix ".repeat(100) + "Publish" })] }); await render(<SearchTrigger account={account} memberships={[demo]} />); await open(); vi.useFakeTimers({ shouldAdvanceTime: true }); await input(query(), "publish"); await tick(); expect(group("Keys")?.textContent).toContain("Introduction"); expect(group("Keys")?.querySelectorAll("mark").length).toBe(2); expect(group("Docs")?.querySelector("mark")?.textContent?.toLowerCase()).toBe("publish"); });
// 활성은 사용자가 옮기기 전엔 첫 행을 따른다 — 늦게 온 Keys가 Docs 위에 끼면 활성도 Keys 첫 행이다(2026-10-03 사용자).
it("late Keys insertion before any move makes the first Keys row active and Enter clicks it", async () => { const response = deferred<{ ok: true; hits: KeyHit[] }>(); mocks.keys.mockReturnValueOnce(response.promise); await render(<SearchTrigger account={account} memberships={[demo]} />); await open(); vi.useFakeTimers({ shouldAdvanceTime: true }); await input(query(), "publishing"); const first = document.getElementById(query().getAttribute("aria-activedescendant")!); expect(first?.textContent).toContain("Publishing"); await tick(); await response.resolve({ ok: true, hits: [hit("publishing-key")] }); const option = document.getElementById(query().getAttribute("aria-activedescendant")!); expect(group("Keys")?.contains(option)).toBe(true); const link = find<HTMLAnchorElement>(option!, "a"); const click = vi.spyOn(link, "click"); await key(query(), "Enter"); expect(click).toHaveBeenCalledOnce(); expect(dialog()).toBeNull(); });
it("late Keys insertion after the user moved preserves that Docs ID and Enter clicks that real link", async () => { const response = deferred<{ ok: true; hits: KeyHit[] }>(); mocks.keys.mockReturnValueOnce(response.promise); await render(<SearchTrigger account={account} memberships={[demo]} />); await open(); vi.useFakeTimers({ shouldAdvanceTime: true }); await input(query(), "publishing"); await key(query(), "ArrowDown"); const id = query().getAttribute("aria-activedescendant")!; const option = document.getElementById(id); expect(option).not.toBeNull(); expect(group("Docs")?.contains(option)).toBe(true); const link = find<HTMLAnchorElement>(option!, "a"); const click = vi.spyOn(link, "click"); await tick(); await response.resolve({ ok: true, hits: [hit("publishing-key")] }); expect(query().getAttribute("aria-activedescendant")).toBe(id); await key(query(), "Enter"); expect(click).toHaveBeenCalledOnce(); expect(dialog()).toBeNull(); });
// 첫 열림 미리보기 — 공개 셸에서 Docs가 늦게 와도 활성은 첫 Docs 행이다(`Go to docs`에 머물지 않는다).
it("public first opening keeps the first Docs row active when Docs arrive late", async () => { const response = deferred<{ ok: true; json: () => Promise<{ docs: typeof docs }> }>(); mocks.fetch.mockReturnValueOnce(response.promise); await render(<SearchTrigger account={null} />); await open(); const before = document.getElementById(query().getAttribute("aria-activedescendant")!); expect(before?.querySelector("a")?.getAttribute("href")).toBe("/docs"); await response.resolve({ ok: true, json: async () => ({ docs }) }); await vi.waitFor(() => expect(group("Docs")?.querySelectorAll('[role="option"]').length).toBeGreaterThan(1)); const active = document.getElementById(query().getAttribute("aria-activedescendant")!); expect(active).toBe(group("Docs")?.querySelector('[role="option"]')); expect(active?.querySelector("a")?.getAttribute("href")).toBe("/docs/start"); });
it("actual IME composition and native composing Escape/Enter keep dialog and input focus", async () => { await render(<SearchTrigger account={null} />); await open(); await act(async () => { query().dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })); }); await key(query(), "Escape"); await key(query(), "Enter"); expect(dialog()).not.toBeNull(); expect(document.activeElement).toBe(query()); await act(async () => { query().dispatchEvent(new CompositionEvent("compositionend", { bubbles: true })); }); await key(query(), "Escape", { isComposing: true }); expect(dialog()).not.toBeNull(); await key(query(), "Escape", { keyCode: 229 }); expect(dialog()).not.toBeNull(); await close(); });
it("same-doc hash selection lands heading after close without trigger focus restoration", async () => { await render(<><div data-public-scroller><h2 id="publish" tabIndex={-1}>Publish heading</h2></div><SearchTrigger account={null} /></>); const scroller = find<HTMLElement>(document.body, '[data-public-scroller]'); scroller.scrollTo = vi.fn(); const scroll = vi.spyOn(scroller, "scrollTo"); await open(); await input(query(), "publish"); const link = find<HTMLAnchorElement>(group("Docs")!, 'a[href="/docs/start#publish"]'); await act(async () => link.click()); expect(dialog()).toBeNull(); await vi.waitFor(() => expect(document.activeElement).toBe(document.getElementById("publish"))); expect(scroll).toHaveBeenCalledWith({ top: -48, behavior: "smooth" }); expect(window.location.hash).toBe("#publish"); });
it("shortcuts respect platform, editing targets, existing dialog and menu", async () => { const view = await render(<SearchTrigger account={null} />); await key(document.body, "k", { ctrlKey: true }); expect(dialog()).toBeNull(); const area = document.createElement("textarea"); document.body.append(area); area.focus(); await key(area, "k", { metaKey: true }); expect(dialog()).toBeNull(); area.remove(); const menu = document.createElement("div"); menu.setAttribute("role", "menu"); document.body.append(menu); await key(document.body, "k", { metaKey: true }); expect(dialog()).toBeNull(); menu.remove(); await key(document.body, "k", { metaKey: true, isComposing: true }); expect(dialog()).toBeNull(); await key(document.body, "k", { metaKey: true }); expect(dialog()).not.toBeNull(); await key(query(), "k", { metaKey: true }); expect(dialog()).not.toBeNull(); await close(); Object.defineProperty(navigator, "platform", { configurable: true, value: "Win32" }); await view.rerender(<SearchTrigger account={null} />); await key(document.body, "k", { ctrlKey: true }); expect(dialog()).not.toBeNull(); });


it("server markup reserves shortcut space without platform text or attribute", () => {
  const html = renderToStaticMarkup(<SearchTrigger account={null} />);
  expect(html).not.toContain("aria-keyshortcuts");
  expect(html).not.toContain("⌘K");
  expect(html).not.toContain("Ctrl K");
  expect(html).toContain("w-16");
});

it("an edit with unchanged normalized query invalidates and replaces the pending request", async () => {
  const old = deferred<{ ok: true; hits: KeyHit[] }>();
  const fresh = deferred<{ ok: true; hits: KeyHit[] }>();
  mocks.keys.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
  await render(<SearchTrigger account={account} memberships={[demo]} />);
  await open();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  await input(query(), "alpha"); await tick();
  await input(query(), "alpha "); await tick();
  expect(mocks.keys).toHaveBeenCalledTimes(2);
  await fresh.resolve({ ok: true, hits: [hit("Fresh-alpha")] });
  await old.resolve({ ok: true, hits: [hit("Stale-alpha")] });
  expect(group("Keys")?.textContent).toContain("Fresh-alpha");
  expect(document.body.textContent).not.toContain("Stale-alpha");
});

it("shortcut ignores an unrelated dialog and contenteditable", async () => {
  await render(<SearchTrigger account={null} />);
  const other = document.createElement("div");
  other.setAttribute("role", "dialog"); document.body.append(other);
  await key(document.body, "k", { metaKey: true }); expect(queryOrNull()).toBeNull();
  other.remove();
  const editor = document.createElement("div"); editor.setAttribute("contenteditable", "true"); document.body.append(editor);
  await key(editor, "k", { metaKey: true }); expect(queryOrNull()).toBeNull(); editor.remove();
});
function queryOrNull() { return document.querySelector('[role="combobox"]'); }


it("StrictMode effect replay still requests public memberships once per opening", async () => {
  await render(<StrictMode><SearchTrigger account={account} /></StrictMode>);
  await open();
  expect(mocks.memberships).toHaveBeenCalledTimes(1);
  await close(); await open();
  expect(mocks.memberships).toHaveBeenCalledTimes(2);
});


it("does not mount route-dependent search content before first opening", async () => {
  await render(<SearchTrigger account={null} />);
  expect(mocks.pathRead).not.toHaveBeenCalled();
  await open();
  expect(mocks.pathRead).toHaveBeenCalled();
});

it("same-doc search replaces the TOC pin for successive targets and normal TOC clicks", async () => {
  const items = [{ id: "alpha", heading: "Alpha" }, { id: "beta", heading: "Beta" }, { id: "gamma", heading: "Gamma" }];
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ docs: items.map(item => ({ id: `doc:${item.id}`, title: item.heading, href: `/docs/start#${item.id}`, anchor: item.id, body: "Section" })) }) });
  const queue: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => queue.push(callback));
  vi.stubGlobal("cancelAnimationFrame", () => {});
  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  const tops: Record<string, number> = { alpha: 200, beta: 800, gamma: 1200 };
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const top = tops[this.id];
    return top === undefined ? originalRect.call(this) : { top: top - (this.closest<HTMLElement>("[data-public-scroller]")?.scrollTop ?? 0) } as DOMRect;
  });
  const flush = async () => { await act(async () => { for (let i = 0; queue.length && i < 10; i++) for (const callback of queue.splice(0)) callback(0); }); };
  const { container } = await render(<><SearchTrigger account={null} /><div data-public-scroller>{items.map(item => <h2 key={item.id} id={item.id} tabIndex={-1}>{item.heading}</h2>)}<Toc label="On this page" items={items} /></div></>);
  const scroller = find<HTMLElement>(container, "[data-public-scroller]");
  Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 600 });
  // Beta도 끝에 닿는다 — 고정을 풀기만 하면 마지막 Gamma가 켜지는 짧은 절 계약이다.
  Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: 1352 });
  scroller.scrollTo = vi.fn((options?: ScrollToOptions | number, y?: number) => { scroller.scrollTop = Math.min(typeof options === "number" ? y ?? 0 : options?.top ?? 0, 752); scroller.dispatchEvent(new Event("scroll")); });
  const current = () => find(container, 'nav a[aria-current="location"]').getAttribute("href");
  await flush();
  await act(async () => { await userEvent.setup().click(find(container, 'nav a[href="#alpha"]')); });
  expect(current()).toBe("#alpha");
  for (const [id, how, top] of [["beta", "pointer", 752], ["alpha", "Enter", 152]] as const) {
    await open();
    expect(document.activeElement).toBe(query());
    await input(query(), id);
    const link = find<HTMLAnchorElement>(group("Docs")!, `a[href="/docs/start#${id}"]`);
    const clicked = vi.spyOn(link, "click");
    if (how === "Enter") await key(query(), "Enter"); else await act(async () => link.click());
    expect(clicked).toHaveBeenCalledOnce();
    expect(dialog()).toBeNull();
    await vi.waitFor(() => expect(document.activeElement?.id).toBe(id));
    await flush();
    expect(window.location.hash).toBe(`#${id}`);
    expect(scroller.scrollTop).toBe(top);
    expect(scroller.scrollTo).toHaveBeenLastCalledWith({ top: top, behavior: "smooth" });
    expect(current()).toBe(`#${id}`);
  }
  await act(async () => { await userEvent.setup().click(find(container, 'nav a[href="#beta"]')); });
  await flush();
  expect(current()).toBe("#beta");
  expect(document.activeElement?.id).toBe("beta");
  await act(async () => { scroller.dispatchEvent(new Event("wheel")); });
  await flush();
  expect(current()).toBe("#gamma");
});

it.each(["pointer", "Enter"])("real search %s navigation reaches NavigationDim after closing", async how => {
  // 비로그인 검색은 Docs만 찾는다 — 다른 화면에서 Docs 행으로 이동하는 것을 잰다.
  mocks.pathname = "/privacy"; window.history.replaceState(null, "", "/privacy");
  await render(<><NavigationDim /><SearchTrigger account={null} /></>);
  const dim = find(document.body, "[data-navigation-dim]");
  expect(dim.hasAttribute("data-active")).toBe(false);
  await open();
  await input(query(), "start");
  const link = find<HTMLAnchorElement>(group("Docs")!, 'a[href="/docs/start"]');
  const clicked = vi.spyOn(link, "click");
  // jsdom의 목적지 렌더만 막는다 — document·window까지 실제 클릭 전파는 보존한다.
  const prevent = (event: MouseEvent) => event.preventDefault();
  document.addEventListener("click", prevent);
  try {
    if (how === "Enter") await key(query(), "Enter"); else await act(async () => link.click());
  } finally { document.removeEventListener("click", prevent); }
  expect(clicked).toHaveBeenCalledOnce();
  expect(dialog()).toBeNull();
  expect(dim.getAttribute("data-active")).toBe("true");
});
