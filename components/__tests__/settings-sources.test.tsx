// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { SourcesScreen } from "@/components/sources/sources-screen";
import type { AdapterChoice } from "@/lib/onboarding/types";
vi.setConfig({ testTimeout: 20_000 });
import { render } from "./helpers/dom";
import { m } from "@/lib/i18n";
const actions = vi.hoisted(() => ({ load: vi.fn(), runFirstIngest: vi.fn(), detectRepoFormats: vi.fn(), addSurfaces: vi.fn(), confirmManualFormat: vi.fn(), loadCandidateSample: vi.fn() }));
vi.mock("@/app/(edit)/projects/[slug]/sources/actions", () => ({ loadSourceDetail: actions.load, updateBaseLocale: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => actions);
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({ startGithubConnect: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }));
const source = { id: "s1", slug: "web", pathTemplate: "web/{locale}.json", lastCommitSha: null as string | null, lastImportStartedAt: null, lastImportFailedAt: null, lastImportError: null, lastCommitAt: null };
const candidate = (dir: string) => ({ adapter: "json-catalog", pathTemplate: `${dir}/{locale}.json`, outputPaths: [`${dir}/en.json`], label: "JSON", locales: ["en", "ko"], baseLocale: "en", keys: { status: "counted", count: 1 }, samples: [{ locale: "en", rows: [{ key: "x", value: "X" }], total: 1 }] });
const oldProps = { slug: "acme", owner: "acme", repo: "web", branch: "main", installationId: "1", archived: false, sources: [source], counts: [{ surfaceId: "s1", keys: 5, locales: 2 }], adapters: [], now: new Date("2026-09-20T00:00:00Z") };
const toSource = (s: typeof source) => ({ ...s, baseLocale: "en", declaredBaseLocale: null, lastImportedAt: null, createdAt: new Date("2026-09-19T00:00:00Z"), keys: 5, locales: 2, orphanedLocales: 0, progress: { total: 10, done: 0, review: 0, percent: 0 }, connection: { pathTemplate: s.pathTemplate, adapterName: "json-catalog", format: "JSON" } });
const props = { sources: [source], installed: true, adapters: [] as AdapterChoice[] };
function Screen({ sources = props.sources, installed = true, adapters = props.adapters }: { sources?: typeof source[]; installed?: boolean; adapters?: AdapterChoice[] }) {
  return <SourcesScreen slug="acme" role="OWNER" data={{ installed, sources: sources.map(toSource), repository: { repoOwner: "acme", repoName: "web", baseBranch: "main" } }} adapters={adapters} now={oldProps.now} />;
}
beforeEach(() => { vi.resetAllMocks(); actions.load.mockResolvedValue({ ok: true, detail: { ...toSource(source), installed: true, languages: [] } }); actions.detectRepoFormats.mockResolvedValue({ ok: true, candidates: [candidate("web"), candidate("app")] }); });
const find = (label: string) => [...document.querySelectorAll("button")].find(b => b.textContent === label)!;
it("재시도는 한 소스만 보내고 리프레시 뒤에도 카드 결과를 유지한다", async () => {
  actions.runFirstIngest.mockResolvedValue({ ok: true, count: 10, failed: 1, errors: [] });
  const { container, rerender } = await render(<Screen {...props} />);
  await act(async () => { await userEvent.setup().click(document.querySelector("[data-source-row]")!); });
  await act(async () => { await userEvent.setup().click(find("Run first sync")); });
  expect(actions.runFirstIngest).toHaveBeenCalledWith({ slug: "acme", surfaceSlug: "web" });
  await rerender(<Screen {...props} sources={[{ ...source, lastCommitSha: "done" }]} />);
  expect(container.querySelector('[role="status"]')?.textContent).toContain("10");
  expect(container.querySelector('a button')).toBeNull();
});
it("설치가 없으면 재시도를 막는다", async () => {
  actions.load.mockResolvedValue({ ok: true, detail: { ...toSource(source), installed: false, languages: [] } });
  await render(<Screen {...props} installed={false} />);
  await act(async () => { await userEvent.setup().click(document.querySelector("[data-source-row]")!); });
  expect(find("Run first sync").disabled).toBe(true);
});
it("추가 실패에도 선택을 유지하고 기존 소스는 요청에서 제외한다", async () => {
  actions.addSurfaces.mockResolvedValue({ ok: false, error: "resource-limit" });
  await render(<Screen {...props} />);
  await act(async () => { await userEvent.setup().click(find("Add sources")); });
  const boxes = [...document.querySelectorAll<HTMLButtonElement>('[role="checkbox"]')];
  expect(boxes[0]?.disabled).toBe(true); expect(boxes[0]?.getAttribute("aria-checked")).toBe("true");
  await act(async () => { await userEvent.setup().click(boxes[1]!); });
  const submit = document.querySelector<HTMLButtonElement>('[data-add-sources]')!;
  await act(async () => { await userEvent.setup().click(submit); });
  expect(actions.addSurfaces).toHaveBeenCalledWith({ slug: "acme", picks: [{ adapter: "json-catalog", pathTemplate: "app/{locale}.json", baseLocale: "en" }] });
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(boxes[1]?.getAttribute("aria-checked")).toBe("true");
  expect(submit.disabled).toBe(false);
  expect(document.body.textContent).toContain("Nothing was added");
});
it("새 소스의 SHA가 생겨도 YAML 수정 안내는 추가 결과와 함께 남는다", async () => {
  actions.addSurfaces.mockResolvedValue({ ok: true, results: [{ surfaceSlug: "app", pathTemplate: "app/{locale}.json", count: 5, failed: 0 }], yaml: "step" });
  const { container, rerender } = await render(<Screen {...props} />);
  await act(async () => { await userEvent.setup().click(find("Add sources")); });
  await act(async () => { await userEvent.setup().click(document.querySelectorAll('[role="checkbox"]')[1]!); });
  await act(async () => { await userEvent.setup().click(document.querySelector('[data-add-sources]')!); });
  await rerender(<Screen {...props} sources={[{ ...source, lastCommitSha: "done" }]} />);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(container.textContent).toContain("Update the workflow");
});

it("수동 확정은 잠기지 않은 같은 경로의 자동 후보 어댑터를 바꾼다", async () => {
  actions.confirmManualFormat.mockResolvedValue({ ok: true, candidate: { ...candidate("app"), adapter: "yaml-catalog" } });
  actions.addSurfaces.mockResolvedValue({ ok: false, error: "resource-limit" });
  await render(<Screen {...props} adapters={[{ adapter: "json-catalog", layout: "per-locale", label: "JSON", example: "app/{locale}.json" }, { adapter: "yaml-catalog", layout: "per-locale", label: "YAML", example: "app/{locale}.json" }]} />);
  const user = userEvent.setup();
  await act(async () => { await user.click(find("Add sources")); });
  await act(async () => { await user.click(find("Set the path yourself")); });
  await act(async () => { await user.click(document.querySelector('#manual-format')!); });
  await act(async () => { await user.click([...document.querySelectorAll('[role="option"]')].find(n => n.textContent === "YAML")!); });
  await act(async () => { await user.type(document.querySelector('#manual-path')!, "app/{{locale}.json"); await user.type(document.querySelector('#manual-base')!, "en"); });
  await act(async () => { await user.click(find("Check files")); });
  await act(async () => { await user.click(document.querySelector('[data-add-sources]')!); });
  expect(actions.addSurfaces).toHaveBeenCalledWith({ slug: "acme", picks: [{ adapter: "yaml-catalog", pathTemplate: "app/{locale}.json", baseLocale: "en" }] });
});

it("추가 중에는 닫기와 모든 입력을 잠그고 완료 뒤 트리거로 돌아간다", async () => {
  let resolve!: (value: { ok: false; error: string }) => void;
  actions.addSurfaces.mockReturnValue(new Promise(r => { resolve = r; }));
  await render(<Screen {...props} />);
  const user = userEvent.setup();
  await act(async () => { await user.click(find("Add sources")); });
  await act(async () => { await user.click(document.querySelectorAll('[role="checkbox"]')[1]!); });
  await act(async () => { await user.click(document.querySelector('[data-add-sources]')!); });
  expect(document.querySelector<HTMLButtonElement>('[role="dialog"] button[aria-label="Close"]')?.disabled).toBe(true);
  for (const checkbox of document.querySelectorAll<HTMLButtonElement>('[role="checkbox"]')) expect(checkbox.disabled).toBe(true);
  await act(async () => { resolve({ ok: false, error: "resource-limit" }); });
  expect(document.querySelector<HTMLButtonElement>('[role="dialog"] button[aria-label="Close"]')?.disabled).toBe(false);
});

/** audit #23 — 수동 경로 확인의 실패는 **추가 실패가 아니다**. "Nothing was added. Your selection is still here." 아래 세우지 않는다. */
it("수동 확인 실패는 추가 실패 문장 없이 그 사유만 말한다", async () => {
  actions.confirmManualFormat.mockResolvedValue({ ok: false, error: "manual-no-match" });
  await render(<Screen {...props} adapters={[{ adapter: "json-catalog", layout: "per-locale", label: "JSON", example: "app/{locale}.json" }]} />);
  const user = userEvent.setup();
  await act(async () => { await user.click(find("Add sources")); });
  await act(async () => { await user.click(find("Set the path yourself")); });
  await act(async () => { await user.type(document.querySelector('#manual-path')!, "app/{{locale}.json"); await user.type(document.querySelector('#manual-base')!, "en"); });
  await act(async () => { await user.click(find(m.surfaces.confirm)); });
  expect(document.body.textContent).toContain(m.errors.onboarding["manual-no-match"]);
  expect(document.body.textContent).not.toContain(m.settings.sources.nothingAdded);
});

/** audit #31 — 첫 가져오기가 도는 동안 상세 푸터가 "Saving…"이라고 말하지 않는다 — 저장한 것이 없다. */
it("첫 Sync 중 상세 푸터는 저장 중이 아니라 Sync 중이다", async () => {
  let finish: (value: unknown) => void = () => {};
  actions.runFirstIngest.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await render(<Screen {...props} />);
  await act(async () => { await userEvent.setup().click(document.querySelector("[data-source-row]")!); });
  await act(async () => { await userEvent.setup().click(find("Run first sync")); });
  const footer = document.getElementById("source-open-reason")?.textContent ?? "";
  expect(footer).toBe(m.settings.sources.importing);
  expect(footer).not.toBe(m.locales.field.saving);
  await act(async () => { finish({ ok: true, count: 1, failed: 0, errors: [] }); });
});
