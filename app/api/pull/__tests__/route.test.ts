import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { en } from "@/messages/en";

/**
 * **cron 응답 JSON은 writer 경고를 영어 문장으로 싣는다** (ui-locales B1′ · R1 🟡5). 실행은 경고를 코드로 싣고, 라우트가 내보내기 직전에
 * en으로 조립한다 — 결과 모양이 바뀌어(중첩 등) 조립이 빗나가면 소스 검사로는 못 보므로 GET을 실제로 지난다.
 */
const h = vi.hoisted(() => ({ runNightly: vi.fn() }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ project: { findMany: async () => [{ id: "p1", slug: "acme" }] } }) }));
vi.mock("@/lib/nightly/run", () => ({ runNightly: h.runNightly }));
vi.mock("@/lib/pull/targets", async (orig) => ({ ...(await orig<object>()), selectPullTargets: () => ({ targets: ["acme"], unprocessed: 0 }) }));

const { GET } = await import("../route");

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "cron-secret");
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("publish 방문의 writer 경고가 `표면: 파일: 문장` 영어 문장으로 나간다", async () => {
  h.runNightly.mockResolvedValue({ action: "publish", status: "skipped", reason: "writer-warnings", warnings: [
    { surfaceSlug: "web", path: "i18n/ko.json", code: "value-not-string", key: "a.b" },
  ] });
  const response = await GET(new Request("https://mal-moi.com/api/pull", { headers: { authorization: "Bearer cron-secret" } }));
  expect(response.status).toBe(200);
  const body = (await response.json()) as { results: { slug: string; warnings?: unknown[] }[] };
  expect(body.results[0]).toMatchObject({ slug: "acme", action: "publish", reason: "writer-warnings" });
  expect(body.results[0]?.warnings).toEqual([`web: i18n/ko.json: a.b — ${en.adapterErrors["value-not-string"]}`]);
});
