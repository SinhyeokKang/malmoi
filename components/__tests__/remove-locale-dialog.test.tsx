// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RepoHostScope } from "@/components/i18n/messages-provider";
import { SourcesScreen } from "@/components/sources/sources-screen";
import { withRepoHost } from "@/lib/i18n/host";
import type { SourceDetail, SourcesData } from "@/lib/sources/query";
import { en } from "@/messages/en";
import { es } from "@/messages/es";
import { ko } from "@/messages/ko";
import { render } from "./helpers/dom";
import { waitForLayer } from "./helpers/layer";

/**
 * **언어 제거 확인 Dialog — 제거 요청 · 추가 취소 공용** (locale-add E1 — 시안 D1–D4). 무엇이 일어나는지(경로·번역 수·미전달 수·전달 여부)와
 * 지문은 같은 미리보기 응답(`previewSourceLocaleRemoval`)에서만 온다 — `remove-source-dialog.tsx`와 같은 상태 형이다.
 */
vi.setConfig({ testTimeout: 20_000 });
const mocks = vi.hoisted(() => ({ load: vi.fn(), preview: vi.fn(), remove: vi.fn(), refresh: vi.fn() }));
vi.mock("@/app/(edit)/projects/[slug]/sources/actions", () => ({
  loadSourceDetail: mocks.load, updateBaseLocale: vi.fn(), removeSource: vi.fn(), previewSourceRemoval: vi.fn(),
  cancelSourceLocaleRemoval: vi.fn(), previewSourceLocaleAdd: vi.fn(), addSourceLocale: vi.fn(),
  previewSourceLocaleRemoval: mocks.preview, removeSourceLocale: mocks.remove,
}));
vi.mock("@/app/(edit)/projects/actions", () => ({ runFirstIngest: vi.fn() }));
vi.mock("@/components/sources/add-sources-modal", () => ({ AddSourcesModal: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, replace: vi.fn(), push: vi.fn() }) }));

type Row = SourceDetail["languages"][number];
const row = (code: string, over: Partial<Row> = {}): Row => ({ code, isBase: false, orphaned: false, total: 248, translated: 200, needsReview: 0, untranslated: 48, percent: 80, change: null, unsent: false, ...over });
const add = { operation: "ADD" as const, requestedAt: new Date("2026-10-16T00:00:00Z") };
const removal = { operation: "REMOVE" as const, requestedAt: new Date("2026-10-16T00:00:00Z") };
const web = { id: "s-web", slug: "web", baseLocale: "en", declaredBaseLocale: null, lastCommitSha: "abc1234", lastCommitAt: new Date("2026-09-20T00:00:00Z"), lastImportStartedAt: null, lastImportError: null, lastImportFailedAt: null, lastImportedAt: new Date("2026-09-20T00:05:00Z"), createdAt: new Date("2026-09-19T00:00:00Z"), keys: 248, locales: 3, orphanedLocales: 0, meters: { shown: [], hidden: 0 }, progress: { total: 248, done: 210, review: 12, percent: 84 } };
const repository = { repoOwner: "o", repoName: "r", baseBranch: "main" };
const connection = { adapterName: "json-catalog", pathTemplate: "apps/web/locales/{locale}.json", format: "JSON catalog" };
const base = row("en", { isBase: true, translated: 248, untranslated: 0, percent: 100 });
const detail = (languages: Row[], over: Partial<SourceDetail> = {}): SourceDetail => ({
  ...web, installed: true, repoHost: "github", repository, connection, pullRequestUrl: "https://github.com/o/r/pull/128", importActive: false, languageChangesSupported: true, localeDelivery: "confirmed",
  languages: [base, ...languages], ...over,
});
const standard = detail([row("de", { translated: 201 }), row("fr", { change: add, translated: 9, unsent: true }), row("ko")]);
const ready = (over: Record<string, unknown> = {}) => ({ ok: true, kind: "request-removal", path: "apps/web/locales/de.json", translations: 201, pendingCount: 0, delivered: false, approval: "fp-1", ...over });

const user = () => userEvent.setup();
const card = () => [...document.querySelectorAll("section")].find(node => node.querySelector("h2")?.textContent === en.sources.languages)!;
const action = (code: string) => card().querySelector<HTMLButtonElement>(`[data-language-row="${code}"] [data-language-action]`)!;
const dialog = () => [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(node => node.querySelector("h2")?.textContent?.startsWith("Remove "));
const inDialog = (text: string) => [...(dialog()?.querySelectorAll("button") ?? [])].find(node => node.textContent === text) as HTMLButtonElement | undefined;
const facts = () => Object.fromEntries([...dialog()!.querySelectorAll("[data-removal-facts] dt")].map(dt => [dt.textContent, dt.nextElementSibling?.textContent]));
async function open(value: SourceDetail = standard, host = "github") {
  mocks.load.mockResolvedValue({ ok: true, detail: value });
  const data: SourcesData = { installed: true, repoHost: host, repository, sources: [web, { ...web, id: "s-emails", slug: "emails" }] };
  const screen = <SourcesScreen slug="p" role="OWNER" data={data} adapters={[]} now={new Date("2026-10-17T00:00:00Z")} />;
  await render(host === "gitlab" ? <RepoHostScope host="gitlab">{screen}</RepoHostScope> : screen);
  await act(async () => { await user().click([...document.querySelectorAll("[data-source-row]")].find(node => node.textContent?.startsWith("web"))!); });
  await waitForLayer(() => document.querySelector<HTMLElement>('[role="dialog"]'));
}
async function openRemove(code: string) { await act(async () => { await user().click(action(code)); }); await waitForLayer(dialog); }

beforeEach(() => {
  vi.clearAllMocks();
  mocks.preview.mockResolvedValue(ready());
});

describe("제거 요청 — 사실 판 + 손실 경고(D1)", () => {
  it("받는 동안 확정 busy · 첫 포커스 Cancel → 사실 판과 미전달 폐기·앱 코드 경고, 경고가 설명에 이어진다", async () => {
    let resolve!: (value: unknown) => void;
    mocks.preview.mockReturnValue(new Promise(r => { resolve = r; }));
    await open();
    await openRemove("de");
    expect(mocks.preview).toHaveBeenCalledWith({ slug: "p", surfaceSlug: "web", localeCode: "de" });
    expect(dialog()!.querySelector("h2")!.textContent).toBe(en.sources.locale.removeTitle("de", "web"));
    expect(dialog()!.textContent).toContain(en.sources.locale.removeBody);
    expect(inDialog(en.sources.locale.removeLanguage)!.getAttribute("aria-busy")).toBe("true");
    expect(document.activeElement).toBe(inDialog(en.common.cancel));
    await act(async () => { resolve(ready({ pendingCount: 12 })); });
    expect(facts()).toEqual({
      [en.sources.locale.factLanguage]: "de",
      [en.sources.locale.factFile]: "apps/web/locales/de.json",
      [en.sources.locale.factTranslations]: en.sources.locale.keptInMalmoi(201),
      [en.sources.locale.factPullRequest]: en.sources.locale.notSentYet,
    });
    const warning = dialog()!.querySelector("[data-alert='warning']")!;
    expect(warning.textContent).toContain(`${en.repositorySync.unsentCount(12)} will be discarded. Each one goes back to the value last sent to the repository.`);
    expect(warning.textContent).toContain(en.sources.locale.appCodeLine);
    const described = (dialog()!.getAttribute("aria-describedby") ?? "").split(" ").map(id => document.getElementById(id)?.textContent ?? "").join(" ");
    expect(described).toContain(en.sources.locale.appCodeLine);
  });

  it("미전달 0이면 앱 코드 줄만 남는다", async () => {
    await open();
    await openRemove("de");
    const warning = dialog()!.querySelector("[data-alert='warning']")!;
    expect(warning.textContent).toBe(en.sources.locale.appCodeLine);
  });

  it.each([
    { delivered: true, text: en.sources.locale.prRemoves("#128") },
    { delivered: null, text: en.sources.locale.couldntConfirm },
  ])("Pull request 칸은 delivered 삼상태다($delivered)", async ({ delivered, text }) => {
    mocks.preview.mockResolvedValue(ready({ delivered }));
    await open();
    await openRemove("de");
    expect(facts()[en.sources.locale.factPullRequest]).toBe(text);
  });
});

describe("추가 취소 — 같은 트리거, Dialog가 효과를 가른다(D2)", () => {
  it("전달 전: inactive 설명 · 파일 아직 없음 · 미전달 줄은 neutral(앱 코드 경고 없음)", async () => {
    mocks.preview.mockResolvedValue(ready({ kind: "cancel-add", path: "apps/web/locales/fr.json", translations: 9, pendingCount: 3, delivered: false }));
    await open();
    await openRemove("fr");
    expect(dialog()!.textContent).toContain(en.sources.locale.cancelAddBody);
    expect(facts()[en.sources.locale.factFile]).toBe(en.sources.locale.notCreatedYet("apps/web/locales/fr.json"));
    const neutral = dialog()!.querySelector("[data-alert='neutral']")!;
    expect(neutral.textContent).toBe(`${en.repositorySync.unsentCount(3)} stop being tracked. Add the language again to bring them back.`);
    expect(dialog()!.textContent).not.toContain(en.sources.locale.appCodeLine);
    expect(dialog()!.querySelector("[data-alert='warning']")).toBeNull();
  });

  it("전달 후 · 미전달 0: 열린 PR에서 거둔다는 설명 · #N adds this file · 줄 없음", async () => {
    mocks.preview.mockResolvedValue(ready({ kind: "cancel-add", path: "apps/web/locales/fr.json", translations: 9, pendingCount: 0, delivered: true }));
    await open();
    await openRemove("fr");
    expect(dialog()!.textContent).toContain(en.sources.locale.cancelAddDeliveredBody);
    expect(facts()[en.sources.locale.factPullRequest]).toBe(en.sources.locale.prAdds("#128"));
    expect(dialog()!.querySelector("[data-alert]")).toBeNull();
  });

  it("GitLab: Merge request 칸 · !N · merge request 설명", async () => {
    mocks.preview.mockResolvedValue(ready({ kind: "cancel-add", path: "apps/web/locales/fr.json", translations: 9, pendingCount: 0, delivered: true }));
    await open(detail([row("fr", { change: add, translated: 9 })], { repoHost: "gitlab", pullRequestUrl: "https://gitlab.com/g/app/-/merge_requests/128" }), "gitlab");
    await openRemove("fr");
    const gl = withRepoHost(en, "gitlab");
    expect(facts()[gl.sources.locale.factPullRequest]).toBe(gl.sources.locale.prAdds("!128"));
    expect(gl.sources.locale.factPullRequest).toBe("Merge request");
    expect(dialog()!.textContent).toContain(gl.sources.locale.cancelAddDeliveredBody);
    expect(dialog()!.textContent).not.toMatch(/pull request/i);
  });
});

describe("미리보기 실패 · 거부(D3·D4)", () => {
  it("실패: danger Alert + Try again, 확정 aria-disabled — Try again은 포커스를 Cancel로 옮기고 다시 받는다", async () => {
    mocks.preview.mockResolvedValueOnce({ ok: false, error: "unavailable" });
    await open();
    await openRemove("de");
    const alert = dialog()!.querySelector("[data-alert='danger']")!;
    expect(alert.textContent).toContain(en.sources.locale.previewFailed("de"));
    expect(inDialog(en.sources.locale.removeLanguage)!.getAttribute("aria-disabled")).toBe("true");
    await act(async () => { await user().click([...alert.querySelectorAll("button")].find(node => node.textContent === en.sources.retry)!); });
    expect(mocks.preview).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(inDialog(en.common.cancel));
  });

  it("sync-running은 일시적 — 같은 자리 Alert + Try again", async () => {
    mocks.preview.mockResolvedValueOnce({ ok: false, error: "sync-running" });
    await open();
    await openRemove("de");
    expect(dialog()!.querySelector("[data-alert='danger']")!.textContent).toContain(en.sources.locale.syncRunning("de"));
    expect(inDialog(en.sources.locale.removeLanguage)!.getAttribute("aria-disabled")).toBe("true");
  });

  it.each([
    { error: "baseline-unknown", text: en.sources.locale.baselineUnknown("de") },
    { error: "base-locale", text: en.sources.locale.baseReason },
  ])("결정적 거부($error)는 결과 단계 — 설명·확정을 걷고 Alert 한 장 + Close", async ({ error, text }) => {
    mocks.preview.mockResolvedValue({ ok: false, error });
    await open();
    await openRemove("de");
    expect(dialog()!.querySelector("[data-alert='danger']")!.textContent).toBe(text);
    expect(inDialog(en.sources.locale.removeLanguage)).toBeUndefined();
    expect(dialog()!.textContent).not.toContain(en.sources.locale.removeBody);
    expect(document.activeElement).toBe(inDialog(en.common.close));
  });

  it("publish-unsettled는 warning 제목 + Logs 확인 — 완료 문구 없음", async () => {
    mocks.preview.mockResolvedValue({ ok: false, error: "publish-unsettled" });
    await open();
    await openRemove("fr");
    const warning = dialog()!.querySelector("[data-alert='warning']")!;
    expect(warning.textContent).toContain(en.sources.locale.unsettledTitle);
    expect(warning.textContent).toContain(en.sources.locale.notConfirmedHelp);
    expect(dialog()!.querySelector("a[href]")?.getAttribute("href")).toContain("/projects/p/logs");
    expect(inDialog(en.sources.locale.removeLanguage)).toBeUndefined();
  });
});

describe("확정", () => {
  it("제거 요청 성공: 지문을 싣고, 닫힌 뒤 notice · 같은 행의 Cancel removal에 포커스", async () => {
    mocks.preview.mockResolvedValue(ready({ pendingCount: 12 }));
    mocks.remove.mockResolvedValue({ ok: true, kind: "request-removal", discarded: 12 });
    await open();
    await openRemove("de");
    mocks.load.mockResolvedValue({ ok: true, detail: detail([row("de", { change: removal, translated: 201 }), row("fr", { change: add, translated: 9, unsent: true }), row("ko")]) });
    await act(async () => { await user().click(inDialog(en.sources.locale.removeLanguage)!); });
    expect(mocks.remove).toHaveBeenCalledWith({ slug: "p", surfaceSlug: "web", localeCode: "de", approval: "fp-1" });
    expect(dialog()).toBeUndefined();
    expect(card().querySelector("[data-card-notice] [role='status']")!.textContent).toContain(en.sources.locale.removeRequested("de"));
    await vi.waitFor(() => expect(document.activeElement).toBe(action("de")));
    expect(action("de").textContent).toBe(en.sources.locale.cancelRemoval);
  });

  it("추가 취소 성공: Inactive로 끝에 간 행 대신 머리 Add language에 포커스, notice는 보존 번역 수", async () => {
    mocks.preview.mockResolvedValue(ready({ kind: "cancel-add", path: "apps/web/locales/fr.json", translations: 9, pendingCount: 0, delivered: false }));
    mocks.remove.mockResolvedValue({ ok: true, kind: "cancel-add", discarded: 0 });
    await open();
    await openRemove("fr");
    mocks.load.mockResolvedValue({ ok: true, detail: detail([row("de"), row("ko"), row("fr", { orphaned: true, translated: 9 })]) });
    await act(async () => { await user().click(inDialog(en.sources.locale.removeLanguage)!); });
    expect(card().querySelector("[data-card-notice]")!.textContent).toBe(en.sources.locale.cancelAddDone("fr", 9));
    await vi.waitFor(() => expect(document.activeElement).toBe(card().querySelector("header button")));
  });

  it("비지원 Adding 취소 성공은 머리 버튼 대신 Languages h2로 포커스한다", async () => {
    const unsupported = { languageChangesSupported: false, connection: { adapterName: "ts-dict", pathTemplate: "src/dict.ts", format: "TypeScript dictionary" } };
    mocks.preview.mockResolvedValue(ready({ kind: "cancel-add", path: "src/dict.ts", translations: 9, pendingCount: 0, delivered: false }));
    mocks.remove.mockResolvedValue({ ok: true, kind: "cancel-add", discarded: 0 });
    await open(detail([row("fr", { change: add, translated: 9, unsent: true })], unsupported));
    await openRemove("fr");
    mocks.load.mockResolvedValue({ ok: true, detail: detail([row("fr", { orphaned: true, translated: 9 })], unsupported) });
    await act(async () => { await user().click(inDialog(en.sources.locale.removeLanguage)!); });
    await vi.waitFor(() => expect(document.activeElement).toBe(card().querySelector("h2")));
    expect(card().querySelector("h2")?.getAttribute("tabindex")).toBe("-1");
    expect(card().querySelector("[data-language-add]")).toBeNull();
    expect(action("fr")).toBeNull();
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith({ slug: "p", surfaceSlug: "web", localeCode: "fr", approval: "fp-1" });
  });

  it("추가 취소 성공 · 보존 번역 0개: 0개를 보존한다고 말하지 않는다(#288)", async () => {
    mocks.preview.mockResolvedValue(ready({ kind: "cancel-add", path: "apps/web/locales/fr.json", translations: 0, pendingCount: 0, delivered: false }));
    mocks.remove.mockResolvedValue({ ok: true, kind: "cancel-add", discarded: 0 });
    await open();
    await openRemove("fr");
    mocks.load.mockResolvedValue({ ok: true, detail: detail([row("de"), row("ko"), row("fr", { orphaned: true, translated: 0 })]) });
    await act(async () => { await user().click(inDialog(en.sources.locale.removeLanguage)!); });
    expect(card().querySelector("[data-card-notice]")!.textContent).toBe("fr is inactive. It has no translations.");
  });

  it("낡은 승인: 다시 받아 바뀐 수를 그리고 info 한 줄 · 확정은 다시 켜진다 · 포커스 Cancel", async () => {
    mocks.preview.mockResolvedValueOnce(ready({ pendingCount: 12 })).mockResolvedValueOnce(ready({ pendingCount: 14, translations: 203, approval: "fp-2" }));
    mocks.remove.mockResolvedValueOnce({ ok: false, error: "stale-approval" });
    await open();
    await openRemove("de");
    await act(async () => { await user().click(inDialog(en.sources.locale.removeLanguage)!); });
    expect(mocks.preview).toHaveBeenCalledTimes(2);
    expect(dialog()!.querySelector("[data-alert='info']")!.textContent).toBe(en.sources.locale.changed);
    expect(dialog()!.textContent).toContain(en.repositorySync.unsentCount(14));
    expect(dialog()!.textContent).not.toContain(en.repositorySync.unsentCount(12));
    expect(facts()[en.sources.locale.factTranslations]).toBe(en.sources.locale.keptInMalmoi(203));
    expect(inDialog(en.sources.locale.removeLanguage)!.getAttribute("aria-disabled")).toBeNull();
    expect(document.activeElement).toBe(inDialog(en.common.cancel));
    mocks.remove.mockResolvedValueOnce({ ok: true, kind: "request-removal", discarded: 14 });
    await act(async () => { await user().click(inDialog(en.sources.locale.removeLanguage)!); });
    expect(mocks.remove).toHaveBeenLastCalledWith({ slug: "p", surfaceSlug: "web", localeCode: "de", approval: "fp-2" });
  });
});

/** RT4 #278 — 1건이면 동사·대명사가 단수다. */
it("#278 미전달 1건의 추가 취소 줄은 단수다", async () => {
  mocks.preview.mockResolvedValue(ready({ kind: "cancel-add", path: "apps/web/locales/fr.json", translations: 9, pendingCount: 1, delivered: false }));
  await open();
  await openRemove("fr");
  expect(dialog()!.querySelector("[data-alert='neutral']")!.textContent).toBe(`${en.repositorySync.unsentCount(1)} stops being tracked. Add the language again to bring it back.`);
});

describe("cancelAddDone — 보존 번역 수 0·1·2, 세 사전(#288)", () => {
  const cases = [
    { lang: "en", t: en, out: ["fr is inactive. It has no translations.", "fr is inactive. Its 1 translation is kept in Malmoi.", "fr is inactive. Its 2 translations are kept in Malmoi."] },
    { lang: "ko", t: ko, out: ["fr 언어는 비활성 상태입니다. 번역이 없습니다.", "fr 언어는 비활성 상태입니다. 번역 1개는 Malmoi에 보존됩니다.", "fr 언어는 비활성 상태입니다. 번역 2개는 Malmoi에 보존됩니다."] },
    { lang: "es", t: es, out: ["fr está inactivo. No tiene traducciones.", "fr está inactivo. Su traducción se conserva en Malmoi.", "fr está inactivo. Sus 2 traducciones se conservan en Malmoi."] },
  ];
  for (const c of cases) {
    it(c.lang, () => {
      expect([0, 1, 2].map(n => c.t.sources.locale.cancelAddDone("fr", n))).toEqual(c.out);
    });
  }
});

// #303: 공유 네임스페이스 glob은 취소가 삭제할 파일이 아니다.
it("legacy ts-dict cancellation omits an unavailable file and returns focus to Languages", async () => {
  const unsupported = { languageChangesSupported: false, connection: { adapterName: "ts-dict", pathTemplate: "src/i18n/namespaces/*.ts", format: "TypeScript dictionary" } };
  mocks.preview.mockResolvedValue(ready({ kind: "cancel-add", path: null, translations: 9, pendingCount: 1, delivered: false }));
  mocks.remove.mockResolvedValue({ ok: true, kind: "cancel-add", discarded: 1 });
  await open(detail([row("es", { change: add, translated: 9, unsent: true })], unsupported));
  await openRemove("es");
  expect(facts()).not.toHaveProperty(en.sources.locale.factFile);
  expect(facts()[en.sources.locale.factTranslations]).toBe(en.sources.locale.keptInMalmoi(9));
  expect(dialog()!.querySelector("[data-alert='neutral']")!.textContent).toContain(en.repositorySync.unsentCount(1));
  mocks.load.mockResolvedValue({ ok: true, detail: detail([row("es", { orphaned: true, translated: 9 })], unsupported) });
  await act(async () => { await user().click(inDialog(en.sources.locale.removeLanguage)!); });
  expect(mocks.remove).toHaveBeenCalledExactlyOnceWith({ slug: "p", surfaceSlug: "web", localeCode: "es", approval: "fp-1" });
  expect(card().querySelector("[data-card-notice]")!.textContent).toBe(en.sources.locale.cancelAddDone("es", 9));
  await vi.waitFor(() => expect(document.activeElement).toBe(card().querySelector("h2")));
});

it.each(["preview", "submit"])("#307 Android %s의 기준 언어 거부는 고정 기준 파일을 안내한다", async phase => {
  if (phase === "preview") mocks.preview.mockResolvedValue({ ok: false, error: "base-locale" });
  else mocks.remove.mockResolvedValue({ ok: false, error: "base-locale" });
  await open(detail([row("de")], { connection: { ...connection, adapterName: "android-strings" } }));
  await openRemove("de");
  if (phase === "submit") await act(async () => { await user().click(inDialog(en.sources.locale.removeLanguage)!); });
  expect(dialog()!.querySelector("[data-alert='danger']")!.textContent).toBe("The Android base language is fixed, and values/strings.xml can't be removed. Detach this source and add it again to change the code.");
  expect(dialog()!.textContent).not.toContain(en.sources.locale.baseReason);
});
