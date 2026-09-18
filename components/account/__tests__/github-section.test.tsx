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
 * GitHub App 구역의 **행 안 갈래** (DESIGN §6.67).
 *
 * ⚠️ **[Installation settings]는 연결됨에만 선다.** 나머지 셋은 설치를 못 믿는 상태이고, 그때
 * 밖으로 나가는 문을 두면 사용자가 "고치러 갔는데 고칠 게 없는" 자리에 착지한다.
 *
 * ⚠️ **조회 실패는 보조 줄만 비우고 나머지 행은 그대로 세운다** — 연결 상태를 장애로 위장하지
 * 않는다 (DESIGN §6.67).
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

/**
 * 행의 두 줄을 **노드로** 집는다 — `container.textContent`로 세면 본문과 보조 줄이 한 덩이가 되어
 * "어느 줄에 있나"를 못 묻는다. 실제로 상태가 보조 줄에서 본문으로 올라간 변경에서 그렇게 쓴 단언이
 * **공회전으로 바뀐 채 green이었다** (2026-09-16 리뷰 🟡4).
 */
function lines(container: ParentNode): { body: string; hint: string | null } {
  /**
   * ⚠️ **본문 `div`를 먼저 집는다.** `li > div > span`으로 세면 **우측 컨트롤 클러스터의 직계
   * `<span>`도 들어온다** — 오늘은 그 자리에 `<a>`와 버튼뿐이라 우연히 맞지만, 이 리포의 확립된
   * 관용구인 *"사유 없는 `disabled`를 만들지 않는다"*의 구현형이 **버튼 옆 형제 `<span id={reasonId}>`**
   * 다(`login-methods.tsx`의 `lastMethod` · `profile-picture.tsx`의 `busy`). [Disconnect]에 그런 사유가
   * 붙는 날 보조 줄이 없는 갈래에서 `spans[1]`이 그 사유가 되어 **엉뚱한 곳을 가리키는 red**가 난다.
   */
  const body = container.querySelector("li > div:first-of-type");
  const spans = body === null ? [] : [...body.querySelectorAll(":scope > span")];
  return { body: spans[0]?.textContent ?? "", hint: spans[1]?.textContent ?? null };
}

it("설치 리포 수는 본문이 아니라 보조 줄이 든다", async () => {
  const { body, hint } = lines(await section());
  expect(hint).toBe(m.account.github.installedOn(4));
  // 본문은 상태만 든다 — 집계를 여기 붙이면 상태가 숫자에 묻힌다.
  expect(body).not.toContain("Installed on");
  expect(body).toContain(m.account.github.connected);
});

it("리포가 하나면 단수로 읽힌다", async () => {
  const { hint } = lines(await section({ status: "ok", login: "octocat" }, 1));
  expect(hint).toBe(m.account.github.installedOn(1));
  // 단복수를 안 가르면 `1 repositories`가 그대로 화면에 선다.
  expect(hint).not.toContain("1 repositories");
});

it.each<[string, number | null]>([
  ["못 읽었으면", null],
  ["0개면", 0],
])("%s 보조 줄을 아예 그리지 않는다 — 빈 집계는 문장을 만들지 않는다", async (_label, count) => {
  const { body, hint } = lines(await section({ status: "ok", login: "octocat" }, count));
  // ⚠️ **보조 줄이 없다**를 센다 — 전엔 `textContent`를 봐서 상태가 본문으로 옮겨가도 통과했다.
  expect(hint).toBeNull();
  expect(body).toContain(m.account.github.connected);
});

/**
 * ⚠️ **상태와 보조 줄의 짝이 갈래마다 맞는가.** 상태 넷은 `structure.test.tsx`가 고정하는데
 * **짝이 되는 hint 셋은 어느 단언도 안 들고 있었다** — `hintReauthorize`↔`hintUnavailable`을 서로
 * 바꿔도 green이다. 브라우저로 못 밟는 갈래가 정확히 그 셋이라(dev 계정이 늘 연결됨) **여기가
 * 유일한 그물이다.**
 */
it.each<[string, AccountView, string, string]>([
  ["미연동", { status: "ok", login: null }, m.account.github.notConnected, m.account.github.hintNotConnected],
  ["인가 만료", { status: "reauthorize" }, m.account.github.statusReauthorize, m.account.github.hintReauthorize],
  ["조회 실패", { status: "unavailable" }, m.account.github.statusUnavailable, m.account.github.hintUnavailable],
])("%s 갈래의 상태와 보조 줄이 짝이다", async (_label, account, status, hint) => {
  const measured = lines(await section(account));
  expect(measured.body).toContain(status);
  expect(measured.hint).toBe(hint);
});

/**
 * ⚠️ **재인가 문구가 발송을 막는다고 말하지 않는다** (2026-09-16 리뷰 🔴1). 앞 판본은
 * `malmoi can't send changes until you reconnect.`였고 **거짓이었다** — 야간 pull·PR은
 * `createGitClient`의 **설치 토큰**이 내므로 사용자 토큰이 만료돼도 그대로 돈다. 그 문장을 믿은
 * 사용자는 없는 장애를 찾거나 **멀쩡한 App 설치를 다시 만든다** (POSTMORTEM 2026-09-03의 결말).
 */
it("재인가 문구가 발송이 멈춘다고 말하지 않는다", async () => {
  const { hint } = lines(await section({ status: "reauthorize" }));
  expect(hint).not.toBeNull();
  expect(hint!).not.toMatch(/can't send|cannot send|stops? syncing|won't sync/i);
  // 실제로 막히는 것을 말한다 — 리포를 붙이는 일과 (재)연결이다.
  expect(hint!).toMatch(/reconnect|authorize/i);
});
