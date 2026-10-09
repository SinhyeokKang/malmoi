import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { NIGHTLY_PULL } from "../schedule";

/**
 * self-hosted 스케줄러가 hosted Vercel Cron과 **같은 시각·같은 경로**를 부른다 (self-hosting design §6).
 * 한쪽만 바꾸면 두 배포의 야간 pull 시각이 조용히 갈린다.
 */

const VERCEL_JSON = fileURLToPath(new URL("../../../vercel.json", import.meta.url));

function vercelCrons(source: string): { path: string; schedule: string }[] {
  const parsed: unknown = JSON.parse(source);
  if (typeof parsed !== "object" || parsed === null || !("crons" in parsed) || !Array.isArray(parsed.crons)) return [];
  return parsed.crons as { path: string; schedule: string }[];
}

function matches(source: string): boolean {
  return vercelCrons(source).some((cron) => cron.path === NIGHTLY_PULL.path && cron.schedule === NIGHTLY_PULL.schedule);
}

describe("NIGHTLY_PULL == vercel.json crons", () => {
  it("vercel.json에 같은 경로·같은 식의 항목이 있다", () => {
    expect(matches(readFileSync(VERCEL_JSON, "utf8"))).toBe(true);
  });

  it("식이나 경로가 하나만 바뀌어도 red다", () => {
    expect(matches(JSON.stringify({ crons: [{ path: NIGHTLY_PULL.path, schedule: "0 17 * * *" }] }))).toBe(false);
    expect(matches(JSON.stringify({ crons: [{ path: "/api/other", schedule: NIGHTLY_PULL.schedule }] }))).toBe(false);
    expect(matches(JSON.stringify({}))).toBe(false);
  });
});
