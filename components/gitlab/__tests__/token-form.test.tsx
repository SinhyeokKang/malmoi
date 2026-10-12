// @vitest-environment jsdom
import { act } from "react";
import { beforeEach, expect, it, vi } from "vitest";

import { render } from "@/components/__tests__/helpers/dom";
import { en } from "@/messages/en";

const connectGitLab = vi.fn();
vi.mock("@/app/(edit)/account/actions", () => ({ connectGitLab: (...args: unknown[]) => connectGitLab(...args) }));

const { GitLabTokenForm, GITLAB_TOKEN_URL } = await import("../token-form");

/**
 * PAT 입력 shell (시안 G2a~d · G8b · design-brief "GitLab 탭 상태"). ①의 GitLab 탭·`/account`·설정 재연결이 같은 형을 쓴다.
 * ⚠️ 입력 중에는 서버로 보내지 않는다 — [Connect]만 보낸다. 붙여 넣은 값은 연결 뒤 다시 보이지 않는다.
 */
beforeEach(() => connectGitLab.mockReset());

async function form(onConnected = vi.fn()) {
  const { container } = await render(<GitLabTokenForm submitLabel={en.account.gitlab.form.connect} onConnected={onConnected} />);
  const input = container.querySelector<HTMLInputElement>("input")!;
  const button = [...container.querySelectorAll("button")].find((b) => b.textContent === en.account.gitlab.form.connect)!;
  return { container, input, button, onConnected };
}

async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

it("입력은 password이고 라벨·도움말이 접근 이름·설명으로 이어진다", async () => {
  const { container, input } = await form();
  expect(input.type).toBe("password");
  const label = container.querySelector(`label[for="${input.id}"]`);
  expect(label?.textContent).toBe(en.account.gitlab.form.label);
  const described = (input.getAttribute("aria-describedby") ?? "").split(" ").map((id) => container.querySelector(`[id="${id}"]`)?.textContent ?? "");
  expect(described.join(" ")).toContain("api");
});

it("토큰 만들기 링크는 레거시 PAT 화면(scopes=api 프리필)으로 새 탭에 열린다 (D13)", async () => {
  const { container } = await form();
  expect(GITLAB_TOKEN_URL).toBe("https://gitlab.com/-/user_settings/personal_access_tokens?name=Malmoi&scopes=api");
  const link = [...container.querySelectorAll("a")].find((a) => a.textContent === en.account.gitlab.form.create)!;
  expect(link.href).toBe(GITLAB_TOKEN_URL);
  expect(link.target).toBe("_blank");
});

it("입력 중엔 보내지 않고 [Connect]가 값을 보낸다 — 성공하면 값을 비우고 결과를 넘긴다", async () => {
  const connection = { username: "ox", expiresAt: null, scopes: ["api"], updatedAt: new Date() };
  connectGitLab.mockResolvedValue({ ok: true, connection });
  const { input, button, onConnected } = await form();
  await type(input, "glpat-abc");
  expect(connectGitLab).not.toHaveBeenCalled();
  await act(async () => button.click());
  expect(connectGitLab).toHaveBeenCalledWith({ token: "glpat-abc" });
  expect(onConnected).toHaveBeenCalledWith(connection);
  expect(input.value).toBe("");
});

it.each([
  ["token-scope-missing", en.errors.gitlab["token-scope-missing"]],
  ["token-fine-grained", en.errors.gitlab["token-fine-grained"]],
  ["token-invalid", en.errors.gitlab["token-invalid"]],
  ["unavailable", en.errors.gitlab.unavailable],
] as const)("거부 %s는 도움말 아래 danger Alert이고 도움말이 남는다 — aria-describedby·aria-invalid로 이어진다 (#246)", async (error, text) => {
  connectGitLab.mockResolvedValue({ ok: false, error });
  const { container, input, button, onConnected } = await form();
  await type(input, "glpat-abc");
  await act(async () => button.click());
  const ids = (input.getAttribute("aria-describedby") ?? "").split(" ");
  const described = ids.map((id) => container.querySelector(`[id="${id}"]`));
  const alert = described.find((el) => el?.textContent?.includes(text));
  expect(alert, "Alert가 입력의 설명이다").toBeDefined();
  // 인라인 필드 오류(FormGroup error)가 아니라 Alert 프리미티브다 — 도움말을 대신하지 않는다.
  expect(alert?.closest("[data-field-error]")).toBeNull();
  expect(container.textContent).toContain(en.account.gitlab.form.help);
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(onConnected).not.toHaveBeenCalled();
});

it("빈 입력에서 [Connect]는 꺼진 형(aria-disabled)이고 도움말이 이유를 말한다 (#244)", async () => {
  const { container, input, button } = await form();
  expect(button.getAttribute("aria-disabled")).toBe("true");
  const reason = (button.getAttribute("aria-describedby") ?? "").split(" ").map((id) => container.querySelector(`[id="${id}"]`)?.textContent ?? "").join(" ");
  expect(reason).toContain(en.account.gitlab.form.help);
  await type(input, "glpat-abc");
  expect(button.getAttribute("aria-disabled")).toBeNull();
});

it("검증 중엔 상태 줄이 role=status로 선다 (#245)", async () => {
  let resolve!: (value: unknown) => void;
  connectGitLab.mockReturnValue(new Promise((r) => { resolve = r; }));
  const { container, input, button } = await form();
  await type(input, "glpat-abc");
  await act(async () => button.click());
  expect(container.querySelector('[role="status"]')?.textContent).toBe(en.account.gitlab.form.checking);
  await act(async () => resolve({ ok: false, error: "token-invalid" }));
  expect(container.querySelector('[role="status"]')).toBeNull();
});

it("빈 값은 보내지 않는다", async () => {
  const { button } = await form();
  await act(async () => button.click());
  expect(connectGitLab).not.toHaveBeenCalled();
});

/**
 * **GitLab을 부르기 전의 거부는 GitLab 문장이 아니다** (감사 U6). 세션이 끝난 채 [Connect]를 누르면 할 일은 로그인이고("다시 시도"는 같은 결과다),
 * 입력 모양 거부는 GitLab이 토큰을 본 적이 없다 — "GitLab connection failed"·"GitLab didn't accept"로 말하지 않는다.
 */
it.each([
  ["unauthorized", en.errors.access.unauthorized],
  ["invalid input", en.account.gitlab.form.invalidInput],
] as const)("Action 거부 %s는 GitLab 문장이 아니라 그 원인의 문장이다", async (error, text) => {
  connectGitLab.mockResolvedValue({ ok: false, error });
  const { container, input, button } = await form();
  await type(input, "glpat-abc");
  await act(async () => button.click());
  expect(container.textContent).toContain(text);
  expect(container.textContent).not.toContain(en.errors.gitlab.fallback);
  expect(input.getAttribute("aria-invalid")).toBe("true");
});
