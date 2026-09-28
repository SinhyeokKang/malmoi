import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GITHUB_RELEASES_API_URL } from "@/lib/links";

import { loadReleases } from "../load";
import { V1_0_0, V1_0_1 } from "./fixtures";

/**
 * GitHub Releases를 **토큰 없이** 부른다 (design "데이터 소스"). 성공 응답만 1시간 데이터 캐시에 남고(Next는 200만
 * 저장한다), 실패는 던지지 않고 `{ ok: false }`다 — 공개 페이지가 GitHub 장애로 에러 경계에 가지 않는다.
 *
 * ⚠️ `credential-separation.test.ts`는 이 경로를 보지 않는다 — "Authorization 없음"을 지키는 것은 여기다.
 */

const fetchMock = vi.fn();
let warns: unknown[][];

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  warns = [];
  vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    warns.push(args);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type NextInit = RequestInit & { next?: { revalidate?: number } };

function lastRequest(): { url: string; init: NextInit } {
  const call = fetchMock.mock.calls.at(-1) as [string, NextInit];
  return { url: call[0], init: call[1] };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("loadReleases — 요청 모양", () => {
  it("한 요청 상한으로 부르고 성공만 1시간 재검증한다", async () => {
    fetchMock.mockResolvedValueOnce(json([V1_0_1]));
    await loadReleases();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastRequest().url).toBe(`${GITHUB_RELEASES_API_URL}?per_page=100`);
    expect(lastRequest().init.next).toEqual({ revalidate: 3600 });
  });

  it("GitHub API 헤더를 싣고 Authorization은 없다", async () => {
    fetchMock.mockResolvedValueOnce(json([]));
    await loadReleases();
    const headers = new Headers(lastRequest().init.headers);
    expect(headers.get("accept")).toBe("application/vnd.github+json");
    expect(headers.get("x-github-api-version")).toBe("2022-11-28");
    expect(headers.get("user-agent")).toBeTruthy();
    expect(headers.has("authorization")).toBe(false);
  });

  it("3초 타임아웃을 건다", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    fetchMock.mockResolvedValueOnce(json([]));
    await loadReleases();
    expect(timeout).toHaveBeenCalledWith(3000);
    expect(lastRequest().init.signal).toBe(timeout.mock.results[0]?.value);
  });
});

describe("loadReleases — 결과", () => {
  it("성공이면 파싱한 목록이다", async () => {
    fetchMock.mockResolvedValueOnce(json([V1_0_0, V1_0_1]));
    const result = await loadReleases();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.releases.map((r) => r.tag)).toEqual(["v1.0.1", "v1.0.0"]);
    expect(result.truncated).toBe(false);
    expect(warns).toEqual([]);
  });

  it("빈 목록도 성공이다", async () => {
    fetchMock.mockResolvedValueOnce(json([]));
    expect(await loadReleases()).toEqual({ ok: true, releases: [], truncated: false });
  });

  it.each([
    ["403 한도", () => json({ message: "API rate limit exceeded for 1.2.3.4" }, 403, { "x-ratelimit-remaining": "0" })],
    ["502", () => json({ message: "Bad Gateway" }, 502)],
    ["스키마 불일치", () => json({ message: "not an array" })],
    ["JSON이 아님", () => new Response("<html>oops</html>", { status: 200 })],
  ])("%s → { ok: false }, 던지지 않는다", async (_, response) => {
    fetchMock.mockResolvedValueOnce(response());
    await expect(loadReleases()).resolves.toEqual({ ok: false });
  });

  it.each([
    ["네트워크 오류", new TypeError("fetch failed")],
    ["타임아웃", new DOMException("The operation was aborted due to timeout", "TimeoutError")],
  ])("%s → { ok: false }, 던지지 않는다", async (_, error) => {
    fetchMock.mockRejectedValueOnce(error);
    await expect(loadReleases()).resolves.toEqual({ ok: false });
  });
});

describe("loadReleases — 로그", () => {
  it("실패는 warn 한 줄이고 status와 남은 한도만 싣는다 — 본문은 없다", async () => {
    fetchMock.mockResolvedValueOnce(json({ message: "API rate limit exceeded for 1.2.3.4" }, 403, { "x-ratelimit-remaining": "0" }));
    await loadReleases();
    expect(warns).toHaveLength(1);
    const text = JSON.stringify(warns[0]);
    expect(text).toContain("403");
    expect(text).toContain('"rateLimitRemaining":"0"');
    expect(text).not.toContain("rate limit exceeded");
    expect(text).not.toContain("1.2.3.4");
  });

  it("던진 요청의 오류 메시지도 싣지 않는다", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("getaddrinfo ENOTFOUND api.github.com secret-detail"));
    await loadReleases();
    expect(warns).toHaveLength(1);
    expect(JSON.stringify(warns[0])).not.toContain("secret-detail");
  });
});
