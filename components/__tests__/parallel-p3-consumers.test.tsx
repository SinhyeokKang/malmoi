// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { act } from "react";
import type { ComponentProps } from "react";
import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ useLinkStatus: () => ({ pending: false }), default: ({ href, onNavigate: _onNavigate, ...props }: ComponentProps<"a"> & { onNavigate?: unknown }) => <a href={href} {...props} /> }));
vi.mock("@/components/onboarding/connect-github", () => ({ useGithubConnect: () => ({ pending: false, via: null, error: null, start: vi.fn() }) }));

import { RepoStep, type RepoStepState } from "@/components/onboarding/steps/repo";
import { NamingStep } from "@/components/onboarding/steps/naming";
import { TokenGrantFields, initialGrantFields } from "@/components/mcp/token-grant-fields";
import { render, key, find } from "./helpers/dom";

const repos = ["first", "second"].map(repo => ({ owner: "fixture", repo, fullName: `fixture/${repo}`, suggestedSlug: repo, pushedAt: null }));
const state: RepoStepState = { repos, query: "", listError: undefined, installUrl: null, backQuery: {}, now: "2026-10-02T00:00:00.000Z", selected: "fixture/first", branch: { mode: "fixed", selected: "main" }, branchLoading: false, branchValue: "main", accessError: undefined, banner: null, pending: false };

it("repo arrow scanning never loads branches until explicit confirmation, which occurs once", async () => {
  const select = vi.fn();
  const { container } = await render(<RepoStep state={state} onSelect={select} onScan={vi.fn()} onQueryChange={vi.fn()} onBranchChange={vi.fn()} onAnnounce={vi.fn()} />);
  const radios = [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
  await act(async () => { radios[0]!.focus(); });
  await key(radios[0]!, "ArrowDown");
  await act(async () => { await vi.waitFor(() => expect(document.activeElement).toBe(radios[1])); });
  expect(select).not.toHaveBeenCalled();
  expect(radios[1]?.getAttribute("aria-checked")).toBe("true");
  await act(async () => { radios[1]!.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowDown", bubbles: true })); });
  await key(radios[1]!, " ");
  expect(select).toHaveBeenCalledExactlyOnceWith(repos[1]);
  expect(container.querySelectorAll("[data-select-row]")).toHaveLength(2);
});

it("repo programmatic activation remains a confirmation without a pointer detail", async () => {
  const select = vi.fn();
  const { container } = await render(<RepoStep state={state} onSelect={select} onScan={vi.fn()} onQueryChange={vi.fn()} onBranchChange={vi.fn()} onAnnounce={vi.fn()} />);
  const second = container.querySelectorAll<HTMLButtonElement>('[role="radio"]')[1]!;
  await act(async () => { second.click(); });
  expect(select).toHaveBeenCalledExactlyOnceWith(repos[1]);
});

it("repo Enter explicitly confirms the focused choice once", async () => {
  const select = vi.fn();
  const { container } = await render(<RepoStep state={state} onSelect={select} onScan={vi.fn()} onQueryChange={vi.fn()} onBranchChange={vi.fn()} onAnnounce={vi.fn()} />);
  const second = container.querySelectorAll<HTMLButtonElement>('[role="radio"]')[1]!;
  await act(async () => { second.focus(); });
  await key(second, "Enter");
  expect(select).toHaveBeenCalledExactlyOnceWith(repos[1]);
});

it("naming rows preserve RadioGroup plus list and change the actual locale", async () => {
  const change = vi.fn();
  const { container } = await render(<NamingStep state={{ name: "Fixture", slug: "fixture", baseLocale: "en", locales: ["en", "ko"], keyCounts: {}, slugTakenAlt: undefined, slugTaken: false, pathTemplate: "locales/{locale}.json", branch: "main", banner: null }} onChange={change} />);
  expect(container.querySelectorAll("[data-select-row]")).toHaveLength(2);
  const group = find(container, '[role="radiogroup"]');
  expect(group.querySelector("ul")?.getAttribute("role")).toBeNull();
  const radios = [...group.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
  await act(async () => { await userEvent.setup().click(radios[1]!.closest("label")!); });
  expect(change).toHaveBeenCalledExactlyOnceWith({ baseLocale: "ko" });
});

it("grant grid preserves listitems inside a named group and unavailable scope uses a genuine Radio", async () => {
  const projects: [] = [];
  const fields = initialGrantFields({ grants: [], scope: "all", projectIds: [] }, projects);
  const { container } = await render(<TokenGrantFields value={fields} onChange={vi.fn()} projects={projects} disabled={false} />);
  const grant = find(container, '[data-grant]');
  const list = grant.closest("ul")!;
  expect(list.getAttribute("role")).toBeNull();
  expect(list.parentElement?.getAttribute("role")).toBe("group");
  expect(list.querySelectorAll("li")).toHaveLength(4);
  const unavailable = find<HTMLButtonElement>(container, '[role="radio"][aria-disabled="true"]');
  expect(unavailable.tagName).toBe("BUTTON");
  expect(unavailable.disabled).toBe(false);
  expect(unavailable.tabIndex).toBe(0);
  expect(document.getElementById(unavailable.getAttribute("aria-describedby")!)?.textContent).not.toBe("");
  expect(container.querySelectorAll("[data-select-row]")).toHaveLength(6);
});

it("expanded grant scope preserves project indentation, selected face and one label toggle", async () => {
  const projects = [{ id: "fixture-project", name: "Fixture", repo: "fixture/repo" }];
  const fields = initialGrantFields({ grants: ["translation:write"], scope: "projects", projectIds: [] }, projects);
  const change = vi.fn();
  const { container } = await render(<TokenGrantFields value={fields} onChange={change} projects={projects} disabled={false} />);
  const checkbox = find(container, '[data-scope-project="fixture-project"]');
  const row = checkbox.closest('[data-select-row]')!;
  expect(row.classList.contains("[&>div>label]:pl-20")).toBe(true);
  expect(row.parentElement?.closest('[data-select-row]')?.classList.contains("bg-muted")).toBe(true);
  const grantRow = find(container, '[data-grant="translation:write"]').closest('[data-select-row]')!;
  expect(grantRow.classList.contains("bg-muted")).toBe(false);
  await act(async () => { await userEvent.setup().click(checkbox.closest("label")!); });
  expect(change).toHaveBeenCalledExactlyOnceWith({ ...fields, chosen: new Set(["fixture-project"]) });
});

it("files multi-select keeps preview and inclusion separate with a disabled locked choice", async () => {
  const { FilesStep } = await import("@/components/onboarding/steps/files");
  const candidate = { outputPaths: ["locales/en.json"], adapter: "json-catalog" as const, label: "JSON", pathTemplate: "locales/{locale}.json", locales: ["en"], baseLocale: "en", keys: { status: "counted" as const, count: 1 }, samples: [] };
  const fileState = { detecting: false, detectError: undefined, candidates: [candidate, { ...candidate, pathTemplate: "other/{locale}.json" }], picked: 0, locale: "en", preview: { status: "loading" as const }, manual: { adapter: "json-catalog" as const, pathTemplate: "", baseLocale: "" }, manualMatched: false, adapters: [], repoLabel: "fixture/repo", branch: "main", banner: null };
  const pick = vi.fn();
  const toggle = vi.fn();
  const { container } = await render(<FilesStep state={fileState} selection={{ checked: new Set(), locked: new Set([1]), conflicts: [], onToggle: toggle }} onPick={pick} onLocale={vi.fn()} onManual={vi.fn()} onRetry={vi.fn()} />);
  const checkboxes = [...container.querySelectorAll<HTMLButtonElement>('[role="checkbox"]')];
  expect(checkboxes).toHaveLength(2);
  expect(checkboxes[1]?.disabled).toBe(true);
  const previews = [...container.querySelectorAll<HTMLButtonElement>('button[aria-label]')].filter(button => button.getAttribute("aria-label")?.startsWith("Preview"));
  expect(previews).toHaveLength(2);
  expect(previews[0]?.closest("label")).toBeNull();
  await act(async () => { await userEvent.setup().click(checkboxes[0]!); });
  expect(toggle).toHaveBeenCalledExactlyOnceWith(0);
  expect(pick).not.toHaveBeenCalled();
  await act(async () => { await userEvent.setup().click(previews[1]!); });
  expect(pick).toHaveBeenCalledExactlyOnceWith(1);
  expect(toggle).toHaveBeenCalledTimes(1);
  expect(container.querySelectorAll("[data-select-row]")).toHaveLength(2);
});

it("long file paths can shrink at the actual radio-label flex boundary in the narrow candidate pane", async () => {
  const { FilesStep } = await import("@/components/onboarding/steps/files");
  const pathTemplate = `locales/${"long-unbroken-filename".repeat(12)}/{locale}.json`;
  const candidate = { outputPaths: ["locales/en.json"], adapter: "json-catalog" as const, label: "JSON", pathTemplate: "locales/{locale}.json", locales: ["en"], baseLocale: "en", keys: { status: "counted" as const, count: 1 }, samples: [] };
  const state = { detecting: false, detectError: undefined, candidates: [candidate, { ...candidate, pathTemplate }], picked: 0, locale: "en", preview: { status: "loading" as const }, manual: { adapter: "json-catalog" as const, pathTemplate: "", baseLocale: "" }, manualMatched: false, adapters: [], repoLabel: "fixture/repo", branch: "main", banner: null };
  const pick = vi.fn();
  const { container } = await render(<div style={{ width: 240 }}><FilesStep state={state} onPick={pick} onLocale={vi.fn()} onManual={vi.fn()} onRetry={vi.fn()} /></div>);
  const title = [...container.querySelectorAll<HTMLElement>('[title]')].find(node => node.getAttribute("title") === pathTemplate)!;
  const label = title.closest("label")!;
  expect(title.classList.contains("truncate")).toBe(true);
  expect(label.parentElement?.classList.contains("flex")).toBe(true);
  expect(label.classList.contains("min-w-0")).toBe(true);
  await act(async () => { await userEvent.setup().click(label); });
  expect(pick).toHaveBeenCalledExactlyOnceWith(1);
});
