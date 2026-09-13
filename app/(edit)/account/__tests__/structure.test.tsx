// @vitest-environment jsdom
import { act } from "react";
import { beforeEach, expect, it, vi } from "vitest";

import { render } from "@/components/__tests__/helpers/dom";
import { m } from "@/lib/i18n";
import { encodeUserFields } from "@/lib/credentials/records";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), getPrisma: vi.fn(), loadAccountView: vi.fn(), loadConnectionUsage: vi.fn() }));
vi.mock("@/auth", () => ({ signOut: vi.fn(), signIn: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/db", () => ({ getPrisma: mocks.getPrisma }));
vi.mock("@/lib/github-connect/account-view", () => ({ loadAccountView: mocks.loadAccountView }));
vi.mock("@/lib/account/connection-usage", () => ({ loadConnectionUsage: mocks.loadConnectionUsage }));
vi.mock("@/app/(edit)/account/actions", () => ({
  updateProfileName: vi.fn(), uploadProfileImage: vi.fn(), deleteProfileImage: vi.fn(),
  startSessionRevocation: vi.fn(), unlinkLoginMethod: vi.fn(), startLoginMethodConnect: vi.fn(),
}));
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
) {
  mocks.requireUser.mockResolvedValue({ userId: "owner" });
  mocks.loadAccountView.mockResolvedValue(view);
  mocks.loadConnectionUsage.mockResolvedValue(2);
  mocks.getPrisma.mockReturnValue({
    user: { findUnique: async () => ({ id: "owner", ...encodeUserFields("owner", { email: "a@x.com", name: "Jane", image: null }) }) },
    account: { findMany: async () => methods },
  });
  const { container } = await render(await AccountPage({ searchParams: Promise.resolve(params) }));
  return container;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PII_ENCRYPTION_KEYS", JSON.stringify({ k1: Buffer.alloc(32, 1).toString("base64") }));
  vi.stubEnv("PII_ENCRYPTION_ACTIVE_KEY_ID", "k1");
});

/**
 * ⚠️ **래퍼가 목록마다 하나다** — 항목마다 테두리를 주면 셋뿐인 목록이 카드 갤러리처럼 무거워지고,
 * 카드 다섯이 평평하게 쌓여 축이 안 보이던 그 상태로 돌아간다.
 */
it("머리 하나 + 리스트 셋이고 각 리스트가 래퍼 하나 안에 있다", async () => {
  const container = await screen();
  const lists = [...container.querySelectorAll("ul")];
  expect(lists).toHaveLength(3);
  expect(lists.map((list) => list.querySelectorAll(":scope > li").length)).toEqual([2, 1, 2]);
  // 항목이 자기 래퍼를 갖지 않는다 — `<li>` 안에 또 다른 목록 래퍼가 생기면 그 순간 갤러리다.
  for (const list of lists) expect(list.querySelectorAll("ul")).toHaveLength(0);
  // 머리 블록은 리스트 밖이다 — 아바타와 이름 필드가 어느 구역에도 속하지 않는다.
  expect(container.querySelector("h1")?.textContent).toBe(m.common.nav.settings);
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
 * ⚠️ **셋이 같은 자리에 서지 않는다** — 앞의 둘은 머리 Alert이고 `?sessionRevocation=`는 Sessions
 * 구역 **안**이다. 실어 보내놓고 아무도 안 읽으면 사용자에게는 버튼이 안 눌린 것으로 보인다
 * (POSTMORTEM 2026-09-06).
 */
it.each([["e", "unavailable"], ["link", "unavailable"]])("`?%s=`가 머리 Alert에 닿는다", async (key, value) => {
  const container = await screen({ [key]: value });
  const alert = container.querySelector('[role="alert"]');
  expect(alert).not.toBeNull();
  // 머리다 — 어느 구역에도 속하지 않는다.
  expect(alert!.closest("section")).toBeNull();
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
  ["둘 다 연결됨", [{ provider: "github" }, { provider: "google" }]],
  ["마지막 수단", [{ provider: "github" }]],
])("%s 상태에서 버튼의 접근 이름이 전부 다르다", async (_name, methods) => {
  const container = await screen({}, methods);
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

  const disconnects = controls.filter((c) => c.visible === m.link.methods.disconnect);
  // ⚠️ **루프가 0회면 아래 둘이 통째로 증발한다** — 라벨이 바뀌면 그 순간 검사가 사라진다.
  expect(disconnects.length).toBeGreaterThan(1);
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
  const row = container.querySelectorAll("ul")[1]!.querySelector("li")!;
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
  const section = container.querySelectorAll("section")[1]!;
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
