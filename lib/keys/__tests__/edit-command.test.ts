import { describe, expect, it } from "vitest";
import { editCommand } from "../edit-command";

describe("translation cell edit commands", () => {
  it("saves on Enter and restores on Escape", () => {
    expect(editCommand({ key: "Enter" })).toBe("save");
    expect(editCommand({ key: "Escape" })).toBe("restore");
  });
  it("leaves newline, Tab and cursor movement to the textarea", () => {
    expect(editCommand({ key: "Enter", shiftKey: true })).toBe(null);
    for (const key of ["Tab", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "a"]) {
      expect(editCommand({ key })).toBe(null);
    }
  });
  it.each(["Enter", "Escape"])("does not intercept %s while composing", (key) => {
    expect(editCommand({ key, isComposing: true })).toBe(null);
    // Some browsers end composition before dispatching its final Enter.
    expect(editCommand({ key, keyCode: 229 })).toBe(null);
  });
});
