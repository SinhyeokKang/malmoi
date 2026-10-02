import { StatusBadge } from "@/components/ui/status-badge";
import { IconTile } from "@/components/ui/icon-tile";
import { ListRow } from "@/components/ui/list-row";
// @vitest-environment jsdom
import { expect, it } from "vitest";
import { PanelFacts } from "@/components/ui/panel-card";
import { Card, CardRows } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { FormGroup } from "@/components/ui/form-group";
import { render } from "./helpers/dom";

it("제목 유무에 따라 접근 이름과 헤더를 함께 제공한다", async () => {
  const { container } = await render(<><Card title="General"><PanelFacts>Facts</PanelFacts></Card><Card><p>Locales</p></Card></>);
  const [named, unnamed] = [...container.querySelectorAll("section")];
  expect(named?.getAttribute("aria-labelledby")).toBe(named?.querySelector("h2")?.id);
  expect(unnamed?.hasAttribute("aria-labelledby")).toBe(false);
  expect(unnamed?.querySelector("h2, header")).toBeNull();
});
it("승격한 행은 제목·상태·설명·동작을 유지한다", async () => {
  const { container } = await render(<Card title="Connections"><CardRows><ListRow as="li" className="border-border border-t first:border-t-0" icon={<IconTile>{<span>G</span>}</IconTile>} title={<span className="flex min-w-0 items-center gap-2 text-base"><span className="truncate font-medium">{"GitHub"}</span><StatusBadge state={"connected"} className="shrink-0" /></span>} description={"Account"} actions={<button>Manage</button>} /></CardRows></Card>);
  expect(container.querySelectorAll("ul > li")).toHaveLength(1);
  // 상태는 이름 옆 배지다(2026-09-30 사용자 — 옛 `이름 — 상태`).
  expect(container.querySelector("li .rounded-full")?.textContent).toBe("Connected");
  expect(container.querySelector("button")?.textContent).toBe("Manage");
});
it("inset과 페이지 경고의 역할은 같고 카드 경고만 radius를 없앤다", async () => {
  const { container } = await render(<><Alert variant="danger">Page failure</Alert><Card title="Repository"><Alert variant="danger" inset>Connection failure</Alert></Card></>);
  const [page, inset] = [...container.querySelectorAll('[role="alert"]')];
  expect(page?.className).toContain("rounded-lg");
  expect(inset?.className).toContain("rounded-none");
  expect(inset?.className).not.toMatch(/(?:^|\s)border/);
});
it("오류 ID는 재렌더에도 유지되고 필드 설명과 장식 아이콘을 연결한다", async () => {
  const form = (error: string) => <FormGroup label="Name" htmlFor="name" error={error}>{(describe) => <input id="name" aria-invalid aria-describedby={describe()} />}</FormGroup>;
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
 * **머리 아래 선은 카드가 긋는다 — notice가 있으면 notice 아래 한 줄** (DESIGN §6.4 Card · 2026-10-01 ux-drift-unify T14 · 4-Y1).
 * 전엔 notice가 있으면 머리가 선을 내려놓고 자식(`<Divider/>`·첫 행 `border-t`)이 대신 그었다 — 자식마다 판단이 달라 선이 둘이거나
 * 0인 카드가 섞였다. 이제 선의 자리는 프리미티브가 고른다: notice가 없으면 머리, 있으면 notice 래퍼(`[data-card-notice]`).
 */
const lined = (node: Element | null | undefined) => (node?.className ?? "").split(" ").includes("border-b");

it("제목만 있으면 머리가 아래 선 하나를 든다", async () => {
  const { container } = await render(<Card title="General"><p>Body</p></Card>);
  expect(lined(container.querySelector("section > header"))).toBe(true);
  expect(container.querySelector("[data-card-notice]")).toBeNull();
});

it("notice가 있으면 선은 notice 아래다 — 머리와 notice 사이엔 선이 없다", async () => {
  const { container } = await render(<Card title="Repository" notice={<Alert variant="danger" inset>Refused</Alert>}><p>Body</p></Card>);
  expect(lined(container.querySelector("section > header"))).toBe(false);
  const notice = container.querySelector("section > [data-card-notice]");
  expect(lined(notice)).toBe(true);
  expect(notice?.previousElementSibling?.tagName).toBe("HEADER");
  // 본문은 선 아래에 선다.
  expect(notice?.nextElementSibling?.textContent).toBe("Body");
});

it("비어 도착하는 notice(Suspense 등)도 선이 하나다", async () => {
  const { container } = await render(<Card title="Repository" notice={null}><p>Body</p></Card>);
  expect(lined(container.querySelector("section > header"))).toBe(false);
  expect(lined(container.querySelector("section > [data-card-notice]"))).toBe(true);
});

/** 카드 제목에 손 자간이 없다 — Card·Home 카드와 한 벌이다(4-W1). */
it("카드 제목이 자간을 손으로 들지 않는다", async () => {
  const { container } = await render(<Card title="General"><p>Body</p></Card>);
  expect(container.querySelector("h2")?.className).not.toContain("tracking-");
});

it.each([undefined, null, false, <></>, "Details"])("description header preserves its defined-slot right-aligned box (%s)", async (description) => {
  const { container } = await render(<Card title="Title" badge={<span>Badge</span>} description={description}><p>Body</p></Card>);
  const header = container.querySelector("header")!;
  const slot = header.querySelector("div");
  expect(slot === null).toBe(description === undefined);
  if (slot) {
    expect(slot.className).toBe("text-muted-foreground ml-auto @max-form:ml-0 @max-form:w-full text-xs");
    expect(header.lastElementChild).toBe(slot);
  }
});

it.each([undefined, null, false, <></>, <button>Manage</button>])("row description/actions keep slot order and undefined wrapper boundary (%s)", async (slot) => {
  const { container } = await render(<CardRows><ListRow as="li" className="border-border border-t first:border-t-0" icon={<IconTile>{<svg aria-hidden className="size-4" />}</IconTile>} title={<span className="flex min-w-0 items-center gap-2 text-base"><span className="truncate font-medium">{"Account"}</span><StatusBadge state={"connected"} className="shrink-0" /></span>} description={slot} actions={slot} /></CardRows>);
  const row = container.querySelector("li")!;
  const copy = row.children[1]!;
  expect(row.children).toHaveLength(slot === undefined ? 2 : 3);
  expect(copy.children).toHaveLength(slot === undefined ? 1 : 2);
  expect(row.firstElementChild?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  expect(row.firstElementChild?.querySelector("svg")?.classList.contains("size-4")).toBe(true);
  if (slot !== undefined) {
    expect(copy.lastElementChild?.className).toBe("text-muted-foreground text-xs leading-normal");
    expect(row.lastElementChild?.className).toBe("flex shrink-0 items-center gap-2");
  }
});
