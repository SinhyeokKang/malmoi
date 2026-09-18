// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { HomeActions, HomeHeaderActions, HomeNotices } from "@/components/home/actions";
import { render } from "./helpers/dom";

/**
 * **머리의 버튼 둘이 서로를 잠근다** (시안 `4f` · sync-repository T9 연결 계약).
 *
 * ⚠️ **두 방향이 동시에 돌면 어느 쪽 값이 남는지 화면이 설명할 수 없다.** Sync는 리포로 DB를 덮고
 * Publish는 DB로 리포를 덮는다 — 겹치는 순간 남는 값이 두 요청의 도착 순서에 달리고, 그것은 화면이
 * 약속할 수 없는 근거다. 그래서 **어느 한쪽이 도는 동안 다른 쪽이 비활성**이다.
 *
 * ⚠️ **이것은 호스트의 몫이고 `SyncButton`·`PublishButton` 안에 없다** — 각 버튼은 자기 연타만 막고,
 * 서로의 존재를 모른다. 2026-09-15 브라우저 실측에서 `Syncing…` 중 `[Publish]`가 그대로 눌렸다.
 *
 * ⚠️ **`[Sync]`는 native `disabled`가 아니라 `aria-disabled`다** — Dialog가 닫힐 때 포커스를 되돌릴
 * 대상으로 남아야 한다(DESIGN §6.64). 그래서 이 파일은 두 버튼을 **다른 속성**으로 센다.
 */
const mocks = vi.hoisted(() => ({ run: vi.fn(), pr: vi.fn(), pull: vi.fn(), refresh: vi.fn(), preview: vi.fn() }));
// ⚠️ 보관·재연결 Action까지 mock한다 — 호스트가 배너 액션으로 그 둘을 들고 오고, 실물 모듈은
// `next-auth`를 통해 서버 전용 코드를 끌어온다.
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: mocks.run, checkOpenPullRequest: mocks.pr, prepareRepositorySync: vi.fn().mockResolvedValue(undefined), archiveProject: vi.fn(), unarchiveProject: vi.fn() }));
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({ connectRepository: vi.fn() }));
vi.mock("@/app/(edit)/actions", () => ({ triggerPullAction: mocks.pull }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: mocks.preview }));

const props = { slug: "acme", name: "malmoi web", branch: "main", role: "OWNER" as const, unsent: 12, paused: false,
  repo: { owner: "owner", name: "repo", branch: "main", syncBranch: "malmoi-i18n/sync-acme" } };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

function button(name: string) {
  const node = [...document.querySelectorAll("button")].find(b => (b.textContent ?? "").trim().startsWith(name));
  if (!node) throw new Error(`Missing button: ${name}`);
  return node;
}

/** 눌러도 아무 일이 없는가 — `disabled`와 `aria-disabled` 어느 쪽으로 잠갔든 같은 질문이다. */
function locked(node: Element) {
  return (node as HTMLButtonElement).disabled || node.getAttribute("aria-disabled") === "true";
}

async function click(name: string) {
  await act(async () => { await userEvent.setup().click(button(name)); });
}

/** 머리의 버튼 둘과 **본문의 실패 배너**를 한 Provider 안에 세운다 — 실제 Home의 배치다. */
function Host() {
  return <>
    <HomeHeaderActions {...props} />
    <HomeNotices {...props} state="import_failed" failedSurface="web" reason="import-failed" lastSyncAt={null} now={new Date("2026-09-15T12:00:00Z")} />
  </>;
}

beforeEach(() => { vi.clearAllMocks(); mocks.pr.mockResolvedValue(null); mocks.preview.mockResolvedValue({ status: "ok", preview: { groups: [], total: 12, keys: 9, truncated: 0, openPr: null } }); });

it("Sync가 도는 동안 Publish가 잠기고 끝나면 함께 풀린다", async () => {
  const run = deferred<{ ok: true; surfaces: []; remainingEdits: number }>();
  mocks.run.mockReturnValue(run.promise);
  await render(<HomeActions slug="acme"><Host /></HomeActions>);

  expect(locked(button("Publish"))).toBe(false);
  await click("Sync");
  // 미전달 편집이 있는 픽스처라 확정이 곧 폐기다 — 라벨이 그 사실을 말한다 (sync-edit-protection T13).
  await click("Discard changes and sync");

  expect(button("Syncing")).toBeDefined();
  expect(locked(button("Publish"))).toBe(true);
  // ⚠️ 잠겼어도 **호출까지 막혀야 한다** — 비활성 표시만 하고 핸들러가 살아 있으면 Enter가 통과한다.
  await click("Publish");
  expect(mocks.pull).not.toHaveBeenCalled();

  await act(async () => { run.resolve({ ok: true, surfaces: [], remainingEdits: 0 }); await run.promise; });
  expect(locked(button("Publish"))).toBe(false);
});

it("Publish가 도는 동안 Sync가 잠기고 확인 Dialog도 열리지 않는다", async () => {
  const pull = deferred<{ status: "skipped"; reason: "no-edits" }>();
  mocks.pull.mockReturnValue(pull.promise);
  await render(<HomeActions slug="acme"><Host /></HomeActions>);

  await click("Publish");
  expect(mocks.pull).not.toHaveBeenCalled();
  await click("Open pull request");
  await act(async () => { (document.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click(); });
  expect(locked(button("Sync"))).toBe(true);

  await click("Sync");
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(mocks.run).not.toHaveBeenCalled();

  await act(async () => { pull.resolve({ status: "skipped", reason: "no-edits" }); await pull.promise; });
  expect(locked(button("Sync"))).toBe(false);
});

/**
 * ⚠️ **잠금이 역할 갈래를 덮지 않는다** — EDITOR에게 `[Sync]`는 비활성이 아니라 **부재**다
 * (DESIGN §6.64). Publish가 도는 동안에도 그 규칙이 그대로여야 한다.
 */
it("EDITOR에게는 Publish가 도는 동안에도 Sync가 서지 않는다", async () => {
  const pull = deferred<{ status: "skipped"; reason: "no-edits" }>();
  mocks.pull.mockReturnValue(pull.promise);
  await render(<HomeActions slug="acme"><HomeHeaderActions {...props} role="EDITOR" /></HomeActions>);

  await click("Publish");
  expect([...document.querySelectorAll("button")].some(b => (b.textContent ?? "").includes("Sync"))).toBe(false);

  await act(async () => { pull.resolve({ status: "skipped", reason: "no-edits" }); await pull.promise; });
});

/**
 * ⚠️ **잠금이 확인 Dialog를 "예약"하면 안 된다** (2026-09-15 재리뷰 🟡4 — 잠금을 넣은 변경이 스스로
 * 만든 갈래다). `SyncButton`은 `paused`인 동안 Dialog를 아예 세우지 않으므로, 배너의 `[Try again]`이
 * 그때 `syncOpen`을 참으로 만들면 **화면에는 아무 일도 안 일어나고** Publish가 끝나는 순간 되돌릴 수
 * 없는 동작의 확인 창이 **혼자 열린다.** 기존 `paused` 둘(미연결·보관)에는 그 자리에 `[Try again]`이
 * 없어 밟히지 않던 자리다.
 */
it("Publish가 도는 동안 연 확인 Dialog가 Publish 종료 시점에 혼자 열리지 않는다", async () => {
  const pull = deferred<{ status: "skipped"; reason: "no-edits" }>();
  mocks.pull.mockReturnValue(pull.promise);
  const view = await render(<HomeActions slug="acme"><Host /></HomeActions>);
  await click("Publish");
  await click("Open pull request");
  await act(async () => { (document.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click(); });

  /*
    ⚠️ **무반응이 아니라 비활성이어야 한다** (라운드 3 🟡3). 같은 Action을 여는 머리의 `[Sync]`는
    그때 `disabled`로 서서 이유를 표시하는데, 이 버튼만 활성인 채 눌려도 아무 일이 없으면 세 자리가
    "같은 라벨·같은 Action"이라는 규칙이 화면에서 깨진다 — 비활성 버튼도 이유를 말하지 못하지만
    **비활성조차 아닌 버튼**은 그보다 한 단계 아래다.
  */
  expect(locked(button("Try again"))).toBe(true);
  await click("Try again");
  expect(document.querySelector('[role="dialog"]')).toBeNull();

  await act(async () => { pull.resolve({ status: "skipped", reason: "no-edits" }); await pull.promise; });
  await view.rerender(<HomeActions slug="acme"><Host /></HomeActions>);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(mocks.run).not.toHaveBeenCalled();

  /*
    ⚠️ **긍정 대조** (라운드 3 ⚪) — 위 셋만 있으면 `setSyncOpen`이 **영영 안 열리게** 망가져도
    전부 green이다. 잠금이 풀린 뒤 같은 버튼이 실제로 확인 창을 여는 것까지 세야 방어선이 된다.
  */
  expect(locked(button("Try again"))).toBe(false);
  await click("Try again");
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
});
