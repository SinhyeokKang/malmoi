// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SourcesScreen } from "@/components/sources/sources-screen";
import type { SourceDetail, SourcesData } from "@/lib/sources/query";
import { languageName } from "@/lib/onboarding/language-name";
import { en } from "@/messages/en";
import { es } from "@/messages/es";
import { ko } from "@/messages/ko";
import { renderToStaticMarkup } from "react-dom/server";
import { key, render } from "./helpers/dom";
import { waitForLayer } from "./helpers/layer";

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
const web = { id: "s-web", slug: "web", baseLocale: "en", declaredBaseLocale: null, lastCommitSha: "abc1234", lastCommitAt: new Date("2026-09-20T00:00:00Z"), lastImportStartedAt: null, lastImportError: null, lastImportFailedAt: null, lastImportedAt: new Date("2026-09-20T00:05:00Z"), createdAt: new Date("2026-09-19T00:00:00Z"), keys: 248, locales: 3, orphanedLocales: 1, meters: { shown: [], hidden: 0 }, progress: { total: 248, done: 210, review: 12, percent: 84 } };
const repository = { repoOwner: "o", repoName: "r", baseBranch: "main" };
const json = { adapterName: "json-catalog", pathTemplate: "apps/web/locales/{locale}.json", format: "JSON catalog" };
const chrome = { adapterName: "chrome-locales", pathTemplate: "extension/_locales/{locale}/messages.json", format: "Chrome extension" };
const data: SourcesData = { installed: true, repoHost: "github", repository, sources: [web, { ...web, id: "s-emails", slug: "emails" }] };
const base = row("en", { isBase: true, translated: 248, untranslated: 0, percent: 100 });
const detail = (languages: Row[], over: Partial<SourceDetail> = {}): SourceDetail => ({
  ...web, installed: true, repoHost: "github", repository, connection: json, pullRequestUrl: null, importActive: false, languageChangesSupported: true, localeDelivery: "confirmed",
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
  await waitForLayer(() => document.querySelector<HTMLElement>('[role="dialog"]'));
}
async function openAdd() { await act(async () => { await user().click(card().querySelector("header button")!); }); await waitForLayer(dialog); }
async function choose(code: string) {
  // 목록도 레이어다 — 다시 연 직후엔 포인터가 아직 닫혀 있다.
  await waitForLayer(() => document.querySelector<HTMLElement>('[role="listbox"]')?.parentElement);
  await act(async () => { await user().click(option(code)!); });
}

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

  /** #294 — 보존된 값이 0이면 "0개를 되돌린다"고 약속하지 않는다(#287·#288과 같은 0/1/다수 갈래). */
  it("되살림 · 보존 번역 0개: 행에서 열든 입력으로 고르든 돌아올 것이 없다고 말한다(#294)", async () => {
    mocks.previewAdd.mockResolvedValue({ ok: true, action: "revive", path: "apps/web/locales/es.json", revive: 0 });
    await open();
    await act(async () => { await user().click(card().querySelector<HTMLElement>('[data-language-row="es"] [data-language-action]')!); });
    expect(dialog()!.querySelector("[data-alert='info']")!.textContent).toBe("It has no saved translations.");
    await act(async () => { await user().click([...dialog()!.querySelectorAll("button")].find(node => node.getAttribute("aria-label") === en.common.close)!); });
    await openAdd();
    await choose("es");
    expect(dialog()!.querySelector("[data-alert='info']")!.textContent).toBe("es was in this source before. It has no saved translations.");
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

  it("코드도 이름도 아닌 값에는 고를 행이 없다 — Enter가 아무것도 고르지 않고 서버를 부르지 않는다", async () => {
    await open();
    await openAdd();
    await act(async () => { await user().type(combobox(), "Klingonese"); });
    expect(options()).toHaveLength(0);
    await key(combobox(), "Enter");
    expect(dialog()!.querySelector("[data-field-error]")).toBeNull();
    expect(mocks.previewAdd).not.toHaveBeenCalled();
    expect(confirm().getAttribute("aria-disabled")).toBe("true");
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

  it("되살림 성공 · reissued 0: 돌아온 번역 수를 말하지 않는다(#294)", async () => {
    mocks.previewAdd.mockResolvedValue({ ok: true, action: "revive", path: "apps/web/locales/es.json", revive: 0 });
    mocks.add.mockResolvedValue({ ok: true, action: "revive", path: "apps/web/locales/es.json", reissued: 0 });
    await open();
    await openAdd();
    await choose("es");
    await act(async () => { await user().click(confirm()); });
    expect(card().querySelector("[data-card-notice] [role='status']")!.textContent).toBe("Added es again.");
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

describe("리뷰 🟡 — 포커스", () => {
  it("Chrome 저장 중 트리거는 진짜 disabled가 아니다 — 포커스가 body로 빠지지 않는다", async () => {
    mocks.add.mockReturnValue(new Promise(() => {}));
    await open(detail([row("de")], { connection: chrome }));
    await openAdd();
    const trigger = dialog()!.querySelector<HTMLElement>('button[role="combobox"]')!;
    await act(async () => { await user().click(trigger); });
    await act(async () => { await user().click([...document.querySelectorAll('[role="option"]')].find(node => node.textContent?.startsWith("fr"))!); });
    await vi.waitFor(() => expect(confirm().getAttribute("aria-disabled")).toBeNull());
    trigger.focus();
    await act(async () => { confirm().click(); });
    expect(mocks.add).toHaveBeenCalled();
    expect(trigger.hasAttribute("disabled")).toBe(false);
    expect(trigger.getAttribute("aria-disabled")).toBe("true");
  });
});

describe("R-E1 fix1", () => {
  it("🟡1 코드 모양이 아닌 이름 조각에는 Use this code 행이 없다 — Enter가 이름으로 찾은 프리셋을 고른다", async () => {
    await open();
    await openAdd();
    await act(async () => { await user().type(combobox(), "Fren"); });
    expect(options().some(node => node.textContent?.includes(en.sources.locale.useCode))).toBe(false);
    await key(combobox(), "Enter");
    expect(mocks.previewAdd).toHaveBeenLastCalledWith({ slug: "p", surfaceSlug: "web", localeCode: "fr" });
    expect(dialog()!.querySelector("[data-field-error]")).toBeNull();
  });

  it.each([
    { code: "de", error: "removal-pending", text: en.sources.locale.errors.removalPending("de") },
    { code: "eo", error: "unsupported-locale", text: en.sources.locale.errors.unsupportedLocale },
    { code: "fr", error: "unsafe-path", text: en.sources.locale.errors.unsafePath("apps/web/locales/….json") },
  ])("M7 $error는 필드 자리 문장이다", async ({ code, error, text }) => {
    mocks.previewAdd.mockResolvedValue({ ok: false, error });
    await open();
    await openAdd();
    await act(async () => { await user().type(combobox(), code); });
    await key(combobox(), "Escape");
    await vi.waitFor(() => expect(dialog()!.querySelector("[data-field-error]")?.textContent).toBe(text));
    expect(dialog()!.querySelector("[data-alert='danger']")).toBeNull();
  });

  it("M8 확정의 publish-unsettled는 일반 실패로 접히지 않는다", async () => {
    mocks.add.mockResolvedValue({ ok: false, error: "publish-unsettled" });
    await open();
    await openAdd();
    await choose("fr");
    await act(async () => { await user().click(confirm()); });
    const alert = dialog()!.querySelector("[data-alert='danger']")!;
    expect(alert.textContent).toBe(en.sources.locale.addUnsettled);
    expect(alert.textContent).not.toBe(en.sources.locale.addFailed);
  });

  it("M9 응답 순서를 믿지 않는다 — 앞 요청의 늦은 응답이 마지막 요청의 결과를 덮지 않는다", async () => {
    const pending: ((value: unknown) => void)[] = [];
    mocks.previewAdd.mockImplementation(() => new Promise(resolve => { pending.push(resolve); }));
    await open();
    await openAdd();
    await choose("de");
    // 고른 값을 지워 목록을 다시 연다 — 거른 목록엔 de뿐이다.
    await act(async () => { await user().clear(combobox()); });
    await choose("fr");
    expect(pending).toHaveLength(2);
    await act(async () => { pending[1]!({ ok: true, action: "create", path: "apps/web/locales/fr.json", revive: 0 }); });
    await act(async () => { pending[0]!({ ok: true, action: "create", path: "apps/web/locales/de.json", revive: 0 }); });
    expect(dialog()!.querySelector("[data-add-file]")!.textContent).toContain("apps/web/locales/fr.json");
    expect(dialog()!.querySelector("[data-add-file]")!.textContent).not.toContain("de.json");
  });
});

/**
 * DS #268·#269·#273 — 시안 A1·A3·A4의 행·파일 블록 형. 깃발이 없는 코드도 16 자리를 남겨 코드 열이 한 선에 선다.
 */
describe("DS fix2 — 행 깃발 · 파일 블록", () => {
  const flagSlot = (node: Element) => node.querySelector<HTMLElement>("[data-option-flag]");
  it("#268 json 목록 행은 깃발 자리 · 코드 · 이름 순이고, 깃발이 있는 코드는 그 깃발을 든다", async () => {
    await open();
    await openAdd();
    const de = option("de")!;
    expect(flagSlot(de)).not.toBeNull();
    expect(flagSlot(de)!.querySelector("[style*='/flags/']")).not.toBeNull();
    // 깃발 자리가 코드보다 앞이다.
    expect(flagSlot(de)!.compareDocumentPosition(de.querySelector("[data-option-code]")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(flagSlot(option("es")!)).not.toBeNull();
  });

  it("#273 Chrome Select 항목도 같은 깃발 열이다 — 깃발이 없는 코드도 자리를 남긴다", async () => {
    await open(detail([row("de")], { connection: chrome }));
    await openAdd();
    await act(async () => { await user().click(dialog()!.querySelector<HTMLElement>('button[role="combobox"]')!); });
    const items = [...document.querySelectorAll('[role="option"]')];
    const fr = items.find(node => node.textContent?.startsWith("fr"))!;
    expect(flagSlot(fr)!.querySelector("[style*='/flags/']")).not.toBeNull();
    const enAu = items.find(node => node.textContent?.startsWith("en_AU"))!;
    expect(flagSlot(enAu)).not.toBeNull();
  });

  it("#269 파일 블록은 테두리 없는 muted 면 · radius 10 · 라벨 muted · 경로 앞 file-plus 글리프", async () => {
    await open();
    await openAdd();
    await choose("fr");
    const block = dialog()!.querySelector<HTMLElement>("[data-add-file]")!;
    const classes = block.className.split(/\s+/);
    expect(classes).toContain("bg-muted");
    expect(classes).toContain("rounded-md");
    expect(classes.some(name => name === "border" || name.startsWith("border-"))).toBe(false);
    expect(block.firstElementChild!.className).toContain("text-muted-foreground");
    const path = block.querySelector("[data-add-file-path]")!;
    expect(path.querySelector("svg")?.getAttribute("class")).toContain("lucide-file-plus");
    expect(path.textContent).toBe("apps/web/locales/fr.json");
  });
});

describe("다시 추가 경로의 수 — 0·1·2, 세 사전(#294)", () => {
  const html = (node: unknown) => renderToStaticMarkup(<>{node as ReactNode}</>);
  const cases = [
    { lang: "en", t: en,
      again: ["It has no saved translations.", "Adding it again brings back C, ready to publish.", "Adding it again brings back C, ready to publish."],
      line: ["es was in this source before. It has no saved translations.", "es was in this source before. Adding it again brings back C, ready to publish.", "es was in this source before. Adding it again brings back C, ready to publish."],
      added: ["Added es again.", "Added es again. 1 saved translation is back and unsent.", "Added es again. 2 saved translations are back and unsent."],
      kept: ["None", "1 kept in Malmoi", "2 kept in Malmoi"] },
    { lang: "ko", t: ko,
      again: ["보존된 번역이 없습니다.", "다시 추가하면 C가 돌아오고 게시할 준비가 됩니다.", "다시 추가하면 C가 돌아오고 게시할 준비가 됩니다."],
      line: ["es 언어는 전에 이 소스에 있었습니다. 보존된 번역이 없습니다.", "es 언어는 전에 이 소스에 있었습니다. 다시 추가하면 C가 돌아오고 게시할 준비가 됩니다.", "es 언어는 전에 이 소스에 있었습니다. 다시 추가하면 C가 돌아오고 게시할 준비가 됩니다."],
      added: ["es 언어를 다시 추가했습니다.", "es 언어를 다시 추가했습니다. 보존된 번역 1개가 돌아왔고 미전송 상태입니다.", "es 언어를 다시 추가했습니다. 보존된 번역 2개가 돌아왔고 미전송 상태입니다."],
      kept: ["없음", "1개 Malmoi에 보존", "2개 Malmoi에 보존"] },
    { lang: "es", t: es,
      again: ["No tiene traducciones guardadas.", "Al añadirlo de nuevo recuperas C y todo queda listo para publicar.", "Al añadirlo de nuevo recuperas C y todo queda listo para publicar."],
      line: ["es estuvo antes en esta fuente. No tiene traducciones guardadas.", "es estuvo antes en esta fuente. Al añadirlo de nuevo recuperas C y todo queda listo para publicar.", "es estuvo antes en esta fuente. Al añadirlo de nuevo recuperas C y todo queda listo para publicar."],
      added: ["Se añadió es de nuevo.", "Se añadió es de nuevo. Volvió 1 traducción guardada, sin enviar.", "Se añadió es de nuevo. Volvieron 2 traducciones guardadas, sin enviar."],
      kept: ["Ninguna", "1 en Malmoi", "2 en Malmoi"] },
  ];
  for (const c of cases) {
    it(c.lang, () => {
      const t = c.t.sources.locale;
      expect([0, 1, 2].map(n => html(t.reviveAgain(n, "C")))).toEqual(c.again);
      expect([0, 1, 2].map(n => html(t.reviveLine("es", n, "C")))).toEqual(c.line);
      expect([0, 1, 2].map(n => t.addedAgain("es", n))).toEqual(c.added);
      expect([0, 1, 2].map(n => t.keptInMalmoi(n))).toEqual(c.kept);
    });
  }
});
