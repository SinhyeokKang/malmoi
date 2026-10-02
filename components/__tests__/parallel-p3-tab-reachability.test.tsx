// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { expect, it, vi } from "vitest";
import { TokenGrantFields, initialGrantFields } from "@/components/mcp/token-grant-fields";
import { m } from "@/lib/i18n";
import { render, find } from "./helpers/dom";

it("Tab reaches the unavailable scope reason while Space and Enter never change grants", async () => {
  const change = vi.fn();
  const value = initialGrantFields({ grants: [], scope: "all", projectIds: [] }, []);
  const { container } = await render(<TokenGrantFields value={value} onChange={change} projects={[]} disabled={false} />);
  const unavailable = find<HTMLButtonElement>(container, '[data-scope="projects"]');
  const user = userEvent.setup();
  let reached = false;
  for (let step = 0; step < 12; step++) {
    await act(async () => { await user.tab(); });
    if (document.activeElement === unavailable) { reached = true; break; }
  }
  expect(reached).toBe(true);
  expect(unavailable.getAttribute("aria-disabled")).toBe("true");
  expect(unavailable.disabled).toBe(false);
  expect(document.getElementById(unavailable.getAttribute("aria-describedby")!)?.textContent).toBe(m.mcpConnector.form.noMembership);
  await act(async () => { await user.keyboard(" {Enter}"); });
  expect(change).not.toHaveBeenCalled();
  expect(unavailable.getAttribute("aria-checked")).toBe("false");
});
