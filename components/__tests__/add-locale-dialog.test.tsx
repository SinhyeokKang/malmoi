// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SourcesScreen } from "@/components/sources/sources-screen";
import type { SourceDetail, SourcesData } from "@/lib/sources/query";
import { languageName } from "@/lib/onboarding/language-name";
import { en } from "@/messages/en";
import { ko } from "@/messages/ko";
import { key, render } from "./helpers/dom";

/**
 * **언어 추가 Dialog** (locale-add E1 — 시안 A1–A5). 경로·되살릴 수·필드 판정은 서버 미리보기(`previewSourceLocaleAdd`)가 주고 화면은 템플릿을
 * 채우지 않는다(미리보기 경로 = 실행 경로). 여기서는 프리셋 목록·미리보기 상태·오류 자리·성공 notice·포커스를 잰다.
 */
vi.setConfig({ testTimeout: 20_000 });
const mocks = vi.hoisted(() => ({ load: vi.fn(), previewAdd: vi.fn(), add: vi.fn(), refresh: vi.fn() }));
vi.mock("@/app/(edit)/projects/[slug]/sources/actions", () => ({
  loadSourceDetail: mocks.load, updateBaseLocale: vi.fn(), removeSource: vi.fn(), previewSourceRemoval: vi.fn(),
  cancelSourceLocaleRemoval: vi.fn(), previewSourceLocaleAdd: mocks.previewAdd, addSourceLocale: mocks.add,
  previewSourceLocaleRemoval: vi.fn(), removeSourceLocale: vi.fn(),
}));
vi.mock("@/app/(edit)/projects/actions", () => ({ runFirstIngest: vi.fn() }));
vi.mock("@/components/sources/add-sources-modal", () => ({ AddSourcesModal: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, replace: vi.fn(), push: vi.fn() }) }));

type Row = SourceDetail["languages"][number];
const row = (code: string, over: Partial<Row> = {}): Row => ({ code, isBase: false, orphaned: false, total: 248, translated: 200, needsReview: 0, untranslated: 48, percent: 80, change: null, unsent: false, ...over });
const web = { id: "s-web", slug: "web", baseLocale: "en", declaredBaseLocale: null, lastCommitSha: "abc1234", lastCommitAt: new Date("2026-09-20T00:00:00Z"), lastImportStartedAt: null, lastImportError: null, lastImportFailedAt: null, lastImportedAt: new Date("2026-09-20T00:05:00Z"), createdAt: new Date("2026-09-19T00:00:00Z"), keys: 248, locales: 3, orphanedLocales: 1, progress: { total: 248, done: 210, review: 12, percent: 84 } };
const repository = { repoOwner: "o", repoName: "r", baseBranch: "main" };
const json = { adapterName: "json-catalog", pathTemplate: "apps/web/locales/{locale}.json", format: "JSON catalog" };
const chrome = { adapterName: "chrome-locales", pathTemplate: "extension/_locales/{locale}/messages.json", format: "Chrome extension" };
const data: SourcesData = { installed: true, repoHost: "github", repository, sources: [web, { ...web, id: "s-emails", slug: "emails" }] };
const base = row("en", { isBase: true, translated: 248, untranslated: 0, percent: 100 });
const detail = (languages: Row[], over: Partial<SourceDetail> = {}): SourceDetail => ({
  ...web, installed: true, repoHost: "github", repository, connection: json, pullRequestUrl: null, importActive: false, localeDelivery: "confirmed",
  languages: [base, ...languages], ...over,
});
const standard = detail([row("ja"), row("ko"), row("es", { orphaned: true, translated: 164 })]);

const user = () => userEvent.setup();
const card = () => [...document.querySelectorAll("section")].find(node => node.querySelector("h2")?.textContent === en.sources.languages)!;
const dialog = () => [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(node => node.querySelector("h2")?.textContent?.includes(" to web"));
const combobox = () => dialog()!.querySelector<HTMLInputElement>('input[role="combobox"]')!;
const options = () => [...document.querySelectorAll<HTMLElement>('[role="listbox"] [role="option"]')];
const option = (code: string) => options().find(node => node.querySelector("[data-option-code]")?.textContent === code);
const confirm = () => [...dialog()!.querySelectorAll("button")].find(node => node.textContent === en.sources.locale.addLanguage)!;
async function open(value: SourceDetail = standard, uiLocale?: "ko") {
  mocks.load.mockResolvedValue({ ok: true, detail: value });
  await render(<SourcesScreen slug="p" role="OWNER" data={data} adapters={[]} now={new Date("2026-10-17T00:00:00Z")} />, uiLocale ? { uiLocale } : {});
  await act(async () => { await user().click([...document.querySelectorAll("[data-source-row]")].find(node => node.textContent?.startsWith("web"))!); });
}
async function openAdd() { await act(async () => { await user().click(card().querySelector("header button")!); }); }
async function choose(code: string) { await act(async () => { await user().click(option(code)!); }); }

beforeEach(() => {
  vi.clearAllMocks();
  mocks.previewAdd.mockResolvedValue({ ok: true, action: "create", path: "apps/web/locales/fr.json", revive: 0 });
});

describe("json 프리셋 + 자유 입력(A1)", () => {
  it("열면 입력에 포커스하고 목록이 열린다 — 이 소스에 있던 언어(번역 수) 위, 이미 있는 코드는 남기고 Added로 꺼진다", async () => {
    await open();
    await openAdd();
    expect(dialog()!.querySelector("h2")!.textContent).toBe(en.sources.locale.addTitle("web"));
    expect(dialog()!.textContent).toContain(en.sources.locale.addBody);
    expect(document.activeElement).toBe(combobox());
    expect(combobox().getAttribute("placeholder")).toBe(en.sources.locale.codePlaceholder);
    const groups = [...document.querySelectorAll('[role="listbox"] [role="group"]')];
    expect(groups.map(group => group.getAttribute("aria-label"))).toEqual([en.sources.locale.previously, en.sources.locale.common]);
    expect(option("es")!.textContent).toContain("Spanish");
    expect(option("es")!.textContent).toContain(en.sources.locale.translationCount(164));
    expect(option("de")!.textContent).toContain("German");
    for (const code of ["ja", "ko"]) {
      expect(option(code)!.getAttribute("aria-disabled")).toBe("true");
      expect(option(code)!.textContent).toContain(en.sources.locale.added);
    }
    // 확정은 아직 꺼져 있다 — 고른 코드가 없다.
    expect(confirm().getAttribute("aria-disabled")).toBe("true");
    expect(dialog()!.textContent).toContain(en.sources.locale.codeHelp);
  });

  it("이름은 화면 언어다 — ko 화면이면 독일어", async () => {
    await open(standard, "ko");
    const koCard = [...document.querySelectorAll("section")].find(node => node.querySelector("h2")?.textContent === ko.sources.languages)!;
    await act(async () => { await user().click(koCard.querySelector("header button")!); });
    const de = options().find(node => node.querySelector("[data-option-code]")?.textContent === "de")!;
    expect(de.textContent).toContain("독일어");
    expect(document.body.textContent).toContain(ko.sources.locale.common);
  });

  it("구분자는 소스를 따른다 — 밑줄 지역 코드가 있으면 프리셋도 밑줄이고, 이름은 밑줄 코드에서도 나온다", async () => {
    await open(detail([row("pt_BR")]));
    await openAdd();
    expect(option("zh_CN")).toBeDefined();
    expect(option("zh-CN")).toBeUndefined();
    expect(option("zh_CN")!.textContent).toContain(languageName("zh-CN", "en"));
    expect(option("pt_BR")!.getAttribute("aria-disabled")).toBe("true");
  });

  it("치면 걸러지고, 목록 밖 코드는 맨 위 Use this code 행으로 그대로 쓴다", async () => {
    await open();
    await openAdd();
    await act(async () => { await user().type(combobox(), "fr-CA"); });
    expect(options()[0]!.textContent).toContain("fr-CA");
    expect(options()[0]!.textContent).toContain(en.sources.locale.useCode);
    expect(option("fr")).toBeDefined();
    expect(option("de")).toBeUndefined();
    await key(combobox(), "Enter");
    expect(mocks.previewAdd).toHaveBeenLastCalledWith({ slug: "p", surfaceSlug: "web", localeCode: "fr-CA" });
  });
});

describe("미리보기 — 받는 중 · 실패 · 유효 · 되살림(A1·A4)", () => {
  it("프리셋을 고르면 미리보기를 부르고, 받는 동안 파일 자리에 골격 · 확정 꺼짐 → 경로와 파일 안내", async () => {
    let resolve!: (value: unknown) => void;
    mocks.previewAdd.mockReturnValue(new Promise(r => { resolve = r; }));
    await open();
    await openAdd();
    await choose("fr");
    expect(mocks.previewAdd).toHaveBeenCalledWith({ slug: "p", surfaceSlug: "web", localeCode: "fr" });
    expect(combobox().value).toBe("fr");
    expect(dialog()!.querySelector("[data-add-preview-skeleton]")).not.toBeNull();
    expect(confirm().getAttribute("aria-disabled")).toBe("true");
    await act(async () => { resolve({ ok: true, action: "create", path: "apps/web/locales/fr.json", revive: 0 }); });
    expect(dialog()!.querySelector("[data-add-preview-skeleton]")).toBeNull();
    const file = dialog()!.querySelector("[data-add-file]")!;
    expect(file.textContent).toContain(en.sources.locale.fileToCreate);
    expect(file.textContent).toContain("apps/web/locales/fr.json");
    expect(file.textContent).toContain(en.sources.locale.noFileYet);
    expect(confirm().getAttribute("aria-disabled")).toBeNull();
  });

  it("코드 모양을 친 입력도 미리보기를 부른다", async () => {
    await open();
    await openAdd();
    await act(async () => { await user().type(combobox(), "fr"); });
    // 치는 동안은 쉼 뒤에 부른다 — 한 글자마다 서버를 부르지 않는다.
    await vi.waitFor(() => expect(mocks.previewAdd).toHaveBeenLastCalledWith({ slug: "p", surfaceSlug: "web", localeCode: "fr" }));
    expect(mocks.previewAdd).toHaveBeenCalledTimes(1);
  });

  it("실패: danger Alert + Try again, 확정 꺼짐 — Try again이 다시 받는다", async () => {
    mocks.previewAdd.mockResolvedValueOnce({ ok: false, error: "unavailable" });
    await open();
    await openAdd();
    await choose("fr");
    const alert = dialog()!.querySelector("[data-alert='danger']")!;
    expect(alert.textContent).toContain(en.sources.locale.checkFailed);
    expect(confirm().getAttribute("aria-disabled")).toBe("true");
    await act(async () => { await user().click([...alert.querySelectorAll("button")].find(node => node.textContent === en.sources.retry)!); });
    expect(mocks.previewAdd).toHaveBeenCalledTimes(2);
    expect(dialog()!.querySelector("[data-add-file]")).not.toBeNull();
  });

  it("되살림: 복구할 번역 수를 info Alert가 먼저 말한다(A4 ①)", async () => {
    mocks.previewAdd.mockResolvedValue({ ok: true, action: "revive", path: "apps/web/locales/es.json", revive: 164 });
    await open();
    await openAdd();
    await choose("es");
    const info = dialog()!.querySelector("[data-alert='info']")!;
    expect(info.textContent).toBe(`es was in this source before. Adding it again brings back ${en.sources.locale.savedTranslations(164)}, ready to publish.`);
  });

  it("Inactive 행의 Add language는 입력 없이 그 코드로 연다(A4 ②)", async () => {
    mocks.previewAdd.mockResolvedValue({ ok: true, action: "revive", path: "apps/web/locales/es.json", revive: 164 });
    await open();
    await act(async () => { await user().click(card().querySelector<HTMLElement>('[data-language-row="es"] [data-language-action]')!); });
    expect(dialog()!.querySelector("h2")!.textContent).toBe(en.sources.locale.addAgainTitle("es", "web"));
    expect(dialog()!.querySelector('input[role="combobox"]')).toBeNull();
    expect(mocks.previewAdd).toHaveBeenCalledWith({ slug: "p", surfaceSlug: "web", localeCode: "es" });
    expect(dialog()!.querySelector("[data-alert='info']")!.textContent).toBe(`Adding it again brings back ${en.sources.locale.savedTranslations(164)}, ready to publish.`);
  });
});

describe("필드 오류 — 서버 코드가 도움말을 대신한다(A2)", () => {
  it.each([
    { code: "pt_br", error: "locale-collision", languages: [row("pt-BR")], text: en.sources.locale.errors.collision("pt_br", "pt-BR") },
    { code: "es-419", error: "invalid-code", languages: [], text: en.sources.locale.errors.unreadable },
    { code: "ko", error: "already-active", languages: [row("ko")], text: en.sources.locale.errors.alreadyActive("ko") },
    { code: "fr", error: "path-conflict", languages: [], text: en.sources.locale.errors.pathConflict },
  ])("$error", async ({ code, error, languages, text }) => {
    mocks.previewAdd.mockResolvedValue({ ok: false, error });
    await open(detail(languages));
    await openAdd();
    await act(async () => { await user().type(combobox(), code); });
    await key(combobox(), "Escape");
    await vi.waitFor(() => expect(dialog()!.querySelector("[data-field-error]")).not.toBeNull());
    const field = dialog()!.querySelector("[data-field-error]")!;
    expect(field.textContent).toBe(text);
    expect(combobox().getAttribute("aria-invalid")).toBe("true");
    expect(dialog()!.textContent).not.toContain(en.sources.locale.codeHelp);
    expect(dialog()!.querySelector("[data-add-file]")).toBeNull();
    expect(confirm().getAttribute("aria-disabled")).toBe("true");
  });

  it("코드 모양이 아닌 값을 고르면 모양 안내가 필드 오류로 선다 — 서버를 부르지 않는다", async () => {
    await open();
    await openAdd();
    await act(async () => { await user().type(combobox(), "French"); });
    await key(combobox(), "Enter");
    expect(dialog()!.querySelector("[data-field-error]")!.textContent).toBe(en.sources.locale.errors.invalidCode);
    expect(mocks.previewAdd).not.toHaveBeenCalled();
  });
});

describe("확정(A1 ⑤ · A3 ② · A5)", () => {
  it("저장 중: 입력 읽기 전용 · 닫기 막힘 → 성공하면 닫히고 notice, 새 행의 Open에 포커스", async () => {
    let finish!: (value: unknown) => void;
    mocks.add.mockReturnValue(new Promise(r => { finish = r; }));
    await open();
    await openAdd();
    await choose("fr");
    await act(async () => { await user().click(confirm()); });
    expect(mocks.add).toHaveBeenCalledWith({ slug: "p", surfaceSlug: "web", localeCode: "fr" });
    expect(combobox().readOnly).toBe(true);
    expect(confirm().getAttribute("aria-busy")).toBe("true");
    expect([...dialog()!.querySelectorAll("button")].find(node => node.getAttribute("aria-label") === en.common.close)?.hasAttribute("disabled")).toBe(true);
    mocks.load.mockResolvedValue({ ok: true, detail: detail([row("fr", { change: { operation: "ADD", requestedAt: new Date() }, translated: 0, percent: 0 }), row("ja"), row("ko"), row("es", { orphaned: true, translated: 164 })]) });
    await act(async () => { finish({ ok: true, action: "create", path: "apps/web/locales/fr.json", reissued: 0 }); });
    expect(dialog()).toBeUndefined();
    expect(card().querySelector("[data-card-notice] [role='status']")!.textContent).toContain(en.sources.locale.addedNotice("fr"));
    await vi.waitFor(() => expect(document.activeElement).toBe(card().querySelector('[data-language-row="fr"] a[href]')));
  });

  it("되살림 성공 notice는 reissued 수를 쓴다", async () => {
    mocks.previewAdd.mockResolvedValue({ ok: true, action: "revive", path: "apps/web/locales/es.json", revive: 164 });
    mocks.add.mockResolvedValue({ ok: true, action: "revive", path: "apps/web/locales/es.json", reissued: 160 });
    await open();
    await openAdd();
    await choose("es");
    await act(async () => { await user().click(confirm()); });
    expect(card().querySelector("[data-card-notice]")!.textContent).toContain(en.sources.locale.addedAgain("es", 160));
  });

  it.each([
    { error: "archived", text: en.sources.locale.archived },
    { error: "forbidden", text: en.sources.locale.addFailed },
  ])("Dialog 수준 거부($error)는 본문 끝 Alert이고 입력은 남는다", async ({ error, text }) => {
    mocks.add.mockResolvedValue({ ok: false, error });
    await open();
    await openAdd();
    await choose("fr");
    await act(async () => { await user().click(confirm()); });
    expect(dialog()!.querySelector("[data-alert='danger']")!.textContent).toContain(text);
    expect(combobox().value).toBe("fr");
  });
});

describe("Chrome — 지원 목록 Select(A3)", () => {
  it("라벨이 Language이고 목록 밖 자유 입력이 없다 · 이미 있는 코드는 꺼진 채 Added · 이름 열", async () => {
    await open(detail([row("de")], { connection: chrome }));
    await openAdd();
    expect(dialog()!.querySelector('input[role="combobox"]')).toBeNull();
    const trigger = dialog()!.querySelector<HTMLElement>('button[role="combobox"]')!;
    expect(dialog()!.textContent).toContain(en.sources.locale.chromeLabel);
    expect(trigger.textContent).toContain(en.sources.locale.chromePlaceholder);
    await act(async () => { await user().click(trigger); });
    const items = [...document.querySelectorAll('[role="option"]')];
    expect(items.length).toBe(54);
    const enAu = items.find(node => node.textContent?.startsWith("en_AU"))!;
    // 이름은 기존 헬퍼 그대로다(D8) — 표시용으로만 밑줄을 하이픈으로 바꿔 넘긴다.
    expect(enAu.textContent).toContain(languageName("en-AU", "en"));
    expect(enAu.textContent).not.toContain("en_AU en_AU");
    const de = items.find(node => node.textContent?.startsWith("de"))!;
    expect(de.getAttribute("aria-disabled")).toBe("true");
    expect(de.textContent).toContain(en.sources.locale.added);
    await act(async () => { await user().click(items.find(node => node.textContent?.startsWith("fr"))!); });
    expect(mocks.previewAdd).toHaveBeenCalledWith({ slug: "p", surfaceSlug: "web", localeCode: "fr" });
  });
});
