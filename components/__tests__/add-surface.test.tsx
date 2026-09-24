// @vitest-environment jsdom
import { act } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { find, render } from "./helpers/dom";
import { SourcesScreen } from "../sources/sources-screen";
import NotFound from "@/app/(edit)/projects/[slug]/surfaces/[surfaceSlug]/not-found";
import { m } from "@/lib/i18n";

vi.setConfig({ testTimeout: 20_000 });
vi.mock("@/app/(edit)/projects/[slug]/sources/actions", () => ({ loadSourceDetail: vi.fn(), updateBaseLocale: vi.fn() }));
const mocks = vi.hoisted(() => ({ add: vi.fn(), detect: vi.fn(), sample: vi.fn(), confirm: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => ({ addSurfaces: mocks.add, runFirstIngest: vi.fn(), detectRepoFormats: mocks.detect,
  loadCandidateSample: mocks.sample, confirmManualFormat: mocks.confirm }));
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({ startGithubConnect: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }));
const props = {
  slug: "acme", owner: "o", repo: "r", branch: "main",
  adapters: [{ adapter: "json-catalog" as const, layout: "per-locale" as const, label: "JSON", example: "locales/{locale}.json" }],
  initial: { ok: true as const, candidates: [{ adapter: "json-catalog" as const, pathTemplate: "second/{locale}.json",
    outputPaths: ["second/en.json", "second/ko.json"], baseLocale: "en", locales: ["en", "ko"], label: "JSON", keys: { status: "counted" as const, count: 1 },
    samples: [{ locale: "en", total: 1, rows: [{ key: "old", value: "Hello" }] }], confirmation: "signed" }] },
};
beforeEach(() => { vi.clearAllMocks(); mocks.detect.mockResolvedValue(props.initial); });
async function draw() {
  await render(<SourcesScreen slug={props.slug} adapters={props.adapters} role="OWNER" data={{ installed: true, sources: [], repository: { repoOwner: "o", repoName: "r", baseBranch: "main" } }} now={new Date()} initialOpen />);
  return { container: document.body };
}
async function select() {
  await act(async () => { await userEvent.setup().click(find(document.body, '[role="checkbox"]')); });
}



/** 꺼짐은 `aria-disabled`다 (audit #37) — 포커스를 받아 describedby의 사유에 닿는다. 진행 중의 `loading`만 진짜 `disabled`다. */
const blocked = (container: HTMLElement) => {
  const node = find<HTMLButtonElement>(container, '[data-add-sources]');
  return node.disabled || node.getAttribute("aria-disabled") === "true";
};

it("선택한 표면의 실패 뒤에도 후보와 입력을 보존하고 재시도한다", async () => {
  mocks.add.mockResolvedValue({ ok: false, error: "ingest-failed" });
  const user = userEvent.setup();
  const { container } = await draw();
  await select();
  await act(async () => user.click(find(container, '[data-add-sources]')));
  expect(mocks.add).toHaveBeenCalledWith({ slug: "acme", picks: [{ adapter: "json-catalog", pathTemplate: "second/{locale}.json", baseLocale: "en" }] });
  expect(container.textContent).toContain("second/{locale}.json");
  expect(blocked(container)).toBe(false);
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
});

it("추가 결과는 새 토큰 없이 기존 workflow step과 부분 실패를 보여준다", async () => {
  mocks.add.mockResolvedValue({ ok: true, results: [{ surfaceSlug: "second", pathTemplate: "second/{locale}.json", count: 1, failed: 1 }], yaml: "surface: second" });
  const user = userEvent.setup();
  const { container } = await draw();
  await select();
  await act(async () => user.click(find(container, '[data-add-sources]')));
  expect(container.textContent).toContain("Update the workflow");
  expect(container.textContent).not.toContain("Save this in your repository as");
  expect(container.textContent).toContain("1");
  expect(container.querySelector('[role="status"]')).not.toBeNull();
  expect(container.querySelector('input[type="password"]')).toBeNull();
  expect(container.querySelector('[role="dialog"]')).toBeNull();
});

it("없는 표면의 404는 제품 안내와 돌아갈 링크를 제공한다", async () => {
  const { container } = await render(<NotFound />);
  expect(container.textContent).toContain("Source unavailable");
  expect(container.querySelector('a[href="/projects"]')).not.toBeNull();
});

it("탐지 후보가 있어도 수동 경로를 검사하고 원래 후보로 돌아간다", async () => {
  const user = userEvent.setup();
  const { container } = await draw();
  await act(async () => user.click([...container.querySelectorAll('button')].find(b => b.textContent === 'Set the path yourself')!));
  await act(async () => user.type(find(container, '#manual-path'), 'other/{{locale}.json'));
  expect(blocked(container)).toBe(true);
  await select();
  await act(async () => user.click(find(container, 'button[aria-label="Preview second/{locale}.json"]')));
  expect(container.textContent).toContain("second/{locale}.json");
  expect(blocked(container)).toBe(false);
});

it("리포 정체성 변경은 재시도로 고칠 수 없는 원인을 안내한다", async () => {
  mocks.add.mockResolvedValue({ ok: false, error: "repo-replaced" });
  const user = userEvent.setup();
  const { container } = await draw();
  await select();
  await act(async () => user.click(find(container, '[data-add-sources]')));
  expect(container.textContent).toContain("different repository");
});

it("0후보는 수동 입력을 열고 검사 실패 뒤 경로를 보존한다", async () => {
  mocks.confirm.mockResolvedValue({ ok: false, error: "manual-no-match" });
  const user = userEvent.setup();
  mocks.detect.mockResolvedValue({ ok: false, error: "no-candidates" });
  const { container } = await draw();
  await act(async () => user.type(find(container, '#manual-path'), 'manual/{{locale}.json'));
  await act(async () => user.type(find(container, '#manual-base'), 'en'));
  await act(async () => user.click([...container.querySelectorAll('button')].find(b => b.textContent === 'Check files')!));
  expect(find<HTMLInputElement>(container, '#manual-path').value).toBe('manual/{locale}.json');
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(blocked(container)).toBe(true);
});

/**
 * ⚠️ **거부 문구가 가리키는 버튼 이름이 화면에 실재해야 한다.** `reauthorize`의 문장은
 * `reauthorize`의 문장과 `not-connected`의 문장이 **각자 다른 버튼 이름**을 부른다 — 버튼 라벨을 하나로
 * 고정하면 둘 중 하나는 **없는 버튼을 가리킨다.** 첫 프로젝트 화면이 같은 이유로 이미 갈라 든다
 * (`steps/repo.tsx`). 2026-09-14에 실물 화면에서 "Use Reconnect GitHub"가 `Connect GitHub` 버튼 위에
 * 섰다.
 */
it.each([
  ["reauthorize", m.newProject.empty.connect.reauthorize],
  ["not-connected", m.newProject.empty.connect.action],
])("%s면 버튼 라벨이 그 문구가 말하는 이름이다", async (error, label) => {
  mocks.detect.mockResolvedValue({ ok: false, error });
  const { container } = await draw();
  const alert = container.querySelector('[role="alert"]')?.textContent ?? "";
  expect(alert).toContain(label);
  const buttons = [...container.querySelectorAll("button")].map(b => b.textContent?.trim());
  expect(buttons).toContain(label);
});

/**
 * **사유는 버튼이 꺼져 있는 동안만 선다** (malmoi#93). `Select at least one new source to add.`가 무조건 푸터에 서고
 * `aria-describedby`도 무조건이라, 고른 뒤 켜진 [Add selected sources]가 "…, 하나 이상 고르라"로 낭독됐다. 짝으로 켜진 뒤에는
 * 문장도 describedby도 없다.
 */
it("고르기 전엔 사유가 보이고 버튼이 그것을 가리키며, 고른 뒤엔 둘 다 사라진다", async () => {
  const { container } = await draw();
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  const add = () => find<HTMLButtonElement>(container, '[data-add-sources]');
  expect(blocked(container)).toBe(true);
  expect(document.getElementById(add().getAttribute("aria-describedby") ?? "")?.textContent).toBe(m.settings.sources.selectHelp);
  await select();
  expect(blocked(container)).toBe(false);
  expect(add().getAttribute("aria-describedby")).toBeNull();
  expect(container.textContent).not.toContain(m.settings.sources.selectHelp);
});
