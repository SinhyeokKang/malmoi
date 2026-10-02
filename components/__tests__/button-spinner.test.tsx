// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import userEvent from "@testing-library/user-event";
import { RefreshCw } from "lucide-react";
import { act } from "react";
import { compile } from "tailwindcss";
import { describe, expect, it, vi } from "vitest";

import { MemberList } from "@/components/members/member-list";
import { ArchiveCard } from "@/components/settings/archive-card";
import { FileInput } from "@/components/ui/file-input";
import { Button } from "@/components/ui/button";
import type { MemberView } from "@/lib/auth/query";
import { m } from "@/lib/i18n";

import { find, render } from "./helpers/dom";

const actions = vi.hoisted(() => ({ archiveProject: vi.fn(), unarchiveProject: vi.fn(), changeMember: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => actions);

const require = createRequire(join(process.cwd(), "package.json"));
const globalsPath = join(process.cwd(), "app/globals.css");

// jsdom에는 Tailwind 레이아웃·중첩 CSS 실행이 없으므로 실제 컴파일 선언과 적용 대상 선택자를 함께 검증한다.
async function spinnerDimensions(button: HTMLElement): Promise<number[]> {
  const spinner = find<HTMLElement>(button, ".animate-spin");
  expect(spinner.getAttribute("aria-hidden")).toBe("true");
  const compiler = await compile(readFileSync(globalsPath, "utf8"), {
    base: dirname(globalsPath),
    loadStylesheet: async (id, base) => {
      const path = require.resolve(id === "tailwindcss" ? "tailwindcss/index.css" : id, { paths: [base] });
      return { path, base: dirname(path), content: readFileSync(path, "utf8") };
    },
  });
  const ownSize = [...spinner.classList].find(token => /^size-/.test(token));
  expect(ownSize).toBeDefined();
  const ancestors: HTMLElement[] = [];
  for (let ancestor: HTMLElement | null = spinner.parentElement; ancestor !== null; ancestor = ancestor.parentElement) ancestors.push(ancestor);
  const overrides = ancestors.flatMap(ancestor => [...ancestor.classList].filter(token => token.startsWith("[&_.animate-spin]:size-")));
  expect(overrides.length).toBeLessThanOrEqual(1);
  const candidate = overrides[0] ?? ownSize!;
  const css = compiler.build([candidate]);
  const utility = css.split("@layer utilities {")[1]!;
  expect(utility).toBeDefined();
  const escaped = candidate.replace(/[^\w-]/g, "\\$&");
  expect(utility).toContain(`.${escaped}`);
  if (overrides.length !== 0) {
    expect(utility).toContain(`.${escaped} .animate-spin {`);
    const owner = ancestors.find(ancestor => ancestor.classList.contains(candidate));
    expect(owner?.querySelector(".animate-spin")).toBe(spinner);
  }
  const spacing = css.match(/--spacing:\s*([\d.]+)rem;/)?.[1];
  expect(spacing).toBeDefined();
  // px 기대값은 16px 루트의 고정 fixture다. 클래스 이름을 숫자로 치환하지 않고 컴파일러가 낸 식을 평가한다.
  return ["width", "height"].map(property => {
    const scale = utility.match(new RegExp(`${property}: calc\\(var\\(--spacing\\) \\* ([\\d.]+)\\);`))?.[1];
    expect(scale, `${candidate} ${property}`).toBeDefined();
    return Number(spacing) * Number(scale) * 16;
  });
}

async function click(node: Element) { await act(async () => { await userEvent.setup().click(node); }); }

function deferred() {
  let resolve!: (value: { ok: false; error: string }) => void;
  const promise = new Promise<{ ok: false; error: string }>(done => { resolve = done; });
  return { promise, finish: async () => { await act(async () => { resolve({ ok: false, error: "forbidden" }); }); } };
}

/**
 * **도는 버튼의 스피너는 `Button`의 `loading`·`busy`가 든다** (DESIGN §6.4 `Button loading` · ux-drift-unify T13 · 3-⚪13).
 * 아이콘이 있는 버튼은 스피너를 **더하지 않고 교체한다** — 더하면 버튼이 글리프 하나만큼 넓어졌다 좁아진다. 전엔 그 교체를 호출부
 * 다섯이 삼항으로 손수 들었다. 앞 글리프는 **`aria-hidden`을 든 첫 자식 요소**다 — 라벨 글자·배지는 교체되지 않는다.
 */
describe("Button — 스피너가 앞 글리프를 교체한다", () => {
  it.each(["loading", "busy"] as const)("%s면 앞 글리프가 빠지고 스피너 하나가 선다 — 라벨은 그대로다", async (mode) => {
    const props = mode === "loading" ? { loading: true } : { busy: true };
    const { container } = await render(<Button {...props}><RefreshCw aria-hidden />Refresh</Button>);
    const button = container.querySelector("button")!;
    expect(button.querySelector(".lucide-refresh-cw")).toBeNull();
    expect(button.querySelectorAll("svg")).toHaveLength(1);
    expect(button.querySelector(".animate-spin")).not.toBeNull();
    expect(button.textContent).toBe("Refresh");
  });

  it("돌지 않으면 앞 글리프가 그대로다", async () => {
    const { container } = await render(<Button><RefreshCw aria-hidden />Refresh</Button>);
    expect(container.querySelector(".lucide-refresh-cw")).not.toBeNull();
    expect(container.querySelector(".animate-spin")).toBeNull();
  });

  it("아이콘 없는 확정 버튼은 스피너를 더한다 — 라벨이 첫 자식이다", async () => {
    const { container } = await render(<Button loading>Save</Button>);
    expect(container.querySelector(".animate-spin")).not.toBeNull();
    expect(container.textContent).toBe("Save");
  });

  it("aria-hidden 없는 첫 요소(라벨 조각)는 교체하지 않는다", async () => {
    const { container } = await render(<Button busy><span>Save</span> now</Button>);
    expect(container.querySelector("span")?.textContent).toBe("Save");
  });
});

describe("Button progress semantics before the API rename", () => {
  it("busy stays focusable, consumes click/default submission, and resumes after clearing", async () => {
    const clicked = vi.fn();
    const submitted = vi.fn();
    const view = await render(<form onSubmit={event => { event.preventDefault(); submitted(); }}>
      <Button type="submit" busy onClick={clicked}>Save</Button>
    </form>);
    const button = find<HTMLButtonElement>(view.container, "button");
    button.focus();
    expect(document.activeElement).toBe(button);
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.getAttribute("aria-busy")).toBe("true");
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    await act(async () => { button.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    await act(async () => { await userEvent.setup().keyboard("{Enter}"); });
    expect(clicked).not.toHaveBeenCalled();
    expect(submitted).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
    await view.rerender(<form onSubmit={event => { event.preventDefault(); submitted(); }}><Button type="submit" onClick={clicked}>Save</Button></form>);
    expect(button.getAttribute("aria-busy")).toBeNull();
    expect(button.getAttribute("aria-disabled")).toBeNull();
    expect(button.querySelector(".animate-spin")).toBeNull();
    await click(button);
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(submitted).toHaveBeenCalledTimes(1);
  });

  it("loading disables natively and preserves caller aria metadata; explicit disabled wins over busy", async () => {
    const clicked = vi.fn();
    const view = await render(<Button loading onClick={clicked} aria-busy aria-describedby="help">Save</Button>);
    const button = find<HTMLButtonElement>(view.container, "button");
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.getAttribute("aria-describedby")).toBe("help");
    expect(button.getAttribute("aria-disabled")).toBeNull();
    await click(button);
    expect(clicked).not.toHaveBeenCalled();
    await view.rerender(<Button loading onClick={clicked}>Save</Button>);
    expect(button.getAttribute("aria-busy")).toBeNull();
    expect(button.getAttribute("aria-disabled")).toBeNull();
    await view.rerender(<Button busy disabled onClick={clicked}>Save</Button>);
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.querySelectorAll(".animate-spin")).toHaveLength(1);
  });

  it("keeps the label node mounted while replacing only the first decorative glyph", async () => {
    const view = await render(<Button><RefreshCw aria-hidden /><span>Refresh</span><small>3</small></Button>);
    const button = find<HTMLButtonElement>(view.container, "button");
    const label = find(button, "span");
    await view.rerender(<Button busy><RefreshCw aria-hidden /><span>Refresh</span><small>3</small></Button>);
    expect(button.querySelector("span")).toBe(label);
    expect(button.querySelector("small")?.textContent).toBe("3");
    expect(button.firstElementChild?.classList.contains("animate-spin")).toBe(true);
    await view.rerender(<Button><RefreshCw aria-hidden /><span>Refresh</span><small>3</small></Button>);
    expect(button.querySelector("span")).toBe(label);
    expect(button.querySelector(".lucide-refresh-cw")).not.toBeNull();
  });

  it.each(["loading", "busy"] as const)("%s preserves 14px override versus 16px default on the same md danger Button", async (mode) => {
    const progress = mode === "loading" ? { loading: true } : { busy: true };
    const { container } = await render(<>
      <Button variant="danger" {...progress} spinnerSize="sm" data-case="archive">Archive</Button>
      <Button variant="danger" {...progress} data-case="member">Remove</Button>
    </>);
    const archive = find<HTMLButtonElement>(container, '[data-case="archive"]');
    const member = find<HTMLButtonElement>(container, '[data-case="member"]');
    for (const button of [archive, member]) {
      expect(button.classList.contains("h-9")).toBe(true);
      expect(button.classList.contains("text-destructive")).toBe(true);
    }
    expect(await spinnerDimensions(archive)).toEqual([14, 14]);
    expect(await spinnerDimensions(member)).toEqual([16, 16]);
  });

  it.each(["sm", "md", "lg"] as const)("size %s does not normalize the default spinner size", async (size) => {
    const { container } = await render(<Button size={size} busy>Save</Button>);
    expect(await spinnerDimensions(find(container, "button"))).toEqual([16, 16]);
  });

  it("actual ArchiveCard busy and MemberList remove busy retain the 14/16px pair", async () => {
    const archiveResponse = deferred();
    const memberResponse = deferred();
    actions.archiveProject.mockReturnValue(archiveResponse.promise);
    actions.changeMember.mockReturnValue(memberResponse.promise);
    const now = new Date("2026-10-02T00:00:00Z");
    const members: MemberView[] = [
      { userId: "owner", name: "Owner", emailLabel: "o***@example.test", image: null, readable: true, role: "OWNER", joinedAt: now },
      { userId: "editor", name: "Alice", emailLabel: "a***@example.test", image: null, readable: true, role: "EDITOR", joinedAt: now },
    ];
    const { container } = await render(<>
      <ArchiveCard slug="fixture" name="Fixture" archived={false} openPrUrl={Promise.resolve(null)} />
      <MemberList slug="fixture" members={members} role="OWNER" viewerId="owner" now={now} headingId="members" />
    </>);
    const archive = [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === m.archive.action)!;
    try {
      await click(archive);
      const confirmArchive = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(button => button.textContent === m.archive.action)!;
      await click(confirmArchive);
      expect(archive.getAttribute("aria-busy")).toBe("true");
      expect(await spinnerDimensions(archive)).toEqual([14, 14]);
      const remove = find<HTMLButtonElement>(container, "#remove-editor");
      await click(remove);
      const confirmRemove = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(button => button.textContent === m.members.removeConfirm)!;
      await click(confirmRemove);
      expect(remove.getAttribute("aria-busy")).toBe("true");
      expect(await spinnerDimensions(remove)).toEqual([16, 16]);
      for (const button of [archive, remove]) {
        expect(button.classList.contains("h-9")).toBe(true);
        expect(button.classList.contains("text-destructive")).toBe(true);
        expect(button.disabled).toBe(false);
      }
    } finally {
      await archiveResponse.finish();
      await memberResponse.finish();
    }
  });
});


describe("명시적 스피너 크기와 독립적인 버튼 크기", () => {
  it.each(["loading", "busy"] as const)("%s의 기본16·명시14/16은 모든 버튼 크기에서 같다", async mode => {
    const progress = mode === "loading" ? { loading: true } : { busy: true };
    for (const size of ["sm", "md", "lg", "icon-xs", "icon-sm", "icon-md", "icon-lg"] as const) {
      for (const [spinnerSize, pixels] of [[undefined, 16], ["sm", 14], ["md", 16]] as const) {
        const view = await render(<Button size={size} spinnerSize={spinnerSize} {...progress}>Save</Button>);
        const button = find<HTMLButtonElement>(view.container, "button");
        expect(await spinnerDimensions(button)).toEqual([pixels, pixels]);
        expect(button.hasAttribute("spinnerSize")).toBe(false);
        expect(button.textContent).toBe("Save");
        await view.rerender(null);
      }
    }
  });

  it.each([[undefined, 16], ["sm", 14], ["md", 16]] as const)("FileInput은 spinnerSize %s를 실제 버튼으로 전달한다", async (spinnerSize, pixels) => {
    const { container } = await render(<FileInput accept="image/png" onPick={() => {}} loading spinnerSize={spinnerSize}>Upload</FileInput>);
    const button = find<HTMLButtonElement>(container, "button");
    expect(await spinnerDimensions(button)).toEqual([pixels, pixels]);
    expect(button.disabled).toBe(true);
    expect(button.hasAttribute("spinnerSize")).toBe(false);
    expect(container.querySelector("input")?.getAttribute("aria-hidden")).toBe("true");
  });
});
