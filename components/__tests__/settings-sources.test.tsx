// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { SourcesCard } from "@/components/settings/sources-card";
import { render } from "./helpers/dom";
const actions = vi.hoisted(() => ({ runFirstIngest: vi.fn(), detectRepoFormats: vi.fn(), addSurfaces: vi.fn(), confirmManualFormat: vi.fn(), loadCandidateSample: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => actions);
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({ startGithubConnect: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }));
const source = { id: "s1", slug: "web", pathTemplate: "web/{locale}.json", lastCommitSha: null, lastImportStartedAt: null, lastImportFailedAt: null, lastImportError: null, lastCommitAt: null };
const candidate = (dir: string) => ({ adapter: "json-catalog", pathTemplate: `${dir}/{locale}.json`, outputPaths: [`${dir}/en.json`], label: "JSON", locales: ["en", "ko"], baseLocale: "en", keys: { status: "counted", count: 1 }, samples: [{ locale: "en", rows: [{ key: "x", value: "X" }], total: 1 }] });
const props = { slug: "acme", owner: "acme", repo: "web", branch: "main", installationId: "1", archived: false, sources: [source], counts: [{ surfaceId: "s1", keys: 5, locales: 2 }], adapters: [], now: new Date("2026-09-20T00:00:00Z") };
beforeEach(() => { vi.resetAllMocks(); actions.detectRepoFormats.mockResolvedValue({ ok: true, candidates: [candidate("web"), candidate("app")] }); });
const find = (label: string) => [...document.querySelectorAll("button")].find(b => b.textContent === label)!;
it("재시도는 한 소스만 보내고 리프레시 뒤에도 카드 결과를 유지한다", async () => {
  actions.runFirstIngest.mockResolvedValue({ ok: true, count: 10, failed: 1, errors: [] });
  const { container, rerender } = await render(<SourcesCard {...props} />);
  await act(async () => { await userEvent.setup().click(find("Run first import")); });
  expect(actions.runFirstIngest).toHaveBeenCalledWith({ slug: "acme", surfaceSlug: "web" });
  await rerender(<SourcesCard {...props} sources={[{ ...source, lastCommitSha: "done" }]} />);
  expect(container.querySelector('[role="status"]')?.textContent).toContain("10");
  expect(container.querySelector('a button')).toBeNull();
});
it.each([{ archived: true }, { installationId: null }])("설치·보관 조건이 재시도를 막는다: %j", async extra => {
  await render(<SourcesCard {...props} {...extra} />);
  expect(find("Run first import").disabled).toBe(true);
});
it("추가 실패에도 선택을 유지하고 기존 소스는 요청에서 제외한다", async () => {
  actions.addSurfaces.mockResolvedValue({ ok: false, error: "resource-limit" });
  await render(<SourcesCard {...props} />);
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
  const { container, rerender } = await render(<SourcesCard {...props} />);
  await act(async () => { await userEvent.setup().click(find("Add sources")); });
  await act(async () => { await userEvent.setup().click(document.querySelectorAll('[role="checkbox"]')[1]!); });
  await act(async () => { await userEvent.setup().click(document.querySelector('[data-add-sources]')!); });
  await rerender(<SourcesCard {...props} sources={[{ ...source, lastCommitSha: "done" }]} />);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(container.textContent).toContain("Update the workflow");
});
