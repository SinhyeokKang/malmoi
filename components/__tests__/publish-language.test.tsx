// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HomeActions, HomeHeaderActions, HomeNotices, HomeTitle } from "@/components/home/actions";
import { RepoHostScope } from "@/components/i18n/messages-provider";
import { routes } from "@/lib/routes";
import { render } from "./helpers/dom";
import { en } from "@/messages/en";

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
/** ③ 실제 서버 응답 형이다 — 보류된 언어(zh-CN)의 편집 1건이 `withoutFile`에 들고 `withoutFileLanguage`로도 센다(격리 PG `locale-publish.integration`). */
const partial = { ...base, total: 2, keys: 2, withoutFile: 1, withoutFileLanguage: 1, openPr: { number: 128, url: "https://github.com/SinhyeokKang/malmoi/pull/128" }, sendable: { total: 1, keys: 1 },
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

function Host({ unsent = 0, languageWork = 1, role = "OWNER", host = "github", settle }: { unsent?: number; languageWork?: number; role?: "OWNER" | "EDITOR"; host?: string; settle?: Promise<boolean> }) {
  const ui = <HomeActions slug="acme" writeLock={null}><HomeTitle archived={false}>Host</HomeTitle>
    <HomeHeaderActions slug="acme" name="Host" branch="main" role={role} unsent={unsent} languageWork={languageWork} paused={false} settle={settle} />
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
    expect(document.getElementById(described!)?.textContent).toBe("There are language changes to publish.");
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
    // Held 행이 이유를 말한다 — 같은 편집을 "파일이 리포에 아직 없다"로 또 세면 "이미 main에 있다"와 모순이다(R-E3 Y1).
    expect(text).not.toContain("isn't in the repository yet");
    // PR 줄은 번역 변경 수로 남는다(번역이 있는 갈래 — D10은 번역 0 갈래만).
    expect(text).toContain("not just this one.");
  });

  it("③ 결과 — 언어 보류 편집에 파일 복구 권유를 붙이지 않는다", async () => {
    mocks.preview.mockResolvedValue(ok(partial));
    mocks.pull.mockResolvedValue({ status: "committed", pr: "updated", prUrl: "https://github.com/SinhyeokKang/malmoi/pull/128", delivered: 1, changed: ["apps/web/locales/ko.json"],
      withheld: { file: 1, key: 0, language: 1 }, locales: partial.locales });
    await render(<Host unsent={2} />); await click("Publish2"); await click("Replace pull request #128");
    const text = modal().textContent ?? "";
    expect(text).not.toContain("isn't in the repository");
    expect(text).not.toContain("Add the file to the repository");
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

  /**
   * **좁은 폭** (#280) — 표는 최소 520이라 375에서 가로로 스크롤한다(#232). 파일 머리 낱말과 언어 사유 문장은 그 520에 묶이지 않고 스크롤러의 보이는 폭
   * (`100cqw` — 스크롤러가 컨테이너다)에 맞춰 왼쪽에 붙는다(`sticky left-0`). 머리는 줄바꿈한다(`flex-wrap`). 실제 폭은 RT4가 잰다.
   */
  it("좁은 폭 — 파일 머리·사유 줄이 스크롤러의 보이는 폭에 묶인다", async () => {
    mocks.preview.mockResolvedValue(ok(takenBack));
    await render(<Host />); await click("Publish");
    const scroller = modal().querySelector("table")!.parentElement!;
    expect(scroller.className.split(" ")).toContain("@container/preview");
    const head = fileHead("apps/web/locales/fr.json")!;
    const headBox = head.querySelector("[data-file-head]")!;
    expect(headBox.className.split(" ")).toEqual(expect.arrayContaining(["sticky", "left-0", "w-[100cqw]", "flex-wrap"]));
    const note = [...modal().querySelectorAll("td")].find(td => td.textContent?.includes("was cancelled after"))!;
    expect(note.querySelector("[data-file-note]")!.className.split(" ")).toEqual(expect.arrayContaining(["sticky", "left-0", "w-[100cqw]"]));
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

  /** D10 — 번역 0이면 PR 줄이 언어 파일 변경 수로 센다. PR 없음·열림 × 단수·복수 × GitHub·GitLab(R-E3 Y4 — 변이 M1이 남았다). */
  const OPEN = { github: { number: 128, url: "https://github.com/SinhyeokKang/malmoi/pull/128" }, gitlab: { number: 128, url: "https://gitlab.com/g/p/-/merge_requests/128" } };
  const removedFiles = (n: number) => Array.from({ length: n }, (_, i) => `apps/web/locales/r${i}.json`);
  it.each([
    ["github", false, 1, "Nothing is open right now, so this language change goes out on its own."],
    ["github", false, 2, "Nothing is open right now, so these 2 language changes go out on their own."],
    ["github", true, 1, "A second pull request isn't opened. #128 will hold everything unsent, not just this language change."],
    ["github", true, 2, "A second pull request isn't opened. #128 will hold everything unsent, not just these 2 language changes."],
    ["gitlab", false, 1, "Nothing is open right now, so this language change goes out on its own."],
    ["gitlab", false, 2, "Nothing is open right now, so these 2 language changes go out on their own."],
    ["gitlab", true, 1, "A second merge request isn't opened. !128 will hold everything unsent, not just this language change."],
    ["gitlab", true, 2, "A second merge request isn't opened. !128 will hold everything unsent, not just these 2 language changes."],
  ] as const)("D10 %s · 열린 PR %s · 파일 %i", async (host, open, n, sentence) => {
    const paths = removedFiles(n);
    mocks.preview.mockResolvedValue(ok({ ...removedOnly, openPr: open ? OPEN[host] : null, changedFiles: paths, fileChanges: paths.map(path => ({ path, kind: "removed" })) }));
    await render(<Host host={host} />); await click("Publish");
    expect(modal().textContent).toContain(sentence);
  });

  it("만료 안내는 소스가 둘 이상이면 그 소스를 함께 말한다", async () => {
    mocks.preview.mockResolvedValue(ok({ ...newFile, expiringLocales: [
      { surfaceSlug: "web", localeCode: "ja", operation: "REMOVE", presence: "active" },
      { surfaceSlug: "emails", localeCode: "es", operation: "ADD", presence: "active" },
    ] }));
    await render(<Host unsent={2} />); await click("Publish2");
    const text = modal().textContent ?? "";
    expect(text).toContain("ja (web) wasn't removed — its pull request closed without merging. It stays in this source.");
    expect(text).toContain("es (emails) is already in the repository, so its request is closed.");
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

/**
 * **닫힌 언어 요청 정리** (#282 — ARCHITECTURE §5.10.4 `settle`). 전달된 추가의 PR이 머지 없이 닫혔고 편집이 없으면 셀·언어 작업이 0이라 버튼이 꺼졌다.
 * 서버가 좁은 창에서만 내린 열린 PR 조회가 "없음"으로 도착하면 켜지고, 미리보기는 `Nothing can be sent yet` + Close로 떨어지지 않고 요청을 닫는 실행을 세운다.
 */
describe("Publish — 닫힌 언어 요청 정리 (#282)", () => {
  const dropped = { ...base, total: 0, keys: 0, openPr: null, sendable: { total: 0, keys: 0 }, changedFiles: [], fileChanges: [],
    expiringLocales: [{ surfaceSlug: "web", localeCode: "fr", operation: "ADD", presence: "orphan" }] };
  const sr = () => document.getElementById(button("Publish").getAttribute("aria-describedby") ?? "")?.textContent;

  it("열린 PR 없음이 도착하면 켜지고 sr이 이유를 말한다 — 도착 전에는 꺼져 있다", async () => {
    let resolve!: (value: boolean) => void;
    await render(<Host languageWork={0} settle={new Promise(done => { resolve = done; })} />);
    expect(button("Publish").getAttribute("aria-disabled")).toBe("true");
    await act(async () => resolve(true));
    expect(button("Publish").getAttribute("aria-disabled")).toBeNull();
    expect(sr()).toBe("The pull request for a language change is no longer open. Publish to close its request.");
  });

  it("열린 PR·모름(거짓)이면 꺼진 채다", async () => {
    await render(<Host languageWork={0} settle={Promise.resolve(false)} />);
    await act(async () => {});
    expect(button("Publish").getAttribute("aria-disabled")).toBe("true");
    expect(sr()).toBe("Nothing to send — every edit is already sent.");
  });

  it("GitLab 프로젝트는 merge request로 말한다", async () => {
    await render(<Host host="gitlab" languageWork={0} settle={Promise.resolve(true)} />);
    await act(async () => {});
    expect(sr()).toBe("The merge request for a language change is no longer open. Publish to close its request.");
  });

  it("만료될 요청만 있는 미리보기 — 요청을 닫는 실행 버튼이 서고 누르면 실행한다 (#282 ③ 재현)", async () => {
    mocks.preview.mockResolvedValue(ok(dropped));
    await render(<Host languageWork={0} settle={Promise.resolve(true)} />);
    await act(async () => {});
    await click("Publish");
    const text = modal().textContent ?? "";
    expect(modal().querySelector("h2")?.textContent).toBe("Close the language request");
    expect(text).toContain("The pull request this request was sent in is no longer open. Nothing goes out and no new pull request opens — publishing only closes it.");
    expect(text).toContain("fr wasn't added — its pull request closed without merging. Its translations stay in Malmoi.");
    expect(text).not.toContain(en.translations.publish.nothingSendable.title);
    await click("Close request");
    expect(mocks.pull).toHaveBeenCalledTimes(1);
  });

  it("요청이 둘이면 복수로 말한다 · GitLab은 merge request", async () => {
    mocks.preview.mockResolvedValue(ok({ ...dropped, expiringLocales: [...dropped.expiringLocales, { surfaceSlug: "web", localeCode: "ja", operation: "REMOVE", presence: "active" }] }));
    await render(<Host host="gitlab" languageWork={0} settle={Promise.resolve(true)} />);
    await act(async () => {});
    await click("Publish");
    expect(modal().querySelector("h2")?.textContent).toBe("Close the language requests");
    expect(modal().textContent).toContain("The merge request these requests were sent in is no longer open. Nothing goes out and no new merge request opens — publishing only closes them.");
    expect(button("Close requests")).toBeDefined();
  });

  /** ⚪5(변이 M8) — 창이 닫혀 서버가 promise를 내리지 않으면 옛 도착값(`true`)을 쓰지 않는다. 정리 Publish 뒤 재검증이 이 렌더다. */
  it("창이 닫히면(settle 없음으로 다시 렌더) 옛 도착값을 버리고 꺼진다", async () => {
    const { rerender } = await render(<Host languageWork={0} settle={Promise.resolve(true)} />);
    await act(async () => {});
    expect(button("Publish").getAttribute("aria-disabled")).toBeNull();
    await rerender(<Host languageWork={0} />);
    expect(button("Publish").getAttribute("aria-disabled")).toBe("true");
  });

  /** 🟡4 — 정리 실행의 진행 화면은 PR을 연다고 말하지 않는다. 편집이 있어도(보류 1) 정리 갈래였으면 같은 진행 문장이다. */
  it.each([[0], [1]])("정리 실행 중(미발송 %i) 진행 화면은 요청을 닫는다고 말한다 — PR을 연다고 하지 않는다", async unsent => {
    let resolve!: (value: unknown) => void;
    mocks.pull.mockReturnValue(new Promise(done => { resolve = done; }));
    mocks.preview.mockResolvedValue(ok(dropped));
    await render(<Host unsent={unsent} languageWork={0} settle={Promise.resolve(true)} />);
    await act(async () => {});
    await click(unsent === 0 ? "Publish" : `Publish${unsent}`);
    await click("Close request");
    const text = modal().textContent ?? "";
    expect(modal().querySelector("h2")?.textContent).toBe("Closing the language request");
    expect(text).toContain("Checking the pull request and the repository, then closing the request. This usually takes a few seconds.");
    expect(text).not.toContain("opening a pull request");
    expect(text).not.toContain("Publishing");
    await act(async () => resolve({ status: "skipped", reason: "no-edits", expired: dropped.expiringLocales }));
  });

  it("GitLab — 정리 진행 문장은 merge request로 말한다", async () => {
    mocks.pull.mockReturnValue(new Promise(() => {}));
    mocks.preview.mockResolvedValue(ok(dropped));
    await render(<Host host="gitlab" languageWork={0} settle={Promise.resolve(true)} />);
    await act(async () => {});
    await click("Publish");
    await click("Close request");
    expect(modal().textContent).toContain("Checking the merge request and the repository, then closing the request.");
  });

  /** 🟡2 — 보류 편집이 남은 정리는 `withheld`로 끝나도 결과가 닫은 요청을 말한다(미리보기 == 결과). */
  it("보류 편집이 남은 정리 — Held back 결과에 닫은 요청 줄이 선다", async () => {
    mocks.preview.mockResolvedValue(ok({ ...dropped, total: 1, keys: 1, withoutFile: 1 }));
    mocks.pull.mockResolvedValue({ status: "skipped", reason: "withheld", withheld: { file: 1, key: 0 }, expired: dropped.expiringLocales });
    await render(<Host unsent={1} languageWork={0} />);
    await click("Publish1");
    expect(modal().querySelector("h2")?.textContent).toBe("Close the language request");
    await click("Close request");
    expect(modal().querySelector("h2")?.textContent).toBe("Held back — some values can't be written to the files");
    expect(modal().textContent).toContain("fr wasn't added — its pull request closed without merging. Its translations stay in Malmoi.");
  });

  /** #289 — 보류할 것이 없는 정리는 Held back이 아니다. 요청을 닫았다 틀 + 만료 줄(Home To send 0 · Logs `Nothing to send`와 같은 사실). */
  it("보류 없는 정리 — 결과는 요청을 닫았다 틀이고 만료 줄이 선다", async () => {
    mocks.preview.mockResolvedValue(ok(dropped));
    mocks.pull.mockResolvedValue({ status: "skipped", reason: "no-edits", expired: dropped.expiringLocales });
    await render(<Host languageWork={0} settle={Promise.resolve(true)} />);
    await act(async () => {});
    await click("Publish");
    await click("Close request");
    const text = modal().textContent ?? "";
    expect(modal().querySelector("h2")?.textContent).toBe("Language request closed");
    expect(text).toContain("Nothing was written to the repository.");
    expect(text).toContain("fr wasn't added — its pull request closed without merging. Its translations stay in Malmoi.");
    expect(text).not.toContain("Held back");
    expect(text).not.toContain("until they can be sent");
    expect(button("Close")).toBeDefined();
  });

  it("보류 없는 정리 · 요청 둘 · GitLab — 복수 제목, merge request 만료 줄", async () => {
    const two = [...dropped.expiringLocales, { surfaceSlug: "web", localeCode: "ja", operation: "REMOVE", presence: "active" }];
    mocks.preview.mockResolvedValue(ok({ ...dropped, expiringLocales: two }));
    mocks.pull.mockResolvedValue({ status: "skipped", reason: "no-edits", expired: two });
    await render(<Host host="gitlab" languageWork={0} settle={Promise.resolve(true)} />);
    await act(async () => {});
    await click("Publish");
    await click("Close requests");
    const text = modal().textContent ?? "";
    expect(modal().querySelector("h2")?.textContent).toBe("Language requests closed");
    expect(text).toContain("Nothing was written to the repository.");
    expect(text).toContain("fr wasn't added — its merge request closed without merging. Its translations stay in Malmoi.");
    expect(text).toContain("ja wasn't removed — its merge request closed without merging. It stays in this source.");
  });

  /** 🟡3 — 미리보기 뒤 PR이 다시 열렸다(실행은 실물을 본다). "리포에 이미 있다"가 아니라 요청이 열린 PR을 기다린다고 말한다. */
  it("정리 미리보기 뒤 PR이 다시 열렸으면 결과가 요청이 남는다고 말한다 — already in the repository가 아니다", async () => {
    mocks.preview.mockResolvedValue(ok(dropped));
    mocks.pull.mockResolvedValue({ status: "skipped", reason: "no-edits", prOpen: true });
    await render(<Host languageWork={0} settle={Promise.resolve(true)} />);
    await act(async () => {});
    await click("Publish");
    await click("Close request");
    const text = modal().textContent ?? "";
    expect(text).toContain("A pull request with language changes is open, so the request stays until it's merged or closed. Nothing was sent.");
    expect(text).not.toContain("already in the repository");
  });

  it("만료될 요청이 없으면 지금처럼 Nothing can be sent yet + Close다(대조)", async () => {
    mocks.preview.mockResolvedValue(ok({ ...dropped, expiringLocales: undefined }));
    await render(<Host languageWork={0} settle={Promise.resolve(true)} />);
    await act(async () => {});
    await click("Publish");
    expect(modal().querySelector("h2")?.textContent).toBe(en.translations.publish.nothingSendable.title);
    expect(button("Close")).toBeDefined();
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
    // 고칠 자리로 바로 간다 — 소스 상세를 열고 그 언어 행에 포커스한다(E1 딥링크 계약 · R-E3 Y3).
    expect(open?.getAttribute("href")).toBe(routes.sources("acme", { source: "web", language: "fr" }));
    expect(open?.getAttribute("href")).toBe("/projects/acme/sources?source=web&language=fr");
    expect(button("Close")).toBeDefined();
  });

  it("소유 소스를 모르는 경로 충돌은 중복 문장으로 떨어지지 않는다", async () => {
    mocks.preview.mockResolvedValue({ ...refused, plan: { ...refused.plan, ownerSlug: null } });
    await render(<Host />); await click("Publish");
    const text = modal().textContent ?? "";
    expect(text).toContain("Malmoi can't plan the language files for web. apps/web/i18n/fr.json belongs to another source.");
    expect(text).not.toContain("Two languages");
  });

  it("언어를 모르는 거부(안전하지 않은 경로)는 소스 상세만 연다", async () => {
    mocks.preview.mockResolvedValue({ ...refused, path: "", plan: { refusal: "unsafe-path", surfaceSlug: "web", localeCode: null, ownerSlug: null } });
    await render(<Host />); await click("Publish");
    const open = [...modal().querySelectorAll("a")].find(a => a.textContent === "Open web");
    expect(open?.getAttribute("href")).toBe("/projects/acme/sources?source=web");
  });

  it("EDITOR — Close 하나", async () => {
    mocks.preview.mockResolvedValue(refused);
    await render(<Host role="EDITOR" />); await click("Publish");
    expect([...modal().querySelectorAll("a")].some(a => a.textContent === "Open web")).toBe(false);
    expect(button("Close")).toBeDefined();
  });
});

describe("Publish 결과 — 번역 0", () => {
  /** 언어를 거둔 Publish의 결과(#281) — 미리보기의 `Taken back` 사유와 같은 사실을 말한다. 일반 no-changes 원인 문장("same values were synced…")이 아니다. */
  it.each([
    ["github", "https://github.com/SinhyeokKang/malmoi/pull/128", "#128"],
    ["gitlab", "https://gitlab.com/SinhyeokKang/malmoi/-/merge_requests/128", "!128"],
  ] as const)("거둔 언어 %s — 결과가 그 언어를 이름으로 말한다", async (host, url, pr) => {
    mocks.preview.mockResolvedValue(ok({ ...takenBack, openPr: { number: 128, url } }));
    mocks.pull.mockResolvedValue({ status: "skipped", reason: "no-changes", closedPr: { number: 128, url }, withdrawn: takenBack.withdrawnLocales });
    await render(<Host host={host} />); await click("Publish");
    await click(host === "gitlab" ? "Close merge request !128" : "Close pull request #128");
    const text = modal().textContent ?? "";
    expect(text).toContain(`${pr} was closed because the language changes it carried were taken back. Nothing differs from main anymore.`);
    expect(text).toContain(`fr was cancelled after ${pr} was opened, so the file it was adding is no longer sent. Translations stay in Malmoi.`);
    expect(text).not.toContain("same values were synced");
    expect(text).not.toContain("Your edits now match");
  });

  /** 번역 0으로 열린 PR/MR을 교체한 결과(R-E3 Y4 — 변이 M3이 남았다). "today's 0"이 서지 않는다. */
  it.each([
    ["github", "https://github.com/SinhyeokKang/malmoi/pull/128", "#128 was still open, so Malmoi replaced its contents instead of opening a second one. It now holds everything unsent, including the language changes."],
    ["gitlab", "https://gitlab.com/SinhyeokKang/malmoi/-/merge_requests/128", "!128 was still open, so Malmoi replaced its contents instead of opening a second one. It now holds everything unsent, including the language changes."],
  ] as const)("교체 %s — 언어 변경을 담았다고 말한다", async (host, prUrl, sentence) => {
    mocks.preview.mockResolvedValue(ok({ ...removedOnly, openPr: { number: 128, url: prUrl } }));
    mocks.pull.mockResolvedValue({ status: "committed", pr: "updated", prUrl, delivered: 0, changed: ["apps/web/locales/de.json"], files: [{ path: "apps/web/locales/de.json", kind: "removed" }] });
    await render(<Host host={host} />); await click("Publish");
    await click(host === "gitlab" ? "Replace merge request !128" : "Replace pull request #128");
    const text = modal().textContent ?? "";
    expect(text).toContain(sentence);
    expect(text).not.toContain("today's 0");
  });

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
