// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { input, render } from "./helpers/dom";

/**
 * B5의 이름·사유·live 영역 (audit #33·#37~#42). 규칙 하나다: **꺼진 컨트롤은 포커스를 받고 사유를 `aria-describedby`로
 * 든다**(DESIGN §6.65) · **보이는 문장만 뜻을 지는 자리는 없다**(`title`·색) · **결과는 전부터 있던 live 영역에 쓴다**.
 */
const mocks = vi.hoisted(() => ({
  run: vi.fn(), pr: vi.fn(), prepare: vi.fn(), refresh: vi.fn(),
  updateProjectName: vi.fn(), updateRepositorySettings: vi.fn(), listProjectBranches: vi.fn(), updateProfileName: vi.fn(),
  unlinkLoginMethod: vi.fn(), startLoginMethodConnect: vi.fn(),
}));
vi.mock("@/app/(edit)/projects/actions", () => ({ runRepositoryImport: mocks.run, checkOpenPullRequest: mocks.pr, prepareRepositorySync: mocks.prepare, listProjectBranches: mocks.listProjectBranches, rotatePushToken: vi.fn() }));
vi.mock("@/app/(edit)/projects/[slug]/settings/actions", () => ({ updateProjectName: mocks.updateProjectName, uploadProjectImage: vi.fn(), deleteProjectImage: vi.fn(), updateRepositorySettings: mocks.updateRepositorySettings }));
vi.mock("@/app/(edit)/account/actions", () => ({ updateProfileName: mocks.updateProfileName, unlinkLoginMethod: mocks.unlinkLoginMethod, startLoginMethodConnect: mocks.startLoginMethodConnect }));
vi.mock("@/app/(edit)/actions", () => ({ triggerPullAction: vi.fn() }));
vi.mock("@/app/(edit)/publish-actions", () => ({ loadPublishPreview: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams(window.location.search) }));

import { CopyButton } from "@/components/ui/copy-button";
import { LoginMethods } from "@/components/account/login-methods";
import { ProfileNameForm } from "@/components/account/profile-name-form";
import { HomeActions, HomeHeaderActions } from "@/components/home/actions";
import { CiCard } from "@/components/settings/ci-card";
import { GeneralCard } from "@/components/settings/general-card";
import { SourceStatus } from "@/components/sources/source-status";
import { SurfaceSelector } from "@/components/surface-selector";
import { en } from "@/messages/en";
import { formatMinute } from "@/lib/date-format";

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
    // 사유 줄은 호스트가 세운다(responsive-app F7) — 버튼 혼자서는 문장을 들지 않는다.
    await render(<HomeActions slug="acme" writeLock={null}><HomeHeaderActions slug="acme" name="acme" branch="main" role="OWNER" unsent={0} paused /></HomeActions>);
    const sync = byText(en.repositorySync.action);
    expectReasoned(sync, en.repositorySync.paused);
    await act(async () => { await userEvent.setup().click(sync); });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  // 결과의 [Try again]은 sync-lock S5로 Sync Dialog 안에 섰다 — Publish와 같이 돌 수 없어 잠금 갈래가 사라졌다.

  it("Home 실패 배너의 [Try again]도 같은 형이다", () => {
    const source = read("components/home/actions.tsx");
    expect(source).not.toMatch(/<Button disabled=\{publishPending\}/);
    // 잠금 사유가 둘이다(Publish 진행 · 착지 lease — sync-lock R5). 하나의 `retryBlock`이 aria-disabled·describedby를 함께 든다.
    // 사유는 머리 사유 줄의 같은 줄이다(responsive-app O19) — 배너 안 `title`·sr-only가 없다(`home-actions.test.tsx`가 DOM으로 잰다).
    expect(source).toMatch(/aria-disabled=\{retryBlock !== null/);
    expect(source).toContain("aria-describedby={retryBlock !== null ? disabledReasonId(reasonScope, retryBlock) : undefined}");
    expect(source).toContain("m.repositorySync.waitPublish");
    expect(source).toContain("m.repositorySync.running");
  });

  it("마지막 로그인 수단의 [Disconnect]는 포커스를 받고 사유를 든다", async () => {
    await render(<LoginMethods rows={[{ provider: "github", connected: true }, { provider: "google", connected: false }]} />);
    const disconnect = document.querySelector<HTMLElement>(`[aria-label="${en.link.methods.disconnectLabel("GitHub")}"]`)!;
    expectReasoned(disconnect, en.link.methods.lastMethod);
    await act(async () => { await userEvent.setup().click(disconnect); });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("보관·소스 없음의 워크플로 행은 포커스를 받고 사유를 든다 — 짝: 둘 다 아니면 켜진다", async () => {
    const view = await render(<CiCard slug="acme" archived stale={[]}>{"yaml"}</CiCard>);
    const row = () => [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.includes(en.settings.ci.workflow))!;
    expectReasoned(row(), en.settings.archivedReason);
    await view.rerender(<CiCard slug="acme" archived={false} stale={[]}>{false}</CiCard>);
    expectReasoned(row(), en.settings.ci.noSources);
    await view.rerender(<CiCard slug="acme" archived={false} stale={[]}>{"yaml"}</CiCard>);
    expect(row().getAttribute("aria-disabled")).toBeNull();
  });

  it("Add sources의 확정·수동 확인 버튼은 aria-disabled로 사유에 닿는다", () => {
    const source = read("components/sources/add-sources-modal.tsx");
    expect(source).not.toMatch(/disabled=\{detecting \|\|/);
    expect(source).not.toMatch(/disabled=\{!manual\.pathTemplate/);
    expect(source).toContain("m.settings.sources.manualReason");
    // ⚠️ `loading`과 `aria-disabled`를 한 버튼에 겸하지 않는다 (DESIGN §6.65) — 진행 중은 `busy`다 (B5 리뷰 r1).
    expect(source).not.toMatch(/loading=\{pending\}[^>]*aria-disabled=/);
    // 스피너는 누른 쪽에만 선다 (audit-ux #26) — 둘 다 `busy`이되 갈래를 가른다.
    expect(source.match(/busy=\{pending && operation === "(add|manual)"\}/g) ?? []).toHaveLength(2);
    expect(source).not.toMatch(/busy=\{pending\}/);
    // ①의 [Next]도 같은 계약이다 — `WizardFooter`의 aria 갈래(`nextBlocked`)이고 진짜 `disabled`·`loading` 갈래(`nextDisabled`)가 아니다.
    expect(source).toMatch(/nextBlocked=\{stepReason !== null/);
    expect(source).not.toMatch(/nextDisabled=/);
  });

  it("보이는 사람에게도 사유가 보인다 — 워크플로 행·수동 확인·머리의 Sync·Publish·배너의 Try again은 글자로", async () => {
    await render(<CiCard slug="acme" archived={false} stale={[]}>{false}</CiCard>);
    const reason = [...document.querySelectorAll("p, span")].find(node => node.textContent === en.settings.ci.noSources);
    expect(reason?.classList.contains("sr-only")).toBe(false);
    expect(read("components/sources/add-sources-modal.tsx")).not.toMatch(/className="sr-only">\{m\.settings\.sources\.manualReason/);
    // 머리의 Sync·Publish 사유는 버튼 아래 보이는 줄이다(responsive-app F7 — 모든 폭). 버튼은 `title`·sr-only를 들지 않고 호스트가 줄을 세운다.
    // 기본값은 `paused`, Publish 진행이면 `waitPublish`다 — 호스트가 원인을 고른다(audit-ux #10).
    for (const button of ["components/home/sync-button.tsx", "components/publish-button.tsx"]) {
      expect(read(button)).not.toMatch(/title=\{(?:pausedText|plan\.hint)/);
      expect(read(button)).not.toMatch(/className="sr-only">\{(?:pausedText|plan\.hint)\}/);
    }
    for (const host of ["components/home/actions.tsx", "components/translations/workspace/workspace.tsx"]) {
      expect(read(host)).toContain("<DisabledReasons reasons=");
      expect(read(host)).toContain("m.repositorySync.waitPublish");
    }
    expect(read("components/home/actions.tsx")).toContain("pausedReason ?? m.repositorySync.paused");
    // 결과의 [Try again]은 Sync Dialog 안이라 Publish가 같이 돌 수 없다 — 잠금 사유를 들지 않는다(sync-lock S5). 배너의 [Try again]은 머리 줄을 가리킨다(O19).
    expect(read("components/home/actions.tsx")).not.toMatch(/title=\{retryBlock/);
    expect(read("components/home/actions.tsx")).not.toMatch(/className="sr-only">\{retryBlock\}/);
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
    await act(async () => { await userEvent.setup().click(byText(en.settings.repository.fields.save)); });
    expect(container.querySelector('[data-save-status="project-name"]')).toBe(region);
    expect(region?.textContent).toContain(en.settings.repository.fields.saved);
  });

  it("Base branch · 표시 이름 저장도 같은 형이다", async () => {
    expect(read("components/settings/repository-form.tsx")).toMatch(/role="status"[^>]*data-save-status="base-branch"|data-save-status="base-branch"[^>]*role="status"/);
    mocks.updateProfileName.mockResolvedValue({ ok: true, name: "Jane" });
    const { container } = await render(<ProfileNameForm name="J" inputId="profile-name" />);
    const region = container.querySelector('[role="status"]');
    expect(region?.textContent).toBe("");
    await input(container.querySelector<HTMLInputElement>("#profile-name")!, "Jane");
    await act(async () => { await userEvent.setup().click(byText(en.account.profile.save)); });
    expect(container.querySelector('[role="status"]')).toBe(region);
    expect(region?.textContent).toContain(en.account.profile.saved);
  });

  it("CopyLink의 접근 이름이 보이는 Copied를 덮지 않는다 (WCAG 2.5.3)", async () => {
    const user = userEvent.setup();
    const { container } = await render(<CopyButton variant="link" value="https://example.com/fixture" label={en.translations.workspace.detail.copyLink} />);
    const button = container.querySelector("button")!;
    expect(button.getAttribute("aria-label")).toBe(en.translations.workspace.detail.copyLink);
    await act(async () => { await user.click(button); });
    expect(button.textContent).toBe(en.common.copied);
    expect(button.hasAttribute("aria-label")).toBe(false);
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
    const { container } = await render(<SourceStatus now={new Date("2026-09-24T03:09:00Z")} source={{ lastCommitSha: null, lastImportStartedAt: at, lastImportError: null, lastImportFailedAt: null, lastImportedAt: null }} />);
    const time = container.querySelector("time");
    expect(time?.getAttribute("dateTime")).toBe(at.toISOString());
    expect(time?.getAttribute("aria-label")).toBe(formatMinute(at, { uiLocale: "en", timeZone: "UTC" }));
  });

  it("좁은 폭에서도 언어 행의 검토·누락 표시가 숨지 않는다 — Meter는 aria-hidden이라 색만 남는다", () => {
    const source = read("components/sources/source-detail-modal.tsx");
    expect(source).not.toMatch(/min-w-0 flex-1 text-xs @max-form:hidden/);
  });
});
