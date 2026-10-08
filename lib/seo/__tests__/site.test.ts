import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

import { en } from "@/messages/en";

import { OG_IMAGE, pageMetadata, SITE_ORIGIN } from "../site";

/**
 * **공개 페이지의 머리** (seo-geo T2). ⚠️ Next metadata 병합이 **얕다** — 자식이 `openGraph`를 주면 부모 것이 통째로 갈리므로
 * 이 함수가 매번 완전한 객체를 내야 한다. 빠진 필드는 그 페이지에서 조용히 사라진다.
 */
describe("pageMetadata", () => {
  const meta = pageMetadata({ title: "Create a project", description: "Connect a repository.", path: "/docs/setup/create-project" });
  const url = "https://mal-moi.com/docs/setup/create-project";

  it("SITE_ORIGIN은 프로덕션 하나다", () => {
    expect(SITE_ORIGIN).toBe("https://mal-moi.com");
  });

  it("canonical·openGraph·twitter가 전부 선다 — 얕은 병합 회귀", () => {
    expect(meta.title).toBe("Create a project");
    expect(meta.description).toBe("Connect a repository.");
    expect(meta.alternates).toEqual({ canonical: url });
    expect(meta.openGraph).toEqual({
      title: "Create a project",
      description: "Connect a repository.",
      url,
      siteName: en.common.appName,
      locale: "en_US",
      type: "website",
      images: [OG_IMAGE],
    });
    expect(meta.twitter).toEqual({
      card: "summary_large_image",
      title: "Create a project",
      description: "Connect a repository.",
      images: [{ url: OG_IMAGE.url, alt: OG_IMAGE.alt }],
    });
  });

  it("og:title에 브랜드를 붙이지 않는다 — `og:site_name`이 든다", () => {
    const og = meta.openGraph as { title: string };
    expect(og.title).not.toContain("Malmoi");
  });

  it("홈은 끝 `/`까지 절대 URL이다", () => {
    expect(pageMetadata({ title: "x", description: "y", path: "/" }).alternates).toEqual({ canonical: "https://mal-moi.com/" });
  });

  it("공개 페이지에 noindex가 없다", () => {
    expect(meta.robots).toBeUndefined();
  });
});

describe("OG_IMAGE", () => {
  it("정적 1장 `/og.png` 1200×630 — 대체 텍스트는 사전에서", () => {
    expect(OG_IMAGE).toEqual({ url: "/og.png", width: 1200, height: 630, alt: en.seo.ogImageAlt });
  });

  /** ⚠️ **선언만 맞고 파일이 없으면 og:image가 404다** — 실제 PNG의 IHDR 치수를 선언과 견준다. */
  it("public/og.png가 있고 IHDR 치수가 선언과 같다", () => {
    const png = readFileSync(join(process.cwd(), "public", OG_IMAGE.url));
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(png.subarray(12, 16).toString("ascii")).toBe("IHDR");
    expect({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }).toEqual({ width: OG_IMAGE.width, height: OG_IMAGE.height });
  });

  it("public/og.png는 300KB 미만이며 기준 픽셀과 바이트 단위로 같다", async () => {
    const path = join(process.cwd(), "public", OG_IMAGE.url);
    expect(readFileSync(path).byteLength).toBeLessThan(300_000);
    const pixels = await sharp(path).raw().toBuffer();
    expect(createHash("sha256").update(pixels).digest("hex")).toBe("521d794edb8aef77d3f9b38b29b31d3e4d39d1382e7f4b073160362e4ca15892");
  });
});

describe("m.seo", () => {
  it("홈 제목은 브랜드를 스스로 담는다(absolute) · 로그인 제목은 템플릿과 브랜드가 두 번 서지 않는다", () => {
    expect(en.seo.homeTitle).toContain("Malmoi");
    expect(en.seo.signInTitle).not.toContain("Malmoi");
  });
});
