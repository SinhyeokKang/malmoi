// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { RepositoryCard } from "@/components/settings/repository-card";
import { RepositoryForm } from "@/components/settings/repository-form";
import type { ConnectionHealth } from "@/lib/github-connect/health";
import { input, render } from "./helpers/dom";
const actions = vi.hoisted(() => ({ connectRepository: vi.fn(), updateRepositorySettings: vi.fn() }));
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => actions);
const healths: ConnectionHealth[] = [{ status: "ok" }, { status: "not-connected" }, { status: "app-uninstalled" }, { status: "installation-changed", installationId: "2" }, { status: "repo-moved", fullName: "new/repo" }, { status: "repo-replaced" }, { status: "unknown" }];
it.each(healths)("건강성 $status를 보존하고 복구 가능한 갈래에만 재연결을 둔다", async health => {
  const { container } = await render(<RepositoryCard slug="acme" owner="acme" repo="web" branch="main" archived={false} health={health} account={{ status: "reauthorize" }} appSlug="malmoi" />);
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
  const { container } = await render(<RepositoryForm slug="acme" baseBranch="main" />);
  const caption = container.querySelector("#base-branch-caption")!;
  expect(caption.closest(".bg-muted")).not.toBeNull();
  expect(caption.classList.contains("text-muted-foreground")).toBe(false);
  expect(caption.classList.contains("text-foreground/60")).toBe(true);
});

it("Base branch [Save]는 값이 바뀌어야 켜진다", async () => {
  const { container } = await render(<RepositoryForm slug="acme" baseBranch="main" />);
  const save = () => [...container.querySelectorAll("button")].find(b => b.textContent === "Save")!;
  expect(save().disabled).toBe(true);
  await input(container.querySelector<HTMLInputElement>("#base-branch")!, "dev");
  expect(save().disabled).toBe(false);
});

it.each([[{ ok: true }, true], [{ ok: false, error: "unavailable" }, false]] as const)("Base branch 저장 결과 %o 뒤 [Save] disabled=%s — 성공하면 그 값이 기준이 된다", async (response, off) => {
  {
    actions.updateRepositorySettings.mockResolvedValueOnce(response);
    const { container } = await render(<RepositoryForm slug="acme" baseBranch="main" />);
    const save = () => [...container.querySelectorAll("button")].find(b => b.textContent === "Save")!;
    await input(container.querySelector<HTMLInputElement>("#base-branch")!, "dev");
    await act(async () => { await userEvent.setup().click(save()); });
    expect(save().disabled).toBe(off);
  }
});
