// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, useState } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { input, render } from "./helpers/dom";

/**
 * B5의 이름·사유·live 영역 (audit #33·#37~#42). 규칙 하나다: **꺼진 컨트롤은 포커스를 받고 사유를 `aria-describedby`로
 * 든다**(DESIGN §6.65) · **보이는 문장만 뜻을 지는 자리는 없다**(`title`·색) · **결과는 전부터 있던 live 영역에 쓴다**.
 */
const mocks = vi.hoisted(() => ({
  run: vi.fn(), pr: vi.fn(), prepare: vi.fn(), refresh: vi.fn(),
  updateProjectName: vi.fn(), updateRepositorySettings: vi.fn(), listRepoBranches: vi.fn(), updateProfileName: vi.fn(),
  unlinkLoginMethod: vi.fn(), startLoginMethodConnect: vi.fn(),
}));
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: mocks.run, checkOpenPullRequest: mocks.pr, prepareRepositorySync: mocks.prepare, listRepoBranches: mocks.listRepoBranches, rotatePushToken: vi.fn() }));
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({ updateProjectName: mocks.updateProjectName, uploadProjectImage: vi.fn(), deleteProjectImage: vi.fn(), updateRepositorySettings: mocks.updateRepositorySettings }));
vi.mock("@/app/(edit)/account/actions", () => ({ updateProfileName: mocks.updateProfileName, unlinkLoginMethod: mocks.unlinkLoginMethod, startLoginMethodConnect: mocks.startLoginMethodConnect }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn(), replace: vi.fn() }) }));

import { LoginMethods } from "@/components/account/login-methods";
import { ProfileNameForm } from "@/components/account/profile-name-form";
import { SyncButton } from "@/components/home/sync-button";
import { SyncResult } from "@/components/home/sync-result";
import { CiCard } from "@/components/settings/ci-card";
import { GeneralCard } from "@/components/settings/general-card";
import { SourceStatus } from "@/components/sources/source-status";
import { SurfaceSelector } from "@/components/surface-selector";
import { m } from "@/lib/i18n";
import { utcMinute } from "@/lib/utc-time";

beforeEach(() => { for (const fn of Object.values(mocks)) fn.mockReset(); });
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/.*$/gm, "");
const read = (path: string) => strip(readFileSync(join(process.cwd(), path), "utf8"));
const byText = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].filter(b => b.textContent?.trim() === label).at(-1)!;
const description = (node: Element) => (node.getAttribute("aria-describedby") ?? "").split(" ").map(id => document.getElementById(id)?.textContent ?? "").join(" ").trim();

/** 꺼졌는데 포커스를 받는다 — 진짜 `disabled`면 describedby가 닿을 길이 없다. */
function expectReasoned(node: HTMLElement, reason: string) {
  expect(node.hasAttribute("disabled")).toBe(false);
  expect(node.getAttribute("aria-disabled")).toBe("true");
  expect(description(node)).toContain(reason);
}

describe("꺼진 컨트롤의 사유 (#37)", () => {
  it("멈춘 [Sync]는 포커스를 받고 사유를 든다 — 눌러도 확인 창이 열리지 않는다", async () => {
    function Host() { const [open, setOpen] = useState(false); return <SyncButton slug="acme" name="acme" branch="main" role="OWNER" unsent={0} paused open={open} onOpenChange={setOpen} onResult={vi.fn()} />; }
    await render(<Host />);
    const sync = byText(m.repositorySync.action);
    expectReasoned(sync, m.repositorySync.paused);
    await act(async () => { await userEvent.setup().click(sync); });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("Publish가 도는 동안 결과의 [Try again]은 포커스를 받고 사유를 들며 눌러도 아무 일이 없다 — 짝: 풀리면 연다", async () => {
    const onRetry = vi.fn();
    const outcome = { ok: true as const, remainingEdits: 0, surfaces: [{ surfaceSlug: "web", status: "failed" as const, count: 0, failed: 0, reason: "parse-failed" as const, errors: [] }] };
    const view = await render(<SyncResult slug="acme" branch="main" outcome={outcome} onRetry={onRetry} retryDisabled />);
    const retry = byText(m.common.retry);
    expectReasoned(retry, m.repositorySync.waitPublish);
    await act(async () => { await userEvent.setup().click(retry); });
    expect(onRetry).not.toHaveBeenCalled();
    await view.rerender(<SyncResult slug="acme" branch="main" outcome={outcome} onRetry={onRetry} retryDisabled={false} />);
    await act(async () => { await userEvent.setup().click(byText(m.common.retry)); });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("Home 실패 배너의 [Try again]도 같은 형이다", () => {
    const source = read("components/home/actions.tsx");
    expect(source).not.toMatch(/<Button disabled=\{publishPending\}/);
    expect(source).toMatch(/aria-disabled=\{publishPending/);
    expect(source).toContain("m.repositorySync.waitPublish");
  });

  it("마지막 로그인 수단의 [Disconnect]는 포커스를 받고 사유를 든다", async () => {
    await render(<LoginMethods rows={[{ provider: "github", connected: true }, { provider: "google", connected: false }]} />);
    const disconnect = document.querySelector<HTMLElement>(`[aria-label="${m.link.methods.disconnectLabel("GitHub")}"]`)!;
    expectReasoned(disconnect, m.link.methods.lastMethod);
    await act(async () => { await userEvent.setup().click(disconnect); });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("보관·소스 없음의 워크플로 행은 포커스를 받고 사유를 든다 — 짝: 둘 다 아니면 켜진다", async () => {
    const view = await render(<CiCard slug="acme" archived stale={[]}>{"yaml"}</CiCard>);
    const row = () => [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.includes(m.settings.ci.workflow))!;
    expectReasoned(row(), m.settings.archivedReason);
    await view.rerender(<CiCard slug="acme" archived={false} stale={[]}>{false}</CiCard>);
    expectReasoned(row(), m.settings.ci.noSources);
    await view.rerender(<CiCard slug="acme" archived={false} stale={[]}>{"yaml"}</CiCard>);
    expect(row().getAttribute("aria-disabled")).toBeNull();
  });

  it("Add sources의 확정·수동 확인 버튼은 aria-disabled로 사유에 닿는다", () => {
    const source = read("components/sources/add-sources-modal.tsx");
    expect(source).not.toMatch(/disabled=\{detecting \|\|/);
    expect(source).not.toMatch(/disabled=\{!manual\.pathTemplate/);
    expect(source).toContain("m.settings.sources.manualReason");
  });
});

describe("title이 유일한 설명이 아니다 (#38)", () => {
  it("닫힌 소스 선택기의 전체 경로가 description으로 닿는다", async () => {
    const { container } = await render(<SurfaceSelector value="web" pending={false} onChange={() => {}} surfaces={[
      { slug: "web", pathTemplate: "apps/web/locales/{locale}.json", unpublished: 0 },
      { slug: "app", pathTemplate: "apps/app/locales/{locale}.json", unpublished: 0 },
    ]} />);
    expect(description(container.querySelector('[role="combobox"]')!)).toContain("apps/web/locales/{locale}.json");
  });

  it("키 사용처의 커밋 없음·추가 사용처 수가 hover 밖에서도 읽힌다", () => {
    const source = read("components/translations/workspace/locale-panel.tsx");
    expect(source).toMatch(/sr-only[^>]*>\{`?[^<]*w\.noCommit/);
    expect(source).toMatch(/sr-only[^>]*>\{[^<]*w\.referenced\(detail\.refs\.length\)/);
  });
});

describe("성공은 전부터 있던 live 영역에 쓴다 (#39)", () => {
  it("General 이름 저장 성공이 상시 status 영역에 선다", async () => {
    mocks.updateProjectName.mockResolvedValue({ ok: true, name: "Renamed" });
    const { container } = await render(<GeneralCard slug="acme" name="Acme" image={null} archived={false} />);
    const region = container.querySelector('[data-save-status="project-name"]');
    expect(region?.getAttribute("role")).toBe("status");
    expect(region?.textContent).toBe("");
    await input(container.querySelector<HTMLInputElement>("#project-name")!, "Renamed");
    await act(async () => { await userEvent.setup().click(byText(m.settings.repository.fields.save)); });
    expect(container.querySelector('[data-save-status="project-name"]')).toBe(region);
    expect(region?.textContent).toContain(m.settings.repository.fields.saved);
  });

  it("Base branch · 표시 이름 저장도 같은 형이다", async () => {
    expect(read("components/settings/repository-form.tsx")).toMatch(/role="status"[^>]*data-save-status="base-branch"|data-save-status="base-branch"[^>]*role="status"/);
    mocks.updateProfileName.mockResolvedValue({ ok: true, name: "Jane" });
    const { container } = await render(<ProfileNameForm name="J" inputId="profile-name" />);
    const region = container.querySelector('[role="status"]');
    expect(region?.textContent).toBe("");
    await input(container.querySelector<HTMLInputElement>("#profile-name")!, "Jane");
    await act(async () => { await userEvent.setup().click(byText(m.account.profile.save)); });
    expect(container.querySelector('[role="status"]')).toBe(region);
    expect(region?.textContent).toContain(m.account.profile.saved);
  });

  it("CopyLink의 접근 이름이 보이는 Copied를 덮지 않는다 (WCAG 2.5.3)", () => {
    const source = read("components/translations/workspace/locale-panel.tsx");
    expect(source).toMatch(/aria-label=\{state === "copied" \? undefined : w\.copyLink\}/);
  });
});

describe("이름·시각·색 (#33·#40·#41·#42)", () => {
  it("Logs 제목이 딥링크 Dialog의 복귀 대상이 될 수 있다", () => {
    expect(read("components/logs/log-filters.tsx")).toMatch(/<h1 tabIndex=\{-1\}/);
  });

  it("온보딩 ②의 키 표가 래퍼와 같은 이름을 든다", () => {
    expect(read("components/onboarding/steps/files.tsx")).toMatch(/<Table aria-label=\{m\.newProject\.files\.preview\.rows\}/);
  });

  it("가져오는 중의 상대 시각이 time·UTC 접근 이름을 든다", async () => {
    const at = new Date("2026-09-24T03:04:00Z");
    const { container } = await render(<SourceStatus now={new Date("2026-09-24T03:09:00Z")} source={{ lastCommitSha: null, lastImportStartedAt: at, lastImportError: null, lastImportFailedAt: null, lastCommitAt: null }} />);
    const time = container.querySelector("time");
    expect(time?.getAttribute("dateTime")).toBe(at.toISOString());
    expect(time?.getAttribute("aria-label")).toBe(utcMinute(at));
  });

  it("좁은 폭에서도 언어 행의 검토·누락 표시가 숨지 않는다 — Meter는 aria-hidden이라 색만 남는다", () => {
    const source = read("components/sources/source-detail-modal.tsx");
    expect(source).not.toMatch(/min-w-0 flex-1 text-xs @max-\[640px\]:hidden/);
  });
});
