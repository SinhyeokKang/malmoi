import { describe, expect, it } from "vitest";

import type { DeploymentMode } from "@/lib/deployment/mode";

import { analyticsEnabled, consentLinkProps, pageResponse, privacyDestination } from "../public-response";

/**
 * **공개 응답 정책** (self-hosting design §7·§9). hosted는 무변경이고, self-hosted는 색인·집계에서 빠진다. 무효 모드는 self-hosted처럼
 * 숨긴다 — 설정이 틀린 설치가 hosted 산출물(sitemap·hosted 방침·Vercel 집계)을 자기 것인 양 내지 않는다.
 */

const HOSTED: DeploymentMode = { kind: "hosted", vercelEnv: "production" };
const HOSTED_LOCAL: DeploymentMode = { kind: "hosted", vercelEnv: undefined };
const SELF: DeploymentMode = { kind: "self-hosted", origin: "https://malmoi.example.com", host: "malmoi.example.com" };
const INVALID: DeploymentMode = { kind: "invalid", reason: "vercel-env-present" };

const CRAWL_FILES = ["/sitemap.xml", "/llms.txt", "/llms-full.txt"];
const PAGES = ["/", "/docs", "/privacy", "/signin", "/projects/web/keys", "/sitemap", "/llms.txt/x"];

describe("pageResponse", () => {
  it.each([HOSTED, HOSTED_LOCAL])("hosted는 아무것도 바꾸지 않는다 (%o)", (mode) => {
    for (const path of [...CRAWL_FILES, ...PAGES]) expect(pageResponse(mode, path), path).toEqual({ kind: "pass", noindex: false });
  });

  it.each([SELF, INVALID])("self-hosted·무효는 세 크롤 파일을 404로 낸다 (%o)", (mode) => {
    for (const path of CRAWL_FILES) expect(pageResponse(mode, path), path).toEqual({ kind: "not-found" });
  });

  // Next는 경로를 한 번 decode해 정적 파일을 찾는다 — `/%73itemap.xml`도 sitemap이다(Astra 교차 리뷰 🟡3, 선례 `isProtectedPath`).
  const ENCODED_CRAWL_FILES = ["/%73itemap.xml", "/llms%2etxt", "/llms-full%2Etxt", "/%6C%6C%6D%73.txt"];
  const MALFORMED = ["/%E0%A4%A", "/sitemap.xml%", "/%zz"];

  it.each([SELF, INVALID])("self-hosted·무효는 퍼센트 인코딩한 크롤 파일도 404로 낸다 (%o)", (mode) => {
    for (const path of ENCODED_CRAWL_FILES) expect(pageResponse(mode, path), path).toEqual({ kind: "not-found" });
  });

  it.each([SELF, INVALID])("self-hosted·무효는 decode할 수 없는 경로를 404로 낸다 — 무엇으로 풀릴지 모르면 숨긴다 (%o)", (mode) => {
    for (const path of MALFORMED) expect(pageResponse(mode, path), path).toEqual({ kind: "not-found" });
  });

  it.each([SELF, INVALID])("self-hosted·무효는 인코딩한 일반 페이지에 noindex만 붙인다 (%o)", (mode) => {
    for (const path of ["/%70rivacy", "/docs%2Fx", "/%2573itemap.xml"]) expect(pageResponse(mode, path), path).toEqual({ kind: "pass", noindex: true });
  });

  it.each([HOSTED, HOSTED_LOCAL])("hosted는 인코딩·잘못된 인코딩도 바꾸지 않는다 (%o)", (mode) => {
    for (const path of [...ENCODED_CRAWL_FILES, ...MALFORMED]) expect(pageResponse(mode, path), path).toEqual({ kind: "pass", noindex: false });
  });

  it.each([SELF, INVALID])("self-hosted·무효는 그 밖의 페이지에 noindex를 붙인다 (%o)", (mode) => {
    for (const path of PAGES) expect(pageResponse(mode, path), path).toEqual({ kind: "pass", noindex: true });
  });
});

describe("analyticsEnabled", () => {
  it("hosted만 집계한다", () => {
    expect(analyticsEnabled(HOSTED)).toBe(true);
    expect(analyticsEnabled(HOSTED_LOCAL)).toBe(true);
    expect(analyticsEnabled(SELF)).toBe(false);
    expect(analyticsEnabled(INVALID)).toBe(false);
  });
});

describe("privacyDestination", () => {
  it("hosted는 언어별 본문을 그린다 — 운영자 URL이 있어도 보지 않는다", () => {
    expect(privacyDestination(HOSTED, undefined)).toEqual({ kind: "render" });
    expect(privacyDestination(HOSTED, "https://example.com/privacy")).toEqual({ kind: "render" });
  });

  it("self-hosted는 운영자 정책으로 보낸다", () => {
    expect(privacyDestination(SELF, "https://example.com/privacy")).toEqual({ kind: "redirect", url: "https://example.com/privacy" });
  });

  it("self-hosted인데 URL이 없거나 모드가 무효면 hosted 방침을 그리지 않는다", () => {
    expect(privacyDestination(SELF, undefined)).toEqual({ kind: "unavailable" });
    expect(privacyDestination(INVALID, "https://example.com/privacy")).toEqual({ kind: "unavailable" });
  });
});

describe("consentLinkProps", () => {
  it("hosted는 같은 탭이다 — 속성을 더하지 않는다", () => {
    expect(consentLinkProps(HOSTED)).toEqual({});
  });

  it.each([SELF, INVALID])("self-hosted·무효는 새 탭 + noopener noreferrer (%o)", (mode) => {
    expect(consentLinkProps(mode)).toEqual({ target: "_blank", rel: "noopener noreferrer" });
  });
});
