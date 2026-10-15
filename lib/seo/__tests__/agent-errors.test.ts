import { describe, expect, it } from "vitest";

import type { DeploymentMode } from "@/lib/deployment/mode";
import { routes } from "@/lib/routes";
import { en } from "@/messages/en";

import { apiNotFoundBody, markdownNotFound } from "../agent-errors";
import { SITE_ORIGIN } from "../site";

/**
 * **에이전트가 읽는 404 본문** (agent-readiness design §2.4). hosted는 `SITE_ORIGIN` 절대 링크 셋, self-hosted·무효는 hosted를
 * 가리키지 않는 상대 링크 둘이다 — 설치가 hosted 산출물(`llms.txt`)을 자기 것인 양 내지 않는다(`public-response.ts`와 같은 방향).
 */

const HOSTED: DeploymentMode = { kind: "hosted", vercelEnv: "production" };
const SELF: DeploymentMode = { kind: "self-hosted", origin: "https://malmoi.example.com", host: "malmoi.example.com" };
const INVALID: DeploymentMode = { kind: "invalid", reason: "vercel-env-present" };

const links = (md: string) => [...md.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]);

describe("markdownNotFound", () => {
  it("hosted는 docs·llms.txt·openapi.json 절대 링크 셋이다", () => {
    expect(links(markdownNotFound(HOSTED))).toEqual([
      `${SITE_ORIGIN}${routes.docs()}`,
      `${SITE_ORIGIN}/llms.txt`,
      `${SITE_ORIGIN}/openapi.json`,
    ]);
  });

  it.each([SELF, INVALID])("self-hosted·무효는 상대 링크 둘이고 llms.txt·hosted origin이 없다 (%o)", (mode) => {
    const md = markdownNotFound(mode);
    expect(links(md)).toEqual([routes.docs(), "/openapi.json"]);
    expect(md).not.toContain("llms.txt");
    expect(md).not.toContain(SITE_ORIGIN);
  });

  it.each([HOSTED, SELF, INVALID])("제목은 하나이고 notFound.title이며 본문은 20자 이상이다 (%o)", (mode) => {
    const md = markdownNotFound(mode);
    const headings = md.split("\n").filter((line) => line.startsWith("#"));
    expect(headings).toEqual([`# ${en.notFound.title}`]);
    expect(md.replace(/^#.*$/m, "").trim().length).toBeGreaterThanOrEqual(20);
    expect(md).toContain(en.seo.agentNotFound.body);
    expect(md).toContain(`[${en.publicDocs.docs.title}](`);
    expect(md.endsWith("\n")).toBe(true);
  });
});

describe("apiNotFoundBody", () => {
  it("정확히 error·message·openapi 세 키다", () => {
    expect(apiNotFoundBody()).toEqual({ error: "not-found", message: en.seo.apiNotFound, openapi: "/openapi.json" });
  });
});
