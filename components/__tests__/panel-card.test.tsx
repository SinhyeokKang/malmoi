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
  expect(container.textContent).toContain("GitHub — Connected");
  expect(container.querySelector("button")?.textContent).toBe("Manage");
});
it("inset과 페이지 경고의 역할은 같고 카드 경고만 외곽선을 없앤다", async () => {
  const { container } = await render(<><Alert variant="danger">Page failure</Alert><PanelCard title="Repository"><Alert variant="danger" inset>Connection failure</Alert></PanelCard></>);
  const [page, inset] = [...container.querySelectorAll('[role="alert"]')];
  expect(page?.className).toContain("rounded-lg");
  expect(inset?.className).toContain("rounded-none");
  expect(inset?.className).toContain("border-t");
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
