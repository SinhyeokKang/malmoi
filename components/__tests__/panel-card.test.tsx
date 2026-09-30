// @vitest-environment jsdom
import { expect, it } from "vitest";
import { PanelCard, PanelFacts, PanelRow, PanelRows } from "@/components/ui/panel-card";
import { Alert } from "@/components/ui/alert";
import { FormGroup } from "@/components/ui/form-group";
import { render } from "./helpers/dom";

it("제목 유무에 따라 접근 이름과 헤더를 함께 제공한다", async () => {
  const { container } = await render(<><PanelCard title="General"><PanelFacts>Facts</PanelFacts></PanelCard><PanelCard><p>Locales</p></PanelCard></>);
  const [named, unnamed] = [...container.querySelectorAll("section")];
  expect(named?.getAttribute("aria-labelledby")).toBe(named?.querySelector("h2")?.id);
  expect(unnamed?.hasAttribute("aria-labelledby")).toBe(false);
  expect(unnamed?.querySelector("h2, header")).toBeNull();
});
it("승격한 행은 제목·상태·설명·동작을 유지한다", async () => {
  const { container } = await render(<PanelCard title="Connections"><PanelRows><PanelRow glyph={<span>G</span>} name="GitHub" status="Connected" detail="Account"><button>Manage</button></PanelRow></PanelRows></PanelCard>);
  expect(container.querySelectorAll("ul > li")).toHaveLength(1);
  // 상태는 이름 옆 배지다(2026-09-30 사용자 — 옛 `이름 — 상태`).
  expect(container.querySelector("li .rounded-full")?.textContent).toBe("Connected");
  expect(container.querySelector("button")?.textContent).toBe("Manage");
});
it("inset과 페이지 경고의 역할은 같고 카드 경고만 radius를 없앤다", async () => {
  const { container } = await render(<><Alert variant="danger">Page failure</Alert><PanelCard title="Repository"><Alert variant="danger" inset>Connection failure</Alert></PanelCard></>);
  const [page, inset] = [...container.querySelectorAll('[role="alert"]')];
  expect(page?.className).toContain("rounded-lg");
  expect(inset?.className).toContain("rounded-none");
  expect(inset?.className).not.toMatch(/(?:^|\s)border/);
});
it("오류 ID는 재렌더에도 유지되고 필드 설명과 장식 아이콘을 연결한다", async () => {
  const form = (error: string) => <FormGroup label="Name" htmlFor="name" error={error}><input id="name" aria-invalid aria-describedby="name-error" /></FormGroup>;
  const { container, rerender } = await render(form("Required"));
  const error = container.querySelector('[role="alert"]');
  expect(error?.id).toBe("name-error");
  expect(error?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  await rerender(form("Too long"));
  expect(container.querySelector('[role="alert"]')?.id).toBe("name-error");
});

it("파일 선택의 보이는 버튼에 오류 설명과 invalid 상태를 전달한다", async () => {
  const { FileInput } = await import("@/components/ui/file-input");
  const { container } = await render(<><FileInput accept="image/png" onPick={() => {}} aria-describedby="upload-error" aria-invalid>Upload</FileInput><p id="upload-error">Unsupported image</p></>);
  const button = container.querySelector("button");
  expect(button?.getAttribute("aria-describedby")).toBe("upload-error");
  expect(button?.getAttribute("aria-invalid")).toBe("true");
});

/**
 * **머리 아래 선은 카드가 긋는다 — notice가 있으면 notice 아래 한 줄** (DESIGN §6.4 PanelCard · 2026-10-01 ux-drift-unify T14 · 4-Y1).
 * 전엔 notice가 있으면 머리가 선을 내려놓고 자식(`<Divider/>`·첫 행 `border-t`)이 대신 그었다 — 자식마다 판단이 달라 선이 둘이거나
 * 0인 카드가 섞였다. 이제 선의 자리는 프리미티브가 고른다: notice가 없으면 머리, 있으면 notice 래퍼(`[data-card-notice]`).
 */
const lined = (node: Element | null | undefined) => (node?.className ?? "").split(" ").includes("border-b");

it("제목만 있으면 머리가 아래 선 하나를 든다", async () => {
  const { container } = await render(<PanelCard title="General"><p>Body</p></PanelCard>);
  expect(lined(container.querySelector("section > header"))).toBe(true);
  expect(container.querySelector("[data-card-notice]")).toBeNull();
});

it("notice가 있으면 선은 notice 아래다 — 머리와 notice 사이엔 선이 없다", async () => {
  const { container } = await render(<PanelCard title="Repository" notice={<Alert variant="danger" inset>Refused</Alert>}><p>Body</p></PanelCard>);
  expect(lined(container.querySelector("section > header"))).toBe(false);
  const notice = container.querySelector("section > [data-card-notice]");
  expect(lined(notice)).toBe(true);
  expect(notice?.previousElementSibling?.tagName).toBe("HEADER");
  // 본문은 선 아래에 선다.
  expect(notice?.nextElementSibling?.textContent).toBe("Body");
});

it("비어 도착하는 notice(Suspense 등)도 선이 하나다", async () => {
  const { container } = await render(<PanelCard title="Repository" notice={null}><p>Body</p></PanelCard>);
  expect(lined(container.querySelector("section > header"))).toBe(false);
  expect(lined(container.querySelector("section > [data-card-notice]"))).toBe(true);
});

/** 카드 제목에 손 자간이 없다 — RowCard·Home 카드와 한 벌이다(4-W1). */
it("카드 제목이 자간을 손으로 들지 않는다", async () => {
  const { container } = await render(<PanelCard title="General"><p>Body</p></PanelCard>);
  expect(container.querySelector("h2")?.className).not.toContain("tracking-");
});
