import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GITHUB_RELEASES_API_URL } from "@/lib/links";

import { loadReleases } from "../load";
import { V1_0_0, V1_0_1 } from "./fixtures";

/** `fullPage`의 어느 항목보다 늦게 발행된 릴리스 — 2페이지에 와도 맨 앞에 서야 한다. */
const V1_0_2 = () => ({ ...V1_0_0, tag_name: "v9.9.9", published_at: "2030-01-01T00:00:00Z" });

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

function requests(): { url: string; init: NextInit }[] {
  return (fetchMock.mock.calls as [string, NextInit][]).map(([url, init]) => ({ url, init }));
}

/** 원 배열이 한 요청 상한(100칸)을 채운 페이지 — `from`부터 패치 번호를 매겨 페이지마다 태그가 겹치지 않게 한다. */
const fullPage = (from: number) =>
  Array.from({ length: 100 }, (_, i) => ({
    ...V1_0_0,
    tag_name: `v1.0.${from + i}`,
    published_at: new Date(Date.UTC(2026, 8, 27) + (from + i) * 60_000).toISOString(),
  }));

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("loadReleases — 요청 모양", () => {
  it("100칸 미만이면 첫 페이지에서 멈추고 성공만 1시간 재검증한다", async () => {
    fetchMock.mockResolvedValueOnce(json([V1_0_1]));
    await loadReleases();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastRequest().url).toBe(`${GITHUB_RELEASES_API_URL}?per_page=100&page=1`);
    expect(lastRequest().init.next).toEqual({ revalidate: 3600 });
  });

  /**
   * **배포마다 캐시 키가 바뀐다** (2026-09-30 사용자 — 머지 직후 `/changelog`가 최대 1시간 옛 목록이었다). 데이터 캐시는 배포를 넘어 남고,
   * 키는 URL이다 — 빌드가 박은 앱 버전을 쿼리로 실으면 새 배포의 첫 요청이 새로 가져온다. GitHub는 모르는 쿼리를 무시한다.
   */
  it("앱 버전을 쿼리로 실어 배포마다 캐시 키가 바뀐다 — 버전이 없으면 싣지 않는다", async () => {
    vi.stubEnv("APP_VERSION", "1.1.5");
    fetchMock.mockResolvedValueOnce(json([V1_0_1]));
    await loadReleases();
    expect(lastRequest().url).toBe(`${GITHUB_RELEASES_API_URL}?per_page=100&page=1&deploy=1.1.5`);
    vi.stubEnv("APP_VERSION", "");
    fetchMock.mockResolvedValueOnce(json([V1_0_1]));
    await loadReleases();
    expect(lastRequest().url).toBe(`${GITHUB_RELEASES_API_URL}?per_page=100&page=1`);
    vi.unstubAllEnvs();
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

describe("loadReleases — 페이지 따라 읽기", () => {
  it("100칸이면 page=2를 부르고 100칸 미만에서 멈춘다", async () => {
    fetchMock.mockResolvedValueOnce(json(fullPage(0))).mockResolvedValueOnce(json([{ ...V1_0_1, tag_name: "v2.0.0" }]));
    const result = await loadReleases();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requests()[1]?.url).toContain("page=2");
    expect(result.ok && result.truncated).toBe(false);
    expect(result.ok && result.releases).toHaveLength(101);
  });

  it("2페이지가 []이면 실패가 아니다 — 원 배열이 정확히 100건이었다", async () => {
    fetchMock.mockResolvedValueOnce(json(fullPage(0))).mockResolvedValueOnce(json([]));
    const result = await loadReleases();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.ok && result.truncated).toBe(false);
    expect(result.ok && result.releases).toHaveLength(100);
    expect(warns).toEqual([]);
  });

  it("모든 요청 URL에 per_page=100 · page=N · deploy=가 있다", async () => {
    vi.stubEnv("APP_VERSION", "1.1.5");
    fetchMock
      .mockResolvedValueOnce(json(fullPage(0)))
      .mockResolvedValueOnce(json(fullPage(100)))
      .mockResolvedValueOnce(json([V1_0_1]));
    await loadReleases();
    expect(requests().map((r) => r.url)).toEqual([1, 2, 3].map((n) => `${GITHUB_RELEASES_API_URL}?per_page=100&page=${n}&deploy=1.1.5`));
    vi.unstubAllEnvs();
  });

  it("타임아웃은 전체에 하나다 — 한 번만 만들고 모든 요청이 그 signal을 쓴다", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    fetchMock.mockResolvedValueOnce(json(fullPage(0))).mockResolvedValueOnce(json(fullPage(100))).mockResolvedValueOnce(json([]));
    await loadReleases();
    expect(timeout).toHaveBeenCalledTimes(1);
    expect(timeout).toHaveBeenCalledWith(3000);
    expect(requests()).toHaveLength(3);
    for (const r of requests()) expect(r.init.signal).toBe(timeout.mock.results[0]?.value);
  });

  it("모든 페이지 요청에 같은 헤더를 싣고 Authorization은 없다", async () => {
    fetchMock.mockResolvedValueOnce(json(fullPage(0))).mockResolvedValueOnce(json([]));
    await loadReleases();
    for (const r of requests()) {
      const headers = new Headers(r.init.headers);
      expect(headers.get("accept")).toBe("application/vnd.github+json");
      expect(headers.get("x-github-api-version")).toBe("2022-11-28");
      expect(headers.has("authorization")).toBe(false);
      expect(r.init.next).toEqual({ revalidate: 3600 });
    }
  });

  it("페이지 상한(3)에 닿고 마지막이 100칸이면 truncated다 — 요청은 3번이다", async () => {
    fetchMock
      .mockResolvedValueOnce(json(fullPage(0)))
      .mockResolvedValueOnce(json(fullPage(100)))
      .mockResolvedValueOnce(json(fullPage(200)));
    const result = await loadReleases();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.ok && result.truncated).toBe(true);
    expect(result.ok && result.releases).toHaveLength(300);
  });

  it("같은 100건이 매 페이지 반복돼도 3번에서 멈추고 결과는 한 벌이다", async () => {
    fetchMock.mockImplementation(async () => json(fullPage(0)));
    const result = await loadReleases();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.ok && result.truncated).toBe(true);
    expect(result.ok && result.releases).toHaveLength(100);
  });

  it("합친 목록은 페이지 경계를 넘어 한 번에 정렬된다", async () => {
    // GitHub 응답은 생성 순이라 뒤 페이지에 더 최신 published_at이 올 수 있다.
    fetchMock.mockResolvedValueOnce(json(fullPage(0))).mockResolvedValueOnce(json([V1_0_2()]));
    const result = await loadReleases();
    expect(result.ok && result.releases[0]?.tag).toBe("v9.9.9");
  });
});

describe("loadReleases — 둘째 페이지부터의 부분 실패", () => {
  it.each([
    ["403 한도", () => json({ message: "API rate limit exceeded for 1.2.3.4" }, 403, { "x-ratelimit-remaining": "0" }), "403"],
    ["502", () => json({ message: "Bad Gateway" }, 502), "502"],
    ["형 오류", () => json({ message: "not an array" }), "200"],
    ["JSON이 아님", () => new Response("<html>oops</html>", { status: 200 }), "200"],
  ])("2페이지 %s → 1페이지 목록 + truncated, warn 한 줄(페이지 번호·상태·남은 한도뿐)", async (_, response, status) => {
    fetchMock.mockResolvedValueOnce(json(fullPage(0))).mockResolvedValueOnce(response());
    const result = await loadReleases();
    expect(result.ok && result.releases).toHaveLength(100);
    expect(result.ok && result.truncated).toBe(true);
    expect(warns).toHaveLength(1);
    const text = JSON.stringify(warns[0]);
    expect(text).toContain(status);
    expect(text).toContain('"page":2');
    expect(text).not.toContain("rate limit exceeded");
    expect(text).not.toContain("1.2.3.4");
  });

  it.each([
    ["네트워크 오류", new TypeError("getaddrinfo ENOTFOUND api.github.com secret-detail")],
    ["타임아웃", new DOMException("The operation was aborted due to timeout", "TimeoutError")],
  ])("2페이지 %s → 1페이지 목록 + truncated, 던지지 않는다", async (_, error) => {
    fetchMock.mockResolvedValueOnce(json(fullPage(0))).mockRejectedValueOnce(error);
    const result = await loadReleases();
    expect(result.ok && result.releases).toHaveLength(100);
    expect(result.ok && result.truncated).toBe(true);
    expect(warns).toHaveLength(1);
    expect(JSON.stringify(warns[0])).toContain('"page":2');
    expect(JSON.stringify(warns[0])).not.toContain("secret-detail");
  });

  it("3페이지 실패는 앞 두 페이지를 합친 목록이다", async () => {
    fetchMock
      .mockResolvedValueOnce(json(fullPage(0)))
      .mockResolvedValueOnce(json(fullPage(100)))
      .mockResolvedValueOnce(json({ message: "Bad Gateway" }, 502));
    const result = await loadReleases();
    expect(result.ok && result.releases).toHaveLength(200);
    expect(result.ok && result.truncated).toBe(true);
    expect(JSON.stringify(warns[0])).toContain('"page":3');
  });

  it("1페이지 실패는 { ok: false }다 — 뒤 페이지를 부르지 않는다", async () => {
    fetchMock.mockResolvedValueOnce(json({ message: "Bad Gateway" }, 502));
    await expect(loadReleases()).resolves.toEqual({ ok: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
