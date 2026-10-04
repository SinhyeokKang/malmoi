import { expect, it } from "vitest";

import { hueFill } from "@/components/ui/tone";

/** 색상 맵이 바뀌면 기존 타일의 색이 달라진다 — 개명에서도 클래스는 그대로다. */
it.each([
  ["user-0", "bg-hue-orange"], ["user-1", "bg-hue-rose"],
  ["user-2", "bg-hue-emerald"], ["user-3", "bg-hue-amber"],
  ["user-4", "bg-hue-sky"], ["user-5", "bg-hue-teal"],
  ["user-6", "bg-hue-fuchsia"], ["user-7", "bg-hue-indigo"],
  ["", "bg-hue-sky"], ["  Acme  ", "bg-hue-fuchsia"],
])("%s keeps its exact filled hue class", (name, expected) => {
  expect(hueFill(name)).toBe(expected);
});
