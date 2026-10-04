// @vitest-environment jsdom
// ⚠️ 런타임 TZ를 UTC가 아닌 곳(분 단위 오프셋)에 둔다 — 미리보기·옵션이 런타임 TZ를 읽으면 CI(UTC)에서 공허하게 통과한다. 걸렸는지는 아래 가드가 판정한다.
process.env.TZ = "Asia/Kathmandu";

import { act, Component, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { TimeZoneCard } from "@/components/preferences/time-zone-card";
import { timeZoneOptions } from "@/lib/time-zone/options";

import { find, key, render } from "./helpers/dom";

/**
 * `/preferences`의 Time zone 카드 (user-timezone design §6 · tasks D2) — Language 카드와 같은 조립(`PreferenceSelectCard`)이다.
 *
 * ⚠️ **고르는 즉시 적용한다** — 닫힌 트리거의 글자 키 typeahead가 곧 앱 전체 시간대 변경이다(POSTMORTEM 2026-09-19의 두 번째 경로).
 * ⚠️ `now`는 서버가 내린 ISO prop이다 — 옵션 정렬과 미리보기가 같은 순간을 쓴다(design §0 하이드레이션 ①).
 * ⚠️ 진행 중은 Root `disabled`가 아니라 `RoleSelect` 가드다 — jsdom엔 브라우저의 disabled 포커스 fixup이 없어 아래 observer가 흉내 낸다.
 */
const mocks = vi.hoisted(() => ({ setTimeZone: vi.fn() }));
vi.mock("@/app/(edit)/preferences/actions", () => ({ setTimeZone: mocks.setTimeZone }));

/** 2026-10-04T23:10Z — 서울에선 이튿날 08:10이다(spec 완료 조건 2). */
const NOW = "2026-10-04T23:10:00.000Z";

let fixup: MutationObserver;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.setTimeZone.mockResolvedValue("ok");
  fixup = new MutationObserver(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.matches(":disabled")) { active.removeAttribute("disabled"); active.blur(); active.setAttribute("disabled", ""); }
  });
  fixup.observe(document.body, { attributes: true, attributeFilter: ["disabled"], subtree: true });
});
afterEach(() => fixup.disconnect());

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

class Boundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) { return { error }; }
  render() { return this.state.error === null ? this.props.children : <p data-caught />; }
}

const trigger = () => find<HTMLButtonElement>(document.body, '[role="combobox"]');
const options = () => [...document.body.querySelectorAll<HTMLElement>('[role="option"]')];
const preview = () => find<HTMLElement>(document.body, "[data-time-zone-now]").textContent;
const tick = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
async function open() {
  await act(async () => { trigger().focus(); });
  await key(trigger(), "ArrowDown");
}
async function choose(label: string) {
  await open();
  const option = options().find((node) => node.textContent === label);
  if (option === undefined) throw new Error(`Missing option ${label}`);
  await key(option, "Enter");
  await tick();
}

it("TZ가 실제로 카트만두다 — 이 가드가 없으면 아래 단언이 UTC 런타임에서 공허하다", () => {
  expect(new Date("2026-01-01T00:00:00Z").getTimezoneOffset()).toBe(-345);
});

it("트리거 이름은 카드 제목, 설명은 Select 아래 도움말이다 — 라벨 열이 없다", async () => {
  await render(<TimeZoneCard now={NOW} />);
  const named = document.getElementById(trigger().getAttribute("aria-labelledby") ?? "");
  expect(named?.tagName).toBe("H2");
  expect(named?.textContent).toBe("Time zone");
  expect(document.getElementById(trigger().getAttribute("aria-describedby") ?? "")?.textContent).toBe("The default is UTC. Public pages always use UTC.");
  expect(find(document.body, "section header").textContent).toContain("The time zone Malmoi uses for dates and times.");
  expect(document.body.querySelector("label")).toBeNull();
});

it("옵션이 서버 now 기준 timeZoneOptions 그대로이고, 트리거는 지금 시간대다", async () => {
  await render(<TimeZoneCard now={NOW} />, { timeZone: "Asia/Seoul" });
  expect(trigger().textContent).toBe("UTC+9 · Asia/Seoul");
  await open();
  expect(options().map((node) => node.textContent)).toEqual(timeZoneOptions(new Date(NOW)).map((option) => option.label));
});

it("고르지 않은 사람은 UTC이고 미리보기는 지금과 같은 UTC 형이다", async () => {
  await render(<TimeZoneCard now={NOW} />);
  expect(trigger().textContent).toBe("UTC");
  expect(preview()).toBe("Now: Oct 4, 2026 23:10 UTC");
});

it("미리보기는 고른 시간대·화면 언어로 그 순간을 말한다", async () => {
  await render(<TimeZoneCard now={NOW} />, { uiLocale: "ko", timeZone: "Asia/Seoul" });
  expect(preview()).toBe("현재: 2026년 10월 5일 08:10 UTC+9");
});

it("다른 시간대를 고르면 Action을 부르고, 도는 동안 트리거·미리보기가 고른 값이며 가드가 서고 포커스가 남는다", async () => {
  const pending = deferred<string>();
  mocks.setTimeZone.mockReturnValueOnce(pending.promise);
  await render(<TimeZoneCard now={NOW} />);
  await choose("UTC+9 · Asia/Seoul");
  expect(mocks.setTimeZone).toHaveBeenCalledWith("Asia/Seoul");
  expect(trigger().textContent).toBe("UTC+9 · Asia/Seoul");
  expect(preview()).toBe("Now: Oct 5, 2026 08:10 UTC+9");
  expect(trigger().getAttribute("aria-busy")).toBe("true");
  expect(trigger().getAttribute("aria-disabled")).toBe("true");
  expect(trigger().disabled).toBe(false);
  expect(document.activeElement).toBe(trigger());
  // 잠긴 동안 다시 열 수 없다.
  await key(trigger(), "ArrowDown");
  expect(trigger().getAttribute("aria-expanded")).toBe("false");
  await act(async () => pending.resolve("ok"));
  await tick();
  expect(trigger().hasAttribute("aria-busy")).toBe(false);
  expect(document.activeElement).toBe(trigger());
  expect(document.body.querySelector('[data-alert="danger"]')).toBeNull();
});

it("지금 값과 같은 값을 고르면 Action을 부르지 않는다", async () => {
  await render(<TimeZoneCard now={NOW} />, { timeZone: "Asia/Seoul" });
  await choose("UTC+9 · Asia/Seoul");
  expect(mocks.setTimeZone).not.toHaveBeenCalled();
});

it.each(["failed", "invalid"])("Action이 %s면 트리거·미리보기가 원래 값으로 돌아가고 카드 notice에 Alert danger inset이 선다", async (result) => {
  mocks.setTimeZone.mockResolvedValueOnce(result);
  await render(<TimeZoneCard now={NOW} />);
  await choose("UTC-4 · America/New_York");
  expect(trigger().textContent).toBe("UTC");
  expect(preview()).toBe("Now: Oct 4, 2026 23:10 UTC");
  const alert = find<HTMLElement>(document.body, "[data-card-notice] [data-alert]");
  expect(alert.getAttribute("data-alert")).toBe("danger");
  expect(alert.classList).toContain("rounded-none");
  expect(alert.textContent).toBe("We couldn't change the time zone. Try again.");
  expect(alert.querySelector("button")).toBeNull();
});

it("Action이 reject되면 오류 경계가 아니라 원래 값 + 카드 Alert다", async () => {
  mocks.setTimeZone.mockRejectedValueOnce(new Error("Failed to fetch"));
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  await render(<Boundary><TimeZoneCard now={NOW} /></Boundary>);
  await choose("UTC+9 · Asia/Seoul");
  error.mockRestore();
  expect(document.querySelector("[data-caught]")).toBeNull();
  expect(trigger().textContent).toBe("UTC");
  expect(find(document.body, "[data-card-notice] [data-alert]").textContent).toBe("We couldn't change the time zone. Try again.");
});

it("닫힌 트리거에서 글자 키로 값이 바뀌지 않는다 — Tab으로 지나가다 친 글자가 앱 전체 시간대를 바꾸면 안 된다", async () => {
  await render(<TimeZoneCard now={NOW} />);
  await act(async () => { trigger().focus(); });
  for (const letter of ["a", "A", "u", "E"]) await key(trigger(), letter);
  await tick();
  expect(mocks.setTimeZone).not.toHaveBeenCalled();
  expect(trigger().textContent).toBe("UTC");
  expect(trigger().getAttribute("aria-expanded")).toBe("false");
});

it("es 화면이면 카드 문구와 미리보기가 es다 — 시간대 id는 번역하지 않는다", async () => {
  await render(<TimeZoneCard now={NOW} />, { uiLocale: "es", timeZone: "Asia/Kolkata" });
  expect(find(document.body, "section h2").textContent).toBe("Zona horaria");
  expect(trigger().textContent).toBe("UTC+5:30 · Asia/Kolkata");
  expect(preview()).toBe("Ahora: 5 oct 2026 04:40 UTC+5:30");
});
