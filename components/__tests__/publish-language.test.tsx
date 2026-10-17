// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HomeActions, HomeHeaderActions, HomeNotices, HomeTitle } from "@/components/home/actions";
import { RepoHostScope } from "@/components/i18n/messages-provider";
import { routes } from "@/lib/routes";
import { render } from "./helpers/dom";

const mocks = vi.hoisted(() => ({ preview: vi.fn(), pull: vi.fn(), refresh: vi.fn() }));
vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: mocks.preview }));
vi.mock("@/app/(edit)/actions", () => ({ triggerPullAction: mocks.pull, saveTranslationKey: vi.fn(), previewTranslationRevert: vi.fn(), revertTranslationKey: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: vi.fn(), checkOpenPullRequest: vi.fn(), prepareRepositorySync: vi.fn(), archiveProject: vi.fn(), unarchiveProject: vi.fn() }));
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({ connectRepository: vi.fn() }));

/**
 * **언어 변경의 Publish** (locale-add 시안 P1 ①~⑥). 번역 변경 0이고 파일만 바뀌는 Publish가 "0 changes"·"Nothing to send"로 읽히지 않고,
 * 파일 머리가 그 파일에 무슨 일이 생기는지(`New file`·`Updated`·`Removed`·`Not included`·`Held`·`Taken back from #N`)를 말한다.
 * 파일 삭제 수를 번역 전달 수로 말하지 않고, PR 반영 전에 완료를 말하지 않는다.
 */
const REPO = { owner: "SinhyeokKang", name: "malmoi", branch: "main", syncBranch: "malmoi-i18n/sync-acme" };
const ok = (data: unknown) => ({ status: "ok", preview: data });
const base = { groups: [], truncated: 0, withoutFile: 0, withoutKey: 0, fingerprint: "f" };
const row = (key: string, localeCode: string, after: string, before: string | null = null) =>
  ({ surface: "web", path: `apps/web/locales/${localeCode}.json`, keyId: key, key, localeCode, before, after, same: false, author: "Sinhyeok", updatedAt: "2026-10-16T00:00:00.000Z", keySpan: 1 });

/** ① 번역 0 · 파일 삭제 1 */
const removedOnly = { ...base, total: 0, keys: 0, openPr: null, sendable: { total: 0, keys: 0 },
  changedFiles: ["apps/web/locales/de.json"], fileChanges: [{ path: "apps/web/locales/de.json", kind: "removed" }] };
/** ② 새 파일 + 번역 변경 */
const newFile = { ...base, total: 2, keys: 2, openPr: null, sendable: { total: 2, keys: 2 },
  groups: [{ surface: "web", path: "apps/web/locales/fr.json", changes: 2, keys: 2, rows: [row("checkout.submit", "fr", "Passer la commande"), row("checkout.title", "fr", "Paiement")] }],
  changedFiles: ["apps/web/locales/fr.json"], fileChanges: [{ path: "apps/web/locales/fr.json", kind: "new" }] };
/** ③ 열린 #128 · 갱신 1 · 빈 추가 · 보류 */
const partial = { ...base, total: 1, keys: 1, openPr: { number: 128, url: "https://github.com/SinhyeokKang/malmoi/pull/128" }, sendable: { total: 1, keys: 1 },
  groups: [{ surface: "web", path: "apps/web/locales/ko.json", changes: 1, keys: 1, rows: [row("checkout.submit", "ko", "주문하기", "결제하기")] }],
  changedFiles: ["apps/web/locales/ko.json"], fileChanges: [{ path: "apps/web/locales/ko.json", kind: "updated" }],
  locales: { withheld: [{ surfaceSlug: "web", localeCode: "zh-CN", path: "apps/web/locales/zh-CN.json", reason: "proposal-path-exists" }],
    empty: [{ surfaceSlug: "web", localeCode: "fr", path: "apps/web/locales/fr.json" }] } };
/** ④ 파일 diff 0 · 전달된 추가를 취소 */
const takenBack = { ...base, total: 0, keys: 0, openPr: { number: 128, url: "https://github.com/SinhyeokKang/malmoi/pull/128" }, sendable: { total: 0, keys: 0 },
  changedFiles: [], fileChanges: [], withdrawnLocales: [{ surfaceSlug: "web", localeCode: "fr", effect: "create", path: "apps/web/locales/fr.json" }] };

beforeEach(() => { vi.clearAllMocks(); mocks.pull.mockResolvedValue({ status: "skipped", reason: "no-edits" }); });

function visible(node: Element): string {
  const copy = node.cloneNode(true) as Element;
  copy.querySelectorAll(".sr-only").forEach(sr => sr.remove());
  return copy.textContent?.trim() ?? "";
}
function button(name: string) {
  const node = [...document.querySelectorAll("button")].find(b => visible(b) === name || b.getAttribute("aria-label") === name);
  if (!node) throw new Error(`Missing ${name}`);
  return node;
}
async function click(name: string) { await act(async () => { await userEvent.setup().click(button(name)); }); }
const modal = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
const fileHead = (path: string) => [...modal().querySelectorAll("th[scope=colgroup]")].find(th => th.textContent?.includes(path)) as HTMLElement | undefined;

function Host({ unsent = 0, languageWork = 1, role = "OWNER", host = "github" }: { unsent?: number; languageWork?: number; role?: "OWNER" | "EDITOR"; host?: string }) {
  const ui = <HomeActions slug="acme" writeLock={null}><HomeTitle archived={false}>Host</HomeTitle>
    <HomeHeaderActions slug="acme" name="Host" branch="main" role={role} unsent={unsent} languageWork={languageWork} paused={false} />
    <HomeNotices slug="acme" name="Host" branch="main" role={role} state="default" repo={{ ...REPO, host }} unsent={unsent} languageWork={languageWork} failedSurface={null} reason={null} lastSyncAt={null} now={new Date()} />
  </HomeActions>;
  return host === "gitlab" ? <RepoHostScope host="gitlab">{ui}</RepoHostScope> : ui;
}

describe("Publish 버튼 — 언어 변경만 있을 때", () => {
  it("셀 편집 0 · 언어 작업 1이면 켜진다 — 배지는 셀 수라 없고, sr이 언어 변경을 말한다", async () => {
    await render(<Host />);
    const publish = button("Publish");
    expect(publish.getAttribute("aria-disabled")).toBeNull();
    const described = publish.getAttribute("aria-describedby");
    expect(described).not.toBeNull();
    expect(document.getElementById(described!)?.textContent).toBe("Language changes are ready to publish.");
  });

  it("셀 편집도 언어 작업도 0이면 지금처럼 꺼진다", async () => {
    await render(<Host languageWork={0} />);
    expect(button("Publish").getAttribute("aria-disabled")).toBe("true");
  });

  it("버튼이 켜진 그 프로젝트의 미리보기가 ①이다 — 조회 중 제목도 0 changes가 아니다", async () => {
    let resolve!: (value: unknown) => void;
    mocks.preview.mockReturnValue(new Promise(done => { resolve = done; }));
    await render(<Host />);
    await click("Publish");
    expect(modal().textContent).toContain("Publish language changes");
    expect(modal().textContent).not.toContain("0 changes");
    await act(async () => resolve(ok(removedOnly)));
    expect(modal().querySelector("h2")?.textContent).toBe("Publish language changes");
  });
});

describe("Publish 미리보기 — 언어 변경 (시안 P1)", () => {
  it("① 번역 0 · 파일 삭제 1 — 제목·설명·PR 줄·파일 머리·바닥이 번역 수로 말하지 않는다", async () => {
    mocks.preview.mockResolvedValue(ok(removedOnly));
    await render(<Host />); await click("Publish");
    const text = modal().textContent ?? "";
    expect(modal().querySelector("h2")?.textContent).toBe("Publish language changes");
    expect(text).toContain("Goes to SinhyeokKang/malmoi as one pull request. 1 file removed.");
    expect(text).toContain("Nothing is open right now, so this language change goes out on its own.");
    expect(text).not.toContain("0 changes go");
    expect(text).not.toContain("these 0");
    expect(fileHead("apps/web/locales/de.json")?.textContent).toContain("Removed");
    expect(text).toContain("Translations stay in Malmoi.");
    expect(text).toContain("0 changes · 1 file");
    await click("Open pull request");
    expect(mocks.pull).toHaveBeenCalledTimes(1);
  });

  it("② 새 파일 + 번역 변경 — 기존 제목, 설명이 파일 추가를 함께 센다, 파일 머리 New file", async () => {
    mocks.preview.mockResolvedValue(ok(newFile));
    await render(<Host unsent={2} />); await click("Publish2");
    const text = modal().textContent ?? "";
    expect(modal().querySelector("h2")?.textContent).toBe("Publish 2 changes");
    expect(text).toContain("2 changes in 2 keys, 1 file added.");
    expect(text).toContain("Nothing is open right now, so these 2 changes go out on their own.");
    expect(fileHead("apps/web/locales/fr.json")?.textContent).toContain("New file");
    expect(text).toContain("2 changes · 2 keys · 1 file");
  });

  it("③ 빈 추가·보류 — 그 언어만 빠지고 이유를 말한다, 열린 PR을 바꾼다", async () => {
    mocks.preview.mockResolvedValue(ok(partial));
    await render(<Host unsent={1} />); await click("Publish1");
    const text = modal().textContent ?? "";
    expect(modal().querySelector("h2")?.textContent).toBe("Publish 1 change");
    expect(text).toContain("1 change in 1 key. 2 languages are left out.");
    expect(fileHead("apps/web/locales/ko.json")?.textContent).toContain("Updated");
    expect(fileHead("apps/web/locales/fr.json")?.textContent).toContain("Not included");
    expect(text).toContain("fr has no translations yet, so no file is created. It goes out once it has one.");
    expect(fileHead("apps/web/locales/zh-CN.json")?.textContent).toContain("Held");
    expect(text).toContain("This file is already on main. After the open pull request closes, zh-CN becomes active at the next publish or nightly check.");
    expect(text).toContain("1 change · 1 key · 1 file");
    expect(button("Replace pull request #128")).toBeDefined();
  });

  it("④ 파일 diff 0 · GitHub — 거둘 파일 행과 PR 닫기", async () => {
    mocks.preview.mockResolvedValue(ok(takenBack));
    await render(<Host />); await click("Publish");
    const text = modal().textContent ?? "";
    expect(modal().querySelector("h2")?.textContent).toBe("Close pull request #128");
    expect(text).toContain("Nothing differs from main anymore. Closing #128 takes back the file it was adding.");
    expect(fileHead("apps/web/locales/fr.json")?.textContent).toContain("Taken back from #128");
    expect(text).toContain("fr was cancelled after #128 was opened, so the file it adds comes out. Translations stay in Malmoi.");
    expect(text).toContain("0 changes · 1 file taken back");
    expect(text).not.toContain("Nothing can be sent yet");
    await click("Close pull request #128");
    expect(mocks.pull).toHaveBeenCalledTimes(1);
  });

  it("⑤ 파일 diff 0 · GitLab — 같은 갈래, 낱말만 merge request · !128", async () => {
    mocks.preview.mockResolvedValue(ok({ ...takenBack, openPr: { number: 128, url: "https://gitlab.com/g/p/-/merge_requests/128" } }));
    await render(<Host host="gitlab" />); await click("Publish");
    const text = modal().textContent ?? "";
    expect(modal().querySelector("h2")?.textContent).toBe("Close merge request !128");
    expect(text).toContain("Nothing differs from main anymore. Closing !128 takes back the file it was adding.");
    expect(fileHead("apps/web/locales/fr.json")?.textContent).toContain("Taken back from !128");
    expect(text).toContain("fr was cancelled after !128 was opened, so the file it adds comes out. Translations stay in Malmoi.");
  });

  it("PR 줄 본문 — 번역 0 · 열린 PR이면 언어 파일 변경 수로 센다 (GitHub · GitLab)", async () => {
    const twoRemoved = { ...removedOnly, openPr: { number: 128, url: "https://github.com/SinhyeokKang/malmoi/pull/128" },
      changedFiles: ["apps/web/locales/de.json", "apps/web/locales/ja.json"],
      fileChanges: [{ path: "apps/web/locales/de.json", kind: "removed" }, { path: "apps/web/locales/ja.json", kind: "removed" }] };
    mocks.preview.mockResolvedValue(ok(twoRemoved));
    await render(<Host />); await click("Publish");
    expect(modal().textContent).toContain("A second pull request isn't opened. #128 will hold everything unsent, not just these 2 language changes.");
  });

  it("PR 줄 본문 — GitLab 단수", async () => {
    mocks.preview.mockResolvedValue(ok({ ...removedOnly, openPr: { number: 128, url: "https://gitlab.com/g/p/-/merge_requests/128" } }));
    await render(<Host host="gitlab" />); await click("Publish");
    expect(modal().textContent).toContain("A second merge request isn't opened. !128 will hold everything unsent, not just this language change.");
  });

  it("만료될 언어 요청은 그 언어를 이름으로 말한다", async () => {
    mocks.preview.mockResolvedValue(ok({ ...newFile, expiringLocales: [
      { surfaceSlug: "web", localeCode: "ja", operation: "REMOVE", presence: "active" },
      { surfaceSlug: "web", localeCode: "es", operation: "ADD", presence: "active" },
    ] }));
    await render(<Host unsent={2} />); await click("Publish2");
    const text = modal().textContent ?? "";
    expect(text).toContain("ja wasn't removed — its pull request closed without merging. It stays in this source.");
    expect(text).toContain("es is already in the repository, so its request is closed.");
  });
});

describe("Publish 미리보기 — ⑥ locale-plan-refused", () => {
  const refused = { status: "refused", reason: "locale-plan-refused", path: "apps/web/i18n/fr.json", branch: "main",
    plan: { refusal: "path-conflict", surfaceSlug: "web", localeCode: "fr", ownerSlug: "emails" } };

  it("OWNER — 원인 경로와 고칠 자리로 가는 버튼, Try again 없음", async () => {
    mocks.preview.mockResolvedValue(refused);
    await render(<Host />); await click("Publish");
    const text = modal().textContent ?? "";
    expect(modal().querySelector("h2")?.textContent).toBe("Publish language changes");
    expect(text).toContain("Nothing was sent.");
    expect(text).toContain("These changes can't be published");
    expect(text).toContain("Malmoi can't plan the language files for web. fr would be written to apps/web/i18n/fr.json, which now belongs to the emails source.");
    expect(text).not.toContain("Try again");
    expect(text).not.toContain("base language file");
    const open = [...modal().querySelectorAll("a")].find(a => a.textContent === "Open web");
    expect(open?.getAttribute("href")).toBe(routes.sources("acme"));
    expect(button("Close")).toBeDefined();
  });

  it("소유 소스를 모르는 경로 충돌은 중복 문장으로 떨어지지 않는다", async () => {
    mocks.preview.mockResolvedValue({ ...refused, plan: { ...refused.plan, ownerSlug: null } });
    await render(<Host />); await click("Publish");
    const text = modal().textContent ?? "";
    expect(text).toContain("Malmoi can't plan the language files for web. apps/web/i18n/fr.json belongs to another source.");
    expect(text).not.toContain("Two languages");
  });

  it("EDITOR — Close 하나", async () => {
    mocks.preview.mockResolvedValue(refused);
    await render(<Host role="EDITOR" />); await click("Publish");
    expect([...modal().querySelectorAll("a")].some(a => a.textContent === "Open web")).toBe(false);
    expect(button("Close")).toBeDefined();
  });
});

describe("Publish 결과 — 번역 0", () => {
  it("새 PR — 0 changes를 말하지 않고 머지 전 완료를 말하지 않는다", async () => {
    mocks.preview.mockResolvedValue(ok(removedOnly));
    mocks.pull.mockResolvedValue({ status: "committed", pr: "created", prUrl: "https://github.com/SinhyeokKang/malmoi/pull/129", delivered: 0, changed: ["apps/web/locales/de.json"],
      files: [{ path: "apps/web/locales/de.json", kind: "removed" }] });
    await render(<Host />); await click("Publish"); await click("Open pull request");
    const text = modal().textContent ?? "";
    expect(text).toContain("The language changes are in a pull request. They reach the product once someone on the team merges it.");
    expect(text).not.toContain("0 changes");
    expect(text).not.toMatch(/\bpublished\b/i);
  });
});
