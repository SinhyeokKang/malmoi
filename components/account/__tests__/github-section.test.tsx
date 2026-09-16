// @vitest-environment jsdom
import { expect, it, vi } from "vitest";

import { render } from "@/components/__tests__/helpers/dom";
import type { AccountView } from "@/lib/github-connect/account-view";
import { m } from "@/lib/i18n";

vi.mock("@/app/(edit)/projects/actions", () => ({ disconnectGithub: vi.fn(), startGithubConnectForUser: vi.fn() }));
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({ startGithubConnect: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }) }));

const { GithubSection } = await import("../github-section");

/**
 * GitHub App 구역의 **행 안 갈래** (design §3.6 · tasks T3).
 *
 * ⚠️ **[Installation settings]는 연결됨에만 선다.** 나머지 셋은 설치를 못 믿는 상태이고, 그때
 * 밖으로 나가는 문을 두면 사용자가 "고치러 갔는데 고칠 게 없는" 자리에 착지한다.
 *
 * ⚠️ **조회 실패는 보조 줄만 비우고 나머지 행은 그대로 세운다** — 연결 상태를 장애로 위장하지
 * 않는다 (spec 완료 조건 5).
 */

const SETTINGS_URL = "https://github.com/apps/malmoi/installations/new";

async function section(
  account: AccountView = { status: "ok", login: "octocat" },
  installedRepoCount: number | null = 4,
  settingsUrl: string | null = SETTINGS_URL,
) {
  const { container } = await render(
    <GithubSection account={account} installedRepoCount={installedRepoCount} settingsUrl={settingsUrl} />,
  );
  return container;
}

/**
 * 설치 설정으로 나가는 링크를 **라벨로** 센다 — [Disconnect]는 Dialog를 여는 `<button>`이라 안 걸린다.
 *
 * ⚠️ **`a[href^="https://github.com/apps/"]`로 좁히지 않는다.** `href`가 `null`이면 React가 속성을
 * 아예 안 그려서 그 선택자가 0을 내고, "링크가 없다"를 세는 단언이 **링크가 서 있는데도 통과한다** —
 * 실제로 뮤테이션(`settingsUrl !== null &&` 제거)이 green이었다. 불변식이 "그 링크가 없다"면
 * 세는 것도 구현 수단(`href`)이 아니라 그 링크여야 한다 (POSTMORTEM 2026-09-14 #1).
 */
function installationLinks(container: ParentNode): HTMLAnchorElement[] {
  return [...container.querySelectorAll("a")].filter((a) =>
    (a.textContent ?? "").includes(m.account.github.installationSettings),
  );
}

it("연결됐으면 설치 설정으로 나가는 링크와 해제 버튼이 함께 선다", async () => {
  const container = await section();
  const links = installationLinks(container);
  expect(links).toHaveLength(1);
  expect(links[0]!.href).toBe(SETTINGS_URL);
  expect(links[0]!.textContent).toContain(m.account.github.installationSettings);
  // 나가는 링크는 새 탭이다 (DESIGN §6.3) — 설정을 고치러 간 사이에 이 화면을 잃지 않는다.
  expect(links[0]!.target).toBe("_blank");
  expect(links[0]!.rel).toBe("noreferrer");
  // ⚠️ **나가는 것이 왼쪽, 파괴적인 것이 오른쪽 끝이다** — 세션 카드와 같은 순서다.
  const controls = [...container.querySelectorAll("a, button")];
  const linkAt = controls.indexOf(links[0]!);
  const disconnectAt = controls.findIndex((el) => el.textContent === m.settings.account.disconnect);
  expect(disconnectAt).toBeGreaterThan(-1);
  expect(linkAt).toBeLessThan(disconnectAt);
});

it.each<[string, AccountView]>([
  ["미연동", { status: "ok", login: null }],
  ["인가 만료", { status: "reauthorize" }],
  ["조회 실패", { status: "unavailable" }],
])("%s 상태에는 설치 설정 링크가 서지 않는다", async (_label, account) => {
  expect(installationLinks(await section(account))).toHaveLength(0);
});

it("GITHUB_APP_SLUG가 없으면 링크만 사라지고 해제 버튼은 그대로다", async () => {
  const container = await section({ status: "ok", login: "octocat" }, 4, null);
  expect(installationLinks(container)).toHaveLength(0);
  // 링크 하나가 없다고 연결 상태를 장애로 위장하지 않는다.
  expect(container.textContent).toContain("@octocat");
  expect([...container.querySelectorAll("button")].map((b) => b.textContent)).toContain(m.settings.account.disconnect);
});

it("설치 리포 수를 읽었으면 보조 줄이 그 수를 든다", async () => {
  expect((await section()).textContent).toContain(m.account.github.installedOn(4));
});

it("리포가 하나면 단수로 읽힌다", async () => {
  const text = (await section({ status: "ok", login: "octocat" }, 1)).textContent ?? "";
  expect(text).toContain(m.account.github.installedOn(1));
  // 단복수를 안 가르면 `1 repositories`가 그대로 화면에 선다.
  expect(text).not.toContain("1 repositories");
});

it.each<[string, number | null]>([
  ["못 읽었으면", null],
  ["0개면", 0],
])("%s 보조 줄이 Connected만 든다 — 빈 집계는 문장을 만들지 않는다", async (_label, count) => {
  const container = await section({ status: "ok", login: "octocat" }, count);
  const text = container.textContent ?? "";
  expect(text).toContain(m.account.github.connected);
  expect(text).not.toContain("Installed on");
});
