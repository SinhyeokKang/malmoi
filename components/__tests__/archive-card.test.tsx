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

/**
 * **PR 줄의 골격이 실물의 줄 수·글자 크기와 같다** (malmoi#104). 전엔 고정 `h-4` 한 줄이라, 대화상자 폭(406px 열)에서 두 줄로
 * 접히는 `openPr` 문장(12px · line-height 17.33)이 도착하는 순간 Dialog가 18px 자라고 가운데 정렬이 9px 튀었다.
 * ⚠️ **px 높이가 아니라 line box다** — `SkeletonLine`이 실물과 같은 `text-xs` 줄을 세운다.
 */
it("열린 PR 조회 중에는 실물 문장과 같은 `text-xs` 두 줄 골격이 서고, 도착하면 그 자리에 문장이 선다", async () => {
  let resolve!: (url: string | null | undefined) => void;
  await render(<ArchiveCard slug="acme" name="Acme" archived={false} openPrUrl={new Promise(r => { resolve = r; })} />);
  await click("Archive project");
  const dialog = document.querySelector('[role="dialog"]')!;
  const lines = [...dialog.querySelectorAll("[data-skeleton-line]")];
  expect(lines).toHaveLength(2);
  for (const line of lines) expect(line.classList.contains("text-xs")).toBe(true);
  await act(async () => { resolve("https://github.com/o/r/pull/3"); });
  expect(dialog.querySelectorAll("[data-skeleton-line]")).toHaveLength(0);
  const real = dialog.querySelector('a[href="https://github.com/o/r/pull/3"]')?.closest("p");
  expect(real?.classList.contains("text-xs")).toBe(true);
});
