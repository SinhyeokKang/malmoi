// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { compile } from "tailwindcss";
import { beforeAll, expect, it, vi } from "vitest";

import InboxPage from "@/app/(edit)/inbox/page";
import { Button } from "@/components/ui/button";
import { NoMatch } from "@/components/ui/empty-state";
import { en } from "@/messages/en";
import { ko } from "@/messages/ko";
import { es } from "@/messages/es";
import { find, render } from "./helpers/dom";

vi.setConfig({ testTimeout: 20_000 });
const mocks = vi.hoisted(() => ({ uiLocale: "en" as "en" | "ko" | "es" }));
vi.mock("@/lib/auth/session", () => ({ requireUser: async () => ({ userId: "u1" }) }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({}) }));
vi.mock("@/lib/inbox/load", () => ({ loadAttentionInbox: async () => ({ unread: 1, groups: [{
  project: { slug: "web", name: "Web", image: null, reconnect: "settings" },
  items: [{ kind: "setup", at: new Date("2026-10-18T00:00:00Z"), unread: true, ownerRetries: false }],
}] }) }));
vi.mock("@/components/inbox/mark-seen", () => ({ MarkSeen: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/i18n/server", async () => ({
  getUiLocale: async () => mocks.uiLocale,
  getMessages: async () => mocks.uiLocale === "ko" ? (await import("@/messages/ko")).ko
    : mocks.uiLocale === "es" ? (await import("@/messages/es")).es : (await import("@/messages/en")).en,
}));

let compiler: Awaited<ReturnType<typeof compile>>;
beforeAll(async () => {
  const globals = join(process.cwd(), "app/globals.css");
  const require = createRequire(join(process.cwd(), "package.json"));
  compiler = await compile(readFileSync(globals, "utf8"), {
    base: dirname(globals),
    loadStylesheet: async (id, base) => {
      const path = require.resolve(id === "tailwindcss" ? "tailwindcss/index.css" : id, { paths: [base] });
      return { path, base: dirname(path), content: readFileSync(path, "utf8") };
    },
  });
});

function cssBlock(node: HTMLElement, token: string): string {
  expect(node.classList.contains(token)).toBe(true);
  const css = compiler.build([token]);
  const selector = `.${token.replace(/[^\w-]/g, "\\$&")} {`;
  const block = css.split("@layer utilities {")[1]?.split(selector)[1]?.split("}")[0];
  expect(block, token).toBeDefined();
  return block!;
}

/** CSS를 컴파일해 폭 제약과 min-content를 줄이는 줄바꿈 규칙을 검사한다. 픽셀 배치는 Q가 잰다. */
function boundedTitle(title: HTMLElement) {
  expect(cssBlock(title.parentElement!, "max-w-full")).toContain("max-width: 100%");
  expect(cssBlock(title, "wrap-anywhere")).toContain("overflow-wrap: anywhere");
  expect(title.classList.contains("text-base")).toBe(true);
  expect(title.classList.contains("font-medium")).toBe(true);
  expect(title.className).not.toMatch(/truncate|line-clamp|break-all/);
}

const query = "W".repeat(200);
it.each([["en", en], ["ko", ko], ["es", es]] as const)("Inbox %s의 200자 무공백 질의는 전체 제목과 Clear 출구를 카드 안의 줄바꿈 제약에 싣는다 (#302)", async (uiLocale, m) => {
  mocks.uiLocale = uiLocale;
  const { container } = await render(await InboxPage({ searchParams: Promise.resolve({ q: query }) }), { uiLocale });
  const title = [...container.querySelectorAll<HTMLParagraphElement>("p")].find(node => node.textContent === m.inbox.noMatch.query(query))!;
  expect(title).toBeDefined();
  boundedTitle(title);
  const card = title.parentElement!.parentElement!;
  expect(card.classList.contains("rounded-lg")).toBe(true);
  expect(card.classList.contains("px-6")).toBe(true);
  expect(card.classList.contains("py-12")).toBe(true);
  expect(title.textContent).toContain(query);
  expect(title.closest('[aria-hidden="true"]')).toBeNull();
  const exit = find<HTMLAnchorElement>(card, 'a[href="/inbox"]');
  expect(exit.textContent).toBe(m.inbox.filters.clear);
  const search = find<HTMLInputElement>(container, 'input[type="search"]');
  expect(search.value).toBe(query);
  expect(search.getAttribute("aria-label")).toBe(m.inbox.search.label);
});

it.each(["card", "inset"] as const)("%s형 ReactNode 제목도 전체 글자·기존 설명·동작을 보존한다", async placement => {
  const onClear = vi.fn();
  const { container } = await render(<NoMatch placement={placement}
    title={<>No items match <strong>{query}</strong></>}
    description="Try another query."
    action={<Button onClick={onClear}>Clear filters</Button>}
  />);
  const title = find<HTMLParagraphElement>(container, "p");
  boundedTitle(title);
  expect(find(title, "strong").textContent).toBe(query);
  const description = title.nextElementSibling!;
  expect(description.textContent).toBe("Try another query.");
  for (const token of ["max-w-[46ch]", "text-sm", "leading-relaxed", "text-pretty"]) expect(description.classList.contains(token)).toBe(true);
  expect(title.parentElement!.classList.contains("gap-1.5")).toBe(true);
  const button = find<HTMLButtonElement>(container, "button");
  expect(button.parentElement).toBe(title.parentElement!.parentElement);
  await act(async () => { await userEvent.setup().click(button); });
  expect(onClear).toHaveBeenCalledOnce();
});
