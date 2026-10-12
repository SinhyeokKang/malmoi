// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

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

describe("시안 대조 (G8·G8b)", () => {
  it("만료 임박은 머리 warning 띠 · 호박 칩 · primary [Replace token]이다 (#255)", async () => {
    const c = await section({ username: "ox", expiresAt: new Date(NOW + 9 * day).toISOString(), projectCount: 1 });
    const notice = c.querySelector("[data-card-notice]");
    expect(notice?.textContent).toMatch(/^Your GitLab token expires in \d+ days, on /);
    expect(c.querySelector("li [data-tone]")?.getAttribute("data-tone")).toBe("warning");
    const replace = [...c.querySelectorAll("button")].find((b) => b.textContent === en.account.gitlab.replace)!;
    expect(replace.classList.contains("bg-primary")).toBe(true);
  });

  it("정상은 띠 없음 · 중립 칩 · 기본 [Replace token]이다 (대조)", async () => {
    const c = await section({ username: "ox", expiresAt: new Date(NOW + 60 * day).toISOString(), projectCount: 1 });
    expect(c.querySelector("[data-card-notice]")).toBeNull();
    const replace = [...c.querySelectorAll("button")].find((b) => b.textContent === en.account.gitlab.replace)!;
    expect(replace.classList.contains("bg-primary")).toBe(false);
  });

  it("미연결 PAT 폼은 구분선 없이 행 이름선(pl-14)에서 시작한다 (#256)", async () => {
    const c = await section(null);
    const block = c.querySelector("form")!.parentElement!;
    expect(block.className).toContain("pl-14");
    expect(block.className).not.toContain("border-t");
  });

  it("[Connect] 뒤 카드가 연결 행이 되면 포커스가 [Replace token]에 착지한다 (#257)", async () => {
    const { act } = await import("react");
    const { createRoot } = await import("react-dom/client");
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<GitLabSection connection={null} />));
    host.querySelector("input")!.focus();
    await act(async () => root.render(<GitLabSection connection={{ username: "ox", expiresAt: null, projectCount: 0 }} />));
    expect(document.activeElement?.textContent).toBe(en.account.gitlab.replace);
    await act(async () => root.unmount());
    host.remove();
  });

  it("해제 확인 버튼은 GitLab 문구다 — GitHub App의 'Disconnect app'을 쓰지 않는다", async () => {
    const userEvent = (await import("@testing-library/user-event")).default;
    const c = await section({ username: "ox", expiresAt: null, projectCount: 1 });
    const trigger = c.querySelector<HTMLButtonElement>(`[aria-label="${en.account.gitlab.disconnectLabel}"]`)!;
    const { act } = await import("react");
    await act(async () => { await userEvent.setup().click(trigger); });
    const confirm = [...document.querySelectorAll('[role="dialog"] button')].map((b) => b.textContent);
    expect(confirm).toContain(en.account.gitlab.disconnectConfirm);
    expect(confirm).not.toContain(en.settings.account.disconnectConfirm);
  });
});
