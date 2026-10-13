// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";

import { render } from "@/components/__tests__/helpers/dom";
import { encodeUserFields } from "@/lib/credentials/records";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), getPrisma: vi.fn(), loadAccountView: vi.fn(), loadInstalledRepoCount: vi.fn() }));
vi.mock("@/auth", () => ({ signOut: vi.fn(), signIn: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/db", () => ({ getPrisma: mocks.getPrisma }));
vi.mock("@/lib/github-connect/account-view", () => ({ loadAccountView: mocks.loadAccountView }));
vi.mock("@/lib/github-connect/installed-repos", () => ({ loadInstalledRepoCount: mocks.loadInstalledRepoCount }));
vi.mock("@/app/(edit)/account/actions", () => ({
  updateProfileName: vi.fn(), uploadProfileImage: vi.fn(), deleteProfileImage: vi.fn(),
  startSessionRevocation: vi.fn(), unlinkLoginMethod: vi.fn(), startLoginMethodConnect: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/(edit)/projects/actions", () => ({ disconnectGithub: vi.fn(), startGithubConnectForUser: vi.fn() }));
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({ startGithubConnect: vi.fn() }));
vi.mock("@/lib/i18n/server", async () => ({ getUiLocale: async () => "en", getMessages: async () => (await import("@/messages/en")).en }));

import AccountLoading from "../loading";
import AccountPage from "../page";

/**
 * responsive-app B3 — Account의 고정 폭(320) 필드와 행 동작이 좁은 카드(`@max-form` 640)에서 넘치지 않는다. 구조·문구·Save 위치는 그대로다.
 * jsdom은 컨테이너 질의를 못 재므로 클래스 계약과 골격·실물 대응을 센다. 질의는 `Card`(`@container`)가 선언한 그릇 기준이다 — 뷰포트 아님.
 */
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PII_ENCRYPTION_KEYS", JSON.stringify({ k1: Buffer.alloc(32, 1).toString("base64") }));
  vi.stubEnv("PII_ENCRYPTION_ACTIVE_KEY_ID", "k1");
  // GitHub App이 구성된 설치(hosted와 같다) — 없으면 GitHub 카드가 서지 않는다(D4a).
  for (const name of ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "GITHUB_APP_CLIENT_ID", "GITHUB_APP_CLIENT_SECRET", "GITHUB_APP_SLUG"]) vi.stubEnv(name, "x");
});

const screen = async () => {
  mocks.requireUser.mockResolvedValue({ userId: "owner" });
  mocks.loadAccountView.mockResolvedValue({ status: "ok", login: "octocat" });
  mocks.loadInstalledRepoCount.mockResolvedValue(4);
  mocks.getPrisma.mockReturnValue({
    user: { findUnique: async () => ({ id: "owner", ...encodeUserFields("owner", { email: "a-very-long-address-for-the-narrow-card@example.com", name: "Jane", image: null }) }) },
    // 수단이 하나뿐이라 [Disconnect]가 꺼진 사유 문구를 든다 — 375에서 가장 넓은 행 동작이다.
    account: { findMany: async () => [{ provider: "github" }] },
    // 연결된 GitLab 카드 — 행이 동작([Replace token]·[Disconnect])을 든다. 미연결은 행 아래 PAT 입력이 서고 행에 동작이 없다.
    gitLabConnection: { findUnique: async () => ({ username: "ox", expiresAt: null, scopes: ["api"], updatedAt: new Date() }) },
    project: { count: async () => 0 },
  });
  return (await render(await AccountPage({ searchParams: Promise.resolve({}) }))).container;
};
const tokens = (element: Element | null | undefined) => [...(element?.classList ?? [])];
const has = (element: Element | null | undefined, classes: string) => expect(tokens(element)).toEqual(expect.arrayContaining(classes.split(" ")));
const FIELD = "w-[320px] max-w-full @max-form:min-w-0 @max-form:flex-1";
const ROW = "@max-form:flex-wrap @max-form:gap-y-2";
// #235 — 둘째 줄 전폭으로 내려간 묶음도 감긴다(es 'Configuración de la instalación' + 'Desconectar'가 카드 311을 넘어 오른쪽이 잘렸다). 오른쪽 정렬은 유지.
const ACTIONS = "flex shrink-0 items-center gap-2 @max-form:basis-full @max-form:justify-end @max-form:flex-wrap";

it("이름·이메일 필드는 320이되 카드 안폭을 넘지 않고 좁으면 남는 폭을 채운다", async () => {
  const container = await screen();
  for (const id of ["account-name", "account-email"]) {
    const input = container.querySelector<HTMLInputElement>(`#${id}`)!;
    expect(tokens(input)).toContain("w-full");
    expect(tokens(input)).not.toContain("w-80");
    has(input.parentElement, FIELD);
  }
});

it("카드 행의 동작은 좁은 카드에서 둘째 줄 오른쪽이다 — 수단 · GitHub · Sessions 모든 행, DOM 순서 그대로", async () => {
  const container = await screen();
  const rows = [...container.querySelectorAll<HTMLElement>("li")].filter(li => li.querySelector("[data-row-copy]") !== null);
  // 수단 셋(hosted 기본) + GitHub 하나 + GitLab 하나 + Sessions 둘.
  expect(rows).toHaveLength(7);
  for (const row of rows) {
    has(row, ROW);
    expect(row.lastElementChild?.matches("div")).toBe(true);
    has(row.lastElementChild, ACTIONS);
    expect(row.firstElementChild?.hasAttribute("data-row-copy")).toBe(false); // 글리프가 먼저
    expect(tokens(row).some(token => /(^|:)order-/.test(token))).toBe(false);
  }
});

it("골격은 실물과 같은 필드 상한·행 감김을 든다 — 적층 조건이 같다", async () => {
  const { container } = await render(<AccountLoading />);
  // 프로필 사실 격자는 실물 `PanelFacts`와 같은 클래스다(옛 골격은 `grid-cols-[96px_1fr]` 고정이라 좁은 카드에서 실물과 줄 수가 갈렸다).
  const facts = container.querySelector(".gap-x-3")!;
  has(facts, "grid grid-cols-1 @min-form:grid-cols-[96px_1fr]");
  const fields = [...container.querySelectorAll("div")].filter(div => div.classList.contains("w-[320px]"));
  expect(fields).toHaveLength(2);
  for (const field of fields) has(field, FIELD);
  for (const card of container.querySelectorAll<HTMLElement>("[aria-hidden] > div.rounded-lg")) {
    expect(card.classList.contains("@container")).toBe(true);
    const header = card.firstElementChild!;
    expect(header.classList.contains("flex-wrap")).toBe(true);
    has(header.lastElementChild, "ml-auto w-48 @max-form:ml-0 @max-form:w-full");
  }
  const rows = [...container.querySelectorAll<HTMLElement>("[data-skeleton-row]")];
  expect(rows).toHaveLength(3);
  for (const row of rows) { has(row, ROW); has(row.lastElementChild, ACTIONS); }
});
