// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RepoHostScope } from "@/components/i18n/messages-provider";
import { SourcesScreen } from "@/components/sources/sources-screen";
import { withRepoHost } from "@/lib/i18n/host";
import type { SourceDetail, SourcesData } from "@/lib/sources/query";
import { en } from "@/messages/en";
import { render } from "./helpers/dom";

/**
 * **Sources 상세 Languages 카드** (locale-add E1 — 시안 L1–L7 · P2). 판정·지문·경로는 서버가 들고, 화면은 상세 데이터(`languages[]`의
 * `change`·`unsent` · `localeDelivery` · `pullRequestUrl`)로 배지·동작·꺼짐 이유를 세운다. 여기서는 그 조합이 시안과 같은지 잰다.
 */
vi.setConfig({ testTimeout: 20_000 });
const mocks = vi.hoisted(() => ({
  load: vi.fn(), save: vi.fn(), cancel: vi.fn(), previewAdd: vi.fn(), add: vi.fn(), previewRemove: vi.fn(), remove: vi.fn(), refresh: vi.fn(),
}));
vi.mock("@/app/(edit)/projects/[slug]/sources/actions", () => ({
  loadSourceDetail: mocks.load, updateBaseLocale: mocks.save, removeSource: vi.fn(), previewSourceRemoval: vi.fn(),
  cancelSourceLocaleRemoval: mocks.cancel, previewSourceLocaleAdd: mocks.previewAdd, addSourceLocale: mocks.add,
  previewSourceLocaleRemoval: mocks.previewRemove, removeSourceLocale: mocks.remove,
}));
vi.mock("@/app/(edit)/projects/actions", () => ({ runFirstIngest: vi.fn() }));
vi.mock("@/components/sources/add-sources-modal", () => ({ AddSourcesModal: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, replace: vi.fn(), push: vi.fn() }) }));

type Row = SourceDetail["languages"][number];
const row = (code: string, over: Partial<Row> = {}): Row => ({ code, isBase: false, orphaned: false, total: 248, translated: 200, needsReview: 0, untranslated: 48, percent: 80, change: null, unsent: false, ...over });
const add = { operation: "ADD" as const, requestedAt: new Date("2026-10-16T00:00:00Z") };
const removal = { operation: "REMOVE" as const, requestedAt: new Date("2026-10-16T00:00:00Z") };
const web = { id: "s-web", slug: "web", baseLocale: "en", declaredBaseLocale: null, lastCommitSha: "abc1234", lastCommitAt: new Date("2026-09-20T00:00:00Z"), lastImportStartedAt: null, lastImportError: null, lastImportFailedAt: null, lastImportedAt: new Date("2026-09-20T00:05:00Z"), createdAt: new Date("2026-09-19T00:00:00Z"), keys: 248, locales: 2, orphanedLocales: 0, progress: { total: 248, done: 210, review: 12, percent: 84 } };
const repository = { repoOwner: "o", repoName: "r", baseBranch: "main" };
const connection = { adapterName: "json-catalog", pathTemplate: "apps/web/locales/{locale}.json", format: "JSON catalog" };
const data = (host = "github"): SourcesData => ({ installed: true, repoHost: host, repository, sources: [web, { ...web, id: "s-emails", slug: "emails" }] });
const base = row("en", { isBase: true, translated: 248, untranslated: 0, percent: 100 });
const detail = (languages: Row[], over: Partial<SourceDetail> = {}): SourceDetail => ({
  ...web, installed: true, repoHost: "github", repository, connection, pullRequestUrl: null, importActive: false, localeDelivery: "confirmed",
  languages: [base, ...languages], ...over,
});
const editorDetail = (languages: Row[], over: Partial<SourceDetail> = {}): SourceDetail => {
  const { repository: _r, connection: _c, ...rest } = detail(languages, over);
  return rest as SourceDetail;
};

const user = () => userEvent.setup();
const card = () => [...document.querySelectorAll("section")].find(node => node.querySelector("h2")?.textContent === en.sources.languages)!;
const rowOf = (code: string) => card().querySelector<HTMLElement>(`[data-language-row="${code}"]`)!;
const headerAdd = () => card().querySelector<HTMLButtonElement>("header button")!;
const action = (code: string) => rowOf(code).querySelector<HTMLButtonElement>("[data-language-action]")!;
/** 배지는 `Badge`의 알약이다 — 톤은 variant 클래스로 잰다(soft-neutral `bg-foreground/5` · soft-amber `bg-warning-soft` · soft-red `bg-destructive/8`). */
const badgeIn = (scope: Element, text: string) => [...scope.querySelectorAll("span")].find(node => node.textContent === text && node.className.includes("bg-"));
const describedText = (node: Element) => (node.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean).map(id => document.getElementById(id)?.textContent ?? "").join(" ");
async function open(role: "OWNER" | "EDITOR" = "OWNER", host = "github") {
  const screen = <SourcesScreen slug="p" role={role} data={data(host)} adapters={[]} now={new Date("2026-10-17T00:00:00Z")} />;
  await render(host === "gitlab" ? <RepoHostScope host="gitlab">{screen}</RepoHostScope> : screen);
  await act(async () => { await user().click([...document.querySelectorAll("[data-source-row]")].find(node => node.textContent?.startsWith("web"))!); });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("카드 머리와 설명 — OWNER·EDITOR·비지원 포맷 세 갈래(L1·L4)", () => {
  it("OWNER · 지원 포맷: 설명이 앱 안 추가·제거를 말하고 머리 [Add language]가 켜져 있다", async () => {
    mocks.load.mockResolvedValue({ ok: true, detail: detail([row("ko")]) });
    await open();
    expect(card().querySelector("header")!.textContent).toContain(en.sources.languagesHelpOwner);
    expect(headerAdd().textContent).toBe(en.sources.locale.addLanguage);
    expect(headerAdd().getAttribute("aria-disabled")).toBeNull();
  });

  it("기준 언어 행의 Remove language는 꺼지고 자기 sr 사유를 든다(L1)", async () => {
    mocks.load.mockResolvedValue({ ok: true, detail: detail([row("ko")]) });
    await open();
    const baseAction = action("en");
    expect(baseAction.textContent).toBe(en.sources.locale.removeLanguage);
    expect(baseAction.getAttribute("aria-disabled")).toBe("true");
    expect(baseAction.getAttribute("title")).toBe(en.sources.locale.baseReason);
    expect(describedText(baseAction)).toBe(en.sources.locale.baseReason);
    // 보이는 사유 줄은 없다 — sr-only다.
    expect(document.getElementById(baseAction.getAttribute("aria-describedby")!)!.className).toContain("sr-only");
    const ko = action("ko");
    expect(ko.getAttribute("aria-disabled")).toBeNull();
    expect(ko.getAttribute("aria-label")).toBe(en.sources.locale.removeLabel("ko"));
  });

  it("EDITOR: 모든 동작이 숨지 않고 꺼진 채 서고, 카드 설명 문장을 사유로 잇는다(L4)", async () => {
    mocks.load.mockResolvedValue({ ok: true, detail: editorDetail([row("ko"), row("de", { change: removal, unsent: true }), row("es", { orphaned: true, translated: 164 })]) });
    await open("EDITOR");
    expect(card().querySelector("header")!.textContent).toContain(en.sources.languagesHelpEditor);
    for (const control of [headerAdd(), action("ko"), action("de"), action("es")]) {
      expect(control.getAttribute("aria-disabled")).toBe("true");
      expect(describedText(control)).toBe(en.sources.languagesHelpEditor);
    }
    expect(action("de").textContent).toBe(en.sources.locale.cancelRemoval);
    expect(action("es").textContent).toBe(en.sources.locale.addLanguage);
    // 기준 언어 행은 자기 사유가 앞선다.
    expect(describedText(action("en"))).toBe(en.sources.locale.baseReason);
    expect(card().textContent).toContain(`es ${en.sources.orphanStrip("es").slice(3)} ${en.sources.orphanStripRest(164)} ${en.sources.orphanStripEditor}`);
  });

  it("비지원 포맷 OWNER: 새 추가·제거는 꺼지고 남은 Adding·Removing의 취소만 켜진다(L4)", async () => {
    mocks.load.mockResolvedValue({ ok: true, detail: detail([
      row("ko"), row("fr", { change: add, unsent: true, translated: 6 }), row("de", { change: removal, unsent: true }), row("es", { orphaned: true, translated: 3 }),
    ], { connection: { adapterName: "yaml-catalog", pathTemplate: "config/locales/{locale}.yml", format: "YAML" } }) });
    await open();
    expect(card().querySelector("header")!.textContent).toContain(en.sources.languagesHelp);
    for (const control of [headerAdd(), action("ko"), action("es")]) {
      expect(control.getAttribute("aria-disabled")).toBe("true");
      expect(describedText(control)).toBe(en.sources.languagesHelp);
    }
    expect(action("fr").getAttribute("aria-disabled")).toBeNull();
    expect(action("de").getAttribute("aria-disabled")).toBeNull();
    expect(card().textContent).toContain(en.sources.orphanStripUnsupported);
  });
});

describe("행 상태 — 배지 셋 × 전달 축(L2·L3)", () => {
  it("Adding 값 0개: 중립 배지 + 파일 없음 안내, Remove language", async () => {
    mocks.load.mockResolvedValue({ ok: true, detail: detail([row("fr", { change: add, translated: 0, untranslated: 248, percent: 0 })]) });
    await open();
    const fr = rowOf("fr");
    expect(badgeIn(fr, en.sources.adding)?.className).toContain("bg-foreground/5");
    expect(fr.textContent).toContain(en.sources.locale.noFileYet);
    expect(action("fr").textContent).toBe(en.sources.locale.removeLanguage);
    expect(action("fr").getAttribute("aria-disabled")).toBeNull();
  });

  it("Adding + Unsent · Removing + Unsent(읽기 전용 안내 · Cancel removal · Open 유지)", async () => {
    mocks.load.mockResolvedValue({ ok: true, detail: detail([row("fr", { change: add, unsent: true, translated: 9 }), row("de", { change: removal, unsent: true })]) });
    await open();
    expect(rowOf("fr").textContent).toContain(en.sources.adding);
    expect(rowOf("fr").textContent).toContain(en.translations.workspace.list.notSent);
    const de = rowOf("de");
    expect(badgeIn(de, en.sources.removing)?.className).toContain("bg-warning-soft");
    expect(de.textContent).toContain(en.translations.workspace.list.notSent);
    expect(de.textContent).toContain(en.sources.locale.readOnly);
    expect(action("de").textContent).toBe(en.sources.locale.cancelRemoval);
    expect(action("de").getAttribute("aria-label")).toBe(en.sources.locale.cancelLabel("de"));
    // Removing은 읽기 전용 상세로 간다 — Open이 링크로 남는다.
    expect(de.querySelector("a[href]")?.textContent).toContain(en.sources.openLanguage);
  });

  it("전달됨: Unsent 대신 마지막 PR 링크(새 탭) — Adding·Removing만", async () => {
    mocks.load.mockResolvedValue({ ok: true, detail: detail([
      row("fr", { change: add, translated: 9 }), row("de", { change: removal }), row("ko"),
    ], { pullRequestUrl: "https://github.com/o/r/pull/128" }) });
    await open();
    for (const code of ["fr", "de"]) {
      const link = [...rowOf(code).querySelectorAll("a")].find(node => node.textContent === en.sources.locale.viewPullRequest("#128"));
      expect(link?.getAttribute("href")).toBe("https://github.com/o/r/pull/128");
      expect(link?.getAttribute("target")).toBe("_blank");
      expect(rowOf(code).textContent).not.toContain(en.translations.workspace.list.notSent);
    }
    // 활성 행은 링크를 세우지 않는다 — lastPrUrl은 그 언어를 실었다는 뜻이 아니다.
    expect(rowOf("ko").textContent).not.toContain("View pull request");
  });

  it("번호를 못 뽑는 주소면 링크를 세우지 않는다", async () => {
    mocks.load.mockResolvedValue({ ok: true, detail: detail([row("de", { change: removal })], { pullRequestUrl: "https://example.com/x" }) });
    await open();
    expect(rowOf("de").querySelector("a[target]")).toBeNull();
  });

  it("전달된 제거를 취소함 → 활성 + Unsent + Publish 안내(L2 ⑦)", async () => {
    mocks.load.mockResolvedValue({ ok: true, detail: detail([row("de", { unsent: true })]) });
    await open();
    expect(rowOf("de").textContent).toContain(en.translations.workspace.list.notSent);
    expect(rowOf("de").textContent).toContain(en.sources.locale.publishToUpdate);
    expect(action("de").textContent).toBe(en.sources.locale.removeLanguage);
  });

  it("Inactive: danger 배지 · Add language · Open 꺼짐 · 띠의 OWNER 복구 문장(L3)", async () => {
    mocks.load.mockResolvedValue({ ok: true, detail: detail([row("es", { orphaned: true, translated: 164 }), row("fr", { orphaned: true, translated: 9, unsent: true })]) });
    await open();
    const es = rowOf("es");
    expect(badgeIn(es, en.sources.missingRepo)?.className).toContain("bg-destructive/8");
    expect(action("es").textContent).toBe(en.sources.locale.addLanguage);
    expect(action("es").getAttribute("aria-label")).toBe(en.sources.locale.addLabel("es"));
    expect(action("es").getAttribute("aria-disabled")).toBeNull();
    const openButton = [...es.querySelectorAll("button")].find(node => node.textContent === en.sources.openLanguage)!;
    expect(openButton.getAttribute("aria-disabled")).toBe("true");
    expect(card().textContent).toContain(`es ${en.sources.orphanStrip("es").slice(3)} ${en.sources.orphanStripRest(164)} ${en.sources.orphanStripOwner}`);
    // 전달된 추가를 취소함 = Inactive + Unsent + Publish 안내.
    expect(rowOf("fr").textContent).toContain(en.translations.workspace.list.notSent);
    expect(rowOf("fr").textContent).toContain(en.sources.locale.publishToUpdate);
  });

  it("전달 확인 안 됨: 값 있는 Adding·Removing만 막고 이유를 잇는다, 값 0개 Adding·머리 Add는 켜져 있다(L3)", async () => {
    mocks.load.mockResolvedValue({ ok: true, detail: detail([
      row("de", { change: removal, unsent: true }), row("fr", { change: add, translated: 9, unsent: true }), row("zh-CN", { change: add, translated: 0, percent: 0 }),
    ], { localeDelivery: "unconfirmed" }) });
    await open();
    for (const code of ["de", "fr"]) {
      expect(rowOf(code).textContent).toContain(en.sources.locale.notConfirmed);
      expect(action(code).getAttribute("aria-disabled")).toBe("true");
      expect(describedText(action(code))).toBe(en.sources.locale.notConfirmedHelp);
    }
    expect(rowOf("zh-CN").textContent).not.toContain(en.sources.locale.notConfirmed);
    expect(action("zh-CN").getAttribute("aria-disabled")).toBeNull();
    expect(headerAdd().getAttribute("aria-disabled")).toBeNull();
  });

  it("GitLab: merge request 낱말과 !N(L2·L3 GitLab판)", async () => {
    mocks.load.mockResolvedValue({ ok: true, detail: detail([row("de", { change: removal }), row("ko", { unsent: true })], { repoHost: "gitlab", pullRequestUrl: "https://gitlab.com/g/app/-/merge_requests/128" }) });
    await open("OWNER", "gitlab");
    const gl = withRepoHost(en, "gitlab");
    expect(rowOf("de").textContent).toContain(gl.sources.locale.viewPullRequest("!128"));
    expect(gl.sources.locale.viewPullRequest("!128")).toBe("View merge request !128");
    expect(rowOf("ko").textContent).toContain(gl.sources.locale.publishToUpdate);
    expect(card().textContent).not.toMatch(/pull request/i);
  });
});

describe("Cancel removal — 확인 없이 카드 notice로 결과를 말한다(L7)", () => {
  it("전달된 제거 취소 성공: 상태 알림이 Publish를 말하고, 다시 읽은 같은 행의 Remove language로 포커스가 간다", async () => {
    mocks.load.mockResolvedValueOnce({ ok: true, detail: detail([row("de", { change: removal, unsent: true })]) })
      .mockResolvedValue({ ok: true, detail: detail([row("de", { unsent: true })]) });
    mocks.cancel.mockResolvedValue({ ok: true, delivered: true });
    await open();
    await act(async () => { await user().click(action("de")); });
    expect(mocks.cancel).toHaveBeenCalledWith({ slug: "p", surfaceSlug: "web", localeCode: "de" });
    const notice = card().querySelector("[data-card-notice] [role='status']")!;
    expect(notice.textContent).toContain(`${en.sources.locale.staysIn("de", "web")} ${en.sources.locale.publishToUpdate}`);
    await vi.waitFor(() => expect(document.activeElement).toBe(action("de")));
    expect(action("de").textContent).toBe(en.sources.locale.removeLanguage);
  });

  it("전달 전 취소 성공은 한 문장이다", async () => {
    mocks.load.mockResolvedValueOnce({ ok: true, detail: detail([row("de", { change: removal })]) }).mockResolvedValue({ ok: true, detail: detail([row("de")]) });
    mocks.cancel.mockResolvedValue({ ok: true, delivered: false });
    await open();
    await act(async () => { await user().click(action("de")); });
    expect(card().querySelector("[data-card-notice]")!.textContent).toBe(en.sources.locale.staysIn("de", "web"));
  });

  it.each([
    { error: "publish-unsettled", text: en.sources.locale.cancelUnsettled("de") },
    { error: "forbidden", text: en.sources.locale.cancelFailed("de") },
  ])("실패($error): alert 문장 · 행 그대로 · 포커스는 Cancel removal에 남는다", async ({ error, text }) => {
    mocks.load.mockResolvedValue({ ok: true, detail: detail([row("de", { change: removal, unsent: true })]) });
    mocks.cancel.mockResolvedValue({ ok: false, error });
    await open();
    await act(async () => { await user().click(action("de")); });
    expect(card().querySelector("[data-card-notice] [role='alert']")?.textContent).toContain(text);
    expect(document.activeElement).toBe(action("de"));
    expect(action("de").textContent).toBe(en.sources.locale.cancelRemoval);
  });
});

describe("기준 언어 — 언어 변경 때문에 막힌 선언(P2)", () => {
  it("locale-change-pending은 일반 실패 문구로 접히지 않는다", async () => {
    mocks.load.mockResolvedValue({ ok: true, detail: detail([row("ko"), row("ja")]) });
    mocks.save.mockResolvedValue({ ok: false, error: "locale-change-pending" });
    await open();
    await act(async () => { await user().click(document.getElementById("base-locale")!); });
    await act(async () => { await user().click([...document.querySelectorAll('[role="option"]')].find(node => node.textContent === "ja")!); });
    await act(async () => { await user().click([...document.querySelectorAll("button")].find(node => node.textContent === en.locales.field.save)!); });
    const error = document.querySelector("[data-field-error]")!;
    expect(error.textContent).toBe(en.sources.localeChangePending);
    expect(error.textContent).not.toBe(en.locales.field.failed);
  });

  it("후보에서 추가 중·제거 중 언어를 뺀다", async () => {
    mocks.load.mockResolvedValue({ ok: true, detail: detail([row("ko"), row("fr", { change: add }), row("de", { change: removal })]) });
    await open();
    await act(async () => { await user().click(document.getElementById("base-locale")!); });
    expect([...document.querySelectorAll('[role="option"]')].map(node => node.textContent)).toEqual(["en", "ko"]);
  });
});

describe("리뷰 🟡 — 예약한 포커스", () => {
  it("추가 뒤 다시 읽기가 실패해 새 행이 안 서면, 사람이 다른 곳을 조작한 뒤의 다음 다시 읽기가 포커스를 빼앗지 않는다", async () => {
    mocks.load.mockResolvedValueOnce({ ok: true, detail: detail([row("ko")]) }).mockResolvedValueOnce({ failed: true });
    mocks.previewAdd.mockResolvedValue({ ok: true, action: "create", path: "apps/web/locales/fr.json", revive: 0 });
    mocks.add.mockResolvedValue({ ok: true, action: "create", path: "apps/web/locales/fr.json", reissued: 0 });
    await open();
    await act(async () => { await user().click(headerAdd()); });
    const option = [...document.querySelectorAll('[role="option"]')].find(node => node.querySelector("[data-option-code]")?.textContent === "fr")!;
    await act(async () => { await user().click(option); });
    // 확정은 위에 선 추가 Dialog의 것이다 — 아래 상세 모달 머리에도 같은 낱말의 버튼이 있다.
    const confirmAdd = () => [...document.querySelectorAll('[role="dialog"] button')].filter(node => node.textContent === en.sources.locale.addLanguage).at(-1)!;
    await vi.waitFor(() => expect(confirmAdd().getAttribute("aria-disabled")).toBeNull());
    await act(async () => { await user().click(confirmAdd()); });
    // 다시 읽기가 실패했다 — 새 행이 없다. 사람이 다른 곳을 조작한다.
    const retry = await vi.waitFor(() => [...document.querySelectorAll("button")].find(node => node.textContent === en.sources.retry)!);
    await act(async () => { await user().click(card().querySelector("h2")!); });
    mocks.load.mockResolvedValue({ ok: true, detail: detail([row("fr", { change: add, translated: 0, percent: 0 }), row("ko")]) });
    retry.focus();
    await act(async () => { await user().click(retry); });
    await vi.waitFor(() => expect(rowOf("fr")).not.toBeNull());
    expect(document.activeElement).not.toBe(rowOf("fr").querySelector("a[href]"));
  });
});
