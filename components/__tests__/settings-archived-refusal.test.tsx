// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { GeneralCard } from "@/components/settings/general-card";
import { PushTokenPanel } from "@/components/settings/push-token-panel";
import { RepositoryCard } from "@/components/settings/repository-card";
import { RepositoryForm } from "@/components/settings/repository-form";
import { m } from "@/lib/i18n";

import { input, render } from "./helpers/dom";

/**
 * **Settings가 연 채로 보관되면** (QA D1, 2026-09-24). 다른 탭이 보관한 뒤 누른 쓰기는 서버가 `archived`로 거부하고 화면을
 * 다시 그린다(`archived` prop이 참이 된다). 두 가지를 고정한다:
 * - 거부 문구가 "설정에서 복원하라"(`errors.access.archived`)를 말하지 않는다 — 보는 사람이 이미 설정에 있다.
 * - 보관 상태가 오면 그 행의 옛 오류가 남지 않고 다른 행과 같은 `archivedReason` 한 문장이 선다.
 */
const actions = vi.hoisted(() => ({
  updateProjectName: vi.fn(), uploadProjectImage: vi.fn(), deleteProjectImage: vi.fn(),
  updateRepositorySettings: vi.fn(), connectRepository: vi.fn(),
  listRepoBranches: vi.fn(), rotatePushToken: vi.fn(),
}));
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => actions);
vi.mock("@/app/(edit)/projects/actions", () => actions);
beforeEach(() => {
  vi.resetAllMocks();
  actions.listRepoBranches.mockResolvedValue({ ok: true, names: ["main", "dev"], defaultBranch: "main", truncated: false });
});

const button = (label: string) => [...document.querySelectorAll("button")].find(b => b.textContent?.includes(label))!;
const click = async (target: Element) => { await act(async () => { await userEvent.setup().click(target); }); };
const elsewhere = m.errors.access.archived;

it("Name: 보관 거부는 Settings 문구로 말하고, 보관 상태가 오면 옛 오류가 사라진다", async () => {
  actions.updateProjectName.mockResolvedValue({ ok: false, error: "archived" });
  const view = (archived: boolean) => <GeneralCard slug="acme" name="Acme" image={null} archived={archived} />;
  const { container, rerender } = await render(view(false));
  await input(container.querySelector<HTMLInputElement>("#project-name")!, "Acme-x");
  await click(button(m.settings.repository.fields.save));
  const caption = () => container.querySelector("#project-name-caption")!;
  expect(caption().textContent).toContain(m.settings.archivedReason);
  expect(caption().textContent).not.toContain(elsewhere);
  await rerender(view(true));
  expect(caption().textContent).toBe(m.settings.archivedReason);
  expect(caption().getAttribute("role")).toBeNull();
  expect(container.querySelector("#project-name")!.getAttribute("aria-invalid")).toBe("false");
  // 거부된 입력도 내린다 — 꺼진 입력란에 저장되지 않은 이름이 남으면 그것이 저장된 이름처럼 읽힌다.
  expect(container.querySelector<HTMLInputElement>("#project-name")!.value).toBe("Acme");
});

it("Upload: 보관 거부는 Settings 문구로 말하고, 보관 상태가 오면 경고 표시가 사라진다", async () => {
  actions.uploadProjectImage.mockResolvedValue({ ok: false, reason: "archived" });
  const view = (archived: boolean) => <GeneralCard slug="acme" name="Acme" image={null} archived={archived} />;
  const { container, rerender } = await render(view(false));
  await act(async () => { await userEvent.setup().upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File(["png"], "logo.png", { type: "image/png" })); });
  const caption = () => container.querySelector("#project-image-caption")!;
  expect(caption().textContent).toContain(m.settings.archivedReason);
  expect(caption().textContent).not.toContain(elsewhere);
  await rerender(view(true));
  expect(caption().getAttribute("role")).toBeNull();
  expect(caption().className).not.toContain("text-destructive");
});

it("Base branch: 보관 거부는 Settings 문구로 말하고, 보관 상태가 오면 옛 오류가 사라진다", async () => {
  actions.updateRepositorySettings.mockResolvedValue({ ok: false, error: "archived" });
  const view = (disabled: boolean) => <RepositoryForm owner="acme" repo="web" slug="acme" baseBranch="main" disabled={disabled} />;
  const { container, rerender } = await render(view(false));
  await act(async () => { await userEvent.setup().click(container.querySelector('[role="combobox"]')!); });
  await click([...document.querySelectorAll('[role="option"]')].find(node => node.textContent === "dev")!);
  await click(button(m.settings.repository.fields.save));
  const caption = () => container.querySelector("#base-branch-caption")!;
  expect(caption().textContent).toContain(m.settings.archivedReason);
  expect(caption().textContent).not.toContain(elsewhere);
  await rerender(view(true));
  expect(caption().textContent).toBe(m.settings.archivedReason);
  expect(caption().getAttribute("role")).toBeNull();
});

it("Rotate token: 보관 거부는 Settings 문구로 말하고, 보관 상태가 오면 경고가 사라진다", async () => {
  actions.rotatePushToken.mockResolvedValue({ ok: false, error: "archived" });
  const { rerender } = await render(<PushTokenPanel slug="acme" />);
  await click(button(m.settings.token.rotate));
  await click([...document.querySelectorAll('[role="dialog"] button')].find(b => b.textContent === m.settings.token.confirmAction)!);
  expect(document.body.textContent).toContain(m.settings.archivedReason);
  expect(document.body.textContent).not.toContain(elsewhere);
  await rerender(<PushTokenPanel slug="acme" disabled />);
  expect(document.querySelector('[role="alert"]')).toBeNull();
});

it("Reconnect: 보관 거부는 Settings 문구로 말하고, 보관 상태가 오면 카드의 옛 경고가 사라진다", async () => {
  actions.connectRepository.mockResolvedValue({ ok: false, error: "archived" });
  const view = (archived: boolean) => <RepositoryCard slug="acme" owner="acme" repo="web" branch="main" archived={archived} health={{ status: "not-connected" }} account={{ status: "reauthorize" }} />;
  const { rerender } = await render(view(false));
  await click(button(m.settings.repository.connect));
  expect(document.body.textContent).toContain(m.settings.archivedReason);
  expect(document.body.textContent).not.toContain(elsewhere);
  await rerender(view(true));
  expect(document.querySelector('[role="alert"]')).toBeNull();
});
