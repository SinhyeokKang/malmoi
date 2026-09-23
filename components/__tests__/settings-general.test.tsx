// @vitest-environment jsdom
import { act } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { GeneralCard } from "@/components/settings/general-card";
import { render, input } from "./helpers/dom";
const actions = vi.hoisted(() => ({ updateProjectName: vi.fn(), uploadProjectImage: vi.fn(), deleteProjectImage: vi.fn() }));
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => actions);
beforeEach(() => { vi.resetAllMocks(); actions.updateProjectName.mockResolvedValue({ ok: true, name: "Renamed" }); });
const view = (image: string | null = null, archived = false) => <GeneralCard slug="acme" name="Acme" image={image} archived={archived} />;
function button(container: HTMLElement, label: string) { return [...container.querySelectorAll("button")].find(b => b.textContent === label)!; }
it("Saving preserves the address and shows success until the next edit", async () => {
  const { container } = await render(view());
  const name = container.querySelector<HTMLInputElement>('#project-name')!;
  await input(name, "  Renamed  ");
  await act(async () => { await userEvent.setup().click(button(container, "Save")); });
  expect(actions.updateProjectName).toHaveBeenCalledWith({ slug: "acme", name: "  Renamed  " });
  expect(container.textContent).toContain("Saved");
  expect(name.value).toBe("  Renamed  ");
  await input(name, "Next");
  expect(container.textContent).not.toContain("Saved");
  const address = container.querySelector<HTMLInputElement>('#project-address')!;
  expect(address.value).toBe("acme"); expect(address.readOnly).toBe(true); expect(address.tabIndex).toBe(0);
});
// 저장할 것이 없는 [Save]를 켜 두면 눌러도 아무 일이 없는 버튼이 된다.
it("Save stays off until the name differs from the saved one", async () => {
  const { container } = await render(view());
  const name = container.querySelector<HTMLInputElement>('#project-name')!;
  expect(button(container, "Save").disabled).toBe(true);
  await input(name, "Acme 2");
  expect(button(container, "Save").disabled).toBe(false);
  await input(name, " Acme ");
  expect(button(container, "Save").disabled).toBe(true);
});
it.each([[{ ok: true, name: "Renamed" }, true], [{ ok: false, error: "unavailable" }, false]] as const)("A save result %o leaves Save disabled=%s — success makes the new name the baseline", async (response, off) => {
  {
    actions.updateProjectName.mockResolvedValueOnce(response);
    const { container } = await render(view());
    await input(container.querySelector<HTMLInputElement>('#project-name')!, "Renamed");
    await act(async () => { await userEvent.setup().click(button(container, "Save")); });
    expect(button(container, "Save").disabled).toBe(off);
  }
});
it("An empty name cannot submit and describes the rejection", async () => {
  const { container } = await render(view());
  const name = container.querySelector<HTMLInputElement>('#project-name')!;
  await input(name, " ");
  expect(button(container, "Save").disabled).toBe(true);
  expect(name.getAttribute("aria-invalid")).toBe("true");
  expect(document.getElementById(name.getAttribute("aria-describedby")!)?.textContent).toContain("Enter a project name");
});
it("Image operations lock both controls and reflect replacement and deletion", async () => {
  let resolve!: (value: { ok: true; image: string }) => void;
  actions.uploadProjectImage.mockReturnValue(new Promise(r => { resolve = r; }));
  actions.deleteProjectImage.mockResolvedValue({ ok: true, image: null });
  const { container, rerender } = await render(view("/old.webp"));
  await act(async () => { await userEvent.setup().upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File(["png"], "logo.png", { type: "image/png" })); });
  expect(button(container, "Upload").disabled).toBe(true); expect(button(container, "Remove").disabled).toBe(true);
  await act(async () => resolve({ ok: true, image: "/new.webp" }));
  await rerender(view("/new.webp"));
  expect(container.querySelector("img")?.getAttribute("src")).toBe("/new.webp");
  await act(async () => { await userEvent.setup().click(button(container, "Remove")); });
  await rerender(view(null));
  expect(container.querySelector("img")).toBeNull();
});
it("Archived metadata controls are disabled with a reason", async () => {
  const { container } = await render(view("/logo.webp", true));
  for (const b of container.querySelectorAll("button")) expect(b.disabled).toBe(true);
  expect(container.textContent).toContain("Restore this project");
});

/**
 * **주소 힌트도 호스트를 말하지 않는다** (launch-readiness L7.5 — `naming-hint.test.tsx`와 같은 근거).
 * `mal-moi.com`을 박으면 dev·로컬에서 지금 보고 있는 호스트와 다른 주소를 알려 준다. 힌트가 전하는 것은
 * slug가 경로에 박히고 바뀌지 않는다는 것이라 호스트 없이도 참이다.
 */
it("The address hint names the path without a host", async () => {
  const { container } = await render(view());
  const text = container.textContent ?? "";
  expect(text).toContain("/projects/acme");
  expect(text).not.toMatch(/mal-moi\.com|vercel\.app|localhost/);
});

/** 같은 폴백이 설정 미리보기에도 있다 — 없으면 56px 빈 상자만 남는다 (malmoi#50). */
it("A broken thumbnail URL falls back to the name tile", async () => {
  const { container } = await render(view("https://store.public.blob.vercel-storage.com/projects/p/gone.webp"));
  await act(async () => { container.querySelector("img")!.dispatchEvent(new Event("error")); });
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector("svg.lucide-box")).not.toBeNull();
});
// audit #23 — 서버가 같은 판정(`planProjectName`)으로 거부해도 전용 문장이다. 폴백(`fields.failed`)으로 뭉개지 않는다.
it.each([["empty", "Enter a project name."], ["too-long", "Use 200 characters or fewer."], ["unavailable", "Something went wrong. Try again in a moment."]] as const)("A server rejection %s names its own reason", async (error, text) => {
  actions.updateProjectName.mockResolvedValueOnce({ ok: false, error });
  const { container } = await render(view());
  await input(container.querySelector<HTMLInputElement>('#project-name')!, "Renamed");
  await act(async () => { await userEvent.setup().click(button(container, "Save")); });
  expect(container.textContent).toContain(text);
});
