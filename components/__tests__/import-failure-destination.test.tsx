// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

/**
 * **가져오기 실패 안내는 Sources로 간다** (audit #6). 상세(사유·파일 오류)와 [Run first import]가 사는 곳이 Sources
 * 모달이고, Settings에는 가져오기 실패에 관한 정보가 0이다. EDITOR는 Settings에 들어갈 수 없어(`?e=forbidden`) 링크가
 * 곧 막다른 길이었다 — 링크 대신 담당자 안내 문장이다.
 */
const nav = vi.hoisted(() => ({ redirect: vi.fn((to: string) => { throw new Error(`redirect:${to}`); }) }));
vi.mock("next/navigation", () => ({ redirect: nav.redirect, useRouter: () => ({ push: vi.fn() }) }));

import { AttentionCard } from "@/components/home/attention-card";
import { ProjectNotReady } from "@/components/project-not-ready";
import { m } from "@/lib/i18n";
import { onboardErrorMessage } from "@/lib/onboarding/message";

const now = new Date("2026-09-24T00:00:00Z");
const failed = { kind: "import_failed" as const, at: now, surfaceSlug: "web", reason: "import-failed" as const };
const card = (role: "OWNER" | "EDITOR") =>
  render(<AttentionCard items={{ shown: [failed], more: [], count: 1 }} slug="acme" role={role} state="default" now={now} />);

beforeEach(() => { nav.redirect.mockClear(); });

it("OWNER의 Home 가져오기 실패 항목은 Sources로 간다", async () => {
  const { container } = await card("OWNER");
  const hrefs = [...container.querySelectorAll("a")].map(a => a.getAttribute("href"));
  expect(hrefs).toEqual(["/projects/acme/sources"]);
});

it("EDITOR의 같은 항목은 링크가 아니라 담당자 안내다 — 사실(어느 표면이 실패했나)은 그대로 읽힌다", async () => {
  const { container } = await card("EDITOR");
  expect(container.querySelectorAll("a")).toHaveLength(0);
  expect(container.textContent).toContain(m.home.attention.importFailed.title("web"));
  expect(container.textContent).toContain(m.projects.importFailure.contactOwner);
});

it("첫 적재 전 OWNER는 Sources로, 연결 전 OWNER는 Settings로 간다 — EDITOR는 이동하지 않는다", async () => {
  expect(() => ProjectNotReady({ slug: "acme", role: "OWNER", readiness: "awaiting_first_sync" })).toThrow("redirect:/projects/acme/sources");
  expect(() => ProjectNotReady({ slug: "acme", role: "OWNER", readiness: "setup" })).toThrow("redirect:/projects/acme/settings");
  nav.redirect.mockClear();
  await render(<ProjectNotReady slug="acme" role="EDITOR" readiness="awaiting_first_sync" />);
  expect(nav.redirect).not.toHaveBeenCalled();
});

it("첫 적재 실패 문구가 Settings를 가리키지 않는다 — 재시도는 Sources에 있다", () => {
  const text = onboardErrorMessage("ingest-failed");
  expect(text).not.toMatch(/settings/i);
  expect(text).toContain("Sources");
});
