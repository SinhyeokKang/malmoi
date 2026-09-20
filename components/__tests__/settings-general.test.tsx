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
it("名前の保存はURLを変えず、成功表示は次の入力まで残る", async () => {
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
  expect(address.value).toBe("acme"); expect(address.readOnly).toBe(true); expect(address.tabIndex).toBe(-1);
});
it("空の名前は送信せず、拒否理由をフィールドに接続する", async () => {
  const { container } = await render(view());
  const name = container.querySelector<HTMLInputElement>('#project-name')!;
  await input(name, " ");
  expect(button(container, "Save").disabled).toBe(true);
  expect(name.getAttribute("aria-invalid")).toBe("true");
  expect(document.getElementById(name.getAttribute("aria-describedby")!)?.textContent).toContain("Enter a project name");
});
it("画像更新中は両操作を止め、完了後URLを置換して削除時はフォールバックに戻る", async () => {
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
it("保管中はメタデータ編集も画面上で無効にし理由を表示する", async () => {
  const { container } = await render(view("/logo.webp", true));
  for (const b of container.querySelectorAll("button")) expect(b.disabled).toBe(true);
  expect(container.textContent).toContain("Restore this project");
});
