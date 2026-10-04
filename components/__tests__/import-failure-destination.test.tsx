// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

/**
 * **가져오기 실패 안내는 Sources로 간다** (audit #6). 상세(사유·파일 오류)와 [Run first import]가 사는 곳이 Sources
 * 모달이고, Settings에는 가져오기 실패에 관한 정보가 0이다. EDITOR는 Settings에 들어갈 수 없어(`?e=forbidden`) 링크가
 * 곧 막다른 길이었다. Sources는 EDITOR도 열 수 있으므로 같은 링크를 받고(r1 사용자 결정), 재시도가 OWNER 전용이라는
 * 한 줄이 붙는다.
 */
const nav = vi.hoisted(() => ({ redirect: vi.fn((to: string) => { throw new Error(`redirect:${to}`); }) }));
vi.mock("next/navigation", () => ({ redirect: nav.redirect, useRouter: () => ({ push: vi.fn() }) }));

import { AttentionCard } from "@/components/home/attention-card";
import { ProjectNotReady } from "@/components/project-not-ready";
import { en } from "@/messages/en";
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

it("EDITOR의 같은 항목도 Sources로 가고, 재시도는 소유자 몫이라는 한 줄이 붙는다", async () => {
  const { container } = await card("EDITOR");
  expect([...container.querySelectorAll("a")].map(a => a.getAttribute("href"))).toEqual(["/projects/acme/sources"]);
  expect(container.textContent).toContain(en.home.attention.importFailed.title("web"));
  expect(container.textContent).toContain(en.projects.importFailure.ownerRetries);
  const owner = await card("OWNER");
  expect(owner.container.textContent).not.toContain(en.projects.importFailure.ownerRetries);
});

it("첫 적재 전 OWNER는 Sources로, 연결 전 OWNER는 Settings로 간다 — EDITOR는 이동하지 않는다", async () => {
  expect(() => ProjectNotReady({ slug: "acme", role: "OWNER", readiness: "awaiting_first_sync" })).toThrow("redirect:/projects/acme/sources");
  expect(() => ProjectNotReady({ slug: "acme", role: "OWNER", readiness: "setup" })).toThrow("redirect:/projects/acme/settings");
  nav.redirect.mockClear();
  await render(<ProjectNotReady slug="acme" role="EDITOR" readiness="awaiting_first_sync" />);
  expect(nav.redirect).not.toHaveBeenCalled();
});

it("첫 적재 실패 문구가 Settings를 가리키지 않는다 — 재시도는 Sources에 있다", () => {
  const text = onboardErrorMessage(en, "ingest-failed");
  expect(text).not.toMatch(/settings/i);
  expect(text).toContain("Sources");
});

/** 🔴 A2 — 일부만 반영된 표면의 항목은 "읽지 못했다·키가 안 들어왔다"를 말하지 않는다(데이터는 들어갔다). */
it("partial-import 항목은 Partially synced 문장이고 실패 문장을 빌리지 않는다", async () => {
  const partial = { ...failed, reason: "partial-import" as const };
  const { container } = await render(<AttentionCard items={{ shown: [partial], more: [], count: 1 }} slug="acme" role="OWNER" state="default" now={now} />);
  expect(container.textContent).toContain(`${en.home.attention.partial.body}${en.home.attention.partial.tail}`);
  expect(container.textContent).not.toContain(en.home.attention.importFailed.body);
  expect(container.textContent).not.toMatch(/didn['’]t come in|couldn['’]t read/);
});

/**
 * fix1 🔴1 — 실패 항목의 시각 칸이 비어도 "Not synced yet"을 말하지 않는다(옆 문장이 "the last sync couldn't read"다).
 * ux-drift-unify T18 — "Never"도 거짓이다(실패는 일어났고 시각만 기록되지 않았다). 시각 칸을 비운다.
 */
it("실패 항목의 시각이 없으면 시각 칸이 비어 있다", async () => {
  const { container } = await render(<AttentionCard items={{ shown: [{ ...failed, at: null }], more: [], count: 1 }} slug="acme" role="OWNER" state="default" now={now} />);
  expect(container.textContent).not.toMatch(/not synced yet/i);
  expect(container.textContent).not.toContain(en.home.meta.never);
  expect(container.querySelector("a > span.shrink-0.text-xs")).toBeNull();
});
