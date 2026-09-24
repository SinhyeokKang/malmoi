import { beforeEach, expect, it, vi } from "vitest";

import { hashPushToken } from "@/lib/push/token";

/**
 * **CI 파싱 실패의 유일한 수신구** (`POST /api/push/failure` — PRODUCT §7.8).
 * 외부 진입점이라 Route Handler다.
 *
 * 이 파일이 지키는 것 넷:
 *
 * 1. **인증이 먼저다** — 토큰이 프로젝트를 정하고, 본문은 그 뒤에 읽는다. `/api/push`와 같은 순서로,
 *    무효 토큰 하나로 스키마 구조(zod `issues`)를 받아 갈 수 없다.
 * 2. **아무것도 적재하지 않는다** — 키·번역·`lastCommitSha`·`lastCommitAt`은 이 경로에서 안 움직인다.
 *    ARCHITECTURE §0 불변식 2의 소유자 규칙을 상태 보고가 건드리면 안 된다.
 * 3. **거부는 조용하지 않다** — 401/400/409가 갈려 CI 로그에서 무엇이 틀렸는지 보인다.
 * 4. **파서 원문이 서버에 안 남는다** — 코드 넷만 받는다.
 */

const TOKEN = "push-token-raw";
const HASH = hashPushToken(TOKEN);

const hoisted = vi.hoisted(() => ({
  project: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  revalidatePath: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ project: hoisted.project, translationSurface: {
  updateMany: hoisted.project.updateMany,
  findFirst: async () => { const project = await hoisted.project.findUnique.mock.results.at(-1)?.value;
    return project ? { ...project, id: "surface-p1", projectId: project.id, slug: "default" } : null; },
} }) }));
vi.mock("next/cache", () => ({ revalidatePath: hoisted.revalidatePath }));

const { POST } = await import("../push/failure/route");

const body = {
  projectSlug: "acme",
  surfaceSlug: "default",
  commitSha: "a".repeat(40),
  commitAt: "2026-09-13T10:00:00+09:00",
  code: "parse-failed",
};

const row = { id: "p1", slug: "acme", archivedAt: null, lastCommitAt: null };

function post(over: { token?: string | null; body?: unknown; raw?: string } = {}) {
  const token = over.token === undefined ? TOKEN : over.token;
  return POST(
    new Request("http://localhost/api/push/failure", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token === null ? {} : { authorization: `Bearer ${token}` }),
      },
      body: over.raw ?? JSON.stringify(over.body ?? body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.project.findUnique.mockResolvedValue(row);
  hoisted.project.updateMany.mockResolvedValue({ count: 1 });
});

it("records the failure against the project the token identifies", async () => {
  const res = await post();
  expect(res.status).toBe(204);
  expect(hoisted.project.findUnique).toHaveBeenCalledWith(
    expect.objectContaining({ where: { pushTokenHash: HASH } }),
  );
  expect(hoisted.project.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({ data: { lastImportError: "parse-failed", lastImportFailedAt: expect.any(Date) } }),
  );
});

/**
 * 목록 둘과 그 설정이 이 값을 읽는다 — 안 지우면 실패가 다음 재검증까지 안 보인다.
 *
 * ⚠️ **Home이 2026-09-15에 늘었다** (project-home T10). 세는 축은 "이 Action이 쓰는 컬럼을 읽는
 * 화면"이 아니라 **"그 컬럼에서 파생되는 판정 함수를 부르는 화면"**이다 — Home이 `failing`의
 * 새 소비자다 (POSTMORTEM 2026-09-09 🔁 2026-09-11).
 */
it("invalidates both list routes, the project settings and home", async () => {
  await post();
  const paths = hoisted.revalidatePath.mock.calls.map((c) => c[0]);
  expect(paths).toEqual(expect.arrayContaining(["/projects", "/projects/new", "/projects/acme/settings", "/projects/acme"]));
});

it.each([
  ["no header", { token: null }],
  ["empty bearer", { token: "   " }],
  ["unknown token", { token: "other" }],
])("answers 401 for %s without reading the body", async (_label, over) => {
  if (_label === "unknown token") hoisted.project.findUnique.mockResolvedValue(null);
  const res = await post(over);
  expect(res.status).toBe(401);
  expect(hoisted.project.updateMany).not.toHaveBeenCalled();
});

it.each([
  ["malformed json", { raw: "{" }],
  ["unknown field", { body: { ...body, detail: "SyntaxError at line 41" } }],
  ["server-only code", { body: { ...body, code: "partial-import" } }],
  ["bad sha", { body: { ...body, commitSha: "abc" } }],
])("answers 400 for %s", async (_label, over) => {
  const res = await post(over);
  expect(res.status).toBe(400);
  expect(hoisted.project.updateMany).not.toHaveBeenCalled();
});

/**
 * **선언된 길이가 상한을 넘으면 읽기 전에 거부한다** (audit #76) — 전에는 `text()`로 다 읽은 뒤에 쟀다.
 * 본문 자체는 정상 보고라, 선언을 안 봤다면 204가 났을 것이다(짝 단언: 아래 첫 테스트가 같은 본문으로 204).
 */
it("answers 400 for a declared oversized body without reading it", async () => {
  const res = await POST(
    new Request("http://localhost/api/push/failure", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}`, "content-length": "4097" },
      body: JSON.stringify(body),
    }),
  );
  expect(res.status).toBe(400);
  await expect(res.json()).resolves.toEqual({ error: "body too large" });
  expect(hoisted.project.updateMany).not.toHaveBeenCalled();
});

/** 4 KiB를 넘는 본문은 거부한다 — 보고에 그만한 정보가 들어갈 이유가 없다. */
it("answers 400 for an oversized body", async () => {
  const res = await post({ raw: JSON.stringify({ ...body, projectSlug: "a".repeat(5000) }) });
  expect(res.status).toBe(400);
  expect(hoisted.project.updateMany).not.toHaveBeenCalled();
});

it.each([
  ["misrouted report", { body: { ...body, projectSlug: "other" } }, {}],
  ["archived project", {}, { archivedAt: new Date("2026-09-01T00:00:00Z") }],
  ["stale commit", {}, { lastCommitAt: new Date("2026-09-14T00:00:00Z") }],
])("answers 409 for %s and writes nothing", async (_label, over, patch) => {
  hoisted.project.findUnique.mockResolvedValue({ ...row, ...patch });
  const res = await post(over);
  expect(res.status).toBe(409);
  expect(hoisted.project.updateMany).not.toHaveBeenCalled();
});

/**
 * ⚠️ **같은 커밋의 재실행 실패는 받는다** — `checkCommitOrder`가 동일 시각을 통과시키는 것과 같은
 * 규칙이고, 스캐너를 고쳐 다시 돌린 실행이 조용히 사라지면 안 된다.
 */
it("accepts a failure for the commit that was already imported", async () => {
  hoisted.project.findUnique.mockResolvedValue({ ...row, lastCommitAt: new Date(body.commitAt) });
  expect((await post()).status).toBe(204);
});

/** 조건부 UPDATE가 0건이면 그 사이에 상태가 바뀐 것이다 — 성공으로 답하지 않는다. */
it("answers 409 when the conditional update matched nothing", async () => {
  hoisted.project.updateMany.mockResolvedValue({ count: 0 });
  expect((await post()).status).toBe(409);
});

it("answers 500 with a reference, never the database message", async () => {
  hoisted.project.findUnique.mockRejectedValue(new Error("pooler host secret"));
  const res = await post();
  expect(res.status).toBe(500);
  expect(JSON.stringify(await res.json())).not.toContain("pooler host secret");
});
