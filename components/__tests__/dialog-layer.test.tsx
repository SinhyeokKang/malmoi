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
