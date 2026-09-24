// @vitest-environment jsdom
import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { render } from "@/components/__tests__/helpers/dom";

import MembersLoading from "../projects/[slug]/members/loading";
import SettingsLoading from "../projects/[slug]/settings/loading";
import SourcesLoading from "../projects/[slug]/sources/loading";
import TranslationsLoading from "../projects/[slug]/surfaces/[surfaceSlug]/translations/loading";

/**
 * **`[slug]` 아래 형제 화면이 각자 골격을 든다** (audit-ux #5 · DESIGN §6.64 로딩 행). 없으면 Home·Logs에서, 또
 * 형제끼리 이동하는 동안 옛 화면이 표시 없이 멈춘다 — 위쪽 경계는 공유 레이아웃보다 위라 다시 서지 않는다.
 *
 * ⚠️ **`loading.tsx`는 테스트가 0이던 자리다** (POSTMORTEM 2026-09-16) — 골격이 실물과 떠내려가도 아무도 모른다.
 * 여기서 세는 것은 **골격 계약**(패널을 안 든다 · 낭독 한 줄 · 나머지는 `aria-hidden`)과 **줄 수**다. 치수 자체는
 * computed style이라 jsdom이 못 본다 — `/runtime-test`가 스로틀로 밟는다.
 */
const ROOT = join(__dirname, "..");
const SCREENS = [
  { name: "members", Loading: MembersLoading },
  { name: "settings", Loading: SettingsLoading },
  { name: "sources", Loading: SourcesLoading },
  { name: "translations", Loading: TranslationsLoading },
] as const;

describe.each(SCREENS)("$name 골격", ({ Loading }) => {
  it("패널을 들지 않는다 — `[slug]/layout.tsx`가 이미 든다", async () => {
    const { container } = await render(<Loading />);
    expect(container.querySelector("main")).toBeNull();
  });

  it("낭독 한 줄 + 나머지는 전부 aria-hidden이다", async () => {
    const { container } = await render(<Loading />);
    const status = container.querySelectorAll('[role="status"]');
    expect(status).toHaveLength(1);
    expect(status[0]?.className).toContain("sr-only");
    expect(status[0]?.textContent?.trim()).not.toBe("");
    const visible = [...container.querySelectorAll(":scope > *, :scope > * > *")].filter(
      (el) => el.getAttribute("role") !== "status" && el.closest('[aria-hidden="true"]') === null && el.querySelector('[role="status"]') === null,
    );
    expect(visible).toEqual([]);
  });
});

describe("줄 수 — 실물의 가장 흔한 모양", () => {
  it("Members: 멤버 행 둘(이름·이메일 두 줄) + 대기 초대의 빈 상태", async () => {
    const { container } = await render(<MembersLoading />);
    const rows = container.querySelectorAll("[data-skeleton-member]");
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.querySelectorAll("[data-skeleton-line]")).toHaveLength(2);
    expect(container.querySelectorAll("[data-skeleton-empty]")).toHaveLength(1);
  });

  it("Settings: 카드 넷 — General · Repository · CI · Archive", async () => {
    const { container } = await render(<SettingsLoading />);
    expect(container.querySelectorAll("[data-skeleton-card]")).toHaveLength(4);
  });

  it("Sources: 소스 행 하나(본문·경로 두 줄)", async () => {
    const { container } = await render(<SourcesLoading />);
    const rows = container.querySelectorAll("[data-skeleton-source]");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.querySelectorAll("[data-skeleton-line]")).toHaveLength(2);
  });

  it("Translations: 세 패널 — 트리 · 키 목록 · 상세", async () => {
    const { container } = await render(<TranslationsLoading />);
    expect(container.querySelector("[data-skeleton-tree]")).not.toBeNull();
    expect(container.querySelector("[data-skeleton-keys]")).not.toBeNull();
    expect(container.querySelector("[data-skeleton-detail]")).not.toBeNull();
    for (const row of container.querySelectorAll("[data-skeleton-key]")) {
      expect(row.querySelectorAll("[data-skeleton-line]")).toHaveLength(2);
    }
  });
});

/**
 * **목록 골격은 `projects/(list)/`에 있다** (audit-ux #21). `projects/`에 바로 두면 그 경계가 `projects`의 자식 키가
 * 바뀔 때(`__PAGE__` → `[slug]`) 다시 서서, 목록 행이나 온보딩 ④에서 프로젝트로 가는 동안 목록 골격이 떴다가
 * 바뀐다 — malmoi#95가 `[slug]/`에서 고친 결함이 한 층 위에 남아 있던 것이다.
 */
describe("목록 경계의 자리", () => {
  it("projects/ 바로 아래에 loading·page가 없고 (list)/에 있다", () => {
    expect(existsSync(join(ROOT, "projects/loading.tsx"))).toBe(false);
    expect(existsSync(join(ROOT, "projects/page.tsx"))).toBe(false);
    expect(existsSync(join(ROOT, "projects/(list)/loading.tsx"))).toBe(true);
    expect(existsSync(join(ROOT, "projects/(list)/page.tsx"))).toBe(true);
  });

  it("형제 화면의 경계는 [slug]/에 하나로 두지 않는다 — 각 세그먼트에 있다 (malmoi#95)", () => {
    expect(existsSync(join(ROOT, "projects/[slug]/loading.tsx"))).toBe(false);
    for (const segment of ["members", "settings", "sources", "surfaces/[surfaceSlug]/translations"]) {
      expect(existsSync(join(ROOT, `projects/[slug]/${segment}/loading.tsx`)), segment).toBe(true);
    }
  });
});
