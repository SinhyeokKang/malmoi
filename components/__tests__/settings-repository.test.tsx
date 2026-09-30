// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { RepositoryCard } from "@/components/settings/repository-card";
import { RepositoryForm } from "@/components/settings/repository-form";
import type { ConnectionHealth } from "@/lib/github-connect/health";
import { input, render } from "./helpers/dom";
const actions = vi.hoisted(() => ({ connectRepository: vi.fn(), updateRepositorySettings: vi.fn() }));
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => actions);
const branches = vi.hoisted(() => ({ listRepoBranches: vi.fn(), listProjectBranches: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => branches);
beforeEach(() => {
  branches.listRepoBranches.mockReset();
  branches.listProjectBranches.mockReset().mockResolvedValue({ ok: true, names: ["main", "dev"], defaultBranch: "main", truncated: false });
  actions.updateRepositorySettings.mockReset();
});
async function choose(container: HTMLElement, name: string) {
  await act(async () => { await userEvent.setup().click(container.querySelector('[role="combobox"]')!); });
  const option = [...document.querySelectorAll('[role="option"]')].find(node => node.textContent === name)!;
  await act(async () => { await userEvent.setup().click(option); });
}
const healths: ConnectionHealth[] = [{ status: "ok" }, { status: "not-connected" }, { status: "app-uninstalled" }, { status: "installation-changed", installationId: "2" }, { status: "repo-moved", fullName: "new/repo" }, { status: "repo-replaced" }, { status: "unknown" }];
/**
 * 배지·버튼 표 (ux-drift-unify D1) — Settings가 `connectionProblem`으로 Home과 같은 판정을 읽는다.
 * 설치는 있고 리포 id가 없는 `unpinned`는 목록·Home과 같은 **Disconnected**이고 버튼은 **Reconnect**다.
 */
it.each([
  [{ status: "ok" }, "Connected", null],
  [{ status: "not-connected" }, "Not connected", "Connect"],
  [{ status: "unpinned" }, "Disconnected", "Reconnect"],
  [{ status: "app-uninstalled" }, "Disconnected", "Reconnect"],
  [{ status: "installation-changed", installationId: "2" }, "Disconnected", "Reconnect"],
  [{ status: "repo-moved", fullName: "new/repo" }, "Connected", "Reconnect"],
  [{ status: "repo-replaced" }, "Wrong repository", null],
  [{ status: "unknown" }, "Couldn't check", null],
] as const)("건강성 %o → 배지 %s · 버튼 %s", async (health, badge, button) => {
  const { container } = await render(<RepositoryCard slug="acme" owner="acme" repo="web" branch="main" archived={false} health={Promise.resolve(health as ConnectionHealth)} account={Promise.resolve({ status: "ok", login: "octo" })} appSlug="malmoi" />);
  const row = container.querySelector("p.text-base")!;
  expect(row.textContent).toBe(`acme/web${badge}`);
  const connect = [...container.querySelectorAll("button")].map(b => b.textContent).filter(t => t === "Connect" || t === "Reconnect");
  expect(connect).toEqual(button === null ? [] : [button]);
});

/**
 * 아이콘 칸도 배지와 같은 상태 톤이다 (ux-drift-unify 1-Y15 — 전엔 칸만 회색이었다). 리포로 나가는 버튼은 색·새 탭이 신호라
 * 글리프를 달지 않는다 (DESIGN §6.3 · 3-Y9).
 */
it.each([
  [{ status: "ok" }, "success"],
  [{ status: "not-connected" }, "muted"],
  [{ status: "unpinned" }, "warning"],
  [{ status: "repo-replaced" }, "danger"],
  [{ status: "unknown" }, "warning"],
] as const)("건강성 %o → 아이콘 칸 %s", async (health, tone) => {
  const { container } = await render(<RepositoryCard slug="acme" owner="acme" repo="web" branch="main" archived={false} health={Promise.resolve(health as ConnectionHealth)} account={Promise.resolve({ status: "ok", login: "octo" })} appSlug="malmoi" />);
  expect(container.querySelector("[data-tone]")?.getAttribute("data-tone")).toBe(tone);
});

it("Open on GitHub는 새 탭이고 글리프가 없다", async () => {
  const { container } = await render(<RepositoryCard slug="acme" owner="acme" repo="web" branch="main" archived={false} health={Promise.resolve({ status: "ok" })} account={Promise.resolve({ status: "ok", login: "octo" })} appSlug="malmoi" />);
  const open = [...container.querySelectorAll("a")].find(a => a.textContent === "Open on GitHub")!;
  expect(open.getAttribute("target")).toBe("_blank");
  expect(open.querySelector("svg")).toBeNull();
});

it.each(healths)("건강성 $status를 보존하고 복구 가능한 갈래에만 재연결을 둔다", async health => {
  const { container } = await render(<RepositoryCard slug="acme" owner="acme" repo="web" branch="main" archived={false} health={Promise.resolve(health)} account={Promise.resolve({ status: "reauthorize" })} appSlug="malmoi" />);
  const connect = [...container.querySelectorAll("button")].filter(b => ["Connect", "Reconnect"].includes(b.textContent ?? ""));
  expect(connect).toHaveLength(["not-connected", "app-uninstalled", "installation-changed", "repo-moved"].includes(health.status) ? 1 : 0);
  expect(container.querySelector('a[href="/account"]')).not.toBeNull();
  expect(container.textContent).not.toContain("Disconnect GitHub");
  if (health.status === "repo-replaced") expect(container.textContent).toContain("different repository");
  if (health.status === "unknown") expect(container.textContent).toContain("Couldn't check");
  if (health.status === "app-uninstalled") expect(container.querySelector('a[href*="github.com/apps/"]')).not.toBeNull();
});

/**
 * ⚠️ **muted 면 위의 muted 글자는 4.35:1로 AA 하한을 깬다** (2026-09-23 실측 — DESIGN §6.7 온보딩 ①과
 * 같은 판정). 이 행이 `bg-muted`이므로 안내 캡션은 `text-foreground/60`이다.
 */
it("Base branch 안내 캡션은 muted 면 위에서 muted 글자를 쓰지 않는다", async () => {
  const { container } = await render(<RepositoryForm owner="acme" repo="web" slug="acme" baseBranch="main" />);
  const caption = container.querySelector("#base-branch-caption")!;
  expect(caption.closest(".bg-muted")).not.toBeNull();
  expect(caption.classList.contains("text-muted-foreground")).toBe(false);
  expect(caption.classList.contains("text-foreground/60")).toBe(true);
});

it("Base branch [Save]는 값이 바뀌어야 켜진다", async () => {
  const { container } = await render(<RepositoryForm owner="acme" repo="web" slug="acme" baseBranch="main" />);
  const save = () => [...container.querySelectorAll("button")].find(b => b.textContent === "Save")!;
  expect(save().disabled).toBe(true);
  await choose(container, "dev");
  expect(save().disabled).toBe(false);
});

it.each([[{ ok: true }, true], [{ ok: false, error: "unavailable" }, false]] as const)("Base branch 저장 결과 %o 뒤 [Save] disabled=%s — 성공하면 그 값이 기준이 된다", async (response, off) => {
  {
    actions.updateRepositorySettings.mockResolvedValueOnce(response);
    const { container } = await render(<RepositoryForm owner="acme" repo="web" slug="acme" baseBranch="main" />);
    const save = () => [...container.querySelectorAll("button")].find(b => b.textContent === "Save")!;
    await choose(container, "dev");
    await act(async () => { await userEvent.setup().click(save()); });
    expect(save().disabled).toBe(off);
  }
});

it("현재 브랜치가 목록에 없어도 초기 선택을 보존하고 목록에서 다른 브랜치를 고른다", async () => {
  const { container } = await render(<RepositoryForm slug="acme" owner="acme" repo="web" baseBranch="deleted" />);
  /**
   * 연결된 프로젝트의 브랜치 목록은 **읽기**다 (malmoi#123 — 지휘자 결정). 온보딩 ①의 `listRepoBranches`(쓰기 권한 요구)가
   * 아니라 프로젝트 slug로 인가하는 `listProjectBranches`를 부른다 — 읽기 권한만 가진 OWNER가 Settings에서 막히면 안 된다.
   */
  expect(branches.listProjectBranches).toHaveBeenCalledWith({ slug: "acme" });
  expect(branches.listRepoBranches).not.toHaveBeenCalled();
  expect(container.querySelector('[role="combobox"]')?.textContent).toContain("deleted");
  await choose(container, "dev");
  actions.updateRepositorySettings.mockResolvedValueOnce({ ok: true });
  await act(async () => { await userEvent.setup().click(container.querySelector('button[type="submit"]')!); });
  expect(actions.updateRepositorySettings).toHaveBeenCalledWith({ slug: "acme", baseBranch: "dev" });
});
it.each(["unavailable", "unauthorized", "repo-forbidden"])("목록 조회 %s 실패는 현재값을 유지하고 저장을 막는다", async error => {
  branches.listProjectBranches.mockResolvedValueOnce({ ok: false, error, defaultBranch: "main" });
  const { container } = await render(<RepositoryForm slug="acme" owner="acme" repo="web" baseBranch="release" />);
  expect(container.textContent).toContain("release");
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
});
it("조회 중에는 저장을 막고 완료 뒤에도 현재값을 유지한다", async () => {
  let finish!: (value: unknown) => void;
  branches.listProjectBranches.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const { container } = await render(<RepositoryForm slug="acme" owner="acme" repo="web" baseBranch="dev" />);
  expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
  await act(async () => finish({ ok: true, names: ["main", "dev"], defaultBranch: "main", truncated: false }));
  expect(container.querySelector('[role="combobox"]')?.textContent).toContain("dev");
});
it("보관된 프로젝트는 목록을 조회하지 않고 저장을 막는다", async () => {
  const { container } = await render(<RepositoryForm slug="acme" owner="acme" repo="web" baseBranch="dev" disabled />);
  expect(branches.listProjectBranches).not.toHaveBeenCalled();
  expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
});
it("목록이 잘렸으면 생성 화면처럼 입력으로 전환한다", async () => {
  branches.listProjectBranches.mockResolvedValueOnce({ ok: true, names: ["main"], defaultBranch: "main", truncated: true });
  const { container } = await render(<RepositoryForm slug="acme" owner="acme" repo="web" baseBranch="release" />);
  const field = container.querySelector<HTMLInputElement>("#base-branch")!;
  expect(field.value).toBe("release");
  await input(field, "invalid branch");
  await act(async () => { await userEvent.setup().click(container.querySelector('button[type="submit"]')!); });
  expect(actions.updateRepositorySettings).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
});

/** [malmoi#126] 300개 초과의 자유 입력도 sync 브랜치를 보내기 전에 막고, 왜 안 되는지 말한다. */
it("자유 입력의 sync 브랜치는 저장하지 않고 이유를 말한다", async () => {
  branches.listProjectBranches.mockResolvedValueOnce({ ok: true, names: ["main"], defaultBranch: "main", truncated: true });
  const { container } = await render(<RepositoryForm slug="acme" owner="acme" repo="web" baseBranch="release" />);
  await input(container.querySelector<HTMLInputElement>("#base-branch")!, "malmoi-i18n/sync-acme");
  await act(async () => { await userEvent.setup().click(container.querySelector('button[type="submit"]')!); });
  expect(actions.updateRepositorySettings).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("can't be the base branch");
});

it("저장 후 서버가 새 baseBranch를 보내도 성공 안내가 유지된다", async () => {
  actions.updateRepositorySettings.mockResolvedValueOnce({ ok: true });
  const { container, rerender } = await render(<RepositoryForm slug="acme" owner="acme" repo="web" baseBranch="main" />);
  await choose(container, "dev");
  await act(async () => { await userEvent.setup().click(container.querySelector('button[type="submit"]')!); });
  await rerender(<RepositoryForm slug="acme" owner="acme" repo="web" baseBranch="dev" />);
  expect(container.querySelector('#base-branch-caption')?.textContent).toContain("Saved");
});

/**
 * **`<label for>`는 라벨을 붙일 수 있는 컨트롤만 가리킨다** (audit #89). 보관·고정 갈래는 값이 `<p id="base-branch">`이고
 * 조회 중엔 그 id가 아예 없어서, 라벨이 없는 대상이나 문단을 가리켰다. 짝: 편집 갈래는 컨트롤을 가리킨다.
 */
it("Base branch 라벨은 보관 갈래의 문단을 for로 가리키지 않는다", async () => {
  const { container } = await render(<RepositoryForm slug="acme" owner="acme" repo="web" baseBranch="dev" disabled />);
  expect(container.querySelector("#base-branch")!.tagName).toBe("P");
  expect(container.querySelector("#base-branch-label")!.hasAttribute("for")).toBe(false);
});
it("Base branch 라벨은 조회 중 없는 대상을 가리키지 않는다", async () => {
  branches.listProjectBranches.mockReturnValue(new Promise(() => {}));
  const { container } = await render(<RepositoryForm owner="acme" repo="web" slug="acme" baseBranch="main" />);
  expect(container.querySelector("#base-branch")).toBeNull();
  expect(container.querySelector("#base-branch-label")!.hasAttribute("for")).toBe(false);
});
it("Base branch 라벨은 편집 컨트롤을 for로 가리킨다", async () => {
  const { container } = await render(<RepositoryForm owner="acme" repo="web" slug="acme" baseBranch="main" />);
  expect(container.querySelector("#base-branch-label")!.getAttribute("for")).toBe("base-branch");
  expect(container.querySelector("#base-branch")!.tagName).toBe("BUTTON");
});
