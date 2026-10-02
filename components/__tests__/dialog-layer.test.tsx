// @vitest-environment jsdom
import { expect, it } from "vitest";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { render, find } from "./helpers/dom";

it("keeps the modal and its backdrop above sticky table headers", async () => {
  await render(<Dialog open><DialogContent title="Invite a translator" description="Enter an email address."><input aria-label="Email" /></DialogContent></Dialog>);
  const dialog = find<HTMLElement>(document.body, '[role="dialog"]');
  const overlay = dialog.previousElementSibling;
  expect(dialog.classList.contains("z-50")).toBe(true);
  expect(overlay?.classList.contains("z-50")).toBe(true);
  expect(dialog.contains(document.activeElement)).toBe(true);
});

// undefined omits the action box; null/false deliberately keep its padding.
it.each([undefined, null, false, <></>, <button data-initial-focus>Cancel</button>])("actions preserves defined-slot body/footer layout (%s)", async (actions) => {
  await render(<Dialog open><DialogContent title="Confirm" description="Description" actions={actions}><p data-body>Body</p></DialogContent></Dialog>);
  const dialog = find<HTMLElement>(document.body, '[role="dialog"]');
  const body = find<HTMLElement>(dialog, '[data-body]').parentElement!;
  const footer = dialog.querySelector("footer");
  expect(body.className).toBe(actions === undefined ? "space-y-2 p-4 text-sm" : "space-y-2 p-4 pb-0 text-xs leading-body");
  expect(footer === null).toBe(actions === undefined);
  if (footer) {
    expect(footer.className).toBe("flex justify-end gap-2 p-4");
    expect(body.nextElementSibling).toBe(footer);
    expect(footer.previousElementSibling).toBe(body);
  }
  expect(dialog.querySelector('[id][class*="leading-body"]')?.textContent).toBe("Description");
  if (footer?.querySelector("button")) expect(document.activeElement).toBe(footer.querySelector("button"));
});

it.each([undefined, null, false])("absent body does not create padding even with actions (%s)", async (children) => {
  await render(<Dialog open><DialogContent title="Confirm" description="Description" actions={<button>Confirm</button>}>{children}</DialogContent></Dialog>);
  const dialog = find<HTMLElement>(document.body, '[role="dialog"]');
  expect(dialog.querySelector(".space-y-2")).toBeNull();
  expect(dialog.lastElementChild?.tagName).toBe("FOOTER");
});
