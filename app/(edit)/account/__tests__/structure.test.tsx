// @vitest-environment jsdom
import { act } from "react";
import { beforeEach, expect, it, vi } from "vitest";

import { render } from "@/components/__tests__/helpers/dom";
import { m } from "@/lib/i18n";
import { encodeUserFields } from "@/lib/credentials/records";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), getPrisma: vi.fn(), loadAccountView: vi.fn(), loadInstalledRepoCount: vi.fn() }));
vi.mock("@/auth", () => ({ signOut: vi.fn(), signIn: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/db", () => ({ getPrisma: mocks.getPrisma }));
vi.mock("@/lib/github-connect/account-view", () => ({ loadAccountView: mocks.loadAccountView }));
/** 설치 리포 수는 실제 토큰 경로를 지난다 — 값만 주고, **언제 불리는가**를 아래 검사가 센다. */
vi.mock("@/lib/github-connect/installed-repos", () => ({ loadInstalledRepoCount: mocks.loadInstalledRepoCount }));
const accountActions = vi.hoisted(() => ({
  updateProfileName: vi.fn(), uploadProfileImage: vi.fn(), deleteProfileImage: vi.fn(),
  startSessionRevocation: vi.fn(), unlinkLoginMethod: vi.fn(), startLoginMethodConnect: vi.fn(),
}));
vi.mock("@/app/(edit)/account/actions", () => accountActions);
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const actions = vi.hoisted(() => ({ disconnectGithub: vi.fn(), startGithubConnectForUser: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => actions);
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({ startGithubConnect: vi.fn() }));

import AccountPage from "../page";

/**
 * 화면 구조의 방어선 (account-settings 태스크 10).
 *
 * ⚠️ **값이 아니라 구조를 센다.** 클래스 문자열을 박으면 스타일을 바꾸는 순간 green인 채 결함만
 * 돌아온다 — 세는 것은 "머리 하나 + 리스트 셋" · "되돌릴 수 없는 넷이 확인을 지난다" ·
 * "쿼리 셋이 각자 자리에 닿는다" · "사유 없는 `disabled`가 0이다" 넷이다.
 *
 * ⚠️ **화면을 실제로 렌더한다.** 요소 트리를 순회하는 소스 스캔은 이 부류를 못 본다 —
 * 조건부 갈래 하나가 통째로 빠져도 파일에는 그 코드가 남아 있다 (POSTMORTEM 2026-09-11).
 */
async function screen(
  params: Record<string, string> = {},
  methods = [{ provider: "github" }, { provider: "google" }],
  view: unknown = { status: "ok", login: "octocat" },
  /**
   * ⚠️ **기본이 `null`이라 사진이 있는 갈래가 한 번도 안 그려졌다.** 그 상태에서는 [Delete]가
   * `hasPicture`만으로 비활성이라, "업로드 중에는 못 누른다"를 세는 검사가 **결함과 무관하게**
   * 통과한다(2026-09-14에 실제로 그렇게 한 번 green이었다).
   */
  image: string | null = null,
) {
  mocks.requireUser.mockResolvedValue({ userId: "owner" });
  mocks.loadAccountView.mockResolvedValue(view);
  mocks.loadInstalledRepoCount.mockResolvedValue(4);
  mocks.getPrisma.mockReturnValue({
    user: { findUnique: async () => ({ id: "owner", ...encodeUserFields("owner", { email: "a@x.com", name: "Jane", image }) }) },
    account: { findMany: async () => methods },
  });
  const { container } = await render(await AccountPage({ searchParams: Promise.resolve(params) }));
  return container;
}

/**
 * ⚠️ **카드를 인덱스가 아니라 제목으로 찾는다.** Profile이 카드가 되면서 `section` 인덱스가 하나씩
 * 밀렸고, 인덱스로 집던 검사 넷이 **엉뚱한 카드를 재면서** 실패했다 — 카드가 하나 늘거나 순서가
 * 바뀔 때마다 같은 일이 생긴다. 못 찾으면 던져서 "0개를 돌았는데 green"을 막는다.
 */
function card(container: ParentNode, title: string): HTMLElement {
  const found = [...container.querySelectorAll("section")].find((s) => s.querySelector("h2")?.textContent === title);
  if (found === undefined) throw new Error(`Missing card: ${title}`);
  return found;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PII_ENCRYPTION_KEYS", JSON.stringify({ k1: Buffer.alloc(32, 1).toString("base64") }));
  vi.stubEnv("PII_ENCRYPTION_ACTIVE_KEY_ID", "k1");
});

/**
 * ⚠️ **집계 조회가 연결 상태 뒤에 선다** (2026-09-16 리뷰 🔴1). 전엔 `Promise.all`이 둘을 **같은
 * 순간에** 출발시켰고, 토큰이 만료됐으면 **둘 다 같은 refresh 토큰으로 갱신을 시도**했다 —
 * 1회용이라 한쪽이 400을 받고, 거부가 성공보다 빨리 오면 진 쪽의 `afterRace`가 이긴 쪽의 쓰기보다
 * 먼저 행을 읽어 옛 토큰을 보고 **`reauthorize`**를 낸다. `loadAccountView`가 지면 멀쩡한 연결에
 * "Your GitHub authorization expired."가 뜬다.
 *
 * `token-store.ts`의 조건부 쓰기는 **탭 둘이 따로 보내는** 순차 경합용이고 거기서도 같은 창이 있다.
 * 같은 요청의 `Promise.all`은 두 호출이 같은 마이크로태스크에서 출발하므로 **항상 같은 행을 읽어**
 * 그 창을 최대로 연다.
 *
 * 세는 것은 **호출 횟수**다 — 연결됨에서 1회, 나머지 셋에서 0회. 병렬로 되돌리면 넷 다 1회가 되어
 * 아래 셋이 red다.
 */
it.each([
  ["미연동", { status: "ok", login: null }],
  ["인가 만료", { status: "reauthorize" }],
  ["조회 실패", { status: "unavailable" }],
])("%s 상태에서는 설치 집계를 조회하지 않는다 — 토큰 갱신을 둘이 겹쳐 시도하지 않는다", async (_label, view) => {
  await screen({}, undefined, view);
  expect(mocks.loadInstalledRepoCount).not.toHaveBeenCalled();
});

it("연결됐을 때만 설치 집계를 한 번 조회한다", async () => {
  await screen({}, undefined, { status: "ok", login: "octocat" });
  expect(mocks.loadInstalledRepoCount).toHaveBeenCalledTimes(1);
});

/**
 * ⚠️ **행 본문이 한 줄이고 상태가 거기 있다** (2026-09-16 `/design-sync` 4단계 실측이 잡았다).
 *
 * 이 구조를 두 줄(이름 본문 + 상태 보조)에서 한 줄로 바꿨는데 **`pnpm test` 4,206개가 전부
 * green이었다** — 어느 검사도 "상태가 어느 줄에 있나"를 묻지 않았다. 값이 맞고 표현만 틀린 부류를
 * 단위 테스트가 원리적으로 못 보는 그 자리다.
 *
 * 세는 것은 **같은 노드 안에 이름과 상태가 함께 있는가**이고, 상태를 보조 줄로 되돌리면 red다.
 * 보조 줄은 "다음에 할 일"이라 상태 문자열을 들면 안 된다.
 */
it("행 본문이 한 줄로 이름과 상태를 함께 들고, 보조 줄이 그것을 대신하지 않는다", async () => {
  const container = await screen();
  const app = card(container, m.account.github.title).querySelector("li")!;
  const [body, detail] = [...app.querySelectorAll(":scope > div > span")];
  expect(body).not.toBeUndefined();
  expect(body!.textContent).toContain("@octocat");
  expect(body!.textContent).toContain(m.account.github.connected);
  // 이름만 굵다 — 상태가 같은 무게로 서면 행이 무엇을 묻는지가 흐려진다.
  const strong = body!.querySelector("span");
  expect(strong).not.toBeNull();
  expect(strong!.textContent).toBe("@octocat");
  // 보조 줄은 **다음에 할 일**이다. 상태를 여기로 내리면 부연으로 읽힌다.
  expect(detail).not.toBeUndefined();
  expect(detail!.textContent).not.toContain(m.account.github.connected);

  const methods = card(container, m.link.methods.title).querySelector("li")!;
  const methodBody = methods.querySelector(":scope > div > span")!;
  expect(methodBody.textContent).toContain(m.link.providers.github);
  expect(methodBody.textContent).toContain(m.link.methods.connected);
  /**
   * ⚠️ **수단 행에는 보조 줄이 없다** — 캔버스의 `Signed in with this method last on {date}.`는
   * 데이터가 리포에 없고(`Account`에 마지막 사용 컬럼이 없다), 한쪽만 그리면 두 행 높이가 갈린다.
   * **되살리려면 스키마가 늘고 그 순간 이 기능의 "스키마 변경 없음"이 깨진다** — 그 사실을 여기서
   * 고정한다(문서화된 이탈, DESIGN §6.67).
   */
  expect(methods.querySelectorAll(":scope > div > span")).toHaveLength(1);
});

/**
 * ⚠️ **상태 넷이 저마다 다른 말을 한다.** 넷을 같은 문구로 접으면 화면이 "연결 안 됨"과 "못 읽었다"를
 * 구별하지 못하고, 사용자가 **멀쩡한 설치를 다시 만든다** (POSTMORTEM 2026-09-03의 축).
 */
it.each([
  ["연결됨", { status: "ok", login: "octocat" }, m.account.github.connected],
  ["미연동", { status: "ok", login: null }, m.account.github.notConnected],
  ["인가 만료", { status: "reauthorize" }, m.account.github.statusReauthorize],
  ["조회 실패", { status: "unavailable" }, m.account.github.statusUnavailable],
])("GitHub App %s 갈래의 상태가 본문에 선다", async (_label, view, status) => {
  const container = await screen({}, undefined, view);
  const body = card(container, m.account.github.title).querySelector("li > div > span")!;
  expect(body.textContent).toContain(status);
});

/**
 * ⚠️ **Sessions 행도 본문 한 줄이고, 두 행의 보조 줄이 같이 있거나 같이 없다.**
 *
 * 앞 판본은 아래 행의 보조 줄에 `confirmDetail(provider)`를 써서 **확인 상대를 못 고르는 갈래에서
 * 그 줄만 사라졌다** — 수단 카드에서 "한쪽만 그리면 두 행 높이가 갈린다"로 보조 줄 둘을 다 지워
 * 놓고 같은 카드에서 반대로 적용한 것이었다 (2026-09-16 리뷰 🟡5).
 */
it.each([
  ["수단 둘", [{ provider: "github" }, { provider: "google" }]],
  /**
   * ⚠️ **확인 상대를 못 고르는 갈래** — `pickLoginAccount`가 `null`을 준다. 도달성은 낮지만
   * (DB 세션 사용자는 보통 `Account` 행을 하나는 갖는다) **그 갈래를 렌더하는 테스트가 0개였고**,
   * 그래서 높이 갈림이 어느 그물에도 안 걸렸다.
   */
  ["수단 0", []],
])("%s 에서도 Sessions 두 행이 같은 모양이다", async (_label, methods) => {
  const container = await screen({}, methods);
  const rows = [...card(container, m.account.sessionsSection.title).querySelectorAll("li")];
  expect(rows).toHaveLength(2);
  const shapes = rows.map((row) => {
    const spans = [...row.querySelectorAll(":scope > div > span")];
    return { body: spans[0]?.textContent ?? "", hasHint: spans.length === 2 };
  });
  expect(shapes[0]!.body).toContain(m.account.signOut.scope);
  expect(shapes[1]!.body).toContain(m.account.sessions.scope);
  // 둘이 같이 있거나 같이 없다 — 한쪽만 있으면 행 높이가 갈린다.
  expect(shapes[0]!.hasHint).toBe(shapes[1]!.hasHint);
  // ⚠️ provider 이름이 행에 없다 — 그것이 들어가면 위 갈래에서 이 줄만 사라진다.
  expect(shapes[1]!.body).not.toContain(m.link.providers.github);
});

/**
 * ⚠️ **구분자를 프리미티브가 든다.** 호출부가 문자열에 `—`를 도로 박아도 `textContent`는 같으므로
 * 어느 검사도 안 문다 — 그러면 한 화면에 `—`와 `-`가 섞이는 것을 막던 설계가 조용히 사라진다.
 * 세는 것은 **`status`가 없으면 대시도 없다**는 비대칭이다.
 */
it("행 구분자는 상태가 있을 때만 선다", async () => {
  const container = await screen();
  const bodies = [...container.querySelectorAll("section[aria-labelledby] li > div > span:first-child")];
  expect(bodies.length).toBeGreaterThan(0);
  for (const body of bodies) expect(body.textContent, body.textContent ?? "").toContain(" — ");

  // Profile 카드는 행이 없다 — 사실 블록이라 대시가 설 자리가 없다.
  expect(card(container, m.account.profile.title).querySelectorAll("li")).toHaveLength(0);
});

/**
 * ⚠️ **본문이 카드 넷이고 넷이 같은 그릇이다** (spec 완료 조건 1). 전엔 머리 하나 + 리스트 셋이라
 * **Profile만 그릇이 없었고**, 구역 제목이 카드 밖에 있어 제목↔리스트 12가 구역 사이 28과 경쟁했다.
 *
 * ⚠️ **`<section>` 수를 센다 — 존재 검사가 아니라 개수다.** 하나가 `aria-labelledby`를 잃으면
 * Chrome이 그것을 `generic`으로 접어 접근성 트리에서 사라지는데, "region이 있다"만 세면 그 결함이
 * 검사를 그대로 지나간다 (POSTMORTEM 2026-09-14 #1 · 2026-09-15 #2).
 */
it("본문이 카드 넷이고 heading 순서가 고정이다", async () => {
  const container = await screen();
  expect(container.querySelector("h1")?.textContent).toBe(m.common.nav.settings);

  // 순서는 나 → 들어오는 길 → 붙어 있는 것 → 나가는 길이다.
  expect([...container.querySelectorAll("h2")].map((h) => h.textContent)).toEqual([
    m.account.profile.title,
    m.link.methods.title,
    m.account.github.title,
    m.account.sessionsSection.title,
  ]);

  const cards = [...container.querySelectorAll("section")];
  expect(cards).toHaveLength(4);
  for (const card of cards) {
    const labelledBy = card.getAttribute("aria-labelledby");
    // ⚠️ **참조가 끊긴 것을 먼저 센다** — `?.`로 흘리면 부재가 `undefined`로 접혀 통과한다.
    expect(labelledBy).not.toBeNull();
    const label = container.ownerDocument.getElementById(labelledBy!);
    expect(label).not.toBeNull();
    expect(label!.textContent!.trim()).not.toBe("");
  }
});

/**
 * ⚠️ **행 목록은 셋이다 — Profile은 사실 블록이라 `<ul>`이 아니다.** 아바타·이름·이메일은 항목이
 * 아니라 한 덩이의 사실이고, `<li>`로 만들면 스크린리더가 "목록, 항목 3개"로 읽어 편집 가능한
 * 폼을 목록으로 잘못 예고한다.
 */
it("카드 넷 중 셋만 행 목록을 들고, 항목이 자기 래퍼를 갖지 않는다", async () => {
  const container = await screen();
  const lists = [...container.querySelectorAll("ul")];
  expect(lists).toHaveLength(3);
  expect(lists.map((list) => list.querySelectorAll(":scope > li").length)).toEqual([2, 1, 2]);
  // `<li>` 안에 또 다른 목록 래퍼가 생기면 그 순간 갤러리다.
  for (const list of lists) expect(list.querySelectorAll("ul")).toHaveLength(0);
});

/**
 * 배지는 **수단 카드에만** 선다 — 이 화면에서 사용자가 세는 값은 "몇 가지로 들어올 수 있나"뿐이다.
 * app 카드는 연결이 하나이고 세션 카드는 동작 둘이라 셀 일이 없다.
 */
it("수단 카드 헤더가 연결 수를 들고, 다른 카드에는 배지가 없다", async () => {
  const container = await screen({}, [{ provider: "github" }]);
  expect(card(container, m.link.methods.title).querySelector("h2")!.parentElement!.textContent)
    .toContain(m.link.methods.count(1, 2));

  const both = await screen({}, [{ provider: "github" }, { provider: "google" }]);
  expect(card(both, m.link.methods.title).querySelector("h2")!.parentElement!.textContent)
    .toContain(m.link.methods.count(2, 2));
  /**
   * 배지는 수단 카드에만 있다 — app 카드는 연결이 하나이고 세션 카드는 동작 둘이라 셀 값이 없다.
   * ⚠️ **헤더 텍스트 전체를 비교하지 않는다** — 오른쪽 설명 한 줄이 같은 머리에 살아서, 그 문구를
   * 고치는 것만으로 이 단언이 깨진다(배지와 무관한 red다). 세는 것은 배지 요소 자체다.
   */
  expect(card(both, m.link.methods.title).querySelector("h2")!.parentElement!.querySelectorAll("span")).toHaveLength(1);
  for (const title of [m.account.profile.title, m.account.github.title, m.account.sessionsSection.title]) {
    expect(card(both, title).querySelector("h2")!.parentElement!.querySelectorAll("span"), title).toHaveLength(0);
  }
});

/**
 * ⚠️ **확인 없이 제출하는 버튼이 0이다.** Radix `DialogTrigger`가 `aria-haspopup="dialog"`를 싣는
 * 것이 "이 컨트롤 뒤에 확인이 있다"의 렌더된 증거다 — 닫힌 Dialog는 트리에 없으므로 그 속성이
 * 유일하게 셀 수 있는 자리다.
 */
it("되돌릴 수 없는 것마다 확인이 붙고, 직접 제출하는 것이 없다", async () => {
  const container = await screen();
  const labels = [...container.querySelectorAll('[aria-haspopup="dialog"]')]
    .map((trigger) => trigger.getAttribute("aria-label") ?? trigger.textContent ?? "")
    .sort();
  /**
   * ⚠️ **갈래는 넷인데 컨트롤은 다섯이다** — 수단 해제가 연결된 수단마다 하나씩이다. 개수를 박으면
   * 수단이 하나만 연결된 화면에서 이 단언이 거짓이 되므로, **어느 것이 확인을 지나는가**를 센다.
   */
  expect(labels).toEqual([
    m.link.methods.disconnectLabel(m.link.providers.github),
    m.link.methods.disconnectLabel(m.link.providers.google),
    m.account.sessions.title,
    m.common.nav.signOut,
    m.settings.account.disconnectLabel,
  ].sort());
  // 접근 이름 충돌은 아래 전용 검사가 든다 — 여기서 세면 비활성 컨트롤이 빠진다.

  /**
   * ⚠️ **남은 폼이 되돌릴 수 있는 것뿐이다.** 확인을 지나는 것은 Dialog 안에서 제출하므로 닫힌
   * 화면의 트리에 없다 — 여기 보이는 `<form>`이 하나라도 늘면 확인 없이 제출하는 자리가 생긴 것이다.
   */
  const forms = [...container.querySelectorAll("form")];
  expect(forms).toHaveLength(1);
  expect(forms[0]!.querySelector("button")?.textContent).toBe(m.account.profile.save);
});

it("마지막 수단은 확인이 아니라 비활성이다 — 지날 문이 없다", async () => {
  const container = await screen({}, [{ provider: "github" }]);
  const labels = [...container.querySelectorAll('[aria-haspopup="dialog"]')]
    .map((trigger) => trigger.getAttribute("aria-label") ?? trigger.textContent ?? "");
  // 마지막 수단은 비활성이라 Dialog를 지날 문이 없다 — 그래도 이름은 축을 든다(아래 검사).
  expect(labels).not.toContain(m.link.methods.disconnectLabel(m.link.providers.github));
  expect(labels).toHaveLength(3);
});

/**
 * ⚠️ **머리에 남는 것은 `?e=` 하나다.** 가르는 축은 "다시 시도할 컨트롤이 이 화면에 있는가"이고
 * (2026-09-14 리뷰 🟢8), `?link=`는 **그 카드 안에** 다시 누를 행이 있으므로 카드로 내려간다.
 * 그래야 둘이 함께 와도 머리 높이가 하나로 고정된다 — 전엔 둘이 쌓여 본문이 밀렸다.
 */
it("`?e=`가 머리 Alert에 닿는다", async () => {
  const container = await screen({ e: "unavailable" });
  const alert = container.querySelector('[role="alert"]');
  expect(alert).not.toBeNull();
  // 머리다 — 어느 카드에도 속하지 않는다.
  expect(alert!.closest("section")).toBeNull();
});

/**
 * ⚠️ **`?link=`는 수단 카드 안 첫 줄이고 닫기가 없다** (design §3.4). 바로 아래 행이 그 재시도라,
 * 닫으면 **다시 누를 컨트롤 옆에서 사유만 사라진다.**
 *
 * ⚠️ **닫기가 없어지면 POSTMORTEM 2026-09-14("닫은 알림이 두 번째 실패에서 무음이었다")의 상태가
 * 원리적으로 생기지 않는다** — 숨길 수 있는 지역 상태가 없다. 그 항목이 만든 `replace` 방어선을
 * 이 단언이 대신 든다.
 */
it("수단 해제 실패는 수단 카드 안에 서고 닫기가 없다", async () => {
  const container = await screen({ link: "unavailable" });
  const alert = container.querySelector('[role="alert"]');
  expect(alert).not.toBeNull();
  const card = alert!.closest("section");
  expect(card).not.toBeNull();
  expect(card!.querySelector("h2")!.textContent).toBe(m.link.methods.title);
  // 헤더 아래·리스트 위다 — 리스트 안으로 들어가면 항목 하나처럼 읽힌다.
  expect(card!.querySelector("ul")!.compareDocumentPosition(alert!) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  expect(alert!.querySelector("button")).toBeNull();
});

/**
 * ⚠️ **둘이 함께 와도 머리에는 하나뿐이다.** 전엔 `?e=`·`?link=`가 **동시에 설 수 있었고** 그때
 * 본문이 밀렸다 — 머리 높이가 무엇이 실패했는지에 따라 달라지면 그 자체가 상태가 된다.
 */
it("`?e=`와 `?link=`가 함께 와도 머리 Alert는 하나다", async () => {
  const container = await screen({ e: "unavailable", link: "unavailable" });
  const alerts = [...container.querySelectorAll('[role="alert"]')];
  expect(alerts.filter((alert) => alert.closest("section") === null)).toHaveLength(1);
  // 그리고 나머지 하나는 사라지지 않고 카드 안에 있다 — 옮긴 것이지 버린 것이 아니다.
  expect(alerts.filter((alert) => alert.closest("section") !== null)).toHaveLength(1);
});

it("`?sessionRevocation=`는 Sessions 구역 안에 닿는다", async () => {
  const container = await screen({ sessionRevocation: "expired" });
  const alert = container.querySelector('[role="alert"]');
  expect(alert?.textContent).toContain(m.account.sessions.expired);
  const section = alert!.closest("section");
  expect(section).not.toBeNull();
  expect(section!.querySelector("h2")?.textContent).toBe(m.account.sessionsSection.title);
  // 구역 Alert는 헤더 아래·리스트 위다 — 리스트 안으로 들어가면 항목 하나처럼 읽힌다.
  expect(section!.querySelector("ul")!.compareDocumentPosition(alert!) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
});

/**
 * ⚠️ **행 안의 모든 버튼을 센다 — Dialog를 지나는 것만이 아니다.**
 *
 * 보이는 라벨이 `Disconnect`인 컨트롤이 셋이고 그중 **마지막 수단의 것은 비활성이라
 * `DialogTrigger`가 아니다** — `aria-haspopup`으로 세면 그 하나가 목록에서 통째로 빠지고,
 * 그 줄의 `aria-label`을 지워도 검사가 green이다(2026-09-13 2차 리뷰가 그 구멍을 잡았다).
 * 비활성은 탭 순서에서만 빠지고 **접근성 트리에는 남는다.**
 *
 * ⚠️ **대상만 붙이면 부족하다** — `"Disconnect GitHub"`이 수단 해제와 연결 해제 양쪽에서 나온다.
 * 이름이 들어야 하는 것은 **축**이다: 같은 "GitHub"이 한 구역에선 로그인 수단이고 다음 구역에선
 * 리포 쓰기 권한이다.
 */
it.each([
  ["둘 다 연결됨", [{ provider: "github" }, { provider: "google" }], { status: "ok", login: "octocat" }],
  ["마지막 수단", [{ provider: "github" }], { status: "ok", login: "octocat" }],
  /**
   * ⚠️ **Google로만 로그인하고 App을 한 번도 연결하지 않은 계정** — PRODUCT가 말하는 **비개발자
   * 동료의 기본 상태**이고, 앞의 둘로는 **구조적으로 안 나온다**(GitHub이 로그인 수단이면 그 행에
   * [Connect]가 안 선다). 이 갈래에서만 `Connect GitHub`이 두 축에 나란히 서고, 개발자 계정으로
   * 브라우저를 열면 영영 안 밟는다.
   */
  ["Google 전용 + App 미연결", [{ provider: "google" }], { status: "ok", login: null }],
])("%s 상태에서 버튼의 접근 이름이 전부 다르다", async (_name, methods, view) => {
  const container = await screen({}, methods, view);
  /**
   * ⚠️ **보이는 라벨과 접근 이름을 갈라서 든다.** 접힌 이름으로 거르면 라벨을 바꾸는 변경이
   * **필터에서 빠져나간다** — `aria-label`을 `"Revoke repository access"`로 고치면 보이는 텍스트는
   * 여전히 `Disconnect`라 진짜 2.5.3 위반인데 이 검사는 조용하다.
   */
  const controls = [...container.querySelectorAll("section li button")].map((button) => ({
    visible: (button.textContent ?? "").trim(),
    name: button.getAttribute("aria-label") ?? (button.textContent ?? "").trim(),
  }));
  expect(controls.length).toBeGreaterThan(1);
  expect(new Set(controls.map((c) => c.name)).size).toBe(controls.length);

  /**
   * ⚠️ **충돌은 위 전역 유일성이 잡는다** — 보이는 글자가 **달라도** 접근 이름이 같아질 수 있다:
   * 수단 추가의 `Connect`(이름 `Connect GitHub as a sign-in method`)와 리포 권한의
   * `Connect GitHub`이 그 쌍이었고, 보이는 글자로 거르면 **둘이 같은 그룹에 안 들어와** 이 루프가
   * 통째로 못 본다. 아래가 보는 것은 충돌이 아니라 **"저마다 무엇의 해제인지 말하는가"**다.
   * ⚠️ **루프가 0회면 두 단언이 증발한다** — 라벨이 바뀌면 그 순간 검사가 사라진다.
   */
  const disconnects = controls.filter((c) => c.visible === m.link.methods.disconnect);
  expect(disconnects.length).toBeGreaterThan(0);
  for (const control of disconnects) {
    // 접근 이름이 보이는 텍스트를 **포함**해야 음성 입력이 라벨로 컨트롤을 찾는다 (WCAG 2.5.3).
    expect(control.name.startsWith(control.visible)).toBe(true);
    /**
     * ⚠️ **`"Disconnect"` 단독으로 끝나는 이름이 0이다.** 충돌만 세면 부족하다 — 다른 [Disconnect]가
     * 마침 축을 들고 있으면 **이쪽이 맨몸이어도 두 문자열은 다르다.** 실제로 비활성 [Disconnect]의
     * `aria-label`을 지우는 뮤테이션이 그 이유로 green이었다(2026-09-13). 세야 하는 것은 "둘이
     * 다른가"가 아니라 **"저마다 무엇의 해제인지 말하는가"**다.
     */
    expect(control.name).not.toBe(control.visible);
  }
});

/**
 * ⚠️ **GitHub 구역의 세 갈래를 실제로 렌더한다** (2026-09-13 리뷰 🔴1). 이 파일의 `loadAccountView`
 * mock이 `{status:"ok", login}` 하나로 고정이라 미연결·`reauthorize`·`unavailable`이 **한 번도
 * 안 그려졌다** — 브라우저도 연결된 계정뿐이라 그 셋은 어느 그물에도 안 걸렸다.
 *
 * 세는 것은 **실패 문구가 우측 컨트롤 자리에 없다**는 것이다. 그 클러스터는 `shrink-0`이라
 * 압축되지 않고, Alert를 형제로 두면 좌측 본문이 truncate로 사라진 뒤 **행이 패널 밖으로 밀린다**
 * (spec 완료 조건 1의 "우측 컨트롤이 줄바꿈되지 않는다"가 그 순간 깨진다).
 */
it.each([
  ["ok-not-connected", { status: "ok", login: null }, m.settings.account.connect],
  ["reauthorize", { status: "reauthorize" }, m.settings.account.reconnect],
  ["unavailable", { status: "unavailable" }, null],
])("GitHub %s 갈래의 컨트롤이 우측 클러스터 하나뿐이다", async (_name, view, label) => {
  const container = await screen({}, [{ provider: "github" }, { provider: "google" }], view);
  const row = card(container, m.account.github.title).querySelector("li")!;
  const right = row.querySelector(":scope > div:last-child");
  if (label === null) {
    // 조회 실패에는 컨트롤을 주지 않는다 — 그 자리의 재시도는 페이지 새로고침이다.
    expect(row.querySelector("button")).toBeNull();
  } else {
    expect(right?.textContent).toContain(label);
    // 실패 문구가 여기 살면 행이 무너진다 — 구역 Alert 자리로 올라가야 한다.
    expect(right?.querySelector("[role='alert']")).toBeNull();
    expect(right?.querySelectorAll(":scope > *")).toHaveLength(1);
  }
  // 사유는 보조 줄이 든다 — 컨트롤이 없어도 무엇이 일어났는지가 화면에 있다.
  expect(row.textContent).not.toBe("");
});

/**
 * ⚠️ **거부를 실제로 일으켜서 잰다.** Action을 mock한 채 쉬는 상태만 세면 "우측에 Alert가 없다"가
 * **영원히 참**이고 방어선이 아니라 장식이 된다 — 실제로 그 상태로 한 번 통과했다.
 */
it.each([
  ["connect", { status: "ok", login: null }],
  ["reauthorize", { status: "reauthorize" }],
  ["disconnect", { status: "ok", login: "octocat" }],
])("GitHub %s 실패는 행이 아니라 구역 Alert에 선다", async (kind, view) => {
  actions.startGithubConnectForUser.mockResolvedValue({ ok: false, error: "unavailable" });
  actions.disconnectGithub.mockResolvedValue({ ok: false, error: "unavailable" });
  const container = await screen({}, [{ provider: "github" }, { provider: "google" }], view);
  const section = card(container, m.account.github.title);
  const row = section.querySelector("li")!;
  const trigger = row.querySelector("button")!;
  await act(async () => { trigger.click(); });
  /**
   * ⚠️ **해제는 확인을 지나므로 제출 버튼이 Dialog 안이다** — Radix가 그것을 `document.body`로
   * portal하므로 `container` 안에서는 안 잡힌다. 여기를 빼먹으면 Action이 아예 안 돌고, 그래도
   * "Alert가 행 안에 없다"가 참이라 **검사가 조용히 통과한다.**
   */
  if (trigger.getAttribute("aria-haspopup") === "dialog") {
    const confirm = [...document.querySelectorAll("[role='dialog'] footer button")].at(-1) as HTMLButtonElement;
    await act(async () => { confirm.click(); });
  }
  await act(async () => { await Promise.resolve(); });

  const alert = section.querySelector("[role='alert']");
  expect(alert, kind).not.toBeNull();
  // 행 **밖**이다 — 안에 있으면 `shrink-0` 클러스터가 넓어져 행이 패널 밖으로 밀린다.
  expect(row.contains(alert), kind).toBe(false);
  // 그리고 리스트 **위**다 — 구역 Alert의 자리는 헤더 아래·래퍼 앞이다.
  expect(section.querySelector("ul")!.compareDocumentPosition(alert!) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
});

/**
 * ⚠️ **사유 없는 `disabled`를 만들지 않는다** (POSTMORTEM 2026-09-06). 마지막 수단의 [Disconnect]와
 * 사진이 없을 때의 [Delete] 둘이 이 부류다.
 */
it("사유 없는 disabled가 0이다", async () => {
  const container = await screen({}, [{ provider: "github" }]);
  /**
   * ⚠️ **도는 버튼을 빼야 한다.** `Button`이 `disabled={disabled === true || loading}`이라
   * pending 중인 컨트롤이 전부 이 선택자에 들어온다 — 그것들은 **사유가 없는 것이 아니라 도는
   * 중**이고, 걸리면 "[Delete]에 사유가 없다"라는 오해하기 쉬운 red가 난다.
   */
  const disabled = [...container.querySelectorAll("button[disabled], input[disabled]")]
    .filter((el) => !el.hasAttribute("aria-hidden") && el.querySelector(".animate-spin") === null);
  expect(disabled.length).toBeGreaterThan(0);
  for (const control of disabled) {
    const nearby = [...(control.parentElement?.children ?? [])]
      .filter((sibling) => sibling !== control)
      .map((sibling) => sibling.textContent ?? "")
      .join(" ");
    expect(nearby.trim(), control.textContent ?? "").not.toBe("");
    /**
     * ⚠️ **옆에 있는 것으로는 절반만 지킨 것이다.** `aria-describedby`로 묶지 않으면 스크린리더는
     * *"…, 버튼, 사용 불가"*까지만 읽고 **왜인지는 못 읽는다** — 이 리포가 반복해 밟은 "사유 없는
     * `disabled`"가 그 사용자에게만 그대로 남는다 (POSTMORTEM 2026-09-06).
     */
    const describedBy = control.getAttribute("aria-describedby");
    expect(describedBy, control.textContent ?? "").not.toBeNull();
    /**
     * ⚠️ **참조가 끊긴 것을 먼저 센다.** `getElementById(...)?.textContent?.trim()`은 대상이 없으면
     * `undefined`를 내고 **`expect(undefined).not.toBe("")`는 통과한다** — 이 단언이 존재하는 이유가
     * 정확히 그 자리로 빠져나간다. ⚠️ **도달 가능하다**: `profile-picture.tsx`가 속성과 `<span>`을
     * **서로 독립인 조건 둘**로 그리므로, 캡션을 무조건 렌더로 바꾸는 순간 id가 뜬다.
     */
    const reason = container.ownerDocument.getElementById(describedBy!);
    expect(reason, control.textContent ?? "").not.toBeNull();
    expect(reason!.textContent!.trim()).not.toBe("");
  }
});

/**
 * ⚠️ **수단 해제의 확정 경로가 어느 그물에도 없었다** (2026-09-14 리뷰 🟡4). 이 파일의 확정 클릭은
 * **GitHub account 구역**만 대상이었고, `lib/account-connect/__tests__/ui.test.tsx`는 Action을
 * mock한 채 Dialog를 열지 않는다. `components/__tests__/login-methods.test.ts`는 소스 스캔이다 —
 * 셋 중 어느 것도 **"확정 버튼이 Action에 닿는가"** 를 묻지 않았다.
 *
 * POSTMORTEM 2026-09-14가 같은 파일에 세운 규칙(*"거부를 실제로 일으킨다 — 확인 Dialog를 지나면
 * portal의 확정 버튼까지 클릭한다"*)을 이 갈래에도 적용한다.
 */
it("수단 해제의 확정 버튼이 Action에 닿는다", async () => {
  const container = await screen();
  const section = card(container, m.link.methods.title);
  const trigger = [...section.querySelectorAll("li button")]
    .find((button) => button.getAttribute("aria-haspopup") === "dialog") as HTMLButtonElement;
  await act(async () => { trigger.click(); });
  // Radix가 `document.body`로 portal하므로 container 안에서는 안 잡힌다.
  const confirm = [...document.querySelectorAll("[role='dialog'] footer button")].at(-1) as HTMLButtonElement;
  await act(async () => { confirm.click(); });
  await act(async () => { await Promise.resolve(); });
  expect(accountActions.unlinkLoginMethod).toHaveBeenCalledTimes(1);
});

/**
 * ⚠️ **하나가 도는 동안 다른 하나를 누를 수 있으면 스피너가 거짓말을 한다** (2026-09-14 리뷰 🟡2).
 * `running` 한 칸을 둘이 나눠 쓰므로, 업로드 중 [Delete]를 누르면 스피너가 [Delete]로 **옮겨가고**
 * 먼저 끝난 쪽의 `finally`가 **남의 스피너까지 끈다** — 둘 다 쉬는 것처럼 보이는 채로 삭제가 돈다.
 */
it("사진 업로드가 도는 동안 삭제를 누를 수 없다", async () => {
  /**
   * ⚠️ **`Once`다** — `beforeEach`의 `clearAllMocks`는 호출 기록만 지우고 구현은 되돌리지 않아서,
   * 영영 안 풀리는 promise를 `mockReturnValue`로 두면 뒤따르는 테스트가 그것을 물려받아 **실패가
   * 아니라 행으로** 멈춘다 (2026-09-14 2차 리뷰 R6).
   */
  accountActions.uploadProfileImage.mockReturnValueOnce(new Promise(() => {}));
  // 사진이 있어야 [Delete]가 애초에 활성이다 — 없으면 `hasPicture`만으로 비활성이라 검사가 공회전한다.
  const container = await screen({}, undefined, undefined, "https://images.example/a.png");
  const file = container.querySelector<HTMLInputElement>("input[type='file']")!;
  Object.defineProperty(file, "files", { value: [new File([new Uint8Array(8)], "a.png", { type: "image/png" })] });
  await act(async () => { file.dispatchEvent(new Event("change", { bubbles: true })); });

  const remove = [...container.querySelectorAll("button")]
    .find((button) => (button.textContent ?? "").trim() === m.account.picture.delete)!;
  expect(remove.hasAttribute("disabled")).toBe(true);
  /**
   * ⚠️ **막기만 하면 절반이다** — 스피너가 이 버튼에 없으므로, 사유가 없으면 스크린리더에는
   * *"…, 버튼, 사용 불가"*까지만 들린다. 참조가 **끊기지 않았는지**까지 센다.
   */
  const reason = container.ownerDocument.getElementById(remove.getAttribute("aria-describedby")!);
  expect(reason?.textContent).toBe(m.account.picture.busy);
});

/**
 * ⚠️ **반대 방향도 같은 `pending`을 공유한다.** 구현상 대칭이지만 방어선이 한쪽만 들면 다음
 * 리팩터가 한쪽을 되돌려도 green이다 (2026-09-14 2차 리뷰 R5).
 */
it("사진 삭제가 도는 동안 업로드를 누를 수 없다", async () => {
  accountActions.deleteProfileImage.mockReturnValueOnce(new Promise(() => {}));
  const container = await screen({}, undefined, undefined, "https://images.example/a.png");
  const remove = [...container.querySelectorAll("button")]
    .find((button) => (button.textContent ?? "").trim() === m.account.picture.delete)!;
  await act(async () => { remove.click(); });

  const upload = [...container.querySelectorAll("button")]
    .find((button) => (button.textContent ?? "").trim() === m.account.picture.upload)!;
  expect(upload.hasAttribute("disabled")).toBe(true);
  // 숨은 `<input>`도 함께 막힌다 — 버튼만 막으면 키보드로 파일 대화상자가 열린다.
  expect(container.querySelector("input[type='file']")!.hasAttribute("disabled")).toBe(true);
});


/**
 * ⚠️ **집계 줄이 세던 것은 이 연결에 의존하지 않는 프로젝트였다** (2026-09-14 리뷰 🔴1).
 * `loadConnectionUsage`는 내가 OWNER인 프로젝트를 전부 셌는데, 해제가 실제로 막는 것은 새 프로젝트
 * 생성과 리포 (재)연결뿐이다 — 야간 pull·PR은 App **설치 토큰**이 낸다. 숫자가 근거가 될 수 없어
 * 줄을 걷었다.
 */
it("연결된 행이 프로젝트 수를 말하지 않는다", async () => {
  const container = await screen();
  const row = card(container, m.account.github.title).querySelector("li")!;
  expect(row.textContent).not.toMatch(/\d+\s+projects?/);
});
