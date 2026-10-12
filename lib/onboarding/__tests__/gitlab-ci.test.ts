import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

import { SKIP_MARKER } from "@/lib/pull/payload";

import { GITLAB_CI_IMAGE, GITLAB_CI_RELEASE, renderProjectGitlabCiYaml } from "../gitlab-ci";
import { workflowApiUrl } from "../workflow";

/**
 * 복사용 `.gitlab-ci.yml` job (gitlab-repositories D1 — design §2 "적재와 Sync", D5). `renderProjectWorkflowYaml`의 짝이다.
 *
 * ⚠️ **`docs/ACTIONS.md`의 GitLab 예시가 정본이다** — `workflow.test.ts`와 같은 결로 `<!-- gitlab-ci -->` 뒤 첫 YAML 블록을
 * 주석·빈 줄을 뺀 채 줄 단위로 대조한다.
 */

const root = new URL("../../../", import.meta.url);
const actionsDoc = readFileSync(fileURLToPath(new URL("docs/ACTIONS.md", root)), "utf8");

type Job = {
  extends?: string;
  image?: string;
  rules?: { if: string }[];
  interruptible?: boolean;
  variables?: Record<string, string>;
  script?: string[];
};

const one = (over: Partial<Parameters<typeof renderProjectGitlabCiYaml>[0]> = {}) =>
  renderProjectGitlabCiYaml({
    slug: "order-check",
    baseBranch: "main",
    surfaces: [{ surfaceSlug: "default", pathTemplate: "i18n/{locale}.json", adapter: "json-catalog", baseLocale: "en" }],
    ...over,
  });

const jobs = (yml: string) => parse(yml) as Record<string, Job>;

function firstYamlBlock(md: string): string {
  const m = /```yaml\n([\s\S]*?)```/.exec(md);
  if (!m?.[1]) throw new Error("docs/ACTIONS.md에 yaml 블록이 없다");
  return m[1];
}

function bare(yaml: string): string[] {
  return yaml
    .split("\n")
    .map((line) => line.replace(/\s+#.*$/, "").replace(/^\s*#.*$/, "").trimEnd())
    .filter((line) => line.length > 0);
}

describe("문서 대조", () => {
  it("docs/ACTIONS.md의 GitLab 예시와 주석·빈 줄을 빼면 줄 단위로 같다", () => {
    const section = actionsDoc.split("<!-- gitlab-ci -->")[1];
    expect(section).toBeDefined();
    expect(bare(one())).toEqual(bare(firstYamlBlock(section!)));
  });
});

describe("renderProjectGitlabCiYaml — 모양", () => {
  it("숨은 기반 job 하나 + 표면마다 job 하나 — 이름에 프로젝트 slug가 든다(한 리포의 두 프로젝트가 서로를 덮지 않는다)", () => {
    const yml = renderProjectGitlabCiYaml({
      slug: "order-check",
      baseBranch: "main",
      surfaces: [
        { surfaceSlug: "default", pathTemplate: "i18n/{locale}.json" },
        { surfaceSlug: "web", pathTemplate: "web/{locale}.json" },
      ],
    });
    expect(Object.keys(jobs(yml))).toEqual([".malmoi-i18n-order-check", "malmoi-i18n-order-check-default", "malmoi-i18n-order-check-web"]);
    expect(jobs(yml)["malmoi-i18n-order-check-web"]).toEqual({
      extends: ".malmoi-i18n-order-check",
      variables: { MALMOI_I18N_SURFACE: "web", MALMOI_I18N_PATH_TEMPLATE: "web/{locale}.json" },
    });
  });

  it("표면이 0이면 던진다 — job 없는 파일은 조용히 아무것도 안 한다", () => {
    expect(() => one({ surfaces: [] })).toThrow();
  });

  it("rules가 push · base 브랜치 · 마커 셋을 한 조건으로 본다(루프 가드 첫 겹)", () => {
    const rules = jobs(one())[".malmoi-i18n-order-check"]?.rules;
    expect(rules).toHaveLength(1);
    const cond = rules?.[0]?.if ?? "";
    expect(cond).toContain('$CI_PIPELINE_SOURCE == "push"');
    expect(cond).toContain("$CI_COMMIT_BRANCH == $MALMOI_I18N_BASE_BRANCH");
    // 정규식 리터럴 안의 마커 — `[`·`]`는 이스케이프한다. 리터럴은 SKIP_MARKER에서 만든다.
    expect(cond).toContain(`$CI_COMMIT_MESSAGE !~ /${SKIP_MARKER.replace(/[[\]]/g, "\\$&")}/`);
  });

  it("base 브랜치는 변수로 비교한다 — 사용자가 고른 이름이 rules 식의 따옴표를 깨지 않는다", () => {
    const yml = one({ baseBranch: `release/"2.0"` });
    const base = jobs(yml)[".malmoi-i18n-order-check"];
    expect(base?.variables?.MALMOI_I18N_BASE_BRANCH).toBe(`release/"2.0"`);
    expect(base?.rules?.[0]?.if).not.toContain("release");
  });

  it("`$`는 `$$`로 적는다 — GitLab이 변수 값을 다시 전개하지 않게", () => {
    const yml = one({ baseBranch: "rel$HOME" });
    expect(jobs(yml)[".malmoi-i18n-order-check"]?.variables?.MALMOI_I18N_BASE_BRANCH).toBe("rel$$HOME");
  });

  it("이미지가 버전 태그 + digest로 고정돼 있다", () => {
    expect(GITLAB_CI_IMAGE).toMatch(/^node:24\.\d+\.\d+-bookworm@sha256:[0-9a-f]{64}$/);
    expect(jobs(one())[".malmoi-i18n-order-check"]?.image).toBe(GITLAB_CI_IMAGE);
  });

  it("interruptible이다 — 같은 브랜치의 새 파이프라인이 옛 실행을 끊는다(strict라 마지막 상태가 진실)", () => {
    expect(jobs(one())[".malmoi-i18n-order-check"]?.interruptible).toBe(true);
  });
});

describe("불변 태그 clone + SHA 대조 (D5)", () => {
  it("태그 축이 앱·GitHub action과 별개다", () => {
    expect(GITLAB_CI_RELEASE.tag).toMatch(/^malmoi-i18n-push-gitlab-v\d+$/);
  });

  it("SHA는 아직 비어 있거나 40자다 — 비어 있으면 생성 job이 대조에서 실패한다(fail-closed)", () => {
    const sha = GITLAB_CI_RELEASE.sha;
    expect(sha === null || /^[0-9a-f]{40}$/.test(sha)).toBe(true);
    const vars = jobs(one())[".malmoi-i18n-order-check"]?.variables;
    expect(vars?.MALMOI_I18N_PUSH_TAG).toBe(GITLAB_CI_RELEASE.tag);
    expect(vars?.MALMOI_I18N_PUSH_SHA).toBe(sha ?? "unreleased");
  });

  it("script가 태그로 shallow clone → HEAD SHA 대조 → push.sh 순서다 — 대조 전에 clone한 코드를 돌리지 않는다", () => {
    const script = jobs(one())[".malmoi-i18n-order-check"]?.script ?? [];
    const clone = script.findIndex((l) => l.includes("git clone"));
    const check = script.findIndex((l) => l.includes("rev-parse HEAD") && l.includes("$MALMOI_I18N_PUSH_SHA"));
    const run = script.findIndex((l) => l.includes(".gitlab/malmoi-i18n-push/push.sh"));
    expect(clone).toBeGreaterThanOrEqual(0);
    expect(check).toBeGreaterThan(clone);
    expect(run).toBeGreaterThan(check);
    expect(script[clone]).toContain('--depth 1 --branch "$MALMOI_I18N_PUSH_TAG"');
    expect(script[clone]).toContain("https://github.com/SinhyeokKang/malmoi.git");
    // 가변 참조로 받지 않는다 — include:remote·브랜치 ref·main 금지.
    expect(one()).not.toMatch(/include:|--branch\s+main\b|\/-\/raw\//);
  });

  it("PUSH_TOKEN을 job 변수로 적지 않는다 — protected·masked CI/CD 변수에서만 온다", () => {
    expect(one()).not.toMatch(/PUSH_TOKEN:/);
  });
});

describe("표면 변수", () => {
  it("확정한 어댑터·기준 언어를 넣고, 없으면 줄을 내지 않는다", () => {
    expect(jobs(one())["malmoi-i18n-order-check-default"]?.variables).toEqual({
      MALMOI_I18N_SURFACE: "default",
      MALMOI_I18N_PATH_TEMPLATE: "i18n/{locale}.json",
      MALMOI_I18N_ADAPTER: "json-catalog",
      MALMOI_I18N_BASE: "en",
    });
  });

  it("api-url은 주어질 때만 기반 job에 든다", () => {
    expect(jobs(one())[".malmoi-i18n-order-check"]?.variables).not.toHaveProperty("MALMOI_I18N_API_URL");
    expect(jobs(one({ apiUrl: "https://malmoi.example.com" }))[".malmoi-i18n-order-check"]?.variables?.MALMOI_I18N_API_URL).toBe("https://malmoi.example.com");
  });

  it("파일 끝 개행이 정확히 하나이고 같은 입력은 같은 문자열이다", () => {
    expect(one().endsWith("\n")).toBe(true);
    expect(one().endsWith("\n\n")).toBe(false);
    expect(one()).toBe(one());
  });
});

describe("셀프 호스팅 — api-url 항상", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("self-hosted면 origin 입력과 무관하게 설치 origin이 job에 박힌다(빠지면 push 토큰이 호스팅 서비스로 간다)", () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("MALMOI_ORIGIN", "https://malmoi.example.com");
    const apiUrl = workflowApiUrl(null);
    expect(apiUrl).toBe("https://malmoi.example.com");
    expect(jobs(one({ ...(apiUrl === undefined ? {} : { apiUrl }) }))[".malmoi-i18n-order-check"]?.variables?.MALMOI_I18N_API_URL).toBe("https://malmoi.example.com");
  });
});
