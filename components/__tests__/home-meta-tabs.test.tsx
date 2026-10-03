// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import { MetaColumn } from "@/components/home/meta-column";
import { homeLate, metaTabs, type HomeLate, type MetaTabsInput } from "@/lib/home/meta";
import { connectionProblem, repositoryConnectionState, type RepositoryConnectionState } from "@/lib/home/state";
import { m } from "@/lib/i18n";
import { relativeTime } from "@/lib/relative-time";
import { routes } from "@/lib/routes";
import { STATE } from "@/lib/status/canon";

import { find, render } from "./helpers/dom";

// ⚠️ Radix + user-event는 jsdom에서 실시간 지연이 있다(POSTMORTEM 2026-09-13) — 이 파일에만 건다.
vi.setConfig({ testTimeout: 20_000 });

/**
 * Home 메타 열의 탭 셋 (project-card-tabs T8). 행의 유무는 `metaTabs` 단위 테스트가 전수로 든다 — 여기는 **그 행이 어떻게 그려지나**와
 * 탭 껍데기의 배선(늦게 오는 값 · 바닥 링크 · 랜드마크)을 본다. 배지는 `[word]`로 적는다.
 *
 * ⚠️ Radix는 비활성 패널의 **자식만** 언마운트하고 껍데기를 `hidden`으로 남긴다 — 보이는 패널만 센다.
 */
const SHOWN = '[role="tabpanel"]:not([hidden])';
const now = new Date("2026-10-04T12:00:00Z");
const synced = new Date("2026-10-04T11:00:00Z");
const published = new Date("2026-10-03T12:00:00Z");

const input: MetaTabsInput = {
  repository: { owner: "acme", name: "web", branch: "main", connection: "connected" },
  ciConfigured: true,
  surfaceCount: 2,
  keys: 1207,
  members: 4,
  pendingInvites: 2,
  createdAt: new Date("2026-08-01T00:00:00Z"),
  archivedAt: null,
  lastSync: { trigger: "nightly", at: synced, result: "partial", changedValues: 128, keys: 903, surfaceSlugs: ["mobile", "web"] },
  lastPublish: { trigger: "manual", at: published, prUrl: "https://github.com/acme/web/pull/127", changedValues: 24, surfaceSlugs: ["mobile", "web"] },
  held: null,
  prState: "absent",
};

async function setup(over: Partial<MetaTabsInput> = {}, opts: { canOpenSettings?: boolean; late?: Promise<HomeLate> } = {}) {
  const { container } = await render(
    <MetaColumn tabs={metaTabs({ ...input, ...over })} slug="acme" now={now} canOpenSettings={opts.canOpenSettings ?? true} late={opts.late} />,
  );
  const user = userEvent.setup();
  const open = async (label: string) => {
    const tab = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((node) => node.textContent === label);
    if (tab === undefined) throw new Error(`Missing tab: ${label}`);
    await act(async () => { await user.click(tab); });
  };
  const panel = () => find<HTMLElement>(container, SHOWN);
  /** 보이는 패널의 행 — `라벨 → 값`. 배지는 `[word]`. */
  const rows = () => Object.fromEntries([...panel().querySelectorAll("dl > div")].map((row) => {
    const dd = row.querySelector("dd")!.cloneNode(true) as HTMLElement;
    for (const badge of dd.querySelectorAll(".rounded-full")) badge.textContent = `[${badge.textContent}]`;
    return [row.querySelector("dt")!.textContent, dd.textContent];
  }));
  return { container, open, panel, rows };
}

describe("메타 열 — 구조", () => {
  it("카드 머리 없이 탭 목록이 머리다 — aside가 aria-label로 `Project`를 든다", async () => {
    const { container } = await setup();
    const aside = find(container, "aside");
    expect(aside.getAttribute("aria-label")).toBe(m.home.meta.title);
    expect(aside.hasAttribute("aria-labelledby")).toBe(false);
    expect(container.querySelector("h2")).toBeNull();
    expect(find(container, '[role="tablist"]').getAttribute("aria-label")).toBe(m.home.meta.tabs.list);
    expect([...container.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent))
      .toEqual([m.home.meta.tabs.project, m.home.meta.tabs.sync, m.home.meta.tabs.publish]);
    expect(find(container, '[role="tab"][aria-selected="true"]').textContent).toBe(m.home.meta.tabs.project);
    expect(container.querySelectorAll(SHOWN)).toHaveLength(1);
  });

  /** aside가 `overflow-hidden`이라 바깥 링이 잘린다 — 패널 링은 안쪽에 긋는다(DESIGN §7 예외). 시각은 (b). */
  it("패널 포커스 링이 안쪽이다", async () => {
    const { container } = await setup();
    for (const panel of container.querySelectorAll('[role="tabpanel"]')) expect(panel.className).toContain("ring-inset");
  });

  it("묶음 사이만 구분선이다 — 첫 묶음은 탭 머리 선을 쓴다", async () => {
    const { panel } = await setup();
    const groups = [...panel().querySelectorAll("dl")];
    expect(groups).toHaveLength(3);
    expect(groups.map((dl) => dl.className.includes("border-t"))).toEqual([false, true, true]);
  });

  /** spec 완료 조건 — 한 행 = 라벨 하나 + 사실 하나. 값 안에 `·`로 이은 둘째 사실이 없다. */
  it("세 탭 어느 값에도 `·`가 없다", async () => {
    const { open, panel } = await setup({ held: "open-pr", prState: "absent" });
    for (const tab of [m.home.meta.tabs.project, m.home.meta.tabs.sync, m.home.meta.tabs.publish]) {
      await open(tab);
      for (const dd of panel().querySelectorAll("dd")) expect(dd.textContent, tab).not.toContain("·");
    }
  });

  it("값은 오른쪽 정렬이고 라벨 폭은 96이다", async () => {
    const { panel } = await setup();
    for (const row of panel().querySelectorAll("dl > div")) {
      expect(row.querySelector("dt")!.className).toContain("w-24");
      expect(row.querySelector("dd")!.className).toContain("text-right");
    }
  });
});

describe("메타 열 — Project 탭", () => {
  it("행과 값", async () => {
    const { rows } = await setup();
    expect(rows()).toEqual({
      [m.home.meta.repository]: "acme/web",
      [m.home.meta.connection]: `[${STATE.connected.label}]`,
      [m.home.meta.branch]: "main",
      [m.home.meta.ci]: m.home.meta.configured,
      [m.home.meta.sources]: "2",
      [m.home.meta.keys]: "1,207",
      [m.home.meta.members]: "4 (2)",
      [m.home.meta.created]: relativeTime(input.createdAt, now),
    });
  });

  it("대기 초대가 없어도 `(0)`이다 · CI 미설정", async () => {
    const { rows } = await setup({ pendingInvites: 0, ciConfigured: false });
    expect(rows()[m.home.meta.members]).toBe("4 (0)");
    expect(rows()[m.home.meta.ci]).toBe(m.home.meta.notSetUp);
  });

  it("리포는 GitHub으로 나가는 파랑 링크이고 Sources는 앱 안 검정 링크 + chevron이다", async () => {
    const { panel } = await setup();
    const repo = find<HTMLAnchorElement>(panel(), 'a[target="_blank"]');
    expect(repo.getAttribute("href")).toBe("https://github.com/acme/web");
    expect(repo.className).toContain("text-link");
    const sources = find<HTMLAnchorElement>(panel(), `a[href="${routes.sources("acme")}"]`);
    expect(sources.className).not.toContain("text-link");
    expect(sources.querySelector("svg")).not.toBeNull();
  });

  it.each([
    ["connected", true],
    ["couldNotCheck", true],
    ["notConnected", false],
    ["disconnected", false],
    ["wrongRepository", false],
  ] as const satisfies readonly (readonly [RepositoryConnectionState, boolean])[])("연결 %s — Connection 배지 · 리포 링크 %s", async (connection, linked) => {
    const { panel, rows } = await setup({ repository: { ...input.repository, connection } });
    expect(rows()[m.home.meta.connection]).toBe(`[${STATE[connection].label}]`);
    expect(panel().querySelector('a[target="_blank"]') !== null).toBe(linked);
    expect(rows()[m.home.meta.repository]).toBe("acme/web");
  });

  /** 페이지는 연결 조회가 던지면 `{ status: "unknown" }`으로 접는다 — 그 값이 설정 카드와 같은 판정을 지나 `Couldn't check`로 선다. */
  it("연결 조회 실패(unknown)는 Couldn't check다 — 끊김으로 접지 않는다", async () => {
    const connection = repositoryConnectionState("unknown", connectionProblem("unknown"));
    const { rows } = await setup({ repository: { ...input.repository, connection } });
    expect(rows()[m.home.meta.connection]).toBe(`[${STATE.couldNotCheck.label}]`);
  });

  it("보관이면 Archived 행이 시각만 든다", async () => {
    const archivedAt = new Date("2026-10-01T00:00:00Z");
    const { rows } = await setup({ archivedAt });
    expect(rows()[m.home.meta.archived]).toBe(relativeTime(archivedAt, now));
  });
});

describe("메타 열 — Sync 탭", () => {
  it("한 실행의 사실 — 주체 배지 · 종료 시각 · 결과 배지 · 수치 · 소스", async () => {
    const { open, rows } = await setup();
    await open(m.home.meta.tabs.sync);
    expect(rows()).toEqual({
      [m.home.meta.lastSync]: `[${m.logs.meta.runType.IMPORT.nightly}]`,
      [m.home.meta.synced]: relativeTime(synced, now),
      [m.home.meta.result]: `[${STATE.partiallySynced.label}]`,
      [m.home.meta.changed]: m.home.meta.values(128),
      [m.home.meta.keysSeen]: "903",
      [m.home.meta.sources]: "mobile, web",
    });
  });

  it("첫 Sync 전은 Not synced yet 배지 · 기록 이전 적재는 회색 평문", async () => {
    const first = await setup({ lastSync: null });
    await first.open(m.home.meta.tabs.sync);
    expect(first.rows()).toEqual({ [m.home.meta.lastSync]: `[${STATE.notSyncedYet.label}]` });
    const unrecorded = await setup({ lastSync: "unrecorded" });
    await unrecorded.open(m.home.meta.tabs.sync);
    expect(unrecorded.rows()).toEqual({ [m.home.meta.lastSync]: m.home.meta.unrecorded });
    expect(find(unrecorded.panel(), "dd").className).toContain("text-gray-dim");
  });

  it("첫 렌더에 아는 보류는 Hold 배지 행이다", async () => {
    const { open, rows } = await setup({ held: "pending-edits" });
    await open(m.home.meta.tabs.sync);
    expect(rows()[m.home.meta.hold]).toBe(`[${STATE.held.label}]`);
  });
});

describe("메타 열 — 늦게 오는 Hold · PR state", () => {
  const pending = { held: null, prState: "pending" } as const;

  /**
   * ⚠️ **탭을 갔다 오면 패널 자식이 다시 마운트된다** — 값을 패널 안에서 구독하면 한 프레임 비운 채 그린다(`useArrived`는 `null`에서 시작).
   * 껍데기가 한 번 구독해 내리므로 돌아온 즉시 선다.
   */
  it("Hold가 마지막 묶음 끝에 붙고 탭 전환 뒤에도 비지 않는다", async () => {
    const { open, panel } = await setup(pending, { late: Promise.resolve(homeLate("open-pr")) });
    await open(m.home.meta.tabs.sync);
    const last = () => [...panel().querySelectorAll("dl")].at(-1)!;
    expect(last().lastElementChild?.querySelector("dt")?.textContent).toBe(m.home.meta.hold);
    await open(m.home.meta.tabs.publish);
    await open(m.home.meta.tabs.sync);
    expect(last().lastElementChild?.querySelector("dt")?.textContent).toBe(m.home.meta.hold);
    expect(last().lastElementChild?.querySelector("dd")?.textContent).toBe(STATE.held.label);
  });

  it("도착 전에는 Hold 자리가 없다", async () => {
    const { open, rows } = await setup(pending, { late: new Promise(() => {}) });
    await open(m.home.meta.tabs.sync);
    expect(rows()[m.home.meta.hold]).toBeUndefined();
  });

  it("PR state는 도착 전 56px 스켈레톤이 자리를 잡는다", async () => {
    const { open, panel } = await setup(pending, { late: new Promise(() => {}) });
    await open(m.home.meta.tabs.publish);
    const row = [...panel().querySelectorAll("dl > div")].find((node) => node.querySelector("dt")?.textContent === m.home.meta.prState);
    expect(row?.querySelector("dd [data-skeleton-line], dd .w-14")).not.toBeNull();
  });

  it.each([
    ["open-pr", `[${STATE.prOpen.label}]`],
    [null, m.home.meta.notOpen],
    ["pr-check-failed", `[${STATE.couldNotCheck.label}]`],
  ] as const)("PR 조회 결론 %s → PR state %s", async (reason, text) => {
    const { open, rows } = await setup(pending, { late: Promise.resolve(homeLate(reason)) });
    await open(m.home.meta.tabs.publish);
    expect(rows()[m.home.meta.prState]).toBe(text);
  });

  it("Publish 탭 — PR 번호 링크 · 주체 배지 · 시각 · 값 수 · 소스", async () => {
    const { open, rows, panel } = await setup();
    await open(m.home.meta.tabs.publish);
    expect(rows()).toEqual({
      [m.home.meta.lastPublish]: `[${m.logs.meta.runType.PUBLISH.manual}]`,
      [m.home.meta.published]: relativeTime(published, now),
      [m.home.meta.pullRequest]: m.home.meta.pr(127),
      [m.home.meta.changed]: m.home.meta.values(24),
      [m.home.meta.sources]: "mobile, web",
    });
    expect(find(panel(), 'a[target="_blank"]').getAttribute("href")).toBe("https://github.com/acme/web/pull/127");
  });

  it("미연결이면 PR 번호가 평문이다", async () => {
    const { open, panel, rows } = await setup({ repository: { ...input.repository, connection: "disconnected" } });
    await open(m.home.meta.tabs.publish);
    expect(panel().querySelector('a[target="_blank"]')).toBeNull();
    expect(rows()[m.home.meta.pullRequest]).toBe(m.home.meta.pr(127));
  });

  it("발송 전 — Never 회색 평문 한 행", async () => {
    const { open, rows } = await setup({ lastPublish: null });
    await open(m.home.meta.tabs.publish);
    expect(rows()).toEqual({ [m.home.meta.lastPublish]: m.home.meta.never });
  });

  /** 닫아도 풀린다 — Logs 사유 문장("merged or closed")과 같은 조건을 말한다. */
  it("PR 보류 사유는 머지와 닫기 둘 다를 푸는 조건으로 말한다", () => {
    expect(m.home.cards.held["open-pr"]).toContain("merged or closed");
    expect(m.logs.deferReasons["open-pr"]).toContain("merged or closed");
  });

  /** PR 조회 실패도 보류다(게이트 fail-closed) — 목적어를 붙인다(홀로 서는 "Couldn't check"는 연결 확인 실패 낱말이다). */
  it("PR 조회 실패 사유는 Couldn't check for an open pull request다", () => {
    expect(m.home.cards.held["pr-check-failed"].toLowerCase()).toContain("couldn't check for an open pull request");
  });
});

/**
 * 바닥 링크 — 탭마다 하나. `Settings ›`는 OWNER(Project 탭)만, `Sync logs ›`·`Publish logs ›`는 전 역할 · 보관 중에도 · 이력이 없어도 선다
 * (빈 목록은 Logs의 빈 상태가 말한다). ⚠️ 시안(`Logs ›`, 필터 없음)과 다르다 — spec "결정"이 이긴다.
 */
describe("메타 열 — 바닥 링크", () => {
  const footer = (panel: HTMLElement) => [...panel.querySelectorAll(":scope > a")].map((a) => [a.textContent, a.getAttribute("href")]);

  it.each([true, false])("canOpenSettings=%s", async (canOpenSettings) => {
    const { open, panel } = await setup({ lastSync: null, lastPublish: null, archivedAt: new Date("2026-10-01T00:00:00Z") }, { canOpenSettings });
    expect(footer(panel())).toEqual(canOpenSettings ? [[m.home.meta.settings, routes.settings("acme")]] : []);
    await open(m.home.meta.tabs.sync);
    expect(footer(panel())).toEqual([[m.home.meta.syncLogs, routes.logs("acme", { kind: "imports" })]]);
    await open(m.home.meta.tabs.publish);
    expect(footer(panel())).toEqual([[m.home.meta.publishLogs, routes.logs("acme", { kind: "publish" })]]);
  });
});
