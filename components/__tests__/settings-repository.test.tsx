// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { RepositoryCard } from "@/components/settings/repository-card";
import type { ConnectionHealth } from "@/lib/github-connect/health";
import { render } from "./helpers/dom";
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({ connectRepository: vi.fn(), updateRepositorySettings: vi.fn() }));
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
