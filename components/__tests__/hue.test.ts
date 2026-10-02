import { expect, it } from "vitest";

import { hueFill } from "@/components/ui/tone";

/** 색상 맵이 바뀌면 기존 타일의 색이 달라진다 — 개명에서도 클래스는 그대로다. */
it.each([
  ["user-0", "bg-orange-600"], ["user-1", "bg-rose-600"],
  ["user-2", "bg-emerald-600"], ["user-3", "bg-amber-600"],
  ["user-4", "bg-sky-600"], ["user-5", "bg-teal-600"],
  ["user-6", "bg-fuchsia-600"], ["user-7", "bg-indigo-600"],
  ["", "bg-sky-600"], ["  Acme  ", "bg-fuchsia-600"],
])("%s keeps its exact filled hue class", (name, expected) => {
  expect(hueFill(name)).toBe(expected);
});
