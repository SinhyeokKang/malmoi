// @vitest-environment jsdom
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

/**
 * **보관·복원의 거부를 버리지 않는다** (audit #7). 전엔 `void (await archiveProject(slug))`가 `{ ok: false }`를 버려
 * 버튼만 제자리로 돌아왔다 — 누른 사람은 무엇이 안 됐는지 모른다. `m.archive.failed`는 정의만 있고 소비자가 0이었다.
 */
const mocks = vi.hoisted(() => ({ archive: vi.fn(), unarchive: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => ({ archiveProject: mocks.archive, unarchiveProject: mocks.unarchive }));

import { ArchiveCard } from "@/components/settings/archive-card";
import { m } from "@/lib/i18n";

const click = async (label: string) => {
  const node = [...document.querySelectorAll("button")].filter(b => b.textContent?.trim() === label).at(-1);
  if (!node) throw new Error(`no button ${label}`);
  await act(async () => userEvent.setup().click(node));
};
const alertText = () => document.querySelector('[role="alert"]')?.textContent ?? "";

beforeEach(() => { vi.clearAllMocks(); });

it("보관 거부는 블록 안 danger Alert로 사유를 말한다", async () => {
  mocks.archive.mockResolvedValue({ ok: false, error: "forbidden" });
  await render(<ArchiveCard slug="acme" name="Acme" archived={false} openPrUrl={Promise.resolve(null)} />);
  await click("Archive project");
  await click("Archive project");
  expect(mocks.archive).toHaveBeenCalledWith("acme");
  expect(alertText()).toContain(m.errors.access.forbidden);
});

it("복원 거부·통신 실패도 사유를 세우고, 다시 누르면 지운다 — 성공이면 Alert가 없다", async () => {
  mocks.unarchive.mockResolvedValueOnce({ ok: false, error: "not-ready" }).mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ ok: true });
  await render(<ArchiveCard slug="acme" name="Acme" archived openPrUrl={undefined} />);
  await click("Restore project");
  expect(alertText()).toContain(m.archive.failed("not-ready"));
  await click("Restore project");
  expect(alertText()).toContain(m.archive.failedUnknown);
  await click("Restore project");
  expect(mocks.unarchive).toHaveBeenCalledTimes(3);
  expect(document.querySelector('[role="alert"]')).toBeNull();
});
