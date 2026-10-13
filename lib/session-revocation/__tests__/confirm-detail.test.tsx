// @vitest-environment jsdom
import { act } from "react";
import { expect, it, vi } from "vitest";

vi.mock("@/app/(edit)/account/actions", () => ({ startSessionRevocation: vi.fn() }));

import { render } from "@/components/__tests__/helpers/dom";
import { SessionsSection } from "@/components/account/sessions-section";
import { LOGIN_PROVIDERS } from "@/lib/login-link/policy";
import { en } from "@/messages/en";
import { es } from "@/messages/es";
import { ko } from "@/messages/ko";

/**
 * **Sign out everywhere 확인 창의 검은 줄은 확인 상대마다 참이어야 한다** (#262). GitLab은 이미 인가한 앱에 화면 없이 바로 돌아오고
 * `prompt`로 계정 선택을 강제할 길이 없다(gitlab-oauth T0 ⑤ · design D4) — 그래서 "GitLab이 확인을 묻는다"는 약속은 거짓이었다.
 * 문장은 호스트 이름 보간이 아니라 공급자별 키로 가른다(DESIGN §10.1).
 */
const DICTIONARIES = [["en", en], ["ko", ko], ["es", es]] as const;

/** 옛 약속 문장(보간 `confirmDetail("GitLab")`의 결과) — 다시 나오면 안 된다. */
const BROKEN_PROMISE = {
  en: "GitLab will ask you to confirm before anything changes.",
  ko: "로그아웃 전에 GitLab 화면에서 본인 확인을 진행합니다.",
  es: "GitLab te pedirá que lo confirmes antes de que cambie nada.",
} as const;

it.each(DICTIONARIES)("%s — GitLab 문장은 확인 화면을 약속하지 않는다", (locale, m) => {
  const gitlab = m.account.sessions.confirmDetail.gitlab;
  expect(gitlab).not.toBe(BROKEN_PROMISE[locale]);
  // GitHub 문장의 이름만 바꾼 사본이 아니다 — 그 문장이 약속하는 확인 화면이 GitLab에는 없다.
  expect(gitlab).not.toBe(m.account.sessions.confirmDetail.github.replaceAll(m.link.providers.github, m.link.providers.gitlab));
  expect(gitlab).toContain(m.link.providers.gitlab);
});

it.each(DICTIONARIES)("%s — 공급자마다 문장이 있고 자기 이름을 든다", (_locale, m) => {
  for (const provider of LOGIN_PROVIDERS) expect(m.account.sessions.confirmDetail[provider]).toContain(m.link.providers[provider]);
});

it.each(DICTIONARIES)("%s — 확인 상대가 GitLab이면 창에 GitLab 문장이 선다", async (locale, m) => {
  const { container } = await render(<SessionsSection outcome={undefined} signOut={() => {}} confirmProvider="gitlab" />, { uiLocale: locale });
  const trigger = [...container.querySelectorAll("button")].find((b) => b.textContent === m.account.sessions.title)!;
  await act(async () => { trigger.click(); });
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain(m.account.sessions.confirmDetail.gitlab);
  expect(dialog.textContent).not.toContain(BROKEN_PROMISE[locale]);
  expect(dialog.textContent).toContain(m.account.sessions.confirmAction(m.link.providers.gitlab));
  await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
});
