// @vitest-environment jsdom
import { expect, it } from "vitest";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Radio, RadioGroup } from "@/components/ui/radio";
import { FieldTrigger } from "@/components/ui/field-trigger";
import { render } from "./helpers/dom";

it("every rendered bordered focus target gets one-pixel ring and same-color border", async () => {
  const { container } = await render(<><Input /><Textarea /><Checkbox aria-label="Check fixture" checked /><RadioGroup><Radio value="fixture" label="Fixture" /></RadioGroup><FieldTrigger>Fixture</FieldTrigger></>);
  const targets = [...container.querySelectorAll<HTMLElement>('input,textarea,button')].filter(node => node.classList.contains("border"));
  expect(targets).toHaveLength(5);
  for (const target of targets) for (const token of ["focus-visible:border-ring", "focus-visible:ring-1", "focus-visible:ring-ring", "focus-visible:outline-none"]) expect(target.classList.contains(token), `${target.tagName} lacks ${token}`).toBe(true);
});

it("checked controls explicitly override their foreground border while focused", async () => {
  const { container } = await render(<><Checkbox checked aria-label="Fixture" /><RadioGroup value="fixture"><Radio value="fixture" label="Fixture" /></RadioGroup></>);
  for (const target of container.querySelectorAll<HTMLElement>('button')) {
    expect(target.classList.contains("data-[state=checked]:border-foreground")).toBe(true);
    expect(target.classList.contains("data-[state=checked]:focus-visible:border-ring")).toBe(true);
  }
});

it("default Button and ButtonLink use bordered rings while unbordered variants retain ring two", async () => {
  const { container } = await render(<><Button>Save</Button><ButtonLink href="/fixture">Open</ButtonLink><Button variant="ghost">Ghost</Button><ButtonLink variant="link" href="/fixture">Link</ButtonLink></>);
  for (const node of container.querySelectorAll('button,a')) {
    const bordered = node.classList.contains("border");
    expect(node.classList.contains(bordered ? "focus-visible:ring-1" : "focus-visible:ring-2")).toBe(true);
    expect(node.classList.contains("focus-visible:border-ring")).toBe(bordered);
  }
});
