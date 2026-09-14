// @vitest-environment jsdom
import { act } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { find, render } from "./helpers/dom";
import { AddSurface } from "../onboarding/add-surface";
import NotFound from "@/app/(edit)/projects/[slug]/not-found";

const mocks = vi.hoisted(() => ({ add: vi.fn(), detect: vi.fn(), sample: vi.fn(), confirm: vi.fn() }));
vi.mock("@/app/(edit)/projects/actions", () => ({ addSurface: mocks.add, detectRepoFormats: mocks.detect,
  loadCandidateSample: mocks.sample, confirmManualFormat: mocks.confirm }));
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({ startGithubConnect: vi.fn() }));
const props = {
  slug: "acme", owner: "o", repo: "r", branch: "main",
  adapters: [{ adapter: "json-catalog" as const, layout: "per-locale" as const, label: "JSON", example: "locales/{locale}.json" }],
  initial: { ok: true as const, candidates: [{ adapter: "json-catalog" as const, pathTemplate: "second/{locale}.json",
    baseLocale: "en", locales: ["en", "ko"], label: "JSON", keys: { status: "counted" as const, count: 1 },
    samples: [{ locale: "en", total: 1, rows: [{ key: "old", value: "Hello" }] }], confirmation: "signed" }] },
};
beforeEach(() => { vi.clearAllMocks(); });

it("선택한 표면의 실패 뒤에도 후보와 입력을 보존하고 재시도한다", async () => {
  mocks.add.mockResolvedValue({ ok: false, error: "ingest-failed" });
  const user = userEvent.setup();
  const { container } = await render(<AddSurface {...props} />);
  await act(async () => user.click(find(container, '[data-add-surface]')));
  expect(mocks.add).toHaveBeenCalledWith({ slug: "acme", adapter: "json-catalog", pathTemplate: "second/{locale}.json", baseLocale: "en" });
  expect(container.textContent).toContain("second/{locale}.json");
  expect(find<HTMLButtonElement>(container, '[data-add-surface]').disabled).toBe(false);
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
});

it("추가 결과는 새 토큰 없이 기존 workflow step과 부분 실패를 보여준다", async () => {
  mocks.add.mockResolvedValue({ ok: true, surfaceSlug: "second", count: 1, failed: 1, yaml: "surface: second" });
  const user = userEvent.setup();
  const { container } = await render(<AddSurface {...props} />);
  await act(async () => user.click(find(container, '[data-add-surface]')));
  expect(container.textContent).toContain("surface: second");
  expect(container.textContent).toContain("1");
  expect(container.querySelector('[role="status"]')).not.toBeNull();
  expect(container.querySelector('input[type="password"]')).toBeNull();
  expect(container.querySelector('a[href="/projects/acme/surfaces/second/translations"]')).not.toBeNull();
});

it("없는 표면의 404는 제품 안내와 돌아갈 링크를 제공한다", async () => {
  const { container } = await render(<NotFound />);
  expect(container.textContent).toContain("Translation surface");
  expect(container.querySelector('a[href="/projects"]')).not.toBeNull();
});

it("탐지 후보가 있어도 수동 경로를 검사하고 원래 후보로 돌아간다", async () => {
  const user = userEvent.setup();
  const { container } = await render(<AddSurface {...props} />);
  await act(async () => user.click(find(container, '[data-manual-surface]')));
  expect(container.querySelector('input')).not.toBeNull();
  expect(find<HTMLButtonElement>(container, '[data-add-surface]').disabled).toBe(true);
  await act(async () => user.click(find(container, '[data-detected-surfaces]')));
  expect(container.textContent).toContain("second/{locale}.json");
  expect(find<HTMLButtonElement>(container, '[data-add-surface]').disabled).toBe(false);
});

it("리포 정체성 변경은 재시도로 고칠 수 없는 원인을 안내한다", async () => {
  mocks.add.mockResolvedValue({ ok: false, error: "repo-replaced" });
  const user = userEvent.setup();
  const { container } = await render(<AddSurface {...props} />);
  await act(async () => user.click(find(container, '[data-add-surface]')));
  expect(container.textContent).toContain("different repository");
});
