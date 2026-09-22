// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { SourcesScreen } from "@/components/sources/sources-screen";
import type { SourceDetail, SourcesData } from "@/lib/sources/query";
import { render } from "./helpers/dom";
vi.setConfig({ testTimeout: 20_000 });
const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), runFirstIngest: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock("@/app/(edit)/projects/[slug]/sources/actions", () => ({ loadSourceDetail: mocks.load, updateBaseLocale: mocks.save }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runFirstIngest: mocks.runFirstIngest }));
vi.mock("@/components/sources/add-sources-modal", () => ({ AddSourcesModal: ({ open, onAdded, onClose }: { open: boolean; onAdded: (r: unknown[]) => void; onClose: () => void }) => open ? <button onClick={() => { onAdded([{ surfaceSlug: "mobile", count: 9, failed: 2 }]); onClose(); }}>Finish adding</button> : null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }) }));
const source = { id: "s", slug: "web", baseLocale: "en", declaredBaseLocale: null, lastCommitSha: "abc1234", lastCommitAt: new Date("2026-09-20T00:00:00Z"), lastImportStartedAt: null, lastImportError: null, lastImportFailedAt: null, keys: 248, locales: 1, orphanedLocales: 1, progress: { total: 248, done: 210, review: 12, percent: 84 } };
const data: SourcesData = { installed: true, sources: [source] };
const detail: SourceDetail = { ...source, installed: true, languages: [{ code: "en", isBase: true, orphaned: false, total: 248, translated: 210, needsReview: 12, untranslated: 26, percent: 84 }, { code: "ja", isBase: false, orphaned: true, total: 248, translated: 0, needsReview: 0, untranslated: 248, percent: 0 }] };
const button = (text: string) => [...document.querySelectorAll('button')].find(node => node.textContent === text)!;
const open = async () => { await act(async () => { await userEvent.setup().click(document.querySelector('[data-source-row]')!); }); };
beforeEach(() => { vi.clearAllMocks(); mocks.load.mockResolvedValue({ ok: true, detail }); });
it("EDITOR는 연결계·재시도 없이 진행률과 고아 복구 안내를 본다", async () => {
  await render(<SourcesScreen slug="p" role="EDITOR" data={data} adapters={[]} now={new Date()} />);
  expect(button("Add source")).toBeUndefined();
  await open();
  expect(document.body.textContent).toContain("84%");
  expect(document.body.textContent).toContain("Source commit");
  expect(document.querySelector('time')?.getAttribute('aria-label')).toContain("UTC");
  expect(document.body.textContent).toContain("ja");
  expect(button("Run first import")).toBeUndefined();
  expect(document.querySelector('[data-source-connection]')).toBeNull();
  expect(document.querySelector('a[href*="settings"]')).toBeNull();
  expect(new URL(document.querySelector('a[href*="locales=en"]')!.getAttribute('href')!, 'http://localhost').searchParams.get('ns')).toBe('*');
  expect(document.querySelector('a[href*="locales=ja"]')).toBeNull();
  expect(document.querySelector('button button, button a, a button')).toBeNull();
});
it.each([{ rejected: "forbidden" }, { failed: true }])("상세 오류에서 장애만 재시도한다 %j", async result => {
  mocks.load.mockResolvedValue(result);
  await render(<SourcesScreen slug="p" role="EDITOR" data={data} adapters={[]} now={new Date()} />);
  await open();
  expect(!!button("Retry")).toBe("failed" in result);
  expect(document.querySelector('[data-onboarding-panel]')?.className).toContain("min-h-0");
});
it("늦게 도착한 이전 상세는 닫힌 모달을 다시 열지 않는다", async () => {
  let resolve!: (result: unknown) => void;
  mocks.load.mockReturnValue(new Promise(r => { resolve = r; }));
  await render(<SourcesScreen slug="p" role="EDITOR" data={data} adapters={[]} now={new Date()} />);
  await open();
  expect(document.querySelectorAll('[data-language-skeleton]')).toHaveLength(3);
  await act(async () => { await userEvent.setup().click(button("Close")); });
  await act(async () => { resolve({ ok: true, detail }); });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
it("추가 결과는 refresh와 상세 열기/닫기 뒤에도 같은 소유자에 남는다", async () => {
  const ownerData = { ...data, repository: { repoOwner: "o", repoName: "r", baseBranch: "main" } };
  const view = await render(<SourcesScreen slug="p" role="OWNER" data={ownerData} adapters={[]} now={new Date()} />);
  const owner = view.container.querySelector('[data-sources-screen]');
  await act(async () => { await userEvent.setup().click(button("Add source")); await userEvent.setup().click(button("Finish adding")); });
  expect(view.container.textContent).toContain("mobile");
  await view.rerender(<SourcesScreen slug="p" role="OWNER" data={{ ...ownerData }} adapters={[]} now={new Date()} />);
  await open();
  await act(async () => { await userEvent.setup().click(button("Close")); });
  expect(view.container.querySelector('[data-sources-screen]')).toBe(owner);
  expect(view.container.textContent).toContain("mobile");
  expect(view.container.textContent).toContain("Update the workflow");
});
it("첫 적재 성공 뒤 상세 재조회 실패가 성공 결과를 뒤집지 않는다", async () => {
  const first = { ...source, lastCommitSha: null, lastImportError: "partial-import" };
  mocks.load.mockResolvedValueOnce({ ok: true, detail: { ...detail, ...first } }).mockResolvedValue({ failed: true });
  mocks.runFirstIngest.mockResolvedValue({ ok: true, count: 7, failed: 1 });
  await render(<SourcesScreen slug="p" role="OWNER" data={{ ...data, sources: [first] }} adapters={[]} now={new Date()} />);
  await open();
  await act(async () => { await userEvent.setup().click(button("Run first import")); });
  expect(document.body.textContent).toContain("7");
  expect(document.body.textContent).toContain("latest");
});
it("첫 적재 거부도 서버에 남은 실패 상태를 다시 읽는다", async () => {
  const first = { ...detail, lastCommitSha: null, lastImportError: null };
  mocks.load.mockResolvedValueOnce({ ok: true, detail: first }).mockResolvedValue({ ok: true, detail: { ...first, lastImportError: "partial-import" } });
  mocks.runFirstIngest.mockResolvedValue({ ok: false, error: "resource-limit" });
  await render(<SourcesScreen slug="p" role="OWNER" data={data} adapters={[]} now={new Date()} />);
  await open();
  await act(async () => { await userEvent.setup().click(button("Run first import")); });
  expect(mocks.load).toHaveBeenCalledTimes(2);
  expect(mocks.refresh).toHaveBeenCalled();
});
it("저장 중 닫기와 모든 번역 진입을 잠그고 거부 뒤 다시 연다", async () => {
  let resolve!: (result: unknown) => void;
  mocks.save.mockReturnValue(new Promise(r => { resolve = r; }));
  mocks.load.mockResolvedValue({ ok: true, detail: { ...detail, languages: [...detail.languages, { ...detail.languages[0], code: "ko", isBase: false }] } });
  await render(<SourcesScreen slug="p" role="OWNER" data={data} adapters={[]} now={new Date()} />);
  await open();
  const user = userEvent.setup();
  await act(async () => { await user.click(document.querySelector('[role="combobox"]')!); });
  await act(async () => { await user.click([...document.querySelectorAll('[role="option"]')].find(n => n.textContent === "ko")!); });
  await act(async () => { await user.click(button("Save")); });
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.querySelector('button[aria-label="Close"]')).toHaveProperty('disabled', true);
  expect(button('Close')).toHaveProperty('disabled', true);
  expect(dialog.querySelector('a')).toBeNull();
  expect([...dialog.querySelectorAll('button')].filter(n => n.textContent === 'Open').every(n => n.disabled)).toBe(true);
  await act(async () => { resolve({ ok: false, error: 'orphaned-locale' }); });
  expect(button('Close')).toHaveProperty('disabled', false);
  expect(dialog.querySelector('a[href*="locales=en"]')).not.toBeNull();
});
it.each(["OWNER", "EDITOR"] as const)("소스가 없을 때 안내와 추가 권한 %s", async role => {
  await render(<SourcesScreen slug="p" role={role} data={{ installed: true, sources: [] }} adapters={[]} now={new Date()} />);
  expect(document.querySelector('[data-source-row]')).toBeNull();
  expect(!!button('Add source')).toBe(role === 'OWNER');
  expect(document.body.textContent).toContain(role === 'OWNER' ? 'Add a source' : 'Ask a project owner');
});
// 아래 셋은 실브라우저 대조(2026-09-22)에서 시안과 갈린 자리다 — 색·글리프라 값 테스트로는 안 잡힌다.
const failedFirst = { ...source, lastCommitSha: null, lastImportError: "parse-failed", lastImportFailedAt: new Date("2026-09-20T00:00:00Z") };
it.each([
  { state: "imported" as const, row: source, icon: false, tone: "default", label: "Imported" },
  { state: "failed-first" as const, row: failedFirst, icon: true, tone: "failed", label: "First import failed" },
  { state: "failed-after" as const, row: { ...source, lastImportError: "import-failed", lastImportFailedAt: new Date("2026-09-20T00:00:00Z") }, icon: true, tone: "failed", label: "Last import failed" },
  { state: "importing" as const, row: { ...source, lastCommitSha: null, lastImportStartedAt: new Date() }, icon: true, tone: "default", label: "Importing" },
])("목록 행은 적재 상태를 색이 아니라 낱말과 글리프로도 말한다 $state", async ({ state, row, icon, tone, label }) => {
  await render(<SourcesScreen slug="p" role="EDITOR" data={{ ...data, sources: [row] }} adapters={[]} now={new Date()} />);
  const status = document.querySelector(`[data-source-status="${state}"]`);
  expect(status).not.toBeNull();
  expect(status!.textContent).toContain(label);
  expect(!!status!.querySelector("svg")).toBe(icon);
  // 장식이라 접근성 트리에 이름 없는 그래픽으로 새면 "색만으로 말하지 않는다"가 반대로 깨진다.
  expect([...status!.querySelectorAll("svg")].every(node => node.getAttribute("aria-hidden") !== null)).toBe(true);
  expect(document.querySelector("[data-source-glyph]")?.getAttribute("data-tone")).toBe(tone);
});
it("상세의 상태 줄은 Alert 아이콘 옆에 같은 글리프를 또 세우지 않는다", async () => {
  mocks.load.mockResolvedValue({ ok: true, detail: { ...detail, ...failedFirst } });
  await render(<SourcesScreen slug="p" role="EDITOR" data={{ ...data, sources: [failedFirst] }} adapters={[]} now={new Date()} />);
  await open();
  const status = document.querySelector('[role="dialog"] [data-source-status]')!;
  expect(status.textContent).toContain("First import failed");
  expect(status.querySelector("svg")).toBeNull();
});
it("상세를 읽지 못하면 설명이 로딩 중이라고 말하지 않는다", async () => {
  mocks.load.mockResolvedValue({ failed: true });
  await render(<SourcesScreen slug="p" role="EDITOR" data={data} adapters={[]} now={new Date()} />);
  await open();
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain("We couldn't load this source");
  expect(dialog.textContent).not.toContain("Loading source details");
});
it("사라진 언어는 낱말과 색을 함께 들되 파일이 사라졌다고 단정하지 않는다", async () => {
  await render(<SourcesScreen slug="p" role="EDITOR" data={data} adapters={[]} now={new Date()} />);
  await open();
  const row = [...document.querySelectorAll('[role="dialog"] tbody tr')].find(node => node.textContent?.startsWith("ja"))!;
  expect(row.textContent).toContain("Missing");
  expect(row.textContent).toContain("wasn't found in the last import");
  expect(row.textContent).not.toContain("File missing");
});
it("적용 대기는 배지·필드 표식·값 두 줄 셋으로 말하고 같은 낱말을 두 번 쓰지 않는다", async () => {
  mocks.load.mockResolvedValue({ ok: true, detail: { ...detail, declaredBaseLocale: "ja" } });
  await render(<SourcesScreen slug="p" role="OWNER" data={data} adapters={[]} now={new Date()} />);
  await open();
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent!.match(/Waiting to apply/g)).toHaveLength(1);
  expect(dialog.querySelector('[data-base-pending]')).not.toBeNull();
  expect(dialog.textContent).toContain("Applied: en");
  expect(dialog.textContent).toContain("Requested: ja");
});
it("적용 대기가 아니면 배지도 필드 표식도 없다", async () => {
  await render(<SourcesScreen slug="p" role="OWNER" data={data} adapters={[]} now={new Date()} />);
  await open();
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).not.toContain("Waiting to apply");
  expect(dialog.querySelector('[data-base-pending]')).toBeNull();
});
