// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { find, input, render } from "./helpers/dom";

/**
 * **Add sources는 ① 소스 선택 → ② 소스별 기준 언어 2단계다** (sources-add-remove A1–A7). 전엔 기준 언어 셀렉트가 하나이고
 * 포커스한 후보에만 묶여, 체크만 한 나머지 후보의 기준 언어가 한 번도 화면에 안 보인 채 제출됐다(PRODUCT §7.3 위반).
 *
 * ⚠️ 단계 전이가 상태를 지우지 않는다 — 상태는 모달 하나에 있고 단계는 본문만 바꾼다. A→B→A·늦은 미리보기 응답 역전은
 * 2026-09-13 🔁 POSTMORTEM의 형이고, 진행 중 Radix 잠금은 2026-09-14 항목(`pointerType: "mouse"`)의 형이다.
 */
const mocks = vi.hoisted(() => ({
  startGithubConnect: vi.fn(), addSurfaces: vi.fn(), confirmManualFormat: vi.fn(), detectRepoFormats: vi.fn(), loadCandidateSample: vi.fn(),
}));
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({ startGithubConnect: mocks.startGithubConnect }));
vi.mock("@/app/(edit)/projects/actions", () => ({
  addSurfaces: mocks.addSurfaces, confirmManualFormat: mocks.confirmManualFormat,
  detectRepoFormats: mocks.detectRepoFormats, loadCandidateSample: mocks.loadCandidateSample,
}));

import { AddSourcesModal } from "@/components/sources/add-sources-modal";
import { en } from "@/messages/en";
import type { CandidateSummary } from "@/lib/onboarding/detect";

const MANY = ["en", "fr", "ko", "de", "ja", "es", "pt", "it", "nl", "sv", "da"];
function candidate(pathTemplate: string, patch: Partial<CandidateSummary> = {}): CandidateSummary {
  return {
    adapter: "json-catalog", pathTemplate, locales: ["en", "ko"], outputPaths: [pathTemplate.replace("{locale}", "en"), pathTemplate.replace("{locale}", "ko")],
    baseLocale: "en", keys: { status: "counted", count: 2 },
    samples: [{ locale: "en", rows: [{ key: `${pathTemplate}:en`, value: "Hi" }], total: 2 }, { locale: "ko", rows: [{ key: `${pathTemplate}:ko`, value: "Hi" }], total: 2 }],
    ...patch,
  };
}
const web = candidate("apps/web/{locale}.json");
const emails = candidate("emails/{locale}.json");
const extension = candidate("ext/{locale}.json", { locales: MANY, outputPaths: MANY.map(code => `ext/${code}.json`), samples: [] });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
async function click(node: Element) { await act(async () => { await userEvent.setup().click(node); }); }
const button = (text: string) => {
  const node = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.trim() === text);
  if (!node) throw new Error(`Missing ${text}`);
  return node;
};
const maybeButton = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.trim() === text);
const include = (path: string) => find<HTMLElement>(document.body, `[aria-label="${en.newProject.files.include(path)}"]`);
const pick = (path: string) => find<HTMLElement>(document.body, `[aria-label="${en.newProject.files.previewCandidate(path)}"]`);
const dialog = () => find<HTMLElement>(document.body, '[role="dialog"]');
const next = () => button(en.newProject.modal.next);
const back = () => button(en.newProject.modal.back);
const confirm = () => find<HTMLButtonElement>(document.body, "[data-add-sources]");
const radio = (name: string) => [...document.querySelectorAll<HTMLElement>('[role="radio"]')].find(r => r.closest("li")?.textContent?.includes(name));

async function open(candidates: CandidateSummary[], existing: { pathTemplate: string }[] = []) {
  mocks.detectRepoFormats.mockResolvedValue({ ok: true, candidates });
  await render(<AddSourcesModal open onClose={() => {}} onAdded={() => {}} returnFocusRef={{ current: null }} slug="acme" owner="o" repo="r" branch="main"
    existing={existing} adapters={[]} server={{}} />);
}

beforeEach(() => { vi.clearAllMocks(); });

it("① 하단에 공통 기준 언어 셀렉트가 없다 — 단계 표시와 [Next]만 선다", async () => {
  await open([web, emails]);
  await click(include(emails.pathTemplate));
  // 언어 둘이라 미리보기 언어는 세그먼트다 — ①에 combobox가 하나도 없다(옛 공통 기준 언어 셀렉트).
  expect(dialog().querySelector('[role="combobox"]')).toBeNull();
  expect(dialog().textContent).toContain(en.settings.sources.step(1));
  expect(next().getAttribute("aria-disabled")).toBeNull();
  expect(document.querySelector("[data-add-sources]")).toBeNull();
});

it("① 새로 체크한 것이 없으면 [Next]가 aria-disabled이고 보이는 사유가 단계 표시를 대신한다", async () => {
  await open([web, emails], [{ pathTemplate: web.pathTemplate }]);
  expect(next().getAttribute("aria-disabled")).toBe("true");
  const reason = document.getElementById(next().getAttribute("aria-describedby")!);
  expect(reason?.textContent).toBe(en.settings.sources.selectHelp);
  expect(reason?.classList.contains("sr-only")).toBe(false);
  expect(dialog().textContent).not.toContain(en.settings.sources.step(1));
  await click(next());
  expect(dialog().textContent).toContain(en.settings.sources.add);
  expect(maybeButton(en.newProject.modal.back)).toBeUndefined();
});

it("② 새로 체크한 소스만 경로 줄이 있는 블록이 된다 — 잠긴 기존 소스는 세지 않는다", async () => {
  await open([web, emails, extension], [{ pathTemplate: web.pathTemplate }]);
  await click(include(emails.pathTemplate)); await click(include(extension.pathTemplate));
  await click(next());
  expect(dialog().querySelector("h2")?.textContent).toBe(en.settings.sources.baseTitle);
  expect(dialog().textContent).toContain(en.settings.sources.baseDescription);
  expect(dialog().textContent).toContain(en.settings.sources.step(2));
  expect(dialog().textContent).toContain(emails.pathTemplate);
  expect(dialog().textContent).toContain(extension.pathTemplate);
  expect(dialog().textContent).not.toContain(web.pathTemplate);
  // 언어 ≤ 10은 라디오 열, 넘으면 셀렉트 — 신규 프로젝트 ③과 같은 블록이다(A4).
  expect(dialog().querySelectorAll('[role="radiogroup"]')).toHaveLength(1);
  expect(dialog().querySelectorAll('[role="combobox"]')).toHaveLength(1);
});

it("② 소스가 하나여도 경로 줄이 있는 같은 형이다", async () => {
  await open([web, emails]);
  await click(include(emails.pathTemplate));
  await click(next());
  expect(dialog().textContent).toContain(emails.pathTemplate);
  expect(dialog().textContent).toContain(en.newProject.baseLocale.title);
});

it("② [Back] 뒤에도 체크·포커스·미리보기 언어·기준 언어 선택이 남고, 제출은 소스마다 고른 값을 싣는다", async () => {
  mocks.addSurfaces.mockResolvedValue({ ok: false, error: "unavailable" });
  await open([web, emails]);
  await click(include(web.pathTemplate)); await click(include(emails.pathTemplate));
  await click(pick(emails.pathTemplate));
  await click(find(document.body, '[role="radiogroup"] [role="radio"][value="ko"]'));
  expect(document.body.textContent).toContain(`${emails.pathTemplate}:ko`);
  await click(next());
  const blocks = () => [...dialog().querySelectorAll('[role="radiogroup"]')];
  expect(blocks()).toHaveLength(2);
  await click(radio("emails/ko.json")!);
  await click(back());
  expect(include(web.pathTemplate).getAttribute("aria-checked")).toBe("true");
  expect(include(emails.pathTemplate).getAttribute("aria-checked")).toBe("true");
  // 포커스 행과 미리보기 언어가 그대로다 — 미리보기 표가 emails의 ko 표본을 든다.
  expect(document.body.textContent).toContain(`${emails.pathTemplate}:ko`);
  await click(next());
  expect(radio("emails/ko.json")?.getAttribute("aria-checked")).toBe("true");
  expect(radio("apps/web/en.json")?.getAttribute("aria-checked")).toBe("true");
  await click(confirm());
  expect(mocks.addSurfaces).toHaveBeenCalledWith({ slug: "acme", picks: [
    { adapter: "json-catalog", pathTemplate: web.pathTemplate, baseLocale: "en" },
    { adapter: "json-catalog", pathTemplate: emails.pathTemplate, baseLocale: "ko" },
  ] });
});

it("A→B→A 포커스 전환의 늦은 미리보기 응답이 최신 선택을 덮지 않고, 단계를 오가도 그대로다", async () => {
  const a = candidate("a/{locale}.json", { samples: [] }), b = candidate("b/{locale}.json", { samples: [] });
  const calls: ReturnType<typeof deferred<unknown>>[] = [];
  mocks.loadCandidateSample.mockImplementation(() => { const call = deferred<unknown>(); calls.push(call); return call.promise; });
  await open([a, b]);
  await click(pick(b.pathTemplate)); await click(pick(a.pathTemplate));
  expect(calls).toHaveLength(3);
  await click(include(a.pathTemplate)); await click(next()); await click(back());
  const rows = (key: string) => ({ ok: true, rows: [{ key, value: "v" }], total: 1 });
  await act(async () => { calls[2]!.resolve(rows("a-latest")); });
  await act(async () => { calls[1]!.resolve(rows("b-late")); calls[0]!.resolve(rows("a-stale")); });
  expect(document.body.textContent).toContain("a-latest");
  expect(document.body.textContent).not.toContain("b-late");
  expect(document.body.textContent).not.toContain("a-stale");
});

it("② 추가 실패는 ②에 머물고 선택이 남는다 — 경로 충돌만 [Back]으로 고치라고 말한다", async () => {
  mocks.addSurfaces.mockResolvedValueOnce({ ok: false, error: "path-conflict", conflicts: [{ path: "emails/en.json", surfaceSlugs: ["mail"] }] });
  await open([web, emails]);
  await click(include(emails.pathTemplate)); await click(next());
  await click(confirm());
  const alert = dialog().textContent ?? "";
  expect(alert).toContain(en.settings.sources.nothingAdded);
  expect(alert).toContain(en.surfaces.conflict);
  expect(alert).toContain(en.settings.sources.conflictBack);
  expect(dialog().querySelector("h2")?.textContent).toBe(en.settings.sources.baseTitle);
  mocks.addSurfaces.mockResolvedValueOnce({ ok: false, error: "ingest-failed" });
  await click(confirm());
  expect(dialog().textContent).not.toContain(en.settings.sources.conflictBack);
  await click(back());
  expect(include(emails.pathTemplate).getAttribute("aria-checked")).toBe("true");
});

it("② 추가 중에는 [Back]·라디오·Portal 셀렉트가 잠기고 확정은 busy로 포커스를 지킨다", async () => {
  const call = deferred<unknown>(); mocks.addSurfaces.mockReturnValueOnce(call.promise);
  await open([emails, extension]);
  await click(include(emails.pathTemplate)); await click(include(extension.pathTemplate)); await click(next());
  await click(confirm());
  try {
    expect(back().disabled).toBe(true);
    expect(confirm().getAttribute("aria-busy")).toBe("true");
    expect(confirm().getAttribute("aria-disabled")).toBe("true");
    expect(radio("emails/ko.json")?.hasAttribute("disabled")).toBe(true);
    const trigger = find<HTMLElement>(dialog(), '[role="combobox"]');
    await act(async () => { const event = new MouseEvent("pointerdown", { bubbles: true, button: 0 });
      Object.defineProperty(event, "pointerType", { value: "mouse" }); trigger.dispatchEvent(event); });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.body.querySelector('[role="option"]')).toBeNull();
  } finally { await act(async () => { call.resolve({ ok: false, error: "unavailable" }); }); }
});

it("② 추가가 던지면 ②에 머물고 확인 불가 경고를 세우며 [Back] 뒤에도 그 경고와 체크가 남는다 (A7)", async () => {
  mocks.addSurfaces.mockRejectedValueOnce(new Error("offline"));
  await open([web, emails]);
  await click(include(emails.pathTemplate)); await click(next());
  await click(confirm());
  expect(dialog().querySelector("h2")?.textContent).toBe(en.settings.sources.baseTitle);
  expect(dialog().textContent).toContain(en.settings.sources.unknown);
  expect(confirm().getAttribute("aria-disabled")).toBeNull();
  await click(back());
  expect(dialog().textContent).toContain(en.settings.sources.unknown);
  expect(include(emails.pathTemplate).getAttribute("aria-checked")).toBe("true");
});

it("단계 전이는 포커스를 본문으로 옮기고 그 단계의 제목을 live 영역에 쓴다", async () => {
  await open([web, emails]);
  await click(include(emails.pathTemplate)); await click(next());
  const body = find<HTMLElement>(dialog(), "[data-onboarding-body]");
  const live = () => find<HTMLElement>(dialog(), '[aria-live="polite"]').textContent;
  expect(document.activeElement).toBe(body);
  expect(live()).toBe(en.settings.sources.baseTitle);
  await click(back());
  expect(document.activeElement).toBe(body);
  expect(live()).toBe(en.settings.sources.add);
});

it("① 수동 확인이 도는 동안 [Next]는 진짜 disabled가 아니라 aria-disabled다 — 포커스와 사유가 남는다", async () => {
  const call = deferred<unknown>(); mocks.confirmManualFormat.mockReturnValueOnce(call.promise);
  mocks.detectRepoFormats.mockResolvedValue({ ok: true, candidates: [] });
  await render(<AddSourcesModal open onClose={() => {}} onAdded={() => {}} returnFocusRef={{ current: null }} slug="acme" owner="o" repo="r" branch="main" existing={[]} adapters={[]} server={{}} />);
  await input(find<HTMLInputElement>(document.body, "#manual-path"), "i18n/{locale}.json");
  await input(find<HTMLInputElement>(document.body, "#manual-base"), "en");
  try {
    await click(button(en.surfaces.confirm));
    expect(next().disabled).toBe(false);
    expect(next().getAttribute("aria-disabled")).toBe("true");
  } finally { await act(async () => { call.resolve({ ok: false, error: "unavailable" }); }); }
});

it("손 사본 0 — ②와 신규 프로젝트 ③이 같은 소스 블록 컴포넌트를 쓴다 (A4)", () => {
  const read = (path: string) => readFileSync(path, "utf8");
  const modal = read("components/sources/add-sources-modal.tsx");
  const naming = read("components/onboarding/steps/naming.tsx");
  expect(modal).toMatch(/<SurfaceBaseLocales\b/);
  expect(naming).toMatch(/<SurfaceBaseLocales\b/);
  for (const source of [modal, naming]) {
    expect(source).not.toMatch(/function BaseLocaleFields|<RadioGroup\b|<SelectRow\b/);
  }
  // 경로 줄을 모달이 손으로 다시 그리지 않는다 — 블록은 `SurfaceBaseLocales` 하나다.
  expect(modal).not.toMatch(/BaseLocaleFields/);
  // ①·②의 바닥 [Next]·[Back]·확정은 `WizardFooter`다 — 마크업 사본을 두지 않는다 (fix1 🟡2).
  expect(modal.match(/<WizardFooter\b/g) ?? []).toHaveLength(2);
});
