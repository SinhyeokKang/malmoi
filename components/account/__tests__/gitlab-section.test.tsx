// @vitest-environment jsdom
import { expect, it, vi } from "vitest";

import { render } from "@/components/__tests__/helpers/dom";
import { en } from "@/messages/en";

vi.mock("@/app/(edit)/account/actions", () => ({ connectGitLab: vi.fn(), disconnectGitLab: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }) }));

const { GitLabSection } = await import("../gitlab-section");

/**
 * `/account`의 GitLab PAT 카드 (시안 G8 · design-brief 확정 6·7). 토큰의 자리라 상태 배지는 토큰이 어떤가를 말한다 —
 * 만료 임박(14일)은 warning `Expires soon`, 지남은 `Expired`(design §2 톤 표).
 */
const NOW = Date.now();
const day = 86_400_000;

async function section(connection: { username: string; expiresAt: string | null; projectCount: number } | null) {
  const { container } = await render(<GitLabSection connection={connection} />);
  return container;
}

const text = (c: ParentNode) => c.textContent ?? "";

it("미연결이면 카드 안에 PAT 입력이 선다 (G8b)", async () => {
  const c = await section(null);
  expect(text(c)).toContain(en.account.gitlab.title);
  expect(c.querySelector('input[type="password"]')).not.toBeNull();
  expect(text(c)).toContain(en.settings.repository.notConnected);
});

it("연결됨은 @사용자명·만료일·사용 프로젝트 수와 [Replace token]·[Disconnect]가 선다", async () => {
  const c = await section({ username: "ox501501", expiresAt: new Date(NOW + 60 * day).toISOString(), projectCount: 2 });
  expect(text(c)).toContain("@ox501501");
  expect(text(c)).toContain(en.settings.repository.health.ok);
  expect(text(c)).toContain(en.account.gitlab.usedBy(2));
  const labels = [...c.querySelectorAll("button")].map((b) => b.getAttribute("aria-label") ?? b.textContent);
  expect(labels).toContain(en.account.gitlab.replace);
  // 나란히 선 Disconnect의 접근 이름이 축을 든다 — GitHub App 카드의 것과 다르다 (DESIGN §6.646)
  expect(labels).toContain(en.account.gitlab.disconnectLabel);
  expect(en.account.gitlab.disconnectLabel).not.toBe(en.settings.account.disconnectLabel);
  expect(c.querySelector('input[type="password"]')).toBeNull();
});

it("만료 14일 이내는 Expires soon 배지다 (D11)", async () => {
  const c = await section({ username: "ox", expiresAt: new Date(NOW + 5 * day).toISOString(), projectCount: 0 });
  expect(text(c)).toContain(en.account.gitlab.expiresSoon);
});

it("만료일이 지났으면 Expired 배지이고 교체를 말한다", async () => {
  const c = await section({ username: "ox", expiresAt: new Date(NOW - day).toISOString(), projectCount: 1 });
  expect(text(c)).toContain(en.mcpConnector.token.expired);
  expect(text(c)).not.toContain(en.account.gitlab.expiresSoon);
});

it("GitLab 카드에 GitHub·pull request 낱말이 없다", async () => {
  for (const connection of [null, { username: "ox", expiresAt: null, projectCount: 3 }]) {
    expect(text(await section(connection))).not.toMatch(/github|pull request/i);
  }
});

it("호스트는 글리프만이 아니라 텍스트로 드러난다 — 미연결 행 이름이 GitLab이다", async () => {
  const c = await section(null);
  expect(text(c)).toContain(en.account.gitlab.rowName);
});
