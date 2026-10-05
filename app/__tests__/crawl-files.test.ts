import { afterEach, describe, expect, it, vi } from "vitest";

import { loadSummary } from "@/lib/guide/load";
import { flattenNav } from "@/lib/guide/summary";

/**
 * **크롤러용 파일 넷의 배선** (seo-geo T8·T9). 판정은 `lib/seo/__tests__/`가 들고, 여기는 라우트가 그 판정을 부르는지와
 * **렌더 방식**(robots는 요청 시점, 나머지는 빌드 prerender)을 본다.
 */
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("`/robots.txt` — 요청 시점 판정", () => {
  it("`force-dynamic`이다 — 빌드 시점 값이면 Promote가 preview 산출물을 올릴 때 프로덕션이 `Disallow: /`로 굳는다", async () => {
    const mod = await import("@/app/robots");
    expect(mod.dynamic).toBe("force-dynamic");
  });

  it("같은 모듈이 호출마다 `VERCEL_ENV`를 다시 읽는다", async () => {
    const { default: robots } = await import("@/app/robots");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(robots().sitemap).toBe("https://mal-moi.com/sitemap.xml");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(robots()).toEqual({ rules: [{ userAgent: "*", disallow: "/" }] });
    vi.stubEnv("VERCEL_ENV", "");
    expect(robots().sitemap).toBeUndefined();
  });
});

describe("`/sitemap.xml`", () => {
  it("`force-static`이다 — `guide/`를 읽는데 트레이싱이 이 라우트에 싣지 않는다", async () => {
    const mod = await import("@/app/sitemap");
    expect(mod.dynamic).toBe("force-static");
  });

  it("SUMMARY 전부 + `/` + `/changelog` + `/privacy`", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    expect(sitemap()).toHaveLength(flattenNav(loadSummary("en")).length + 3);
  });
});

const LLMS = {
  "llms.txt": () => import("@/app/llms.txt/route"),
  "llms-full.txt": () => import("@/app/llms-full.txt/route"),
};

describe.each(Object.keys(LLMS) as (keyof typeof LLMS)[])("`/%s`", (name) => {
  it("`force-static` · 200 `text/plain; charset=utf-8`", async () => {
    const mod = await LLMS[name]();
    expect(mod.dynamic).toBe("force-static");
    const res = mod.GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    const body = await res.text();
    expect(body.startsWith("# ")).toBe(true);
    expect(body).toContain("https://mal-moi.com/docs/setup");
  });
});
