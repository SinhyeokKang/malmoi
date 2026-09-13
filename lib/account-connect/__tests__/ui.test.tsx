// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { LoginMethods } from "@/components/account/login-methods";
import { CONNECT_OUTCOMES } from "../plan";
import { m } from "@/lib/i18n";
vi.mock("@/app/(edit)/account/actions", () => ({ startLoginMethodConnect: vi.fn(), unlinkLoginMethod: vi.fn() }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(async () => { await act(async () => { roots.forEach(root => root.unmount()); }); roots.length = 0; document.body.replaceChildren(); });
async function render(outcome: (typeof CONNECT_OUTCOMES)[number] | null) {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host); roots.push(root);
  await act(async () => root.render(<LoginMethods rows={[{ provider: "github", connected: true }, { provider: "google", connected: false }]} outcome={outcome} />));
  return host;
}
it("미연결 수단만 Add 폼을 갖고 GitHub App 연결 문구를 쓰지 않는다", async () => {
  const host = await render(null);
  expect(host.querySelectorAll("form")).toHaveLength(1);
  // ⚠️ **라벨이 `Add ${provider}`에서 `Connect`로 짧아졌다** (2026-09-13) — 행 제목이 이미
  // provider 이름이라 같은 단어가 한 줄에 두 번 섰다. 대상은 접근 이름이 든다.
  expect(host.querySelector(`[aria-label="${m.link.methods.connectLabel("Google")}"]`)).not.toBeNull();
  expect(host.querySelector(`[aria-label="${m.link.methods.connectLabel("GitHub")}"]`)).toBeNull();
});
it.each(CONNECT_OUTCOMES)("%s 결과가 카드의 live Alert에 남는다", async outcome => {
  const host = await render(outcome);
  expect(host.querySelector(outcome === "connected" ? '[role="status"]' : '[role="alert"]')?.textContent).toContain(m.errors.connectMethod[outcome]);
});
