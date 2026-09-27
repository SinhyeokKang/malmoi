// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { redactAnalyticsEvent } from "@/lib/seo/analytics";

import { render } from "./helpers/dom";

/**
 * **Vercel Web Analytics 래퍼** (seo-geo T10). 레이아웃이 서버 컴포넌트라 `beforeSend`(함수)를 직접 못 넘긴다 — 이 래퍼가
 * 클라이언트 쪽에서 허용 목록을 묶는다.
 */
const seen = vi.hoisted(() => ({ props: [] as unknown[] }));
vi.mock("@vercel/analytics/next", () => ({
  Analytics: (props: unknown) => {
    seen.props.push(props);
    return null;
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  seen.props.length = 0;
});

describe("SiteAnalytics", () => {
  it("허용 목록(`redactAnalyticsEvent`)을 `beforeSend`로 건다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { SiteAnalytics } = await import("../analytics");
    await render(<SiteAnalytics />);
    expect(seen.props).toEqual([{ beforeSend: redactAnalyticsEvent }]);
  });

  // dev 모드의 패키지는 `va.vercel-scripts.com` 디버그 스크립트를 부르고 CSP `script-src 'self'`가 막는다 — CSP를 넓히지 않는다.
  it("개발 서버에서는 렌더하지 않는다", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { SiteAnalytics } = await import("../analytics");
    await render(<SiteAnalytics />);
    expect(seen.props).toEqual([]);
  });
});
